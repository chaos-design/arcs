[English](./en/constraints.md) · 中文

# 约束说明

| # | 约束 | 理由 | 保障方式 |
|---|---|---|---|
| 1 | **core 纯度红线**：不得出现 `fs` / `net` / `child_process` 导入 | 保证算法可移植、可测试、无副作用 | CI 依赖扫描断言 |
| 2 | **延迟预算**：normalize + sense ≤ 35ms、plan ≤ 10ms、materialize ≤ 5ms，合计 < 50ms | 做到「偏航即发现、立即纠偏」 | 预算按 **CPU 时间**（`process.cpuUsage`，经 `globalThis` 取用以保持 core 零 import）计量，不按墙钟——同步传感器/规划器被 OS 抢占时墙钟虚增会误判超预算，把 L4 阻断降级为放行；`createArcsEngine({ clock })` 可注入假时钟做确定性测试 |
| 3 | **决策可序列化**：`SteeringEffect`（及有序列表）必须可 JSON 化 | 支撑审计、回放与遥测 | 类型约束 + JSON roundtrip 单测 |
| 4 | **审批语义**：`Suspend` 只挂起单个高危动作，审批后恢复；拒绝/超时（默认 120s）→ 阻断 + 注入解释，任务继续 | 保证任务连续性，避免演变为任务终止 | HITL 桥接契约约束（`HitlDecision.timeout` 必填） |
| 5 | **胶水层宿主无关**：`plugin-kit` 不 import 任何宿主 SDK | 保持胶水层可复用 | 宿主依赖下沉到 `plugins/*` |
| 6 | **SDK 边界**：`sdk/*` 不实现生命周期 Hook 或流量代理 | 避免与插件职责重叠 | 设计评审检查 |
| 7 | **失败即降级（fail-open）**：检测/规划异常或超预算一律放行并标记 `degraded` | ARCS 绝不成为任务中断源（核心承诺 1 的兜底） | 运行时逐级 try/catch + degraded 审计事件单测 |
| 8 | **效果列表契约**：`plan` 返回有序 `SteeringEffect[]`，按序物化；`Suspend` 只能独立出现且位于末位 | 支撑「阻断 + 注入」复合纠偏，避免部分物化状态 | 类型约束 + 规划器校验单测 |
| 9 | **状态 TTL**：`SessionState` 空转超时（默认 30 分钟）必须清理 | 防止长驻插件进程内存泄漏 | Runtime 生命周期测试 |
| 10 | **遥测不反压**：`TelemetrySink.emit` 不得抛异常、不得阻塞主链 | 遥测失败绝不影响纠偏 | sink 契约测试（异常注入） |

## 术语约定

统一使用以下术语，避免混用：

- **偏航（Drift）**：执行方向偏离既定目标的状态
- **修正弧线（Steering Arc）**：把 Agent 拉回目标的平滑纠偏路径
- **纠偏指令（Steering Prompt）**：注入宿主/模型的系统级纠偏提示
- **既定目标（Goal）**：任务开始时设定的目标
- **操舵 / 纠偏**：系统级纠偏机制 / 具体纠偏动作
- **无侵入接入**：SDK 与插件均不改动宿主核心逻辑
- **会话状态（SessionState）**：胶水层按 sessionKey 持有的跨事件状态（循环窗口 / 历史 / 预算）
- **降级（Degraded）**：fail-open 放行并标记的异常状态，伴随审计事件
- **效果列表**：`plan` 输出的有序 `SteeringEffect[]`，运行时按序物化
