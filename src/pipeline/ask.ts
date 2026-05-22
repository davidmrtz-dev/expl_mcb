import path from "node:path";
import type { AppConfig } from "../config.js";
import { buildMessages, formatSources } from "../context/build.js";
import { embedText } from "../embeddings/ollama.js";
import { checkChatModel, streamChat } from "../llm/ollama-chat.js";
import { searchSimilar } from "../retrieval/search.js";
import { IndexStore } from "../storage/sqlite.js";
import { logger } from "../utils/logger.js";

export interface AskOptions {
  question: string;
  repoPath?: string;
  config: AppConfig;
  onToken?: (text: string) => void;
  onSources?: (sources: string) => void;
}

export interface AskResult {
  answer: string;
  sources: string;
  repoPath: string;
  chunksUsed: number;
}

function resolveRepo(store: IndexStore, repoPath?: string) {
  if (repoPath) {
    const resolved = path.resolve(repoPath);
    const repo = store.getRepoByPath(resolved);
    if (!repo) {
      throw new Error(
        `Repository not indexed: ${resolved}. Run: npm run index -- --repo ${resolved}`,
      );
    }
    return repo;
  }

  const latest = store.getLatestRepo();
  if (!latest) {
    throw new Error("No indexed repositories. Run: npm run index -- --repo <path>");
  }
  return latest;
}

export async function runAskPipeline(options: AskOptions): Promise<AskResult> {
  const { question, config, onToken, onSources } = options;
  const store = new IndexStore(config.dbPath);

  try {
    const repo = resolveRepo(store, options.repoPath);
    const corpus = store.loadChunksWithVectors(repo.id);

    if (corpus.length === 0) {
      throw new Error(`No embeddings for repo ${repo.path}. Re-run index.`);
    }

    logger.info("Retrieving context", { repo: repo.path, chunks: corpus.length });

    const queryVector = await embedText(question, {
      host: config.ollamaHost,
      model: config.embedModel,
    });

    const ranked = searchSimilar(queryVector, corpus, config.retrievalTopK);
    const sources = formatSources(ranked);
    onSources?.(sources);

    const { system, user } = buildMessages(
      question,
      ranked,
      config.maxContextChars,
      config.maxSnippetChars,
    );

    await checkChatModel({ host: config.ollamaHost, model: config.chatModel });

    logger.info("Streaming answer", {
      model: config.chatModel,
      contextChars: system.length + user.length,
      topK: config.retrievalTopK,
      maxTokens: config.chatNumPredict,
    });

    const answer = await streamChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        host: config.ollamaHost,
        model: config.chatModel,
        numPredict: config.chatNumPredict,
        numCtx: config.chatNumCtx,
        temperature: config.chatTemperature,
      },
      (token) => onToken?.(token),
    );

    return {
      answer,
      sources,
      repoPath: repo.path,
      chunksUsed: ranked.length,
    };
  } finally {
    store.close();
  }
}
