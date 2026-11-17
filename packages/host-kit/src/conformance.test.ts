import { describe, expect, it } from 'vitest';
import type { SteeringEffect } from '@chaos-design/arcs-core';
import { HOST_CAPABILITIES } from './capabilities.js';
import { translateEffects } from './decision.js';
import { PLATFORMS } from './platforms.js';

const subject = { name: 'bash', args: { command: 'echo hi' } };

describe('跨平台能力一致性', () => {
  it('每个平台恰好有一条完整能力声明', () => {
    expect(Object.keys(HOST_CAPABILITIES).sort()).toEqual([...PLATFORMS].sort());
    for (const name of PLATFORMS) {
      const caps = HOST_CAPABILITIES[name];
      expect(caps.tier).toMatch(/^[ABC]$/);
      expect(caps.note.length).toBeGreaterThan(10);
      expect(caps.source).toBe(name);
    }
  });

  it('PatchArgs：只有声明 patchArgs 的宿主才写回 updatedInput', () => {
    const effects: SteeringEffect[] = [{ type: 'PatchArgs', patch: { command: 'echo fixed' } }];
    for (const name of PLATFORMS) {
      const d = translateEffects(effects, HOST_CAPABILITIES[name], subject);
      expect(!!d.updatedInput, name).toBe(HOST_CAPABILITIES[name].patchArgs);
      expect(d.degraded.includes('patchArgs'), name).toBe(!HOST_CAPABILITIES[name].patchArgs);
      expect(d.kind, name).toBe('allow');
    }
  });

  it('RedirectTool：只有声明 redirectTool 的宿主才写回 updatedName', () => {
    const effects: SteeringEffect[] = [{ type: 'RedirectTool', target: 'safe-read' }];
    for (const name of PLATFORMS) {
      const d = translateEffects(effects, HOST_CAPABILITIES[name], subject);
      expect(!!d.updatedName, name).toBe(HOST_CAPABILITIES[name].redirectTool);
      expect(d.degraded.includes('redirectTool'), name).toBe(!HOST_CAPABILITIES[name].redirectTool);
    }
  });

  it('InjectMessage：注入能力缺失时不注入、不阻断', () => {
    const effects: SteeringEffect[] = [{ type: 'InjectMessage', role: 'system', content: '回头' }];
    for (const name of PLATFORMS) {
      const d = translateEffects(effects, HOST_CAPABILITIES[name], subject);
      expect(d.injected.length > 0, name).toBe(HOST_CAPABILITIES[name].injectMessage);
      expect(d.kind, name).toBe('allow');
    }
  });

  it('Suspend：ask / block / allow 与 caps 严格对应', () => {
    const effects: SteeringEffect[] = [{ type: 'Suspend', reason: '高危' }];
    for (const name of PLATFORMS) {
      const caps = HOST_CAPABILITIES[name];
      const d = translateEffects(effects, caps, subject);
      const expected = caps.suspend ? 'ask' : caps.block ? 'block' : 'allow';
      expect(d.kind, name).toBe(expected);
      expect(d.level, name).toBe(4);
      if (!caps.suspend && caps.block) expect(d.degraded, name).toContain('suspend→block');
      if (!caps.suspend && !caps.block) expect(d.degraded, name).toContain('suspend→allow');
    }
  });

  it('任一平台对空效果序列都 fail-open 放行', () => {
    for (const name of PLATFORMS) {
      const d = translateEffects([], HOST_CAPABILITIES[name], subject);
      expect(d.kind, name).toBe('allow');
      expect(d.injected, name).toEqual([]);
      expect(d.degraded, name).toEqual([]);
      expect(d.level, name).toBeNull();
    }
  });
});
