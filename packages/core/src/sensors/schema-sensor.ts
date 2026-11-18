import type { ZodTypeAny } from 'zod';
import type { DriftSensor, DriftSignal, ExecutionContext, ToolCall } from '../types.js';

export interface SchemaPatchResult {
  fixable: boolean;
  /** 修复后的完整参数（整体替换语义） */
  patch?: Record<string, unknown>;
  evidence: string;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return m + n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = curr;
  }
  return prev[n] ?? 0;
}

/** 读取 ZodObject 的 shape 键名集合（跨版本安全读取） */
function shapeKeys(schema: ZodTypeAny): string[] | null {
  const shape = (schema as unknown as { shape?: Record<string, ZodTypeAny> }).shape;
  if (!shape) return null;
  return Object.keys(shape);
}

function coercePrimitive(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return value;
}

/**
 * 构造 L1 参数补丁：键名近似重命名（编辑距离 ≤2）→ 原始类型强转。
 * 策略：逐级尝试，任一级使 schema 通过即返回补丁；否则不可修复。
 */
export function buildSchemaPatch(toolCall: ToolCall, schema: ZodTypeAny): SchemaPatchResult {
  const keys = shapeKeys(schema);
  const args = { ...toolCall.args };
  const notes: string[] = [];

  // 1. 键名重命名（拼写幻觉）
  if (keys) {
    const unknownKeys = Object.keys(args).filter((k) => !keys.includes(k));
    for (const wrong of unknownKeys) {
      const value = args[wrong];
      delete args[wrong];
      const match = keys
        .map((k) => ({ k, d: levenshtein(wrong.toLowerCase(), k.toLowerCase()) }))
        .sort((x, y) => x.d - y.d)[0];
      if (match && match.d <= 2 && !(match.k in args)) {
        args[match.k] = value;
        notes.push(`键名修正 ${wrong}→${match.k}`);
      } else {
        args[wrong] = value; // 无法归属，保留原键让 schema 给出结论
      }
    }
    if (schema.safeParse(args).success) {
      return { fixable: true, patch: args, evidence: notes.join('; ') || '参数校验通过（重命名后）' };
    }
  }

  // 2. 原始类型强转（"3" → 3）
  const coerced: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) coerced[k] = coercePrimitive(v);
  if (schema.safeParse(coerced).success) {
    notes.push('字符串原始值强转');
    return { fixable: true, patch: coerced, evidence: notes.join('; ') };
  }

  const issueCount = schema.safeParse(toolCall.args).success ? 0 : 1;
  return { fixable: false, evidence: `参数校验失败且不可自动修复（${issueCount > 0 ? '存在无法归属的差异' : '未知差异'}）` };
}

/** L1 参数畸变检测：工具参数 Schema 校验 */
export class SchemaSensor implements DriftSensor {
  readonly kind = 'schema' as const;

  sense(ctx: ExecutionContext): DriftSignal[] {
    const schema = ctx.policy.toolSchemas?.[ctx.toolCall.name];
    if (!schema) return [];
    const parsed = schema.safeParse(ctx.toolCall.args);
    if (parsed.success) return [];
    const patch = buildSchemaPatch(ctx.toolCall, schema);
    return [
      {
        kind: 'schema',
        severity: patch.fixable ? 0.6 : 0.4,
        score: 1,
        evidence: patch.fixable ? `参数畸变（可修复）：${patch.evidence}` : `参数畸变（不可修复）：${patch.evidence}`,
      },
    ];
  }
}
