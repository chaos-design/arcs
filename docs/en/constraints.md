[中文版](../constraints.md) · English

# Constraints

| # | Constraint | Rationale | Enforcement |
|---|---|---|---|
| 1 | **core purity red line**: no `fs` / `net` / `child_process` imports | Ensure algorithms are portable, testable, and side-effect-free | CI dependency-scan assertion |
| 2 | **Latency budget**: normalize + sense ≤ 35ms, plan ≤ 10ms, materialize ≤ 5ms, total < 50ms | Achieve "detect deviation the moment it occurs, correct immediately" | The budget is measured in **CPU time** (`process.cpuUsage`, accessed via `globalThis` to keep core at zero imports), not wall-clock time — when a synchronous sensor/planner is preempted by the OS, the inflated wall-clock time would be misjudged as a budget overrun and downgrade an L4 block into a pass-through; `createArcsEngine({ clock })` allows injecting a fake clock for deterministic tests |
| 3 | **Serializable decisions**: `SteeringEffect` (and ordered lists thereof) must be JSON-serializable | Support audit, replay, and telemetry | Type constraints + JSON roundtrip unit tests |
| 4 | **Approval semantics**: `Suspend` suspends only a single high-risk action and resumes after approval; rejection/timeout (default 120s) → block + inject explanation, task continues | Ensure task continuity; avoid degenerating into task termination | HITL bridge contract constraint (`HitlDecision.timeout` is required) |
| 5 | **Host-agnostic glue layer**: `plugin-kit` does not import any host SDK | Keep the glue layer reusable | Host dependencies pushed down to `plugins/*` |
| 6 | **SDK boundary**: `sdk/*` does not implement lifecycle hooks or traffic proxying | Avoid overlapping with plugin responsibilities | Design review check |
| 7 | **Fail open on failure (fail-open)**: detection/planning exceptions or budget overruns always pass through and are marked `degraded` | ARCS must never become a source of task interruption (the fallback for Core Promise 1) | Runtime try/catch at each level + degraded audit-event unit tests |
| 8 | **Effect-list contract**: `plan` returns an ordered `SteeringEffect[]`, materialized in order; `Suspend` may appear only alone and in the last position | Support the composite "block + inject" correction; avoid partially materialized state | Type constraints + planner validation unit tests |
| 9 | **State TTL**: `SessionState` idle timeout (default 30 minutes) must be cleaned up | Prevent memory leaks in long-running plugin processes | Runtime lifecycle tests |
| 10 | **No telemetry backpressure**: `TelemetrySink.emit` must not throw and must not block the main chain | Telemetry failures must never affect correction | Sink contract tests (exception injection) |

## Terminology

Use the following terms consistently; avoid mixing them:

- **Drift**: a state in which the execution direction deviates from the established goal
- **Steering Arc**: a smooth correction path that pulls the Agent back to the goal
- **Steering Prompt**: a system-level correction prompt injected into the host/model
- **Goal**: the objective set at the start of a task
- **Steering / correction**: the system-level correction mechanism / a specific correction action
- **Non-invasive integration**: neither the SDK nor plugins modify the host's core logic
- **Session state (`SessionState`)**: cross-event state held by the glue layer keyed by sessionKey (loop window / history / budget)
- **Degraded**: an exceptional state in which fail-open passes through and is flagged, accompanied by an audit event
- **Effect list**: the ordered `SteeringEffect[]` output by `plan`, materialized in order by the runtime
