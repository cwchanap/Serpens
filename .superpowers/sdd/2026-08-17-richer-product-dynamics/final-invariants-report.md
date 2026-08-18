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

Regression tests were added before the round-3A production changes. The
following is the historical round-3A focused command, before this final wave
added its boundary regressions:

```bash
bun run test:unit -- --project server --run src/lib/persistence/saveCodec.spec.ts src/lib/scenarios/validation.spec.ts -t "targetStock|stockout unit evidence|product override with (fractional|unsafe) stock"
```

Historical RED summary:

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

The original filter selected eight tests. Its three passes were the valid zero
`targetStock` acceptance control plus pre-existing negative-value rejection
tests for scenario `targetStock` and `stockoutLostDemand`; they were not three
valid quantity controls. The valid whole-number `stockoutLostDemand` acceptance
test was omitted because its title contains `stockoutLostDemand`, not the
`stockout unit evidence` phrase in the filter. The five failures were the
intended missing validation behaviors, not test setup or compile errors.

## Invariant decision

FIFO lot quantities, saved `targetStock`, and authored scenario `stock` and
`targetStock` are non-negative safe integers strictly below
`Number.MAX_SAFE_INTEGER`, so each accepted quantity can advance safely. The
schema-17 `stockoutLostDemand` unit evidence remains a non-negative safe
integer without the lot-exclusive upper bound. Decimal financial fields and
`reorderThreshold` remain decimal-capable, and valid negative gross margins
remain accepted. Validation rejects malformed quantities before setup,
replenishment, or historical-report decoding can consume them.

## Implementation

- `src/lib/persistence/saveCodec.ts` uses `requireNonNegativeLotQuantity` for
  schema-17 `targetStock` and retains `requireNonNegativeSafeInteger` for
  `stockoutLostDemand`. The lot helper preserves the existing negative,
  fractional, and non-finite diagnostics while adding the exclusive upper bound;
  financial validation remains decimal-capable.
- `src/lib/scenarios/validation/shared.ts` adds
  `nonNegativeLotQuantity` on top of the existing safe-integer validator,
  preserving the existing diagnostic behavior while rejecting exact max values.
- `src/lib/scenarios/validation/start.ts` applies the lot helper to authored
  product `stock` and `targetStock`; `reorderThreshold` retains its existing
  decimal-capable non-negative-number validation.

No UI, persistence migration/legacy policy, sales/accounting/catalog dynamics,
or ProductId/`stock.ts` typing behavior was changed.

## GREEN and verification

Historical round-3A GREEN output from before this final wave added its boundary
regressions:

```bash
bun run test:unit -- --project server --run src/lib/persistence/saveCodec.spec.ts src/lib/scenarios/validation.spec.ts -t "targetStock|stockout unit evidence|product override with (fractional|unsafe) stock"
```

Result:

```text
Test Files  2 passed (2)
     Tests  8 passed | 666 skipped (674)
```

The corrected boundary-focused command for the final fix wave also includes
the exact-max and fractional scenario-target regressions and the previously
omitted valid stockout control:

```bash
bun run test:unit -- --project server --run src/lib/persistence/saveCodec.spec.ts src/lib/scenarios/validation.spec.ts -t "targetStock|stockoutLostDemand|stockout unit evidence|product override with (fractional|exact max|unsafe) stock"
```

Exact result:

```text
Test Files  2 passed (2)
     Tests  16 passed | 666 skipped (682)
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
