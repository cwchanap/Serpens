# HPA-720 — Electronics Supply Chain: Single-PR Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-720/content-add-an-electronics-supply-chain-so-electronics-stores-can-sell
**Design:** `docs/superpowers/specs/2026-11-09-hpa-720-electronics-supply-chain-design.md`
**Art dependency:** https://linear.app/cwchanap/issue/HPA-719/art-generate-sprites-for-the-electronics-supply-chain
**Branch / PR:** `docs/hpa-720-electronics-supply-chain` — one HPA-720 draft PR for planning, assets, implementation, test and measured addendum
**Inspected base:** `main@3b0b56d62a638aca71bb056979e39acc3f68f3b1`
**State:** design and plan only; HPA-719 still blocks asset integration; no runtime changes or test success claimed.

## Delivery decision and review gates

HPA-719 remains a **separate art task** for generating/approving seven images, but its files are committed to **this** HPA-720 branch. Avoid a separate asset-only PR: `gameArt.spec.ts` checks disk paths against registry content and an unregistered-asset branch can fail. The docs checkpoint is allowed now; the art should be the **first non-document implementation commit** before adding registrations. Keep the HPA-720 PR draft until art approval, code, evidence and verification all pass.

No new subsystem, new ticket, new migration, or broad tuning. The code's existing catalog-driven paths should do the work.

## Step 0 — Art and baseline prerequisites

- [ ] HPA-719: Generate the exact seven 96x96 transparent sprites using the listed references, inspect at 32px, secure Hapadona approval; do not draw with Node/Python/canvas.
- [ ] Add all seven to `static/assets/game/industry/{resources,buildings,materials}/` on this branch as an asset-only **implementation** commit. Do not fabricate missing images or substitute SVGs.
- [ ] Before coding, refresh `main` and check that none of the seven paths, four ID union members, or recipe IDs has appeared in another PR.
- [ ] Re-read `CLAUDE.md` and the existing `industry.ts`, `worldCatalog.ts`, `products.ts`, `gameArt.ts`, and `gameArt.spec.ts` contracts. Keep this design's baseline SHA as provenance, not a reason to ignore newer changes.

**Gate:** seven approved files actually exist; if not, stop the implementation here while leaving this planning PR draft.

## Step 1 — Extend the existing typed catalogs (no new behavior module)

1. In `src/lib/game/types.ts`, extend `IndustryResourceId`, `MaterialId`, `ProductionRecipeId` and `IndustrialBuildingTypeId` with the design's fixed IDs.
2. In `src/lib/game/industry.ts`, add the copper-deposit anchor at xFrac=0.278/yFrac=0.222 and three material definitions, three recipe definitions and three building definitions with candidate numbers from the spec.
3. Add `electronic-accessories` to `FINISHED_PRODUCT_MATERIAL_IDS` and the three building IDs to `CONVENIENCE_BUILDING_TYPE_IDS` (the legacy name is used by the current build-menu catalog; rename is not in scope).
4. Add `copper-deposit` to resource profiles for `industry-city` and `quarry-works` in `worldCatalog.ts`. Update relevant descriptions without changing cities, unlocks or the terrain-generation algorithm.
5. Link only `PRODUCTS.accessories.productionMaterialId` to `electronic-accessories`. Preserve all other product fields and electronics products. Delete the now-stale claim in `progression.ts` comments that electronics cannot qualify.

**Focused tests:** `industry.spec.ts` checks recipe inputs/outputs, chain-building traversal, resource generation and seeded determinism; `products.spec.ts` pins the sole new link; `worldCatalog.spec.ts` pins resource availability. Add no separate graph registry or duplicate product-to-recipe mapping.

## Step 2 — Prove placement and production/replenishment via existing paths

- [ ] In `industryPlacement.spec.ts`, prove copper mine accepts only a `copper-deposit` anchor and obeys existing 2x2 footprint/locked/occupied/rail rules; test each processor's industrial-terrain requirement. Confirm the new anchor does not collide with blocked internal separator cells at 18x18 and normal industry size.
- [ ] In `industryProduction.spec.ts`, build or fixture the three new buildings with required shared suppliers. Tick the real `simulateIndustryProduction` stage order and check quantities, cash accounting, determinism, buffer behavior and imported-input fallback.
- [ ] Add a *small integration test* using real rails, one warehouse and retail replenishment, not injected `retail-local-units` counters. Show `electronic-accessories` reaches a city inventory, `accessories` is replenished locally, and its `DailyProductReport.warehouseUnits` / tier-3 metric increments. Avoid duplicating an existing integration fixture or weakening the assertion to producer output.
- [ ] Check `productChainTree.ts`, `productChainGraph.ts`, `supplyPlanner.ts` and advisor result on the new product. First assert reuse: fix only a demonstrable hardcoded materials assumption. `tests/balance/bots.ts` should pick up accessories automatically and must not gain a special-case electronics strategy.

