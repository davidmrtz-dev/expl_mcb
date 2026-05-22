import { logger } from "../utils/logger.js";

export interface EmbedOptions {
  host: string;
  model: string;
}

export async function checkOllama(options: EmbedOptions): Promise<void> {
  const url = `${options.host.replace(/\/$/, "")}/api/tags`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Ollama not reachable at ${options.host} (status ${res.status})`);
  }
  const body = (await res.json()) as { models?: { name: string }[] };
  const names = (body.models ?? []).map((m) => m.name);
  const hasModel = names.some((n) => n === options.model || n.startsWith(`${options.model}:`));
  if (!hasModel) {
    logger.warn("Embed model may not be installed", {
      model: options.model,
      installed: names.slice(0, 8),
      hint: `ollama pull ${options.model}`,
    });
  }
}

export async function embedText(text: string, options: EmbedOptions): Promise<number[]> {
  const url = `${options.host.replace(/\/$/, "")}/api/embeddings`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: options.model, prompt: text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama embed failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { embedding?: number[] };
  if (!data.embedding?.length) {
    throw new Error("Ollama returned empty embedding");
  }
  return data.embedding;
}

export async function embedBatch(
  texts: string[],
  options: EmbedOptions,
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(await embedText(text, options));
  }
  return vectors;
}
