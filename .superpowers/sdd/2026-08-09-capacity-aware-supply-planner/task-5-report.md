# Task 5 report — planner route cutover

## RED/GREEN evidence

- Product Chains RED: after temporarily removing the entry button, `bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts -t "emits the selected category" --run --project client` timed out locating the Supply Advisor button. Restoring the button made the focused test pass.
- Route RED chronology was corrected before implementation: `+page.svelte`, `ManagementPanelHost.svelte`, and `SupplyAdvisor.svelte` were restored to `3d3d8f6`; only the Product Chains slice remained. New route tests then ran against a no-op handoff/derivation helper and produced six behavioral failures (closed derivation, producer/warehouse, upgrade, rail, and stale/no-op expectations). Fresh implementation made those tests pass.
- Reactive-state regression RED: a new route test passed a Proxy-backed game to the real planner and observed `DataCloneError: Failed to execute 'structuredClone' ... #<Object> could not be cloned.` The fix snapshots the Svelte game before planner calculation; the regression now passes.
- Focused GREEN: `bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client` — 3 files, 61 tests passed.
- Management host GREEN: `bun run test:unit -- src/routes/ManagementPanelHost.svelte.spec.ts --run --project client` — 13 tests passed.
- `bun run check` — 0 errors and 0 warnings.
- Exact ESLint command — pass. Exact Prettier check — all files matched.
- Targeted browser regression: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "supply advisor recommends and arms a starter build"` — 1 passed.

## Svelte evidence

Before editing, official Svelte MCP `list-sections` was called and relevant documentation was fetched for `$state`, `$derived`, `$props`, events, window/keyboard behavior, testing, TypeScript, accessibility, navigation, and routing.

Final `svelte-autofixer` results (Svelte 5):

- `ProductChainsPanel.svelte`: issues `[]`, suggestions `[]`, no further call required.
- `ManagementPanelHost.svelte`: issues `[]`, suggestions `[]`, no further call required.
- `SupplyAdvisor.svelte`: issues `[]`, suggestions `[]`, no further call required.
- `+page.svelte`: issues `[]`; one existing suggestion remains for calling a function inside an `$effect` (the pre-existing audio effects), with no planner-specific issue.

## Files changed

- `src/lib/components/game/ProductChainsPanel.svelte` / `.spec.ts`: category-specific Supply Advisor entry and callback coverage.
- `src/routes/ManagementPanelHost.svelte`: forwards `onPlanCategory`.
- `src/lib/components/game/SupplyAdvisor.svelte` / `.spec.ts`: planner-only props/rendering; removed the temporary `AdvisorChain`/`chains`/`onBuild` compatibility branch.
- `src/routes/+page.svelte`: route-local category/horizon context, availability derivation, closed-modal `$derived.by` gate, snapshot boundary, Product Chains entry, and navigation-only build/warehouse/upgrade/rail handoffs.
- `src/routes/supplyPlannerRoute.ts`: pure derivation/category/handoff helpers and stale/no-op guards.
- `src/routes/page.svelte.spec.ts`: route RED/GREEN coverage for gating, context fallback, reactive snapshots, handoffs, stale/no-op behavior, and read-only selection.

## Self-review and concerns

- Planner actions re-check the current recommendation, current building, city, availability, and disconnected status before any handoff. Build/upgrade/rail controller mutation methods are not called; existing placement, inspector, and rail-mode workflows own the eventual mutation.
- The initial browser failure was a real Svelte Proxy structured-clone boundary issue, not a timing workaround; it is covered by a regression test and fixed at the route/planner boundary.
- The autofixer’s `$effect` suggestion is pre-existing route audio behavior and was left untouched to avoid unrelated refactoring.
