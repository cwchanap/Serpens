# HPA-38 final whole-branch remediation round 2: boundary contracts

## Scope and root-cause evidence

- Worktree: `/Users/chanwaichan/workspace/Serpens/.worktrees/codex-hpa-38-richer-product-dynamics`
- Branch base: `93b1fdc6a8360bf709ef5c549f6b91005d181d2f`
- Normative sources: `docs/superpowers/plans/2026-08-17-richer-product-dynamics.md` and `docs/superpowers/specs/2026-08-17-richer-product-dynamics-design.md`
- Scope: close the final ProductId identity boundary at retail selection/edit/planner callbacks and make the schema-17 application report shape agree with the already-strict decoder.

The whole-branch review identified two independent type-contract gaps:

1. `StoreStockTable` and `StoreDetailModal` exposed `categoryId: string` callbacks and `string[]` allowlists, while `+page.svelte` cast those values back to `ProductId` before calling the controller. `SupplyAdvisor`, `ProductChainsPanel`, `CategoryStampIndex`, the management host, and the planner route had the same generic-string callback/selection seam. The corrected contracts are visible at `StoreStockTable.svelte:24-27`, `SupplyAdvisor.svelte:25-30`, `+page.svelte:1951-1984` and `+page.svelte:2210-2235`; the controller now receives `ProductId` directly at `gameRouteController.ts:1177-1209`.
2. The schema-17 decoder requires every Task 5 product-evidence field and store/daily inventory-loss total (`saveCodec.ts:3093-3119`, `saveCodec.ts:4055-4089`), but `DailyProductReport`, `DailyStoreReport`, and `DailyReport` still allowed those fields to be omitted. UI compatibility fallbacks consequently hid invalid current-schema application objects. The application interfaces are now strict at `types.ts:798-809`, `types.ts:822-844`, and `types.ts:846-878`.

No persistence decoder logic, migration/legacy alias, sales/accounting behavior, catalog dynamics, or dashboard was added or changed.

## Test-first RED evidence

The focused static contract test was added before the implementation. Its `expectTypeOf` assertions intentionally required the desired `ProductId` props and strict report fields. The first `bun run check` was RED at those assertions and at existing callers: the UI callbacks/allowlist were still generic strings, `SupplyAdvisor` still exposed the old category props, and all schema-17 evidence/loss fields were inferred as `number | undefined` rather than the required `number` (age fields were inferred as possibly undefined instead of `number | null`).

The initial browser-project invocation also exposed Vitest's `requireAssertions` rule because compile-time `expectTypeOf` assertions have no runtime assertion. The contract test retained the smallest runtime `expect(true).toBe(true)` sentinel while the type assertions remain checked by `svelte-check`.

The RED break caught:

- generic `string` callback and `readonly string[]` allowlist contracts at retail edit boundaries;
- generic category selection props at the planner and product-chain boundaries;
- optional schema-17 product evidence and store/daily inventory-loss fields in application types.

## Implementation

### ProductId boundary

- Retail stock/detail callbacks now accept `(storeId, productId: ProductId, patch)` and allowlists are `readonly ProductId[]`.
- Planner and product-chain callbacks/selection props are named `productId`/`productIds` and typed `ProductId`/`readonly ProductId[]` through `+page.svelte`, `ManagementPanelHost`, `ProductChainsPanel`, `CategoryStampIndex`, `SupplyAdvisor`, `StoreProductChainPanel`, and `supplyPlannerRoute`.
- Generic DOM values are narrowed once at the actual `<select>` boundary by checking membership in the typed candidate list before invoking the ProductId callback. The unchecked UI/controller casts were removed.
- Existing user-facing translation keys and intentional industry/material/category vocabulary remain unchanged.

### Strict report types

