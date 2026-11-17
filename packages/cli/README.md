# @chaos-design/arcs-cli

ARCS 统一命令行：一条命令发现并快速启动各宿主插件服务。

## 用法

```bash
# 列出全部插件（名称 / 宿主 / 启动方式 / 能力）
npx @chaos-design/arcs-cli list

# 启动 MCP 常驻 stdio 代理（-- 之后的参数原样转发给插件）
npx @chaos-design/arcs-cli start mcp -- \
  --goal "仅修复前端样式，禁止改后端 API" \
  --target "npx -y @modelcontextprotocol/server-filesystem ./src"

# 只打印将要执行的命令，不真正启动
npx @chaos-design/arcs-cli start mcp --dry-run -- --goal "..." --target "..."

# Hook / 扩展型插件由宿主加载，CLI 给出启用方式
npx @chaos-design/arcs-cli start claude-code
```

也可全局安装后用短命令 `arcs`：

```bash
pnpm add -g @chaos-design/arcs-cli
arcs list
```

## 启动方式

- **service**：`mcp` 是唯一有独立常驻服务的插件，`start` 会拉起其 stdio 代理子进程，透传 `--` 后的全部参数。
- **host-managed**：其余 Hook / 全局扩展型插件无独立进程，`start` 打印宿主启用命令与能力摘要。

CLI 只负责"发现 + 拉起"，不重复各插件的能力声明；细节见 `docs/plugins.md`。
