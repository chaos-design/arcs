import { describe, expect, it } from 'vitest';
import type { SteeringEffect } from '@chaos-design/arcs-core';
import { HOST_CAPABILITIES } from './capabilities.js';
import { applyEffect, emptyDecision, translateEffects } from './decision.js';

const subject = { name: 'bash', args: { command: 'echo hi' } };
const full = HOST_CAPABILITIES['claude-code'];
const limited = HOST_CAPABILITIES['zcode'];
const passive = HOST_CAPABILITIES['trae'];

describe('applyEffect', () => {
  it('PassThrough 保持放行且不报告等级', () => {
    const d = applyEffect(emptyDecision(), { type: 'PassThrough' }, full, subject);
    expect(d.kind).toBe('allow');
    expect(d.degraded).toEqual([]);
  });

  it('PatchArgs 在可改参平台写入 updatedInput', () => {
    const patch = { command: 'echo fixed' };
    const d = applyEffect(emptyDecision(), { type: 'PatchArgs', patch }, full, subject);
    expect(d.updatedInput).toEqual(patch);
    expect(d.degraded).toEqual([]);
  });

  it('PatchArgs 在不可改参平台降级为注入并留审计', () => {
    const d = applyEffect(
      emptyDecision(),
      { type: 'PatchArgs', patch: { path: 'a.txt' } },
      limited,
      subject,
    );
    expect(d.updatedInput).toBeUndefined();
    expect(d.degraded).toContain('patchArgs');
    expect(d.injected[0]?.role).toBe('system');
    expect(d.kind).toBe('allow');
  });

  it('RedirectTool 在具备改道能力的宿主写入 updatedName（MCP 代理形态）', () => {
    const d = applyEffect(
      emptyDecision(),
      { type: 'RedirectTool', target: 'safe-read' },
      { ...full, redirectTool: true },
      subject,
    );
    expect(d.updatedName).toBe('safe-read');
  });

  it('RedirectTool 在宿主插件上降级为注入', () => {
    const d = applyEffect(
      emptyDecision(),
      { type: 'RedirectTool', target: 'safe-read' },
      full,
      subject,
    );
    expect(d.updatedName).toBeUndefined();
    expect(d.degraded).toContain('redirectTool');
    expect(d.injected[0]?.content).toContain('safe-read');
  });

  it('Suspend 在支持挂起的平台返回 ask', () => {
    const d = applyEffect(
      emptyDecision(),
      { type: 'Suspend', reason: '高危命令' },
      full,
      subject,
    );
    expect(d.kind).toBe('ask');
    expect(d.reason).toBe('高危命令');
    expect(d.degraded).toEqual([]);
  });

  it('Suspend 在只能拒绝的平台降级为 block', () => {
    const d = applyEffect(
      emptyDecision(),
      { type: 'Suspend', reason: '保护路径' },
      limited,
      subject,
    );
    expect(d.kind).toBe('block');
    expect(d.degraded).toContain('suspend→block');
  });

  it('Suspend 在无阻塞能力的平台 fail-open 放行并注入说明', () => {
    const d = applyEffect(
      emptyDecision(),
      { type: 'Suspend', reason: '审批' },
      passive,
      subject,
    );
    expect(d.kind).toBe('allow');
    expect(d.degraded).toContain('suspend→allow');
    expect(d.injected[0]?.content).toContain('fail-open');
  });

  it('injectMessage 能力缺失时不注入也不阻断', () => {
    const d = applyEffect(
      emptyDecision(),
      { type: 'InjectMessage', role: 'system', content: '请回头' },
      { ...passive, injectMessage: false },
      subject,
    );
    expect(d.injected).toEqual([]);
    expect(d.degraded).toContain('injectMessage');
    expect(d.kind).toBe('allow');
  });
});

describe('translateEffects', () => {
  it('按效果序列报告纠偏等级', () => {
    const effects: SteeringEffect[] = [
      { type: 'InjectMessage', role: 'system', content: 'x' },
      { type: 'RedirectTool', target: 'safe' },
    ];
    expect(translateEffects(effects, full, subject).level).toBe(3);
    expect(
      translateEffects([{ type: 'PatchArgs', patch: {} }], full, subject).level,
    ).toBe(1);
    expect(
      translateEffects([{ type: 'Suspend', reason: 'x' }], full, subject).level,
    ).toBe(4);
  });

  it('Resolve 后等级与能力降级互不影响', () => {
    const d = translateEffects(
      [{ type: 'Suspend', reason: 'x' }],
      limited,
      subject,
    );
    expect(d.level).toBe(4);
    expect(d.kind).toBe('block');
  });
});
