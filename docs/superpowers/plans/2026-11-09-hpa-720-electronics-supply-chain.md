# HPA-720 — Electronics Supply Chain: Single-PR Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-720/content-add-an-electronics-supply-chain-so-electronics-stores-can-sell
**Design:** `docs/superpowers/specs/2026-11-09-hpa-720-electronics-supply-chain-design.md`
**Art dependency:** https://linear.app/cwchanap/issue/HPA-719/art-generate-sprites-for-the-electronics-supply-chain
**Branch / PR:** `docs/hpa-720-electronics-supply-chain` — one HPA-720 draft PR for planning, assets, implementation, test and measured addendum
**Inspected base:** `main@3b0b56d62a638aca71bb056979e39acc3f68f3b1`
**State:** reviewed design/plan only; HPA-719 gates art integration and final PR readiness, **not** catalog/test/calibration work. No runtime changes or test success claimed.

## Delivery decision and review gates

HPA-719 remains a **separately tracked art task** for generating/approving seven images, but its files are committed to **this one** HPA-720 PR branch as an art-only commit when ready. There is no separate art PR and **no art-first coding gate**: proceed immediately with catalogs, world unlocks, tests and measurement. **As soon as Step 1 adds new ID unions, register the final seven image-path strings in `gameArt.ts` in that same change** so the exhaustive `Record<Id, string>` contracts keep `bun run check` usable. No PNG assets are required for the strings; only `gameArt.spec.ts` asset-existence checks may fail until the art lands. Disclose that intermediate failure without suppressing it. The art commit can follow the early domain commits; it still blocks marking this draft PR ready.

No new subsystem, new ticket, new migration, or broad tuning. The code's existing catalog-driven paths should do the work. The two obsolete `industry.ts` lists are removed rather than extended; the two live `world.ts` reveal lists become derived.

## Step 0 — Baseline, source-contract and art coordination (nonblocking)

- [ ] Before runtime changes, refresh `main`, check whether any requested IDs or paths already exist, and note the **exact** base commit and code revision. Review `CLAUDE.md`, `industry.ts`, `world.ts`, `worldCatalog.ts`, `products.ts`, `industryFootprint.ts`, `gameArt.ts`, `gameArt.spec.ts` and the existing bot tests. Preserve this design's original inspected SHA as provenance.
- [ ] Keep HPA-719 running as an independent **art-generation task**: seven approved 96x96 transparent sprites with the ticket's visual references; no scripted pixels, SVG substitutes, art PR, or new asset generation hidden in a code step.
- [ ] Capture the **current base-SHA** behavior with the existing deterministic progression CLI and its `SWEEP_SEEDS` matrix. Historic `docs/balance/progression-calibration.md` §3 used static credit and predates HPA-679; do not compare HEAD against it. Store generated base JSON in ignored `docs/balance/generated/` or another local untracked folder.

**Gate:** baseline recorded. Missing PNGs **do not block** Steps 1–3; they block the final release gate only.

## Step 1 — Typed catalogs + real world unlocks (no new subsystem)

1. In `src/lib/game/types.ts`, extend `IndustryResourceId`, `MaterialId`, `ProductionRecipeId`, `IndustrialBuildingTypeId` with the fixed copper/board/accessory IDs from the spec. **In the same first catalog commit**, register the seven fixed strings in `src/lib/assets/gameArt.ts`'s `INDUSTRY_RESOURCE_ART`, `INDUSTRY_MATERIAL_ART`, and `INDUSTRIAL_BUILDING_ART`. The records are exhaustive: without these keys, `bun run check` fails even though assets aren't loaded. This does not generate or require PNG files; the existence-focused `gameArt.spec.ts` will stay red until the HPA-719 files arrive.
2. In `src/lib/game/industry.ts`, add copper deposit at **xFrac=0.25, yFrac=0.222**, three materials, three recipes and three buildings with the already proposed candidate data. In `industry.spec.ts`, **delete** the test-only `CONVENIENCE_BUILDING_TYPE_IDS` and `FINISHED_PRODUCT_MATERIAL_IDS` imports/assertions, and replace useful completeness assertions with catalog-derived iterations. Remove both dead exports and the `FinishedProductMaterialId` alias from `industry.ts`. They are not consumed by the build menu or product-chain runtime.
3. In `worldCatalog.ts`, add `copper-deposit` to resource profiles for starter `industry-city` and `quarry-works`, not `breadbasket-basin`; adjust the small specialty strings only as needed. No city or terrain change.
4. In `src/lib/game/world.ts`, derive **two module-private runtime lists** (do not merely append new literals): raw producers = `Object.values(INDUSTRIAL_BUILDING_TYPES).filter(type => type.requiredResource !== null).map(type => type.id)`; Quarry reveal materials = `Object.values(MATERIALS).filter(material => material.kind === 'finished' && (getCategoryTier(material.id) ?? 0) >= 2).map(material => material.id)`. Import the existing catalogs/helpers from `industry.ts`; preserve `hasWarehouseAndRawProducer`, city-attributed finished inventory/report checks and existing tier-1 material exclusions. These catalog projections should retain prior values and automatically add the copper mine/new final product. **Do not export these lists just for test introspection**: check the behavior through existing `refreshWorldProgress(gameStub(...))` fixtures in `world.spec.ts`.
5. In `products.ts`, link **only** `PRODUCTS.accessories.productionMaterialId` to `electronic-accessories`; preserve demand, price, category and all other electronics products.
6. Update stale comments in both `progression.ts` (the claim electronics cannot qualify) and `tests/balance/bots.ts` (electronics plans no chain and the old hardcoded Quarry material set). Do **not** change their runtime logic.

