import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
      // See `packages/core/vitest.config.ts` for why the function dimension is
      // held to 100 while the others are held to 95: an uncalled function is a
      // symbol no other file names, so 95 would permit one in twenty to be dead.
      //
      // The CI step name advertises that 100, and this file used to say 95.
      // Coverage was 100% anyway, which is exactly why nobody noticed -- a claim
      // that is true by luck is the shape of finding 123. Held equal now by
      // `coverage-thresholds.test.ts`.
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 100,
        lines: 95,
      },
    },
  },
});
