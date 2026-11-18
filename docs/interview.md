# ARCS 面试题库

面向「参与 ARCS 开发/评审」或「Agent 纠偏系统设计」场景的题目集。每题给出考点与参考答案；答案中的设计语义以本仓库文档为准（括号内为延伸阅读）。建议按分组由浅入深使用。

---

## 一、问题域与设计总纲

### Q1. ARCS 解决什么问题？与「事后审阅 Agent 日志」的本质区别是什么？

**考点**：问题域界定；实时性。

**参考答案**：ARCS 解决的是 Agent 执行过程中的**偏航**——参数幻觉、死循环、任务发散、高危越权——这些问题在事后审阅时损失已经发生。ARCS 是**执行流内的实时操舵**：在工具调用落地前检测（sense）并规划（plan）纠偏效果，修复参数、注入提示、改道工具或请求审批，然后让宿主**继续原任务执行**。两条不可妥协的要求：任务不中断、发现偏航立即纠偏（[architecture.md](./architecture.md)）。

### Q2. 为什么「fail-open（失败即放行）」是正确的默认？什么情况下应该选 fail-closed？

**考点**：安全策略权衡；ARCS 定位。

**参考答案**：ARCS 是纠偏旁路而非安全边界——它挂掉的代价不应该由 Agent 任务承担。纠偏系统自身的误报/故障若阻断任务，会让集成方直接卸载它；因此检测异常、超预算、初始化失败一律放行 + degraded 审计留痕。fail-closed 适用于**安全边界**（如凭证网关）。注意 ARCS 的 L4（高危越权）反而是 fail-safe：审批不可用时按超时拒绝，因为 L4 的语义是「宁可不执行」。这套取舍落到实现上是逐层红线（[architecture.md 稳健性红线](./architecture.md)）。

### Q3. 「任务不中断」在技术上如何成立？

**考点**：效果物化机制。

**参考答案**：纠偏效果的形态被设计为**可原地落地**：L1 用修复后的完整参数整体替换（PatchArgs）；L2 注入一条消息让模型自己纠正；L3 改道到安全工具；L4 走审批，通过则放行、拒绝/超时则阻断+注入解释后任务继续。所有形态都返回宿主决策通道（hooks 的 updatedInput/permissionDecision、MCP 的合成响应），没有一种需要终止会话（[key-flows.md](./key-flows.md)）。

---

## 二、分层架构与依赖

### Q4. 画出 ARCS 的依赖链，并说明为什么 core 必须是零 I/O 纯逻辑。

**考点**：分层单向依赖；可测试性。

**参考答案**：`plugins/* → host-kit → plugin-kit → telemetry → core` 单链，`sdk/*` 直连 core。core 只做检测+决策，零宿主 SDK、零 node 内建、零网络/文件——由 `scan-deps` 红线扫描在 CI 强制。收益：① 算法可在任意环境（含浏览器/边缘）复用；② 单测无 I/O mock 成本；③ 上层替换（新增宿主）不动内核；④ 预算计时不会被 I/O 抖动污染（[architecture.md](./architecture.md)、[constraints.md](./constraints.md)）。

### Q5. plugin-kit 和 host-kit 的边界是怎么划的？为什么后来要把 host-kit 从插件里抽出来？

**考点**：包职责演化；DRY 与边界。

**参考答案**：plugin-kit 是「胶水层契约」：`HostAdapter` 四方法契约（subscribe/normalize/materialize/setup）、`PluginRuntime` 编排流水线、三级配置合并、SessionStore。host-kit 是「8 家平台插件的最大公约数」：能力矩阵、`runHookEntry` stdin→决策管线、效果→宿主决策翻译、FileAuditSink、SessionClaim 文件锁。最初这些逻辑散在各插件里，八家重复实现「翻译 + 降级 + 审计」；抽成 host-kit 后插件只剩宿主怪癖（codex 的 ask 不支持、workbuddy 的 modifiedInput 字段名），且能力矩阵有一致性测试锁定（[host-kit.md](./host-kit.md)）。

