[English](./en/host-kit.md) · 中文

# 宿主运行时 `packages/host-kit`

## 包定位

11 家平台插件共用的运行时层：把「平台差异」收敛到一个包里，让 `plugins/*` 只保留宿主特有的 hooks 清单、字段别名与决策策略。

- **依赖方向**：`plugins/* → host-kit → plugin-kit → telemetry → core` 单链。
- **唯一的 packages 层 I/O 包**：审计落盘、会话文件锁、Hook stdin/stdout 桥都收在这里，由 `scripts/scan-deps.mjs` 红线扫描锁定（每项 node 内建按理由逐条登记）。

## 能力矩阵 `HOST_CAPABILITIES`

每个宿主一条 `HostCapabilities` 记录：`tier`（A/B/C）+ 五个能力开关（`patchArgs` / `redirectTool` / `injectMessage` / `suspend` / `block`）+ `note` 说明宿主怪癖。要点：

| 宿主 | tier | 关键怪癖 |
|---|---|---|
| claude-code | A | `hookSpecificOutput.permissionDecision(allow/deny/ask)` + `updatedInput` |
| opencode | A | `tool.execute.before` 中间件可改参、`permission.ask` 可挂起 |
| zcode / workbuddy / pi / deepseek | B | 可拒绝但无改参通道：L1/L3 降为注入，L4 降为 block |
| trae | C | 项目级 hooks 只读：always allow + `additionalContext` 采集 |
| chatgpt | A | Codex 兼容：改参 + deny；官方 schema 的 `ask` 「parsed but not supported」，降为带原因的 deny |
| qwen-code | B | Gemini 兼容 hooks：可注入 + deny，无稳定改参通道 |

矩阵一致性由两层锁定：`conformance.test.ts`（能力矩阵 ↔ 行为一致性）与 `scripts/verify-host-contracts.mjs`（静态断言 + Codex 官方 schema 行为级校验）。

## Hook 入口桥 `runHookEntry`

Hook 型平台（claude-code / zcode / workbuddy / trae / chatgpt / qwen-code）每个事件 fork 一次 Hook 进程，`runHookEntry` 把这一的一次性往返收敛为固定管线：

```
stdin 文本 → parse(text, env) → NativeEvent → nativeToRaw → PluginRuntime.run
          → 效果翻译（applyEffect 按能力矩阵） → serialize(decision, native) → stdout
```

- `HookEntryAdapter` 实现完整 `HostAdapter`：`subscribe` 空操作（hook 非长订阅）、`normalize` 组装 `ExecutionContext`、`materialize` 逐条翻译并记录 `decision.level`。
- **Suspend 不在 hook 内同步调 HITL**（hook 有 ~5s 超时），而是按能力翻译为 `ask`（A 级）或 `block`（B 级）；真正的异步 HITL 仅由具备事件订阅能力的平台（opencode/pi）在专用 adapter 内完成。
- `shouldSteer` 过滤非纠偏事件（避免 prompt 文本误触发引擎）。
- fail-open 兜底：管线任何异常都会序列化出「放行 + 降级原因」的决策，绝不把异常抛给宿主进程。

## 统一 Hook 原语（13 号计划）

所有 Hook 插件不再各写一份解析与序列化，而是声明式复用原语：

| 原语 | 职责 |
|---|---|
| `parseHookPayload(text, env, options)` | stdin JSON → `NativeEvent`；字段别名、事件兜底、字符串实参包裹、宿主自有 payload 钩子；畸形 JSON 不抛异常 |
| `withHookEvent(eventArg, parse)` | 把 hook 命令的 `--event` 固化为 parse 闭包 |
| `serializeHookDecision(decision, native, profile)` | `HostDecision` → 宿主 hook JSON；权限映射、deny 理由、改参字段、顶层 `continue` 由 profile 声明 |
| `hookContextText(decision)` | 注入提示与能力降级说明的统一拼装 |
| `makeNativeEvent` / `shouldSteerPreToolUse` | 事件订阅型插件共用的构造与决策门槛 |

插件只保留宿主差异：`CHATGPT_PROFILE`（Codex 规则）、`QWEN_CODE_PROFILE`（Tier B 保守策略）等。契约护栏会实际执行各插件的序列化函数并断言输出合法，确保共享算法不会掩盖宿主差异。

## 效果翻译 `applyEffect` / `translateEffects`

