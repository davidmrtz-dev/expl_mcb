import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import { runAskPipeline } from "./pipeline/ask.js";
import { logger } from "./utils/logger.js";

export interface AskBody {
  question: string;
  repoPath?: string;
  stream?: boolean;
}

export async function startServer(config: AppConfig): Promise<void> {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true }));

  app.post<{ Body: AskBody }>("/ask", async (request, reply) => {
    const { question, repoPath, stream = true } = request.body ?? {};

    if (!question?.trim()) {
      return reply.status(400).send({ error: "question is required" });
    }

    if (!stream) {
      const result = await runAskPipeline({ question, repoPath, config });
      return {
        answer: result.answer,
        sources: result.sources,
        repoPath: result.repoPath,
        chunksUsed: result.chunksUsed,
      };
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await runAskPipeline({
        question,
        repoPath,
        config,
        onSources: (sources) => send("sources", { sources }),
        onToken: (token) => send("token", { token }),
      });
      send("done", {
        repoPath: result.repoPath,
        chunksUsed: result.chunksUsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send("error", { message });
    } finally {
      reply.raw.end();
    }
  });

  await app.listen({ port: config.serverPort, host: "127.0.0.1" });
  logger.info("Server listening", { url: `http://127.0.0.1:${config.serverPort}` });
}
