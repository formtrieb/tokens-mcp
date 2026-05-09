# Changelog

All notable changes to `@formtrieb/tokens-mcp` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-05-09

### Initial public release — major rework of the MCP surface

This is the first public release on npm under the `@formtrieb/` scope.
The package was previously private as `formtrieb-tokens-mcp@1.0.0`
inside the Formtrieb monorepo. The 2.0.0 jump reflects the breaking
nature of the rework: the v1.0.0 ENV-VAR-load-once shape is gone,
replaced by per-call `tokens_path` resolution with walk-up
auto-detection and an mtime-aware LRU cache.

### Breaking changes

- **Per-call `tokens_path`.** Every tool gained an optional
  `tokens_path: string` parameter. Path resolution order: explicit
  argument > walk-up from `process.cwd()` for `tokens/$metadata.json` >
  `TOKENS_PATH` env var. The env-var path is deprecated — it still
  works but emits `console.warn("DEPRECATED: TOKENS_PATH …")`. Removal
  scheduled for 3.0.0.
- **Stateless tools, no startup-load.** Removed the module-level
  `TokenLoader`/`ThemeLoader`/`TokenTree` instantiation in `index.ts`.
  Each tool handler resolves its own context per call via
  `resolveAndLoad(args)`. One MCP process can now serve multiple token
  directories without restart.
- **mtime-aware LRU cache.** New `token-context.ts` module wraps the
  loaders + tree per `tokens_path`, capacity 8, with per-call mtime
  fingerprinting (max-mtime + file-count) over the full token tree.
  Any `.json` mtime change in the tree evicts and reloads on the next
  call — no restart needed for live brand iteration.
- **Package rename.** `formtrieb-tokens-mcp` → `@formtrieb/tokens-mcp`.
- **Build chain.** `tsc + esbuild + MCPB packaging` → `tsup + bin +
  chmod +x`. Output is a single executable `dist/index.js` with
  shebang banner, runnable directly via `npx @formtrieb/tokens-mcp`.
- **MCPB support removed.** The `manifest.json`, `.mcpbignore`,
  `build:bundle`, and `build:mcpb` scripts are gone. MCPB packaging is
  out-of-scope for 2.0.0; if it returns, it will ship via the
  `mcp-server-dev:build-mcpb` skill workflow as a separate track.

### Tool surface (10 tools, names unchanged)

`list_token_sets`, `list_themes`, `browse_tokens`, `search_tokens`,
`resolve_token`, `resolve_batch`, `compose_theme`, `compare_themes`,
`find_placeholders`, `check_design_rules`. Every tool now accepts
optional `tokens_path: string`.

### Format support

Tokens-Studio shape only — `$metadata.json` + `$themes.json` + per-set
`*.json` files. DTCG-flat (single `tokens.json` with `$value`/`$type`
leaves) is a 2.1.0 candidate; the path-resolver, loaders, and fixture
support are coupled and need a coordinated design pass before that
shape ships.

### Migrating from `formtrieb-tokens-mcp@1.0.0`

Drop the `env` block from your `.mcp.json`; the walk-up resolver finds
`tokens/` from your project's working directory:

```diff
 {
   "mcpServers": {
     "tokens": {
       "command": "npx",
-      "args": ["tsx", "packages/tokens-mcp/src/index.ts"],
-      "env": {
-        "TOKENS_PATH": "./tokens"
-      }
+      "args": ["-y", "@formtrieb/tokens-mcp"]
     }
   }
 }
```

If you need to target a non-walkable path (e.g. testing multiple DSes
in one Claude session), pass `tokens_path` per tool call. See the
README's "Path resolution order" section.

License: Apache-2.0. Requires Node ≥ 20.
