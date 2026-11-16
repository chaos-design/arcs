import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// 测试直接消费各包 src（workspace 源码别名），不依赖构建产物
export default defineConfig({
  resolve: {
    alias: {
      '@chaos-design/arcs-core': resolve('packages/core/src/index.ts'),
      '@chaos-design/arcs-telemetry': resolve('packages/telemetry/src/index.ts'),
      '@chaos-design/arcs-plugin-kit': resolve('packages/plugin-kit/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'plugins/*/src/**/*.test.ts', 'sdk/*/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15000,
  },
});
