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
  dbPath: string;
  embedBatchSize: number;
  maxChunkLines: number;
  minChunkLines: number;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ollamaHost: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
    embedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
    dbPath: process.env.EMCB_DB_PATH ?? path.resolve("data", "index.db"),
    embedBatchSize: 4,
    maxChunkLines: 120,
    minChunkLines: 8,
    ...overrides,
  };
}
