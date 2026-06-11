# Tiered Product Chains & Tree Chart Redesign

**Date:** 2026-06-11
**Status:** Approved design, pending implementation plan

## Problem

1. **Onboarding cliff.** Every finished product (snacks, drinks, essentials, gifts)
   requires packaging, which itself requires two sub-chains (pulpwood → paper pulp,
   chemical feedstock → plastic). The cheapest chain (gifts) needs 6 buildings
   (~$7,750); snacks — the convenience store's flagship category — needs 11
   (~$13,000). A new player's first chain is the hardest one in the game, with no
   1–2 building "win" to learn the production loop on.
2. **Entangled chart.** The Product Chains atlas places nodes on a fixed
   stage-column grid with rows sorted alphabetically, and draws straight edges
   between node centers. The shared packaging sub-chain converges from every
   product, so deep chains (snacks: 16 nodes) render with long crossing edges and
   overlapping mid-edge labels.

## Decisions (from brainstorming)

- **Tiered chains**: add simple Tier 1 products; existing deep chains become
  Tier 2/3 content, untouched.
- **Cost-gated only**: no hard unlock locks; tier is a presentation concept.
- **New simple categories**: Tier 1 products are new finished materials feeding
  currently chain-less retail categories — not cheap alternate recipes for the
  existing four (which would break the one-producer-per-material invariant).
- **Starter archetypes get them**: lineups change so a level-1 store can sell a
  Tier 1 product from day one.
- **Tree per product** for the chart: shared sub-chains are duplicated into each
  branch, giving zero edge crossings by construction.

## Section 1 — Tier 1 chains and retail wiring

Three new finished products, all additive. Existing materials, recipes,
buildings, and balance are untouched.

| Product | Chain | Buildings | Approx. build cost | Role |
| --- | --- | --- | --- | --- |
| Bottled Water (`bottled-water`) | water → bottled water | Water Pump → Water Bottler | ~$1,100 | Onboarding chain: 2 cheap buildings, instant feedback |
| Produce (`produce`) | fruit → produce | Fruit Farm → Produce Packhouse | ~$1,450 | Grocery's first category gains a chain (already first in its lineup) |
| Pantry (`pantry`) | grain → flour → pantry goods | Grain Farm → Flour Mill → Pantry Works | ~$2,700 | Tier 1.5: introduces intermediates (flour) without packaging |

Mechanics:

- New materials `bottled-water`, `produce`, `pantry` (`kind: 'finished'`), one
  recipe each (`water-bottling`, `produce-packing`, `pantry-goods-production`)
  and one building each (`water-bottler`, `produce-packhouse`, `pantry-works`).
  One recipe per material preserves the producer-uniqueness invariant enforced
  by `createMaterialProducerRecipeMap()` in `productChainGraph.ts`.
- Tier 1 reuses existing raw inputs (water, fruit, grain/flour), so shared
  inputs are taught naturally (e.g., water feeds both bottling and filtration).
- `FINISHED_PRODUCT_MATERIAL_IDS` grows to 7. The Product Chains panel, store
  supply logic, and chain summaries derive from that list and pick the new
  categories up automatically.
- **Convenience archetype**: `bottled-water` becomes the *first* starting
  category (retail category id matches the material id, as today). Order
  becomes: bottled-water, snacks, drinks, essentials. `household` is removed —
  with 5 entries only 4 ever unlock (levels 1/4/7/10), so it would be
  unreachable; it also has no chain.
- **Grocery archetype**: no lineup change. `produce` (1st, level 1) and
  `pantry` (2nd, level-4 milestone) gain real chains.
- **Tier field**: `IndustrialBuildingType` gains `tier: 1 | 2 | 3`. Assignment
  rule: a building's tier is the lowest tier of any finished-product chain it
  participates in (chains: bottled-water/produce/pantry = tier 1;
  snacks/drinks/essentials/gifts = tier 3, with their non-final buildings as
  tier 2). Concretely — tier 1: water-pump, water-bottler, fruit-farm,
  produce-packhouse, grain-farm, flour-mill, pantry-works, warehouse; tier 2:
  salt-mine, oilseed-farm, sugar-farm, pulpwood-grove, chemical-feedstock-well,
  oil-press, water-filtration-plant, syrup-plant, pulp-mill, plastic-plant,
  packaging-plant, chemical-plant; tier 3: snack-factory, drink-bottling-plant,
  household-goods-factory, gift-workshop. Used to group and sort the industry
  build menu and to badge the chain panel's category stamp index (Tier 1
  categories listed first). No gameplay gating.
- **Milestone category rule change**: `state.ts` currently appends
  `startingCategories[unlockedCount - 1]` on milestone upgrade. With the
  convenience lineup reordered, an existing saved store would receive a
  duplicate. The rule becomes: *add the first starting category the store does
  not already stock*. Correct for both old and new saves.

