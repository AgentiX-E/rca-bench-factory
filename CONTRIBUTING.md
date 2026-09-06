# Contributing to rca-bench-factory

Thanks for contributing. This repository enforces a few non-negotiable engineering
rules. They are not guidelines — CI fails on them.

## Workflow

1. **Fork and branch** off `master`. Name branches `feat/…`, `fix/…`, `chore/…`.
2. **Write the test first** (TDD). A failing test precedes the implementation.
3. **Implement** the smallest change that makes the test pass.
4. **Run the full gate locally** before opening a PR:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test:coverage
   pnpm build
   ```
5. **Open a PR.** CI re-runs the same gate. A red CI is a hard stop.

## Testing rules

- **No mocks.** Use real, hand-written fixtures. `scripts/check-no-mock.mjs` bans
  `vi.mock`, `jest.mock`, `sinon`, `.skip` and `.only`.
- **≥ 95% coverage** per dimension (statements, lines, branches) and 100% functions,
  measured by vitest `v8` provider. Raise it with meaningful tests, not ignore
  comments.
- **Bug-discovery driven.** Tests must encode a real failure mode, not just call a
  happy path.

## Commit conventions

- Commit messages are **English only**.
- Keep the subject under ~72 characters, imperative mood (`Add …`, `Fix …`).
- Author name is `Lambertyan`.
- Never commit credentials; `scripts/check-no-secrets.mjs` fails on credential-shaped
  literals.

## Code style

- TypeScript strict mode (`noUncheckedIndexedAccess`, `noUnusedLocals`, …).
- Deterministic code paths only: functions may `throw` for programmer errors but must
  **never throw for data problems** — return a discriminated result instead.
- Comments and identifiers are English.

## Definition of Done

A change is done only when every item is true:

- [ ] Tests added / updated and passing with ≥ 95% per-dimension coverage.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass.
- [ ] No mock, no skip, no `.only`, no `continue-on-error`, no `|| true`.
- [ ] CI is green.
