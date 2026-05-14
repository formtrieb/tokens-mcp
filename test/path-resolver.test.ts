import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTokensPath } from "../src/path-resolver.js";

describe("resolveTokensPath", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tokens-mcp-resolver-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns the explicit tokens_path argument when provided", () => {
    const result = resolveTokensPath(
      { tokens_path: "/explicit/path/tokens" },
      { cwd: "/somewhere/else", env: {} }
    );
    expect(result.path).toBe("/explicit/path/tokens");
    expect(result.source).toBe("argument");
  });

  it("walks up from cwd to find tokens/$metadata.json", () => {
    // root/
    //   project/
    //     tokens/
    //       $metadata.json
    //     src/
    //       deep/   ← cwd starts here
    const tokensDir = join(root, "project", "tokens");
    mkdirSync(tokensDir, { recursive: true });
    writeFileSync(join(tokensDir, "$metadata.json"), '{"tokenSetOrder":[]}');
    const cwd = join(root, "project", "src", "deep");
    mkdirSync(cwd, { recursive: true });

    const result = resolveTokensPath({}, { cwd, env: {} });

    expect(result.path).toBe(tokensDir);
    expect(result.source).toBe("walkup");
  });

  it("falls back to TOKENS_PATH env var when no arg and walk-up finds nothing", () => {
    // No tokens/ anywhere up from cwd. ENV-VAR set.
    const cwd = join(root, "isolated");
    mkdirSync(cwd, { recursive: true });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = resolveTokensPath(
      {},
      { cwd, env: { TOKENS_PATH: "/some/legacy/tokens" } }
    );

    expect(result.path).toBe("/some/legacy/tokens");
    expect(result.source).toBe("env");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("DEPRECATED: TOKENS_PATH");
    warnSpy.mockRestore();
  });

  it("walk-up returns the closest tokens/ when multiple ancestors have one", () => {
    // root/
    //   tokens/$metadata.json    ← outer (further from cwd)
    //   inner/
    //     tokens/$metadata.json  ← closer to cwd, should win
    //     src/
    //       cwd
    const outer = join(root, "tokens");
    const inner = join(root, "inner", "tokens");
    mkdirSync(outer, { recursive: true });
    mkdirSync(inner, { recursive: true });
    writeFileSync(join(outer, "$metadata.json"), '{"tokenSetOrder":[]}');
    writeFileSync(join(inner, "$metadata.json"), '{"tokenSetOrder":[]}');
    const cwd = join(root, "inner", "src");
    mkdirSync(cwd, { recursive: true });

    const result = resolveTokensPath({}, { cwd, env: {} });

    expect(result.path).toBe(inner);
  });

  it("walk-up finds the nested tokens/tokens/ of a git-subtree layout", () => {
    // root/
    //   project/
    //     tokens/
    //       tokens/            ← vendored via git subtree
    //         $metadata.json
    //     src/                 ← cwd starts here
    const nested = join(root, "project", "tokens", "tokens");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "$metadata.json"), '{"tokenSetOrder":[]}');
    const cwd = join(root, "project", "src");
    mkdirSync(cwd, { recursive: true });

    const result = resolveTokensPath({}, { cwd, env: {} });

    expect(result.path).toBe(nested);
    expect(result.source).toBe("walkup");
  });

  it("prefers a direct tokens/ over a nested tokens/tokens/ at the same level", () => {
    // root/
    //   tokens/
    //     $metadata.json       ← direct, should win
    //     tokens/
    //       $metadata.json     ← nested, ignored
    //   src/                   ← cwd
    const direct = join(root, "tokens");
    const nested = join(direct, "tokens");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(direct, "$metadata.json"), '{"tokenSetOrder":[]}');
    writeFileSync(join(nested, "$metadata.json"), '{"tokenSetOrder":[]}');
    const cwd = join(root, "src");
    mkdirSync(cwd, { recursive: true });

    const result = resolveTokensPath({}, { cwd, env: {} });

    expect(result.path).toBe(direct);
  });

  it("throws a helpful error when no arg, walk-up empty, and no env var", () => {
    const cwd = join(root, "isolated");
    mkdirSync(cwd, { recursive: true });

    expect(() => resolveTokensPath({}, { cwd, env: {} })).toThrow(
      /tokens_path/
    );
    expect(() => resolveTokensPath({}, { cwd, env: {} })).toThrow(
      /walk-up/
    );
    expect(() => resolveTokensPath({}, { cwd, env: {} })).toThrow(
      /TOKENS_PATH/
    );
  });
});
