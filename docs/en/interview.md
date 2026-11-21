[中文版](../interview.md) · English

# ARCS Interview Question Bank

A question set designed for scenarios such as "participating in ARCS development/review" or "designing agent steering systems." Each question provides the key points under test and a reference answer; the design semantics in the answers follow this repository's documentation as the source of truth (parentheses contain further reading). It is recommended to work through the groups from basic to advanced.

---

## 1. Problem Domain and Design Overview

### Q1. What problem does ARCS solve? What is the fundamental difference from "post-hoc review of agent logs"?

**Key points**: problem-domain definition; real-time behavior.

**Reference answer**: ARCS addresses **deviation** during agent execution—parameter hallucinations, infinite loops, task divergence, and high-risk privilege escalation—problems for which the damage has already been done by the time of post-hoc review. ARCS performs **real-time steering within the execution flow**: it detects (sense) and plans (plan) a corrective effect before a tool call lands, repairing parameters, injecting a hint, redirecting the tool, or requesting approval, and then lets the host **continue executing the original task**. Two non-negotiable requirements: the task is not interrupted, and deviation is corrected immediately upon detection ([architecture.md](./architecture.md)).

### Q2. Why is "fail-open (fail-and-allow)" the correct default? When should fail-closed be chosen instead?

**Key points**: security-policy trade-offs; ARCS's positioning.

**Reference answer**: ARCS is a correction sidecar, not a security boundary—the cost of it going down should not be borne by the agent's task. If the correction system's own false positives or failures were to block the task, integrators would simply uninstall it; therefore detection anomalies, budget overruns, and initialization failures all default to allow + a `degraded` audit record. fail-closed applies to **security boundaries** (such as a credential gateway). Note that ARCS's L4 (high-risk privilege escalation) is instead fail-safe: when approval is unavailable, deny on timeout, because the semantics of L4 are "better not to execute." This set of trade-offs is realized in the implementation as per-level red lines ([architecture.md robustness red lines](./architecture.md)).

### Q3. How is "task continuity" achieved technically?

**Key points**: effect materialization mechanism.

**Reference answer**: Corrective effects are designed to be **materialized in place**: L1 replaces the full set of repaired parameters wholesale (PatchArgs); L2 injects a message so the model corrects itself; L3 redirects to a safe tool; L4 goes through approval—approved means allowed, rejected/timed out means blocked + an injected explanation, after which the task continues. Every form returns through the host's decision channel (hooks' updatedInput/permissionDecision, MCP's synthetic response); none of them requires terminating the session ([key-flows.md](./key-flows.md)).

---

## 2. Layered Architecture and Dependencies

### Q4. Draw ARCS's dependency chain and explain why core must be pure, zero-I/O logic.

**Key points**: unidirectional layered dependencies; testability.

**Reference answer**: `plugins/* → host-kit → plugin-kit → telemetry → core` is a single chain, with `sdk/*` connecting directly to core. core only performs detection + decision making—zero host SDK, zero Node built-ins, zero network/file access—enforced by the `scan-deps` red-line scan in CI. Benefits: (1) the algorithms can be reused in any environment (including browsers/edge); (2) unit tests have no I/O-mocking cost; (3) swapping out upper layers (adding a new host) does not touch the kernel; (4) budget timing is not polluted by I/O jitter ([architecture.md](./architecture.md), [constraints.md](./constraints.md)).

### Q5. How is the boundary between plugin-kit and host-kit drawn? Why was host-kit later extracted out of the plugins?

**Key points**: evolution of package responsibilities; DRY and boundaries.

**Reference answer**: plugin-kit is the "glue-layer contract": the four-method `HostAdapter` contract (subscribe/normalize/materialize/setup), `PluginRuntime` orchestrating the pipeline, three-level configuration merging, and SessionStore. host-kit is the "greatest common denominator of the 9 platform plugins": the capability matrix, the `runHookEntry` stdin→decision pipeline, shared hook primitives (parsing, serialization and degradation text have a single implementation), effect→host-decision translation, FileAuditSink, and the SessionClaim file lock. Initially this logic was scattered across the plugins, with each reimplementing "translation + degradation + auditing"; after extracting host-kit, the plugins retain only host quirks .(chatgpt's lack of ask support, workbuddy's `modifiedInput` field name), and the capability matrix is locked down by consistency tests ([host-kit.md](./host-kit.md)).

