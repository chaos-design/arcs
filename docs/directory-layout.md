[English](./en/directory-layout.md) · 中文

# 目录规划

仓库基于 `pnpm workspace` + `Turborepo` 构建，所有包统一发布在 `@chaos-design` 命名空间下。

```text
arcs/
├── packages/
│   ├── core/                  # 基础内核：纯检测/决策，零宿主依赖
│   ├── plugin-kit/            # 插件胶水层：HostAdapter 契约 + 运行时 + 桥接
│   ├── host-kit/              # 宿主插件共用运行时：能力矩阵 + Hook 入口桥 + 效果翻译
│   ├── cli/                   # @chaos-design/arcs-cli：统一命令行（发现 + 快速启动插件服务）
│   └── telemetry/             # AuditEvent 模型 / TelemetrySink 契约 / 偏移曲线
├── sdk/                       # 代码级接入（sdk/xxx 形式，进程内）
│   ├── vercel/                # @chaos-design/arcs-sdk-vercel
│   └── langchain/             # @chaos-design/arcs-sdk-langchain
├── plugins/                   # 宿主插件（11 个 Agent 平台 + MCP 网关）
│   ├── claude-code/           # @chaos-design/arcs-plugin-claude-code
│   ├── codex/                 # @chaos-design/arcs-plugin-codex
│   ├── opencode/              # @chaos-design/arcs-plugin-opencode
│   ├── pi/                    # @chaos-design/arcs-plugin-pi
│   ├── deepseek/              # @chaos-design/arcs-plugin-deepseek
│   ├── workbuddy/             # @chaos-design/arcs-plugin-workbuddy
│   ├── zcode/                 # @chaos-design/arcs-plugin-zcode
│   ├── trae/                  # @chaos-design/arcs-plugin-trae
│   ├── chatgpt/               # @chaos-design/arcs-plugin-chatgpt
│   ├── pl-agent/              # @chaos-design/arcs-plugin-pl-agent
│   ├── qwen-code/             # @chaos-design/arcs-plugin-qwen-code
│   └── mcp/                   # @chaos-design/arcs-plugin-mcp（常驻透明代理网关，唯一可改工具名）
├── examples/
│   ├── sdk-vercel-demo/       # Vercel AI SDK 集成示例（mock 模型，L1/L2）
│   └── plugin-mcp-demo/       # MCP 透明代理三进程实战示例（透传/L2/L4/审计落盘）
├── site/                      # Vite + React 文档站点（构建时内嵌 docs/*.md，零运行时 fetch；含中英切换）
│   └── src/                   # 路由 / i18n / markdown 渲染（含 mermaid 单 chunk）
├── docs/                      # 架构与设计文档（en/ 为英文对照版，与中文一一对应）
│   ├── README.md
│   ├── architecture.md
│   ├── directory-layout.md
│   ├── core.md
│   ├── plugin-kit.md
│   ├── host-kit.md
│   ├── telemetry.md
│   ├── sdk.md
│   ├── plugins.md
│   ├── key-flows.md
│   ├── testing.md
│   ├── extension-points.md
│   ├── constraints.md
│   ├── roadmap.md
│   └── interview.md
├── scripts/                   # 零依赖守护脚本：scan-deps / verify-host-contracts / install-plugins / offset-dashboard（pnpm dashboard）
├── plans/                     # plan-flow 计划（状态与优先级契约见 plans/README.md）
├── LICENSE                    # Apache 2.0
├── turbo.json
└── pnpm-workspace.yaml
```

## 目录职责速览

| 目录 | 职责 | 边界 |
|---|---|---|
| `packages/core` | 执行上下文建模、偏航检测、航向规划、决策生成 | 零宿主依赖、零 I/O |
| `packages/plugin-kit` | HostAdapter 契约、运行时编排、配置/HITL/遥测桥接 | 不 import 宿主 SDK |
| `packages/telemetry` | 偏移曲线与纠偏审计的数据模型及接收端 | 不参与决策 |
| `sdk/*` | 框架原生 Middleware / Model Wrapper | 进程内，不接管宿主生命周期 |
| `plugins/*` | 单一宿主的 HostAdapter 实现 | 只面向 plugin-kit 编程 |

> SDK 采用 `sdk/xxx` 独立文件夹形式；其职责与边界详见 [sdk.md](./sdk.md)。
