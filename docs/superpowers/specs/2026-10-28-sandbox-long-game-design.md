# HPA-318 — Sandbox Long Game: Book Value and Progression Ladder

**Linear:** https://linear.app/cwchanap/issue/HPA-318/progression-give-the-sandbox-a-long-game-with-company-value-and-a-goal  
**Parent:** HPA-534 · **Delivery:** one ticket / one PR, starting with these docs  
**Baseline:** Serpens `main` inspected 2026-10-28, after HPA-502 tuning and HPA-511 scenario pack  
**Checkpoint:** design proposal; **no runtime implementation or passing calibration is claimed**

## Outcome and player loop

After the introductory store/company decisions, sandbox play offers a clear long-term destination: improve **company book value**, meet 2–3 concrete goals per tier, unlock a little more expansion/credit capacity, and continue playing after reaching Market Leader. Do not replace the existing city-reveal milestones, require a fixed build order, or alter challenge-mode results. Preserve the game's deterministic daily transitions and pure read models.

One company-value headline is available on the Dashboard. A small current-tier section explains *current vs required* values, the next capacity reward, and the latest completion. Tier completion produces one nonblocking, once-only system notice. On the final tier, show a summary (completion day and historical peak book value), with a **Continue playing** action; no game over.

## Baseline and reuse survey

| Concern | Existing authority | Decision |
| --- | --- | --- |
| World unlocks / store cap | `game/world.ts`: `STARTER_STORE_CAP=3`, city bonuses, `positive-income-store-cap` milestone, `refreshWorldProgress` | Extend the derived cap with claimed tier count; do not modify existing city milestones |
| Finance | `game/finance.ts:assessCredit`, `getTotalDebt` | Replace the fixed $100,000 principal ceiling with a pure progression-dependent bound; keep every affordability and delinquency check |
| Asset definitions | `game/state.ts:getExpansionSetupCost`, `game/leveling.ts`, `game/industry.ts`, `game/rail.ts`, `game/products.ts` | Reuse current cost catalogs instead of introducing an asset ledger |
| Objectives | `scenarios/types.ts`, `scenarios/metrics.ts:METRIC_REGISTRY`, `evaluateMetric` | Add a small number of current/report-derived metrics to the one existing registry; authored ladder uses that same evaluator |
| Report history | `game/types.ts:DailyReport`, `game/simulateDay.ts`, `game/reports.ts` | Record post-service company book value in each daily report; peak comes from existing reports |
| Scenario UI | `components/game/ScenarioObjectivePanel.svelte`, `i18n/scenarioCopy.ts` | Reuse the evidence row/layout idiom; avoid a second objective engine or stuffing fake scenario failures into sandbox |
| Sandbox UI | `routes/ManagementPanelHost.svelte` Dashboard + `Scorecard` | Add a compact book-value-and-tier surface within Dashboard; pass explicit sandbox-only visibility |
| Persistence | `persistence/saveCodec.ts:validateCurrentGameState`, `scenarioCodec.ts` | One small persisted claimed-tier field, validated with existing state and reports; no migration |
| Calibration | `tests/balance/bots.ts`, `docs/balance/after.md` | Keep HPA-502 economy unchanged; extend legal scripted actions only as needed to measure progression reachability |

### Crucial calibration finding

The existing balance harness's `advisor` bot runs *convenience only*. It delegates, hires, expands **within its active retail city**, and applies a Supply Planner recommendation weekly. It does **not** open world cities or upgrade stores. A five-tier ladder requiring those actions cannot be demonstrated with this bot unchanged. Further, HPA-502's measured after-sweep has convenience/advisor median day-365 cash below zero; this does not establish the proposed Market Leader reachability.

**Decision:** keep the ticket's seed `20260503` / approximate day-120 and day-250–365 pacing as **provisional hypotheses**, not acceptance facts. Add the smallest deterministic, legal multi-city/upgrade progression script to the existing advisor test strategy, keep the original HPA-502 bot/sweep stable, and report *measured* claim days and blockers. If the reference trace cannot complete a tier under tuned economics, adjust authored goals/thresholds (not the underlying economy or synthetic rewards) and disclose any remaining gap. A pure idle/advance-only bot must not claim tier 1.