### Q6. Why does sdk/* bypass plugin-kit and connect directly to core? What is the cost of this "straight-line principle"?

**Key points**: dual-track design of SDK and plugins.

**Reference answer**: The SDK is an in-process, strongly typed, synchronously composable code-level integration—the host is the host itself, so there is no problem of "collecting host events, translating host output"; the glue-layer abstraction is pure overhead for it. The cost: the SDK must implement effect materialization itself (`withArcs` inlines PatchArgs/Redirect/Suspend translation and per-wrapper history at the `doGenerate` interception layer), cannot reuse `PluginRuntime`'s orchestration, and so its behavior must be constrained by unit tests and documentation ([sdk.md](./sdk.md)).

### Q7. Why is the telemetry package zero-I/O? Where does persistence live?

**Key points**: separation of contract and implementation.

**Reference answer**: telemetry only defines the `AuditEvent` model (zod validation) and the `TelemetrySink` contract, ensuring "data semantics" are decoupled from "delivery implementation": in-memory sinks (tests), JSONL file output (host-kit's FileAuditSink), and future OTLP/HTTP can all implement the same contract. The emit contract stipulates that it must not throw and must complete synchronously in <1ms—which requires each implementation to do its own buffering/asynchronous flushing. The aggregation functions `buildOffsetCurves`/`buildDashboardModel` are also pure functions, reusable by the dashboard and self-hosted backends ([telemetry.md](./telemetry.md)).

---

## 3. Detection and Decision Algorithms

### Q8. What do core's four sensors each detect? What is the key design of each?

**Key points**: sense-layer algorithms.

**Reference answer**: (1) **PolicySensor**: protected-path globs (`.env*`, `**/migrations/**`) + high-risk command regexes (`rm -rf`, etc.) → L4; (2) **LoopHashSensor**: fingerprints tool calls (name + normalized arguments); when the same fingerprint appears consecutively within a window up to `maxConsecutiveLoops` → L2, with the key being the outcome semantics of "the result must be the same for it to count as a loop"; (3) **SchemaSensor**: validates arguments against `toolSchemas`; when a key name does not match, uses edit distance to find the nearest key and generate PatchArgs (L1), and generates a type-correction patch when the type can be safely coerced; (4) **SemanticSensor**: cosine similarity of thought/goal embeddings below `driftThreshold` → L3 divergence ([core.md](./core.md)).

### Q9. How is the engine's budget mechanism implemented? Why use CPU time rather than wall-clock time?

**Key points**: engineering implementation of budgets and degradation.

**Reference answer**: `createArcsEngine` sets a millisecond budget for sense and plan each, timing each sensor with `process.cpuUsage` (released in `finally`); sensors that exceed the budget are skipped and marked degraded in the result, and when the budget is exhausted the whole pipeline falls back to PassThrough. The CPU clock is chosen to exclude wall-clock jitter from the event loop being blocked by other host work, ensuring the "budget" measures ARCS's own overhead; a known limitation is that synchronous, compute-heavy work inside a single sensor also counts against itself (documented in the engine comments). The latency budget corresponds to the DoD "sense+plan p99 < 50ms" ([core.md](./core.md)).

### Q10. How does LoopHashSensor distinguish an "infinite loop" from a "reasonable retry"?

**Key points**: false-positive control.

**Reference answer**: Three conditions combined: identical fingerprint (name + normalized arguments), consecutive appearance within the window, and the event's outcome being an error (successful repetitions don't count); the tolerance count `maxConsecutiveLoops` is configurable (default 2). When triggered, it is an L2 injection rather than a block—telling the model "you have made the same call N consecutive times with the same result, please try a different approach"—and the task continues ([core.md](./core.md)).

### Q11. Why does SchemaSensor use edit distance for key-name repair instead of simply dropping unknown keys?

**Key points**: boundaries of L1 self-repair.