**Focused tests:** `industry.spec.ts`, `products.spec.ts`, `worldCatalog.spec.ts`, `world.spec.ts` cover exact catalog wiring, full recursive chain, city profiles and unlocks. In `world.spec.ts`, reuse the existing `gameStub` helper and call public `refreshWorldProgress`: prove a warehouse + copper mine unlocks Breadbasket, city-attributed `electronic-accessories` unlock Quarry Works, and tier-1 finished materials do not. These are small behavioral fixtures, so no test-only exports or new helper API are needed. Check that existing city reveal conditions remain intact. Run `bun run check` after Step 1; the art filesystem specs remain a known temporary failure until Step 4.

## Step 2 — Placement, production and one bot-driven local-delivery regression

- [ ] In `industryPlacement.spec.ts` and `industry.spec.ts`, assert the production **56×48** copper anchor at (14,11), a legal 2×2 footprint covering x=14..15 within the extraction district and clear of chemical/blocked tiles. Verify the smaller 18×18 fixture remains legal. Copper mine requires its own resource **only at the anchor**; both factories require industrial terrain.
- [ ] In `industryProduction.spec.ts`, exercise the three recipes and existing import fallback, cost accounting, buffers, stage ordering and deterministic execution with narrowly scoped test fixtures (do not construct a full 9-building retail/rail fixture).
- [ ] In the **existing** `tests/balance/progressionBots.spec.ts`, add **one** 365-day `runProgressionBot('electronics', seed, 365)` regression. Choose/pin a seed **only after** a real trial produces local units; do not invent a successful seed. Sum `accessories` `DailyProductReport.warehouseUnits` from actual daily store reports and assert >=25, then confirm production `retail-local-units` tier-3 evidence; pin a claim day if earned. This bot drives the real Supply Planner, placement, rail, warehouse and retail replenishment and replaces the proposed manually wired integration test and separate manual probe step.
- [ ] Inspect existing `productChainTree.ts`, `productChainGraph.ts`, planner and advisor behavior under that test. Make only an evidenced hardcoded-assumption fix; no special-case electronics bot policy or new UI module. If the 25-unit proof fails, investigate why the real planner/rail/replenishment flow stalls before adding complexity.

**Gate:** a real seeded bot run proves >=25 accessories served from local inventory, not just factory-buffer or warehouse production.

## Step 3 — Base-vs-HEAD deterministic measurement before art integration

- [ ] Rerun `bun run tests/balance/progressionRun.ts` using the **same** 50 `SWEEP_SEEDS` (20260501..20260550), all four archetypes, 365 days, on the implementation HEAD and diff against the Step-0 base-SHA sweep. Include the existing 200 idle negative controls.
- [ ] **Hard comparison:** non-electronics (convenience, grocery, boutique) per-seed progression rows must be **identical**. If any differ, analyze changed industry placement/rail reachability from the anchor and disclose/fix it; don't silently accept them as unrelated tuning. Confirm idle controls and claim invariants remain valid.
- [ ] Record the electronics tier-3 numerator/50, reached-run claim-day distribution, remaining blockers, real local-vs-imported accessories counts, measured new-chain daily/units costs and seed 20260503's actual trace. If electronics gets no tier-3 claims, investigate without global economic retuning. The candidate recipes are intentionally not a local-profit gate; HPA-721 owns economy balancing.
- [ ] Rerun the existing `bun run balance` Gate A/scenario checks and preserve historical `docs/balance/baseline.md`, `after.md`, `rail-throughput-calibration.md` and all pre-existing sections of `progression-calibration.md`. Append only an **HPA-720 addendum** with commands and the new base/HEAD comparison. No timestamps in generated artifacts.

