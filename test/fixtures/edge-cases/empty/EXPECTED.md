# `empty/` fixture — expected behavior

**Purpose:** verify `TokenLoader` and `ThemeLoader` handle a fully empty token workspace without crashing.

## Shape

- `$metadata.json` → `{ "tokenSetOrder": [] }`
- `$themes.json` → `[]`
- No set files

## Loader expectations

`TokenLoader.load()` succeeds.
- `getTokenSetOrder()` → `[]`
- `getAllSets()` → empty Map (size 0)

`ThemeLoader` constructor succeeds.
- `getAllThemes()` → `[]`
- `getAxes()` → empty Map
- `getAxisGroups()` → `[]`
- `getDefaultAxes()` → `{}` (no groups to default-from)

## Why this fixture exists

Smoke test for the trivial case. Several tools (`list_token_sets`, `list_themes`, `find_placeholders`) should return `[]` here without errors. Catches regressions where a downstream consumer assumes "at least one set" or "at least one theme".
