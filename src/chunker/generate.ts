import type { AppConfig } from "../config.js";
import type { ParsedSymbol } from "../parser/treesitter.js";
import { contentHash } from "../utils/hash.js";

export interface Chunk {
  filePath: string;
  symbolName: string;
  symbolType: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
}

function sliceLines(source: string, startLine: number, endLine: number): string {
  const lines = source.split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

function fallbackLineChunks(
  filePath: string,
  source: string,
  maxLines: number,
): Chunk[] {
  const lines = source.split("\n");
  const chunks: Chunk[] = [];
  let start = 1;

  while (start <= lines.length) {
    const end = Math.min(start + maxLines - 1, lines.length);
    const content = lines.slice(start - 1, end).join("\n");
    if (content.trim()) {
      chunks.push({
        filePath,
        symbolName: `lines_${start}_${end}`,
        symbolType: "block",
        startLine: start,
        endLine: end,
        content,
        contentHash: contentHash(content),
      });
    }
    start = end + 1;
  }
  return chunks;
}

/**
 * Prefer AST symbols; merge tiny siblings; fall back to fixed-size line blocks.
 */
export function generateChunks(
  filePath: string,
  source: string,
  symbols: ParsedSymbol[],
  config: Pick<AppConfig, "maxChunkLines" | "minChunkLines">,
): Chunk[] {
  if (symbols.length === 0) {
    return fallbackLineChunks(filePath, source, config.maxChunkLines);
  }

  const sorted = [...symbols].sort((a, b) => a.startLine - b.startLine);
  const chunks: Chunk[] = [];

  for (const sym of sorted) {
    const lineCount = sym.endLine - sym.startLine + 1;
    if (lineCount < 2 && sym.symbolType !== "class") continue;

    let content = sliceLines(source, sym.startLine, sym.endLine).trim();
    if (!content) continue;

    // Large symbols: split into sub-blocks to keep embedding size reasonable
    if (lineCount > config.maxChunkLines) {
      const parts = fallbackLineChunks(filePath, content, config.maxChunkLines);
      for (const part of parts) {
        chunks.push({
          ...part,
          filePath,
          symbolName: `${sym.name}__${part.symbolName}`,
          symbolType: sym.symbolType,
          startLine: sym.startLine + part.startLine - 1,
          endLine: sym.startLine + part.endLine - 1,
        });
      }
      continue;
    }

    const header = `// ${filePath} :: ${sym.symbolType} ${sym.name}\n`;
    content = header + content;

    chunks.push({
      filePath,
      symbolName: sym.name,
      symbolType: sym.symbolType,
      startLine: sym.startLine,
      endLine: sym.endLine,
      content,
      contentHash: contentHash(content),
    });
  }

  if (chunks.length === 0) {
    return fallbackLineChunks(filePath, source, config.maxChunkLines);
  }

  return chunks;
}
