# HPA-511 — Advanced Scenario Pack Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-511/content-add-a-scenario-pack-for-debt-freshness-rivals-and-logistics  
**Design:** ../specs/2026-10-22-advanced-scenario-pack-design.md  
**Accepted calibration baseline:** `main@5fc0ccf726547b3e0586179d1f9aee154104f50b` (decision: 2026-10-22)  
**Delivery:** one ticket, **this one PR** from design through implementation, localization, verification and calibration.

## Decisions / reuse boundary

- Build four **vertical slices** in this order: Debt Turnaround, Fresh Market, Rival Next Door, Two-City Supply Run; official seeds `280_004`–`280_007`, respectively. Each slice ends with playable, localized, persisted content and passing **advance-only below Silver / legal Gold** reference traces; no separate implementation PR.
- First eliminate parallel metric ID/window/product/format lists in a **pure registry refactor** verified by existing tests. Keep the already exhaustive `METRIC_REGISTRY satisfies Record<MetricId, MetricRegistration>`; do not add assertion tests for the same compile-time guarantee.
- HPA-511 may calibrate **now** against pinned main. HPA-502 is incomplete despite PR #65 being merged (no `docs/balance/after.md` or economy-tuning changes). Reopen HPA-502 to own the still-missing tuning/after report and, **after** any economy change, rerun and recalibrate no-action/Gold reference traces for **all seven scenarios**. Do not pull its tuning into this PR or describe the untuned economy as balanced.
- Continue existing authoring rules: one immutable definition per scenario ID@version, no scenario-specific engine branches, 500 completion points plus exactly 500 possible bonus points, Bronze 500, Silver > 500, Gold ≤ 1000, 14–28 days and official fixed seeds. Existing launch scenario definitions and share codes remain unchanged.
- No added state owner, extra editor, loan authoring DSL, scripted events, new art/SFX, schema migrations, rival AI, or bot framework. Use normal gameplay commands for reference traces.

## Work breakdown — staged commits in the SAME PR

### 0. Refresh baseline and prove existing contracts

