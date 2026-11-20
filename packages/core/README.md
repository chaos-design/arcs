# @chaos-design/arcs-core

ARCS 基础内核：执行上下文建模、偏航检测、航向规划与决策生成的**纯逻辑**实现。零宿主依赖、零 I/O、零状态——「检测 + 决策」只发生在这一层。

## 能力

- **4×DriftSensor 偏航检测**：参数畸变、终端死循环、任务发散、受保护路径越权
- **RuleBasedPlanner 航向规划**：输出有序 `SteeringEffect[]`（L1–L4），组合表达「阻断 + 注入」类复合纠偏；`Suspend` 只能独立出现且位于末位
- **createArcsEngine**：CPU 时钟预算编排 + fail-open 兜底（任何异常降级放行并标记 degraded）
- **契约模型**：`ExecutionContext` / `SteeringEffect` / `DriftSignal` 均可 JSON 序列化（zod schema + roundtrip 断言）

## 安装

```bash
pnpm add @chaos-design/arcs-core
```

## 用法

```ts
import { createArcsEngine } from '@chaos-design/arcs-core';

const engine = createArcsEngine({
  goal: '重构 src/auth，严禁修改数据库迁移文件',
  protectedPaths: ['.env*', '**/migrations/**'],
});

const outcome = engine.run(executionContext); // { effects: SteeringEffect[], degraded, notes, ... }
```

`Policy` 字段（goal / protectedPaths / driftThreshold / maxConsecutiveLoops 等）与自定义传感器、规划器、预算时钟的注入方式见 [docs/core.md](https://github.com/chaos-design/arcs/blob/main/docs/core.md)。

## 红线

- 不 import 任何宿主 SDK、`fs` / `net` / `child_process`（由 `scripts/scan-deps.mjs` 红线扫描锁定）
- 不持有状态：同一输入永远得到同一效果列表

详细设计见 [docs/core.md](https://github.com/chaos-design/arcs/blob/main/docs/core.md)。
