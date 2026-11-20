# @chaos-design/arcs-sdk-langchain

ARCS 的 LangGraph 接入：`createArcsNode` 生成零框架依赖的纠偏节点（LangGraph 节点即普通函数），把 core 的有序 `SteeringEffect` 翻译为图内控制流（继续、改参、注入消息）。

## 安装

```bash
pnpm add @chaos-design/arcs-sdk-langchain
```

## 用法

```ts
import { createArcsNode } from '@chaos-design/arcs-sdk-langchain';

graph.addNode('arcs', createArcsNode({ goal: '仅修复前端样式 Bug' }));
// 节点输入：{ goal, thought, toolCall, history }
// 节点输出：{ toolCall（改写/null）, inject?, steer? }
```

通过 `SteerEvent` 向宿主应用暴露操舵可观测性；L4 高危动作经 HITL 三分支（approved / rejected / timeout）处理，任务不被终止。

详细设计见 [docs/sdk.md](https://github.com/chaos-design/arcs/blob/main/docs/sdk.md)。
