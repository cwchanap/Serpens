# HPA-318 — Sandbox Long Game: Book Value and Progression Ladder

**Linear:** https://linear.app/cwchanap/issue/HPA-318/progression-give-the-sandbox-a-long-game-with-company-value-and-a-goal\
**Parent:** HPA-534 · **Delivery:** one ticket / one PR, starting with these docs\
**Baseline:** Serpens `main` inspected 2026-10-28, after HPA-502 tuning and HPA-511 scenario pack\
**Checkpoint:** design proposal; **no runtime implementation or passing calibration is claimed**

## Outcome and player loop

After the introductory store/company decisions, sandbox play offers a clear long-term destination: improve **company book value**, meet 2–3 concrete goals per tier, unlock a little more expansion/credit capacity, and continue playing after reaching Market Leader. Do not replace the existing city-reveal milestones, require a fixed build order, or alter challenge-mode results. Preserve the game's deterministic daily transitions and pure read models.

One company-value headline is available on the Dashboard. A small current-tier section explains *current vs required* values, the next capacity reward, and the latest completion. Tier completion produces one nonblocking, once-only system notice. On the final tier, show a summary (completion day and historical peak book value); dismissing the notice returns to uninterrupted sandbox play. No game over or redundant **Continue playing** action.

## Baseline and reuse survey

| Concern | Existing authority | Decision |
| --- | --- | --- |
| World unlocks / store cap | `game/world.ts`: `STARTER_STORE_CAP=3`, city bonuses, `positive-income-store-cap` milestone, `refreshWorldProgress` | **Leave shared world transitions unchanged**: scenario setup authors cap 1 and also calls these transitions. Tier claims add +1 only on new receipts, using the same incremental pattern as world milestones |
| Finance | `game/finance.ts:assessCredit`, `getTotalDebt` | Increase the binding $15k underwriting base **and** the $100k hard bound per claim; keep cash-flow/health/debt-service/delinquency checks and report any real borrowing impact |
| Asset definitions | `game/state.ts:getExpansionSetupCost`, `game/leveling.ts`, `game/industry.ts`, `game/rail.ts`, `game/products.ts` | Reuse current cost catalogs instead of introducing an asset ledger |
| Objectives | `scenarios/types.ts`, `scenarios/metrics.ts:METRIC_REGISTRY`, `evaluateMetric` | Add a small number of current/report-derived metrics to the one existing registry; authored ladder uses that same evaluator |
| Report history | `game/types.ts:DailyReport`, `game/simulateDay.ts`, `game/reports.ts` | Record post-service company book value in each daily report; peak comes from existing reports |
| Scenario UI | `components/game/ScenarioObjectivePanel.svelte`, `i18n/scenarioCopy.ts` | Reuse the component with a configurable heading/root ID and empty optional/failure/deadline fields; export existing condition evaluator/view formatter, not a parallel presenter |
| Sandbox UI | `routes/ManagementPanelHost.svelte` Dashboard + `Scorecard` | Add a compact book-value-and-tier surface within Dashboard; pass explicit sandbox-only visibility |
| Persistence | `persistence/saveCodec.ts:validateCurrentGameState`, `validateSaveRecordInternal`, `scenarioCodec.ts` | Shared shape validation for receipts; sandbox-only claim fixed-point/evidence validation at save-record boundary, **no mode/context parameter** and no change to scenario cap rules |
| Calibration | `tests/balance/bots.ts`, `docs/balance/after.md` | Keep HPA-502 economy unchanged; extend legal scripted actions only as needed to measure progression reachability |

### Crucial calibration finding

The existing balance harness's `advisor` bot runs *convenience only*. It delegates, hires, expands **within its active retail city**, and applies a Supply Planner recommendation weekly. It does **not** open world cities or upgrade stores. A five-tier ladder requiring those actions cannot be demonstrated with this bot unchanged. Further, HPA-502's measured after-sweep has convenience/advisor median day-365 cash below zero; this does not establish the proposed Market Leader reachability.

**Decision:** keep the ticket's seed `20260503` / approximate day-120 and day-250–365 pacing as **provisional hypotheses**, not acceptance facts. Add the smallest deterministic, legal multi-city/upgrade progression script to the existing advisor test strategy, keep the original HPA-502 bot/sweep stable, and report *measured* claim days and blockers. The committed `docs/balance/progression-calibration.md` **must describe the bot's actual policy** (city-opening eligibility/timing, store-upgrade selection/aggressiveness, borrow-versus-cash rule, staffing/delegation, and planner cadence), in addition to claim-day results, seed, and blockers. Calibrate **immediately after the pure tiers/claims**, before save/UI/locales, on seed `20260503` and a 50-seed × four-archetype progression sweep (plus 50-seed idle negative controls), reporting completion rate and p10/median/p90 claim day per tier. The baseline after-sweep ran 450 traces in roughly three minutes, so a multi-seed progression sweep is affordable; do not fit thresholds only to one seed. If the reference trace cannot complete a tier under tuned economics, adjust authored goals/thresholds (not the underlying economy or synthetic rewards) and disclose any remaining gap. A pure idle/advance-only bot must not claim tier 1.

