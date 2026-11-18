import { pickString } from '@chaos-design/arcs-host-kit';
import { claimSession, createPipeline, type PipelineOptions, type SteeringPipeline } from './adapter.js';
import { piEventToRaw, translatePiDecision, type PiEvent } from './mapping.js';

/** Pi 全局扩展的最小接口（只声明 on(event, handler)，不绑定宿主完整类型） */
export interface PiExtension {
  on(event: string, handler: (event: PiEvent, ...rest: unknown[]) => unknown): void;
}

/** 观测类事件：通过 subscribeFn 注入 HookEntryAdapter，fire-and-forget 采集（用于审计/状态） */
const OBSERVATION_EVENTS = [
  'session_start',
  'message_end',
  'tool_result',
  'user_bash',
  'model_select',
  'session_before_compact',
  'session_compact',
  'session_shutdown',
] as const;

/** 构造默认导出的全局扩展函数 */
export function createPiExtension(options: PipelineOptions = {}) {
  return function arcsPiPlugin(pi: PiExtension): void {
    const goal = options.goal ?? process.env['ARCS_GOAL'] ?? '';

    // 1) 观测管线：subscribeFn 复用 HookEntryAdapter 订阅注入；每条事件前 reset()
    let observation!: SteeringPipeline;
    observation = createPipeline(
      (notify) => {
        for (const name of OBSERVATION_EVENTS) {
          pi.on(name, (event: PiEvent) => {
            // 会话记录权：旧 owner 仍存活时静默跳过；退出后可接管
            if (name === 'session_start') {
              const sessionId = pickString(event as unknown as Record<string, unknown>, ['sessionId', 'sessionID', 'id'], 'unknown-session');
              if (!claimSession(sessionId)) return;
            }
            const raw = piEventToRaw(name, event);
            options.onRaw?.(raw);
            observation.adapter.reset();
            notify(raw);
          });
        }
      },
      { goal, onRaw: options.onRaw, config: options.config },
    );
    observation.runtime.start();

    // 2) 工具/提示管线：需同步拿决策并回写（注入 / 阻断）
    const tool = createPipeline(undefined, { goal, onRaw: options.onRaw, config: options.config });

    // input 仅暂存 prompt，由 before_agent_start 消费后产出 UserPromptSubmit
    let pendingPrompt = '';
    pi.on('input', (event: PiEvent) => {
      pendingPrompt = pickString(event as unknown as Record<string, unknown>, ['text', 'prompt', 'input'], '');
    });

    pi.on('before_agent_start', async (event: PiEvent) => {
      const prompt = pendingPrompt || pickString(event as unknown as Record<string, unknown>, ['text', 'prompt'], '');
      pendingPrompt = ''; // 消费暂存
      const raw = piEventToRaw('before_agent_start', { ...event, text: prompt }, 'UserPromptSubmit');
      const decision = await tool.run(raw);
      const translated = translatePiDecision(decision);
      // Pi 契约：before_agent_start 返回的 message 必须是结构化对象，不能是裸字符串。
      // 用 customType + content + display:false 作为持久上下文注入，不干扰 TUI。
      if (!translated.injected) return undefined;
      return {
        message: {
          customType: 'arcs-steering',
          content: translated.injected,
          display: false,
        },
      };
    });

    pi.on('tool_call', async (event: PiEvent) => {
      const raw = piEventToRaw('tool_call', event, 'PreToolUse');
      const decision = await tool.run(raw);
      const translated = translatePiDecision(decision);
      // Tier B：危险命令（Suspend）降级为 block
      return translated.block ? { block: true, reason: translated.block.reason } : undefined;
    });
  };
}

/** 平台直接加载的默认导出：function(pi) { pi.on(...) ... } */
const plugin = createPiExtension();
export default plugin;

export { mapPiEvent, piEventToRaw, translatePiDecision } from './mapping.js';
export { claimSession, configureClaims, createPiAdapter, createPipeline, resetClaims } from './adapter.js';
export type { CanonicalEvent, PiDecision, PiEvent } from './mapping.js';
