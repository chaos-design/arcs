[中文版](../host-kit.md) · English

# Host Runtime `packages/host-kit`

## Package Role

The runtime layer shared by eight platform plugins: it consolidates "platform differences" into a single package, leaving `plugins/*` with only host-specific hook lists, payload aliases, and serialization quirks.

- **Dependency direction**: a single chain `plugins/* → host-kit → plugin-kit → telemetry → core`.
- **The only I/O package in the packages layer**: audit persistence, session file locks, and the Hook stdin/stdout bridge all live here, locked down by the red-line scan in `scripts/scan-deps.mjs` (each Node built-in is registered individually with a justification).

## Capability Matrix `HOST_CAPABILITIES`

Each host has one `HostCapabilities` record: a `tier` (A/B/C) plus four capability switches (`patchArgs` / `redirectTool` / `injectMessage` / `suspend` / `block`) plus a `note` describing the host's quirks. Key points:

| Host | tier | Key quirks |
|---|---|---|
| codex | A | The official schema's `ask` is "parsed but not supported" → L4 blocks it as deny; allow must include `updatedInput` |
| claude-code | A | `hookSpecificOutput.permissionDecision(allow/deny/ask)` + `updatedInput` |
| opencode | A | `tool.execute.before` middleware can modify arguments; `permission.ask` can suspend |
| zcode / workbuddy / pi / deepseek | B | Can deny but has no argument-modification channel: L1/L3 downgrade to injection, L4 downgrades to block |
| trae | C | Project-level hooks are read-only: always allow + `additionalContext` collection |

Matrix consistency is enforced at two levels: `conformance.test.ts` (capability matrix ↔ behavioral consistency) and `scripts/verify-host-contracts.mjs` (static assertions + behavior-level validation against Codex's official schema).

## Hook Entry Bridge `runHookEntry`

Hook-based platforms (codex / claude-code / zcode / workbuddy / trae) fork a Hook process for each event; `runHookEntry` collapses this one-shot round trip into a fixed pipeline:

```
stdin text → parse(text, env) → NativeEvent → nativeToRaw → PluginRuntime.run
          → effect translation (applyEffect by capability matrix) → serialize(decision, native) → stdout
```

- `HookEntryAdapter` implements the full `HostAdapter`: `subscribe` is a no-op (hooks are not long-lived subscriptions), `normalize` assembles `ExecutionContext`, and `materialize` translates effects one by one and records `decision.level`.
- **Suspend does not call HITL synchronously inside the hook** (hooks have a ~5s timeout); instead it is translated by capability into `ask` (tier A) or `block` (tier B); genuine asynchronous HITL is performed only by platforms with event-subscription capabilities (opencode/pi) inside dedicated adapters.
- `shouldSteer` filters out non-steering events (avoiding false triggers of the engine from prompt text).
- fail-open fallback: any exception in the pipeline is serialized into an "allow + degradation reason" decision, and exceptions are never thrown to the host process.

## Effect Translation `applyEffect` / `translateEffects`

`SteeringEffect[]` (core guarantees Suspend is last) → host `HostDecision`. Any capability gap fails open **with a trace left behind**:

| Gap | Behavior | degraded flag |
|---|---|---|
| No `patchArgs` | Inject a hint asking the Agent to check its own arguments | `patchArgs` |
| No `redirectTool` | Inject a suggestion to use a safer tool | `redirectTool` |
| No `injectMessage` | Silently drop it (the host has no injection channel at all) | `injectMessage` |
| No `suspend` but block available | Downgrade L4 suspension to blocking | `suspend→block` |
| No `suspend` and no block available | Allow through + inject an explanation | `suspend→allow` |

`HostDecision` carries `kind: allow|block|ask`, `updatedInput`, `updatedName`, `injected[]`, `degraded[]`, and `level`, which each plugin's `serialize*` functions encode into platform output (Codex parser quirks, workbuddy's `modifiedInput` field, and the like are all handled at the plugin layer).

## Audit Persistence `FileAuditSink`

- Path: `ARCS_AUDIT_FILE` specifies an exact file; otherwise `<ARCS_HOME>/audit/<host>/<YYYY-MM-DD>.jsonl` (`~/.arcs` by default).
- `createAuditSink(env)` constructs from environment variables; when no variables are set it returns `undefined`, and the caller falls back to an in-memory sink, preserving legacy behavior.
- Writes use `appendFileSync` to write a complete line in one shot, failing silently (telemetry must not block the main chain); content includes only validated `AuditEvent` fields and **does not include raw prompts or tool arguments**.
- Wiring points: `runHookEntry`, the opencode/pi/deepseek subscription-based plugins, and the `arcs-plugin-mcp` CLI; the output is consumed by `pnpm dashboard`.

## Session File Lock `SessionClaim`

The multi-process Hook model has no shared memory, so session state is carried across events via claim files under `~/.arcs`:

- **Acquisition**: first created atomically with `open('wx')`; when it already exists, takeover occurs only in three cases — the owner process has exited (ESRCH), renewal by the same pid (idempotent), or the record exceeding TTL (30 minutes by default).
- **Filename safety**: `sanitizeClaimId` rejects path traversal; ids longer than 96 characters are truncated to 80 characters plus the first 16 hex digits of the original id's sha256, preventing different long ids from colliding on the same file after truncation.
- **A lost trace is preferable to duplication/interruption**: when reading the claim fails (transient I/O error), treat it as already claimed and accept duplicate steering rather than throwing an exception that interrupts the Agent; deletion failures in `releaseSession` are likewise ignored.
- `createSessionClaim(source, home?)` returns a handle, centralizing HOME resolution (`ARCS_CLAIM_HOME` → `ARCS_HOME` → `~/.arcs`) and the current process's held set (`releaseAll` as a fallback).

## Testing

- `claim.test.ts` (acquisition/TTL/idempotency/collision prevention), `entry.test.ts` (stdin→decision round trip, fail-open), `decision.test.ts` (per-capability degradation matrix), `audit-sink.test.ts` (paths and silent failures), `conformance.test.ts` (capability matrix ↔ behavioral consistency, 6 cases).
- Real-host end-to-end checks are run by integrators: `node scripts/host-real-check.mjs` (probes the host CLI and uses `--verify` to tally audit JSONL).
