import path from "node:path";
import type { AppConfig } from "../config.js";
import { generateChunks } from "../chunker/generate.js";
import { checkOllama, embedBatch } from "../embeddings/ollama.js";
import { extensionFromPath, parseFile } from "../parser/treesitter.js";
import { scanRepository } from "../scanner/walk.js";
import { IndexStore } from "../storage/sqlite.js";
import { logger } from "../utils/logger.js";

export interface IndexPipelineOptions {
  repoPath: string;
  config: AppConfig;
}

export interface IndexPipelineResult {
  repoId: number;
  filesScanned: number;
  chunksStored: number;
  embeddingsStored: number;
  durationMs: number;
}

export async function runIndexPipeline(
  options: IndexPipelineOptions,
): Promise<IndexPipelineResult> {
  const started = Date.now();
  const repoPath = path.resolve(options.repoPath);
  const { config } = options;

  await checkOllama({ host: config.ollamaHost, model: config.embedModel });

  const store = new IndexStore(config.dbPath);
  const repo = store.upsertRepo(repoPath);

  const files = await scanRepository({ root: repoPath });
  let chunksStored = 0;
  let embeddingsStored = 0;

  const pending: { chunkId: number; content: string }[] = [];

  const flushEmbeddings = async () => {
    if (pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    const texts = batch.map((b) => b.content);
    logger.info("Embedding batch", { size: texts.length });
    const vectors = await embedBatch(texts, {
      host: config.ollamaHost,
      model: config.embedModel,
    });
    for (let i = 0; i < batch.length; i++) {
      store.insertEmbedding(batch[i].chunkId, config.embedModel, vectors[i]);
      embeddingsStored++;
    }
  };

  for (const file of files) {
    const ext = extensionFromPath(file.absolutePath);
    const parsed = await parseFile(file.absolutePath, ext);
    if (!parsed) continue;

    const chunks = generateChunks(file.relativePath, parsed.source, parsed.symbols, config);
    logger.debug("File chunked", {
      file: file.relativePath,
      symbols: parsed.symbols.length,
      chunks: chunks.length,
    });

    for (const chunk of chunks) {
      const chunkId = store.insertChunk(repo.id, chunk);
      chunksStored++;
      pending.push({ chunkId, content: chunk.content });

      if (pending.length >= config.embedBatchSize) {
        await flushEmbeddings();
      }
    }
  }

  await flushEmbeddings();
  const stats = store.stats(repo.id);
  store.close();

  const durationMs = Date.now() - started;
  logger.info("Index pipeline finished", {
    repoPath,
    filesScanned: files.length,
    chunksStored,
    embeddingsStored,
    dbChunks: stats.chunks,
    dbEmbeddings: stats.embeddings,
    durationMs,
  });

  return {
    repoId: repo.id,
    filesScanned: files.length,
    chunksStored,
    embeddingsStored,
    durationMs,
  };
}