## 1. Company book value: deliberately simple

Pure `getCompanyBookValue(game)` in `src/lib/game/companyBookValue.ts`, returning an integer total and a compact breakdown for tests/UI:

```text
book value =
  cash
  + surviving retail assets (setup + upgrades)
  + purchased access rights for opened nonstarter world cities (openingCost)
  + surviving industrial assets (build + upgrades)
  + existing rail cells (build + upgrades)
  + remaining owned inventory at catalog cost
  - getTotalDebt(game)
```

- **Retail:** locate each store's original tile in its `game.cities`; non-founding stores contribute `getExpansionSetupCost(tile, archetypeId)`. `store-1` contributes **zero setup**, because the founding store was free. Each contributes `sum(getStoreUpgradeCost(level))` for prior levels 1 through current level − 1. Store setup prices are recomputed from immutable location/catalog data: this is an **estimated cost/book-value proxy**, not a historical receipt ledger.
- **City access:** each opened nonstarter city contributes its catalog `openingCost` as a persistent, owned **city-access right** in this game-value proxy; unopened and starter cities contribute zero. The access right is not a cash refund or market goodwill. Opening a city transfers cash into this continuing entitlement, avoiding an artificial value penalty for a tier-required action. No city-closing command exists.
- **Industry:** surviving `industrialBuildings` contribute `INDUSTRIAL_BUILDING_TYPES[typeId].buildCost` plus `sum(getBuildingUpgradeCost(level))` for completed upgrades. Demolished buildings contribute zero; no phantom demolition refund.
- **Rail:** each currently present `IndustryCity.rails` cell contributes `RAIL_BUILD_COST_PER_CELL + (level − 1) * RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL`; removed cells contribute zero.
- **Inventory:** use flat catalog `PRODUCTS[productId].importCost` for `StoreProduct.lots[].quantity` and `MATERIALS[materialId].importCost` for on-hand city/building material; this intentionally avoids a branded historical cost resolver in a proxy metric. **Some catalog import costs are fractional (e.g. 1.5); sum exact catalog-valued amounts first and round the final book-value total once to an integer**, not once per lot or bucket. `TransferOrder` has authoritative `status: 'in-transit' | 'delivered'` and `quantity`: count each **in-transit** material quantity once at catalog cost, exclude delivered orders, and assert that dispatch removed the units from the originating on-hand inventory so units cannot be counted twice. No stock ledger or implementation-time resolver choice.
- **Debt:** subtract `getTotalDebt(game)` once. A new loan normally raises cash and debt together, thus does not increase book value. Financing interest and losses affect value through the existing state changes.
- Preserve negative values and subtract complete debts before the final one-time rounding; do not clamp to zero. Never confuse the headline with market capitalization, an enterprise valuation, goodwill, or liquidation proceeds. A zero-inventory or empty-industry state works.

Call this pure calculator **after finance service** for `DailyReport.companyBookValueAfter`; its snapshot describes the same close-of-day state as `cashAfter` and `outstandingPrincipalAfter`. The Dashboard shows *live* book value, which can differ from the most recent close-of-day value after purchases. The report field is a historical snapshot, not a second asset store.

Hand fixture (no paid city opening): cash 40,000 + nonfounding store setup 12,000 + level-2 store upgrade 8,000 + level-2 $600 building (600+5,000) + level-2 rail cell 70 + $20 store stock + $15 material stock − debt 10,000 = **$55,705**. Check founder setup remains zero; test paid city-opening cash/access-right neutrality, demolition/rail removal/inventory transfer and debt neutrality independently.

## 2. A five-step authored ladder, not an achievement framework

Create `src/lib/game/progression.ts` with an immutable five-entry catalog, stable IDs, localized title/description keys, 2–3 conditions per entry, and a +1 store-cap plus +$25,000 **credit underwriting base and hard-bound capacity** reward per tier (not an assured loan). Names:

1. **Local Shop** — at least 2 stores; reported peak book value ≥ **$70k (provisional)**. This must be higher than the measured maximum founding/no-management baseline across archetypes and calibration seeds, rather than an automatic day-one $20k goal.
2. **Neighborhood Chain** — at least 3 stores; highest store level ≥ 2; at least 3 cities opened (including the two starter cities).
3. **Regional Supplier** — at least 4 cities opened; cumulative local retail delivery of a selected authored product set ≥ 25 units; reported peak book value ≥ $60k.
4. **Multi-City Operator** — at least 5 stores; at least 5 cities opened; highest store level ≥ 4.
5. **Market Leader** — at least 7 stores; all 6 existing cities opened; reported peak book value ≥ $150k.

