import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Chunk } from "../chunker/generate.js";
import { logger } from "../utils/logger.js";

export interface RepoRecord {
  id: number;
  path: string;
  indexedAt: string;
}

export interface StoredChunk {
  id: number;
  filePath: string;
  symbolName: string;
  symbolType: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface ChunkWithVector {
  chunk: StoredChunk;
  vector: number[];
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  indexed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  symbol_type TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE,
  UNIQUE (repo_id, file_path, content_hash)
);

CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id INTEGER PRIMARY KEY,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_repo ON chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(repo_id, file_path);
`;

export class IndexStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    logger.info("SQLite ready", { dbPath });
  }

  upsertRepo(repoPath: string): RepoRecord {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare("SELECT id, path, indexed_at FROM repos WHERE path = ?")
      .get(repoPath) as { id: number; path: string; indexed_at: string } | undefined;

    if (existing) {
      this.db.prepare("UPDATE repos SET indexed_at = ? WHERE id = ?").run(now, existing.id);
      this.clearRepoChunks(existing.id);
      return { id: existing.id, path: existing.path, indexedAt: now };
    }

    const result = this.db
      .prepare("INSERT INTO repos (path, indexed_at) VALUES (?, ?)")
      .run(repoPath, now);
    return { id: Number(result.lastInsertRowid), path: repoPath, indexedAt: now };
  }

  private clearRepoChunks(repoId: number): void {
    this.db.prepare("DELETE FROM embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE repo_id = ?)").run(repoId);
    this.db.prepare("DELETE FROM chunks WHERE repo_id = ?").run(repoId);
  }

  insertChunk(repoId: number, chunk: Chunk): number {
    const stmt = this.db.prepare(`
      INSERT INTO chunks (repo_id, file_path, symbol_name, symbol_type, start_line, end_line, content, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id, file_path, content_hash) DO UPDATE SET
        symbol_name = excluded.symbol_name,
        symbol_type = excluded.symbol_type,
        start_line = excluded.start_line,
        end_line = excluded.end_line,
        content = excluded.content
      RETURNING id
    `);
    const row = stmt.get(
      repoId,
      chunk.filePath,
      chunk.symbolName,
      chunk.symbolType,
      chunk.startLine,
      chunk.endLine,
      chunk.content,
      chunk.contentHash,
    ) as { id: number };
    return row.id;
  }

  insertEmbedding(chunkId: number, model: string, vector: number[]): void {
    this.db
      .prepare(`
        INSERT INTO embeddings (chunk_id, model, dimensions, vector_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(chunk_id) DO UPDATE SET
          model = excluded.model,
          dimensions = excluded.dimensions,
          vector_json = excluded.vector_json
      `)
      .run(chunkId, model, vector.length, JSON.stringify(vector));
  }

  getRepoByPath(repoPath: string): RepoRecord | null {
    const row = this.db
      .prepare("SELECT id, path, indexed_at FROM repos WHERE path = ?")
      .get(path.resolve(repoPath)) as { id: number; path: string; indexed_at: string } | undefined;
    if (!row) return null;
    return { id: row.id, path: row.path, indexedAt: row.indexed_at };
  }

  /** Most recently indexed repo (for ask when --repo omitted). */
  getLatestRepo(): RepoRecord | null {
    const row = this.db
      .prepare("SELECT id, path, indexed_at FROM repos ORDER BY indexed_at DESC LIMIT 1")
      .get() as { id: number; path: string; indexed_at: string } | undefined;
    if (!row) return null;
    return { id: row.id, path: row.path, indexedAt: row.indexed_at };
  }

  listRepos(): RepoRecord[] {
    const rows = this.db
      .prepare("SELECT id, path, indexed_at FROM repos ORDER BY indexed_at DESC")
      .all() as { id: number; path: string; indexed_at: string }[];
    return rows.map((r) => ({ id: r.id, path: r.path, indexedAt: r.indexed_at }));
  }

  loadChunksWithVectors(repoId: number): ChunkWithVector[] {
    const rows = this.db
      .prepare(`
        SELECT
          c.id, c.file_path, c.symbol_name, c.symbol_type,
          c.start_line, c.end_line, c.content,
          e.vector_json
        FROM chunks c
        INNER JOIN embeddings e ON e.chunk_id = c.id
        WHERE c.repo_id = ?
      `)
      .all(repoId) as {
      id: number;
      file_path: string;
      symbol_name: string;
      symbol_type: string;
      start_line: number;
      end_line: number;
      content: string;
      vector_json: string;
    }[];

    return rows.map((r) => ({
      chunk: {
        id: r.id,
        filePath: r.file_path,
        symbolName: r.symbol_name,
        symbolType: r.symbol_type,
        startLine: r.start_line,
        endLine: r.end_line,
        content: r.content,
      },
      vector: JSON.parse(r.vector_json) as number[],
    }));
  }

  stats(repoId: number): { chunks: number; embeddings: number } {
    const chunks = this.db
      .prepare("SELECT COUNT(*) as c FROM chunks WHERE repo_id = ?")
      .get(repoId) as { c: number };
    const embeddings = this.db
      .prepare(`
        SELECT COUNT(*) as c FROM embeddings e
        JOIN chunks c ON c.id = e.chunk_id
        WHERE c.repo_id = ?
      `)
      .get(repoId) as { c: number };
    return { chunks: chunks.c, embeddings: embeddings.c };
  }

  close(): void {
    this.db.close();
  }
}
