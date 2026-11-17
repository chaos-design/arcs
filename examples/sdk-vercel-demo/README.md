# sdk-vercel-demo

`arcs-sdk-vercel`（`withArcs`）端到端演示：mock 模型（无需 API Key）+ 两个纠偏等级。

- **A. L1 补参**：模型幻觉出 `pathh` 键名，ARCS 依 `toolSchemas` 热修复为 `path` 后放行。
- **B. L2 熔断**：同一工具调用连续第 3 次，被替换为虚拟报错文本（`InjectMessage`），`finishReason` 改为 `stop`。

## 运行

```bash
# 仓库根目录
corepack pnpm install
corepack pnpm build          # 产出 sdk/vercel/dist
node examples/sdk-vercel-demo/demo.mjs
```

预期输出包含两条 `onSteer` 事件：`L1（PatchArgs）` 与 `L2（InjectMessage）`。

字段契约见 `docs/sdk.md`（`SteerEvent`）与 [sdk/vercel](../../sdk/vercel)。
