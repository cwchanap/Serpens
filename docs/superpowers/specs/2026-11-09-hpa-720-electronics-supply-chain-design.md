# HPA-720 — Electronics Supply Chain Design

**Linear:** https://linear.app/cwchanap/issue/HPA-720/content-add-an-electronics-supply-chain-so-electronics-stores-can-sell
**Roadmap:** HPA-717
**Art dependency:** HPA-719 (seven approved PNGs; separate art ticket, included in this same content PR)
**Inspected baseline:** `main@3b0b56d62a638aca71bb056979e39acc3f68f3b1` (November 9, 2026)
**Status:** proposed design / documentation-only draft. No assets, implementation, measurements, or passing tests claimed.

## Goal and evidence

Give electronics stores one playable local-supply path: copper deposit -> copper mine -> circuit-board plant -> accessory assembly plant -> city warehouse -> retail `accessories`. Reuse the existing plastic and packaging producers and the existing rail, inventory, retail replenishment, Supply Planner and product-chain views.

Currently all four electronics products have `productionMaterialId: null` in `src/lib/game/products.ts`. The Regional Supplier goal in `progression.ts` needs 25 run-to-date `retail-local-units` of industry-linked products. Its eligible product IDs are already derived from `PRODUCTS`, not a hardcoded list, so electronics is structurally unable to claim tier 3 (and the contiguous-prefix gate blocks tiers 4/5). The HPA-318 historical calibration records 0/50 electronics tier-3 runs, but its static-credit terms and pre-HPA-679 rail rules are NOT a valid current before/after control. Run the same seed/archetype matrix on this PR's base commit and its implementation HEAD. Report actual new electronics reachability only after measurement.

Keep the scope focused on **one final product**. `games`, `devices` and `peripherals` remain import-only. Existing retail product art for `accessories` is retained.

## Chosen catalog design

Names/IDs below are authoritative for HPA-719 asset filenames. Proposed numeric data are **starting values**, not a profitability guarantee or approved economy rebalance.

### Resource and map

- Add `copper-deposit` to `IndustryResourceId`. Its anchor has `terrain: 'deposit'` and uses the existing resource-anchored building placement rule.
- Add an anchor at `{ xFrac: 0.25, yFrac: 0.222, resource: 'copper-deposit', terrain: 'deposit' }` in `RESOURCE_ANCHOR_SPECS`. At the production 56×48 size the anchor is (14, 11); its 2×2 footprint spans x=14–15 and stays inside the extraction belt (x≤15), clearing the chemical anchor at x≈9. At 18×18 it is (5, 4); test that placement remains legal there. The previous xFrac=0.278 placed the normal-size anchor at x=16, outside the extraction district. Pin resource-availability, footprint, and no-collision tests at 56×48 as well as the small fixture size.
- Add the resource to the starter `industry-city` and `quarry-works` `industryResourceProfile.resourceIds` only. `breadbasket-basin` remains food-focused; no new city or terrain type.
- Copper mine placement requires the resource on the **anchor tile**, not every tile in the building's footprint. The other two buildings require existing industrial terrain.

### Materials

| Material ID | Kind | Candidate importCost | Candidate localValue |
| --- | --- | ---: | ---: |
| `copper-ore` | raw | 3 | 2 |
| `circuit-boards` | intermediate | 8 | 5 |
| `electronic-accessories` | finished | 11 | 8 |

The final material's import cost matches the existing retail `accessories` import cost ($11), for legible initial comparison. These are catalog valuation fields; do not introduce new ledgers or materials mechanics.

### Recipes (per nominal cycle)

| Recipe ID | Stage | Inputs | Outputs | Candidate operatingCost |
| --- | --- | --- | --- | ---: |
| `copper-mining` | raw | none | 24 `copper-ore` | 0 |
| `circuit-board-production` | process | 6 `copper-ore`, 1 `plastic` | 10 `circuit-boards` | 12 |
| `accessory-assembly` | final | 4 `circuit-boards`, 1 `packaging` | 8 `electronic-accessories` | 15 |

The recipe graph is acyclic and uses the existing `plastic-production` and `packaging-production` chains. Preserve `simulateIndustryProduction` stage ordering, buffer constraints, import fallback, rail transfers and capacity accounting unchanged. Keep these numbers unchanged within HPA-720 unless the recipe cannot function. The $11 retail import price is a comparison point, **not** a local-profit acceptance gate: daily building overhead is paid even when upstream stages run below capacity. Illustratively, at an 8-accessory/day assembly bottleneck the three new buildings alone cost roughly $82/day (~$10.2 per accessory), before plastic and packaging; this is an unverified planning estimate, not an observed steady-state measurement. Measure actual per-unit throughput and imported versus local input spend during the bot/sweep and record the result for HPA-721, where economy tuning belongs. Do not use `localValue` as a cash-profit proxy.

