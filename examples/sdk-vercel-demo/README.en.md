[中文版](./README.md) · English

# sdk-vercel-demo

End-to-end demo of `arcs-sdk-vercel` (`withArcs`): a mock model (no API Key required) plus two steering levels.

- **A. L1 argument patching**: the model hallucinates a `pathh` key name; ARCS hot-fixes it to `path` per `toolSchemas` and then allows the call through.
- **B. L2 circuit breaking**: on the 3rd consecutive call of the same tool, it is replaced with dummy error text (`InjectMessage`), and `finishReason` is changed to `stop`.

## Running

```bash
# Repository root
corepack pnpm install
corepack pnpm build          # produces sdk/vercel/dist
node examples/sdk-vercel-demo/demo.mjs
```

The expected output contains two `onSteer` events: `L1 (PatchArgs)` and `L2 (InjectMessage)`.

The field contract is documented in `docs/en/sdk.md` (`SteerEvent`) and [sdk/vercel](../../sdk/vercel).
