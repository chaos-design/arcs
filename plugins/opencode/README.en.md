[中文版](./README.md) · English

# @chaos-design/arcs-plugin-opencode

ARCS OpenCode global plugin: it collects lifecycle events through global event subscriptions and performs L1–L4 steering in the `tool.execute.before` front-middleware. It is Tier A (can rewrite arguments, can suspend, can block). The build output is in `dist/`, `main` points to `dist/index.js`, and the installation script copies it to the global plugin directory.

## Installation

OpenCode automatically discovers plugins in its global plugin directory. Simply copy (or symlink) this directory into the global plugin directory:

```bash
# Global plugin directory (if your OpenCode version uses a different path, follow the actual one)
mkdir -p ~/.config/opencode/plugin
cp -R plugins/opencode ~/.config/opencode/plugin/arcs

# Or use a symlink to make source updates easier
ln -s "$PWD/plugins/opencode" ~/.config/opencode/plugin/arcs
```

Set the steering goal (optional; by default read from `ctx.goal` or an environment variable):

```bash
export ARCS_GOAL="Safe refactor, no breaking changes to existing behavior"
```

After restarting OpenCode, the plugin registers with `id: arcs-steering`.

## Event mapping table

Native events → ARCS canonical event names (unknown events are preserved as-is and not dropped downstream, for forward compatibility):

| Native event (`event.type`) | Canonical event | Trigger condition |
| --- | --- | --- |
| `session.created` | `SessionStart` | Session created (used for claim deduplication) |
| `session.tool.called` | `PreToolUse` | Before a tool call (middleware intercepts synchronously) |
| `session.tool.success` | `PostToolUse` | Tool call succeeded |
| `session.tool.failed` | `PostToolUseFailure` | Tool call failed |
| `permission.asked` | `PermissionRequest` | Permission requested |
| `session.text.ended` | `AgentMessage` | Text output ended |
| `session.step.ended` (`finish=stop/end_turn`) | `Stop` | Normal completion |
| `session.step.ended` (`finish=error/failed`) | `StopFailure` | Abnormal completion |
| Others | Preserved as-is | Forward compatibility |

## Capability boundary (Tier A)

From `capabilitiesFor('opencode')`:

| Capability | Value | Implementation |
| --- | --- | --- |
| `patchArgs` | ✅ | L1: `decision.updatedInput` written back to `output.args` (full replacement) |
| `injectMessage` | ✅ | L2/L3: injected text is queued and written to `output.system[]` via `session.hook('context')` |
| `suspend` | ✅ | L4: dangerous commands produce `ask`, suspended to wait for approval via `client.permission.ask` |
| `block` | ✅ | Throws an error to reject execution on degradation/host requests |
| `redirectTool` | ❌ | Tool names cannot be replaced; L3 degrades to injected hint |

Steering levels: L1 argument rewrite → L2 loop injection → L3 deviation injection (L3 reroute degrades) → L4 dangerous command suspended for approval. Any capability gap or exception fails open and never interrupts the task.

## How steering effects are written back to the host

- Observation subscription: `subscribeFn` is injected as the 4th argument of `HookEntryAdapter`; after `ctx.event.subscribe` receives an event, it is mapped to `RawEvent`, `reset()` clears the decision before each event, and `PluginRuntime.run` is driven fire-and-forget (for collection and audit).
- Tool middleware: in `tool.execute.before`, `await runtime.run(raw)` reads `adapter.decision` and, after translation:
  - `updatedInput` → written back to `output.args`;
  - `ask` → calls `client.permission.ask` (suspend for approval);
  - `injected` → pushed into the `pendingInjections` queue and delivered to `event.system[]` via `session.hook('context')` (the only valid official OpenCode injection channel; the output of `tool.execute.before` only has `args`);
  - `block` → throws an error to block.
- Observation and tooling use **separate pipelines** (separate `HookEntryAdapter`/`PluginRuntime`) to avoid cross-talk from a shared mutable `decision`.

## Session claim (deduplication)

Uses `host-kit`'s `SessionClaim` file lock: `<home>/opencode/.claims/<sessionId>.claim` is atomically claimed with `open('wx')` and records the pid; only `SessionStart` is claimed. Takeover is allowed only when the old owner has exited or the record has exceeded the TTL (30 minutes by default); `EPERM` is treated as still alive and no takeover occurs. Multiple processes **must share the same `ARCS_HOME` (or `ARCS_CLAIM_HOME`)** for mutual exclusion; cross-host deduplication requires a distributed lock and is out of scope for this plugin. Tests can isolate the claim directory with `configureClaims(home)`.

## Local audit

After setting `ARCS_HOME` or `ARCS_AUDIT_FILE`, each orchestration event is appended to `<home>/audit/opencode/<YYYY-MM-DD>.jsonl`; if unset, nothing is written and behavior is unchanged. After a real session, run `node scripts/host-real-check.mjs --verify` to view the statistics.
