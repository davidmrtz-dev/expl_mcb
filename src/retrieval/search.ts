import type { ChunkWithVector } from "../storage/sqlite.js";
import { cosineSimilarity } from "./cosine.js";

export interface RankedChunk {
  chunk: ChunkWithVector["chunk"];
  score: number;
}

export function searchSimilar(
  queryVector: number[],
  corpus: ChunkWithVector[],
  topK: number,
): RankedChunk[] {
  const scored = corpus.map((item) => ({
    chunk: item.chunk,
    score: cosineSimilarity(queryVector, item.vector),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Evita mandar el mismo chunk dos veces (p. ej. function + export del mismo nodo)
  const seen = new Set<number>();
  const unique: RankedChunk[] = [];
  for (const item of scored) {
    if (seen.has(item.chunk.id)) continue;
    seen.add(item.chunk.id);
    unique.push(item);
    if (unique.length >= topK) break;
  }
  return unique;
}
