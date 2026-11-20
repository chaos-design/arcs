[中文版](./README.md) · English

# @chaos-design/arcs-plugin-workbuddy

The WorkBuddy host plugin for ARCS (Agent Real-time Course Steering). It integrates as a native WorkBuddy plugin and steers the Agent in real time before tool execution, with the task never interrupted (fail-open).

WorkBuddy exposes 25 hook events in total, all of which this plugin mounts; only `PreToolUse` is the front decision point, running the steering engine before tool execution, while all other events are merely passed through to keep the audit chain intact.

## Capability boundary (Tier B)

Capabilities come from `host-kit`'s `capabilitiesFor('workbuddy')`; nothing is hardcoded in the plugin.

| Capability | Supported | Description |
| --- | --- | --- |
| `patchArgs` (rewrite args) | ✗ | WorkBuddy has no argument-rewrite channel; L1 degrades to injected hint |
| `redirectTool` (reroute) | ✗ | Tool names cannot be replaced; L3 degrades to injected hint |
| `injectMessage` (inject) | ✓ | Sends steering hints back into context via `additionalContext` |
| `suspend` (suspend for approval) | ✗ | Hooks have a timeout, so it cannot synchronously wait for human approval |
| `block` (reject) | ✓ | Can reject a single action; L4 degrades from `suspend` to `block` |

A dangerous command (such as `rm -rf /`) produces **`block`** end-to-end and records `suspend→block` in `degraded`, without suspending or interrupting the entire task.

## Installation

```bash
# Build this plugin at the monorepo root
corepack pnpm --filter @chaos-design/arcs-plugin-workbuddy build

# Install into WorkBuddy as a local plugin directory
# The plugin root is this directory (contains .codebuddy-plugin/plugin.json and hooks/hooks.json)
```

After installation, WorkBuddy reads `.codebuddy-plugin/plugin.json` and registers 25 command hooks according to `hooks/hooks.json`.

## Configuration

The steering goal is passed via `--goal=<text>` in the hook command, or read from the environment variable `ARCS_GOAL`. Example:

```bash
node "${CODEBUDDY_PLUGIN_ROOT}/dist/cli.js" --event=PreToolUse --goal="Safe refactor, no destructive commands"
```

Session context is taken from host environment variables:

- `CODEBUDDY_SESSION_ID`: session ID (`unknown-session` when missing)
- `CODEBUDDY_PROJECT_DIR`: project directory, written to the event's `payload.projectDir`

### Passing the event name (critical)

WorkBuddy **does not** put the event name into the stdin payload. Every hook command must carry `--event=<Name>` explicitly:

```jsonc
"PreToolUse": [{
  "matcher": "*",
  "hooks": [{ "type": "command", "command": "node \"${CODEBUDDY_PLUGIN_ROOT}/dist/cli.js\" --event=PreToolUse" }]
}]
```

`src/cli.ts` parses `--event=` from argv, injects it via `withWorkbuddyEvent` into the env (`ARCS_EVENT`) of the `parse` closure, and then hands it to host-kit's `runHookEntry`. This mechanism is entirely contained within the plugin and does not modify host-kit.

### The 25 events

`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeamMessageIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`, `ElicitationResult`.

## Hook output schema

The `PreToolUse` decision is serialized as:

```jsonc
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny",
    "permissionDecisionReason": "<optional, decision reason; required when deny>",
    "modifiedInput": { "<field>": "<replacement value>" },
    "additionalContext": "<optional, injected hint + capability degradation note; multiple lines separated by \n>"
  }
}
```

The fields follow the official CodeBuddy/WorkBuddy `HookOutput` contract: the decision field is `hookSpecificOutput.permissionDecision` (not `decision`), the top-level `continue` controls whether to continue, and the argument-rewrite field is `modifiedInput` (a local override, not `updatedInput`). ARCS `block`/`ask` are both mapped to `deny` with a non-empty reason. Non-`PreToolUse` events output `{}`. Any parse/runtime exception fails open: it outputs an allow decision, writes errors only to stderr, and keeps the exit code at 0.

## Testing

```bash
corepack pnpm exec vitest run plugins/workbuddy/src --reporter=basic
```

Covers parse, invalid-JSON fallback, shouldSteer, the three serialize states, capability boundary, and the end-to-end `block` path.
