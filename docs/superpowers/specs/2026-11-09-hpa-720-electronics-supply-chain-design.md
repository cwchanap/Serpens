# HPA-720 — Electronics Supply Chain Design

**Linear:** https://linear.app/cwchanap/issue/HPA-720/content-add-an-electronics-supply-chain-so-electronics-stores-can-sell
**Roadmap:** HPA-717
**Art dependency:** HPA-719 (seven approved PNGs; separate art ticket, included in this same content PR)
**Inspected baseline:** `main@3b0b56d62a638aca71bb056979e39acc3f68f3b1` (November 9, 2026)
**Status:** proposed design / documentation-only draft. No assets, implementation, measurements, or passing tests claimed.

## Goal and evidence

Give electronics stores one playable local-supply path: copper deposit -> copper mine -> circuit-board plant -> accessory assembly plant -> city warehouse -> retail `accessories`. Reuse the existing plastic and packaging producers and the existing rail, inventory, retail replenishment, Supply Planner and product-chain views.

Currently all four electronics products have `productionMaterialId: null` in `src/lib/game/products.ts`. The Regional Supplier goal in `progression.ts` needs 25 run-to-date `retail-local-units` of industry-linked products. Its eligible product IDs are already derived from `PRODUCTS`, not a hardcoded list, so electronics is structurally unable to claim tier 3 (and the contiguous-prefix gate blocks tiers 4/5). The frozen calibration records 0/50 electronics tier-3 runs; do not describe new reachability as measured until the rerun.

Keep the scope focused on **one final product**. `games`, `devices` and `peripherals` remain import-only. Existing retail product art for `accessories` is retained.

## Chosen catalog design

Names/IDs below are authoritative for HPA-719 asset filenames. Proposed numeric data are **starting values**, not a profitability guarantee or approved economy rebalance.

### Resource and map

- Add `copper-deposit` to `IndustryResourceId`. Its anchor has `terrain: 'deposit'` and uses the existing resource-anchored building placement rule.
- Add an anchor at `{ xFrac: 0.278, yFrac: 0.222, resource: 'copper-deposit', terrain: 'deposit' }` in `RESOURCE_ANCHOR_SPECS`. This occupies the third extraction-belt resource slot (after salt/chemical) in the 18x18 and normal-size cities. Confirm no anchor collisions, blocked footprint cells, or broken access in tests.
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

The recipe graph is acyclic and uses the existing `plastic-production` and `packaging-production` chains. Preserve `simulateIndustryProduction` stage ordering, buffer constraints, import fallback, rail transfers and capacity accounting unchanged. Initial output/cost candidates should be verified against full-utilization local production and the $11 retail import alternative, **without** mistaking material `localValue` for cash profit. Tune only this new chain's starting data if that simple check fails; broader profitability and expansion tuning belong to HPA-721.

### Buildings

| Building ID | Tier | Placement | Recipe | Candidate buildCost / dailyOperatingCost / bufferCapacity |
| --- | ---: | --- | --- | --- |
| `copper-mine` | 2 | requires `copper-deposit` | `copper-mining` | 750 / 12 / 120 |
| `circuit-board-plant` | 2 | industrial tile | `circuit-board-production` | 1,500 / 24 / 80 |
| `accessory-assembly-plant` | 3 | industrial tile | `accessory-assembly` | 1,750 / 26 / 80 |

All three have `warehouseCapacity: 0`. Their tiers only group build-menu/chain displays (not progression or a lock). Continue using the existing `warehouse` building for shared inventory.

### Retail and progression

- Set `PRODUCTS.accessories.productionMaterialId = 'electronic-accessories'`; do not change price, demand weight, stock categories, or the other electronics products.
- Add the final material to `FINISHED_PRODUCT_MATERIAL_IDS` and the three buildings to the existing, historically named `CONVENIENCE_BUILDING_TYPE_IDS` catalog list. Do not rename/refactor that list just for this ticket.
- The Supply Planner, advisors, `productChainGraph.ts`, `productChainTree.ts`, and progression's derived tier-3 product set should discover this through existing catalog data. Make targeted fixes only if tests show an actual hardcoded assumption.
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

HPA-719 generates and obtains approval for the assets using an image-generation workflow (per its ticket: Codex on Hapadona's laptop with references). **No scripted pixel art or placeholder SVG.** Its asset commit belongs on this HPA-720 branch, not a separate PR. This docs-only planning checkpoint precedes the first **implementation** commit; land the seven files together as that first implementation commit, then register them alongside the catalog changes. Intermediate red `gameArt.spec.ts` during asset registration is not a reason to split the PR.

## Existing integration boundaries

| Source of truth | Planned change |
| --- | --- |
| `src/lib/game/types.ts` | Extend four ID unions: materials, resource, building types, recipes |
| `industry.ts` | Resource anchor; three materials, recipes and buildings; two static export lists |
| `worldCatalog.ts` | Resource availability in starter and Quarry Works; truthful specialty description |
| `products.ts` | Link only `accessories` |
| `src/lib/assets/gameArt.ts` | Extend exhaustive material, resource and building art records (recipe art derives from building records) |
| `src/lib/assets/gameArt.spec.ts` | Extend hardcoded registry/path expectations and test PNG dimensions/existence |
| `src/lib/i18n/messages/{en,ja,zh-Hant}.ts` | Labels under `game.materials`, `game.industrialBuildings`, `game.industryResources`; specialty descriptions if affected |
| Existing planner, production, placement, chain tree, progression, warehouse and rail modules | **Reuse**; do not add parallel state owners or new mechanics |

## Verification / evidence

1. Catalog graph is complete and acyclic; chain traversal includes copper mine, circuit-board plant, existing plastic/packaging suppliers and accessory assembly; no unintended electronics-product links.
2. Deterministic industry-city generation creates exactly one legal copper anchor in the two designated cities, and none in Breadbasket. Copper mine accepts its correct resource tile and rejects salt/nonresource; both plants accept industrial tiles.
3. Drive the real production and rail/warehouse flow to `electronic-accessories`; confirm the existing retail replenishment sources `accessories` locally and the tier-3 run-to-date units evidence increases. Do not equate produced/buffered units with retail delivery.
4. Verify UI registries, 7 PNG paths, 96x96 dimensions, transparent backgrounds, 32px legibility (manual art review), localized names in all three languages, and affected map/E2E resource-count expectations.
5. Re-run the deterministic 50-seed x 4-archetype x 365-day progression calibration and existing balance harness. Append an **HPA-720 result addendum** to `docs/balance/progression-calibration.md` with exact commands, electronics tier-3 claims/count/days, seed `20260503` outcome, non-electronics shifts, and honest blockers. Preserve all historical calibration sections; do not rewrite the HPA-502/HPA-679 baseline files or tune tier thresholds.
6. Final: `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:e2e`, and `git diff --check main...HEAD` on this same PR.

**Out of scope:** more electronics product links; new city, logistics, AI, supply mechanics, demand model, new UI, sweeping economy/goal tuning, save migration and a standalone art PR. HPA-721 is explicitly responsible for post-content economy balance.
