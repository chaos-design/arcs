[中文版](../sdk.md) · English

# SDK Code-Level Integration `sdk/*`

The SDK targets custom-built Agent applications and uses a standalone `sdk/xxx` folder layout. It wraps core's detection and decision-making into framework-native pluggable components, depending directly on core and bypassing the glue layer.

## Interception Point

The SDK performs in-process synchronous interception between `LLM Thought → Tool Execution` in the framework's inference loop, equivalent to hooking core's `sense → plan` into the call chain:

```mermaid
sequenceDiagram
  participant App as generateText inference loop
  participant W as withArcs Wrapper
  participant K as core
  App->>W: LLM Thought (with tool-call intent)
  W->>K: sense / plan (in-process synchronous, ≤ 50ms)
  K-->>W: SteeringEffect[] (ordered effect list)
  alt PassThrough
    W->>App: pass through unchanged → Tool Execution
  else L1–L3 steering
    W->>App: PatchArgs modify args / InjectMessage injection / RedirectTool redirect then allow
  else L4 high risk
    W->>W: Suspend → in-framework HITL callback (e.g. confirm UI / webhook)
    W->>App: approved → allow; rejected/timed out → block and inject explanation
  end
  W->>W: onSteer(SteerEvent)
```

## Responsibilities

- Provide framework-native integration components such as Middleware / Model Wrapper / Node / Callback
- Non-invasively capture an execution snapshot between `LLM Thought → Tool Execution` (`withArcs`)
- Translate core's ordered `SteeringEffect` list into in-framework control flow (continue, modify arguments, inject messages)
- Expose steering observability to the host application via `SteerEvent`

## SteerEvent Contract

The `onSteer` callback receives a structured event, not a string log:

```typescript
interface SteerEvent {
  level: 1 | 2 | 3 | 4;         // triggered steering level
  effects: SteeringEffect[];    // ordered effect list actually materialized
  signals: DriftSignal[];       // triggering signals
  latencyMs: number;            // time spent in sense + plan
  reason: string;               // human-readable reason for the intervention
}
```

## Boundaries (Division of Labor with plugins)

| Dimension | SDK (`sdk/*`) | Plugins (`plugins/*`) |
|---|---|---|
| Runtime environment | In-process | Out-of-process host |
| Dependency path | Depends directly on core | Depends on core via plugin-kit |
| Integration form | Middleware / Wrapper / Node | Lifecycle Hook / STDIO+SSE proxy |
| Lifecycle takeover | None | Can take over host Hooks |
| Traffic proxying | None | MCP plugins proxy protocol traffic |
| Type constraints | Strongly typed, synchronously composable | Event-driven, protocol-coupled |

**Boundary red line**: `sdk/*` must not implement lifecycle Hooks or traffic proxying, so as to avoid overlapping with plugin responsibilities.

## Directory

```text
sdk/
├── vercel/      # @chaos-design/arcs-sdk-vercel — withArcs model wrapper (LanguageModelV4)
└── langchain/   # @chaos-design/arcs-sdk-langchain — createArcsNode (LangGraph-compatible node, zero framework dependencies)
```

## Usage Example

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { withArcs } from '@chaos-design/arcs-sdk-vercel';

const steeredModel = withArcs(openai('gpt-4o'), {
  goal: 'Refactor the authentication logic under src/auth; do not modify database migration files',
  policy: {
    driftThreshold: 0.75,
    maxConsecutiveLoops: 2,
    enablePatchArgs: true,     // enable automatic hot-fixing of tool arguments (L1)
  },
  onSteer: (event: SteerEvent) => {
    console.warn(
      `[ARCS steering intervention] L${event.level} | ${event.reason} | effects: ${event.effects.map(e => e.type).join(' → ')}`
    );
  },
  hitl: async ({ toolName, reason }) => confirm(`Allow ${toolName}? ${reason}`), // L4 in-process approval
});

const { text } = await generateText({
  model: steeredModel,
  tools: myCodingTools,
  prompt: 'Start refactoring the authentication module',
});
```

### LangGraph Node Usage (sdk/langchain)

```typescript
import { createArcsNode } from '@chaos-design/arcs-sdk-langchain';

graph.addNode('arcs', createArcsNode({ goal: 'Only fix front-end styling bugs' }));
// node input: { goal, thought, toolCall, history }; output: { toolCall (rewritten/null), inject?, steer? }
```

### Known Scope Cuts (v1)

- `withArcs` intercepts `doGenerate` (generateText / Agent loops); `doStream` **passes through without steering** — the `streamText` scenario will be covered in a future version.
- In the SDK context, `InjectMessage` is translated as "tool-call → text replacement": there is no message-injection channel inside the framework, so blocking hints are presented as model output.
- langchain's `createArcsNode` is a zero-dependency structural implementation (a LangGraph node is just a plain function); the `CallbackHandler` form is to be added later.
