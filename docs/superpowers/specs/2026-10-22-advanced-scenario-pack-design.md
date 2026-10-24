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

**Calibration decision (2026-10-22):** Use the existing economy on `main@5fc0ccf726547b3e0586179d1f9aee154104f50b` as the baseline for HPA-511's four new scenario reference traces and medals. This is a **baseline acceptance, not proof that HPA-502 tuning finished**: HPA-502/PR #65 shipped a harness and baseline report but not the planned tuning or `docs/balance/after.md`. Reopen HPA-502 to finish that work; when its economy changes, HPA-502 must rerun the no-action and Gold reference traces for **all seven** scenarios and own any resulting recalibration. Do not put economy tuning or migrations in this PR.

## Product design

Four new version-1 IDs with seeds following the existing official scheme:

| ID / official seed | Player decision | Start and command scope | Success / failure shape |
| --- | --- | --- | --- |
| `debt-turnaround` / `280_004` | Pay down a distressed loan rather than borrowing indefinitely | One constrained retail store; substantial founding principal, normal weekly installments on days 9/16/23 within the 28-day limit; price, stock, staffing, borrow/repay/payoff/refinance | Debt below calibrated threshold; fail on negative cash or **any missed installment** (no redundant zero-missed objective) |
| `fresh-market` / `280_005` | Balance produce availability, margins and spoilage | Grocery with `produce` (10-day shelf life), **nonzero opening produce stock** in dated lots; pricing, inventory targets and hiring | Positive produce sales volume and low waste as a share of produce **outflow** (sold + discarded); fail on negative cash |
| `rival-next-door` / `280_006` | Defend local share while making money | Retail city with explicitly enabled, derived-seed rivals; pricing, stock, policy and staffing | Minimum weighted market share on a *complete trailing window* plus positive operating performance; fail on negative cash |
| `two-city-supply-run` / `280_007` | Dispatch a repeatable supply line to the destination | Existing Industry City plus one other opened industry city with a prebuilt producer and seeded inventory; route create/update/pause/resume | Deliver a target number of material units by deadline using a **recurring** route; fail on negative cash or deadline |

All scenarios: **14–28 in-game days**; titles, summaries, briefings, hints, every condition label in en / ja / zh-Hant; Bronze 500, Silver strictly above Bronze, Gold no higher than 1000. Required objectives stay separate from score: 500 completion points plus exactly 500 possible bonus points. Choose exact starting quantities, deadline and score thresholds from reference traces in the **implementation checkpoint**, not unmeasured numbers in this document.

### Metrics: one engine, explicit semantics

**Refactor before adding metrics:** use `ScenarioMetricQuery` for the query shapes and the already exhaustive `METRIC_REGISTRY satisfies Record<MetricId, MetricRegistration>` for each metric's evaluation, supported windows, `productScoped` flag, and `format: 'currency' | 'percent' | 'decimal'`. Derive validation windows, product-scoped set, codec's known metric IDs and evidence-value formatting from this registry instead of maintaining parallel ID lists. Keep explicit per-query shape checks for parameterized metrics and the special local-production-path constraint. Export `SCENARIO_IDS` once from `scenarios/types.ts`, derive `ScenarioId` from that tuple, and import it into both `shareCode.ts` and `scenarioCodec.ts` without creating a catalog import cycle. The registry remains exhaustive by construction; test observable validation, formatting and unknown-ID codec rejection rather than adding duplicate compile-time assertion tests.

