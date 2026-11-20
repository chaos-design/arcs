[中文版](./README.md) · English

# @chaos-design/arcs-plugin-zcode

ARCS ZCode host plugin. ZCode is upstream-compatible with the Claude Code plugin shape (reusing `${CLAUDE_PLUGIN_ROOT}`) and exposes only 7 hook events. The plugin intercepts tool calls in the `PreToolUse` front-hook and returns steering decisions in a `permissionDecision` structure the host recognizes; all other events are merely passed through. The whole flow is fail-open: any exception is written only to stderr, the tool call is allowed through, and the exit code stays 0.

## Installation

Install as a local plugin directory (after building `dist/`):

```bash
corepack pnpm --filter @chaos-design/arcs-plugin-zcode build
# Load ./plugins/zcode via a local marketplace or plugin directory
```

- Plugin manifest: `.zcode-plugin/plugin.json`
- Marketplace manifest: `marketplace.json` (name / owner / plugins)
- Hooks: `hooks/hooks.json`, with commands of the form:

```json
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" --event=PreToolUse
```

`CLAUDE_PLUGIN_ROOT` is injected by the host when it loads the plugin (same as Claude Code plugins).

Exactly 7 events are registered: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Stop`.

## Configuring the steering goal

Same as the claude-code plugin, choose one of the following:

- Environment variable: `export ARCS_GOAL="Safe refactor, no public API changes"`
- Command-line argument: `--goal="Safe refactor, no public API changes"`

`goalFromArgs` first parses `--goal=...` / `--goal ...`, then falls back to `ARCS_GOAL`.

## Field aliases

Mapping of ZCode payload fields to ARCS `NativeEvent` fields:

| ZCode field | ARCS field |
| --- | --- |
| `toolCallId` | `toolUseId` |
| `toolInput` | `toolArgs` |
| `toolResponse` | `payload` |
| `responseText` (Stop event) | `thought` |

It also supports Claude Code-style fields such as `tool_use_id` / `tool_input` / `input` / `args` and `hook_event_name`.

## Hook output JSON schema

Only `PreToolUse` outputs a decision; other events output `{}`. It uses the Claude Code-compatible rejection structure recognized by the host:

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

- `permissionDecision: "deny"` + `permissionDecisionReason`: reject the current tool call. This is the implemented form of the `block` decision under Tier B; ARCS `ask` (requires human approval) is also conservatively mapped to `deny` on ZCode to avoid letting high-risk commands through.
- `permissionDecision: "allow"`: allow the call; `updatedInput` is only theoretically used for argument rewriting, but ZCode offers no stable rewrite channel, so it is actually degraded by host-kit to context injection.
- `additionalContext`: sends the steering hint and capability degradation (e.g. `suspend→block`) back into the model context without blocking the task.

## Capability boundary (Tier B, from host-kit `capabilitiesFor('zcode')`)

| Capability | Value | Description |
| --- | --- | --- |
| `patchArgs` | false | No stable argument-rewrite channel; L1 degrades to `additionalContext` injection |
| `redirectTool` | false | Tool names cannot be replaced; L3 degrades to injection |
| `injectMessage` | true | `additionalContext` can send steering hints back (L2/L3) |
| `suspend` | false | No approval callback channel; L4's `ask` degrades to `block` |
| `block` | true | `permissionDecision: "deny"` can reject a single call |

A dangerous command produces a **block** decision end-to-end (not ask) and leaves a `suspend→block` audit trace in `degraded`. All capability booleans come from `capabilitiesFor('zcode')` and are not hardcoded in the plugin; when capabilities are insufficient, it fails open per host-kit rules and leaves a trace in `additionalContext`.

> Note: there is no real ZCode CLI on this machine; the output contract comes from the upstream Claude Code-compatible shape and ASTRO forensics, and is "pending verification on a real host". It is recommended to verify the `permissionDecision` field name on a real host before going live.
