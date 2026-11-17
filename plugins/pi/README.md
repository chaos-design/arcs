# @chaos-design/arcs-plugin-pi

ARCS Pi 全局扩展：通过 `pi.on(...)` 订阅全局事件，在工具调用前置环节完成 L1–L3 纠偏与注入；L4（危险命令）因宿主无挂起通道降级为 `block`。属于 Tier B。构建产物在 `dist/`，`main` 指向 `dist/index.js`，安装脚本会把它复制到全局扩展目录。

## 安装

Pi 会自动发现其全局扩展目录中的扩展。把本目录复制（或软链）到全局扩展目录：

```bash
# 全局扩展目录（若你的 Pi 版本路径不同，以实际为准）
mkdir -p ~/.config/pi/extensions
cp -R plugins/pi ~/.config/pi/extensions/arcs

# 或软链，便于源码更新
ln -s "$PWD/plugins/pi" ~/.config/pi/extensions/arcs
```

扩展的默认导出为 `function(pi) { pi.on(...) ... }`，由 Pi 在加载时调用并注册事件。设置纠偏目标（可选）：

```bash
export ARCS_GOAL="安全重构，不破坏现有行为"
```

## 事件映射表

| 原生事件 (`pi.on` 名) | 规范事件 | 处理 |
| --- | --- | --- |
| `session_start` | `SessionStart` | 观测 |
| `input` | （暂存 `pendingPrompt`） | 仅暂存提示文本 |
| `before_agent_start` | `UserPromptSubmit` | 消费暂存 prompt，可注入提示 |
| `tool_call` | `PreToolUse` | 前置纠偏，危险命令 → block |
| `tool_result` | `PostToolUse` / `PostToolUseFailure` | 按 `isError` 区分，观测 |
| `message_end` (`type=text`) | `AgentMessage` | 观测 |
| `message_end` (`type=thinking`) | `Reasoning` | 观测 |
| `session_shutdown` | `SessionEnd` | 观测 |
| `user_bash`, `model_select`, `session_before_compact`, `session_compact` | 原样保留 | 观测 |

未知事件名原样保留，不向下丢弃。

## 能力边界（Tier B）

来自 `capabilitiesFor('pi')`：

| 能力 | 值 | 落地方式 |
| --- | --- | --- |
| `patchArgs` | ❌ | 无稳定改参契约；L1 `PatchArgs` 降级为注入提示 |
| `injectMessage` | ✅ | L2/L3：`before_agent_start` 返回 `{ message: { customType, content, display } }` 结构化对象注入上下文 |
| `suspend` | ❌ | 无审批回调通道 |
| `block` | ✅ | L4：`tool_call` 返回 `{ block: true, reason }` 拒绝执行 |
| `redirectTool` | ❌ | L3 降级为注入提示 |

纠偏等级：L1 改参降级为注入 → L2 循环注入 → L3 偏航注入 → L4 危险命令 `Suspend` 降级为 `block`。任何能力缺口或异常均 fail-open，绝不中断任务。

## 会话 claim

`session_start` 使用 `host-kit` 的 `SessionClaim` 文件锁（`<home>/pi/.claims/<sessionId>.claim`，`open('wx')` 原子抢占 + pid 记录）。Pi 会话可 resume：旧 owner 进程退出后新进程自动接管，`EPERM` 视为存活不接管。多进程必须共享同一个 `ARCS_HOME`（或 `ARCS_CLAIM_HOME`）。测试可用 `configureClaims(home)` 隔离目录。

## 纠偏效果如何回写宿主

- 观测事件：通过 `subscribeFn` 注入 `HookEntryAdapter` 第 4 参，`pi.on` 收到事件后映射为 `RawEvent`，每条事件前 `reset()`，再 fire-and-forget 驱动 `PluginRuntime.run`（用于采集/状态/审计）。
- 需回写的事件（独立管线，避免共享可变 decision 串扰）：
  - `input`：暂存 prompt 文本；
  - `before_agent_start`：消费暂存 prompt → `UserPromptSubmit` → `await runtime.run` → 把 `injected` 作为 `{ message: { customType: 'arcs-steering', content, display: false } }` 返回（Pi 官方 `before_agent_start` 契约要求 message 为结构化对象，裸字符串无效）；
  - `tool_call`：`PreToolUse` → `await runtime.run` → Tier B 下 `block` 作为 `{ block: true, reason }` 返回，拒绝执行。
- `HookEntryAdapter` 的 `reset()` 在每条事件前调用，保证上一次决策不残留。

## 本地审计

设置 `ARCS_HOME` 或 `ARCS_AUDIT_FILE` 后，编排事件追加到 `<home>/audit/pi/<YYYY-MM-DD>.jsonl`；未设置则不落盘、行为不变。真实会话后用 `node scripts/host-real-check.mjs --verify` 查看统计。
