# HPA-38 final fix wave report

Date: 2026-08-17
Worktree: `/Users/chanwaichan/workspace/Serpens/.worktrees/codex-hpa-38-richer-product-dynamics`
Starting head: `bd6ae6b`

## Scope

This final remediation wave addresses the three findings in the final
whole-branch re-review round 3: lot-compatible numeric boundaries, the
`getProductArt` ProductId contract, and inaccurate final-invariants report
evidence. No UI/Svelte, persistence migration policy, sales economics, FIFO
algorithm, accounting, product-dynamics, or unrelated scenario behavior was
changed.

The coordinator-owned ignored ledger
`.superpowers/sdd/2026-08-17-richer-product-dynamics/progress.md` was preserved
unchanged and was not staged.

## CodeGraph evidence

Before source text exploration, CodeGraph was queried in the assigned worktree
for the final-review symbols and callers. It identified:

- `validateSavedStoreProduct` and `validateSavedProductReport` in
  `src/lib/persistence/saveCodec.ts`; the former accepts saved `targetStock`
  and the latter validates historical `stockoutLostDemand`.
- `validateProductOverrides` in `src/lib/scenarios/validation/start.ts`, with
  its shared validators in `src/lib/scenarios/validation/shared.ts`; setup
  converts authored positive `stock` into a FIFO lot.
- `getProductArt` and `ProductArtProductId` in `src/lib/assets/gameArt.ts`,
  with callers in `StoreStockTable.svelte` and existing asset tests.

The normative design and final-review ledger context confirm that FIFO lot
quantities already reject `quantity >= Number.MAX_SAFE_INTEGER`, while
`stockoutLostDemand` and financial fields do not create lots and should retain
their existing bounds.

## Finding 1: lot-compatible quantity bounds

Policy: accepted saved/scenario quantities that can create or replenish FIFO
lots are non-negative safe integers strictly below `Number.MAX_SAFE_INTEGER`.
Zero and `Number.MAX_SAFE_INTEGER - 1` remain valid. `reorderThreshold` remains
decimal-capable. `stockoutLostDemand` keeps the existing non-negative safe
integer validator without the lot-exclusive upper bound, and financial fields
remain unchanged.

TDD RED was captured after adding the exact-max and scenario fractional-target
regressions, before production changes:

```bash
bun run test:unit -- --project server --run src/lib/persistence/saveCodec.spec.ts src/lib/scenarios/validation.spec.ts -t "targetStock|product override with (fractional|exact max|unsafe) stock"
```

```text
Test Files  2 failed (2)
     Tests  4 failed | 8 passed | 670 skipped (682)
error: script "test:unit" exited with code 1
```

The failing tests were save exact-max `targetStock`, scenario exact-max
`stock`, and scenario fractional/exact-max `targetStock`; the passing tests
were existing controls plus the newly added valid boundary controls.

Minimal implementation:

- `saveCodec.ts` adds `requireNonNegativeLotQuantity` for saved `targetStock`
  while leaving `stockoutLostDemand` on `requireNonNegativeSafeInteger`.
- Scenario validation adds `nonNegativeLotQuantity` and applies it only to
  authored `stock` and `targetStock`; `reorderThreshold` remains on
  `nonNegativeNumber`.
- Focused boundary tests cover exact max rejection, fractional target
  rejection, zero/max-minus-one acceptance, and decimal reorder thresholds.

## Finding 2: ProductId art contract

Policy: `getProductArt` accepts the authoritative `ProductId`, indexes the
existing `PRODUCT_ART` record directly, and retains its current fallback/error
behavior and assets.

The focused type-contract proof was added before changing the signature. The
pre-fix `bun run check` RED was:

```text
/Users/chanwaichan/workspace/Serpens/.worktrees/codex-hpa-38-richer-product-dynamics/src/lib/assets/gameArt.spec.ts:331:4
Error: Unused '@ts-expect-error' directive.

====================================
svelte-check found 1 error and 0 warnings in 1 file
error: script "check" exited with code 1
```

`getProductArt(productId: ProductId)` now removes the unchecked cast. The art
contract suite passed 3 selected tests, including the runtime lookup and type
proof.

## Finding 3: final-invariants report accuracy

`final-invariants-report.md` now explains that the original RED filter selected
pre-existing negative-rejection tests, omitted the valid whole-number
`stockoutLostDemand` control, and reports the corrected boundary command with
its actual output. Its implementation and invariant prose now matches the
exclusive lot bound and preserves decimal/non-lot fields.

## GREEN evidence

Corrected boundary-focused command, including the valid stockout control:

