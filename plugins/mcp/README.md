[English](./README.en.md) · 中文

# @chaos-design/arcs-plugin-mcp

ARCS MCP 透明代理网关。在 MCP 宿主与下游 Server 之间以 STDIO 行分隔 JSON-RPC
做透明代理：`initialize` / `tools/list` 直达下游，`tools/call` 先经 ARCS 纠偏
再落地。它是 9 个插件里唯一的常驻服务、唯一能真正改写工具名（L3）的插件——
Hook 型宿主的前置 Hook 只能改同一工具的参数，改不了 `tools/call.name`。

## 工作原理

```text
MCP 宿主 stdin ──→ [arcs-plugin-mcp：拦截 tools/call → sense/plan → 决策落地] ──→ 下游 MCP Server
MCP 宿主 stdout ←── [合成响应（虚拟报错/阻断提示）或转发下游响应] ←──────────┘
```

- 请求方向按**串行队列**逐条处理，保证与宿主请求顺序一致。
- 非 `tools/call` 请求（`initialize`、`tools/list` 等）原样透传。
- 任何异常 fail-open：放行原调用，绝不因纠偏系统自身故障中断任务。

## 命令行参数

```bash
npx @chaos-design/arcs-plugin-mcp \
  --goal "仅修复前端样式 Bug，禁止修改后端 API 路由" \
  --target "npx -y @modelcontextprotocol/server-filesystem ./src" \
  [--drift-threshold 0.75] \
  [--max-consecutive-loops 2] \
  [--protected-paths ".env*,**/migrations/**"]
```

| 参数 | 说明 |
| --- | --- |
| `--goal` | 既定目标（必填），判断偏航的依据；也可用环境变量 `ARCS_GOAL` |
| `--target` | 下游 MCP Server 启动命令（必填）；路径含空格时用内层引号包裹，如 `--target 'node "/path with space/server.mjs"'`（引号感知切分） |
| `--drift-threshold` | 偏航阈值，默认取 plugin-kit 配置 |
| `--max-consecutive-loops` | 连续重复调用上限，超出触发纠偏 |
| `--protected-paths` | 逗号分隔的 glob 保护路径，命中即 L4 |

## 纠偏语义（STDIO 落地形态）

| 效果 | 代理落地动作 |
|---|---|
| `PassThrough` | 原样转发下游 |
| `PatchArgs`（L1） | 改写 `arguments` 后转发（patch 为修复后的完整参数） |
| `RedirectTool`（L3） | 改写 `tools/call` 目标工具后转发（原调用被阻断） |
| `InjectMessage`（L2） | 不转发下游，合成 `isError: true` 工具结果（虚拟报错） |
| `Suspend`（L4） | 不转发下游，合成阻断提示结果（拒绝语义；STDIO 通道无审批出口） |

决策规则：一次调用的效果列表中若存在转发（含改道），以最后一个转发为准——L3
的注入在改道后没有结果通道，跳过；否则取最后一个合成响应。

## 编程接入

除 CLI 外，可直接使用导出的代理类做进程内集成：

```ts
import { McpProxy, decideProxyAction } from '@chaos-design/arcs-plugin-mcp';
```

- `McpProxy` — 透明代理主体（宿主 stdin/stdout ↔ 下游子进程，串行拦截）
- `decideProxyAction` — 效果列表 → 落地动作的纯函数决策

## 审计

经 host-kit 的 `createAuditSink` 落盘：设置 `ARCS_HOME` 或 `ARCS_AUDIT_FILE` 后，
纠偏事件追加到 `<home>/audit/mcp/<YYYY-MM-DD>.jsonl`；未设置时不落盘、行为不变。

## 测试与验证

- `plugins/mcp/src/mcp.test.ts` — 决策与代理逻辑单测（内存 Sink + Mock HITL）
- `plugins/mcp/src/e2e.test.ts` — 真实进程 e2e：透传、L1 补参热修复、L2 连续调用
  虚拟报错、L4 阻断、非法 JSON 行回 `-32700` Parse error（不静默丢弃）、审计可观测
- 三进程实战示例：[examples/plugin-mcp-demo](../../examples/plugin-mcp-demo)

## 相关文档

- 总体插件矩阵与接入拓扑：[docs/plugins.md](../../docs/plugins.md)
- MCP 代理落地语义：[docs/plugins.md](../../docs/plugins.md) 的「MCP 代理落地语义」一节
- 统一 CLI 快速启动：`npx @chaos-design/arcs-cli start mcp -- --goal "..." --target "..."`