### Q6. 为什么 sdk/* 绕过 plugin-kit 直连 core？这个「直线原则」的代价是什么？

**考点**：SDK 与插件双轨设计。

**参考答案**：SDK 是进程内、强类型、同步可组合的代码级接入——宿主就是宿主自己，不存在「采集宿主事件、翻译宿主输出」的问题，胶水层的抽象对它是纯开销。代价：SDK 需要自己实现效果物化（withArcs 在 doGenerate 拦截层内联了 PatchArgs/Redirect/Suspend 翻译与 per-wrapper 历史），无法复用 PluginRuntime 的编排，因此其行为要靠单测与文档约束（[sdk.md](./sdk.md)）。

### Q7. telemetry 包为什么零 I/O？持久化放在哪里？

**考点**：契约与实现分离。

**参考答案**：telemetry 只定义 `AuditEvent` 模型（zod 校验）与 `TelemetrySink` 契约，保证「数据语义」与「投递实现」解耦：内存 sink（测试）、JSONL 落盘（host-kit FileAuditSink）、未来 OTLP/HTTP 都可实现同一契约。emit 契约规定不得抛异常、同步 <1ms——这要求实现方自己做缓冲/异步冲刷。聚合函数 `buildOffsetCurves`/`buildDashboardModel` 也是纯函数，供面板与自建后端复用（[telemetry.md](./telemetry.md)）。

---

## 三、检测与决策算法

### Q8. core 的四个传感器分别检测什么？各自的关键设计是什么？

**考点**：sense 层算法。

**参考答案**：① **PolicySensor**：保护路径 glob（`.env*`、`**/migrations/**`）+ 高危命令正则（`rm -rf` 等）→ L4；② **LoopHashSensor**：对工具调用取指纹（名称+规范化参数），窗口内相同指纹连续出现达 `maxConsecutiveLoops` → L2，关键是「结果相同才算循环」的 outcome 语义；③ **SchemaSensor**：按 `toolSchemas` 校验参数，键名不匹配时用编辑距离找最近键生成 PatchArgs（L1），类型可强转时生成类型矫正 patch；④ **SemanticSensor**：thought/goal 嵌入余弦相似度低于 `driftThreshold` → L3 发散（[core.md](./core.md)）。

### Q9. 引擎的预算机制怎么实现？为什么用 CPU 时间而不是墙钟？

**考点**：预算与降级的工程实现。

**参考答案**：`createArcsEngine` 给 sense/plan 各设毫秒预算，逐传感器用 `process.cpuUsage` 计时（finally 归还），超预算的传感器被跳过并在结果标记 degraded，预算耗尽整体回退 PassThrough。选 CPU 时钟是为了排除事件循环被宿主其它工作阻塞的墙钟抖动，保证「预算」度量的是 ARCS 自身开销；已知局限是同一传感器内部的同步密集计算也会计入自身（记录在 engine 注释）。latency 预算对应 DoD「sense+plan p99 < 50ms」（[core.md](./core.md)）。

### Q10. LoopHashSensor 如何区分「死循环」和「合理的重试」？

**考点**：误报控制。

**参考答案**：三个条件联合：指纹相同（名称+参数规范化）、窗口内**连续**出现、且事件 outcome 为 error（成功的重复不算）；容忍次数 `maxConsecutiveLoops` 可配置（默认 2）。触发后是 L2 注入而非阻断——告诉模型「连续 N 次相同调用且结果相同，请换方法」，任务继续（[core.md](./core.md)）。

### Q11. SchemaSensor 的键名修复为什么用编辑距离而不是直接丢掉未知键？

**考点**：L1 自修复的边界。

**参考答案**：模型幻觉键名通常是「正确键的小变形」（`pathh`→`path`），编辑距离最近的已知键就是高概率的正确意图；只有当匹配度足够、且值的类型与 schema 相容时才生成 PatchArgs，否则降级为注入或放行。直接丢掉未知键会把「参数幻觉」变成「静默丢参」，任务会以另一种方式失败且不可解释（[core.md](./core.md)）。