**These numeric targets are first-pass candidates, not proven balanced.** The implementation checkpoint uses the actual harness to calibrate *both* target amounts and goal ordering. In particular, avoid a terminal supplier goal whose particular products cannot be produced by a legal reference strategy. The current 6-city world remains the top geography; no seventh city. "After the world milestones" means progression extends their short horizon; it does **not** gate tier 1 behind every optional world reveal, which would make the introductory ladder unreachable. World reveal and ladder evaluation remain independent.

Use authored `ScenarioCondition[]` and **export/reuse `evaluateCondition`** (it wraps `evaluateMetric`, comparator and window completeness) for the goal evidence and claims; do not duplicate it in progression. Add only:
- `max-store-level` (current; 0 for no stores).
- `opened-city-count` (current).
- `peak-company-book-value` (run-to-date; max of completed report `companyBookValueAfter`, 0 with no report; currency).

**No live `company-book-value` metric registration:** none of the five tiers needs one. The Dashboard headline reads `getCompanyBookValue(game).total` directly and formats it using `i18n.format.currency`; the scenario registry stays responsible for condition evidence only (three new metrics total).

Other goals reuse `store-count` and `retail-local-units` (run-to-date, explicit nonempty ProductId set). All *claim* goals use **monotone predicates** under the supported sandbox actions: store count (no closing), max level (no downgrade), opened city count (no closing), historical peak (append-only reports), and cumulative delivered units (append-only reports). Avoid debt-now, current market share, or current cash as persisted claims because a subsequent decline would make save-time proof impossible without new evidence. Each condition includes a target and actual/evidence; for report goals a zero-history result is not silently a completed window.

Pure `evaluateProgression(game)` returns a current-tier view, per-goal evidence, unlocked capacity and completion state; it does not mutate game. A small `claimEarnedTiers(game)` transition applies each contiguous eligible tier in order, storing a claim with ID and `claimedOnDay` only, adding **one to the existing persisted `storeCap` for each newly appended claim** and issuing a stable, one-time system notice; **no background timers, achievements subsystem, or special event scheduler**. If multiple tiers become eligible together, claim in order at a single commit and issue one notice for each. Keep `claimEarnedTiers` idempotent and return the original game reference when nothing changes.

## 3. Reward authority and persistence invariants

Represent progression in `GameState` as:
```ts
progression: { claims: Array<{ tierId: ProgressionTierId; claimedOnDay: number }> }
```

The claim-day value is part of a claimed-tier receipt, **not** a separate event log. It permits the final summary to display the original completion day on reload without a second persisted summary. Everything else (goal results, peak, available credit ceiling) is derived.

Reward accounting (incremental **only** for newly earned receipts):

```text
on claim:  newClaims = nextClaims.length - previousClaims.length
           nextStoreCap = game.storeCap + newClaims

credit underwriting base = $15,000 + $25,000 * claims.length
gross principal hard bound = $100,000 + $25,000 * claims.length
gross principal limit = min(hard bound,
  floor((underwriting base + 2 * weeklyOperatingCashFlow + 0.25 * max(0, cash))
    * healthFactor * historyFactor))
```

The existing `openWorldCity` and `refreshWorldProgress` **must not be changed**. They increment from the game’s current `storeCap` and are shared by sandbox and scenarios. All seven built-in scenarios can author `storeCap: 1`, then open cities or trigger milestones; deriving from `STARTER_STORE_CAP=3` here would silently overwrite their authored limits. Tier claims only happen at sandbox commit, so adding `newClaims` to the prior cap cannot double-award a receipt; repeat calls with no newly eligible claims return the **same game reference**. Across all five claims, the ordinary sandbox world maximum remains 6 + 5 = 11, without imposing sandbox-derived equality on scenarios or existing test fixtures.

The credit reward must change a **binding** term, not only the historically distant $100k hard bound. Increase both the `15_000` base and `100_000` maximum by the same $25k-per-claim step, without changing health, repayment-service, existing principal, delinquency or payment-headroom checks. A displayed reward is an increase to the **underwriting base/possible limit**, *not* a guarantee that available credit grows by $25k or that a loan is granted. Calibration must record whether it changes any offered/borrowed principal.

