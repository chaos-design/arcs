[English](./README.en.md) · 中文

# @chaos-design/arcs-plugin-opencode

ARCS OpenCode 全局插件：通过全局事件订阅采集生命周期，并在 `tool.execute.before` 前置中间件中完成 L1–L4 纠偏。属于 Tier A（可改参 + 可挂起 + 可阻断）。构建产物在 `dist/`，`main` 指向 `dist/index.js`，安装脚本会把它复制到全局插件目录。

## 安装

OpenCode 会自动发现其全局插件目录中的插件。把本目录复制（或软链）到全局插件目录即可：

```bash
# 全局插件目录（若你的 OpenCode 版本路径不同，以实际为准）
mkdir -p ~/.config/opencode/plugin
cp -R plugins/opencode ~/.config/opencode/plugin/arcs

# 或使用软链，便于源码更新
ln -s "$PWD/plugins/opencode" ~/.config/opencode/plugin/arcs
```

设置纠偏目标（可选，缺省时从 `ctx.goal` 或环境变量读取）：

```bash
export ARCS_GOAL="安全重构，不破坏现有行为"
```

重启 OpenCode 后插件以 `id: arcs-steering` 注册。

## 事件映射表

原生事件 → ARCS 规范事件名（未知事件原样保留，不向下丢弃，便于前向兼容）：

| 原生事件 (`event.type`) | 规范事件 | 触发条件 |
| --- | --- | --- |
| `session.created` | `SessionStart` | 会话创建（用于 claim 去重） |
| `session.tool.called` | `PreToolUse` | 工具调用前（中间件同步拦截） |
| `session.tool.success` | `PostToolUse` | 工具调用成功 |
| `session.tool.failed` | `PostToolUseFailure` | 工具调用失败 |
| `permission.asked` | `PermissionRequest` | 权限询问 |
| `session.text.ended` | `AgentMessage` | 文本输出结束 |
| `session.step.ended` (`finish=stop/end_turn`) | `Stop` | 正常结束 |
| `session.step.ended` (`finish=error/failed`) | `StopFailure` | 异常结束 |
| 其它 | 原样保留 | 前向兼容 |

## 能力边界（Tier A）

来自 `capabilitiesFor('opencode')`：

| 能力 | 值 | 落地方式 |
| --- | --- | --- |
| `patchArgs` | ✅ | L1：`decision.updatedInput` 写回 `output.args`（整体替换） |
| `injectMessage` | ✅ | L2/L3：注入文本入队，经 `session.hook('context')` 写入 `output.system[]` |
| `suspend` | ✅ | L4：危险命令产出 `ask`，经 `client.permission.ask` 挂起等待审批 |
| `block` | ✅ | 降级/宿主请求时抛出错误拒绝执行 |
| `redirectTool` | ❌ | 工具名不可替换，L3 降级为注入提示 |

纠偏等级：L1 改参 → L2 循环注入 → L3 偏航注入（L3 改道降级）→ L4 危险命令挂起审批。任何能力缺口或异常均 fail-open，绝不中断任务。

## 纠偏效果如何回写宿主

- 观测订阅：`subscribeFn` 注入到 `HookEntryAdapter` 第 4 参，`ctx.event.subscribe` 收到事件后映射为 `RawEvent`，每条事件前 `reset()` 复位决策，再 fire-and-forget 驱动 `PluginRuntime.run`（用于采集与审计）。
- 工具中间件：`tool.execute.before` 中 `await runtime.run(raw)`，读取 `adapter.decision`，翻译后：
  - `updatedInput` → 写回 `output.args`；
  - `ask` → 调用 `client.permission.ask`（挂起审批）；
  - `injected` → 写入 `pendingInjections` 队列，经 `session.hook('context')` push 到 `event.system[]`（OpenCode 官方唯一有效的注入通道；`tool.execute.before` 的 output 只有 `args`）；
  - `block` → 抛错阻断。
- 观测与工具各用**独立管线**（独立 `HookEntryAdapter`/`PluginRuntime`），避免共享可变 `decision` 造成串扰。

## 会话 claim（去重）

使用 `host-kit` 的 `SessionClaim` 文件锁：`<home>/opencode/.claims/<sessionId>.claim` 以 `open('wx')` 原子抢占，记录 pid；仅对 `SessionStart` 做 claim。旧 owner 已退出或记录超过 TTL（默认 30 分钟）才允许接管，`EPERM` 视为存活不接管。多进程**必须共享同一个 `ARCS_HOME`（或 `ARCS_CLAIM_HOME`）**才能互斥；跨主机去重需要分布式锁，不在本插件范围内。测试可用 `configureClaims(home)` 隔离 claim 目录。

## 本地审计

设置 `ARCS_HOME` 或 `ARCS_AUDIT_FILE` 后，每条编排事件追加到 `<home>/audit/opencode/<YYYY-MM-DD>.jsonl`；未设置则不落盘、行为不变。真实会话后用 `node scripts/host-real-check.mjs --verify` 查看统计。
