import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TokenTree } from "@formtrieb/tokens-core";
import { TokenLoader } from "./loader/token-loader.js";
import { ThemeLoader } from "./loader/theme-loader.js";
import { resolveTokensPath } from "./path-resolver.js";

export interface TokenContext {
  tokenLoader: TokenLoader;
  themeLoader: ThemeLoader;
  tokenTree: TokenTree;
  lastMtime: number;
}

interface CacheEntry {
  ctx: TokenContext;
  fileCount: number;
}

const MAX_CACHE_SIZE = 8;
const cache = new Map<string, CacheEntry>();

interface TreeFingerprint {
  maxMtime: number;
  fileCount: number;
}

function computeFingerprint(dir: string): TreeFingerprint {
  const entries = readdirSync(dir, { recursive: true });
  let maxMtime = 0;
  let fileCount = 0;
  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : entry.toString();
    if (!name.endsWith(".json")) continue;
    fileCount++;
    const stat = statSync(join(dir, name));
    if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
  }
  return { maxMtime, fileCount };
}

export function getTokenContext(absolutePath: string): TokenContext {
  const cached = cache.get(absolutePath);
  const fp = computeFingerprint(absolutePath);
  if (
    cached &&
    cached.ctx.lastMtime === fp.maxMtime &&
    cached.fileCount === fp.fileCount
  ) {
    cache.delete(absolutePath);
    cache.set(absolutePath, cached);
    return cached.ctx;
  }
  if (cached) cache.delete(absolutePath);

  const tokenLoader = new TokenLoader(absolutePath);
  tokenLoader.load();
  const themeLoader = new ThemeLoader(absolutePath);
  const tokenTree = new TokenTree(
    tokenLoader.getAllSets(),
    tokenLoader.getTokenSetOrder()
  );
  const ctx: TokenContext = {
    tokenLoader,
    themeLoader,
    tokenTree,
    lastMtime: fp.maxMtime,
  };
  cache.set(absolutePath, { ctx, fileCount: fp.fileCount });
  if (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return ctx;
}

export function _clearCacheForTesting(): void {
  cache.clear();
}

export const TOKENS_PATH_DESCRIPTION =
  "Optional absolute path to the tokens directory (containing $metadata.json). Leave empty to auto-detect by walking up from the current working directory.";

export function resolveAndLoad(args: { tokens_path?: string }): TokenContext {
  const { path } = resolveTokensPath(args, {
    cwd: process.cwd(),
    env: process.env,
  });
  return getTokenContext(path);
}
