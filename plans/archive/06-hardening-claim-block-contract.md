---
title: 宿主插件深度收尾：文件 claim、DeepSeek 阻断通道与契约验证
priority: P1
created: 2026-11-17 15:01:53
updated: 2026-11-17 15:23:05
---

# 宿主插件深度收尾：文件 claim、DeepSeek 阻断通道与契约验证

## 目标

收尾 05 号计划留下的三项风险：把 OpenCode/Pi 的会话 claim 从内存 Set 升级为带 TTL 与 pid 的文件锁；给 DeepSeek 注入可选真实阻断通道；建立静态契约校验与本机可做的宿主加载 smoke test

## 范围

本计划收尾 05 号计划（已归档）明确列出、但未完成的 3 项风险，引用 `plans/archive/05-host-plugins-all-platforms.md` 的风险 #7/#8 与"真实宿主实测"待办。

包含：

- `packages/host-kit` 新增 `SessionClaim`：`<home>/<source>/.claims/<sessionId>.claim`，`fs.openSync(path,'wx')` 原子抢锁；文件内容 `{pid, claimedAt}`；旧 owner 已退出（`process.kill(pid,0)` 抛 `ESRCH`）或超过 TTL（默认 30 分钟）时可接管；`EPERM` 视为存活不接管。提供 `release()` 与可注入的 `fs`/`pid`/时钟依赖以便测试。
- `plugins/opencode` 与 `plugins/pi` 移除内存 `Set`，改为使用 `SessionClaim`；保留现有 `claimSession` API 形状以兼容测试，内部委托文件锁。
- `plugins/deepseek` 新增可选 `blockTransport?: (decision: HostDecision, ctx) => Promise<boolean>` 注入点（通过 `apply` 的 config 传入）：有通道时 `Suspend` 决策调用它真正阻断；无通道时保持现有 `ctx.emit('arcs/decision')` 广播 + 审计，并在文档明确"需宿主消费事件"。
- `scripts/verify-host-contracts.mjs`：校验 8 个插件的 manifest/hooks.json 存在且结构合法、事件数量与能力矩阵一致、Codex/Claude 的 hook 输出 schema 符合官方关键约束（`hookEventName` 必填、`permissionDecision` 枚举、`additionalProperties:false` 对应的字段白名单）。
- 用隔离的临时 `HOME`/`XDG_CONFIG_HOME` 验证 OpenCode 能发现并加载插件配置、Pi 能通过 `-e` 加载扩展文件（不触发模型调用、不改动用户全局配置）。
- 文档同步：`docs/plugins.md`、`plugins/{opencode,pi,deepseek}/README.md`、本计划风险段。

不包含：

- 不触发任何真实模型调用或 API 消耗；不验证需要在线账号的端到端 Agent 运行。
- 不实现 Claude/Codex/ZCode/WorkBuddy/Trae 的真实宿主实测（本机无 CLI），只做静态契约校验。
- 不改动 core/plugin-kit/telemetry 的算法与契约；不改动其它 5 个插件。
- 不实现分布式锁（Redis 等）；文件锁仅解决单机多进程去重。
- 不发布 marketplace 或改动用户全局配置。

## 实施任务

- [x] 在 host-kit 新增可复用的 SessionClaim 文件锁（wx 创建 + TTL + pid 存活检测）与单测
- [x] OpenCode 接入文件 claim 替换内存 Set，验证互斥与旧 owner 接管
- [x] Pi 接入文件 claim（pid 语义），验证互斥与旧 owner 接管
- [x] DeepSeek 新增 blockTransport 注入契约：有通道则真正阻断，无通道则回退事件广播 + 审计
- [x] 新增 verify-host-contracts.mjs：校验 8 平台 manifest/hooks.json 结构与关键 hook 输出 schema 约束
- [x] 用隔离 HOME 做 OpenCode / Pi 的插件加载 smoke test（不触发模型调用），记录无法验证项
- [x] 同步 docs/plugins.md、各插件 README 与风险说明
- [x] 全量验证：build/lint/test/scan + 契约校验脚本 + 文件锁并发夹具

