# `tokens-studio/` fixture — expected behavior

**Purpose:** smallest viable Tokens-Studio-shape fixture. Used as the primary regression-boundary for `TokenLoader` + `ThemeLoader` and as the data-source for Phase 4 tool-integration tests.

## Shape

- 3 token sets: `Foundation` (source), `Light` (theme variant), `Dark` (theme variant)
- 1 axis-group `Theme` with 2 themes (`Light`, `Dark`)
- Foundation has **6 tokens**: 4 colors (`color.gray.100/500/900`, `color.blue.500`) + 2 spacings (`spacing.sm/md`)
- Light and Dark each have **5 tokens**: `color.background`, `color.foreground`, `color.accent`, `color.border`, `color.muted`

## `TokenLoader` expectations

`getTokenSetOrder()` → `["Foundation", "Light", "Dark"]`

`getAllSets()` returns Map with 3 entries; all sets parse without error.

`getLayerForSet("Foundation")` → `"Foundation"` (no `/`, single segment)
`getLayerForSet("Light")` → `"Light"`
`getLayerForSet("Dark")` → `"Dark"`

## `ThemeLoader` expectations

`getAllThemes()` → 2 themes
`getAxes()` → Map with key `"Theme"` → array of 2 ThemeDefinitions (Light, Dark)
`getAxisGroups()` → `["Theme"]`
`getThemesForGroup("Theme")` → 2 themes (order: Light, Dark — file order preserved)
`getDefaultAxes()` → `{ Theme: "Light" }` (first theme in group is the default)

`getActiveSets({ Theme: "Light" })` → `{ enabled: ["Light"], source: ["Foundation"] }`
`getActiveSets({ Theme: "Dark" })` → `{ enabled: ["Dark"], source: ["Foundation"] }`

## Expected resolved values per theme

When all enabled + source sets are merged with `Foundation` as base:

### Theme = Light

| Token path | Raw value | Resolved (after `{...}`-deref) |
|---|---|---|
| `color.gray.100` | `#f5f5f5` | `#f5f5f5` |
| `color.gray.500` | `#737373` | `#737373` |
| `color.gray.900` | `#171717` | `#171717` |
| `color.blue.500` | `#3b82f6` | `#3b82f6` |
| `color.background` | `{color.gray.100}` | `#f5f5f5` |
| `color.foreground` | `{color.gray.900}` | `#171717` |
| `color.accent` | `{color.blue.500}` | `#3b82f6` |
| `color.border` | `{color.gray.500}` | `#737373` |
| `color.muted` | `{color.gray.500}` | `#737373` |
| `spacing.sm` | `8px` | `8px` |
| `spacing.md` | `16px` | `16px` |

### Theme = Dark

Differences from Light only:

| Token path | Resolved (Dark) |
|---|---|
| `color.background` | `#171717` |
| `color.foreground` | `#f5f5f5` |

(`accent`, `border`, `muted` resolve identically — same alias targets in both themes.)

## Phase 3+ integration hooks

- `getTokenContext(absolutePath)` should produce a `TokenContext` whose `tokenLoader.getTokenSetOrder()` matches the order above.
- mtime invalidation: editing any of `$metadata.json`, `$themes.json`, `Foundation.json`, `Light.json`, `Dark.json` advances `lastMtime` and evicts the cache.

## Notes

- Token-leaf shape is `{ "$value": ..., "$type": ... }` — matches real Tokens-Studio (Figma plugin v2+) output, which is **TS multi-file structure with DTCG-style leaves**. `TokenTree.isTokenNode` requires both `$value` and `$type` keys. DTCG-FLAT (single `tokens.json`, no `$metadata.json`) is what's out-of-scope for 2.0.0 — DTCG-leaves themselves are how every TS workspace looks today.
- `selectedTokenSets` uses only `"source"` and `"enabled"` (matches real Formtrieb-DS export shape; `"disabled"` entries are simply omitted).
