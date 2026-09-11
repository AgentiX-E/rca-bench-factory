import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // `src/index.ts` re-exports only, and the `types` and `provider` modules
      // declare interfaces that erase to nothing at runtime. v8 would report
      // them as 0% because they contain no statement it can execute.
      exclude: ['src/index.ts', 'src/ir/types.ts', 'src/llm/provider.ts'],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