**Reference answer**: A model-hallucinated key name is usually "a small mutation of the correct key" (`pathh`→`path`), so the nearest known key by edit distance is the high-probability correct intent; PatchArgs is generated only when the match is good enough and the value's type is compatible with the schema, otherwise it degrades to an injection or an allow. Simply dropping unknown keys would turn "parameter hallucination" into "silent parameter loss," causing the task to fail in another way and with no way to explain it ([core.md](./core.md)).

### Q12. How does SemanticSensor's embedder achieve zero dependencies? How are accuracy and cost traded off?

**Key points**: lightweight embedding design.

**Reference answer**: core ships a built-in `HashingEmbedder`—feature hashing into a fixed-dimension vector (character n-grams), with cosine similarity as the divergence measure. Zero model, zero network, microsecond-level; the cost is weaker semantics than a real embedding model: it is good at detecting "the topic has drifted overall," not subtle semantic drift. The interface (`embed(text): number[]`) lets integrators inject a real embedder (the interface is replaceable via Policy) ([core.md](./core.md), [extension-points.md](./extension-points.md)).

---

## 4. Steering Levels, Materialization, and Host Differences

### Q13. What are the semantics and typical trigger scenarios of L1–L4?

**Key points**: the level system.

**Reference answer**: L1 PatchArgs (hot-fixing arguments, schema key-name/type distortion); L2 InjectMessage (inject a correction message, infinite loops / mild deviation); L3 RedirectTool (redirect to a safe tool, semantic divergence with a mapping target; the only form that can change the tool name is the MCP proxy); L4 Suspend (high-risk privilege escalation, entering the HITL approval three-branch: approve→allow / reject or timeout→block + explanation) ([key-flows.md](./key-flows.md)).

### Q14. Why does the capability matrix split hosts into Tiers A/B/C? How does degradation ensure we "don't make false promises"?

**Key points**: host capability modeling.

**Reference answer**: Differences in host output contracts are an objective reality: chatgpt's ask (Codex-compatible contract) is "parsed but not supported," Trae's hooks are read-only, zcode has no argument-modification channel. ARCS's principle is **degrade but leave a trace**: when `applyEffect` hits a capability gap it does not pretend success, but degrades to an action the host can express (patchArgs missing→inject a hint, suspend missing→block) and records it in `HostDecision.degraded` (e.g., `suspend→block`); the degradation is observable through audit events. The matrix is double-locked by conformance tests + verify-host-contracts ([host-kit.md](./host-kit.md), [plugins.md](./plugins.md)).

### Q15. Why is the MCP proxy the only form that can perform L3 redirection (changing the tool name)?

**Key points**: interception surface of a transparent proxy.

**Reference answer**: Native hooks generally only expose a decision channel of "modify arguments + allow/deny," with no output field for "replace the tool name." The MCP proxy sits between the client and the MCP Server; the entire `tools/call` request passes through the proxy, which can rewrite the request's `name` field before forwarding—a capability afforded by the position of its interception surface, not by the host contract ([plugins.md](./plugins.md)).

### Q16. Why does HITL's timeout branch default to "reject"? Does it contradict fail-open?

**Key points**: the applicable boundary of fail-open.

**Reference answer**: No contradiction. fail-open targets "ARCS's own failures should not interrupt the task"; L4 is "the action itself is high-risk and should not execute without approval." When the approval channel is unavailable/times out, treat it as a reject (fail-safe) and inject an explanation so the agent switches to a safe path—the task still continues, only that high-risk action is not executed. In implementation, the fallback transport when no approval channel is configured returns `{approved:false, timeout:true}` ([plugin-kit.md](./plugin-kit.md)).

### Q17. Why don't hook-based platforms call HITL synchronously inside the hook?

**Key points**: host runtime constraints.

**Reference answer**: The hook process has a ~5-second timeout; synchronously waiting for human approval will inevitably time out and block the host. Therefore `runHookEntry`'s Suspend is translated by Tier into `ask` (Tier A, the host pops up its own permission prompt) or `block` (Tier B); true asynchronous HITL is implemented only in long-running processes (the event-subscription adapters of opencode/pi), where there is no hook timeout constraint ([host-kit.md](./host-kit.md)).

---

## 5. Observability

