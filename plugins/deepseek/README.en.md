[中文版](./README.md) · English

# @chaos-design/arcs-plugin-deepseek

ARCS steering is implemented as a Cordis bundle for the DeepSeek Harness. The plugin subscribes to session lifecycle and native events via `ctx.on`, normalizes Harness events into ARCS canonical events, hands them to the single runtime of `host-kit` for decisions, and then translates the steering effects into host decisions according to platform capabilities. The whole flow is fail-open: no exception interrupts the Agent task.

## Installation

Use the repository's plugin installation script to add this plugin to the DeepSeek client's bundle:

```bash
pnpm install-plugins -- --clients=deepseek
```

The installation script injects `plugins/deepseek` as a bundle and applies the `dsh.bundle.patch` (`cordis.patch.yml`) declared in the package manifest to insert an `arcs-steering` section into the DeepSeek configuration:

```yaml
- insert:
    - id: arcs-steering
      name: arcs-plugin-deepseek
```

> This patch is declared by the `dsh.bundle.patch` field in `package.json`; there is no need to edit the host configuration manually.

## Event mapping

Harness native events → ARCS canonical events (cross-platform audit semantics of `host-kit`):

| Harness native event | Canonical event | Description |
| --- | --- | --- |
| `user/message` (`source.kind=user`) | `UserPromptSubmit` | User prompt submitted |
| `assistant/message` | `AgentMessage` | Assistant message |
| `assistant/attempt` | `Reasoning` | Assistant reasoning attempt |
| `tool/call` | `PreToolUse` | Front interception point for tool calls (where steering happens) |
| `tool/result` | `PostToolUse` / `PostToolUseFailure` | Failure is produced when `isError` (or `error` / `status=error`) |
| `turn/end` | `Stop` / `Interrupted` / `StopFailure` | `reason.kind` `aborted`/`interrupted` → `Interrupted`; `error`/`blocked` → `StopFailure`; otherwise → `Stop` |
| `session/created` | `SessionStart` | Session created |
| `session/disposed` | `SessionEnd` | Session disposed |
| Others | `Notification` | Preserve native semantics (original payload passed through for audit) |

Only `tool/call` (`PreToolUse`) enters the steering engine; all other events are passed through fail-open and are used only to maintain session/audit context.

## Capability boundary (Tier B)

From `host-kit`'s `capabilitiesFor('deepseek')`:

| Capability | Value | Meaning |
| --- | --- | --- |
| `patchArgs` | ✗ | Cannot rewrite arguments before tool execution (L1 degrades to injected hint) |
| `redirectTool` | ✗ | Cannot replace tool name/target (L3 degrades to injected hint) |
| `injectMessage` | ✓ | Can send steering hints back into the Agent context (L2/L3 implemented) |
| `suspend` | ✗ | Cannot truly suspend to wait for human approval |
| `block` | ✓ | Can reject a single action |

Therefore L1–L3 use "inject + audit", while L4 (high-risk commands / protected paths) `Suspend` degrades to **block** (the decision carries `degraded: ["suspend→block"]`). For example, `command: "rm -rf /"` in `tool/call` produces `block` end-to-end.

## Notes

- **Do not declare `inject = ['sessions']`**: DeepSeek's `sessions` is a third-party service. If a bundle declares a dependency on it at load time, Cordis will keep waiting for the injection while the service is not ready, causing a deadlock. This plugin only subscribes with `ctx.on` and broadcasts decisions with `ctx.emit('arcs/decision', …)`; it never touches `sessions`.
- **Decision consumer (default degraded form)**: Steering decisions are broadcast via `ctx.emit('arcs/decision', { sessionId, turnId, decision, enforced })` and can also be read from `decisionBySession` / `lastDecision` / `enforcedBySession` on the handle returned by `apply()`. When no blocking transport is injected, `enforced: false` — the plugin itself does not call the host approval API; the host must subscribe to the event and reject on its own.
- **Real blocking transport (optional)**: After injecting `(decision, raw) => Promise<boolean>` via `apply(ctx, { blockTransport })`, L4 `block` decisions will call it to actually reject tool execution; when it returns `true`, `enforced: true`. Any exception thrown by the transport always fails open. Example:

  ```ts
  apply(ctx, {
    goal: 'Safe refactor',
    blockTransport: async (decision, raw) => ctx.host.rejectTool(raw.payload.toolUseId, decision.reason),
  });
  ```
- **Long subscription reset**: `HookEntryAdapter` calls `reset()` before every event to clear the previous decision and avoid cross-event residue; `turnBySession` maintains the turn id per session (initialized on `session/created`, incremented or taken from an explicit `turnId` on `session/event`, cleaned up on `session/disposed`).
- **fail-open red line**: Any exception in mapping, normalization, decision-making, or serialization only records an audit trace and lets the original call through; errors are written only to stderr and never block the Agent.
- **Single source of truth for the platform name**: The `deepseek` platform name is centralized in `host-kit`'s `platforms.ts`; apart from the bundle name, hardcoded platform names are not scattered throughout the plugin.
- **Local audit**: After setting `ARCS_HOME` or `ARCS_AUDIT_FILE`, orchestration events are appended to `<home>/audit/deepseek/<YYYY-MM-DD>.jsonl` (decisions containing `enforced` can be cross-checked when consumed on the host side); if unset, nothing is written to disk.
