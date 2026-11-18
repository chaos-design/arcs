[English](./en/README.md) · 中文

# ARCS 文档索引

本目录按功能拆分 ARCS 的架构与设计文档。README 提供总览，细节在此展开。

## 文档列表

| 文档 | 内容 |
|---|---|
| [architecture.md](./architecture.md) | 设计总纲、分层架构、依赖关系、能力矩阵、进程拓扑与稳健性红线（Mermaid 图） |
| [directory-layout.md](./directory-layout.md) | 目录规划：`packages/*`、`sdk/xxx`、`plugins/xxx`、docs |
| [core.md](./core.md) | 基础内核：职责、核心抽象、接口边界、默认传感器、预算与降级 |
| [plugin-kit.md](./plugin-kit.md) | 插件胶水层：职责、核心抽象、会话状态、与 core 的拆分边界 |
| [host-kit.md](./host-kit.md) | 宿主运行时：能力矩阵、Hook 入口桥、效果翻译、审计落盘与会话锁 |
| [plugins.md](./plugins.md) | 具体插件：codex / deepseek / claude-code / mcp 等 9 家 |
| [sdk.md](./sdk.md) | SDK 代码级接入：拦截点、SteerEvent 契约、与插件的边界 |
| [key-flows.md](./key-flows.md) | 纠偏闭环、运行时序、四级策略、HITL 恢复、失败降级 |
| [telemetry.md](./telemetry.md) | 遥测：AuditEvent 模型、TelemetrySink 契约、偏移曲线与面板 |
| [testing.md](./testing.md) | 测试策略：三层测试与 CI 边界守护 |
| [extension-points.md](./extension-points.md) | 扩展点与新增插件/算法步骤 |
| [constraints.md](./constraints.md) | 约束说明（10 条）与术语约定 |
| [roadmap.md](./roadmap.md) | 分阶段落地计划与完成标准 |
| [interview.md](./interview.md) | 面试题库：36 题分组（问题域/架构/算法/物化/可观测/工程化/开放设计） |

## 两条核心要求

1. **保持任务连续性，不中断当前任务。** 纠偏发生在执行流内部，任务始终向前推进。
2. **发现偏航立即纠偏，持续朝目标推进。** 实时检测偏差，越界即修正，避免偏航累积。

从 [architecture.md](./architecture.md) 开始阅读。