1. Re-read `CLAUDE.md` and challenge-mode spec; capture main's SHA and run focused specs: `catalog.spec.ts`, `runtime.spec.ts`, `metrics.spec.ts`, `validation.spec.ts`, `scenarioCodec.spec.ts`. Confirm launch scenarios' current outcomes and note any existing non-Gold reference path rather than silently weakening a test.
2. Treat `main@5fc0ccf` as the **HPA-511** calibration baseline (already accepted in PR #66); no stage-6 dependency gate or need to wait for the unfinished HPA-502 tuning. If main later changes, verify traces again; HPA-502 owns the later economy-driven rework.
3. Reuse `src/lib/scenarios/` runtime, catalog, setup, metrics, validation, share-code and persistence APIs; keep current `createMutationAvailability` / `commitMutation` path.

### 1. One metric registry / ID list (behavior-preserving refactor)

1. Add `productScoped` and `format: 'currency' | 'percent' | 'decimal'` metadata to every `METRIC_REGISTRY` entry, preserving existing `supportedWindows`, completeness and evaluator functions. Keep the specialized local-production-path rule in validation; encode it as registry metadata if that avoids another parallel metric ID list.
2. Derive `METRIC_WINDOWS` / product metric selection in `validation/shared.ts`, codec's known metric IDs in `persistence/scenarioCodec.ts`, and `formatEvidenceValue` in `i18n/scenarioCopy.ts` **from the registry**, rather than maintaining hand-written lists. Preserve strict closed-object query validation in `validation/conditions.ts`, including field-specific checks (product IDs, score, buildings, city/material).
3. Export `SCENARIO_IDS` from `scenarios/types.ts` and derive `ScenarioId` from its tuple; have `shareCode.ts` and `scenarioCodec.ts` import it. This keeps one ID source without new catalog import cycles.
4. Run the existing unit/codec/UI copy specs and focused tests for unknown metric/ID rejection, old save/share-code round trips, window rejection and currency/percent formatting. This step is **only a refactor** — no new scenario or metric behavior yet.

### 2. Debt Turnaround — cheapest complete vertical slice

1. Add `total-debt` (`getTotalDebt(game)`, current window) and `missed-loan-payments` (sum `missedPaymentCount` for all loans including closed, current window), with metric fixtures and evidence/codec/query tests. Register and format as currency/decimal through the unified registry.
2. Author `debt-turnaround`, version 1, official seed `280_004`, using **existing `overrides.debt` only**. Founding loans already have an 84-day term and scheduled installments every 7 days; no founding-loan date/term override. Allow existing genuine retail/loan commands.
3. Required win: debt below measured threshold; failure: any missed installment or negative cash. Do **not** duplicate zero missed payments as a win condition. Keep the missed-payment metric available for the failure and later long-game reuse.
4. Wire the scenario into the single catalog/ID list, strict codec, share-code fixtures and localization (`en` / `ja` / `zh-Hant`), including title/briefing/strategy/objective/failures. Extend relevant catalog/UI/save tests.
5. Record deterministic **advance-only below Silver** and **legal Gold** traces in the existing table-driven `runtime.spec.ts` harness. Tune authoring balances, objectives and thresholds from those traces before proceeding. Keep all three launch scenarios unchanged.

### 3. Fresh Market — exercise opening-stock spoilage

1. Add `product-waste-units` and `product-waste-share` for nonempty allowlisted product IDs, over existing aggregate report windows. Read `DailyProductReport.wasteUnits` and `unitsSold`. Define **waste share as** `sum(wasteUnits) / (sum(unitsSold) + sum(wasteUnits))`; if outflow is 0, return 0, but require a separate positive `units-sold` objective to prevent a no-trade win. This deliberately replaces receipts-based waste percentage, which excludes starting stock.
2. Use existing `overrides.stores[].products[].stock` to seed a **nonzero produce opening lot** with `receivedDay = game.day`; produce has a 10-day shelf life, and replenishment is post-sales on days 7, 14, etc. Explicitly test that spoilage occurs **within** the chosen 14–28-day window and that the fixture has both meaningful sales and waste. Do not force inventory to zero to fix denominator semantics.
3. Author `fresh-market`, seed `280_005`, with legal price/inventory/staff controls and the normal perishable-stock engine. Complete score, en/ja/zh-Hant copy, codec/catalog fixtures and a real produce-waste evidence test. Handle zero denominator and existing stock in focused metrics specs.
4. Add no-action and legal Gold traces **now**, not in a distant calibration stage; adjust starting stock, limits and targets from observed outcomes. Retain a separate `product-waste-units` metric even if this specific scenario's ratio objective mainly uses `product-waste-share`, because HPA-511 and HPA-318 need both.

### 4. Rival Next Door — opt-in deterministic city competitors

1. Add `player-market-share` using `sum(marketReports.playerDemandPool) / sum(marketReports.cityDemandPool)` over the selected products and trailing/fixed windows; zero denominator → 0 and an incomplete trailing window cannot qualify. Use stored `playerDemandPool`, not a re-rounded estimate from `playerShare`. Test multi-report weighting, zero demand and evidence ordering.
2. Add a typed optional `competitorCityIds` start override in `scenarios/types.ts`, `validation/shared.ts` and `validation/start.ts`; reject duplicate, closed, non-retail or non-allowlisted IDs. In `setup.ts`, preserve default empty rivals but call `ensureCompetitorsForRetailCity` **after** cities and founding store have materialized for opted-in cities. Prove same seed yields same rivals, no overlap with player's store, old three scenarios still rival-free.
3. Author `rival-next-door`, seed `280_006`. Fixture-check that at least one generated rival **actually sells the goal product**: `marketCompetition.ts` filters by rival archetype's `startingProductIds` before checking brand, so the `common-ground` brand alone does *not* guarantee competition on every product. Use the assigned seed unless that one assertion fails; no seed search harness or rival authoring system.
4. Require complete trailing market-share reports plus positive operating performance. Wire definition/copy/catalog/codec and finish its advance-only/Gold reference traces. Amend the living-market design non-goal only to document authored opt-in.

### 5. Two-City Supply Run — recurring logistics end-to-end

1. Add `delivered-transfer-units` with query shape `{ metric: 'delivered-transfer-units', destinationCityId, materialId }`. Validate known, opened, allowlisted **industry destination** and known allowlisted material, with strict query keys. Sum only matching `DailyReport.logistics.arrivals[].quantity` on arrival days; derive canonical unique evidence IDs from matching `transferOrderId`. Do **not** read the unscoped `logistics.deliveredUnits` scalar. Test wrong destination/material, in-transit transfers, cross-day arrivals and save round-trip.
2. Add four command kinds to `SCENARIO_COMMAND_KINDS` (the existing `KNOWN_COMMANDS` set follows automatically): `createRecurringRoute`, `updateRecurringRoute`, `pauseRecurringRoute` and `resumeRecurringRoute`. Scenario create/update inputs use `Omit<RecurringRouteInput, 'leadTimeDays' | 'transportCostPerUnit'>` (and the analogous update type). The scenario command cannot supply or overwrite base rates.
3. In `scenarios/capabilities.ts`, validate payload shapes, IDs and content allowlists (plus route existence where appropriate). In `scenarios/runtime.ts` / `applyGameCommand`, obtain `quoteInterCityRates(originCityId, destinationCityId)`; reject null quotes, then spread the canonical quote **last** into the existing create/update transitions. Recompute on route updates; preserve their typed failures. Reject malformed commands without changing run/game/day. Do not extend the static `validation/commands.ts` beyond the automatically recognized kind list; it validates authored `allowedCommands`, not runtime route rates. Sandbox continues to pass full user-edited route inputs.
4. Attach the four new `scenarioCommand` variants to existing `gameRouteController.ts` methods and `commitMutation`. Split blanket `manageLogistics` into the minimal existing per-command availability flags (create/update/pause/resume) rather than a second UI. Keep manual dispatch, route remove and reprioritize sandbox-only and show read-only route details in scenarios.
5. In `LogisticsPanel.svelte`, **lock lead-time and cost fields as read-only, quote-derived displays in scenario mode**; refresh on city-pair change and during editing, while keeping sandbox inputs editable. Strip these fields when constructing scenario commands, even though sandbox transition input still contains them. Add a panel/controller test proving quote display, scenario edit restrictions and successful scenario route create/update through the persistence gate.
6. Use existing `world` / `industrialBuildings` / `cityInventoryMaterials` opening overrides to author `two-city-supply-run`, seed `280_007`. Goal tracks destination+material arrivals from recurring routes only; manual orders are forbidden. Confirm actual stock, dispatch costs, lead times and deadline make the objective reachable. Wire localization/catalog/codec and run its no-action/Gold reference traces and a focused UI-to-result E2E.

### 6. Cross-scenario verification and delivery

1. Ensure all seven definitions validate; three launch definitions retain version/rules, old save/share codes remain readable, and every scenario's deterministic no-action result remains below Silver while a **real, documented** legal reference trace earns Gold. Re-run all four new traces after the final content edits.
2. Verify new metric query variants, required typed fields, window compatibility, canonical contributor evidence, codec round trip, unknown metric rejection and seeded start validation. Run en/ja/zh-Hant translation-key parity tests.
3. Test scenario route costs use the computed city-pair quote even under malformed caller input, no forbidden manual logistics paths, correct scenario-mode panel readonly behavior, plus keyboard/narrow-screen UX. Preserve error localization and unchanged run on rejection.
4. Run `bun run check`, `bun run lint`, `bun run test:unit -- --run` and targeted Playwright E2E including one advanced scenario start→actions→result and existing scenario flows. Post a reference-command/medal table and verification summary to this PR; **do not open another PR**.
5. Keep HPA-502 responsible for future economy tuning, after-report and **rerunning all seven** reference traces if economic constants/forecast/cadence change. Do not revise HPA-511's baseline silently.

## Definition of done

- One compiled registry/metadata source for metric IDs, windows, product scope and formatting; one shared scenario ID tuple. Strict closed-object query/save validation retained.
- Seven selectable, localized, immutable definitions; existing three unchanged; no new art, persistence migrations or gameplay framework.
- Four new seeds: deterministic no-action **below Silver** and documented legal **Gold**, verified incrementally, with focused runtime + UI + persistence tests.
- Finance, opening-stock spoilage, genuine rival competition, and destination/material-specific recurring deliveries proven by normal simulation paths.
- Checks, lint, full unit suite, relevant E2E and localization parity green; change **this same draft PR** to ready only then.

## Review checklist

- [x] Accepted `main@5fc0ccf` as HPA-511's calibration baseline on 2026-10-22 (HPA-502 still owns future tuning).
- [x] Adopted registry consolidation, outflow-based waste share, destination/material-scoped deliveries, runtime-quoted routes and per-scenario vertical slices.
- [ ] Implement registry-only refactor; old scenario tests unchanged.
- [ ] Each vertical scenario slice reaches Gold with a real reference trace; no-action below Silver.
- [ ] Confirm rival actually sells target product and scenario quote is displayed read-only in the panel.
- [ ] Full check/lint/unit/E2E and copy parity before marking ready.
