import type { AuditEvent } from './audit.js';

/** 遥测接收契约：emit 不得抛异常、不得阻塞主链（docs/telemetry.md） */
export interface TelemetrySink {
  emit(e: AuditEvent): void;
}

/** 内存接收端：开发与测试用 */
export class InMemorySink implements TelemetrySink {
  readonly events: AuditEvent[] = [];

  emit(e: AuditEvent): void {
    this.events.push(e);
  }

  clear(): void {
    this.events.length = 0;
  }
}
