import type { AuditEvent } from './audit.js';

/** 遥测接收契约：emit 不得抛异常、不得阻塞主链（docs/telemetry.md） */
export interface TelemetrySink {
  emit(e: AuditEvent): void;
}

/** 内存接收端：开发与测试用 */
export class InMemorySink implements TelemetrySink {
  readonly events: AuditEvent[] = [];

  /**
   * @param maxEvents 可选容量上限：超过后 FIFO 逐出最旧事件（长会话防泄漏）。
   * 缺省不设上限，保持既有行为；面板/长驻进程建议显式传入。
   */
  constructor(private readonly maxEvents?: number) {}

  emit(e: AuditEvent): void {
    this.events.push(e);
    if (this.maxEvents !== undefined) {
      while (this.events.length > this.maxEvents) this.events.shift();
    }
  }

  clear(): void {
    this.events.length = 0;
  }
}
