import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { claimFilePath, claimSession, releaseSession, sanitizeClaimId } from './claim.js';

const homes: string[] = [];
function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'arcs-claim-'));
  homes.push(home);
  return home;
}
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

const opts = (home: string, extra: Record<string, unknown> = {}) => ({
  home,
  source: 'pi',
  sessionId: 'session-a',
  pid: 1111,
  ...extra,
});

describe('SessionClaim', () => {
  it('首次抢占成功并写入 pid 记录', () => {
    const home = freshHome();
    expect(claimSession(opts(home))).toBe(true);
    const file = claimFilePath(opts(home));
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(1111);
  });

  it('同 pid 重复抢占幂等成功', () => {
    const home = freshHome();
    expect(claimSession(opts(home))).toBe(true);
    expect(claimSession(opts(home))).toBe(true);
  });

  it('存活 owner 且未过期时拒绝抢占', () => {
    const home = freshHome();
    expect(claimSession(opts(home, { isAlive: () => false }))).toBe(true); // owner 先退出
    expect(
      claimSession(opts(home, { pid: 2222, isAlive: () => true, now: () => Date.parse('2026-01-01T00:00:00Z') })),
    ).toBe(false);
  });

  it('旧 owner 已退出时可接管', () => {
    const home = freshHome();
    expect(claimSession(opts(home, { pid: 1111, isAlive: () => false }))).toBe(true);
    expect(claimSession(opts(home, { pid: 2222, isAlive: () => false }))).toBe(true);
    expect(JSON.parse(readFileSync(claimFilePath(opts(home)), 'utf8')).pid).toBe(2222);
  });

  it('owner 存活但记录超过 TTL 时可接管', () => {
    const home = freshHome();
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    expect(claimSession(opts(home, { now: () => t0, isAlive: () => true }))).toBe(true);
    expect(
      claimSession(opts(home, {
        pid: 2222,
        now: () => t0 + 1_800_001,
        isAlive: () => true,
      })),
    ).toBe(true);
  });

  it('损坏的 claim 文件可接管', () => {
    const home = freshHome();
    const file = claimFilePath(opts(home));
    expect(claimSession(opts(home))).toBe(true);
    writeFileSync(file, 'not json');
    expect(claimSession(opts(home, { pid: 9999 }))).toBe(true);
  });

  it('release 后可重新抢占', () => {
    const home = freshHome();
    const o = opts(home);
    expect(claimSession(o)).toBe(true);
    releaseSession(o);
    expect(existsSync(claimFilePath(o))).toBe(false);
    expect(claimSession(opts(home, { pid: 3333 }))).toBe(true);
  });

  it('sessionId 路径穿越被收敛为安全文件名', () => {
    expect(sanitizeClaimId('../../etc/passwd')).not.toContain('/');
    expect(sanitizeClaimId('..')).toBe('invalid');
    expect(sanitizeClaimId('')).toBe('unknown');
  });
});
