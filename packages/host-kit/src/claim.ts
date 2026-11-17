import * as nodeFs from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 可被测试替换的最小 fs 接口（避免测试依赖真实磁盘） */
export interface ClaimFs {
  mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  openSync(path: string, flags: string): number;
  closeSync(fd: number): void;
  writeSync(fd: number, data: string): number;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string, encoding: 'utf8'): void;
  unlinkSync(path: string): void;
  existsSync(path: string): boolean;
}

export const nodeClaimFs: ClaimFs = {
  mkdirSync: nodeFs.mkdirSync,
  openSync: nodeFs.openSync,
  closeSync: nodeFs.closeSync,
  writeSync: nodeFs.writeSync,
  readFileSync: (path, encoding) => nodeFs.readFileSync(path, encoding),
  writeFileSync: (path, data, encoding) => nodeFs.writeFileSync(path, data, encoding),
  unlinkSync: nodeFs.unlinkSync,
  existsSync: nodeFs.existsSync,
};

export interface ClaimRecord {
  pid: number;
  claimedAt: string;
}

export interface SessionClaimOptions {
  /** 共享根目录；多进程必须使用同一个值，否则无法互斥 */
  home: string;
  source: string;
  sessionId: string;
  pid?: number;
  /** 旧 owner 记录的存活时间超过该值即可接管，默认 30 分钟 */
  ttlMs?: number;
  now?: () => number;
  fs?: ClaimFs;
  isAlive?: (pid: number) => boolean;
}

/** 把 sessionId 收敛为安全文件名（拒绝路径穿越） */
export function sanitizeClaimId(sessionId: string): string {
  const cleaned = sessionId.replace(/[^a-zA-Z0-9._-]/g, '-');
  const safe = cleaned === '.' || cleaned === '..' ? 'invalid' : cleaned;
  return safe.slice(0, 96) || 'unknown';
}

export function claimDirectory(options: SessionClaimOptions): string {
  return join(options.home, options.source, '.claims');
}

export function claimFilePath(options: SessionClaimOptions): string {
  return join(claimDirectory(options), `${sanitizeClaimId(options.sessionId)}.claim`);
}

/** pid 存活检测：ESRCH 视为已退出可接管；EPERM 表示存在但无权，视为存活 */
export function defaultIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    return code === 'EPERM';
  }
}

function readRecord(text: string): ClaimRecord | undefined {
  try {
    const value = JSON.parse(text) as Partial<ClaimRecord>;
    if (typeof value.pid === 'number' && typeof value.claimedAt === 'string') {
      return { pid: value.pid, claimedAt: value.claimedAt };
    }
  } catch {
    // 损坏或半写入的 claim 视为可接管
  }
  return undefined;
}

/**
 * 原子抢占会话记录权。首次用 open('wx') 保证只有一个进程成功；
 * 已存在时仅当 owner 已退出、pid 与当前相同（幂等）、或记录超过 TTL 才接管。
 */
export function claimSession(options: SessionClaimOptions): boolean {
  const fs = options.fs ?? nodeClaimFs;
  const pid = options.pid ?? process.pid;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 1_800_000;
  const isAlive = options.isAlive ?? defaultIsAlive;
  const file = claimFilePath(options);
  const record: ClaimRecord = { pid, claimedAt: new Date(now()).toISOString() };
  const content = `${JSON.stringify(record)}\n`;

  try {
    fs.mkdirSync(claimDirectory(options), { recursive: true });
    const fd = fs.openSync(file, 'wx');
    try {
      fs.writeSync(fd, content);
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (err) {
    if ((err as { code?: string })?.code !== 'EEXIST') return true; // 丢失 trace 优于重复
  }

  try {
    const text = fs.readFileSync(file, 'utf8');
    const previous = readRecord(text);
    if (!previous) {
      fs.writeFileSync(file, content, 'utf8');
      return true;
    }
    if (previous.pid === pid) {
      fs.writeFileSync(file, content, 'utf8'); // 同进程续约
      return true;
    }
    if (!isAlive(previous.pid)) {
      fs.writeFileSync(file, content, 'utf8');
      return true;
    }
    const age = now() - Date.parse(previous.claimedAt);
    if (Number.isFinite(age) && age > ttlMs) {
      fs.writeFileSync(file, content, 'utf8');
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** 释放会话记录权；删除失败不影响调用方（trace 丢失优于中断 Agent） */
export function releaseSession(options: SessionClaimOptions): void {
  try {
    (options.fs ?? nodeClaimFs).unlinkSync(claimFilePath(options));
  } catch {
    // 忽略
  }
}

export interface SessionClaimHandle {
  readonly home: string;
  /** 抢占会话；同进程重复抢占为幂等成功，其它存活进程抢占失败 */
  claim(sessionId: string): boolean;
  release(sessionId: string): void;
  /** 仅释放本句柄抢到的会话，不触碰其它进程的 claim */
  releaseAll(): void;
}

/** 平台插件共用的 claim 句柄：集中 HOME 解析与本进程持有集合 */
export function createSessionClaim(source: string, home?: string): SessionClaimHandle {
  const root = home ?? process.env['ARCS_CLAIM_HOME'] ?? process.env['ARCS_HOME'] ?? join(homedir(), '.arcs');
  const owned = new Set<string>();
  const options = (sessionId: string): SessionClaimOptions => ({ home: root, source, sessionId });
  return {
    home: root,
    claim(sessionId: string): boolean {
      const ok = claimSession(options(sessionId));
      if (ok) owned.add(sessionId);
      return ok;
    },
    release(sessionId: string): void {
      releaseSession(options(sessionId));
      owned.delete(sessionId);
    },
    releaseAll(): void {
      for (const id of owned) releaseSession(options(id));
      owned.clear();
    },
  };
}
