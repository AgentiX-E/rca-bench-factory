import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // `src/index.ts` re-exports only, and the `provider` module declares
      // interfaces that erase to nothing at runtime. v8 would report them as
      // 0% because they contain no statement it can execute.
      //
      // `src/ir/types.ts` used to belong in that list too, and was excluded
      // for the same reason. It stopped being true once the vocabularies moved
      // here as `as const` tuples plus `isVocabularyMember`: that is runtime
      // code, and excluding the file meant the thing every consumer now reads
      // was also the one thing coverage never looked at.
      exclude: ['src/index.ts', 'src/llm/provider.ts'],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
