import { logger } from "../utils/logger.js";

export interface ChatOptions {
  host: string;
  model: string;
  numPredict?: number;
  numCtx?: number;
  temperature?: number;
}

export async function checkChatModel(options: ChatOptions): Promise<void> {
  const url = `${options.host.replace(/\/$/, "")}/api/tags`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Ollama not reachable at ${options.host}`);
  }
  const body = (await res.json()) as { models?: { name: string }[] };
  const names = (body.models ?? []).map((m) => m.name);
  const hasModel = names.some((n) => n === options.model || n.startsWith(`${options.model}:`));
  if (!hasModel) {
    logger.warn("Chat model may not be installed", {
      model: options.model,
      hint: `ollama pull ${options.model}`,
    });
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Streams tokens from Ollama /api/chat. Calls onToken for each content delta.
 */
export async function streamChat(
  messages: ChatMessage[],
  options: ChatOptions,
  onToken: (text: string) => void,
): Promise<string> {
  const url = `${options.host.replace(/\/$/, "")}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      messages,
      stream: true,
      options: {
        num_predict: options.numPredict,
        num_ctx: options.numCtx,
        temperature: options.temperature,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama chat failed (${res.status}): ${errText}`);
  }

  if (!res.body) {
    throw new Error("Ollama chat response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const data = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
        };
        const piece = data.message?.content ?? "";
        if (piece) {
          full += piece;
          onToken(piece);
        }
      } catch {
        // ignore partial JSON lines
      }
    }
  }

  return full;
}