**Gate:** reproducible local accessory delivery, honest measured tier-3 result and zero unexplained non-electronics differences.

## Step 4 — HPA-719 art, registrations, localization and UI (PR readiness)

1. When HPA-719's separately tracked art task delivers seven approved PNGs, commit all seven unchanged on this same HPA-720 branch as a dedicated **art-only commit**. Their arrival does not need to precede the catalog commits; no independent art PR.
2. The seven final path strings have **already been registered in Step 1** to keep exhaustive TypeScript checks green. After HPA-719's art-only commit, update only the corresponding fixed path-map fixtures in `gameArt.spec.ts` and run the generic existing asset assertions for file existence, 96x96, alpha and duplicate bytes; review 32px legibility manually. `RECIPE_BUILDING_ART` remains derived from the building catalog; do not duplicate it.
3. Add names to `src/lib/i18n/messages/{en,ja,zh-Hant}.ts`. Add a `MaterialId`, `IndustrialBuildingTypeId`, `IndustryResourceId` type import to `en.ts`, then enforce nested `materials`, `industrialBuildings`, and `industryResources` object completeness using `satisfies Record<..., string>` for each respective type. Existing locale-shape checks then cover ja/zh-Hant. If nested `satisfies` is not compatible with the current type/layout, use a single small catalog-completeness spec across all locales instead. Adjust affected city specialty copy.
4. In `src/routes/retail-sim.e2e.ts`, remove the duplicated eight-ID starter resource array in `STARTER_INDUSTRY_CITY`: obtain `const starterIndustry = getWorldCityDefinition('industry-city')!` (using the existing world catalog export), pass its authoritative `industryResourceProfile!` to `generateIndustryCity`, and ideally also use its `id`, `name` and `seed` to prevent further drift. Keep standard width/height constants. Update only affected sprite/resource count assertions in this E2E file and other industry map tests; verify build menu, graph/tree, supply planner and sprite visibility without new UI.

**Gate:** approved art exists at the Step-1 registered paths, generic asset specs pass, exhaustive localized catalog labels and UI/E2E fixtures are consistent, and there are no missing assets. Only now can the draft PR become ready.

## Step 5 — Final verification before marking the same PR ready

Run incrementally after each small commit, then full:

```sh
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
git diff --check main...HEAD
```

Review exact tests at minimum: `industry.spec.ts`, `industryPlacement.spec.ts`, `industryProduction.spec.ts`, `products.spec.ts`, `worldCatalog.spec.ts`, `world.spec.ts`, `tests/balance/progressionBots.spec.ts`, `productChainTree.spec.ts`, `supplyPlanner.spec.ts`, `progression.spec.ts`, `gameArt.spec.ts`, `industryMapScene.spec.ts`, `retail-sim.e2e.ts`, and the progression calibration CLI.

- [ ] All seven path strings registered alongside ID unions before early `bun run check`; final seven approved PNGs present, no placeholder/asset script, all path fixtures consistent
- [ ] Only `accessories` gets a production material link
- [ ] Copper 56×48 footprint and both catalog-derived city unlocks proven via existing `refreshWorldProgress` tests without test-only exports
- [ ] One bot-run integration shows >=25 actual retail-local accessories
- [ ] Base-SHA vs HEAD sweep records electronics reachability with identical non-electronics rows
- [ ] No new state owner, save migration or economy/tier retune
- [ ] Three-language copy complete; `STARTER_INDUSTRY_CITY` E2E resource profile sourced from `worldCatalog.ts` rather than duplicated; affected UI/e2e tests updated
- [ ] Reproducible post-change electronics tier-3 measurement and observed unit costs in an HPA-720 addendum; frozen earlier reports unchanged
- [ ] CI, unit, e2e, lint/check green and no unresolved blocking review findings

No runtime implementation, art delivery, or test execution is claimed by this planning-only commit. Continue implementation and review in **this one draft PR**; do not split it into a docs PR plus a code PR.
