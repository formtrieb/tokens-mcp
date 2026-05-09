import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface ResolveContext {
  cwd: string;
  env: Record<string, string | undefined>;
}

export interface ResolveResult {
  path: string;
  source: "argument" | "walkup" | "env";
}

function walkUpForTokens(startDir: string): string | null {
  let current = resolve(startDir);
  while (true) {
    const tokensDir = join(current, "tokens");
    if (existsSync(join(tokensDir, "$metadata.json"))) {
      return tokensDir;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveTokensPath(
  args: { tokens_path?: string },
  ctx: ResolveContext
): ResolveResult {
  if (args.tokens_path) {
    return { path: args.tokens_path, source: "argument" };
  }
  const walkup = walkUpForTokens(ctx.cwd);
  if (walkup) {
    return { path: walkup, source: "walkup" };
  }
  const envPath = ctx.env.TOKENS_PATH;
  if (envPath) {
    console.warn(
      "DEPRECATED: TOKENS_PATH env var will be removed in 3.0.0. Pass tokens_path argument or invoke from a directory with tokens/$metadata.json reachable upward."
    );
    return { path: envPath, source: "env" };
  }
  throw new Error(
    "Could not resolve a tokens path. Tried (1) tokens_path argument — none given; (2) walk-up from cwd looking for tokens/$metadata.json — none found; (3) TOKENS_PATH env var — not set."
  );
}
