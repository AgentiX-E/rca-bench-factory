import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The suite's stopwatch. A file that blocks the event loop past the worker's
    // RPC deadline makes vitest exit non-zero while every test passes, and until
    // v3.12 nothing measured it -- see `test/support/event-loop-stall.ts` and
    // finding 290 for the controlled pair that established the mechanism.
    setupFiles: ['./test/setup/stall-watch.ts'],
    // The number of files run at once, capped rather than left to the CPU count.
    //
    // ## The measurement
    //
    // This machine reports 32 CPUs, so vitest's default is 32 workers. The
    // container's cgroup allows 8 GiB:
    //
    //     /sys/fs/cgroup/memory.max          8589934592   (8 GiB)
    //     memory.current at idle              2146304000   (2.0 GiB)
    //
    // A full suite run was measured at four parallelisms, sampling
    // `memory.current` every 200 ms and reading `memory.events max` before and
    // after each run. `max_delta` is how many times the cgroup touched its
    // ceiling during the run -- the quantity that decides whether a child's next
    // allocation succeeds:
    //
    //     workers   wall time   peak         max_delta
    //       4        30 s       6672 MiB         0
    //       8        31 s       7530 MiB         0
    //      16        39 s       8191 MiB       968
    //      32        30 s       7877 MiB         0      (the default)
    //
    // ## What this table does and does not show
    //
    // It does **not** show that 32 workers is reliably over budget. The 32 row
    // measured clean, on a run where the suite was green: 3280 tests, 0 failures.
    // Any statement that the default is the cause of the intermittent failure
    // would be contradicted by that row, and an earlier version of this comment
    // made exactly that claim about numbers taken from a different process.
    //
    // What the table does show is that the *cost* of running every file at once
    // is a 7877 MiB peak against an 8192 MiB ceiling -- 315 MiB of headroom, with
    // 16 workers already having touched the ceiling 968 times on a slower run.
    // The margin at 32 is 4% of the limit, and it is the margin that moves when a
    // dependency's memory changes, when a fixture grows, or when the baseline
    // `memory.current` rises. The failure mode when it closes is not a clean
    // error: a child killed mid-allocation exits 1, which the assertion under it
    // reports as a broken subject, naming a different one each time.
    //
    // So this cap is **headroom bought with no measured cost**, not a proven
    // repair of a proven cause. 8 keeps the wall time identical to the default
    // (31 s against 30 s, inside run-to-run noise) and moves the peak off the
    // ceiling. The honest summary is: the observed intermittency is not explained
    // by a measurement in this table, and the cap removes one of the conditions
    // under which it could occur.
    //
    // ## Why 8 and not 4
    //
    // Both are clean and both are the same wall time, so the choice is cost. 8
    // leaves more parallelism for the files that are individually slow, which is
    // what the cap is spending. 4 would also be defensible.
    //
    // ## Why this is a config change and not a test change
    //
    // The failing assertion was correct: `scripts/check-official.mjs` did exit
    // nonzero, because the kernel killed it. Nothing about the script or its
    // fixture was wrong, so nothing about them should be edited. The budget
    // belongs to the scheduler, and this is where the scheduler's budget is
    // written down. `heavy-fixtures-do-not-contend.test.ts` asserts the
    // properties of the suite that make this cap sufficient -- one heavy file,
    // it runs a package manager, and it does so inside a worktree.
    maxWorkers: 8,
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