### Q12. SemanticSensor 的嵌入器如何做到零依赖？精度与成本怎么权衡？

**考点**：轻量嵌入设计。

**参考答案**：core 内置 `HashingEmbedder`——特征哈希到固定维度向量（字符 n-gram），余弦相似度作为发散度。零模型、零网络、微秒级，代价是语义能力弱于真实嵌入模型：它擅长检测「话题整体跑偏」，不擅长细微语义漂移。接口（`embed(text): number[]`）允许集成方注入真实嵌入器（接口在 Policy 中可替换）（[core.md](./core.md)、[extension-points.md](./extension-points.md)）。

---

## 四、纠偏等级、物化与宿主差异

### Q13. L1–L4 各自的语义和典型触发场景？

**考点**：等级体系。

**参考答案**：L1 PatchArgs（参数热修复，schema 键名/类型畸变）；L2 InjectMessage（注入纠偏消息，死循环/轻微偏航）；L3 RedirectTool（改道到安全工具，语义发散且存在映射目标；唯一能改工具名的形态是 MCP 代理）；L4 Suspend（高危越权，进入 HITL 审批三分支：批准放行/拒绝或超时则阻断+解释）（[key-flows.md](./key-flows.md)）。

### Q14. 为什么能力矩阵把宿主分 Tier A/B/C？降级如何保证「不虚假承诺」？

**考点**：宿主能力建模。

**参考答案**：宿主输出契约的差异是客观存在的：codex 的 ask「parsed but not supported」、Trae 的 hooks 只读、zcode 无改参通道。ARCS 的原则是**降级但留痕**：`applyEffect` 遇能力缺口不假装成功，而是降级为宿主可表达的动作（patchArgs 缺失→注入提示、suspend 缺失→block）并在 `HostDecision.degraded` 记录（如 `suspend→block`），降级随审计事件可观测。矩阵由 conformance 测试 + verify-host-contracts 双重锁定（[host-kit.md](./host-kit.md)、[plugins.md](./plugins.md)）。

### Q15. 为什么 MCP 代理是唯一能做 L3 改道（换工具名）的形态？

**考点**：透明代理的截获面。

**参考答案**：原生 hooks 普遍只暴露「改参数 + 允许/拒绝」的决策通道，没有「替换工具名」的输出字段。MCP 代理位于客户端与 MCP Server 之间，`tools/call` 请求整体经过代理，代理可以改写请求的 `name` 字段再转发——这是截获面位置带来的能力，而非宿主契约（[plugins.md](./plugins.md)）。

### Q16. HITL 的超时分支为什么默认「拒绝」？与 fail-open 矛盾吗？

**考点**：fail-open 的适用边界。

**参考答案**：不矛盾。fail-open 针对「ARCS 自身故障不应中断任务」；L4 是「该动作本身高危，没有审批就不该执行」。审批通道不可用/超时时按拒绝处理（fail-safe），并注入解释让 Agent 换安全路径——任务依然继续，只是这个高危动作不执行。实现上未配置审批通道的兜底 transport 就返回 `{approved:false, timeout:true}`（[plugin-kit.md](./plugin-kit.md)）。

### Q17. Hook 型平台为什么不在 hook 里同步调 HITL？

**考点**：宿主运行时约束。

**参考答案**：hook 进程有约 5 秒超时，同步等人工审批必然超时且阻塞宿主。因此 `runHookEntry` 的 Suspend 按 Tier 翻译为 `ask`（A 级，宿主自己弹出权限询问）或 `block`（B 级）；真正的异步 HITL 只在常驻进程内实现（opencode/pi 的事件订阅 adapter），那边没有 hook 超时约束（[host-kit.md](./host-kit.md)）。

---

## 五、可观测性

### Q18. AuditEvent 为什么不含 prompt 与工具参数？`evidence` 怎么办？

**考点**：遥测隐私边界。

