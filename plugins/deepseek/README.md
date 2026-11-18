# @chaos-design/arcs-plugin-deepseek

ARCS 纠偏能力以 DeepSeek Harness 的 Cordis bundle 形态落地。插件通过 `ctx.on` 订阅会话生命周期与原生事件，把 Harness 事件归一为 ARCS 规范事件，交由 `host-kit` 的唯一运行时做决策，再按平台能力把纠偏效果翻译为宿主决策。全程 fail-open，任何异常都不中断 Agent 任务。

## 安装

通过仓库的插件安装脚本，将本插件加入 DeepSeek 客户端的 bundle：

```bash
pnpm install-plugins -- --clients=deepseek
```

安装脚本会把 `plugins/deepseek` 作为 bundle 注入，并应用包清单中的 `dsh.bundle.patch`（`cordis.patch.yml`）向 DeepSeek 配置插入 `arcs-steering` 段：

```yaml
- insert:
    - id: arcs-steering
      name: arcs-plugin-deepseek
```

> 该 patch 由 `package.json` 的 `dsh.bundle.patch` 字段声明，无需手工编辑宿主配置。

## 事件映射

Harness 原生事件 → ARCS 规范事件（`host-kit` 跨平台审计语义）：

| Harness 原生事件 | 规范事件 | 说明 |
| --- | --- | --- |
| `user/message`（`source.kind=user`） | `UserPromptSubmit` | 用户提示提交 |
| `assistant/message` | `AgentMessage` | 助手消息 |
| `assistant/attempt` | `Reasoning` | 助手推理尝试 |
| `tool/call` | `PreToolUse` | 工具调用前置拦截点（纠偏发生处） |
| `tool/result` | `PostToolUse` / `PostToolUseFailure` | `isError`（或 `error` / `status=error`）时产出 Failure |
| `turn/end` | `Stop` / `Interrupted` / `StopFailure` | `reason.kind` 为 `aborted`/`interrupted` → `Interrupted`；`error`/`blocked` → `StopFailure`；其余 → `Stop` |
| `session/created` | `SessionStart` | 会话创建 |
| `session/disposed` | `SessionEnd` | 会话销毁 |
| 其它 | `Notification` | 保留原生语义（原 payload 透传审计） |

仅 `tool/call`（`PreToolUse`）进入纠偏引擎；其余事件 fail-open 放行，仅用于会话/审计上下文维护。

## 能力边界（Tier B）

来自 `host-kit` 的 `capabilitiesFor('deepseek')`：

| 能力 | 值 | 含义 |
| --- | --- | --- |
| `patchArgs` | ✗ | 不能在工具执行前改写参数（L1 降为注入提示） |
| `redirectTool` | ✗ | 不能替换工具名/目标（L3 降为注入提示） |
| `injectMessage` | ✓ | 可把纠偏提示送回 Agent 上下文（L2/L3 落地） |
| `suspend` | ✗ | 不能真正挂起等待人工审批 |
| `block` | ✓ | 可拒绝单个动作 |

因此 L1–L3 走「注入 + 审计」，L4（高危命令 / 受保护路径）的 `Suspend` 降级为 **block**（决策附带 `degraded: ["suspend→block"]`）。例如 `tool/call` 中 `command: "rm -rf /"` 端到端产出 `block`。

## 注意事项

- **不声明 `inject = ['sessions']`**：DeepSeek 的 `sessions` 是第三方服务。若 bundle 在加载时声明依赖，服务未就绪期间 Cordis 会一直等待注入而死锁。本插件只用 `ctx.on` 订阅 + `ctx.emit('arcs/decision', …)` 广播决策，完全不触碰 `sessions`。
- **决策消费方（默认降级形态）**：纠偏决策通过 `ctx.emit('arcs/decision', { sessionId, turnId, decision, enforced })` 广播，同时可从 `apply()` 返回的 handle 的 `decisionBySession` / `lastDecision` / `enforcedBySession` 读取。未注入阻断通道时 `enforced: false`——插件本身不直接调用宿主审批 API，宿主需订阅事件并自行拒绝。
- **真实阻断通道（可选）**：`apply(ctx, { blockTransport })` 注入 `(decision, raw) => Promise<boolean>` 后，L4 的 `block` 决策会调用它真正拒绝工具执行，返回 `true` 时 `enforced: true`。通道抛异常一律 fail-open。示例：

  ```ts
  apply(ctx, {
    goal: '安全重构',
    blockTransport: async (decision, raw) => ctx.host.rejectTool(raw.payload.toolUseId, decision.reason),
  });
  ```
- **长订阅复位**：`HookEntryAdapter` 在每个事件前调用 `reset()` 清空上一次决策，避免跨事件残留；`turnBySession` 维护每会话 turn id（`session/created` 初始化、`session/event` 递增或采用显式 `turnId`、`session/disposed` 清理）。
- **fail-open 红线**：映射、归一化、决策、序列化的任何异常都只记录审计痕迹并放行原始调用，错误只写 stderr，绝不阻塞 Agent。
- **平台名唯一来源**：`deepseek` 平台名集中在 `host-kit` 的 `platforms.ts`，插件内除 bundle 名外不散落硬编码平台名。
- **本地审计**：设置 `ARCS_HOME` 或 `ARCS_AUDIT_FILE` 后，编排事件追加到 `<home>/audit/deepseek/<YYYY-MM-DD>.jsonl`（含 `enforced` 决策可在宿主侧消费时核对）；未设置则不落盘。