## 1. Company book value: deliberately simple

Pure `getCompanyBookValue(game)` in `src/lib/game/companyBookValue.ts`, returning an integer total and a compact breakdown for tests/UI:

```text
book value =
  cash
  + surviving retail assets (setup + upgrades)
  + surviving industrial assets (build + upgrades)
  + existing rail cells (build + upgrades)
  + remaining owned inventory at catalog cost
  - getTotalDebt(game)
```

- **Retail:** locate each store's original tile in its `game.cities`; non-founding stores contribute `getExpansionSetupCost(tile, archetypeId)`. `store-1` contributes **zero setup**, because the founding store was free. Each contributes `sum(getStoreUpgradeCost(level))` for prior levels 1 through current level − 1. Store setup prices are recomputed from immutable location/catalog data: this is an **estimated cost/book-value proxy**, not a historical receipt ledger.
- **Industry:** surviving `industrialBuildings` contribute `INDUSTRIAL_BUILDING_TYPES[typeId].buildCost` plus `sum(getBuildingUpgradeCost(level))` for completed upgrades. Demolished buildings contribute zero; no phantom demolition refund.
- **Rail:** each currently present `IndustryCity.rails` cell contributes `RAIL_BUILD_COST_PER_CELL + (level − 1) * RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL`; removed cells contribute zero.
- **Inventory:** multiply `StoreProduct.lots[].quantity` by the existing per-product branded unit-cost resolution (or the canonical catalog import-cost fallback if there is no direct branded resolver). City and building material quantities use `MATERIALS[id].importCost` as consistent acquisition-cost proxy. Count a material unit **once**: if in-transit orders represent owned goods removed from a city, include only their outstanding in-transit units, never delivered/cancelled units or anything still in on-hand inventory. Confirm the authoritative transfer statuses/quantity representation during implementation; no new stock ledger.
- **Debt:** subtract `getTotalDebt(game)` once. A new loan normally raises cash and debt together, thus does not increase book value. Financing interest and losses affect value through the existing state changes.
- Preserve negative values and avoid rounding away legitimate debts. Never confuse the headline with market capitalization, an enterprise valuation, goodwill, or liquidation proceeds. A zero-inventory or empty-industry state works.

Call this pure calculator **after finance service** for `DailyReport.companyBookValueAfter`; its snapshot describes the same close-of-day state as `cashAfter` and `outstandingPrincipalAfter`. The Dashboard shows *live* book value, which can differ from the most recent close-of-day value after purchases. The report field is a historical snapshot, not a second asset store.

Hand fixture: cash 40,000 + nonfounding store setup 12,000 + level-2 store upgrade 8,000 + level-2 $600 building (600+5,000) + level-2 rail cell 70 + $20 store stock + $15 material stock − debt 10,000 = **$55,705**. Check founder setup remains zero; test demolition/rail removal/inventory transfer and debt neutrality independently.

## 2. A five-step authored ladder, not an achievement framework

Create `src/lib/game/progression.ts` with an immutable five-entry catalog, stable IDs, localized title/description keys, 2–3 conditions per entry, and a +1 store-cap and +$25,000 *maximum principal ceiling* reward per tier. Names:

1. **Local Shop** — at least 2 stores; reported peak book value ≥ $20k.
2. **Neighborhood Chain** — at least 3 stores; highest store level ≥ 2; at least 3 cities opened (including the two starter cities).
3. **Regional Supplier** — at least 4 cities opened; cumulative local retail delivery of a selected authored product set ≥ 25 units; reported peak book value ≥ $60k.
4. **Multi-City Operator** — at least 5 stores; at least 5 cities opened; highest store level ≥ 4.
5. **Market Leader** — at least 7 stores; all 6 existing cities opened; reported peak book value ≥ $150k.

