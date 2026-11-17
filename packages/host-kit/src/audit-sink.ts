import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AuditEvent, TelemetrySink } from '@chaos-design/arcs-telemetry';

export interface FileAuditSinkOptions {
  /** 精确文件路径（ARCS_AUDIT_FILE），优先于 home 规则 */
  file?: string;
  /** 审计根目录（ARCS_HOME），默认 ~/.arcs */
  home?: string;
}

function safeSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '-');
  return cleaned === '.' || cleaned === '..' || cleaned === '' ? 'unknown' : cleaned.slice(0, 96);
}

/**
 * 本地审计落盘：append-only JSONL，按 host + UTC 日期分文件。
 * 只写 AuditEvent 已校验的结构化字段，不含原始 prompt / 工具参数。
 * emit 失败一律静默——遥测不得阻塞主链（docs/constraints.md #10）。
 */
export class FileAuditSink implements TelemetrySink {
  constructor(private readonly options: FileAuditSinkOptions = {}) {}

  /** 解析事件对应的审计文件；公开以便检查脚本与测试复用 */
  filePath(event: Pick<AuditEvent, 'host' | 'ts'>): string {
    if (this.options.file) return this.options.file;
    const home = this.options.home ?? process.env['ARCS_HOME'] ?? join(homedir(), '.arcs');
    const host = safeSegment(event.host || 'unknown');
    const day = new Date(event.ts).toISOString().slice(0, 10);
    return join(home, 'audit', host, `${day}.jsonl`);
  }

  emit(event: AuditEvent): void {
    try {
      const file = this.filePath(event);
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
    } catch {
      // 写失败静默降级，Agent 执行流不受影响
    }
  }
}

/**
 * 从环境变量构造 sink。两者都未设置时返回 undefined，保持既有行为。
 * ARCS_AUDIT_FILE 指向精确文件；ARCS_HOME 则启用按 host/日期分文件。
 */
export function createAuditSink(env: NodeJS.ProcessEnv = process.env): FileAuditSink | undefined {
  const file = env['ARCS_AUDIT_FILE'];
  const home = env['ARCS_HOME'];
  if (!file && !home) return undefined;
  return new FileAuditSink(file ? { file } : { home });
}
