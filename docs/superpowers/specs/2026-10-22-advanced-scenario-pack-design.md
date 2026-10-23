# HPA-511 — Advanced Scenario Pack Design

**Linear:** https://linear.app/cwchanap/issue/HPA-511/content-add-a-scenario-pack-for-debt-freshness-rivals-and-logistics  
**Roadmap:** HPA-534 · **PR:** one draft PR for design, implementation, copy and tests  
**Reviewed:** Serpens main at `5fc0ccf` (2026-10-22) · **Status:** design checkpoint, no implementation

## Outcome

Add four playable, deterministic, authored challenges that exercise finance, perishable products, market competition and inter-city recurring logistics using the **existing** scenario engine. Keep the existing three definitions, UI flow, save repositories and simulation authority. This is one vertical delivery in HPA-511; HPA-318 follows after its reusable metrics land.

## Baseline facts / reuse survey

| Concern | Existing owner | Decision |
| --- | --- | --- |
| Catalog/version/share codes | `scenarios/catalog.ts`, `types.ts`, `shareCode.ts` | Extend seven-entry catalog; no new scenario registry |
| Pure objective evaluation | `scenarios/metrics.ts` and validation modules | Extend union, registry, windows, query validation and evidence |
| Replay / commands | `scenarios/runtime.ts` exports `applyGameCommand` | Route new commands through same transition dispatcher and scenario capability gate |
| Starting state | `scenarios/setup.ts` and `validation/start.ts` | Add only missing typed overrides, use real setup transitions |
| Rivals | `game/competitors.ts` exposes deterministic `ensureCompetitorsForRetailCity` | Opt-in seeded rivals for authored city; preserve default rival-free scenarios |
| Finance | `game/finance.ts` `getTotalDebt` and `LoanInstrument.missedPaymentCount` | Read existing state, no finance simulation fork |
| Product loss and market | `DailyProductReport.wasteUnits` and `DailyReport.marketReports` | Read already-recorded reports |
| Transfers/routes | `game/interCityLogistics.ts`, `DailyReport.logistics` | Reuse real recurring-route lifecycle, no script-only deliveries |
| UI / saves | `routes/gameRouteController.ts`, `persistence/scenarioCodec.ts`, existing scenario components | Extend capabilities, strict codec IDs/metrics, and i18n; no new run store |
| Calibration | `tests/balance/` and `scenarios/runtime.spec.ts` | Use fixed seeds + reference traces; never hard-code medals by intuition |

**Dependency caveat:** Linear lists HPA-502 Done and PR #65 merged, but current main contains only `docs/balance/baseline.md` (no `after.md`); PR #65 does not contain its planned economic tuning/calibration. Design can proceed; **final thresholds/reference Gold claims are gated on the tuned post-HPA-502 economy**. Do not move economic tuning into this ticket. Record and reconcile that dependency before the implementation-calibration gate. The required audit artifact is a **Calibration baseline** section in PR #66's description: initial status **Pending** at `main@5fc0ccf` on 2026-10-22; to unblock stage 6, record the accepted economy commit SHA, decision date, and either the reconciled HPA-502 `after.md` or an explicit decision that current main is the calibration baseline. The review gate must remain unchecked while the decision is Pending.

## Product design

Four new version-1 IDs with seeds following the existing official scheme:

| ID / official seed | Player decision | Start and command scope | Success / failure shape |
| --- | --- | --- | --- |
| `debt-turnaround` / `280_004` | Pay down a distressed loan rather than borrowing indefinitely | One constrained retail store; substantial principal, near-term scheduled payments; price, stock, staffing, borrow/repay/payoff/refinance | Debt below calibrated threshold **and** zero missed installments; fail on cash below zero or any missed installment |
| `fresh-market` / `280_005` | Balance produce availability, margins and spoilage | Grocery with `produce` (10-day shelf life); pricing, inventory targets and hiring; deliberately zero initial counted produce stock so receipt-based waste ratio is honest | Sales volume target and waste/receipts ratio under cap; fail on negative cash |
| `rival-next-door` / `280_006` | Defend local share while making money | Retail city with explicitly enabled, derived-seed rivals; pricing, stock, policy and staffing | Minimum weighted market share on a *complete trailing window* plus positive operating performance; fail on negative cash |
| `two-city-supply-run` / `280_007` | Dispatch a repeatable supply line to the destination | Existing Industry City plus one other opened industry city with a prebuilt producer and seeded inventory; route create/update/pause/resume | Deliver a target number of material units by deadline using a **recurring** route; fail on negative cash or deadline |