**参考答案**：审计文件可能被共享/收集，prompt 与参数可能含用户敏感数据，因此 AuditEvent 只保留结构化决策字段（level/signals/effects/latency/degraded/hitl）。signals 的 `evidence` 是检测依据摘要（如「键名 pathh→path」），可能含路径片段，文档明确提示按需管理文件权限（[telemetry.md](./telemetry.md)）。

### Q19. 偏移曲线回答哪两个问题？收敛判定为什么用「首 3 点 vs 尾 3 点均值」？

**考点**：指标设计。

**参考答案**：**是否收敛**（纠偏介入后 severity 是否下降、偏航间隔是否拉长）与**是否过舵**（放行占比是否异常高、HITL 误报率）。收敛判定取会话 severity 序列的首 3 点均值与尾 3 点均值比较——小窗口对短会话稳健、对噪声不敏感，且纯序数比较不依赖绝对刻度；点位不足 3 时判「观察」而非给出结论（[telemetry.md](./telemetry.md)）。

### Q20. TelemetrySink 的「同步 <1ms、不得抛异常」契约如何影响实现选择？

**考点**：契约驱动的性能设计。

**参考答案**：emit 在每次编排的主链上同步调用，任何慢实现都会变成宿主延迟。同步 <1ms 意味着 JSONL 的 appendFileSync 在本地盘可接受，而网络 sink（OTLP/HTTP）必须内部缓冲 + 异步冲刷。不得抛异常则要求实现方自行捕获（磁盘满、网络断），主链的 try/catch 只是第二道防线（[telemetry.md](./telemetry.md)）。

---

## 六、稳健性与工程化

### Q21. PluginRuntime 的初始化失败是如何治理的？为什么要「重置 initPromise 允许重试」？

**考点**：11 号计划加固；生命周期设计。

**参考答案**：`run()` 内 `ensureInit` 曾在 try/catch 之外——配置 zod 校验失败或 `adapter.setup` 抛错会变成 unhandledRejection 击穿长驻宿主。加固后：捕获初始化异常 → 降级 PassThrough + degraded 审计 → **重置 initPromise**。重试很关键：宿主（如扩展系统）的事件回调可能早于自身就绪，首事件失败、后续事件成功是常态，缓存一次失败等于永久拒绝服务（[plugin-kit.md](./plugin-kit.md)）。

### Q22. MCP 代理「已转发请求必须在下游死亡时得到应答」是如何实现的？

**考点**：未决请求兑现；悬挂问题。

**参考答案**：`tryForward` 成功转发带 id 的请求时登记到 `pendingForwarded`（id→客户端输出流）；下游 stdout 回来响应时按 id 注销；下游 `exit`/`error` 或 stdin 写失败时统一向所有未决请求回 JSON-RPC `-32000`。没有这个机制，请求可能在「子进程已 spawn 但尚未退出」的窗口被转发给将死进程（写入成功但永远无响应），客户端悬挂——e2e 测试曾精确暴露该竞态（[plugins.md](./plugins.md)）。

### Q23. stdio 管道的 EPIPE 为什么能让代理崩溃？如何设防？

**考点**：Node 流错误语义。

**参考答案**：向已关闭的下游 stdin 写入会触发流的 `error` 事件（EPIPE），没有监听器时 Node 按「未处理 error 事件」抛出击穿进程。设防：三条下游管道全部挂 error 监听（记日志/兑现未决请求），写客户端时 try/catch（客户端 stdout 已关时静默放弃）。CLI 的管道输出（`pnpm dashboard | head`）同理——脚本入口对 stdout 挂 EPIPE 监听提前退出（[plugins.md](./plugins.md)）。

### Q24. 跨进程会话锁（SessionClaim）的接管条件为什么是这三个？「读失败视为已 claim」是什么取舍？

**考点**：分布式锁简化模型。

**参考答案**：接管条件：owner 进程已死（`kill(pid,0)` 返回 ESRCH；EPERM 视为存活）、同 pid 幂等续约、记录超 TTL（默认 30 分钟，防僵尸 claim 永久锁死）。文件锁是非原子的读后写，两进程竞态接管理论上可能双胜——ARCS 接受这一点：重复纠偏的代价远小于「锁死导致 trace 丢失」或「异常打断 Agent」，因此读 claim 失败一律视为已 claim。宁可重复、不可丢失、绝不中断（[host-kit.md](./host-kit.md)）。