### Q18. Why doesn't AuditEvent contain prompts and tool arguments? What about `evidence`?

**Key points**: telemetry privacy boundary.

**Reference answer**: Audit files may be shared/collected, and prompts and arguments may contain sensitive user data, so AuditEvent keeps only structured decision fields (level/signals/effects/latency/degraded/hitl). A signal's `evidence` is a summary of the detection basis (e.g., "key pathh→path"), which may contain path fragments; the docs explicitly advise managing file permissions as needed ([telemetry.md](./telemetry.md)).

### Q19. Which two questions do offset curves answer? Why is convergence judged by "mean of the first 3 points vs. mean of the last 3 points"?

**Key points**: metric design.

**Reference answer**: **Whether it converges** (whether severity decreases and the deviation interval lengthens after correction intervenes) and **whether it over-steers** (whether the allow ratio is abnormally high, the HITL false-positive rate). Convergence is judged by comparing the mean of the first 3 points with the mean of the last 3 points of the session's severity series—a small window is robust for short sessions and insensitive to noise, and the purely ordinal comparison does not depend on an absolute scale; when there are fewer than 3 points, the verdict is "observe" rather than a conclusion ([telemetry.md](./telemetry.md)).

### Q20. How does the TelemetrySink contract of "synchronous <1ms, must not throw" shape implementation choices?

**Key points**: contract-driven performance design.

**Reference answer**: emit is called synchronously on the main orchestration path on every run, so any slow implementation becomes host latency. Synchronous <1ms means JSONL's appendFileSync is acceptable on a local disk, while network sinks (OTLP/HTTP) must buffer internally + flush asynchronously. "Must not throw" requires the implementation to catch errors itself (disk full, network down); the main path's try/catch is only a second line of defense ([telemetry.md](./telemetry.md)).

---

## 6. Robustness and Engineering

### Q21. How is PluginRuntime's initialization failure handled? Why "reset initPromise to allow retry"?

**Key points**: Plan 11 hardening; lifecycle design.

**Reference answer**: Inside `run()`, `ensureInit` used to sit outside the try/catch—a zod config validation failure or an exception from `adapter.setup` would become an unhandledRejection that takes down the long-running host. After hardening: catch the initialization exception → degrade to PassThrough + degraded audit → **reset initPromise**. Retrying is critical: a host's (e.g., an extension system's) event callbacks may arrive before the host itself is ready, so first-event failure followed by later-event success is the norm; caching a single failure would amount to permanently denying service ([plugin-kit.md](./plugin-kit.md)).

### Q22. How is the MCP proxy's guarantee that "a forwarded request must be answered when the downstream dies" implemented?

**Key points**: settling pending requests; hanging issues.

**Reference answer**: When `tryForward` successfully forwards a request with an id, it is registered in `pendingForwarded` (id→client output stream); when a response comes back on downstream stdout it is deregistered by id; on downstream `exit`/`error` or a failed stdin write, JSON-RPC `-32000` is uniformly returned to all pending requests. Without this mechanism, a request could be forwarded in the window where "the child process has spawned but not yet exited" to a dying process (the write succeeds but no response ever arrives), leaving the client hanging—an e2e test exposed exactly this race ([plugins.md](./plugins.md)).

### Q23. Why can an EPIPE on the stdio pipe crash the proxy? How to defend against it?

**Key points**: Node stream error semantics.

**Reference answer**: Writing to a downstream stdin that has already closed triggers the stream's `error` event (EPIPE); without a listener, Node throws it as an "unhandled error event," taking down the process. Defense: attach error listeners to all three downstream pipes (log / settle pending requests), and wrap writes to the client in try/catch (silently give up when the client's stdout is already closed). The same applies to the CLI's piped output (`pnpm dashboard | head`)—the script entry attaches an EPIPE listener to stdout and exits early ([plugins.md](./plugins.md)).

### Q24. Why are those the three takeover conditions for the cross-process session lock (SessionClaim)? What is the trade-off of "treating a read failure as already claimed"?

**Key points**: a simplified distributed-lock model.

