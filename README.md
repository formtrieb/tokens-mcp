# @formtrieb/tokens-mcp

**MCP server exposing Tokens-Studio-shaped design token systems to LLM
clients — browse, resolve, theme compose/compare, validation. Per-call
`tokens_path` with walk-up auto-detection and mtime-aware LRU cache for
live brand iteration.**

This package is a thin MCP adapter over [`@formtrieb/tokens-core`](https://github.com/formtrieb/tokens-core).
The 10 tools below let an LLM client (Claude Desktop, MCP Inspector,
custom runtimes) inspect a Tokens-Studio workspace, resolve token
references through theme composition, compare themes, and audit the
system for placeholders or broken references.

## Status

**v2.0.0 — initial public release.** Hard-break vs. private
`formtrieb-tokens-mcp@1.0.0`. Three structural changes power the new
surface:

1. **Per-call `tokens_path`** — every tool accepts an optional
   `tokens_path` parameter; walk-up from `process.cwd()` resolves it
   when omitted. The old startup-load via `TOKENS_PATH` env var is
   deprecated (still works, emits `console.warn`).
2. **Stateless tools** — no global `set_tokens_path` initialization;
   each call resolves its context independently. One MCP process can
   serve multiple token directories.
3. **mtime-aware LRU cache** — the same path stays cached across calls
   (capacity 8); any `.json` file mtime change in the tree evicts and
   reloads. Edits flow through to the next tool call without restart.

License: Apache-2.0. Requires Node ≥ 20.

## Install + configure

The recommended path is per-project `.mcp.json` via `npx`:

```json
{
  "mcpServers": {
    "formtrieb-tokens": {
      "command": "npx",
      "args": ["-y", "@formtrieb/tokens-mcp"]
    }
  }
}
```

That's it. The walk-up resolver finds `tokens/` automatically when you
work in any subdirectory of a project that contains a Tokens-Studio
workspace (i.e. a `tokens/` directory with `$metadata.json` at its root).

### Path resolution order

Every tool resolves `tokens_path` through three layers, first match wins:

1. **Explicit argument** — `{ tokens_path: "/abs/path/to/tokens" }`.
   Always wins. Use when working with multiple DSes in one session.
2. **Walk-up from cwd** — climbs from `process.cwd()` looking for
   `tokens/$metadata.json`. First match wins (closest to cwd).
3. **`TOKENS_PATH` env var** — deprecated bridge from v1.0.0. Emits
   `console.warn("DEPRECATED: TOKENS_PATH …")`. Will be removed in 3.0.0.

If all three are empty, the tool throws an `Error` listing the three
paths it tried.

### Standalone install

For non-MCP usage (testing, scripting):

```bash
npm install -g @formtrieb/tokens-mcp
tokens-mcp  # launches the stdio server
```

## Tools

| Tool | Purpose |
|------|---------|
| `list_token_sets` | List all sets in order with layer + token count. Read-only overview. |
| `list_themes` | List all themes grouped by axis (Semantic, Device, Shape, Theme, …). Discover valid values for `theme:` arguments. |
| `browse_tokens` | Browse tokens as a nested tree, filterable by set, path-prefix, DTCG `$type`. Configurable depth. |
| `search_tokens` | Case-insensitive substring search across token dot-paths. Up to 100 results. |
| `resolve_token` | Resolve a single dot-path to its computed value for a given theme, returning the full reference chain. |
| `resolve_batch` | Resolve multiple dot-paths in one call. Useful for a variant's full state matrix. |
| `compose_theme` | Show which token sets are active (enabled vs. source) for a given axis selection. |
| `compare_themes` | Diff resolved values between two theme configurations. Caps: 200 changed paths, 50 per only-in-A/B list. |
| `find_placeholders` | List all `#f305b7`/`#ff00ff` placeholder tokens. Audit token completeness. |
| `check_design_rules` | Run controls/component-reference + naming + broken-reference + Light/Dark parity checks. Reports violations grouped by rule. |

Every tool accepts an optional `tokens_path: string` parameter (omit for walk-up).

## Brand-iteration loop

The single biggest UX win in 2.0.0 is the live edit loop. With v1.0.0
you had to restart the MCP server every time you touched a token file.
With 2.0.0:

1. Ask Claude to resolve a brand token: *"What's `color.controls.brand.background.enabled` in Light mode?"*
2. Claude calls `resolve_token` → returns current value via cache.
3. Edit your token JSON file (via the Tokens Studio Figma plugin or any
   editor).
4. Ask Claude to resolve again. The mtime-walk on the next call detects
   the change, evicts the cache, reloads the tree. New value returned.

No restart. No path argument needed. Cost of the per-call mtime walk is
~5–15 ms on typical DS sizes (verified via [perf-smoke test](./test/token-context.test.ts)).

## Migrating from v1.0.0

| Before (v1.0.0) | After (v2.0.0) |
|---|---|
| `TOKENS_PATH=/abs/path` env var, loaded once at startup | Walk-up auto-detect from cwd; or pass `tokens_path` per call. ENV var still works with a deprecation warning. |
| Server restart needed after token-file edits | mtime-aware cache reloads on next call. |
| One MCP process = one DS | One process can serve any number of DSes (LRU cap 8). |
| Package: `formtrieb-tokens-mcp` (private) | Package: `@formtrieb/tokens-mcp` (public, npm). |

If you have an existing `.mcp.json` that points at this package, dropping
the `env` block is the only required change:

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

## Relationship to other packages

| Package | Role |
|---|---|
| [`@formtrieb/tokens-core`](https://github.com/formtrieb/tokens-core) | Pure-function library for parsing + resolving + composing Tokens-Studio workspaces. This MCP server is a thin wrapper. |
| [`@formtrieb/cdf-mcp`](https://github.com/formtrieb/cdf-mcp) | Component Description Format MCP. Independent product. Use both side-by-side in a single Claude session if you author components against tokens. |

## Format support

Currently TS-shape only — Tokens Studio JSON workspaces with
`$metadata.json` + `$themes.json` + per-set `*.json` files. DTCG-flat
(single `tokens.json` with `$value`/`$type` leaves) is a 2.1.0
candidate.

## Development

```bash
pnpm install
pnpm --filter @formtrieb/tokens-mcp build
pnpm --filter @formtrieb/tokens-mcp test
```

## License

[Apache-2.0](./LICENSE)
