import type { RankedChunk } from "../retrieval/search.js";

const SYSTEM_PROMPT = `Codebase assistant. Use ONLY the snippets below. Be clear and concise but finish your answer.
Cite file:line when useful. If context is insufficient, say what's missing.`;

function truncateSnippet(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n// ... truncated`;
}

export function buildMessages(
  question: string,
  ranked: RankedChunk[],
  maxContextChars: number,
  maxSnippetChars: number,
): { system: string; user: string } {
  const parts: string[] = [];
  let used = 0;

  for (let i = 0; i < ranked.length; i++) {
    const { chunk, score } = ranked[i];
    const header =
      `--- snippet ${i + 1} (score ${score.toFixed(3)}) ---\n` +
      `file: ${chunk.filePath}\n` +
      `symbol: ${chunk.symbolType} ${chunk.symbolName}\n` +
      `lines: ${chunk.startLine}-${chunk.endLine}\n\n`;
    const body = truncateSnippet(chunk.content.trim(), maxSnippetChars);
    const block = header + body + "\n";

    if (used + block.length > maxContextChars && parts.length > 0) break;
    parts.push(block);
    used += block.length;
  }

  const context =
    parts.length > 0
      ? parts.join("\n")
      : "(no context retrieved — index the repository first)";

  const user = `Question:\n${question}\n\nContext from indexed codebase:\n${context}`;

  return { system: SYSTEM_PROMPT, user };
}

export function formatSources(ranked: RankedChunk[]): string {
  return ranked
    .map(
      (r, i) =>
        `[${i + 1}] ${r.chunk.filePath}:${r.chunk.startLine}-${r.chunk.endLine} ` +
        `(${r.chunk.symbolType} ${r.chunk.symbolName}, score ${r.score.toFixed(3)})`,
    )
    .join("\n");
}