### Q25. 仓库的「依赖红线扫描」是怎么实现的？为什么正则而不是 AST？

**考点**：护栏工具的成本收益。

**参考答案**：`scan-deps.mjs` 零依赖正则提取 import/from/require 的模块说明符，按目录白名单校验（core 只许 zod；host-kit 是唯一允许 node I/O 的 packages 包，node 内建逐条登记理由）。正则的假阳性/假阴性对「护栏」场景可接受——它防的是「有人顺手 import 了 node:fs」这类显性违规，不是对抗性绕过；换取零解析器依赖与秒级执行，作为 CI 门禁绰绰有余（[constraints.md](./constraints.md)）。

### Q26. 容量上限在哪些位置设置？逐出策略为什么统一选 FIFO？

**考点**：长驻进程资源治理。

**参考答案**：deepseek 会话 Map（512）、opencode 注入队列（64）、InMemorySink 可选 maxEvents、MCP 行缓冲（1MB 丢弃）。FIFO（Map 插入序 + shift）实现 O(1)/摊还且无需时间戳；这些结构的正确性不依赖 LRU 的访问序假设——最旧未完成会话恰恰是最可能已死的，逐出损失最小（各包源码，11 号计划）。

---

## 七、测试与交付

### Q27. ARCS 的三层测试各覆盖什么？为什么真实宿主不在 CI 里？

**考点**：测试金字塔在不可控外部依赖下的变体。

**参考答案**：第一层 core 纯算法单测（零 I/O）；第二层 plugin-kit ReplayHarness 回放仿真（效果顺序/预算/degraded/HITL 三分支）+ host-kit 一致性测试；第三层子进程/契约验证——MCP e2e 起真实三进程拓扑、verify-host-contracts 用 Codex 官方 schema 行为级校验输出。真实宿主 CLI（codex/claude 等闭源二进制）版本不可控、无法在 CI 稳定安装，故 DoD 明确「真实宿主实测由集成方执行」，用 `host-real-check.mjs` 提供步骤与审计核验（[testing.md](./testing.md)）。

### Q28. 「行为契约校验」为什么单独存在？它比单测多防住了什么？

**考点**：契约漂移防御。

**参考答案**：单测验证「我们的代码符合我们理解的契约」，行为契约校验验证「我们的输出符合**官方 schema**」（如 Codex PreToolUse output schema）+ 官方解析器的怪癖规则（ask 不支持、allow 必须配 updatedInput、deny 必须非空 reason）。宿主升级悄悄改变解析行为时，单测全绿但集成会挂——契约护栏把这类漂移在 CI 拦截（[testing.md](./testing.md)）。

### Q29. 两个 examples demo 为什么设计成零外部依赖、mock 模型？它们证明到什么程度？

**考点**：demo 的可信度边界。

**参考答案**：mock 模型（duck-typed LanguageModelV4）与本地 fake MCP Server 让 demo 无需 API Key、无网络即可跑，且结果确定可断言。它们证明的是**链路真实**：真实进程拓扑（demo-mcp 是三进程）、真实构建产物（消费 dist）、真实审计落盘——但不证明「与真实 LLM/真实宿主的兼容性」，那属于集成方实测。demo 输出即验收证据（func_test_result）。

### Q30. 偏移曲线面板为什么做成「脚本 + 纯函数」而不是 Web 服务？

**考点**：交付形态匹配使用场景。

**参考答案**：使用者是集成方开发者，排查形式是「跑完一次会话→看曲线」，静态 JSONL→静态 HTML 完全覆盖且零运维（无服务器、无状态、可离线、可随审计文件归档）。聚合语义沉淀为 telemetry 纯函数（buildDashboardModel），将来接入自建 Web 面板/OTLP 时直接复用，渲染层可替换（[telemetry.md](./telemetry.md)、[extension-points.md](./extension-points.md)）。