**Gate:** one real seeded end-to-end *domain* path shows local delivery, not just nominal industry production.

## Step 3 — Assets, copy and existing UI

1. In `src/lib/assets/gameArt.ts`, extend `INDUSTRY_RESOURCE_ART`, `INDUSTRY_MATERIAL_ART` and `INDUSTRIAL_BUILDING_ART` with the seven paths from HPA-719. Do not separately hand-maintain recipe art: `RECIPE_BUILDING_ART` derives it from the building catalog.
2. Extend the hardcoded corresponding path maps in `gameArt.spec.ts`; assert all seven exact PNGs exist and are 96x96 with alpha, and honor existing duplicate-art checks.
3. In `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts`, add keys for three materials, three buildings and copper resource. Update Quarry Works / Industry City specialty descriptions where the new resource should be named.
4. Review `src/routes/retail-sim.e2e.ts` generated-resource assertions, and any industry map sprite-count expectations (including Phaser preload tests). Update *only* counts/fixtures changed by adding the anchor or sprites. Verify the build menu, Supply Planner and chain-tree UI display the new catalog content without new UI components.

**Gate:** approved sprites render at map size, all names are localized, and existing image/scene conventions remain intact.

## Step 4 — Measure the progression consequence; do not tune the economy

- [ ] Run a cheap deterministic named-seed electronics probe first (e.g. 20260503, 365 days) and inspect the bot's recommendations/builds, warehouse rail deliveries, retail-local-units evidence and tier-3 claim. If it never transfers locally, diagnose an existing path/fixture before changing constants or inventing new bot logic.
- [ ] Run `bun run balance` for existing Gate A/scenario evidence and the existing progression CLI using `SWEEP_SEEDS` 20260501..20260550, all four archetypes, 365 days; also run the 200 idle negative controls. The published baseline is historical; preserve all original sections/results.
- [ ] Append a clearly dated **HPA-720 addendum** in `docs/balance/progression-calibration.md`. Record exact commands/seeds, tier-3 reached count (especially electronics 0/50 before -> measured after), reached-only claim-day quantiles, seed-20260503 trace, non-electronics changes, remaining blockers, and explicit limitations. Do not assert all electronics seeds succeed just because the structural link exists.
- [ ] Do not touch `docs/balance/baseline.md`, `after.md`, `rail-throughput-calibration.md`; do not retune `progression.ts` thresholds, salaries, economy constants outside the new chain, or scenario medal curves. If an unrelated invariant materially regresses, retain the PR as draft, disclose it, and fix only a directly caused regression without widening to HPA-721.
- [ ] Ensure the generated JSON traces stay in `docs/balance/generated/` (git-ignored) unless the repository already explicitly tracks a summarized result; no timestamps or unstated random seeds.

**Acceptance:** the new chain genuinely delivers local accessories, and *some* progression-bot electronics seeds claim tier 3. HPA-721 owns the much stronger all-store-type first-year target and global profitability tuning.

## Step 5 — Final verification before marking the same PR ready

Run incrementally after each small commit, then full:

```sh
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
git diff --check main...HEAD
```

Review exact tests at minimum: `industry.spec.ts`, `industryPlacement.spec.ts`, `industryProduction.spec.ts`, `products.spec.ts`, `worldCatalog.spec.ts`, `productChainTree.spec.ts`, `supplyPlanner.spec.ts`, `progression.spec.ts`, `gameArt.spec.ts`, `industryMapScene.spec.ts`, `retail-sim.e2e.ts`, and `tests/balance/progressionCalibration.ts`/CLI tests.

- [ ] Seven real approved sprites, no placeholders/asset script, all path registries consistent
- [ ] Only `accessories` gets a production material link
- [ ] Resource placement and recipe graph work from true state transitions
- [ ] No new state owner, save migration or economy/tier retune
- [ ] Three-language copy complete and UI/e2e tests updated
- [ ] Reproducible post-change electronics tier-3 measurement in a short dated addendum
- [ ] CI, unit, e2e, lint/check green and no unresolved blocking review findings

No runtime implementation, art delivery, or test execution is claimed by this planning-only commit. Continue implementation and review in **this one draft PR**; do not split it into a docs PR plus a code PR.
