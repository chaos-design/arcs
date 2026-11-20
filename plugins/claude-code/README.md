[English](./README.en.md) · 中文

# @chaos-design/arcs-plugin-claude-code

ARCS Claude Code 宿主插件。登记 Claude Code 全部 17 个生命周期事件，在 `PreToolUse`
前置拦截工具调用，把纠偏决策以 Claude Code 原生 `hookSpecificOutput` 返回；其余
16 个事件只做透传，不阻塞任务。全程 fail-open：任何异常都只写 stderr、放行工具
调用，退出码保持 0。

## 安装

以本地插件目录方式安装（构建出 `dist/` 后）：

```bash
corepack pnpm --filter @chaos-design/arcs-plugin-claude-code build
claude --plugin-dir /abs/path/to/arcs/plugins/claude-code
```

插件清单位于 `.claude-plugin/plugin.json`，hooks 位于 `hooks/hooks.json`（17 个
事件，`PreToolUse` 带 `matcher: "*"`），命令形如：

```json
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" --event=PreToolUse
```

环境变量 `CLAUDE_PLUGIN_ROOT` 由 Claude Code 在加载插件时注入。

## 配置纠偏目标

ARCS 需要一个目标（goal）来判断 Agent 是否偏航，二选一：

- 环境变量：`export ARCS_GOAL="安全重构，不改公共 API"`
- 命令行参数：在 hooks.json 的命令后追加 `--goal="安全重构，不改公共 API"`

`goalFromArgs` 先解析 `--goal=...` / `--goal ...`，再回退到 `ARCS_GOAL`；
两者都为空时纠偏退化为只做观测。

事件名从 stdin JSON 的 `hook_event_name` / `event` / `eventName` 读取，
`ARCS_EVENT` 为兜底；命令行 `--event=<Name>` 用于宿主侧登记，与 codex
插件保持同一形态。

## Hook 输出 JSON schema

仅 `PreToolUse` 输出决策；其它事件输出 `{}`。输出遵循 Claude Code 官方
PreToolUse 契约（`permissionDecision` 与 `additionalContext` 均在
`hookSpecificOutput` 内）：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow | deny | ask",
    "permissionDecisionReason": "...",
    "updatedInput": { "command": "..." },
    "additionalContext": "..."
  }
}
```

- `permissionDecision: "allow"` + `updatedInput`：放行并改写工具实参（L1）。
  对应 ARCS 的 `allow` / `PatchArgs` 决策。
- `permissionDecision: "deny"` + `permissionDecisionReason`：拒绝工具调用（L4）。
  ARCS 内部的 `block` 决策统一映射为 `deny`；缺省 reason 时补「ARCS 策略阻断了该操作」。
- `permissionDecision: "ask"`：挂起审批，转交宿主自身的权限确认流（L4 HITL 通道）。
  Claude Code 是少数支持 `ask` 语义的宿主之一。
- `additionalContext`：把纠偏提示与能力降级说明送回模型上下文，不阻塞工具（L2/L3）。

## 能力边界（Tier A，取自 host-kit `capabilitiesFor('claude-code')`）

| 能力 | 值 | 说明 |
| --- | --- | --- |
| `patchArgs` | true | PreToolUse `updatedInput` 可改写工具参数（L1） |
| `redirectTool` | false | 工具名不可替换，L3 降级为上下文注入 |
| `injectMessage` | true | `additionalContext` 可回送纠偏提示（L2/L3） |
| `suspend` | true | `permissionDecision: "ask"` 可转交宿主审批（L4 HITL） |
| `block` | true | `permissionDecision: "deny"` 可拒绝单个调用 |

所有能力布尔值均来自 `capabilitiesFor('claude-code')`，插件内不硬编码。
能力不足时按 host-kit 的降级规则 fail-open，并在 `additionalContext` 中留审计痕迹。

## 审计

设置 `ARCS_HOME` 或 `ARCS_AUDIT_FILE` 后，纠偏事件会追加到
`<home>/audit/claude-code/<YYYY-MM-DD>.jsonl`；未设置时不落盘、行为不变。
验证步骤见 `pnpm real-check`（仓库根 README）。

## 相关文档

- 总体插件矩阵与接入拓扑：[docs/plugins.md](../../docs/plugins.md)
- 共用运行时与能力矩阵：[docs/host-kit.md](../../docs/host-kit.md)
