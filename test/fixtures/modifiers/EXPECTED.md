# Modifiers fixture — expected behaviors

Minimal fixture to assert that tokens-mcp surfaces `$extensions.studio.tokens.modify`
through its read APIs. Without the modifier surfaced, callers can't tell that a token
is a derived value vs. a base token — critical for brand-iteration workflows where an
LLM edits source tokens and inspects their meaning.

## Tokens

| Path | Type | Value | Modifier |
|---|---|---|---|
| `color.brand` | color | `#5A2D91` | (none) |
| `color.brandHalf` | color | `{color.brand}` | `alpha 0.5 lch` |

## Expected MCP surface

- `browse_tokens` and `search_tokens` MUST include `$extensions` on the `color.brandHalf` result.
- `resolve_token` for `color.brandHalf` MUST include the modifier in the chain step
  belonging to `color.brandHalf` (the rawValue is the reference, the modifier captures
  what is applied during resolution).