All scenarios: **14–28 in-game days**; titles, summaries, briefings, hints, every condition label in en / ja / zh-Hant; Bronze 500, Silver strictly above Bronze, Gold no higher than 1000. Required objectives stay separate from score: 500 completion points plus exactly 500 possible bonus points. Choose exact starting quantities, deadline and score thresholds from reference traces in the **implementation checkpoint**, not unmeasured numbers in this document.

### Metrics: one engine, explicit semantics

Extend `ScenarioMetricQuery`, `METRIC_REGISTRY`, `METRIC_WINDOWS`, `PRODUCT_METRICS`, `validateMetricQuery`, `scenarioCodec.ts` and `formatEvidenceValue` together. Tests should ensure the union and codec accepted-ID lists are compile-time exhaustive (using `satisfies` or a type-level equality assertion) and reject unknown IDs at decode time.

| Proposed ID | Source / rule | Window |
| --- | --- | --- |
| `total-debt` | `getTotalDebt(game)` (outstanding principal, no double count of overdue principal) | current |
| `missed-loan-payments` | Sum `missedPaymentCount` over **all** loans, including paid/refinanced history; never reset on refinancing | current |
| `product-waste-units` | Sum filtered `storeReports[].productReports[].wasteUnits` | report aggregates |
| `product-waste-share` | For selected products, total waste units / total received units (sum `importedUnits + warehouseUnits` across reports); if no receipts, return 0 **but treat zero-volume success as invalid through a separate positive-units-sold objective**. Starting tracked product inventory is zero to avoid uncounted opening stock | report aggregates |
| `player-market-share` | Demand-weighted share for selected product(s) across matching `marketReports`: sum `cityDemandPool × playerShare` / sum `cityDemandPool`; no unweighted daily-average distortion; zero denominator => 0 | trailing/fixed report windows |
| `delivered-transfer-units` | Sum `DailyReport.logistics.deliveredUnits` (arrival day, not dispatch day); may cover manual orders in general, but logistics scenario **does not allow manual dispatch**, so all counted arrivals must be route-produced | report aggregates |

For report-derived metrics use current/reports only where semantically meaningful; products must be allowlisted and nonempty. Keep `windowComplete` behavior and `requiresCompleteWindow` for the trailing-share goal so day 1 cannot satisfy a day-7 average. Return canonical sorted unique contributing evidence IDs (day/product/market/arrival as applicable) and stable numeric results; do not persist redundant summaries. Format debt as currency, unit counts as decimals, waste and market share as percentages.

**Important:** a condition with a zero denominator must not count as success merely because the ratio is 0. Pair ratios with explicit throughput or demand preconditions. Avoid scenario-ID switches in metric evaluators.

### Scenario-authored rivals

Add a minimal start override for **retail city IDs with seeded competitors**, e.g. `competitorCityIds?: readonly WorldCityId[]`. Validate nonduplicates, real/opened retail cities and inclusion in the scenario content allowlist. After materializing the start, selectively call `ensureCompetitorsForRetailCity(game, cityId)`; it already uses derived RNG and avoids occupied store tiles. Continue to clear sandbox-generated rivals for every scenario unless explicitly opted in.

Choose official seed after verifying the resulting rival actually overlaps the requested product market; do **not** add authored rival AI, a free-form competitor editor, or scenario-specific branches to market simulation. Amend the living-market design non-goal to document this narrow supported opt-in.

### Recurring routes in scenarios

Add `createRecurringRoute`, `updateRecurringRoute`, `pauseRecurringRoute`, and `resumeRecurringRoute` command variants, carrying existing `RecurringRouteInput` / `RecurringRouteUpdateInput` and ID as appropriate. In `runtime.ts` dispatch through the existing `interCityLogistics.ts` transitions and preserve typed logistics failure reasons. Apply normal scenario allowlisting and game-state validation; no sandbox-only mutation bypass.

