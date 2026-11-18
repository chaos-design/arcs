// Hook 输出行为级校验：依据 Codex 官方 output schema + output_parser.rs 的实际解析规则。
// 零依赖；只覆盖本项目实际使用的字段子集。schema 落后于 parser 时以 parser 为准。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CODEX_SCHEMA = JSON.parse(
  readFileSync(join(ROOT, 'scripts/contracts/codex-pre-tool-use.output.schema.json'), 'utf8'),
);

const CODEX_TOP_KEYS = Object.keys(CODEX_SCHEMA.properties);
const CODEX_HSO_KEYS = Object.keys(
  CODEX_SCHEMA.definitions.PreToolUseHookSpecificOutputWire.properties,
);
const DECISIONS = new Set(['allow', 'deny', 'ask']);

function keysOf(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
}

/**
 * Codex PreToolUse 输出校验。
 * @param {unknown} output hook stdout 解析后的 JSON
 * @param {{ toolName?: string }} [context] 可选工具名，用于校验 updatedInput.command
 * @returns {string[]} 违规列表，空数组表示合法
 */
export function validateCodexPreToolUse(output, context = {}) {
  const errors = [];
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return ['输出必须是 JSON 对象'];
  }
  for (const key of keysOf(output)) {
    if (!CODEX_TOP_KEYS.includes(key)) errors.push(`顶层未知字段 ${key}（schema additionalProperties:false）`);
  }
  if (output['continue'] === false) errors.push('continue:false 解析后不支持，会被判失败');
  if (output['decision'] === 'approve') errors.push('decision:approve 解析后不支持');
  if ('stopReason' in output || 'suppressOutput' in output) {
    errors.push('stopReason / suppressOutput 解析后不支持');
  }

  const hso = output['hookSpecificOutput'];
  if (hso === undefined || hso === null) return errors;
  if (typeof hso !== 'object' || Array.isArray(hso)) {
    errors.push('hookSpecificOutput 必须是对象');
    return errors;
  }
  for (const key of keysOf(hso)) {
    if (!CODEX_HSO_KEYS.includes(key)) errors.push(`hookSpecificOutput 未知字段 ${key}`);
  }
  if (hso['hookEventName'] !== 'PreToolUse') errors.push('hookEventName 必须为 "PreToolUse"');

  const hasHookDecision =
    'permissionDecision' in hso || 'permissionDecisionReason' in hso || 'updatedInput' in hso;
  if (!hasHookDecision) return errors; // 仅 additionalContext 是合法形态

  const decision = hso['permissionDecision'];
  if (decision !== undefined && !DECISIONS.has(decision)) {
    errors.push(`permissionDecision 必须在 allow|deny|ask，收到 ${String(decision)}`);
  }
  if (decision === 'ask') errors.push('permissionDecision:ask 被 parser 一律拒绝');
  if (decision === 'allow' && !('updatedInput' in hso)) {
    errors.push('permissionDecision:allow 缺少 updatedInput（parser 判失败并放行原调用）');
  }
  if ('updatedInput' in hso && decision !== 'allow') {
    errors.push('updatedInput 缺少配对的 permissionDecision:allow（parser 拒绝改写）');
  }
  if (decision === 'deny' && typeof hso['permissionDecisionReason'] !== 'string') {
    errors.push('permissionDecision:deny 缺少 permissionDecisionReason（parser 判失败并放行）');
  } else if (
    decision === 'deny' &&
    typeof hso['permissionDecisionReason'] === 'string' &&
    hso['permissionDecisionReason'].trim() === ''
  ) {
    errors.push('permissionDecisionReason 不能为空字符串');
  }
  if ('additionalContext' in hso && typeof hso['additionalContext'] !== 'string') {
    errors.push('additionalContext 必须是字符串');
  }
  if ('updatedInput' in hso) {
    const updated = hso['updatedInput'];
    if (!updated || typeof updated !== 'object' || Array.isArray(updated)) {
      errors.push('updatedInput 必须是对象（完整替换参数）');
    } else if (/^(Bash|apply_patch)$/.test(context.toolName ?? '') && typeof updated['command'] !== 'string') {
      errors.push('Bash/apply_patch 的 updatedInput 必须含字符串 command');
    }
  }
  return errors;
}

/**
 * Claude 兼容平台（Claude Code / ZCode / Trae / WorkBuddy）PreToolUse 输出校验。
 * 共同点：permissionDecision 在 hso 内、additionalContext 也在 hso 内、顶层 continue 布尔。
 * 差异：WorkBuddy 改参字段为 modifiedInput；其余为 updatedInput。
 */
export function validateClaudeCompatiblePreToolUse(output, options = {}) {
  const { modifiedInputKey = 'updatedInput' } = options;
  const errors = [];
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return ['输出必须是 JSON 对象'];
  }
  for (const key of keysOf(output)) {
    if (!['hookSpecificOutput', 'continue', 'stopReason', 'systemMessage', 'suppressOutput'].includes(key)) {
      errors.push(`顶层未知字段 ${key}`);
    }
  }
  if ('continue' in output && typeof output['continue'] !== 'boolean') {
    errors.push('continue 必须是布尔值');
  }
  const hso = output['hookSpecificOutput'];
  if (!hso || typeof hso !== 'object' || Array.isArray(hso)) {
    errors.push('缺少 hookSpecificOutput 对象');
    return errors;
  }
  const allowed = ['hookEventName', 'permissionDecision', 'permissionDecisionReason', 'updatedInput', 'modifiedInput', 'additionalContext'];
  for (const key of keysOf(hso)) {
    if (!allowed.includes(key)) errors.push(`hookSpecificOutput 未知字段 ${key}`);
  }
  if (hso['hookEventName'] !== 'PreToolUse') errors.push('hookEventName 必须为 "PreToolUse"');
  const decision = hso['permissionDecision'];
  if (!DECISIONS.has(decision)) {
    errors.push(`permissionDecision 必须为 allow|deny|ask，收到 ${String(decision)}`);
  }
  if (decision === 'deny' && typeof hso['permissionDecisionReason'] !== 'string') {
    errors.push('deny 缺少 permissionDecisionReason');
  }
  if (typeof hso['permissionDecisionReason'] === 'string' && hso['permissionDecisionReason'].trim() === '') {
    errors.push('permissionDecisionReason 不能为空字符串');
  }
  if ('additionalContext' in hso && typeof hso['additionalContext'] !== 'string') {
    errors.push('additionalContext 必须在 hookSpecificOutput 内且为字符串');
  }
  if (modifiedInputKey in hso && decision !== 'allow') {
    errors.push(`${modifiedInputKey} 必须配对 permissionDecision:allow`);
  }
  return errors;
}

/** 保留旧名以兼容 08 号计划的调用点 */
export function validateClaudePreToolUse(output) {
  const errors = validateClaudeCompatiblePreToolUse(output);
  return errors.filter((e) => !e.startsWith('缺少 hookSpecificOutput'));
}