| Proposed ID | Source / rule | Window |
| --- | --- | --- |
| `total-debt` | `getTotalDebt(game)` (outstanding principal, no double count of overdue principal) | current |
| `missed-loan-payments` | Sum `missedPaymentCount` over **all** loans, including paid/refinanced history; never reset on refinancing | current |
| `product-waste-units` | Sum filtered `storeReports[].productReports[].wasteUnits` | report aggregates |
| `product-waste-share` | For selected products, **sum `wasteUnits` / (sum `unitsSold` + sum `wasteUnits`)**, from `DailyProductReport`; if neither sold nor wasted, return 0 but require a **separate positive `units-sold` objective** to qualify. This outflow denominator includes stock already on hand on day 0, unlike receipts-only ratios. Seed opening produce as a dated lot so spoilage can appear inside a 14-day window | report aggregates |
| `player-market-share` | Demand-weighted share across selected-product `marketReports`: sum **stored `playerDemandPool`** / sum `cityDemandPool` (the numerator is already rounded in simulation); zero denominator => 0, complete trailing window required | trailing/fixed report windows |
| `delivered-transfer-units` | **Query includes `destinationCityId` and `materialId`.** Sum matching `DailyReport.logistics.arrivals[].quantity` on the **arrival** day, filtering by destination and material; evidence IDs are corresponding `transferOrderId`s, canonically sorted and unique. Exclude unmatched arrivals; in the logistics scenario manual dispatch is forbidden, so counted arrivals are recurring-route deliveries | report aggregates |

For report-derived metrics use current/reports only where semantically meaningful; products must be allowlisted and nonempty. Keep `windowComplete` behavior and `requiresCompleteWindow` for the trailing-share goal so day 1 cannot satisfy a day-7 average. Return canonical sorted unique contributing evidence IDs (day/product/market/arrival as applicable) and stable numeric results; do not persist redundant summaries. Format debt as currency, unit counts as decimals, waste and market share as percentages.

**Important:** a condition with a zero denominator must not count as success merely because the ratio is 0. Pair ratios with explicit throughput or demand preconditions. Avoid scenario-ID switches in metric evaluators.

### Scenario-authored rivals

Add a minimal start override for **retail city IDs with seeded competitors**, e.g. `competitorCityIds?: readonly WorldCityId[]`. Validate nonduplicates, real/opened retail cities and inclusion in the scenario content allowlist. After materializing the start, selectively call `ensureCompetitorsForRetailCity(game, cityId)`; it already uses derived RNG and avoids occupied store tiles. Continue to clear sandbox-generated rivals for every scenario unless explicitly opted in.

Use the assigned official seed and assert at fixture level that at least one generated rival is an **actual competing seller of the objective product**. The generic `common-ground` brand supports all families, but `resolveProductMarketShare` first filters each rival by **its archetype's `startingProductIds`**, so not every generated rival competes on every product. Change the seed only if this one focused assertion fails; no broad seed-search harness, authored rival AI, free-form editor, or scenario-specific market branches. Amend the living-market design non-goal to document this narrow supported opt-in.

### Recurring routes in scenarios

Add `createRecurringRoute`, `updateRecurringRoute`, `pauseRecurringRoute`, and `resumeRecurringRoute` scenario command variants. For create/update use the existing route input shapes **omitting `leadTimeDays` and `transportCostPerUnit`**; carry route ID on update/pause/resume. In `runtime.ts`, derive the missing rates from `quoteInterCityRates(originCityId, destinationCityId)` and append the canonical quote **last** before calling existing `interCityLogistics.ts` transitions. Reject invalid/null quote or malformed payload before mutation; preserve typed domain failure reasons. Sandbox retains its existing full `RecurringRouteInput` and transitions, with no second logistics state owner.

**Scenario route economics invariant:** Do not accept player-supplied freight rates or lead times in a scenario command. The scenario `Omit<...>` payload has only city pair, material, capacity/frequency (and priority on create); perform content/shape validation in `isScenarioCommandAllowed`, compute the game's city-pair quote in `applyGameCommand`, and merge the quote into the domain route input. If the quote is unavailable, reject the command. On update, recompute the quote for the newly selected pair. The panel must show `leadTimeDays` and `transportCostPerUnit` as **read-only, current quote-derived fields in scenario mode** while preserving editable fields in sandbox. No silent ignores or bare error after editable inputs. Keep capacity and frequency player-configurable; they still obey existing validation and actual shipping constraints. Cover valid quote use, invalid city pairs, rejected-command immutability and a route update with changed cities, without a redundant mismatch test matrix.