## 完成标准

- [x] code: 8 个实施任务全部勾选；`SessionClaim` 落地并被 opencode/pi 实际调用；DeepSeek `blockTransport` 为可选且默认行为不变；无内存 Set 残留
- [x] linter_result: `pnpm build && pnpm lint` 退出码均为 0，15 个 workspace 包无 TS error
- [x] unit_test_result: `pnpm test` 退出码为 0；`SessionClaim` ≥ 6 用例（首次抢占 / 同 pid 重复 / 存活 owner 拒绝 / 死 owner 接管 / TTL 过期接管 / release 后可重抢）；opencode/pi 各 ≥ 1 用例证明走文件锁；DeepSeek ≥ 2 用例证明有/无 blockTransport 两条路径；记录总用例数
- [x] func_test_result: `pnpm scan` 退出码 0 且 0 违规；`node scripts/verify-host-contracts.mjs` 退出码 0 并报告 8 平台检查通过；文件锁用真实子进程/临时 HOME 夹具验证互斥；OpenCode/Pi 加载 smoke test 有明确结果或"受限于无凭据"记录
- [x] status: 已记录无法真实实测的平台与原因、文件锁单机边界、DeepSeek 无通道时的审计层限制，以及下方具体回滚命令

## 风险与回滚

- 风险：
  1. 本机无模型 API 凭据，OpenCode/Pi 的真实对话联调不可执行 → 已做隔离 HOME smoke：`opencode debug config --standalone` 确认读取插件路径，`pi -e <插件> --no-extensions --list-models` 无扩展加载错误但提示 "No models available"；未触发模型调用。其余结论基于静态契约与 mock。真实阻塞语义仍需在宿主上验证。
  2. `process.kill(pid,0)` 在跨平台与容器环境下语义不同（EPERM 表示存在但无权）→ EPERM 一律视为存活不接管，避免误抢；Windows 支持有限，需在文档标注。
  3. 文件锁路径依赖 `HOME`/`ARCS_HOME`；若两进程使用了不同的 HOME，则各自持有独立锁、无法互斥 → 文档明确"必须共享同一 ARCS_HOME"。
  4. DeepSeek 的 `blockTransport` 需要宿主在实现方案中主动注入，否则 L4 仍停留在事件广播/审计层 → README 写明接口契约与默认行为，不做虚假承诺。
  5. 静态契约校验基于当前官方文档，宿主版本升级可能使 schema 漂移 → 脚本作为回归护栏而非最终真相，README 保留"需真实宿主验证"提示。
- 回滚：删除 `packages/host-kit/src/claim.ts` 与其测试、`scripts/verify-host-contracts.mjs`；在 `plugins/opencode/src/adapter.ts`、`plugins/pi/src/{adapter,index}.ts`、`plugins/deepseek/src/index.ts` 撤回本计划的改动（恢复内存 Set 与纯事件广播）；从 `packages/host-kit/src/index.ts` 移除 claim 导出、`package.json` 移除 `verify:contracts` 脚本；`git checkout -- docs/plugins.md plugins/{opencode,pi,deepseek}/README.md`。core/plugin-kit/telemetry 未改动，无需回滚。

## 进度日志

