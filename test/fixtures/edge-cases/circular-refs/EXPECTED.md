# `circular-refs/` fixture — expected behavior

**Purpose:** verify the value-resolver detects a 2-token cycle (`{color.a}` → `{color.b}` → `{color.a}`).

## Shape

- 1 token set: `circular`
- 0 themes (`$themes.json` is `[]`)

## Loader expectations (no crash)

`TokenLoader.load()` succeeds. `getTokenSetOrder()` → `["circular"]`. `getSet("circular")` → object with `color.a` and `color.b` token leaves.

`ThemeLoader` constructor succeeds. `getAllThemes()` → `[]`. `getAxisGroups()` → `[]`.

The loader layer is purely structural — it does NOT chase references. The cycle is discovered later, by `tokens-core`'s value-resolution.

## Expected value-resolution behavior

When `tokens-core`'s resolver attempts to resolve `color.a` or `color.b`, it must detect the cycle and either:
- return a `ResolutionChain` with a non-empty `errors` array citing the cycle, OR
- throw a recognizable error mentioning circular reference

(Phase 4 integration tests pin down which behavior is current.)

## Why this fixture exists

Regression guard: a refactor that accidentally turns the resolver into infinite-recursion-then-stack-overflow MUST fail this fixture's resolution test loudly.
