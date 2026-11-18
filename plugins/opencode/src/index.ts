import { emptyDecision } from '@chaos-design/arcs-host-kit';
import type { RawEvent } from '@chaos-design/arcs-plugin-kit';
import { claimSession, createPipeline, type PipelineOptions, type SteeringPipeline } from './adapter.js';
import {
  mapOpencodeEvent,
  opencodeEventToRaw,
  opencodeSessionId,
  opencodeToolInputToRaw,
  translateOpencodeDecision,
  type OpencodeEvent,
} from './mapping.js';

/** OpenCode 插件上下文的最小接口（只声明本插件用到的能力，不绑定宿主完整类型） */
export interface OpencodeToolInput {
  tool?: string;
  toolName?: string;
  callID?: string;
  sessionID?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpencodeToolOutput {
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpencodePermissionRequest {
  tool: string;
  reason: string;
}

export interface OpencodeContext {
  signal?: AbortSignal;
  goal?: string;
  event: {
    subscribe(options: { signal?: AbortSignal }, handler: (event: OpencodeEvent) => void): void;
  };
  tool: {
    execute: {
      before?: (
        handler: (input: OpencodeToolInput, output: OpencodeToolOutput) => void | Promise<void>,
      ) => void;
    };
  };
  client?: {
    permission?: { ask?: (request: OpencodePermissionRequest) => Promise<unknown> };
  };
  /** V2 context hook：在模型请求前注入系统提示（OpenCode 官方注入通道） */
  session?: {
    hook?: (
      name: 'context',
      handler: (event: { system: string[]; messages: unknown[]; sessionID?: string }) => void,
    ) => void;
  };
}

export interface OpencodePlugin {
  id: string;
  setup(ctx: OpencodeContext): Promise<void>;
}

/**
 * 构造默认导出的全局插件对象。
 * - 观测管线：通过 subscribeFn 复用 HookEntryAdapter 的订阅注入，驱动全局事件采集（fire-and-forget）
 * - 工具管线：tool.execute.before 内 await runtime.run，把决策写回工具参数 / 触发权限询问
 */
export function createOpencodePlugin(options: PipelineOptions = {}): OpencodePlugin {
  return {
    id: 'arcs-steering',
    async setup(ctx: OpencodeContext): Promise<void> {
      const goal = ctx.goal ?? process.env['ARCS_GOAL'] ?? '';
      const signal = ctx.signal;

      // 1) 观测管线：subscribeFn 注入全局事件订阅；每条事件前 reset() 避免决策残留
      let observation!: SteeringPipeline;
      observation = createPipeline(
        (notify) => {
          ctx.event.subscribe({ signal }, (event: OpencodeEvent) => {
            if (mapOpencodeEvent(event) === 'SessionStart' && !claimSession(opencodeSessionId(event))) return;
            const raw = opencodeEventToRaw(event);
            options.onRaw?.(raw);
            observation.adapter.reset();
            notify(raw);
          });
        },
        { goal, onRaw: options.onRaw, config: options.config },
      );
      observation.runtime.start();

      // 2) L2/L3 注入通道：OpenCode 只认 experimental.chat.system.transform（V2 为 session context hook），
      //    经 output.system[] 追加；工具 output 只有 args，写 arcsContext 是无效的。
      // 容量上限：两次模型请求之间注入可能多次触发，超过上限 FIFO 逐出最旧条目防泄漏
      const pendingInjections: string[] = [];
      const PENDING_INJECTIONS_CAP = 64;
      ctx.session?.hook?.('context', (event) => {
        if (pendingInjections.length === 0) return;
        event.system.push(...pendingInjections.splice(0));
      });

      // 3) 工具管线：前置中间件，await 决策后回写
      const tool = createPipeline(undefined, { goal, onRaw: options.onRaw, config: options.config });
      ctx.tool.execute.before?.(async (input: OpencodeToolInput, output: OpencodeToolOutput) => {
        const toolName = input.tool ?? input.toolName ?? 'unknown';
        let decision = emptyDecision();
        try {
          decision = await tool.run(opencodeToolInputToRaw(input));
        } catch {
          decision = emptyDecision(); // 引擎异常 fail-open，不中断任务
        }
        const translated = translateOpencodeDecision(decision, toolName);

        // L1：写回修复后的完整参数
        if (translated.updatedInput) output.args = translated.updatedInput;

        // L4（Tier A）：危险命令产出 ask，通过权限询问实现挂起
        if (translated.ask) {
          try {
            await ctx.client?.permission?.ask?.({ tool: toolName, reason: translated.ask.reason });
          } catch {
            // 权限询问通道异常：fail-open，不阻断
          }
        }

        // L2/L3 注入上下文：排队到下一次模型请求，经 session context hook 写入 system[]（不阻断任务）
        if (translated.injected.length > 0) {
          pendingInjections.push(...translated.injected);
          while (pendingInjections.length > PENDING_INJECTIONS_CAP) {
            pendingInjections.shift();
          }
        }

        // 阻断（宿主/降级产出 block）：throw 让宿主拒绝执行（有意不 catch）
        if (translated.block) {
          throw new Error(`[ARCS] 已阻断 ${toolName}：${translated.block.reason}`);
        }
      });
    },
  };
}

/** 平台直接加载的默认导出对象 */
const plugin: OpencodePlugin = createOpencodePlugin();
export default plugin;

export {
  mapOpencodeEvent,
  opencodeEventToRaw,
  opencodeSessionId,
  opencodeToolInputToRaw,
  translateOpencodeDecision,
} from './mapping.js';
export { claimSession, configureClaims, createOpencodeAdapter, createPipeline, resetClaims } from './adapter.js';
export type { CanonicalEvent, OpencodeDecision, OpencodeEvent } from './mapping.js';
