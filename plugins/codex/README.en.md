[中文版](./README.md) · English

# @chaos-design/arcs-plugin-codex

ARCS Codex host plugin. It intercepts tool calls in the `PreToolUse` front-hook and returns steering decisions as native Codex hook output; the remaining 11 lifecycle events are only passed through without blocking the task. The whole flow is fail-open: any exception is written only to stderr, the tool call is allowed through, and the exit code stays 0.

## Installation

Install as a local plugin directory (after building `dist/`):

```bash
corepack pnpm --filter @chaos-design/arcs-plugin-codex build
codex --plugin-dir ./plugins/codex
```

The plugin manifest is at `.codex-plugin/plugin.json` and the hooks are at `hooks/hooks.json`, with commands of the form:

```json
node "${CODEX_PLUGIN_ROOT}/dist/cli.js" --event=PreToolUse
```

The environment variable `CODEX_PLUGIN_ROOT` is injected by Codex when it loads the plugin.

## Configuring the steering goal

ARCS needs a goal to determine whether the Agent has deviated; choose one of the following:

- Environment variable: `export ARCS_GOAL="Safe refactor, no public API changes"`
- Command-line argument: `--goal="Safe refactor, no public API changes"`

`goalFromArgs` first parses `--goal=...` / `--goal ...`, then falls back to `ARCS_GOAL`; when both are empty, steering degrades to observation only.

The event name is read from `hook_event_name` / `event` / `eventName` in the stdin JSON, with `ARCS_EVENT` as a fallback; the command-line `--event=<Name>` is used for host-side registration and keeps the same shape as the claude-code plugin.

## Hook output JSON schema

Only `PreToolUse` outputs a decision; other events output `{}`. The output follows the official Codex `pre-tool-use.command.output` contract (both the top level and `hookSpecificOutput` have `additionalProperties: false`):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow | deny",
    "permissionDecisionReason": "...",
    "updatedInput": { "command": "..." },
    "additionalContext": "..."
  }
}
```

- `hookEventName`: required, always `PreToolUse`.
- `permissionDecision: "allow"`: allow the call; combined with `updatedInput` to rewrite the tool arguments (`updatedInput` for Bash / apply_patch must carry a string `command` field). Corresponds to ARCS `allow`/`PatchArgs` decisions.
- `permissionDecision: "deny"` + `permissionDecisionReason`: reject the tool call. Corresponds to the ARCS `block` decision.
- `additionalContext`: sends the steering hint and capability-degradation note back into the model context without blocking the tool.

### Strict rules of the host parser (not written in the schema)

Although the official schema lists `permissionDecision: "ask"`, the actual rules in `output_parser.rs` are stricter:

| Output shape | Parser result |
| --- | --- |
| `deny` + non-empty `permissionDecisionReason` | Reject the tool call (the only valid blocking form) |
| `deny` but with a missing/empty reason | Hook judged as failed, **the original call is allowed through** |
| `allow` + `updatedInput` (Bash/apply_patch must include a string `command`) | Rewrite the arguments |
| `allow` but without `updatedInput` | Hook judged as failed, the original call is allowed through |
| `updatedInput` but without `allow` | Hook judged as failed, the original call is allowed through |
| `ask` | Always judged as failed, the original call is allowed through |

Therefore this plugin: does **not** emit a bare `allow` when there is no rewrite (it only emits additional context); every `deny` carries a non-empty reason; and ARCS internal `ask` and `block` are both emitted as `deny`. `pnpm verify:contracts` actually calls `serializeCodex` and asserts each of the above rules one by one to prevent regressions.

### Reference links

- OpenAI official hooks documentation (PreToolUse output fields, deny/allow/ask semantics):
  <https://developers.openai.com/codex/hooks>
- Generated PreToolUse output JSON Schema (field whitelist and required `hookEventName`):
  <https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/pre-tool-use.command.output.schema.json>
- `parse_pre_tool_use` parsing implementation (ask judged unsupported, updatedInput extracted only when allowed):
  <https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/output_parser.rs>

> Note: the schema on the `main` branch may be ahead of the currently released version; for the exact wire format, follow the release behavior in the official documentation and verify on a real host before making adjustments.

## Capability boundary (Tier A, from host-kit `capabilitiesFor('codex')`)

| Capability | Value | Description |
| --- | --- | --- |
| `patchArgs` | true | PreToolUse `updatedInput` can rewrite tool arguments (L1) |
| `redirectTool` | false | Tool names cannot be replaced; L3 degrades to context injection |
| `injectMessage` | true | `additionalContext` can send steering hints back (L2/L3) |
| `suspend` | false | Codex does not support `ask`; L4 is degraded by `host-kit` directly to `block` → outputs `deny` |
| `block` | true | `permissionDecision: "deny"` can reject a single call |

All capability booleans come from `capabilitiesFor('codex')` and are not hardcoded in the plugin. When capabilities are insufficient, it fails open per host-kit's degradation rules and leaves an audit trace in `additionalContext`.