Balance target (tuned at implementation; asserted loosely in tests): a Tier 1
chain pays back its build cost within ~10 game days at level-1 throughput, and
the bottled-water chain's total build cost stays ≤ ~$1,500. Convenience starting
cash ($32,000) must comfortably cover the founding store plus the bottled-water
chain.

## Section 2 — Chart redesign: tree per product

### Data layer

New module `src/lib/game/productChainTree.ts`:

- `buildProductChainTree({ game, categoryId })` walks the recipe graph from the
  finished product down to raw materials (same traversal as today's builder)
  but emits a **tree**: when a sub-chain feeds two consumers (e.g., packaging
  into snack and drink factories), it is duplicated into each branch. Node ids
  carry a path suffix (e.g., `node:packaging-production@snack-production`) so
  duplicates stay unique and selectable.
- **Merged nodes**: each tree node is one card representing the building with
  its output material ("Flour Mill · Flour"); leaves are harvesters ("Grain
  Farm · Grain"). The root is a separate finished-product card carrying the
  retail-facing metrics (units sold, demand missed, warehouse stock); its
  single child is the final factory card. This replaces today's separate
  material + recipe nodes (snacks: 16 nodes / 6 columns → 12 nodes /
  5 columns).
- Nodes keep the existing health model (`healthy / watch / shortage /
  no-local-capacity / no-report`) and capacity/actual metrics. The metric
  helpers in `productChainGraph.ts` (movement sums, health rules, throughput
  units, input allocation) are extracted for reuse, not rewritten.
- Duplicated nodes show the same chain-wide metrics for their material; the
  broadside details panel notes when a node is shared by N branches.
- Output keeps the `ProductChainGraph` shape (nodes with `layer`/`row`, edges,
  `details` map, `warnings`, `emptyReason`) so the atlas rendering stack plugs
  in unchanged.

### Layout — zero crossings by construction

- Tidy-tree, root on the right: `layer` = depth from root (mirrored so raw
  leaves sit left), each leaf takes its own row, each parent's `row` is the
  midpoint of its children's rows. Every node has exactly one parent, so edges
  cannot cross.
- Edges use the existing `ChainRoute` (curves, health-colored arrows). Labels
  keep the "X/day used · Y/cycle" format but anchor near the *source* end of
  the edge instead of the midpoint so converging edges don't stack labels.

### UI changes

- `ProductChainsPanel` category mode calls the tree builder. **Warehouse-flow
  mode is untouched** (`buildWarehouseFlowGraph` stays).
- `ChainNode.svelte` gains a merged-card variant (building name, output
  material, health seal, building count/levels). Compass, legend, stamp index,
  and atlas styling stay.
- `buildStoreCategoryChainSummaries` re-derives from the tree root. The old
  per-category DAG path in `productChainGraph.ts` is deleted once the panel
  migrates; the warehouse-flow builder and shared metric helpers remain.
- Tier badges (Section 1) appear on the category stamp index; Tier 1
  categories list first.

## Section 3 — Edge cases, persistence, assets, testing

### Persistence / migration (additive, no save-format version bump)

- New material ids appear in `warehouse.materials` only once produced; old
  saves load unchanged (missing keys default to 0). `saveCodec.ts` needs no
  structural change; a spec test confirms an old-shape save round-trips.
- Existing saved stores keep their current product lists. They gain
  `bottled-water` only at their next milestone, via the "first starting
  category not already stocked" rule. No retroactive injection.
- The legacy-store migration path (milestone staff-capacity application) is
  re-checked against the convenience lineup change; `state.spec.ts` covers an
  old convenience store at levels 1, 4, and 7 upgrading without duplicate
  categories.

### Sprites

- Three new building sprites (Water Bottler, Produce Packhouse, Pantry Works)
  added to `tools/generate_industry_assets.mjs`, regenerated via
  `bun tools/generate_industry_assets.mjs`, registered in `gameArt.ts`
  (`gameArt.spec.ts` enforces wiring). E2e sprite-count asserts updated if
  affected.

### Testing

- `industry.spec.ts`: new materials/recipes/buildings wired; producer
  uniqueness holds; every finished material's chain terminates in raw
  materials; bottled-water chain build cost ≤ $1,500; payback bound asserted
  loosely.
- `productChainTree.spec.ts`: every node has one parent; duplicate-suffixed ids
  unique; parent `row` lies within children's row range (the no-crossing
  property); merged-node metrics match the production report; health
  propagation; empty/no-report cases.
- `archetypes.spec.ts` + `stock.spec.ts`: convenience lineup (bottled-water
  first, household removed); level-1 store sells bottled water; milestone
  dedupe rule.
- `.svelte.spec.ts` (client project): merged ChainNode card variant; panel
  renders tree mode; tier badges on stamp index.
- E2e: one assertion in `retail-sim.e2e.ts` that the Product Chains panel
  renders the tree `data-testid` for a Tier 1 category.

### Out of scope (YAGNI)

- Rebalancing the four existing deep chains.
- New retail categories beyond the three named.
- Tier hard-locks or unlock UI.
- Warehouse-flow view changes.
- Multi-producer recipe support.
