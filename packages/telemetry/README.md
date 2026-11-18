# @chaos-design/arcs-telemetry

ARCS 遥测包：纠偏审计的数据模型、Sink 契约与偏移曲线聚合。**纯逻辑零 I/O**——持久化下沉 `@chaos-design/arcs-host-kit` 的 `FileAuditSink`，本包不参与纠偏决策。

## 能力

- **AuditEvent 模型**：`buildAuditEvent` + zod schema（`auditEventSchema`），记录每次纠偏的效果列表、降级标记与 severity
- **TelemetrySink 契约**：`emit` 不得抛异常、同步 < 1ms；失败静默丢弃——遥测是旁路而非依赖
- **InMemorySink**：测试与演示用内存 Sink（容量上限 FIFO 逐出）
- **偏移曲线**：`buildOffsetCurves` 把审计事件聚合为 Steering Arc 曲线，供 `pnpm dashboard`（终端 sparkline / HTML SVG）消费

## 安装

```bash
pnpm add @chaos-design/arcs-telemetry
```

## 用法

```ts
import { buildAuditEvent, InMemorySink } from '@chaos-design/arcs-telemetry';

const sink = new InMemorySink();
sink.emit(buildAuditEvent({ host: 'mcp', decision, degraded, level }));
```

详细设计见 [docs/telemetry.md](https://github.com/chaos-design/arcs/blob/main/docs/telemetry.md)。