**Reference answer**: Takeover conditions: the owner process is dead (`kill(pid,0)` returns ESRCH; EPERM counts as alive), idempotent renewal by the same pid, or the record exceeding TTL (default 30 minutes, to prevent a zombie claim from locking forever). The file lock is a non-atomic read-then-write, so two processes racing to take over could theoretically both win—ARCS accepts this: the cost of duplicate correction is far smaller than "lock-up causing trace loss" or "an anomaly interrupting the agent," so a failed claim read is always treated as already claimed. Better to duplicate than to lose, and never to interrupt ([host-kit.md](./host-kit.md)).

### Q25. How is the repository's "dependency red-line scan" implemented? Why regex rather than AST?

**Key points**: cost/benefit of guardrail tooling.

**Reference answer**: `scan-deps.mjs` uses a zero-dependency regex to extract module specifiers from import/from/require and validates them against directory whitelists (core may only use zod; host-kit is the only packages package allowed Node I/O, with each Node built-in registered with a reason). Regex false positives/negatives are acceptable for a "guardrail" scenario—it guards against overt violations like "someone casually imported node:fs," not adversarial bypass; in exchange it has zero parser dependencies and runs in seconds, more than enough as a CI gate ([constraints.md](./constraints.md)).

### Q26. Where are capacity limits set? Why is FIFO uniformly chosen as the eviction policy?

**Key points**: resource governance for long-running processes.

**Reference answer**: deepseek session Map (512), opencode injection queue (64), InMemorySink's optional maxEvents, MCP line buffer (1MB then drop). FIFO (Map insertion order + shift) is O(1)/amortized and needs no timestamps; the correctness of these structures does not depend on LRU's access-order assumption—the oldest unfinished session is precisely the one most likely already dead, so evicting it loses the least (source of each package, Plan 11).

---

## 7. Testing and Delivery

### Q27. What does each of ARCS's three testing layers cover? Why aren't real hosts in CI?

**Key points**: variations of the testing pyramid under uncontrollable external dependencies.

**Reference answer**: Layer 1: core pure-algorithm unit tests (zero I/O); Layer 2: plugin-kit ReplayHarness replay simulation (effect ordering / budgets / degraded / HITL three branches) + host-kit conformance tests; Layer 3: subprocess/contract verification—MCP e2e spins up a real three-process topology, verify-host-contracts validates output behaviorally against Codex's official schema. Real host CLIs (codex/claude and other closed-source binaries) have uncontrollable versions and cannot be installed stably in CI, so the DoD explicitly states "real-host testing is performed by the integrator," with `host-real-check.mjs` providing the steps and audit verification ([testing.md](./testing.md)).

### Q28. Why does "behavioral contract validation" exist as a separate thing? What does it catch that unit tests don't?

**Key points**: contract-drift defense.

**Reference answer**: Unit tests verify "our code conforms to the contract as we understand it"; behavioral contract validation verifies "our output conforms to the **official schema**" (e.g., the Codex PreToolUse output schema) plus the quirks of the official parser (ask unsupported, allow must come with updatedInput, deny must have a non-empty reason). When a host upgrade silently changes parsing behavior, unit tests are all green but integration breaks—the contract guardrail catches such drift in CI ([testing.md](./testing.md)).

### Q29. Why are the two examples demos designed with zero external dependencies and a mock model? To what extent do they prove something?

**Key points**: credibility boundaries of a demo.

**Reference answer**: The mock model (duck-typed LanguageModelV4) and local fake MCP Server let the demos run without an API Key or network, with deterministic, assertable results. What they prove is **a real pipeline**: real process topology (demo-mcp is three processes), real build artifacts (consuming dist), real audit output on disk—but not "compatibility with a real LLM / real host," which belongs to integrator testing. The demo output is the acceptance evidence (func_test_result).

### Q30. Why is the offset-curve dashboard built as "a script + pure functions" rather than a web service?

**Key points**: matching delivery form to usage scenario.

**Reference answer**: The users are integrator developers, and the workflow is "run a session → view the curve"; static JSONL → static HTML fully covers this with zero operations (no server, stateless, works offline, archivable alongside audit files). Aggregation semantics are deposited as telemetry pure functions (buildDashboardModel), so when a self-hosted web dashboard / OTLP is added later they can be reused directly, and the rendering layer is replaceable ([telemetry.md](./telemetry.md), [extension-points.md](./extension-points.md)).

