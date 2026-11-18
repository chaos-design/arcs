# Plans

本目录是 ARCS 仓库的 plan-flow 计划契约。状态目录即状态：

| 状态 | 目录 | 含义 |
|---|---|---|
| planing | `plans/planing/` | 已设计拆解，可实施 |
| pending | `plans/pending/` | 阻塞于产品/安全/发布/平台决策 |
| archive | `plans/archive/` | 已完成归档，只读（仅限勘误） |

## 优先级定义（本项目化）

| 级别 | 定义 |
|---|---|
| **P0** | 文档间硬矛盾：错误的契约签名/枚举若不修正将被未来代码继承（对应 broken gates / wrong contract） |
| **P1** | 阻断 roadmap P0 开工的设计缺口与新架构图（对应 unreachable core features / incomplete recovery） |
| **P2** | 完整性同步：索引、约束、LICENSE、交叉校验 |

> 仓库当前为纯文档形态，无代码级 P0 风险；上表为 skill 默认定义在文档项目上的映射。

## 完成标准键

`code`（任务全部完成）/ `linter_result`（链接与术语检查）/ `unit_test_result`（Mermaid 渲染）/ `func_test_result`（README↔docs 交叉一致）/ `status`（剩余风险与回滚）。含义以各计划文件为准。