```bash
bun run test:unit -- --project server --run src/lib/persistence/saveCodec.spec.ts src/lib/scenarios/validation.spec.ts -t "targetStock|stockoutLostDemand|stockout unit evidence|product override with (fractional|exact max|unsafe) stock"
```

```text
Test Files  2 passed (2)
     Tests  16 passed | 666 skipped (682)
```

Focused art command:

```bash
bun run test:unit -- --project server --run src/lib/assets/gameArt.spec.ts -t "ProductId|product art|defines product art|unknown product art"
```

```text
Test Files  1 passed (1)
     Tests  3 passed | 26 skipped (29)
```

Full focused suite for all changed source test files:

```bash
bun run test:unit -- --project server --run src/lib/persistence/saveCodec.spec.ts src/lib/scenarios/validation.spec.ts src/lib/assets/gameArt.spec.ts
```

```text
Test Files  3 passed (3)
     Tests  711 passed (711)
```

Required static gates:

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
- `src/lib/assets/gameArt.ts`
- `src/lib/assets/gameArt.spec.ts`
- `.superpowers/sdd/2026-08-17-richer-product-dynamics/final-invariants-report.md`
- `.superpowers/sdd/2026-08-17-richer-product-dynamics/final-fix-wave-report.md`

Commit: the narrow commit `fix(products): align lot-compatible quantity bounds`.

## Limitations

No full repository unit/e2e run was required for this narrow validation/type/
documentation wave; all changed test files, check, lint, and whitespace gates
are green. No tracked source changes remain outside the assigned files after
the commit, and `progress.md` remains coordinator-owned and untouched.

## Round 1/5 follow-up: live inventory target edits

Date: 2026-08-17
Starting head: `fa46691c2f827baf8d904dc4da44152c786bbdc4`

### CodeGraph evidence

Before source text exploration, CodeGraph was queried in the assigned worktree
for the live inventory editor path. It identified `StoreStockTable.svelte` as
the raw finite-number editor, `GameRouteController.updateStoreInventoryTargets`
as the route boundary, and `updateStoreProduct` in `src/lib/game/stock.ts` as
the transition that previously rounded both fields. The route passes the patch
through unchanged, so the core transition is the narrow validation boundary;
no UI file needed to change.

### Finding and policy

The live target editor accepted finite fractional, negative, exact-max, and
unsafe target quantities. Rounding allowed exact-max and unsafe values to enter
state, after which weekly replenishment could derive an invalid FIFO lot and
autosave could reject the game. The transition now accepts a target only when
it is a non-negative safe integer strictly below `Number.MAX_SAFE_INTEGER`;
invalid values fall back to the existing target under the established
non-finite-input convention. Zero and `Number.MAX_SAFE_INTEGER - 1` remain
valid. `reorderThreshold` remains a non-negative finite decimal; only the
target clamp uses its ceiling so the stored target remains an integer. If the
resulting target cannot satisfy the lot-compatible bound, the transition
returns the original game rather than committing invalid state. No UI,
persistence, scenario, art, dynamics, FIFO, economics, or accounting behavior
was changed.

### TDD evidence

Focused RED was captured after adding the four invalid-target regressions, the
zero/MAX-minus-one controls, and the decimal-threshold regression, before the
production edit:

```bash
bun run test:unit -- --project server --run src/lib/game/stock.spec.ts -t "targetStock|decimal reorderThreshold"
```

```text
❯ |server| src/lib/game/stock.spec.ts (41 tests | 5 failed | 35 skipped) 47ms
     × keeps the existing targetStock for negative input
     × keeps the existing targetStock for fractional input
     × keeps the existing targetStock for exact max input
     × keeps the existing targetStock for unsafe input
     × preserves decimal reorderThreshold with an integer targetStock

Test Files  1 failed (1)
     Tests  5 failed | 1 passed | 35 skipped (41)
error: script "test:unit" exited with code 1
```

Focused GREEN:

```bash
bun run test:unit -- --project server --run src/lib/game/stock.spec.ts
```

```text
Test Files  1 passed (1)
     Tests  41 passed (41)
```

### Changed files and checks

- `src/lib/game/stock.ts`
- `src/lib/game/stock.spec.ts`
- this report

The required `bun run check` completed with `svelte-check found 0 errors and 0
warnings`. `bun run lint` completed with `All matched files use Prettier code
style!` and exit 0. `git diff --check` passed with exit 0. No Svelte file was
changed, so the mandatory Svelte MCP protocol was not applicable.

Commit: `fix(products): validate live inventory targets`.

The coordinator-owned ignored `progress.md` was preserved unchanged and was
not staged.
