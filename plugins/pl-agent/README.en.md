# ARCS PL Agent Plugin

Real-time course steering (ARCS) before tool execution via generic hooks, without interrupting the task.

- Events: 13 Claude-compatible hooks; the event name is injected via `--event`.
- Capabilities: Tier B — `additionalContext` injection (L2/L3) and `deny` blocking (L4).
- Degradation: no arg-patching or suspend channel; PatchArgs/Suspend fail open with audit traces.
- Note: the contract follows a generic hook shape; real host versions require integrator verification via `pnpm real-check`.

```bash
export ARCS_GOAL="Only change frontend styles; do not touch backend APIs"
# Load this package as a host plugin directory (npm: @chaos-design/arcs-plugin-pl-agent)
```
