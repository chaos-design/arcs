[中文版](./README.md) · English

# @chaos-design/arcs-plugin-pi

ARCS Pi global extension: it subscribes to global events via `pi.on(...)` and performs L1–L3 steering and injection in the pre-tool-call phase; L4 (dangerous commands) degrades to `block` because the host has no suspension channel. It is Tier B. The build output is in `dist/`, `main` points to `dist/index.js`, and the installation script copies it to the global extension directory.

## Installation

Pi automatically discovers extensions in its global extension directory. Copy (or symlink) this directory into the global extension directory:

```bash
# Global extension directory (if your Pi version uses a different path, follow the actual one)
mkdir -p ~/.config/pi/extensions
cp -R plugins/pi ~/.config/pi/extensions/arcs

# Or use a symlink to make source updates easier
ln -s "$PWD/plugins/pi" ~/.config/pi/extensions/arcs
```

The extension's default export is `function(pi) { pi.on(...) ... }`, which Pi calls at load time to register events. Set the steering goal (optional):

```bash
export ARCS_GOAL="Safe refactor, no breaking changes to existing behavior"
```

## Event mapping table

| Native event (`pi.on` name) | Canonical event | Handling |
| --- | --- | --- |
| `session_start` | `SessionStart` | Observation |
| `input` | (temporarily stores `pendingPrompt`) | Only stores the prompt text |
| `before_agent_start` | `UserPromptSubmit` | Consumes the stored prompt, may inject a hint |
| `tool_call` | `PreToolUse` | Pre-steering, dangerous commands → block |
| `tool_result` | `PostToolUse` / `PostToolUseFailure` | Distinguished by `isError`, observation |
| `message_end` (`type=text`) | `AgentMessage` | Observation |
| `message_end` (`type=thinking`) | `Reasoning` | Observation |
| `session_shutdown` | `SessionEnd` | Observation |
| `user_bash`, `model_select`, `session_before_compact`, `session_compact` | Preserved as-is | Observation |

Unknown event names are preserved as-is and not dropped downstream.

## Capability boundary (Tier B)

From `capabilitiesFor('pi')`:

| Capability | Value | Implementation |
| --- | --- | --- |
| `patchArgs` | ❌ | No stable argument-rewrite contract; L1 `PatchArgs` degrades to injected hint |
| `injectMessage` | ✅ | L2/L3: `before_agent_start` returns a structured object `{ message: { customType, content, display } }` to inject context |
| `suspend` | ❌ | No approval callback channel |
| `block` | ✅ | L4: `tool_call` returns `{ block: true, reason }` to reject execution |
| `redirectTool` | ❌ | L3 degrades to injected hint |

Steering levels: L1 argument rewrite degrades to injection → L2 loop injection → L3 deviation injection → L4 dangerous command `Suspend` degrades to `block`. Any capability gap or exception fails open and never interrupts the task.

## Session claim

`session_start` uses `host-kit`'s `SessionClaim` file lock (`<home>/pi/.claims/<sessionId>.claim`, atomically claimed with `open('wx')` plus pid recording). Pi sessions can be resumed: after the old owner process exits, the new process takes over automatically; `EPERM` is treated as still alive and no takeover occurs. Multiple processes must share the same `ARCS_HOME` (or `ARCS_CLAIM_HOME`). Tests can isolate the directory with `configureClaims(home)`.

## How steering effects are written back to the host

- Observation events: `subscribeFn` is injected as the 4th argument of `HookEntryAdapter`; after `pi.on` receives an event, it is mapped to `RawEvent`, `reset()` is called before each event, and `PluginRuntime.run` is driven fire-and-forget (for collection/state/audit).
- Events requiring write-back (separate pipeline, to avoid cross-talk from a shared mutable decision):
  - `input`: temporarily stores the prompt text;
  - `before_agent_start`: consumes the stored prompt → `UserPromptSubmit` → `await runtime.run` → returns `injected` as `{ message: { customType: 'arcs-steering', content, display: false } }` (Pi's official `before_agent_start` contract requires `message` to be a structured object; a bare string is invalid);
  - `tool_call`: `PreToolUse` → `await runtime.run` → under Tier B, `block` is returned as `{ block: true, reason }` to reject execution.
- `HookEntryAdapter`'s `reset()` is called before every event to ensure the previous decision does not linger.

## Local audit

After setting `ARCS_HOME` or `ARCS_AUDIT_FILE`, orchestration events are appended to `<home>/audit/pi/<YYYY-MM-DD>.jsonl`; if unset, nothing is written and behavior is unchanged. After a real session, run `node scripts/host-real-check.mjs --verify` to view the statistics.
