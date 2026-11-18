// ARCS × Vercel AI SDK（sdk/vercel）端到端演示
// 用 mock 模型（duck-typed LanguageModelV4，无需 API Key）演示两个纠偏等级：
//   A. L1 —— 模型幻觉出错误键名 pathh，ARCS 热修复为 path 后放行（PatchArgs）
//   B. L2 —— 同一工具调用连续出现，第 3 次被替换为虚拟报错文本（InjectMessage）
// 运行前（仓库根目录）：corepack pnpm install && corepack pnpm build
// 运行：node examples/sdk-vercel-demo/demo.mjs
import { z } from 'zod';
import { withArcs } from '../../sdk/vercel/dist/index.js';

/** duck-typed mock 模型：按脚本循环返回 tool-call（与 sdk/vercel 单测夹具同构） */
function makeMockModel(response) {
  let calls = 0;
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock-1',
    supportedUrls: {},
    async doGenerate() {
      calls += 1;
      return {
        content: [...response],
        finishReason: { unified: 'tool-calls' },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
      };
    },
  };
}

const toolCallPart = (name, args) => ({
  type: 'tool-call',
  toolCallId: `call-${Math.random().toString(36).slice(2, 8)}`,
  toolName: name,
  input: JSON.stringify(args),
});

const userPrompt = { prompt: [{ role: 'user', content: [{ type: 'text', text: '开始执行' }] }] };
const printEvent = (e) =>
  `L${e.level}（${e.effects.map((x) => x.type).join('+')}）${e.reason}`;

console.log('== A. L1：参数键名幻觉热修复（PatchArgs） ==');
{
  const events = [];
  const wrapped = withArcs(makeMockModel([toolCallPart('write_file', { pathh: 'a.ts', content: 'code' })]), {
    goal: '重构 src/auth 目录下的鉴权逻辑',
    policy: { toolSchemas: { write_file: z.object({ path: z.string(), content: z.string() }) } },
    onSteer: (e) => events.push(e),
  });
  const result = await wrapped.doGenerate(userPrompt);
  const part = result.content[0];
  console.log(`模型产出：write_file ${part?.input}`);
  console.log(`ARCS 纠偏：${printEvent(events[0])}`);
  console.log(`修正后透传下游：${part?.input}`);
}

console.log('\n== B. L2：同一调用死循环熔断（InjectMessage） ==');
{
  const events = [];
  const wrapped = withArcs(makeMockModel([toolCallPart('bash', { command: 'npm test' })]), {
    goal: '重构 src/auth 目录下的鉴权逻辑',
    onSteer: (e) => events.push(e),
  });
  for (let i = 1; i <= 3; i++) {
    const result = await wrapped.doGenerate(userPrompt);
    const part = result.content[0];
    const shape = part?.type === 'tool-call' ? `tool-call ${part.toolName} ${part.input}` : `text "${String(part?.text).slice(0, 48)}…"`;
    console.log(`第 ${i} 次 doGenerate → ${shape}  finishReason=${result.finishReason?.unified}`);
  }
  console.log(`ARCS 纠偏：第 3 次触发 ${printEvent(events.at(-1))}`);
}
console.log('\n完成。更多等级（L3 改道 / L4 审批）见 docs/sdk.md 与 sdk/vercel/src/with-arcs.test.ts。');
