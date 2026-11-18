[中文版](../key-flows.md) · English

# Key Flows

## Main Correction Loop

This embodies "no interruption + timely correction": the target of correction is always the drifting action, not the task itself. `plan` outputs an **ordered effect list**, which the runtime materializes in order, enabling compound corrections such as "block + inject".

```mermaid
flowchart LR
  IN["ExecutionContext"] --> S["DriftSensor.sense"]
  S -->|"DriftSignal[]"| P["CoursePlanner.plan"]
  P --> EFF["SteeringEffect[]<br/>ordered effect list"]
  EFF --> R{"materialize in order"}
  R -->|no drift| PT["PassThrough release"]
  R -->|L1 arg distortion| HP["PatchArgs"]
  R -->|L2 infinite loop| IJ["InjectMessage"]
  R -->|L3 task divergence| RD["RedirectTool + InjectMessage"]
  R -->|L4 high-risk overreach| HS["Suspend → resume after HITL approval"]
  PT --> DONE["continue execution · task uninterrupted"]
  HP --> DONE
  IJ --> DONE
  RD --> DONE
  HS --> DONE
```

## Plugin Runtime Sequence

```mermaid
sequenceDiagram
  participant H as Harness
  participant A as HostAdapter
  participant RT as PluginRuntime
  participant K as core
  participant T as TelemetrySink
  H->>A: lifecycle event (tool call/reasoning)
  A->>A: normalize → ExecutionContext
  A->>RT: run(raw) · Promise
  RT->>K: sense(ctx) / plan(ctx, signals)
  K-->>RT: SteeringEffect[] (ordered effect list)
  alt no drift
    RT-->>A: [PassThrough] → release
  else L1–L3
    RT-->>A: effect list
    A->>A: materialize in order (≤ 5ms)
    A-->>H: continue execution (task uninterrupted)
  else L4 high-risk
    RT-->>A: [Suspend]
    Note over A: go through the HITL suspend-resume flow (see below)
  end
  RT->>T: emit AuditEvent (degraded flag marks downgrade)
```

## Four-Level Correction Strategy

| Drift Level | Typical Scenario (common to SDK and Harness) | Effect Type | Steering Effect (task uninterrupted) |
| :--- | :--- | :--- | :--- |
| **L1 · Argument Distortion** | Malformed tool-call JSON, hallucinated path spelling | `PatchArgs` | Repairs argument fields automatically in milliseconds; the host passes it through unaware and the task keeps advancing. |
| **L2 · Terminal Infinite Loop** | Running the same erroring command three times in a row | `InjectMessage` | Injects a virtual error hint before the repeated execution to guide a change of troubleshooting approach, rather than terminating the task. |
| **L3 · Task Divergence** | Refactoring unrelated directories while fixing a bug | `RedirectTool` + `InjectMessage` | Blocks out-of-bounds writes and injects strong constraint instructions, pulling focus back to the established Goal. |
| **L4 · High-Risk Overreach** | Attempting `rm -rf` or modifying a protected `.env` | `Suspend` | Suspends the single high-risk action and triggers interactive / Webhook approval; it resumes after approval so the task continues safely. |

## HITL Suspend-Resume Flow

L4 is the only "pause" scenario, but what is paused is a single action, not the task: after approval it resumes from the suspension point; on rejection or timeout the action is blocked and an explanation is injected, while the task continues advancing toward the goal.

```mermaid
sequenceDiagram
  participant A as HostAdapter
  participant HL as HitlTransport
  participant H as Harness
  A->>HL: request(Suspend, ctx)
  alt approved
    HL-->>A: { approved: true }
    A->>H: release original action, continue from suspension point
  else rejected
    HL-->>A: { approved: false, timeout: false }
    A->>H: block original action; InjectMessage with rejection reason and reroute hint
  else timeout (default 120s)
    HL-->>A: { approved: false, timeout: true }
    A->>H: same as rejection; warning audit event
  end
  Note over H: task continues toward the established goal, never terminated
```

## Failure Degradation Path (fail-open)

No exception in the detection/planning pipeline itself may interrupt the host task — degrade to pass-through and leave an audit trace:

```mermaid
flowchart TD
  START["event enters pipeline"] --> S1{"sensor healthy?"}
  S1 -->|"partial anomaly"| SKIP["skip faulty sensor<br/>proceed as normal with the rest"]
  S1 -->|healthy| SP["sense + plan"]
  SKIP --> SP
  SP --> OK{"exception / over budget?"}
  OK -->|no| EFF["SteeringEffect[] materialized in order"]
  OK -->|yes| OPEN["PassThrough + degraded = true"]
  EFF --> EMIT["emit AuditEvent"]
  OPEN --> EMIT
  EMIT --> GO["host continues execution · task uninterrupted"]
```

Degradation is layered: a single-sensor anomaly → skip; overall anomaly / over budget → PassThrough + degraded; a materialize anomaly → release the original call + warning. For contract details, see the "Failure Fallback" section in [plugin-kit.md](./plugin-kit.md).