`SteeringEffect[]`（core 保证 Suspend 位于末位）→ 宿主 `HostDecision`。任何能力缺口都 fail-open 且**留痕**：

| 缺口 | 行为 | degraded 标记 |
|---|---|---|
| 无 `patchArgs` | 注入提示请 Agent 自查参数 | `patchArgs` |
| 无 `redirectTool` | 注入建议改用安全工具 | `redirectTool` |
| 无 `injectMessage` | 静默丢弃（宿主连注入都没有） | `injectMessage` |
| 无 `suspend` 但可 block | L4 挂起降为阻断 | `suspend→block` |
| 无 `suspend` 且不可 block | 放行 + 注入解释 | `suspend→allow` |

`HostDecision` 携带 `kind: allow|block|ask`、`updatedInput`、`updatedName`、`injected[]`、`degraded[]`、`level`，由各插件 `serialize*` 函数编码为平台输出（chatgpt 的 Codex 解析器怪癖、workbuddy 的 `modifiedInput` 字段等都在插件层处理）。

## 审计落盘 `FileAuditSink`

- 路径：`ARCS_AUDIT_FILE` 指定精确文件；否则 `<ARCS_HOME>/audit/<host>/<YYYY-MM-DD>.jsonl`（默认 `~/.arcs`）。
- `createAuditSink(env)` 按环境变量构造；未设置任何变量时返回 `undefined`，调用方回退内存 sink，行为与旧版一致。
- 写入为 `appendFileSync` 单次写完整行，失败静默（遥测不得阻塞主链）；内容只含已校验的 `AuditEvent` 字段，**不含原始 prompt 与工具参数**。
- 装配点：`runHookEntry`、opencode/pi/deepseek 订阅型插件、`arcs-plugin-mcp` CLI；产物供 `pnpm dashboard` 消费。

## 会话文件锁 `SessionClaim`

多进程 Hook 模型没有共享内存，跨事件续接会话状态靠 `~/.arcs` 下的 claim 文件：

- **抢占**：首次 `open('wx')` 原子创建；已存在时仅在「owner 进程已退出（ESRCH）、同 pid 续约（幂等）、或记录超 TTL（默认 30 分钟）」三种情况下接管。
- **文件名安全**：`sanitizeClaimId` 拒绝路径穿越；超 96 字符的 id 截断到 80 字符 + 原 id 的 sha256 前 16 位，防不同长 id 截断后碰撞到同一文件。
- **丢失 trace 优于重复/中断**：读 claim 失败（瞬时 I/O 错误）时视为已 claim 接受重复纠偏，也不抛异常打断 Agent；`releaseSession` 删除失败同样忽略。
- `createSessionClaim(source, home?)` 返回句柄，集中 HOME 解析（`ARCS_CLAIM_HOME` → `ARCS_HOME` → `~/.arcs`）与本进程持有集合（`releaseAll` 兜底）。

## 导出总览

除上述章节展开的核心面外，`packages/host-kit/src/index.ts` 还导出这些配套 API：

| 导出 | 用途 |
|---|---|
| `PLATFORMS` / `isPlatform` | 平台名单一来源：全部受支持宿主的名字与运行时校验，插件不得自造平台名 |
| `capabilitiesFor` / `hasCapability` | 按平台读取能力矩阵记录 / 判断单个能力开关，插件不得硬编码布尔值 |
| `emptyDecision` | `HostDecision` 初始值（放行 + 空 effect 列表），adapter 组装决策的起点 |
| `goalFromArgs` / `readInput` | `--goal` / `ARCS_GOAL` 解析与 stdin 全量读取，插件 CLI 入口的固定搭配 |
| `claimDirectory` / `claimFilePath` / `claimSession` / `defaultIsAlive` / `nodeClaimFs` | `SessionClaim` 的路径推导、原子抢占、进程存活探测与 node 文件系统适配；`ClaimFs` / `ClaimRecord` 为对应类型 |

## 测试

- `claim.test.ts`（抢占/TTL/幂等/防碰撞）、`entry.test.ts`（stdin→决策往返、fail-open）、`decision.test.ts`（逐能力降级矩阵）、`audit-sink.test.ts`（路径与静默失败）、`conformance.test.ts`（能力矩阵 ↔ 行为一致性，6 例）。
- 真实宿主端到端由集成方执行：`node scripts/host-real-check.mjs`（探测宿主 CLI + `--verify` 统计审计 JSONL）。