---

## 8. Open-Ended Design Questions

### Q31. If we were to add a new host (e.g., Cursor), what steps would we follow? Which steps are most likely to hit pitfalls?

**Key points**: extension workflow (corresponds to extension-points.md).

**Reference answer**: (1) Research the host's hook/extension contract → register `HOST_CAPABILITIES` (tier + capability switches + note); (2) implement `parse` (stdin/events→NativeEvent) and `serialize` (decision→host output), with hook-based types reusing `runHookEntry` directly; (3) write hooks.json/manifest; (4) conformance tests + verify:contracts registration; (5) documentation (plugins.md matrix). The most likely pitfalls: hidden quirks of the host schema (e.g., chatgpt's ask) and field naming (updatedInput vs modifiedInput)—precisely why behavioral contract validation exists.

### Q32. If ARCS introduced 200ms of latency per orchestration, where would you start? Give a priority order.

**Key points**: performance attribution methodology.

**Reference answer**: First break down normalize/sense/plan/materialize using latencyMs (already instrumented by phase). Expected big items: (1) SemanticSensor embedding—if the integrator injected a real embedding model, move to an asynchronous side path (not counted in the budget, result takes effect on the next event); (2) SchemaSensor's full-key scan of large schemas—cache parsed schemas by tool name; (3) FileAuditSink's synchronous write—switch to buffering + timed flush; (4) HITL waiting—not counted as latency (within host semantics). Core principle: no optimization may break fail-open or the budget red line.

### Q33. If L2 injection were changed from "the current event stream" to "before the next model request," what are the trade-offs?

**Key points**: semantics of injection timing.

**Reference answer**: Immediate injection now (opencode uses a session context hook to queue until the next request) guarantees the correction message is strongly relevant to the triggering context, but may interrupt the model's current chain of reasoning; delaying until before the next request is gentler, but the model may have already completed more erroneous actions. A compromise: the higher the level, the more immediate (L2 immediate, low-risk hints coalesced), and record the "injection-to-effect" delay in the audit to observe real-world effectiveness. opencode's `pendingInjections` queue (capacity 64) is this trade-off in practice.

### Q34. How would you design a "false-positive rate" metric for ARCS? Where does the data come from?

**Key points**: landing a metric.

**Reference answer**: A false positive = after a corrective action the host/user rolled it back, or the agent immediately returns to the same action after an injection and succeeds. Data sources: (1) audit events' effects/signals (what intervened); (2) the subsequent event sequence (rollback signal: same arguments called again with outcome=ok); (3) HITL approval rate (an ask being approved ≈ a signal the policy is too strict). Aggregate into buildDashboardModel (add an `interventions` dimension) and validate with the offset-curve dashboard's trend chart—this is the quantified path for "the dashboard answers whether we over-steer."

### Q35. If a host's event stream is concurrent (multiple tools in parallel in the same session), what races must ARCS's state machine handle?

**Key points**: concurrency semantics (corresponds to Plan 11 deepseek fix).

**Reference answer**: (1) Read-modify-write of session state (history/loop windows) must be serialized by sessionId or locked; (2) mutable variables shared across events (such as "the previous raw") can pick up another event's data in the block callback—they must be passed per-event along with the decision (deepseek's dispatch returns `{decision, raw}`); (3) the claim file lock prevents multi-process races; (4) materialization's ordered side effects must follow the effect list order, not event arrival order. Principle: serialize within a session, isolate across sessions, and bind shared mutable state per event.

### Q36. When selling ARCS to a new team, which three metrics would you use to prove its value?

**Key points**: product thinking.

**Reference answer**: (1) **Deviation interception rate and recovery rate**: whether the task continues to completion after L1/L2/L3 trigger (the convergence segment of the offset curve); (2) **failure-cost comparison**: "task failures / manual fixes caused by parameter hallucination" before and after adoption (the share of sessions with degraded=0 as a control); (3) **own overhead**: latencyMs p99 < 50ms, degraded rate (the health of the correction system itself). The three answer respectively "useful, worthwhile, harmless."
