# @chaos-design/arcs-host-kit

ARCS 宿主插件共用运行时：能力矩阵、Hook 入口桥、效果翻译、审计落盘与会话文件锁。8 家 Hook/扩展型插件共享本包，**禁止各写一套 recorder**；本包是 packages 层唯一允许 node I/O 的包（由 `scripts/scan-deps.mjs` 白名单锁定）。

## 能力

- **HOST_CAPABILITIES / capabilitiesFor / hasCapability**：8 平台能力矩阵（tier A/B/C + patchArgs / redirectTool / injectMessage / suspend / block 五开关），插件只能引用不能硬编码
- **HookEntryAdapter / runHookEntry**：`stdin → 原生事件 → RawEvent → runtime.run → 宿主输出` 固定管线；任何异常 fail-open（exit 0 / 只写 stderr）
- **applyEffect / translateEffects**：按能力矩阵把 `SteeringEffect` 翻译为宿主原生决策，能力缺口一律降级 + 留审计痕迹
- **FileAuditSink / createAuditSink**：审计 JSONL 落盘（`ARCS_HOME` / `ARCS_AUDIT_FILE` 控制，未设置不落盘）
- **createSessionClaim 系列**：跨进程会话文件锁（`open('wx')` 原子抢占、TTL、sha256 防截断碰撞）
- **PLATFORMS / isPlatform**：平台名单一来源；**goalFromArgs / readInput**：`--goal` / `ARCS_GOAL` 解析与 stdin 读取

## 安装

```bash
pnpm add @chaos-design/arcs-host-kit
```

详细设计见 [docs/host-kit.md](https://github.com/chaos-design/arcs/blob/main/docs/host-kit.md)。
