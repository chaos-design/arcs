# ARCS 架构设计

## 设计总纲

| 原则 | 含义 |
|---|---|
| core 保持纯逻辑 | 只做「检测 + 决策」，不认识任何宿主 SDK、不做 I/O、不碰进程、不持有状态 |
| 胶水层承接耦合 | 所有宿主相关的事件采集、上下文归一、决策落地、会话状态、配置/审批/遥测桥接收进 `plugin-kit` |
| 插件轻量化 | `plugins/*` 只实现 `HostAdapter`，几乎不含算法，便于快速新增宿主 |
| SDK 走直线 | `sdk/*` 是进程内代码级接入，直接依赖 core，不经过胶水层 |
| 失败即降级（fail-open） | 检测/规划异常或超预算一律放行并标记 degraded——ARCS 绝不成为任务中断源 |

两条不可妥协的核心要求：

1. **保持任务连续性，不中断当前任务。** 纠偏发生在执行流内部——修复参数、注入提示、重定向工具——任务始终向前推进，不被强制终止或丢弃。
2. **发现偏航立即纠偏，持续朝目标推进。** 实时检测执行方向与**既定目标（Goal）**的偏差，一旦越界立刻修正走向，避免 Agent 在错误方向上越走越远。

## 分层架构

```mermaid
flowchart TB
  subgraph L1["接入层 · 双轨"]
    direction LR
    subgraph SDK["代码级接入 sdk/"]
      SV["sdk/vercel"]
      SL["sdk/langchain"]
    end
    subgraph PL["宿主插件 plugins/"]
      CODEX["plugins/codex"]
      DS["plugins/deepseek"]
      MCP["plugins/mcp"]
    end
  end
  subgraph KIT["插件胶水层 packages/plugin-kit"]
    HA["HostAdapter 契约"]
    RT["PluginRuntime"]
    BR["Config / HITL / SessionState 桥接"]
  end
  subgraph TELE["packages/telemetry"]
    AE["AuditEvent 模型"]
    TS["TelemetrySink 契约"]
  end
  subgraph CORE["基础内核 packages/core · 纯逻辑"]
    SENSE["DriftSensor 偏航检测"]
    PLAN["CoursePlanner 航向规划"]
    MODEL["ExecutionContext / SteeringEffect"]
  end

  SV --> CORE
  SL --> CORE
  CODEX --> KIT
  DS --> KIT
  MCP --> KIT
  KIT --> TELE
  TELE --> CORE
```

## 依赖关系

- 单链：`plugins/* → plugin-kit → telemetry → core`，单向依赖，core 绝不反向感知上层。
- `AuditEvent` 模型与 `TelemetrySink` 契约定义在 `packages/telemetry`，由胶水层消费；telemetry 只依赖 core 的产出类型，不参与决策。
- `sdk/*` 直接依赖 core，绕过胶水层（进程内、强类型、同步可组合）；需要审计时可按需依赖 telemetry 直接上报。

## 模块交互

```mermaid
sequenceDiagram
  participant H as Harness / 框架
  participant A as HostAdapter / SDK Wrapper
  participant RT as PluginRuntime
  participant K as core
  participant HL as HitlTransport
  participant T as TelemetrySink
  H->>A: 生命周期事件(工具调用/推理)
  A->>A: normalize → ExecutionContext
  A->>RT: run(ctx)
  RT->>K: sense(ctx) / plan(ctx, signals)
  K-->>RT: SteeringEffect[]（有序效果列表）
  alt 无偏航
    RT-->>A: [PassThrough] → 放行
  else L1–L3 纠偏
    RT-->>A: 效果列表
    A->>A: materialize 按序落地
    A-->>H: 继续执行(任务不中断)
  else L4 高危越权
    RT-->>A: [Suspend]
    A->>HL: request(suspend)
    HL-->>A: approved / rejected / timeout
    A-->>H: 通过→放行原动作；拒绝/超时→阻断+注入解释，任务继续
  end
  RT->>T: emit AuditEvent
```

纠偏结果再返回宿主继续执行——这是「任务不中断」得以成立的技术基础。任何检测/规划异常都会走 fail-open 降级（放行 + degraded 审计），保证 ARCS 自身不阻塞宿主。

## 详细设计

- [目录规划](./directory-layout.md)
- [基础内核 core](./core.md)
- [插件胶水层 plugin-kit](./plugin-kit.md)
- [具体插件 plugins](./plugins.md)
- [SDK 接入](./sdk.md)
- [关键流程](./key-flows.md)
- [扩展点](./extension-points.md)
- [约束说明](./constraints.md)
- [遥测 telemetry](./telemetry.md)
- [测试策略](./testing.md)
- [落地计划](./roadmap.md)
