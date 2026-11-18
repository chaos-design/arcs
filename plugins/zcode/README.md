[English](./README.en.md) · 中文

# @chaos-design/arcs-plugin-zcode

ARCS ZCode 宿主插件。ZCode 上游兼容 Claude Code 插件形态（复用
`${CLAUDE_PLUGIN_ROOT}`），只开放 7 个 hook 事件。插件在 `PreToolUse` 前置拦截
工具调用，以宿主可识别的 `permissionDecision` 结构返回纠偏决策；其余事件只做透传。
全程 fail-open：任何异常都只写 stderr、放行工具调用，退出码保持 0。

## 安装

以本地插件目录方式安装（构建出 `dist/` 后）：

```bash
corepack pnpm --filter @chaos-design/arcs-plugin-zcode build
# 通过本地 marketplace 或插件目录加载 ./plugins/zcode
```

- 插件清单：`.zcode-plugin/plugin.json`
- marketplace 清单：`marketplace.json`（name / owner / plugins）
- hooks：`hooks/hooks.json`，命令形如：

```json
node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" --event=PreToolUse
```

`CLAUDE_PLUGIN_ROOT` 由宿主在加载插件时注入（与 Claude Code 插件一致）。

恰好注册 7 个事件：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、
`PermissionRequest`、`PostToolUse`、`PostToolUseFailure`、`Stop`。

## 配置纠偏目标

与 claude-code 插件一致，二选一：

- 环境变量：`export ARCS_GOAL="安全重构，不改公共 API"`
- 命令行参数：`--goal="安全重构，不改公共 API"`

`goalFromArgs` 先解析 `--goal=...` / `--goal ...`，再回退到 `ARCS_GOAL`。

## 字段别名

ZCode 载荷与 ARCS `NativeEvent` 的映射：

| ZCode 字段 | ARCS 字段 |
| --- | --- |
| `toolCallId` | `toolUseId` |
| `toolInput` | `toolArgs` |
| `toolResponse` | `payload` |
| `responseText`（Stop 事件） | `thought` |

同时兼容 Claude Code 风格的 `tool_use_id` / `tool_input` / `input` / `args`、
`hook_event_name` 等字段。

## Hook 输出 JSON schema

仅 `PreToolUse` 输出决策；其它事件输出 `{}`。采用宿主可识别的
Claude Code 兼容拒绝结构：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow | deny",
    "permissionDecisionReason": "...",
    "updatedInput": { "command": "..." },
    "additionalContext": "..."
  }
}
```

- `permissionDecision: "deny"` + `permissionDecisionReason`：拒绝当前工具调用。
  这是 Tier B 下 `block` 决策的落地形态；ARCS 的 `ask`（需人工审批）在 ZCode 上
  也被保守映射为 `deny`，避免高危命令被放行。
- `permissionDecision: "allow"`：放行；`updatedInput` 仅理论上用于改参，但
  ZCode 不提供稳定改参通道，因此实际由 host-kit 降级为上下文注入。
- `additionalContext`：把纠偏提示与能力降级（如 `suspend→block`）回送模型上下文，
  不阻塞任务。

## 能力边界（Tier B，取自 host-kit `capabilitiesFor('zcode')`）

| 能力 | 值 | 说明 |
| --- | --- | --- |
| `patchArgs` | false | 无稳定改参通道，L1 降级为 `additionalContext` 注入 |
| `redirectTool` | false | 工具名不可替换，L3 降级为注入 |
| `injectMessage` | true | `additionalContext` 可回送纠偏提示（L2/L3） |
| `suspend` | false | 无审批回调通道，L4 的 `ask` 降级为 `block` |
| `block` | true | `permissionDecision: "deny"` 可拒绝单个调用 |

危险命令端到端会产出 **block** 决策（不是 ask），并在 `degraded` 中留
`suspend→block` 审计痕迹。所有能力布尔值均来自 `capabilitiesFor('zcode')`，
插件内不硬编码；能力不足时按 host-kit 规则 fail-open 并在 `additionalContext`
留痕。

> 注：本机无真实 ZCode CLI，输出契约来自上游 Claude Code 兼容形态与 astro 取证，
> 属"待真实宿主验证"，建议在真实宿主上核对 `permissionDecision` 字段名后再上线。
