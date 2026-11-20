# @chaos-design/arcs-sdk-vercel

ARCS 的 Vercel AI SDK 接入：`withArcs` 模型包装器在 `LLM Thought → Tool Execution` 之间无侵入捕获执行快照，进程内同步纠偏（sense + plan ≤ 50ms），任务不被中断。

## 安装

```bash
pnpm add @chaos-design/arcs-sdk-vercel
```

## 用法

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { withArcs } from '@chaos-design/arcs-sdk-vercel';

const steeredModel = withArcs(openai('gpt-4o'), {
  goal: '重构 src/auth，严禁修改数据库迁移文件',
  policy: {
    driftThreshold: 0.75,
    maxConsecutiveLoops: 2,
    enablePatchArgs: true, // L1 参数热修复
  },
  onSteer: (event) => console.warn(`[ARCS] L${event.level} | ${event.reason}`),
  hitl: async ({ toolName, reason }) => confirm(`允许 ${toolName}？${reason}`), // L4 进程内审批
});

const { text } = await generateText({ model: steeredModel, tools: myCodingTools, prompt: '开始重构' });
```

## 边界（v1）

- 拦截 `doGenerate`（generateText / Agent 循环）；`doStream` 透传不纠偏
- `InjectMessage` 翻译为「tool-call → text 替代」：框架内无消息注入通道，阻断提示以模型输出呈现

详细设计见 [docs/sdk.md](https://github.com/chaos-design/arcs/blob/main/docs/sdk.md)；完整示例见 [examples/sdk-vercel-demo](https://github.com/chaos-design/arcs/tree/main/examples/sdk-vercel-demo)。
