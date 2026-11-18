[中文版](../testing.md) · English

# Testing Strategy

Three tiers of testing correspond to the DoD of each phase in [roadmap.md](./roadmap.md). The first two tiers run entirely offline (with no dependency on a real host or the network); only the third tier runs against a real host.

## Tier 1 · Core pure-function unit tests (corresponds to P0)

- **Targets**: `SchemaSensor` / `LoopHashSensor` / `SemanticSensor` / `PolicySensor`, `CoursePlanner`, and effect serialization.
- **Requirements**: sensors and the planner remain pure functions with no I/O; `DriftSignal` and `SteeringEffect[]` must pass JSON roundtrip assertions (the serializability red line, see [constraints.md](./constraints.md)).
- **Required test cases**:
  - Level mapping: schema→L1, loop→L2, semantic→L3, policy→L4 each trigger their corresponding effect list;
  - Effect-list convention: `Suspend` appears alone and in the last position; invalid input is rejected by the planner;
  - **Failure degradation**: a single sensor exception → skip; a global exception → `[PassThrough]` + degraded flag (see [core.md](./core.md) for degradation semantics).

## Tier 2 · Replay simulation (corresponds to P1)

Recorded traces are used in place of a real host to verify runtime behavior across the entire chain:

- **MockHostAdapter**: a test export of `plugin-kit`; supports programmatic injection of `RawEvent` sequences and records all `materialize` calls (effects, order, results).
- **ReplayHarness**: loads a trace file (JSONL, one `RawEvent` per line), drives `PluginRuntime.run` for replay, and asserts:
  - the types and order of `SteeringOutcome.effects` (e.g., an L3 scenario = `[RedirectTool, InjectMessage]`);
  - the `latencyMs` budget (normalize + sense ≤ 35ms, plan ≤ 10ms);
  - the `degraded` flag and the number of `AuditEvent` emissions plus field completeness (see [telemetry.md](./telemetry.md));
  - HITL bridging: mock `HitlTransport` returns approved / rejected / timeout respectively, asserting the three outcomes of pass-through, block + inject, and alert.
- **Trace sources**: manual recording from a real host + hand-crafted adversarial samples (infinite loops, out-of-bounds writes, `rm -rf`, path hallucinations).

## Tier 3 · Real-host end-to-end (corresponds to P2–P4)

| Target | What is verified |
|---|---|
| `plugins/mcp` | Real MCP Server mounting; observe L1/L2 correction and audit reporting |
| `plugins/codex` / `deepseek` / `claude-code` | Real host processes running; verify L3/L4 and task resumption after approval |
| `sdk/vercel` / `sdk/langchain` | demos run through, `onSteer(SteerEvent)` fields correct, boundary constraints (no lifecycle takeover, no proxying) pass review |

## Boundary guards (CI)

`.github/workflows/ci.yml` is in place (install → build → lint → test → scan → verify:contracts → dashboard smoke test):

- dependency-scan assertions: core must not contain `fs` / `net` / `child_process` imports; plugin-kit must not import any host SDK;
- budget baseline: sense + plan p99 < 50ms (heavy sensors routed through the async bypass are excluded);
- documentation validation: Mermaid diagrams render and relative links have no broken links (consistent with the DoD of this repository's documentation task).