Today `createMutationAvailability` exposes only blanket `manageLogistics` in sandbox, and controller logistics methods omit `scenarioCommand`. Make the **minimum** action-level availability needed by the existing operations panel (create/update/pause/resume); disabled scenario-only actions (manual transfer, remove, reprioritize, etc.) must not appear actionable. Keep the same controller `commitMutation` path for both play modes. If UI exposes route details through a sandbox-only wrapper, make the smallest reuse change there, not a new logistics screen.

The start blueprint already supports `world`, `cityInventoryMaterials` and industrial buildings; use those directly. Count **only matching destination+material delivered arrivals**, not orders dispatched or in transit. No extra starting-state DSL or forced disruption event; use normal seed-driven event eligibility.

### Loan setup

Use **only** existing `overrides.debt` and normal borrow/repay/refinance commands. Founding loans have an 84-day term and weekly installments landing on days 9/16/23 within the 28-day Debt Turnaround limit, so the scenario necessarily encounters scheduled payments. Do **not** add a founding-loan term/payment-timing override, loan authoring DSL or modified finance rules.

### Registration, copy and persistence

- Extend the single exported `SCENARIO_IDS` tuple in `scenarios/types.ts` (with `ScenarioId` derived from it), and register all seven in `ALL_DEFINITIONS`. `shareCode.ts` and `scenarioCodec.ts` must import the same ID list; derive codec accepted metric IDs from `METRIC_REGISTRY`. Preserve prior ID@version contracts and old share-code validity.
- Persist scenario runs with metrics and commands using the existing strict codec and repository; no new save version or backward-compatibility migration for pre-release saves.
- Reuse the catalog, briefing, objective/result components and existing translation hierarchy `scenarioDefinitions.*`; English/Japanese/Traditional Chinese parity is mandatory.
- Strictly validate start override keys, cities, command payloads, window compatibility, score totals, and canonical evidence. A bad option must be rejected, not silently accepted as an inert command.

## Acceptance gates

1. **Calibration ownership:** use accepted `main@5fc0ccf` (2026-10-22) for HPA-511's reference traces now; HPA-502 owns eventual tuning, after-report and rerunning/recalibrating **all seven scenarios**. Do not claim this baseline meets HPA-502's pending balance targets.
2. **Definition correctness:** seven immutable, validated definitions, deterministic setup for all official seeds; existing three scenarios unchanged; no scenario-ID branches in shared game/simulation/UI.
3. **Mechanics:** one end-to-end path for real loan payments, produce loss, relevant rival market share, and recurring deliveries; invalid commands and disallowed logistics actions are rejected consistently.
4. **Metrics/save:** numerical hand fixtures (including outflow zero denominator and destination/material filtering), report-window edges, registry-backed validation/format/codec behavior, save round-trip and unknown-metric rejection; stable evidence order.
5. **Calibration:** for each new official seed, **advance-only cannot earn Silver**, documented concrete legal player command trace earns Gold, replay yields same result; verify existing three launch traces still pass after any external tuning.
6. **UX:** scenario selection, briefing, objectives, full result, copy in all three languages, keyboard and narrow-screen controls; one focused E2E covering one advanced scenario to result.
7. **Verification:** `bun run check`, `bun run lint`, `bun run test:unit -- --run`, targeted scenario E2E and copy parity. Keep design/implementation/test work in this **one PR**.

## Explicit non-goals

No scenario editor, external JSON scenario system, forced events, rival AI subsystem, multiplayer/leaderboards, new sound or art, separate metric engine, route simulator, economy tuning owned by HPA-502, persistence migration scaffolding, or changes to the behavior of the three existing scenarios.