Persist claim receipts and the **existing mutable `storeCap`**; no stored goal progress, value peak or credit-limit counter. Initialize empty claims in `state.ts:createNewGame`, `routes/+page.svelte:starterMapState`, and scenario setup. Shared `validateCurrentGameState` checks only claim receipt **shape** (known IDs from `PROGRESSION_TIERS`, unique contiguous catalog-prefix order, integer `claimedOnDay` in [0, game.day]) and retains the current `storeCap >= stores.length` invariant plus `refreshWorldProgress` fixed-point. In `validateSaveRecordInternal`, **after** the shared game validator has decoded historical reports, enforce sandbox-only claim invariants: `claimEarnedTiers(game) === game` and every claimed tier still satisfies its monotone `evaluateCondition` goals. Reject invalid, skipped, duplicate or **unearned** claims; never silently claim or repair a save.

No validator `context` parameter is required: sandbox saves use `validateSaveRecordInternal`, while scenario setup/resume/codec use shared `validateCurrentGameState` directly and never invoke `claimEarnedTiers`. The shared `DailyReport.companyBookValueAfter` still works in scenario history, without changing scenario scoring, RNG, command constraints, or authored `storeCap`. Reports with malformed data are dropped by `decodeHistoricalReports`; claim proof runs **after** decoding, never on missing report evidence. Run a focused test where the E2E `revealCityAndGrantFunds` helper sets a higher cap and ensure it still loads; exact derived-cap equality is intentionally **not** added.

The sandbox’s single per-command commit boundary is `gameRouteController.ts:commitMutation`. Call `claimEarnedTiers(transition.game)` in the **sandbox branch, after successful command normalization and before** `runImmediateSandboxOperation`; pass its result to publication, autosave **and** `onAcceptedGameChange`. The existing balance harness calls `applyGameCommand` directly, so the **new opt-in progression bot must call the same `claimEarnedTiers` after each successful command** (including advance day); do not copy the claim logic or change the existing HPA-502 bots. This ensures identical day-of-claim semantics between calibration and actual play.

The design is **pre-release only**: update required schema, fixtures and codecs in one shot. No save migration or backward compatibility adapter.

## 4. UI, localization and experience

- Dashboard only, not a new global panel: a clear **Company book value** number computed directly with `getCompanyBookValue(game).total`, plus a small **Next milestone** section with 2–3 metric-backed rows, real actual/target units and the upcoming +1 store slot / **+$25k underwriting-base increase** (higher potential credit, not guaranteed funds). Completed tiers can be expanded as a brief summary, but no trophy gallery.
- **Reuse `ScenarioObjectivePanel` directly**, with `{required: tierRows, optional: [], failures: [], deadlineLabel: null}` — its empty sections and optional deadline already render correctly. Add optional `requiredHeading` and root `id` props with unchanged scenario defaults; export the existing `conditionViews` formatter from `i18n/scenarioCopy.ts` and use the exported `evaluateCondition` for evidence. Do not introduce a separate presenter.
- A one-time nonblocking localized completion notice; final summary displays claimed day, peak historical value and current cap. Existing acknowledgement returns to ongoing play; no extra action or terminal status.
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

1. Hand-worked assets/inventory/debt fixture including founding-free store, paid city-access rights, level upgrades, rails, demolition and exactly-once in-transit transfer quantities; paid city opening and loan principal preserve immediate book value. Reported daily close matches post-service state and Dashboard live value after a command.
2. Monotone tier conditions, exactly-once ordered claim/reward/notice, scenario-no-op, and deterministic replay for explicit seed. Save → load keeps claim days, UI peak from reports and final summary; malformed/forged claims fail, while the existing `storeCap >= stores.length` check remains (no derived-cap equality).
3. Shared world city/milestone cap transitions remain unchanged for authored-cap scenarios; sandbox tier claims add +1 once per newly appended receipt. Test same-command world opening plus claim, replay/no-op, scenario cap-1 opening and test-fixture custom caps. Credit grows at the underwriting base and hard bound while preserving payment headroom, repayment constraints and delinquency refusal; record any real borrowing benefit.
4. HPA-502 50-seed economy baseline is unchanged; seed `20260503` remains the acceptance trace, **plus 50 seeds × four archetypes** using the opt-in progression bot and idle negative controls. Record policy, all five completion rates, p10/median/p90 claim days among successes (not treating unreachable as day 365), credit utilization, and blockers. Tier-3 ~day 120 / tier-5 days 250–365 only if measured; freeze thresholds **before UI/locales** and retain prior harness outputs and scenario pack scores.
5. Dashboard, narrow screen, keyboard and localized strings verified; one browser E2E establishes a real first-tier claim in sandbox, reload persistence and absence in scenario mode.
6. `bun run check`, `bun run lint`, `bun run test:unit -- --run`, affected route/scenario E2E, full test suite, and `git diff --check`.

## Non-goals

No bankruptcy, forced end, new debt product, changed core economy, store resale, prestige, builder locks, new city, new art/SFX, backend/analytics/leaderboards, contract engine, migration adapter or separate progression PR. All implementation and test work stays within this HPA-318 PR.
