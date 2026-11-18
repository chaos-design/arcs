# @chaos-design/arcs-plugin-trae

ARCS（Agent Real-time Course Steering）的 Trae 宿主插件。以 Trae 项目级 hook 形态接入，对 13 个事件做采集与审计。

> **重要：Trae 仅做采集与审计，无法阻断任务。**
> Trae 是 Tier C 只读平台：hook 输出不能拒绝动作、不能改写参数、不能挂起审批。任何纠偏建议都只能作为附加上下文呈现，任务始终 fail-open 继续运行。

## 能力边界（Tier C）

能力来自 `host-kit` 的 `capabilitiesFor('trae')`，插件内无硬编码。

| 能力 | 支持 | 说明 |
| --- | --- | --- |
| `patchArgs` 改参 | ✗ | 无改参通道 |
| `redirectTool` 改道 | ✗ | 工具名不可替换 |
| `injectMessage` 注入 | ✓ | 仅在宿主允许 hook 输出追加上下文时，通过 `additionalContext` 生效 |
| `suspend` 挂起审批 | ✗ | 无审批回调通道 |
| `block` 拒绝 | ✗ | 无法阻断 |

危险命令（如 `rm -rf /`）端到端产出 **`allow`**（fail-open 不阻断），`degraded` 记录 `suspend→allow`，并在 `injected` 中写入「该动作需要人工审批但宿主不支持挂起、已放行」的说明。这里没有"拦截"语义——只留下审计痕迹与提示。

## 安装

Trae 使用项目级 hooks，无插件 manifest。先在本地（或项目内）安装本包，因为 hook 命令用 `npx --no-install` 直接调用，不会联网拉取：

```bash
# 在 monorepo 根构建并把包链接/安装到项目依赖
corepack pnpm --filter @chaos-design/arcs-plugin-trae build
corepack pnpm add -D @chaos-design/arcs-plugin-trae   # 或在 workspace 内 link

# 确认可执行
npx --no-install arcs-plugin-trae --help
```

然后把 `hooks/hooks.json` 注册到 Trae 项目的 hook 配置（项目级），各事件命令形如：

```bash
npx --no-install arcs-plugin-trae --event=PreToolUse
```

## 配置

纠偏目标通过 `--goal=<文本>` 传入，或读取环境变量 `ARCS_GOAL`：

```bash
npx --no-install arcs-plugin-trae --event=PreToolUse --goal="安全重构，禁止破坏性命令"
```

事件名由 `--event=<Name>` 显式传入，`src/cli.ts` 从 argv 解析后经 `withTraeEvent` 注入到 parse 闭包的 env（`ARCS_EVENT`）；同时也兼容事件名出现在 stdin payload 的情况。

### 13 个事件

`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`、`StopFailure`、`Interrupt`、`SessionPend`、`Notification`、`PermissionRequest`、`PermissionDenied`、`Elicitation`、`ElicitationResult`。

## Hook 输出 schema

`PreToolUse` 的输出固定为放行：

```jsonc
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "additionalContext": "<可选，注入提示 + 能力降级说明，多行以 \n 分隔>"
  }
}
```

字段依据 Trae 官方 Hook 参考：PreToolUse 的 `permissionDecision` 与 `additionalContext` 都在 `hookSpecificOutput` 内。即使决策引擎产出 `block` 或 `ask`，本插件仍序列化为 `allow`——这是 Tier C 的 fail-open 契约。非 `PreToolUse` 事件输出 `{}`。任何解析/运行异常同样 fail-open：输出放行、错误只写 stderr、退出码保持 0。

## 测试

```bash
corepack pnpm exec vitest run plugins/trae/src --reporter=basic
```

覆盖 parse、非法 JSON 兜底、shouldSteer、serialize 三态（均放行）、能力边界与端到端 `allow` 降级路径。
