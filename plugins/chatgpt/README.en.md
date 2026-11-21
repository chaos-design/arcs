# ARCS ChatGPT / Codex-Compatible Plugin

Real-time course steering (ARCS) before tool execution via native hooks, without interrupting the task.

- Events: 13 Claude-compatible hooks; the event name is injected via `--event`.
- Capabilities: Tier A — `updatedInput` argument patching (L1), `additionalContext` injection (L2/L3), `deny` blocking (L4).
- Degradation: `ask` is downgraded to a reasoned `deny` because this contract has no suspend channel; tool names cannot be rewritten, so L3 degrades to injection.
- Note: the contract follows the Codex-compatible shape; real host versions require integrator verification via `pnpm real-check`.

```bash
export ARCS_GOAL="Only change frontend styles; do not touch backend APIs"
# Load this package as a host plugin directory (npm: @chaos-design/arcs-plugin-chatgpt)
```
