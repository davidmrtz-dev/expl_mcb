import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_IGNORE_DIRS, SOURCE_EXTENSIONS } from "../config.js";
import { logger } from "../utils/logger.js";

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  extension: string;
}

export interface ScanOptions {
  root: string;
  ignoreDirs?: Set<string>;
}

async function walkDir(
  root: string,
  current: string,
  ignoreDirs: Set<string>,
  results: ScannedFile[],
): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") {
      // skip hidden except we already skip .git via ignoreDirs
      if (entry.name !== ".env" && entry.isDirectory()) continue;
    }

    const absolutePath = path.join(current, entry.name);

    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue;
      await walkDir(root, absolutePath, ignoreDirs, results);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    results.push({
      absolutePath,
      relativePath: path.relative(root, absolutePath),
      extension: ext,
    });
  }
}

export async function scanRepository(options: ScanOptions): Promise<ScannedFile[]> {
  const root = path.resolve(options.root);
  const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const results: ScannedFile[] = [];

  logger.info("Scanning repository", { root });
  await walkDir(root, root, ignoreDirs, results);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  logger.info("Scan complete", { files: results.length });
  return results;
}