---

## 八、开放性设计题

### Q31. 如果要新增一个宿主（如 Cursor），按什么步骤落地？哪些步骤最可能踩坑？

**考点**：扩展流程（对应 extension-points.md）。

**参考答案**：① 调研宿主 hook/扩展契约 → 登记 `HOST_CAPABILITIES`（tier + 能力开关 + note）；② 实现 `parse`（stdin/事件→NativeEvent）与 `serialize`（决策→宿主输出），Hook 型直接复用 `runHookEntry`；③ 写 hooks.json/manifest；④ 一致性测试 + verify:contracts 登记；⑤ 文档（plugins.md 矩阵）。最易踩坑：宿主 schema 的隐藏怪癖（如 codex 的 ask）与字段命名（updatedInput vs modifiedInput）——这正是行为契约校验存在的原因。

### Q32. 如果 ARCS 每次编排引入 200ms 延迟，你会从哪里入手？给出优先级。

**考点**：性能归因方法论。

**参考答案**：先用 latencyMs（已按阶段埋点）拆解 normalize/sense/plan/materialize。预期大头：① SemanticSensor 嵌入——若集成方注入了真实嵌入模型，改为异步旁路（不计入预算、结果下一事件生效）；② SchemaSensor 对大 schema 的全键扫描——按工具名缓存已解析 schema；③ FileAuditSink 的同步写——切缓冲 + 定时冲刷；④ HITL 等待——不算延迟（宿主语义内）。核心原则：任何优化不得破坏 fail-open 与预算红线。

### Q33. 若要把 L2 的注入从「当前事件流」改为「下一轮模型请求前」，有什么权衡？

**考点**：注入时机的语义。

**参考答案**：当前即时注入（opencode 走 session context hook 排队到下次请求）保证纠偏消息与触发上下文强相关，但可能打断模型当前的推理链；延迟到下一轮请求前更温和，但模型可能已完成更多错误动作。折中：等级越高越即时（L2 即时、低危提示合并），并把「注入到生效」的延迟记入审计以观测实效。opencode 的 `pendingInjections` 排队（容量上限 64）就是该权衡的落地。

### Q34. 如何为 ARCS 设计一个「误报率」的度量？数据从哪来？

**考点**：指标落地。

**参考答案**：误报 = 纠偏动作后宿主/用户回滚了该动作，或 Agent 在注入后立即回到相同动作且成功。数据源：① 审计事件的 effects/signals（介入了什么）；② 后续事件序列（回滚信号：同参数再次调用且 outcome=ok）；③ HITL 批准率（ask 被批准≈策略过严的信号）。聚合进 buildDashboardModel（新增 `interventions` 维度），用偏移曲线面板的趋势图验证——这正是「面板回答是否过舵」的量化路径。

### Q35. 如果宿主的事件流是并发的（同会话多工具并行），ARCS 的状态机有哪些竞态要处理？

**考点**：并发语义（对应 11 号计划 deepseek 修复）。

**参考答案**：① 会话状态的读-改-写（历史/循环窗口）需要按 sessionId 串行化或加锁；② 跨事件共享的可变变量（如「上一个 raw」）在 block 回调里会错拿他事件数据——必须随决策逐事件传递（deepseek 的 dispatch 返回 `{decision, raw}`）；③ claim 文件锁防多进程；④ materialize 的顺序副作用要按效果列表序而非事件到达序。原则：单会话内串行、会话间隔离、共享可变状态逐事件绑定。

### Q36. 把 ARCS 卖给一个新团队时，你会用哪三个指标证明它的价值？

**考点**：产品化思维。

**参考答案**：① **偏航拦截率与挽回率**：L1/L2/L3 触发后任务是否继续推进到完成（偏移曲线收敛段）；② **故障成本对比**：接入前后「参数幻觉导致的任务失败/人工修复次数」（degraded=0 的会话占比作对照）；③ **自身开销**：latencyMs p99 < 50ms、degraded 率（纠偏系统自身的健康度）。三者分别回答「有用、值得、无害」。