**Scenario route economics invariant:** Sandbox currently lets players edit `leadTimeDays` and `transportCostPerUnit`, and the domain transition only checks that both are positive integers. In scenario mode only, validate each `createRecurringRoute` and `updateRecurringRoute` command against the existing `quoteInterCityRates(originCityId, destinationCityId)` calculation. Both supplied values must **exactly equal** the quote for the command's chosen industry-city pair (quote is independent of material); reject absent/invalid quotes and mismatches **before** the transition changes a run. Keep `capacity` and `frequencyDays` as player choices, still subject to domain validation, available source stock and actual transport expense at dispatch. Recalculate on updates, including when the cities change. Put this game-aware check in `isScenarioCommandAllowed` in `scenarios/capabilities.ts`, because `validation/commands.ts` validates static scenario definitions (`allowedCommands`), not stateful command payloads; keep that module for declared-command validation only. Reuse existing `quoteInterCityRates`, not a duplicated freight formula. The sandbox route editor and sandbox economics remain unchanged. Test both fields on create/update, including mismatch rejections and quote-matched acceptance.

Today `createMutationAvailability` exposes only blanket `manageLogistics` in sandbox, and controller logistics methods omit `scenarioCommand`. Make the **minimum** action-level availability needed by the existing operations panel (create/update/pause/resume); disabled scenario-only actions (manual transfer, remove, reprioritize, etc.) must not appear actionable. Keep the same controller `commitMutation` path for both play modes. If UI exposes route details through a sandbox-only wrapper, make the smallest reuse change there, not a new logistics screen.

The start blueprint already supports `world`, `cityInventoryMaterials` and industrial buildings; prefer those. Build only one extra override if an official trace proves the existing shape insufficient. Distinguish **delivered** arrivals from orders merely dispatched or still in transit. No forced disruption event; use normal seed-driven event eligibility.

### Loan setup

Current `overrides.debt` replaces only the founding loan amount. First attempt to author Debt Turnaround with that existing override and valid normal borrow/repay/refinance commands. If its scheduled payment cannot be made meaningfully imminent, add **only** a narrow validated founding-loan start option (term/payment timing), materialized via the existing finance shape. Do not invent an arbitrary loan authoring DSL or change production finance rules.

### Registration, copy and persistence

- Add new IDs to `ScenarioId`, `shareCode.ts`, `scenarioCodec.ts` and `ALL_DEFINITIONS`. Keep the three prior ID@version contracts stable; old share codes remain valid.
- Persist scenario runs with metrics and commands using the existing strict codec and repository; no new save version or backward-compatibility migration for pre-release saves.
- Reuse the catalog, briefing, objective/result components and existing translation hierarchy `scenarioDefinitions.*`; English/Japanese/Traditional Chinese parity is mandatory.
- Strictly validate start override keys, cities, command payloads, window compatibility, score totals, and canonical evidence. A bad option must be rejected, not silently accepted as an inert command.

## Acceptance gates

1. **Dependency:** confirm HPA-502 tuning/after results are finalized or explicitly resolve the discrepancy before calibrating final scenario thresholds. No claimed balanced medal thresholds while the repo only has baseline evidence.
2. **Definition correctness:** seven immutable, validated definitions, deterministic setup for all official seeds; existing three scenarios unchanged; no scenario-ID branches in shared game/simulation/UI.
3. **Mechanics:** one end-to-end path for real loan payments, produce loss, relevant rival market share, and recurring deliveries; invalid commands and disallowed logistics actions are rejected consistently.
4. **Metrics/save:** numerical hand fixtures, window/denominator edge tests, metric query/codec exhaustive checks, run round-trip and unknown-metric rejection; stable evidence order.
5. **Calibration:** for each new official seed, **advance-only cannot earn Silver**, documented concrete legal player command trace earns Gold, replay yields same result; verify existing three launch traces still pass after any external tuning.
6. **UX:** scenario selection, briefing, objectives, full result, copy in all three languages, keyboard and narrow-screen controls; one focused E2E covering one advanced scenario to result.
7. **Verification:** `bun run check`, `bun run lint`, `bun run test:unit -- --run`, targeted scenario E2E and copy parity. Keep design/implementation/test work in this **one PR**.

## Explicit non-goals

No scenario editor, external JSON scenario system, forced events, rival AI subsystem, multiplayer/leaderboards, new sound or art, separate metric engine, route simulator, economy tuning owned by HPA-502, persistence migration scaffolding, or changes to the behavior of the three existing scenarios.
