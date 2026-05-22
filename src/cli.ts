#!/usr/bin/env node
import path from "node:path";
import { loadConfig } from "./config.js";
import { runIndexPipeline } from "./pipeline/index.js";
import { logger } from "./utils/logger.js";

function printHelp(): void {
  console.log(`
Explain My Codebase Agent (EMCB) — CLI

Usage:
  npm run index -- --repo <path> [--db <sqlite-path>]

Options:
  --repo, -r     Absolute or relative path to the codebase to index
  --db           SQLite database path (default: ./data/index.db)
  --help, -h     Show this help

Environment:
  OLLAMA_HOST           Default: http://127.0.0.1:11434
  OLLAMA_EMBED_MODEL    Default: nomic-embed-text
  EMCB_DB_PATH          Same as --db

Example:
  ollama pull nomic-embed-text
  npm run index -- --repo ../my-app
`);
}

function parseArgs(argv: string[]): { command: string; repo?: string; db?: string } {
  const args = argv.slice(2);
  const command = args[0] ?? "help";

  let repo: string | undefined;
  let db: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--repo" || a === "-r") repo = args[++i];
    else if (a === "--db") db = args[++i];
    else if (!a.startsWith("-") && !repo) repo = a;
  }

  return { command, repo, db };
}

async function main(): Promise<void> {
  const { command, repo, db } = parseArgs(process.argv);

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command !== "index") {
    logger.error("Unknown command", { command });
    printHelp();
    process.exit(1);
  }

  if (!repo) {
    logger.error("Missing --repo <path>");
    printHelp();
    process.exit(1);
  }

  const config = loadConfig(db ? { dbPath: path.resolve(db) } : {});

  try {
    const result = await runIndexPipeline({ repoPath: repo, config });
    console.log("\n✓ Indexación completada");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    logger.error("Index failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

main();
