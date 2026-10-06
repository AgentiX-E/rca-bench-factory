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
      // `functions` is 100 rather than 95, and it is the one dimension where the
      // stronger bound is the right one. A statement or a branch that goes
      // unexecuted is usually a line nobody needed to write; a *function* that
      // goes uncalled is a symbol nothing else in the tree names, which is dead
      // code by definition. 95 would permit one in twenty of them.
      //
      // The number is also a published claim: the CI step is named
      // `Test with coverage (core + cli, >=95% per dimension, 100% functions)`,
      // and it said 100 while this file said 95 for as long as the step existed.
      // Coverage happened to *be* 100 throughout, so the sentence was true by
      // luck rather than by construction -- the same defect as finding 123's
      // test counts, one level down. `coverage-thresholds.test.ts` now holds the
      // two numbers equal.
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 100,
        lines: 95,
      },
    },
  },
});
