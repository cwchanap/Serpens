# HPA-38 final remediation round 3A: product quantity invariants

Date: 2026-08-17
Worktree: `/Users/chanwaichan/workspace/Serpens/.worktrees/codex-hpa-38-richer-product-dynamics`
Starting head: `491a9720960ff56893a8352ececf164e619b63ee`

## Scope

This round addresses only the three numeric invariant gaps named by the
round-3A final whole-branch review: schema-17 `targetStock`, authored scenario
product `stock`, and schema-17 `stockoutLostDemand`. The ProductId/`stock.ts`
typing finding remains out of scope.

## CodeGraph evidence

Before reading source with text search, CodeGraph was queried for the implicated
symbols and callers. It identified:

- `validateSavedStoreProduct` in `src/lib/persistence/saveCodec.ts` as the sole
  save-product decoder caller; it reads `targetStock` before returning a
  `StoreProduct`.
- `validateSavedProductReport` in `src/lib/persistence/saveCodec.ts` as the
  schema-17 historical product-report validator; it reads
  `stockoutLostDemand`.
- `validateStart -> validateOverrides -> validateStoreOverrides ->
  validateProductOverrides` in `src/lib/scenarios/validation/start.ts` as the
  authored scenario product override boundary.
- `src/lib/scenarios/setup.ts` as the downstream conversion that writes an
  authored positive `stock` into a FIFO lot.

The normative source was read from
`docs/superpowers/specs/2026-08-17-richer-product-dynamics-design.md`. Its FIFO
contract makes lots the sole runtime retail quantity source, and its report
contract defines `stockoutLostDemand` as unit evidence derived from integer
demand/capacity/stock. The coordinator ledger's round-3A finding is recorded in
`.superpowers/sdd/2026-08-17-richer-product-dynamics/progress.md`.

## TDD RED evidence

Regression tests were added before production changes. Exact focused command:

```bash
bun run test:unit -- --project server --run src/lib/persistence/saveCodec.spec.ts src/lib/scenarios/validation.spec.ts -t "targetStock|stockout unit evidence|product override with (fractional|unsafe) stock"
```

Exact RED summary:

```text
❯ |server| src/lib/scenarios/validation.spec.ts (200 tests | 2 failed | 197 skipped)
     × rejects a product override with fractional stock
     × rejects a product override with unsafe stock
❯ |server| src/lib/persistence/saveCodec.spec.ts (474 tests | 3 failed | 469 skipped)
       × rejects fractional targetStock before it can become a FIFO lot
       × drops a report with invalid stockout unit evidence: fractional stockoutLostDemand
       × drops a report with invalid stockout unit evidence: unsafe stockoutLostDemand

Test Files  2 failed (2)
     Tests  5 failed | 3 passed | 666 skipped (674)
error: script "test:unit" exited with code 1
```

The three passing focused tests were the valid zero/whole-number controls. The
five failures were the intended missing validation behaviors, not test setup or
compile errors.

## Invariant decision

Retail product inventory quantities and unit evidence are non-negative safe
integers: `Number.isSafeInteger(value) && value >= 0`. Decimal financial fields
remain decimal-capable, and valid negative gross margins remain accepted. The
decoder rejects invalid `targetStock` and `stockoutLostDemand` before malformed
state is returned; scenario validation rejects invalid authored `stock` before
setup can construct a FIFO lot.

## Implementation

- `src/lib/persistence/saveCodec.ts` now uses
  `requireNonNegativeSafeInteger` for schema-17 `targetStock` and
  `stockoutLostDemand`. The helper preserves decimal financial validation and
  rejects negative, fractional, non-finite, and unsafe values.
- `src/lib/scenarios/validation/shared.ts` adds
  `nonNegativeSafeInteger`, preserving the existing negative/non-finite
  diagnostic behavior while rejecting fractional and unsafe values.
- `src/lib/scenarios/validation/start.ts` applies that helper only to authored
  product `stock`; `reorderThreshold` and `targetStock` retain their existing
  non-negative-number control semantics.

No UI, persistence migration/legacy policy, sales/accounting/catalog dynamics,
or ProductId/`stock.ts` typing behavior was changed.

## GREEN and verification

The same focused command after the production fix:

```bash
bun run test:unit -- --project server --run src/lib/persistence/saveCodec.spec.ts src/lib/scenarios/validation.spec.ts -t "targetStock|stockout unit evidence|product override with (fractional|unsafe) stock"
```

Result:

```text
Test Files  2 passed (2)
     Tests  8 passed | 666 skipped (674)
```

Broader relevant server coverage:

```bash
bun run test:unit -- --project server --run src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/saveRepositoryFactory.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts src/lib/scenarios/validation.spec.ts src/lib/scenarios/setup.spec.ts src/lib/game/retailSupply.spec.ts
```

Result:

```text
Test Files  7 passed (7)
     Tests  834 passed (834)
```

Static and whitespace gates:

```text
$ bun run check
svelte-check found 0 errors and 0 warnings

$ bun run lint
All matched files use Prettier code style!
exit 0

$ git diff --check
passed (exit 0)
```

## Changed files

- `src/lib/persistence/saveCodec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- `src/lib/scenarios/validation/shared.ts`
- `src/lib/scenarios/validation/start.ts`
- `src/lib/scenarios/validation.spec.ts`
- `.superpowers/sdd/2026-08-17-richer-product-dynamics/final-invariants-report.md`

The coordinator-owned ignored `progress.md` was preserved unchanged. The
assigned changes will be committed together with the conventional message:
`fix(products): enforce integer inventory invariants`.

## Remaining limitations

The separate ProductId/`stock.ts` typing finding remains intentionally deferred
to the next remediation slice. No other limitations remain for round 3A.
