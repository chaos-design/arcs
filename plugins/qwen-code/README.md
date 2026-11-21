# ARCS Qwen Code CLI 插件

通过 Gemini 兼容 Hook 在工具执行前做实时纠偏（ARCS），任务不中断。

- 事件入口：13 个 Claude 兼容 hook，事件名由 `--event` 注入。
- 能力：Tier B —— `additionalContext` 注入（L2/L3）、`deny` 阻断（L4）。
- 降级：改参契约待核实，按保守策略不写回；Suspend 降为 deny 并记录审计。
- 注意：宿主版本行为需集成方用 `pnpm real-check` 验证。

```bash
export ARCS_GOAL="只修改前端样式，不碰后端 API"
# 通过宿主插件目录加载本包（npm 包名 @chaos-design/arcs-plugin-qwen-code）
```
