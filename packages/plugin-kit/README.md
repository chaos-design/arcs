# @chaos-design/arcs-plugin-kit

ARCS 插件胶水层：`HostAdapter` 契约、`PluginRuntime` 编排流水线与 Config / HITL / SessionState 桥接。所有宿主插件面向本包编程，不 import 宿主 SDK——宿主差异下沉到 `plugins/*`。

## 能力

- **HostAdapter 契约**：`subscribe / normalize / materialize` 三件事；Hook 型插件 `subscribe` 为空操作，事件订阅型插件注入 `subscribeFn` 并逐事件 `reset()`
- **PluginRuntime**：`ensureInit → run(raw)` 编排流水线；初始化失败 fail-open（降级放行 + 支持下一事件重试）
- **Config 三级合并**：默认值 → `ARCS_*` 环境变量 → 宿主覆盖层
- **HITL / SessionState 桥接**：`HitlTransport` 契约（approved / rejected / timeout 三分支）与会话状态存储

## 安装

```bash
pnpm add @chaos-design/arcs-plugin-kit
```

详细设计见 [docs/plugin-kit.md](https://github.com/chaos-design/arcs/blob/main/docs/plugin-kit.md)；新增宿主插件的步骤见 [docs/extension-points.md](https://github.com/chaos-design/arcs/blob/main/docs/extension-points.md)。
