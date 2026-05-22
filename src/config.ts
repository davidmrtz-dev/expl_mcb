import path from "node:path";

export const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".next",
  "coverage",
  ".turbo",
  "out",
  ".cache",
]);

export const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export interface AppConfig {
  ollamaHost: string;
  embedModel: string;
  chatModel: string;
  dbPath: string;
  embedBatchSize: number;
  maxChunkLines: number;
  minChunkLines: number;
  retrievalTopK: number;
  maxContextChars: number;
  maxSnippetChars: number;
  chatNumPredict: number;
  chatNumCtx: number;
  chatTemperature: number;
  serverPort: number;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ollamaHost: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
    embedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
    chatModel: process.env.OLLAMA_CHAT_MODEL ?? "qwen2.5-coder:7b",
    dbPath: process.env.EMCB_DB_PATH ?? path.resolve("data", "index.db"),
    embedBatchSize: 4,
    maxChunkLines: 120,
    minChunkLines: 8,
    // Ask: menos contexto = menos tokens que procesa el LLM (~principal cuello de botella)
    retrievalTopK: Number(process.env.EMCB_TOP_K ?? 4),
    maxContextChars: Number(process.env.EMCB_MAX_CONTEXT_CHARS ?? 6_000),
    maxSnippetChars: Number(process.env.EMCB_MAX_SNIPPET_CHARS ?? 1_800),
    chatNumPredict: Number(process.env.EMCB_CHAT_MAX_TOKENS ?? 768),
    chatNumCtx: Number(process.env.EMCB_CHAT_NUM_CTX ?? 4_096),
    chatTemperature: Number(process.env.EMCB_CHAT_TEMPERATURE ?? 0.2),
    serverPort: Number(process.env.EMCB_PORT ?? 3040),
    ...overrides,
  };
}
