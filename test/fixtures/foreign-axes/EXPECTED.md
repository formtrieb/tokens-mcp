# `foreign-axes/` fixture — expected behavior

**Purpose:** regression-boundary for design-system-agnostic theme axes — a token
system whose axes are **not** the `Semantic` / `Device` / `Shape` this server was first
built against. Until 2.5.0 the Zod enums in `resolve.ts` / `themes.ts` dropped such axes
before the loader ever saw them, and themes without a `group` surfaced as the axis
`"undefined"`.

## Shape

- 7 token sets: `core` (source) + 2 brand, 2 density, 2 mode variants (nested `a/b` set names)
- 3 axes, none of which the server hard-codes:
  - `Brand` → `Acme`, `Globex`
  - `Density` → `Cozy`, `Compact`
  - `Ungrouped` → `Light`, `Dark` — these two themes carry **no `group` key** in
    `$themes.json` and must collect under `UNGROUPED_AXIS`, never `"undefined"`

## `ThemeLoader` expectations

`getAxisGroups()` → `["Brand", "Density", "Ungrouped"]`
`getDefaultAxes()` → `{ Brand: "Acme", Density: "Cozy", Ungrouped: "Light" }`
(first theme per axis, file order)

`getActiveSets({ Brand: "Globex" })` → `{ enabled: ["brand/globex"], source: ["core"] }`

## Expected resolved values

| Token path | Axes | Resolved |
|---|---|---|
| `color.accent` | `{ Brand: "Acme" }` (default) | `#3b82f6` |
| `color.accent` | `{ Brand: "Globex" }` | `#ec4899` |
| `spacing.gap` | `{ Density: "Cozy" }` (default) | `16px` |
| `spacing.gap` | `{ Density: "Compact" }` | `8px` |
| `color.background` | `{ Ungrouped: "Light" }` (default) | `#f5f5f5` |
| `color.background` | `{ Ungrouped: "Dark" }` | `#171717` |

## Tool expectations

- `resolve_token` / `resolve_batch` / `compose_theme` / `compare_themes` /
  `find_token_by_value` accept `{ Brand: "Globex" }` **through the declared
  `inputSchema`**, not just at the handler.
- An axis this system does not define (e.g. `{ Semantic: "Light" }`) is rejected at
  runtime with a message naming the available axes and their values — it must not
  silently drop the axis and resolve against defaults.
- `list_themes` reports `Brand`, `Density`, `Ungrouped` with a `default` per axis.
