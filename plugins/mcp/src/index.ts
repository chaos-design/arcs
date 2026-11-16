export {
  McpAdapter,
  paramsToToolCall,
  type McpCallParams,
  type ProxyAction,
} from './adapter.js';
export { decideProxyAction, McpProxy, type McpProxyOptions } from './proxy.js';
// cli.ts 仅作 bin 入口（dist/cli.js），不在此重导出——避免 import 副作用
