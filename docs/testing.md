[English](./en/testing.md) · 中文

# 测试策略

三层测试对应 [roadmap.md](./roadmap.md) 各阶段 DoD，前两层完全离线可跑（不依赖真实宿主与网络），第三层才进真实宿主。

## 第一层 · core 纯函数单测（对应 P0）

- **对象**：`SchemaSensor` / `LoopHashSensor` / `SemanticSensor` / `PolicySensor`、`CoursePlanner`、效果序列化。
- **要求**：传感器与规划器保持纯函数、无 I/O；`DriftSignal` 与 `SteeringEffect[]` 必须通过 JSON roundtrip 断言（可序列化红线，见 [constraints.md](./constraints.md)）。
- **必测项**：
  - 等级映射：schema→L1、loop→L2、semantic→L3、policy→L4 各触发对应效果列表；
  - 效果列表约定：`Suspend` 独立出现且位于末位，违规输入被规划器拒绝；
  - **失败降级**：单传感器异常→跳过；整体异常→`[PassThrough]` + degraded 标记（见 [core.md](./core.md) 降级语义）。

## 第二层 · 回放仿真（对应 P1）

用录制轨迹替代真实宿主，全链验证运行时行为：

- **MockHostAdapter**：`plugin-kit` 测试导出物，可编程注入 `RawEvent` 序列，并记录全部 `materialize` 调用（效果、顺序、结果）。
- **ReplayHarness**：加载轨迹文件（JSONL，一行一个 `RawEvent`），驱动 `PluginRuntime.run` 回放，断言：
  - `SteeringOutcome.effects` 的类型与顺序（如 L3 场景 = `[RedirectTool, InjectMessage]`）；
  - `latencyMs` 预算（normalize + sense ≤ 35ms、plan ≤ 10ms）；
  - `degraded` 标记与 `AuditEvent` 发射次数、字段完整性（见 [telemetry.md](./telemetry.md)）；
  - HITL 桥接：mock `HitlTransport` 分别返回 approved / rejected / timeout，断言放行、阻断+注入、告警三种结局。
- **轨迹来源**：真实宿主手工录制 + 手工构造的对抗样本（死循环、越界写入、`rm -rf`、路径幻觉）。

## 第三层 · 真实宿主端到端（对应 P2–P4）

| 对象 | 验证内容 |
|---|---|
| `plugins/mcp` | 真实 MCP Server 挂载，观测 L1/L2 纠偏与审计上报 |
| `plugins/chatgpt` / `deepseek` / `claude-code` | 真实宿主进程运行，验证 L3/L4 与审批恢复后任务续跑 |
| `sdk/vercel` / `sdk/langchain` | demo 跑通，`onSteer(SteerEvent)` 字段正确，边界约束（不接管生命周期、不做代理）通过 review |

## 边界守护（CI）

`.github/workflows/ci.yml` 已落地（install → build → lint → test → scan → verify:contracts → 面板冒烟）：

- 依赖扫描断言：core 不得出现 `fs` / `net` / `child_process` 导入；plugin-kit 不得 import 任何宿主 SDK；
- 预算基准：sense + plan p99 < 50ms（重传感器走异步旁路不计入）；
- 文档校验：Mermaid 图可渲染、相对链接无断链（与本仓库文档任务的 DoD 一致）。
