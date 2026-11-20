# ARCS ChatGPT / Codex 兼容插件

通过原生 Hook 在工具执行前做实时纠偏（ARCS），任务不中断。

- 事件入口：13 个 Claude 兼容 hook，事件名由 `--event` 注入。
- 能力：Tier A —— `updatedInput` 改参（L1）、`additionalContext` 注入（L2/L3）、`deny` 阻断（L4）。
- 降级：`ask` 在当前契约不支持挂起，统一降为带原因的 `deny`；工具名不可改，L3 降为注入。
- 注意：宿主契约按 Codex 兼容形态实现，真实版本行为需集成方用 `pnpm real-check` 验证。

```bash
export ARCS_GOAL="只修改前端样式，不碰后端 API"
# 通过宿主插件目录加载本包（npm 包名 @chaos-design/arcs-plugin-chatgpt）
```