**These numeric targets are first-pass candidates, not proven balanced.** The implementation checkpoint uses the actual harness to calibrate *both* target amounts and goal ordering. In particular, avoid a terminal supplier goal whose particular products cannot be produced by a legal reference strategy. The current 6-city world remains the top geography; no seventh city. "After the world milestones" means progression extends their short horizon; it does **not** gate tier 1 behind every optional world reveal, which would make the introductory ladder unreachable. World reveal and ladder evaluation remain independent.

Use `ScenarioCondition`-shaped metric/comparator/window definitions and existing `evaluateMetric` for evidence. Add only:
- `max-store-level` (current; 0 for no stores).
- `opened-city-count` (current).
- `company-book-value` (current/live; currency; Dashboard and possible future goals).
- `peak-company-book-value` (run-to-date; max of completed report `companyBookValueAfter`, 0 with no report; currency).

Other goals reuse `store-count` and `retail-local-units` (run-to-date, explicit nonempty ProductId set). All *claim* goals use **monotone predicates** under the supported sandbox actions: store count (no closing), max level (no downgrade), opened city count (no closing), historical peak (append-only reports), and cumulative delivered units (append-only reports). Avoid debt-now, current market share, or current cash as persisted claims because a subsequent decline would make save-time proof impossible without new evidence. Each condition includes a target and actual/evidence; for report goals a zero-history result is not silently a completed window.

Pure `evaluateProgression(game)` returns a current-tier view, per-goal evidence, unlocked capacity and completion state; it does not mutate game. A small `claimEarnedTiers(game)` transition applies each contiguous eligible tier in order, storing a claim with ID and `claimedOnDay` only and issuing a stable, one-time system notice; **no background timers, achievements subsystem, or special event scheduler**. If multiple tiers become eligible together, claim in order at a single commit and issue one notice for each. Keep `claimEarnedTiers` idempotent and return the original game reference when nothing changes.

## 3. Reward authority and persistence invariants

Represent progression in `GameState` as:
```ts
progression: { claims: Array<{ tierId: ProgressionTierId; claimedOnDay: number }> }
```

The claim-day value is part of a claimed-tier receipt, **not** a separate event log. It permits the final summary to display the original completion day on reload without a second persisted summary. Everything else (goal results, peak, available credit ceiling) is derived.

Reward formulas:
```text
storeCap = STARTER_STORE_CAP
  + sum(storeCapBonus of actually opened nonstarter cities)
  + (world positive-income-store-cap claim ? 1 : 0)
  + progression.claims.length

gross principal hard ceiling = $100,000 + $25,000 * progression.claims.length
```

The five rewards raise the *possible* store cap from the current world maximum of 6 to 11. Actual credit remains constrained by cash flow, credit health, debt service, existing principal and delinquency in `assessCredit`; this reward does **not** issue a loan or cash. Display "credit ceiling", not "available credit". Keep the existing world milestone/city increments authoritative at runtime and reconcile via the common cap formula without applying a bonus twice.

Persist claim receipts and the pre-existing `storeCap` only. No stored peak value, goal progress, reward count, or credit limit. Initialize empty claims in `state.ts:createNewGame` and `routes/+page.svelte:starterMapState`; configure scenario state so its progression stays empty and inactive. Extend `saveCodec.ts` strict structural checks and round trips; validate unique contiguous catalog-prefix IDs, chronological in-range claim days, satisfied monotone conditions against validated state/reports, and exact derived sandbox store cap. Reject unknown, duplicate, skipped or **unearned** claims. Validate report value as a finite integer; note `decodeHistoricalReports` drops malformed historical records, so proof must run *after* report decoding and must not silently trust missing report evidence.

