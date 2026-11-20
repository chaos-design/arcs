[English](./en/key-flows.md) · 中文

# 关键流程

## 纠偏闭环主流程

体现「不中断 + 及时纠偏」：纠偏对象始终是偏航的动作，而非任务本身。`plan` 输出**有序效果列表**，运行时按序物化，组合表达「阻断 + 注入」类复合纠偏。

```mermaid
flowchart LR
  IN["ExecutionContext"] --> S["DriftSensor.sense"]
  S -->|"DriftSignal[]"| P["CoursePlanner.plan"]
  P --> EFF["SteeringEffect[]<br/>有序效果列表"]
  EFF --> R{"按序物化"}
  R -->|无偏航| PT["PassThrough 放行"]
  R -->|L1 参数畸变| HP["PatchArgs"]
  R -->|L2 死循环| IJ["InjectMessage"]
  R -->|L3 任务发散| RD["RedirectTool + InjectMessage"]
  R -->|L4 高危越权| HS["Suspend → HITL 审批后恢复"]
  PT --> DONE["继续执行 · 任务不中断"]
  HP --> DONE
  IJ --> DONE
  RD --> DONE
  HS --> DONE
```

## 插件运行时序

```mermaid
sequenceDiagram
  participant H as Harness
  participant A as HostAdapter
  participant RT as PluginRuntime
  participant K as core
  participant T as TelemetrySink
  H->>A: 生命周期事件(工具调用/推理)
  A->>A: normalize → ExecutionContext
  A->>RT: run(raw) · Promise
  RT->>K: sense(ctx) / plan(ctx, signals)
  K-->>RT: SteeringEffect[]（有序效果列表）
  alt 无偏航
    RT-->>A: [PassThrough] → 放行
  else L1–L3
    RT-->>A: 效果列表
    A->>A: materialize 按序落地（≤ 5ms）
    A-->>H: 继续执行(任务不中断)
  else L4 高危
    RT-->>A: [Suspend]
    Note over A: 走 HITL 挂起恢复流程（见下）
  end
  RT->>T: emit AuditEvent（degraded 标记降级）
```

## 四级纠偏策略

| 偏航等级 | 典型场景（SDK 与 Harness 通用） | 效果类型 | 操舵效果（任务不中断） |
| :--- | :--- | :--- | :--- |
| **L1 · 参数畸变** | 工具调用 JSON 格式错误、路径拼写幻觉 | `PatchArgs` | 毫秒级自动修复参数字段，宿主无感放行，任务继续推进。 |
| **L2 · 终端死循环** | 连续 3 次运行同一报错命令 | `InjectMessage` | 在重复执行前注入虚拟报错提示，引导切换排查思路，而非终止任务。 |
| **L3 · 任务发散** | 修 Bug 时擅自重构无关目录 | `RedirectTool` + `InjectMessage` | 阻断越界写入并注入强约束指令，把焦点拉回既定目标（Goal）。 |
| **L4 · 高危越权** | 试图执行 `rm -rf` 或修改受保护的 `.env` | `Suspend` | 挂起单个高危动作并触发交互 / Webhook 审批，审批后恢复，任务得以安全延续。 |

## HITL 挂起-恢复流程

L4 是唯一的「暂停」场景，但暂停的是单个动作，不是任务：审批通过后从挂起点恢复；拒绝或超时则阻断该动作并注入解释，任务继续朝目标推进。

```mermaid
sequenceDiagram
  participant A as HostAdapter
  participant HL as HitlTransport
  participant H as Harness
  A->>HL: request(Suspend, ctx)
  alt approved 通过
    HL-->>A: { approved: true }
    A->>H: 放行原动作，从挂起点继续
  else rejected 拒绝
    HL-->>A: { approved: false, timeout: false }
    A->>H: 阻断原动作，InjectMessage 注入拒绝原因与改道提示
  else timeout 超时（默认 120s）
    HL-->>A: { approved: false, timeout: true }
    A->>H: 同拒绝处理，并告警审计事件
  end
  Note over H: 任务继续朝既定目标推进，从未被终止
```

## 失败降级路径（fail-open）

检测/规划链路自身的任何异常都不允许中断宿主任务——降级放行并留下审计痕迹：

```mermaid
flowchart TD
  START["事件进入流水线"] --> S1{"传感器正常？"}
  S1 -->|"部分异常"| SKIP["跳过异常传感器<br/>其余照常"]
  S1 -->|正常| SP["sense + plan"]
  SKIP --> SP
  SP --> OK{"异常 / 超预算？"}
  OK -->|否| EFF["SteeringEffect[] 按序物化"]
  OK -->|是| OPEN["PassThrough + degraded = true"]
  EFF --> EMIT["emit AuditEvent"]
  OPEN --> EMIT
  EMIT --> GO["宿主继续执行 · 任务不中断"]
```

降级行为分层：单传感器异常→跳过；整体异常/超预算→PassThrough + degraded；materialize 异常→放行原始调用 + 告警。契约细节见 [plugin-kit.md](./plugin-kit.md) 的「失败兜底」一节。
