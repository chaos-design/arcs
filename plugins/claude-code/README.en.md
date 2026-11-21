[中文版](./README.md) · English

# @chaos-design/arcs-plugin-claude-code

ARCS host plugin for Claude Code. It registers all 17 lifecycle events of Claude Code, intercepts tool calls in the `PreToolUse` front-hook, and returns steering decisions as native Claude Code `hookSpecificOutput`; the remaining 16 events are only passed through without blocking the task. The whole flow is fail-open: any exception is written only to stderr, the tool call is allowed through, and the exit code stays 0.

## Installation

Install as a local plugin directory (after building `dist/`):

```bash
corepack pnpm --filter @chaos-design/arcs-plugin-claude-code build
claude --plugin-dir /abs/path/to/arcs/plugins/claude-code
```

The plugin manifest is at `.claude-plugin/plugin.json` and the hooks are at `hooks/hooks.json` (17 events, with `PreToolUse` carrying `matcher: "*"`), with commands of the form:

```json
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" --event=PreToolUse
```

The environment variable `CLAUDE_PLUGIN_ROOT` is injected by Claude Code when it loads the plugin.

## Configuring the steering goal

ARCS needs a goal to determine whether the Agent has deviated; choose one of the following:

- Environment variable: `export ARCS_GOAL="Safe refactor, no public API changes"`
- Command-line argument: append `--goal="Safe refactor, no public API changes"` to the command in hooks.json

`goalFromArgs` parses `--goal=...` / `--goal ...` first, then falls back to `ARCS_GOAL`; when both are empty, steering degrades to observation only.

The event name is read from `hook_event_name` / `event` / `eventName` in the stdin JSON, with `ARCS_EVENT` as the fallback; the command-line `--event=<Name>` is used for host-side registration, keeping the same shape as the chatgpt plugin.

## Hook output JSON schema

Only `PreToolUse` emits a decision; other events output `{}`. The output follows the official Claude Code PreToolUse contract (`permissionDecision` and `additionalContext` both live inside `hookSpecificOutput`):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow | deny | ask",
    "permissionDecisionReason": "...",
    "updatedInput": { "command": "..." },
    "additionalContext": "..."
  }
}
```

- `permissionDecision: "allow"` + `updatedInput`: allow and rewrite the tool arguments (L1). Corresponds to ARCS `allow` / `PatchArgs` decisions.
- `permissionDecision: "deny"` + `permissionDecisionReason`: reject the tool call (L4). ARCS internal `block` decisions are uniformly mapped to `deny`; when the reason is missing, "ARCS policy blocked this operation" is filled in.
- `permissionDecision: "ask"`: suspend for approval, handing over to the host's own permission confirmation flow (L4 HITL channel). Claude Code is one of the few hosts that supports the `ask` semantics.
- `additionalContext`: sends steering prompts and capability-degradation notes back to the model context without blocking the tool (L2/L3).

## Capability boundary (Tier A, from host-kit `capabilitiesFor('claude-code')`)

| Capability | Value | Notes |
| --- | --- | --- |
| `patchArgs` | true | PreToolUse `updatedInput` can rewrite tool arguments (L1) |
| `redirectTool` | false | Tool names cannot be replaced; L3 degrades to context injection |
| `injectMessage` | true | `additionalContext` can send steering prompts back (L2/L3) |
| `suspend` | true | `permissionDecision: "ask"` hands over to host approval (L4 HITL) |
| `block` | true | `permissionDecision: "deny"` can reject a single call |

All capability booleans come from `capabilitiesFor('claude-code')`; the plugin never hardcodes them. When a capability is missing, host-kit's degradation rules apply fail-open, leaving an audit trace in `additionalContext`.

## Audit

After setting `ARCS_HOME` or `ARCS_AUDIT_FILE`, steering events are appended to `<home>/audit/claude-code/<YYYY-MM-DD>.jsonl`; without the variables nothing is written and behavior is unchanged. See `pnpm real-check` (root README) for verification steps.

## Related documents

- Overall plugin matrix and topology: [docs/en/plugins.md](../../docs/en/plugins.md)
- Shared runtime and capability matrix: [docs/en/host-kit.md](../../docs/en/host-kit.md)