- `DailyProductReport` now requires waste/shrink units and values, stockout loss, nullable age evidence, trend/obsolescence multipliers, base/effective prices, and markdown amount.
- `DailyStoreReport.inventoryLossExpense` and `DailyReport.inventoryLossExpense` are required numbers.
- Simulation/read-model builders and all current-schema fixtures now provide the strict shape. Aggregate product reports preserve the evidence fields without changing sales or accounting calculations.
- UI fallbacks were removed only for required report evidence and inventory-loss totals. Legitimate nullable age handling and unrelated optional data remain intact.

## GREEN evidence

```text
$ bun run test:unit -- --project client --run \
  src/lib/components/game/productIdContracts.svelte.spec.ts \
  src/lib/components/game/StoreStockTable.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/lib/components/game/SupplyAdvisor.svelte.spec.ts \
  src/lib/components/game/ProductChainsPanel.svelte.spec.ts \
  src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/lib/components/game/StoreOverview.svelte.spec.ts \
  src/lib/components/game/TileInspector.svelte.spec.ts

Test Files  9 passed (9)
Tests       165 passed (165)
```

```text
$ bun run test:unit -- --project server --run \
  src/routes/supplyPlannerRoute.spec.ts \
  src/routes/page.svelte.spec.ts \
  src/routes/gameRouteController.spec.ts \
  src/lib/game/productChainGraph.spec.ts \
  src/lib/game/productChainTree.spec.ts \
  src/lib/game/reports.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/world.spec.ts \
  src/lib/scenarios/metrics.spec.ts

Test Files  8 passed (8)
Tests       349 passed (349)
```

```text
$ bun run test:unit -- --project server --run \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveCodec.railValidation.spec.ts \
  src/lib/persistence/saveRepository.spec.ts \
  src/lib/persistence/saveRepositoryFactory.spec.ts \
  src/lib/persistence/tauriSaveRepository.spec.ts

Test Files  5 passed (5)
Tests       566 passed (566)
```

```text
$ bun run check
svelte-check found 0 errors and 0 warnings

$ bun run lint
All matched files use Prettier code style!

$ git diff --check
passed
```

## Svelte MCP evidence

Before component edits, the official Svelte MCP sections were discovered and fetched for `$props`, `$derived`, basic markup, `{#if}`, `{#each}`, TypeScript, testing, and accessibility. After the final edits and formatting, the autofixer was run on every changed `.svelte` file:

- `ProductChainsPanel.svelte`, `ReportsPanel.svelte`, `StoreDetailModal.svelte`, `StoreStockTable.svelte`, `SupplyAdvisor.svelte`, `CategoryStampIndex.svelte`, and `ManagementPanelHost.svelte`: no issues or suggestions.
- `StoreProductChainPanel.svelte`: no issues; two existing suggestions about assigning `previousStoreId` and `selection` inside `$effect`.
- `+page.svelte`: no issues; one existing suggestion about a function call inside `$effect`.

Those suggestions predate this remediation and are unrelated lifecycle refactors, so they were left untouched to keep the assigned change narrow. No playground link was used because the Svelte files were written directly to the project.

## Changed-file/scope audit

Production contract files:

- `src/lib/game/types.ts`
- `src/lib/game/productChainGraph.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/components/game/{StoreStockTable,StoreDetailModal,SupplyAdvisor,ProductChainsPanel,StoreProductChainPanel,ReportsPanel}.svelte`
- `src/lib/components/game/atlas/CategoryStampIndex.svelte`
- `src/routes/{+page,ManagementPanelHost}.svelte`
- `src/routes/{gameRouteController,supplyPlannerRoute}.ts`

Direct contract/fixture coverage was updated in the corresponding component, route, game, and scenario specs, plus `src/routes/retail-sim.e2e.ts` helper vocabulary. The new static contract proof is `src/lib/components/game/productIdContracts.svelte.spec.ts`. No unrelated source subsystem was changed.

## Remaining limitations

- This round did not run the full browser/e2e suite; the focused client/server/persistence coverage and static/lint checks are green.
- The two pre-existing Svelte `$effect` suggestions described above remain for a separate lifecycle-focused change.

## Handoff

The narrow conventional commit for this remediation is recorded in the branch history after this report is added. The worktree should be clean at handoff.
