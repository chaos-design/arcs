# ARCS Qwen Code CLI Plugin

Real-time course steering (ARCS) before tool execution via Gemini-compatible hooks, without interrupting the task.

- Events: 13 Claude-compatible hooks; the event name is injected via `--event`.
- Capabilities: Tier B — `additionalContext` injection (L2/L3) and `deny` blocking (L4).
- Degradation: the arg-patching contract is unverified, so nothing is written back; Suspend downgrades to `deny` with an audit trace.
- Note: real host versions require integrator verification via `pnpm real-check`.

```bash
export ARCS_GOAL="Only change frontend styles; do not touch backend APIs"
# Load this package as a host plugin directory (npm: @chaos-design/arcs-plugin-qwen-code)
```
