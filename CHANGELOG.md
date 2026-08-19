# Changelog

All notable changes to `@formtrieb/tokens-mcp` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.0] — 2026-08-19

### Fixed

- **Theme axes are no longer hard-coded to one design system.** The `theme` /
  `axes` / `theme_a` / `theme_b` parameters declared fixed Zod enums
  (`Semantic: Light|Dark`, `Device: Desktop|Tablet|Mobile`, `Shape: Round|Sharp`).
  The server itself is per-call generic — `tokens_path` points it at any
  Tokens-Studio workspace — but a token system with its own axes (`Brand`,
  `Density`, or simply differently-named themes) could not address them: the enums
  **silently dropped** the unknown key, and the call resolved against the default
  theme instead of the requested one, with no error. Axis names and values now come
  from the loaded `$themes.json`, so any design system's axes work.
- **Themes without a `group` in `$themes.json` no longer surface as the axis
  `"undefined"`.** They collect under `Ungrouped` and are addressable through it
  (via `@formtrieb/tokens-core` 1.2.0).

### Added

- **Runtime axis validation on every theme-taking tool** (`resolve_token`,
  `resolve_batch`, `compose_theme`, `compare_themes`, `find_token_by_value`). An
  MCP tool schema is static per server and cannot vary per `tokens_path`, so the
  check belongs in the handler. An unknown axis or value now fails with the axes
  the loaded system actually defines, their values, which value is the default, and
  a "did you mean" when only the casing differs — instead of resolving something
  the caller did not ask for.
- **`defaults` in the `list_themes` payload** — names the value each axis falls
  back to when a call omits it.

### Changed

- Tool descriptions no longer present `Semantic` / `Device` / `Shape` as the axes.
  They are given as an example, with a pointer to `list_themes` for discovering the
  axes of the system at hand.

### Compatibility

Additive for existing callers: `Semantic` / `Device` / `Shape` keep working
unchanged wherever `$themes.json` defines them — they are now read from the data
instead of the schema. The one behaviour change is that an axis or value the loaded
system does not define is now an error rather than a silently ignored argument.

## [2.4.0] — 2026-05-31

### Added

- **`find_token_by_value` tool** — reverse-lookup from a colour value (hex,
  `rgb()`, `rgba()`) to the token dot-paths that resolve to it for a theme. Exact
  match is format/casing-insensitive; `nearest:true` adds the perceptually closest
  non-exact token by CIEDE2000 ΔE. Solves the Figma "raw hex, no bound variable"
  workflow (`text-[#2072b6]` → which token is that?). Complements `search_tokens`,
  which matches names not values. **Tool count: 10 → 11.**
- **`format` parameter on `resolve_token` and `resolve_batch`** — render
  `finalValue` as `rgba` / `hex8` / `hex`. Lets a consumer match the CSS output's
  representation (e.g. alpha colours as `rgba()`/`#rrggbbaa`) without post-processing.
  Default is unchanged (raw resolved value).

### Fixed

- **`lighten`/`darken` colours via `@formtrieb/tokens-core`** now compute from the
  base colour instead of black (the LCH-channel bug). Affects derived icon tints
  and hover states resolved through the MCP.

## [2.3.0] — 2026-05-31

### Added

- **`verbose` flag on `resolve_batch`.** When `true`, each path's result
  includes its full reference `chain` (steps + applied colour modifiers)
  instead of just a `steps` count. Default unchanged (count only) —
  backward-compatible. Lets a batch scan see which paths carry
  alpha/lighten/darken modifiers shaping the final value, without falling back
  to per-path `resolve_token` calls.

### Fixed

- **Alpha/modifier colours no longer resolve to their unmodified base.** Via
  the `@formtrieb/tokens-core` fix, modifiers whose value is a token reference
  (e.g. an alpha multiplier) are now composed into `finalValue` instead of
  being silently dropped. Previously these read as "stale" opaque colours.

## [2.2.0] — 2026-05-14

### Added

- **Nested `tokens/tokens/` detection in walk-up auto-resolution.** When a
  token repo is vendored into a project via `git subtree` (or a similar
  mechanism), its `$metadata.json` commonly lands one level deeper than a
  hand-placed token set — at `<dir>/tokens/tokens/$metadata.json`. The
  walk-up resolver now probes that nested location at every ancestor level
  in addition to the direct `<dir>/tokens/$metadata.json`. A direct
  `tokens/` still wins over a nested `tokens/tokens/` at the same level,
  and a closer ancestor still wins over a farther one. Strictly additive —
  layouts that already resolved are unaffected; the explicit `tokens_path`
  argument and the `TOKENS_PATH` env fallback are unchanged.

## [2.1.0] — 2026-05-10

### Added

- **`$extensions` passthrough in `browse_tokens` and `search_tokens`.**
  When a token defines `$extensions` (e.g. `studio.tokens.modify` for
  colour modifications, or other vendor-specific blocks like
  `com.figma.scopes`), both tools now include the block on the
  corresponding result. Previously the outputs dropped `$extensions`
  entirely, making it impossible for callers to distinguish a derived
  token from a base token without a separate filesystem read.
- **`modifier` on `resolve_token` chain steps.** A step whose token
  defines `studio.tokens.modify` now carries the modifier in addition
  to the existing `tokenPath` / `rawValue` / `sourceSet`. The
  resolution behaviour is unchanged — the modifier is still applied
  to the colour during resolution — but the chain output now records
  *what* was applied *where*. Built on
  `@formtrieb/tokens-core@^1.1.0` (`ResolutionStep.modifier` field).

These changes are strictly additive — no field renames, no removals.
Existing consumers that read only `path` / `type` / `value` /
`sourceSet` (or only `tokenPath` / `rawValue` / `sourceSet`) are
unaffected.

### Known limitation

- `resolve_batch` continues to return `steps: <number>` (count only).
  Modifier visibility there is deferred; either expand the per-path
  output shape in 2.2.0 or document the trade-off (use `resolve_token`
  for chain detail, `resolve_batch` for bulk final values). No fix in
  this release.

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
