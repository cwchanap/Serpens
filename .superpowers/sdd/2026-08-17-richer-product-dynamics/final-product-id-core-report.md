# HPA-38 final ProductId core contract report

## Scope

This report covers final remediation round 3B only: the core retail product
edit transition and its direct retail sales helpers. The implementation does
not change UI/Svelte, persistence, catalog data, product dynamics, sales
economics, FIFO behavior, accounting, migrations, or scenario behavior.

The coordinator-owned ignored ledger at
`.superpowers/sdd/2026-08-17-richer-product-dynamics/progress.md` was preserved
and was not edited or staged.

## CodeGraph evidence

The pre-edit CodeGraph exploration for `ProductId updateStoreProduct stock.ts
retail product sales helpers callers` found:

- `updateStoreProduct` at `src/lib/game/stock.ts:70`, with seven callers in
  `src/lib/scenarios/runtime.ts` and `src/routes/gameRouteController.ts`, plus
  stock/runtime tests.
- `simulateProductSalesForCity` at `src/lib/game/stock.ts:250`, with three
  callers in `src/lib/game/simulateDay.ts` and stock tests.
- The source had `productId: string` at the edit transition and in the direct
  `findStoreProduct`/`scoreStoreForCategory` sales helpers, with unchecked
  `as ProductId` conversions at the helper and demand-key boundaries.

The post-edit CodeGraph exploration confirms the same caller graph and the
typed core symbols. Current source evidence is:

- `stock.ts:70-74`: `updateStoreProduct` keeps `storeId: string` and now
  accepts `productId: ProductId`.
- `stock.ts:250-299`: sales demand keys are narrowed with the catalog-backed
  `isProductId` predicate before lookup and seller iteration.
- `stock.ts:476-500`: `findStoreProduct` and `scoreStoreForCategory` accept
  `ProductId` directly; no ProductId casts remain in `stock.ts`.
- `stock.ts:514-524`: report/store keys remain generic strings, while
  `isProductId` uses the existing `PRODUCTS` catalog for key narrowing.

## TDD evidence

The focused contract test was added before the production edit:
`src/lib/game/stock.spec.ts:166-187`.

RED, before the implementation:

```text
$ bun run check
$ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
Loading svelte-check in workspace: /Users/chanwaichan/workspace/Serpens/.worktrees/codex-hpa-38-richer-product-dynamics
Getting Svelte diagnostics...

/Users/chanwaichan/workspace/Serpens/.worktrees/codex-hpa-38-richer-product-dynamics/src/lib/game/stock.spec.ts:183:4
Error: Unused '@ts-expect-error' directive.
		if (false) {
			// @ts-expect-error Product edits must not accept arbitrary strings.
			updateStoreProduct(game, 'store-1', arbitraryProductId, {});
		}

====================================
svelte-check found 1 error and 0 warnings in 1 file
error: script "check" exited with code 1
```

The compile-only guard was then changed to an uninvoked typed closure after
lint identified `no-constant-condition`; the production contract proof and
the RED reason remained unchanged.

## GREEN verification

- `bun run test:unit -- src/lib/game/stock.spec.ts --run`: 1 file, 35 tests
  passed.
- `bun run test:unit -- src/lib/game/stock.spec.ts src/lib/game/simulateDay.spec.ts src/lib/scenarios/runtime.spec.ts --run`:
  3 files, 151 tests passed.
- `bun run check`: 0 errors, 0 warnings.
- `bun run lint`: Prettier and ESLint passed.
- `git diff --check`: passed with no whitespace errors.

## Contracts traced

- The typed controller path now reaches `updateStoreProduct` without a
  generic product string. Existing route and scenario callers already carry
  `ProductId` values and required no behavior changes.
- Retail sales demand entries and sorted demand keys are narrowed to
  `ProductId` before catalog lookup, seller scoring, and report composition.
- `findStoreProduct` and `scoreStoreForCategory` now receive `ProductId`, so
  their catalog/archetype lookups require no unchecked conversion.
- `storeId`, city/store maps, capacity maps, product-report maps, and report
  append keys remain `string` because they identify stores or other generic
  entities rather than catalog products.

## Changed files

- `src/lib/game/stock.ts` — ProductId transition/helper signatures and
  type-safe demand-key narrowing only.
- `src/lib/game/stock.spec.ts` — focused ProductId contract proof and a valid
  catalog ID for the existing missing-product characterization.
- `.superpowers/sdd/2026-08-17-richer-product-dynamics/final-product-id-core-report.md`
  — this report.

No behavior-changing diff was found: product calculations, RNG call order,
FIFO operations, stockout attribution, reports, and accounting paths are
unchanged. The only runtime-facing guard is on the already-typed
`RetailDemandProfile` key boundary; valid catalog demand entries follow the
same insertion order and the sales loop retains its existing sort.

## Commit

Final narrow commit: `refactor(products): tighten core product id contracts`.
The handoff records the resulting commit hash because this report is part of
that commit.

## Remaining limitations

Verification here is focused on the changed core and direct callers; the full
unit/e2e gate was not rerun because this remediation is type-only and the
required focused checks are green. Presentation/asset lookup helpers and
persistence decoding remain outside this assigned core transition/sales scope.
