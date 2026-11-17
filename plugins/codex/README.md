# @chaos-design/arcs-plugin-codex

ARCS Codex 宿主插件。在 `PreToolUse` 前置拦截工具调用，把纠偏决策以 Codex 原生
hook 输出返回；其余 11 个生命周期事件只做透传，不阻塞任务。全程 fail-open：
任何异常都只写 stderr、放行工具调用，退出码保持 0。

## 安装

以本地插件目录方式安装（构建出 `dist/` 后）：

```bash
corepack pnpm --filter @chaos-design/arcs-plugin-codex build
codex --plugin-dir ./plugins/codex
```

插件清单位于 `.codex-plugin/plugin.json`，hooks 位于 `hooks/hooks.json`，
命令形如：

```json
node "${CODEX_PLUGIN_ROOT}/dist/cli.js" --event=PreToolUse
```

环境变量 `CODEX_PLUGIN_ROOT` 由 Codex 在加载插件时注入。

## 配置纠偏目标

ARCS 需要一个目标（goal）来判断 Agent 是否偏航，二选一：

- 环境变量：`export ARCS_GOAL="安全重构，不改公共 API"`
- 命令行参数：`--goal="安全重构，不改公共 API"`

`goalFromArgs` 先解析 `--goal=...` / `--goal ...`，再回退到 `ARCS_GOAL`；
两者都为空时纠偏退化为只做观测。

事件名从 stdin JSON 的 `hook_event_name` / `event` / `eventName` 读取，
`ARCS_EVENT` 为兜底；命令行 `--event=<Name>` 用于宿主侧登记，与 claude-code
插件保持同一形态。

## Hook 输出 JSON schema

仅 `PreToolUse` 输出决策；其它事件输出 `{}`。输出遵循 Codex 官方
`pre-tool-use.command.output` 契约（顶层与 `hookSpecificOutput` 均为
`additionalProperties: false`）：

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

- `hookEventName`：必填，恒为 `PreToolUse`。
- `permissionDecision: "allow"`：放行；配合 `updatedInput` 改写工具实参
  （Bash / apply_patch 的 `updatedInput` 必须带字符串 `command` 字段）。
  对应 ARCS 的 `allow`/`PatchArgs` 决策。
- `permissionDecision: "deny"` + `permissionDecisionReason`：拒绝工具调用。
  对应 ARCS 的 `block` 决策。
- `additionalContext`：把纠偏提示与能力降级说明送回模型上下文，不阻塞工具。

### 宿主 parser 的严格规则（schema 未写明）

官方 schema 虽列出 `permissionDecision: "ask"`，但 `output_parser.rs` 的实际规则更严格：

| 输出形态 | parser 结果 |
|---|---|
| `deny` + 非空 `permissionDecisionReason` | 拒绝工具调用（唯一有效阻断形态） |
| `deny` 但缺少/空 reason | hook 判失败，**放行原调用** |
| `allow` + `updatedInput`（Bash/apply_patch 需含字符串 `command`） | 改写参数 |
| `allow` 但无 `updatedInput` | hook 判失败，放行原调用 |
| `updatedInput` 但无 `allow` | hook 判失败，放行原调用 |
| `ask` | 一律判失败，放行原调用 |

因此本插件：无改写时**不输出孤立的 `allow`**（只输出附加上下文）；所有 `deny` 都带非空 reason；ARCS 内部的 `ask` 与 `block` 统一输出为 `deny`。`pnpm verify:contracts` 会实际调用 `serializeCodex` 并按上述规则逐条断言，防止回归。

### 依据链接

- OpenAI 官方 hooks 文档（PreToolUse 输出字段、deny/allow/ask 语义）：
  <https://developers.openai.com/codex/hooks>
- 生成的 PreToolUse 输出 JSON Schema（字段白名单与 `hookEventName` 必填）：
  <https://github.com/openai/codex/blob/main/codex-rs/hooks/schema/generated/pre-tool-use.command.output.schema.json>
- `parse_pre_tool_use` 解析实现（ask 被判 unsupported、updatedInput 仅在 allow 时提取）：
  <https://github.com/openai/codex/blob/main/codex-rs/hooks/src/engine/output_parser.rs>

> 注：schema 的 `main` 分支可能领先于当前发布版本；若需精确 wire format，
> 以官方文档的 release 行为为准，并在真实宿主上验证后再调整。

## 能力边界（Tier A，取自 host-kit `capabilitiesFor('codex')`）

| 能力 | 值 | 说明 |
| --- | --- | --- |
| `patchArgs` | true | PreToolUse `updatedInput` 可改写工具参数（L1） |
| `redirectTool` | false | 工具名不可替换，L3 降级为上下文注入 |
| `injectMessage` | true | `additionalContext` 可回送纠偏提示（L2/L3） |
| `suspend` | false | Codex 不支持 `ask`，L4 由 `host-kit` 直接降级为 `block` → 输出 `deny` |
| `block` | true | `permissionDecision: "deny"` 可拒绝单个调用 |

所有能力布尔值均来自 `capabilitiesFor('codex')`，插件内不硬编码。
能力不足时按 host-kit 的降级规则 fail-open，并在 `additionalContext` 中留审计痕迹。