### Buildings

| Building ID | Tier | Placement | Recipe | Candidate buildCost / dailyOperatingCost / bufferCapacity |
| --- | ---: | --- | --- | --- |
| `copper-mine` | 2 | requires `copper-deposit` | `copper-mining` | 750 / 12 / 120 |
| `circuit-board-plant` | 2 | industrial tile | `circuit-board-production` | 1,500 / 24 / 80 |
| `accessory-assembly-plant` | 3 | industrial tile | `accessory-assembly` | 1,750 / 26 / 80 |

All three have `warehouseCapacity: 0`. Their tiers only group build-menu/chain displays (not progression or a lock). Continue using the existing `warehouse` building for shared inventory.

### Retail and progression

- Set `PRODUCTS.accessories.productionMaterialId = 'electronic-accessories'`; do not change price, demand weight, stock categories, or the other electronics products.
- **Delete** the unused `FINISHED_PRODUCT_MATERIAL_IDS`, `FinishedProductMaterialId` and `CONVENIENCE_BUILDING_TYPE_IDS` exports from `industry.ts` and update their only live references in `industry.spec.ts`. Repository search confirms neither list drives the build menu, product chains or other runtime paths. Preserve useful coverage by iterating `MATERIALS` / `INDUSTRIAL_BUILDING_TYPES` directly instead of recreating a static list.
- In `world.ts`, replace two **live** hardcoded world-reveal lists with catalog-derived IDs. `RAW_PRODUCER_BUILDING_TYPE_IDS` must include any `INDUSTRIAL_BUILDING_TYPES` entry with `requiredResource !== null` (including `copper-mine`) for Breadbasket Basin's warehouse-plus-raw-producer reveal. `FINISHED_MATERIAL_IDS` must comprise `MATERIALS` whose `kind === 'finished'` and `(getCategoryTier(id) ?? 0) >= 2` for Quarry Works' local-finished-material reveal. Before this change, that yields exactly `snacks`, `drinks`, `essentials`, `gifts`; afterward it also yields `electronic-accessories` without accidentally including tier-1 `bottled-water`, `produce`, or `pantry`. Keep the current city-attributed warehouse/production evidence rules unchanged. **Keep the derived lists module-private**: in `world.spec.ts`, reuse the existing `gameStub` / `refreshWorldProgress` setup to assert Breadbasket reveals with a warehouse + copper mine, and Quarry reveals from city-attributed electronic-accessory inventory or production evidence but not tier-1 finished materials. No public export purely for test visibility; behavioral tests check the real unlock contract.
- The Supply Planner, advisors, `productChainGraph.ts`, `productChainTree.ts`, and progression's derived tier-3 product set should discover the new product through existing catalog data. Make targeted fixes only if tests show an actual hardcoded assumption.
- The progression bot currently chooses industry-linked stocked products. With `accessories` linked, it should choose the new chain without a new bot policy. **A producer's output in its buffer is not retail-local delivery.** Proof needs actual warehouse/rail movement and `DailyProductReport.warehouseUnits` (plus the run-to-date tier-3 goal evidence).

## Asset contract (HPA-719: art work separately tracked)

Seven approved **96x96 transparent PNGs** in the established isometric industry palette, readable at 32px:

| Role | Required path | Visual reference |
| --- | --- | --- |
| Resource | `static/assets/game/industry/resources/copper-deposit.png` | `salt-deposit.png` |
| Building | `static/assets/game/industry/buildings/copper-mine.png` | `salt-mine.png` |
| Building | `static/assets/game/industry/buildings/circuit-board-plant.png` | `plastic-plant.png` |
| Building | `static/assets/game/industry/buildings/accessory-assembly-plant.png` | `gift-workshop.png` |
| Material | `static/assets/game/industry/materials/copper-ore.png` | `salt.png` |
| Material | `static/assets/game/industry/materials/circuit-boards.png` | `plastic.png` |
| Material | `static/assets/game/industry/materials/electronic-accessories.png` | `gifts.png` |

