[English](./README.en.md) · 中文

# @chaos-design/arcs-plugin-workbuddy

ARCS（Agent Real-time Course Steering）的 WorkBuddy 宿主插件。以 WorkBuddy 原生插件形态接入，在工具执行前对 Agent 做实时纠偏，任务全程不中断（fail-open）。

WorkBuddy 共暴露 25 个 hook 事件，本插件全部挂载；其中只有 `PreToolUse` 是前置决策点，会在工具执行前运行纠偏引擎，其余事件仅透传放行以维持审计链路完整。

## 能力边界（Tier B）

能力来自 `host-kit` 的 `capabilitiesFor('workbuddy')`，插件内无硬编码。

| 能力 | 支持 | 说明 |
| --- | --- | --- |
| `patchArgs` 改参 | ✗ | WorkBuddy 无改参通道，L1 降级为注入提示 |
| `redirectTool` 改道 | ✗ | 工具名不可替换，L3 降级为注入提示 |
| `injectMessage` 注入 | ✓ | 通过 `additionalContext` 把纠偏提示送回上下文 |
| `suspend` 挂起审批 | ✗ | hook 有超时，无法同步等待人工审批 |
| `block` 拒绝 | ✓ | 可拒绝单个动作；L4 由 `suspend` 降级为 `block` |

危险命令（如 `rm -rf /`）端到端产出 **`block`**，并在 `degraded` 中记录 `suspend→block`，不挂起、不中断整个任务。

## 安装

```bash
# 在 monorepo 根构建本插件
corepack pnpm --filter @chaos-design/arcs-plugin-workbuddy build

# 以本地插件目录方式安装到 WorkBuddy
# 插件根目录即本目录（含 .codebuddy-plugin/plugin.json 与 hooks/hooks.json）
```

安装后 WorkBuddy 会读取 `.codebuddy-plugin/plugin.json`，并按 `hooks/hooks.json` 注册 25 个命令钩子。

## 配置

纠偏目标通过 hook 命令的 `--goal=<文本>` 传入，或读取环境变量 `ARCS_GOAL`。示例：

```bash
node "${CODEBUDDY_PLUGIN_ROOT}/dist/cli.js" --event=PreToolUse --goal="安全重构，禁止破坏性命令"
```

会话上下文取自宿主环境变量：

- `CODEBUDDY_SESSION_ID`：会话 ID（缺失时为 `unknown-session`）
- `CODEBUDDY_PROJECT_DIR`：项目目录，写入事件的 `payload.projectDir`

### 事件名传递（关键）

WorkBuddy **不会**把事件名放进 stdin payload。每个 hook 命令必须显式携带 `--event=<Name>`：

```jsonc
"PreToolUse": [{
  "matcher": "*",
  "hooks": [{ "type": "command", "command": "node \"${CODEBUDDY_PLUGIN_ROOT}/dist/cli.js\" --event=PreToolUse" }]
}]
```

`src/cli.ts` 从 argv 解析 `--event=`，经 `withWorkbuddyEvent` 注入到 `parse` 闭包的 env（`ARCS_EVENT`），再交给 host-kit 的 `runHookEntry`。该机制完全在插件内完成，不改动 host-kit。

### 25 个事件

`SessionStart`、`SessionEnd`、`UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PermissionDenied`、`PostToolUse`、`PostToolUseFailure`、`Notification`、`SubagentStart`、`SubagentStop`、`TaskCreated`、`TaskCompleted`、`Stop`、`StopFailure`、`TeamMessageIdle`、`InstructionsLoaded`、`ConfigChange`、`CwdChanged`、`WorktreeCreate`、`WorktreeRemove`、`PreCompact`、`PostCompact`、`Elicitation`、`ElicitationResult`。

## Hook 输出 schema

`PreToolUse` 的决策序列化为：

```jsonc
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny",
    "permissionDecisionReason": "<可选，决策原因；deny 时必填>",
    "modifiedInput": { "<字段>": "<替换值>" },
    "additionalContext": "<可选，注入提示 + 能力降级说明，多行以 \n 分隔>"
  }
}
```

字段依据 CodeBuddy/WorkBuddy 官方 `HookOutput` 契约：决策字段为 `hookSpecificOutput.permissionDecision`（非 `decision`），顶层 `continue` 控制是否继续，改参字段是 `modifiedInput`（局部覆盖，非 `updatedInput`）。ARCS 的 `block`/`ask` 统一映射为 `deny` 并附带非空原因。非 `PreToolUse` 事件输出 `{}`。任何解析/运行异常均 fail-open：输出放行决策，错误只写 stderr，退出码保持 0。

## 测试

```bash
corepack pnpm exec vitest run plugins/workbuddy/src --reporter=basic
```

覆盖 parse、非法 JSON 兜底、shouldSteer、serialize 三态、能力边界与端到端 `block` 路径。