World-progress codec still checks `refreshWorldProgress(game) === game`. For sandbox, commit `claimEarnedTiers` on the existing sandbox command result/advance-day path **before persistence**, then require its fixed-point at save validation. The runtime path must avoid rejecting a legal mid-day command merely because that command newly satisfied a goal; all sandbox commits should pass through the same refresh. Scenario setup, commands and save validation explicitly opt out: their authored `storeCap` overrides remain legal and no tier can auto-claim. A challenge's shared `DailyReport` may carry the book-value field, but scenario scoring/results, RNG, allowed actions, and time limits stay unchanged. Do not embed a mode flag in the simulation's economic state just to drive UI.

The design is **pre-release only**: update required schema, fixtures and codecs in one shot. No save migration or backward compatibility adapter.

## 4. UI, localization and experience

- Dashboard only, not a new global panel: a clear **Company book value** number and a small **Next milestone** section with 2–3 metric rows, real actual/target units and the upcoming +1 store slot / +$25k credit ceiling. Completed tiers can be expanded as a brief summary, but no trophy gallery.
- Reuse the existing scenario evidence row typography/formatting and its `i18n.format` currency/percent/quantity helpers; add a small shared row presenter only if doing so avoids duplicating real UI. Do **not** mount `ScenarioObjectivePanel` with artificial failures/deadline records.
- A one-time nonblocking localized completion notice; final summary displays claimed day, peak historical value, current cap and a **Continue playing** path. No terminal status.
- The route explicitly gates the panel/notices for `playMode === 'sandbox'`. No ladder in active/resumed/results scenarios, not even a disabled tier. The GameState reused by scenarios remains valid with empty claims.
- Ship English, Japanese and Traditional Chinese messages, accessible status text not only color, keyboard interaction, responsive narrow layouts. No new art/SFX; use existing design tokens and icons. Update stale `CLAUDE.md` `MAX_STORES` wording.

## 5. Alternatives considered

| Alternative | Decision |
| --- | --- |
| Contracts/orders as progression goals | **Defer.** Would require new authored order lifecycle, UI and persistence; current metrics already express concrete progress |
| Seventh city at top tier | **Defer.** New city content/visuals, geography, test scope and tuning are unrelated to proving a long-game loop |
| Gate Tier-3 buildings behind ladder | **Reject for now.** Breaks sandbox's day-one free build choice and scenario content; the ladder rewards capacity, not permission to use existing content |
| New valuation ledger / appreciation / depreciation | **Reject.** Historical cash-flow attribution is not stored; a deterministic current-cost proxy is sufficient for an explainable game signal |
| New achievement/state machine framework | **Reject.** Five immutable tiers and one pure evaluator/claim transition are enough |

## 6. Acceptance and verification

1. Hand-worked assets/inventory/debt fixture including founding-free store, level upgrades, rails, demolition and in-transit no-double-count; reported daily close matches post-service state and Dashboard live value after a command.
2. Monotone tier conditions, exactly-once ordered claim/reward/notice, scenario-no-op, and deterministic replay for explicit seed. Save → load keeps claim days, UI peak from reports and final summary; malformed/forged claims and mismatched cap are rejected.
3. Existing city milestones and per-city cap bonuses still work. Every credit path uses the state-dependent cap while preserving payment headroom and delinquency refusal.
4. HPA-502 50-seed economy baseline is unchanged; add focused seed `20260503` 365-day progression reference/idle controls and record actual day-by-tier values. Target tier 3 ~day 120, tier 5 days 250–365 **only if demonstrated**; document any impossibility/revised thresholds. Retain prior balance harness expected outputs and scenario pack scores.
5. Dashboard, narrow screen, keyboard and localized strings verified; one browser E2E establishes a real first-tier claim in sandbox, reload persistence and absence in scenario mode.
6. `bun run check`, `bun run lint`, `bun run test:unit -- --run`, affected route/scenario E2E, full test suite, and `git diff --check`.

## Non-goals

No bankruptcy, forced end, new debt product, changed core economy, store resale, prestige, builder locks, new city, new art/SFX, backend/analytics/leaderboards, contract engine, migration adapter or separate progression PR. All implementation and test work stays within this HPA-318 PR.
