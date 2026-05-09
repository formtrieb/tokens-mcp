# `missing-set/` fixture — expected behavior

**Purpose:** verify that a `$metadata.json` `tokenSetOrder` entry pointing to a set with no on-disk file is handled silently by `TokenLoader` (per its current contract) but visible downstream.

## Shape

- `$metadata.json` lists 2 sets: `Real`, `Ghost`
- Only `Real.json` exists on disk
- `$themes.json` references both `Real` and `Ghost` as `enabled`

## `TokenLoader` expectations (silent skip)

`getTokenSetOrder()` → `["Real", "Ghost"]` (metadata ordering preserved as-is)

`getAllSets()` → Map with **only one** entry: `"Real"`.
- The `Ghost` set is silently skipped because `Ghost.json` does not exist (see [token-loader.ts:36-38](../../../src/loader/token-loader.ts#L36-L38) — empty `try/catch`).

`getSet("Real")` → object with `color.primary`.
`getSet("Ghost")` → `undefined`.

## `ThemeLoader` expectations (theme references missing set)

`getAllThemes()` → 1 theme (`Default`).
`getActiveSets({ Theme: "Default" })` → `{ enabled: ["Real", "Ghost"], source: [] }`.

The theme keeps `Ghost` in its `enabled` list. Downstream consumers that try to use `Ghost`'s tokens get an empty/missing set from `TokenLoader` — failure surfaces at value-resolution time, not at load time.

## Why this fixture exists

This fixture pins down the **silent-skip contract** of `TokenLoader`. Any refactor that changes the contract (e.g. starts throwing on missing files, or starts auto-removing missing entries from `tokenSetOrder`) breaks this expected behavior and must be a deliberate, documented change.

## Open question for 2.x

Silent-skip is convenient for partial workspaces but masks real configuration errors. A future minor could add a `strict: true` opt-in that throws. **Not 2.0.0 scope.**