HPA-719 generates and obtains approval for the assets using an image-generation workflow (per its ticket: Codex on Hapadona's laptop with references). **No scripted pixel art or placeholder SVG.** Its seven files belong on this HPA-720 branch in an art-only commit, not a separate PR. **Art gates PR readiness, not domain development:** catalog changes and tests should start first and prove real local deliveries before waiting for the images. **Register all seven final asset path strings in `gameArt.ts` in the same Step-1 change as the new ID unions.** Its exhaustive `Record<Id, string>` mappings otherwise break `bun run check` immediately. This registration does not load or generate missing PNGs; `gameArt.spec.ts` will still fail image-existence checks until HPA-719's art-only commit, which is an explicitly disclosed intermediate failure, not final CI success. The existing generic dimension, transparency and duplicate-byte tests already validate each registered asset, so update only the exhaustive path-map fixtures plus visual review.

## Existing integration boundaries

| Source of truth | Planned change |
| --- | --- |
| `src/lib/game/types.ts` | Extend four ID unions: materials, resource, building types, recipes |
| `industry.ts` | Resource anchor; three materials, recipes and buildings; delete two test-only static exports |
| `worldCatalog.ts` | Resource availability in starter and Quarry Works; truthful specialty description |
| `world.ts` | Derive module-private raw-producer and deep-finished-material reveal lists; test the public `refreshWorldProgress` behavior without exposing a test-only API |
| `products.ts` | Link only `accessories` |
| `src/lib/assets/gameArt.ts` | Register all seven final path strings together with the new types in Step 1 so exhaustive mapping stays type-correct; image files are delivered later (recipe art derives from buildings) |
| `src/lib/assets/gameArt.spec.ts` | Extend the fixed path-map expectations; reuse existing generic existence, dimensions, alpha and duplicate-art assertions |
| `src/lib/i18n/messages/{en,ja,zh-Hant}.ts` | Add catalog labels and optional specialty descriptions; in `en.ts`, add `satisfies Record<MaterialId, string>`, `satisfies Record<IndustrialBuildingTypeId, string>` and `satisfies Record<IndustryResourceId, string>` on the respective nested objects (import these types); existing `Messages` conformance checks cover ja/zh-Hant. If nested `satisfies` syntax conflicts with current typing, use one small catalog-completeness spec across all three locales |
| `industry.spec.ts`, `world.spec.ts`, `tests/balance/progressionBots.spec.ts` | Remove test-only-list references; cover new unlocks, 56×48 placement and one real electronics delivery bot run |
| `progression.ts`, `tests/balance/bots.ts` | Update stale electronics-is-unlinked comments only; preserve behavior |
| Existing planner, production, placement, chain tree, progression, warehouse and rail modules | **Reuse**; do not add parallel state owners or new mechanics |

## Verification / evidence

1. Catalog graph is complete and acyclic; chain traversal includes copper mine, circuit-board plant, existing plastic/packaging suppliers and accessory assembly; no unintended electronics-product links.
2. Deterministic industry-city generation creates exactly one legal copper anchor in each designated city and none in Breadbasket. Check 56×48 x=14..15 footprint inside the extraction belt and no collision with chemical/blocked cells; also verify an 18×18 placement fixture. Copper mine accepts its correct resource tile and rejects salt/nonresource; both plants accept industrial tiles. Using the existing `world.spec.ts` game stub and public `refreshWorldProgress`, prove copper mine + warehouse reveals Breadbasket and city-attributed electronic accessories reveal Quarry while tier-1 goods do not.
3. Add one regression test in the existing `tests/balance/progressionBots.spec.ts`, running `runProgressionBot('electronics', seed, 365)` with a measured seed that actually reaches the target. Assert total `accessories` `DailyProductReport.warehouseUnits` >= 25, exercise the production `retail-local-units` evidence (and pin a tier-3 claim day if reached). This tests the real planner, build/rail path, warehouse, and replenishment, avoiding a large hand-built 9-building test fixture. First discover the seed from the same cheap bot probe if none is known; do not invent a passing result. Keep targeted placement and production unit tests.
4. Verify `bun run check` remains valid after the Step-1 exhaustive path registration. After HPA-719's files arrive, verify seven PNGs through the existing generic 96×96/transparent/unique asset tests, manual 32px legibility, and catalog-complete names in all three languages. In `retail-sim.e2e.ts`, derive `STARTER_INDUSTRY_CITY`'s resource profile from `getWorldCityDefinition('industry-city')!.industryResourceProfile!` instead of duplicating the original eight resource IDs; validate affected map/E2E sprite counts.
5. Run the same deterministic 50-seed x 4-archetype x 365-day progression calibration **on the PR base SHA and implementation HEAD**, with idle controls. Gate on per-seed non-electronics rows being identical; any difference is a regression to explain (e.g. changed rail paths from the added resource anchor), not an accepted tuning side effect. The old `progression-calibration.md` §3 is a frozen static-terms historical record, **not** the current control. Run the existing balance harness. Append an **HPA-720 result addendum** to `docs/balance/progression-calibration.md` with exact commands/baselines, electronics tier-3 claims/count/days and reference seed `20260503`, non-electronics diff verdict, observed unit costs/throughput and honest blockers. Preserve historical sections and HPA-502/HPA-679 files; do not retune tier or economy numbers.
6. Final: `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:e2e`, and `git diff --check main...HEAD` on this same PR.

**Out of scope:** more electronics product links; new city, logistics, AI, supply mechanics, demand model, new UI, sweeping economy/goal tuning, save migration and a standalone art PR. HPA-721 is explicitly responsible for post-content economy balance.
