import type { DriftSensor, DriftSignal, ExecutionContext } from '../types.js';
import { matchPath } from '../glob.js';

/** 从参数键名与值形态识别"像路径"的字段 */
const PATH_KEY_RE = /path|file|dir|directory|folder|target|dest/i;

/** 默认高危命令正则（字符串形式） */
export const DEFAULT_DANGEROUS_COMMANDS = [
  'rm\\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)',
  '\\bsudo\\b',
  '\\bmkfs\\b',
  '\\bdd\\b\\s+if=',
  'chmod\\s+-R\\s+777',
  '\\b(curl|wget)\\b[^|]*\\|\\s*(sudo\\s+)?(ba)?sh\\b',
  '>\\s*/dev/sd',
];

export class PolicySensor implements DriftSensor {
  readonly kind = 'policy' as const;

  sense(ctx: ExecutionContext): DriftSignal[] {
    const signals: DriftSignal[] = [];

    // 受保护路径扫描（L4）
    for (const [key, value] of Object.entries(ctx.toolCall.args)) {
      if (typeof value !== 'string') continue;
      const looksLikePath = PATH_KEY_RE.test(key) || /^(\/|\.\/|\.\.\/|~\/)/.test(value);
      if (!looksLikePath) continue;
      if (matchPath(value, ctx.policy.protectedPaths)) {
        signals.push({
          kind: 'policy',
          severity: 1,
          score: 1,
          evidence: `受保护路径命中：${key}="${value}"（规则：${ctx.policy.protectedPaths.join(', ')}）`,
        });
      }
    }

    // 高危命令扫描（L4）
    const command =
      typeof ctx.toolCall.args.command === 'string'
        ? ctx.toolCall.args.command
        : typeof ctx.toolCall.args.cmd === 'string'
          ? (ctx.toolCall.args.cmd as string)
          : '';
    const patterns = ctx.policy.dangerousCommands.length
      ? ctx.policy.dangerousCommands
      : DEFAULT_DANGEROUS_COMMANDS;
    if (command) {
      for (const pattern of patterns) {
        try {
          if (new RegExp(pattern, 'i').test(command)) {
            signals.push({
              kind: 'policy',
              severity: 1,
              score: 1,
              evidence: `高危命令命中：/${pattern}/i => "${command}"`,
            });
            break;
          }
        } catch {
          // 非法正则由集成方负责；core 侧跳过
        }
      }
    }

    return signals;
  }
}
