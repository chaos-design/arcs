[中文版](./README.md) · English

# @chaos-design/arcs-plugin-trae

The Trae host plugin for ARCS (Agent Real-time Course Steering). It integrates as Trae project-level hooks and performs collection and audit for 13 events.

> **Important: Trae only collects and audits; it cannot block tasks.**
> Trae is a Tier C read-only platform: hook output cannot reject actions, rewrite arguments, or suspend for approval. Any steering suggestion can only be presented as additional context, and the task always continues fail-open.

## Capability boundary (Tier C)

Capabilities come from `host-kit`'s `capabilitiesFor('trae')`; nothing is hardcoded in the plugin.

| Capability | Supported | Description |
| --- | --- | --- |
| `patchArgs` (rewrite args) | ✗ | No argument-rewrite channel |
| `redirectTool` (reroute) | ✗ | Tool names cannot be replaced |
| `injectMessage` (inject) | ✓ | Takes effect through `additionalContext` only when the host allows hooks to append context |
| `suspend` (suspend for approval) | ✗ | No approval callback channel |
| `block` (reject) | ✗ | Cannot block |

A dangerous command (such as `rm -rf /`) produces **`allow`** end-to-end (fail-open, no blocking); `degraded` records `suspend→allow`, and `injected` contains a note stating "This action requires human approval but the host does not support suspension; it has been allowed through." There is no "interception" semantics here — only an audit trace and a hint are left.

## Installation

Trae uses project-level hooks and has no plugin manifest. Install this package locally (or within the project) first, because the hook command calls it directly with `npx --no-install` and does not fetch anything from the network:

```bash
# Build at the monorepo root and link/install the package as a project dependency
corepack pnpm --filter @chaos-design/arcs-plugin-trae build
corepack pnpm add -D @chaos-design/arcs-plugin-trae   # or link within the workspace

# Confirm it is executable
npx --no-install arcs-plugin-trae --help
```

Then register `hooks/hooks.json` in the Trae project's hook configuration (project level); each event's command has the form:

```bash
npx --no-install arcs-plugin-trae --event=PreToolUse
```

## Configuration

The steering goal is passed via `--goal=<text>` or read from the environment variable `ARCS_GOAL`:

```bash
npx --no-install arcs-plugin-trae --event=PreToolUse --goal="Safe refactor, no destructive commands"
```

The event name is passed explicitly via `--event=<Name>`; `src/cli.ts` parses it from argv and injects it via `withTraeEvent` into the env (`ARCS_EVENT`) of the `parse` closure; the case where the event name appears in the stdin payload is also supported.

### The 13 events

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`, `Interrupt`, `SessionPend`, `Notification`, `PermissionRequest`, `PermissionDenied`, `Elicitation`, `ElicitationResult`.

## Hook output schema

`PreToolUse` output is fixed to allow:

```jsonc
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "additionalContext": "<optional, injected hint + capability degradation note; multiple lines separated by \n>"
  }
}
```

The fields follow the official Trae Hook reference: both PreToolUse's `permissionDecision` and `additionalContext` live inside `hookSpecificOutput`. Even when the decision engine produces `block` or `ask`, this plugin still serializes it as `allow` — this is the Tier C fail-open contract. Non-`PreToolUse` events output `{}`. Any parse/runtime exception also fails open: it outputs an allow decision, writes errors only to stderr, and keeps the exit code at 0.

## Testing

```bash
corepack pnpm exec vitest run plugins/trae/src --reporter=basic
```

Covers parse, invalid-JSON fallback, shouldSteer, the three serialize states (all allow), capability boundary, and the end-to-end `allow` degradation path.
