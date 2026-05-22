#!/usr/bin/env node
import path from "node:path";
import { loadConfig } from "./config.js";
import { runAskPipeline } from "./pipeline/ask.js";
import { runIndexPipeline } from "./pipeline/index.js";
import { startServer } from "./server.js";
import { logger } from "./utils/logger.js";

function printHelp(): void {
  console.log(`
Explain My Codebase Agent (EMCB) — CLI

Commands:
  index   Index a repository (Fase 1)
  ask     Ask a question with RAG (Fase 2)
  serve   Start HTTP server with POST /ask (Fase 2)

Index:
  npm run index -- --repo <path> [--db <sqlite-path>]

Ask:
  npm run ask -- "¿Dónde se usa Ollama?"
  npm run ask -- --repo . "¿Cómo fluye el pipeline de indexación?"

Serve:
  npm run serve
  curl -N -X POST http://127.0.0.1:3040/ask \\
    -H 'Content-Type: application/json' \\
    -d '{"question":"¿Qué hace el chunker?"}'

Environment:
  OLLAMA_HOST              Default: http://127.0.0.1:11434
  OLLAMA_EMBED_MODEL       Default: nomic-embed-text
  OLLAMA_CHAT_MODEL        Default: qwen2.5-coder:7b
  EMCB_DB_PATH             Default: ./data/index.db
  EMCB_PORT                Default: 3040
  EMCB_TOP_K               Default: 6

Setup:
  ollama pull nomic-embed-text
  ollama pull qwen2.5-coder:7b
`);
}

interface ParsedArgs {
  command: string;
  repo?: string;
  db?: string;
  question?: string;
  noStream?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const command = args[0] ?? "help";

  let repo: string | undefined;
  let db: string | undefined;
  let question: string | undefined;
  let noStream = false;

  const positional: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--repo" || a === "-r") repo = args[++i];
    else if (a === "--db") db = args[++i];
    else if (a === "--no-stream") noStream = true;
    else if (!a.startsWith("-")) positional.push(a);
  }

  if (command === "ask") {
    question = positional.join(" ").trim() || undefined;
  } else if (command === "index" && positional[0] && !repo) {
    repo = positional[0];
  }

  return { command, repo, db, question, noStream };
}

async function runAsk(parsed: ParsedArgs, config: ReturnType<typeof loadConfig>): Promise<void> {
  if (!parsed.question) {
    logger.error('Missing question. Example: npm run ask -- "¿Dónde está el chunker?"');
    process.exit(1);
  }

  console.log("\n--- Sources ---\n");

  const result = await runAskPipeline({
    question: parsed.question,
    repoPath: parsed.repo ? path.resolve(parsed.repo) : undefined,
    config,
    onSources: (sources) => {
      console.log(sources);
      console.log("\n--- Answer ---\n");
    },
    onToken: parsed.noStream ? undefined : (t) => process.stdout.write(t),
  });

  if (parsed.noStream) {
    console.log(result.answer);
  } else {
    console.log("\n");
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
    printHelp();
    return;
  }

  const config = loadConfig(parsed.db ? { dbPath: path.resolve(parsed.db) } : {});

  try {
    if (parsed.command === "index") {
      if (!parsed.repo) {
        logger.error("Missing --repo <path>");
        printHelp();
        process.exit(1);
      }
      const result = await runIndexPipeline({ repoPath: parsed.repo, config });
      console.log("\n✓ Indexación completada");
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (parsed.command === "ask") {
      await runAsk(parsed, config);
      return;
    }

    if (parsed.command === "serve") {
      await startServer(config);
      return;
    }

    logger.error("Unknown command", { command: parsed.command });
    printHelp();
    process.exit(1);
  } catch (err) {
    logger.error("Command failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

main();