- 2026-11-17 15:01:53 创建（planing）
- 2026-11-17 15:03:37 完成 #1 在 host-kit 新增可复用的 SessionClaim 文件锁（wx 创建 + TTL + pid 存活检测）与单测
- 2026-11-17 15:03:37 host-kit/src/claim.ts 落地 wx 原子抢锁 + TTL + pid 存活/EPERM 语义 + release；claim.test.ts 8 用例全绿（首次/幂等/存活拒绝/死 owner 接管/TTL/损坏文件/release/路径安全）
- 2026-11-17 15:07:54 完成 #2 OpenCode 接入文件 claim 替换内存 Set，验证互斥与旧 owner 接管
- 2026-11-17 15:07:54 完成 #3 Pi 接入文件 claim（pid 语义），验证互斥与旧 owner 接管
- 2026-11-17 15:07:54 OpenCode/Pi 的内存 Set 已移除，改用 host-kit createSessionClaim 文件锁（wx + TTL + pid 存活）；新增 configureClaims 供隔离测试；opencode/pi 各新增跨进程互斥用例，host-kit+两插件 52 用例全绿，scan 65 文件 0 违规
- 2026-11-17 15:09:18 完成 #4 DeepSeek 新增 blockTransport 注入契约：有通道则真正阻断，无通道则回退事件广播 + 审计
- 2026-11-17 15:09:18 DeepSeek 新增可选 blockTransport 注入：有通道时调用宿主拒绝回调并置 enforced=true；无通道保持事件广播 + 审计；通道异常 fail-open。12 用例全绿（含三条新路径），build 通过
- 2026-11-17 15:12:40 完成 #5 新增 verify-host-contracts.mjs：校验 8 平台 manifest/hooks.json 结构与关键 hook 输出 schema 约束
- 2026-11-17 15:12:40 完成 #6 用隔离 HOME 做 OpenCode / Pi 的插件加载 smoke test（不触发模型调用），记录无法验证项
- 2026-11-17 15:12:40 verify-host-contracts.mjs 60 项全过（8 平台 manifest/hooks/事件数/输出 schema + 能力矩阵）；隔离 HOME smoke：OpenCode debug config 确认读取插件路径、Pi --list-models 无扩展加载错误；两者均无模型凭据，未触发会话调用
- 2026-11-17 15:22:40 完成 #7 同步 docs/plugins.md、各插件 README 与风险说明
- 2026-11-17 15:22:40 完成 #8 全量验证：build/lint/test/scan + 契约校验脚本 + 文件锁并发夹具
- 2026-11-17 15:22:40 docs/plugins.md 与 opencode/pi/deepseek README 已同步文件锁与 blockTransport 契约；全量 build/lint/scan/contracts OK；vitest 连续 3 次全量全绿 193 用例/20 文件；修复 pi claim 测试隔离 bug（makePi 二次切换 home）
- 2026-11-17 15:23:05 完成 #9 code: 8 个实施任务全部勾选；`SessionClaim` 落地并被 opencode/pi 实际调用；DeepSeek `blockTransport` 为可选且默认行为不变；无内存 Set 残留
- 2026-11-17 15:23:05 完成 #10 linter_result: `pnpm build && pnpm lint` 退出码均为 0，15 个 workspace 包无 TS error
- 2026-11-17 15:23:05 完成 #11 unit_test_result: `pnpm test` 退出码为 0；`SessionClaim` ≥ 6 用例（首次抢占 / 同 pid 重复 / 存活 owner 拒绝 / 死 owner 接管 / TTL 过期接管 / release 后可重抢）；opencode/pi 各 ≥ 1 用例证明走文件锁；DeepSeek ≥ 2 用例证明有/无 blockTransport 两条路径；记录总用例数
- 2026-11-17 15:23:05 完成 #12 func_test_result: `pnpm scan` 退出码 0 且 0 违规；`node scripts/verify-host-contracts.mjs` 退出码 0 并报告 8 平台检查通过；文件锁用真实子进程/临时 HOME 夹具验证互斥；OpenCode/Pi 加载 smoke test 有明确结果或"受限于无凭据"记录
- 2026-11-17 15:23:05 完成 #13 status: 已记录无法真实实测的平台与原因、文件锁单机边界、DeepSeek 无通道时的审计层限制，以及下方具体回滚命令
- 2026-11-17 15:23:05 code 8/8；build/lint 全绿；vitest 连续 3 次 193/193 全绿（claim 8 + opencode/pi 跨进程各 1 + deepseek blockTransport 3）；scan 65 文件 0 违规、verify:contracts 60 项 0 违规；风险段含 smoke 实测结果、单机文件锁边界、DeepSeek 无通道审计层限制与完整回滚命令
- 2026-11-17 15:23:05 归档：任务与完成标准全部满足
