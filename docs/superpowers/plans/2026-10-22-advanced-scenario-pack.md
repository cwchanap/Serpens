# HPA-511 — Advanced Scenario Pack Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-511/content-add-a-scenario-pack-for-debt-freshness-rivals-and-logistics  
**Design:** ../specs/2026-10-22-advanced-scenario-pack-design.md  
**Baseline:** `main` at `5fc0ccf` (2026-10-22)  
**Delivery:** one ticket, **one PR** (this docs-only draft becomes the implementation PR). No implementation PR or technical-layer tickets.

## Readiness / decision log

- **Chosen:** four new authored scenarios, extending the existing pure metric engine, scenario command dispatcher, strict codec and catalog.
- **Chosen:** selective seeded rivals and only four recurring-route commands; existing scenario content validator and controller remain authority.
- **Chosen:** no scenario-specific simulation code, scripted events, new UI shell, extra save schema or new art/SFX.
- **Calibration blocked pending HPA-502 reconciliation:** Linear status is Done and PR #65 merged, but `docs/balance/after.md` does not exist on main and the PR's file list lacks economic tuning, production manager cap, structural forecast revision and launch-scenario recalibration. Confirm and finish that prerequisite *under HPA-502*, or explicitly decide the current economy is the accepted baseline before setting HPA-511's numeric targets. Do not quietly swallow tuning into this PR.
- **Open for measured refinement within this PR:** exact opening balances/inventory, day limits (14–28), score bonus shapes and thresholds, relevant seeded rival, debt due-date override necessity, route starting cities/material. Record these choices after testable reference traces, not as prematurely fixed numbers.

## Work breakdown (staged commits in the same PR)

### 0. Baseline, contract audit, dependency gate

1. Re-read `CLAUDE.md` and scenario design from July 2026, plus current `catalog.ts`, `types.ts`, `runtime.ts`, `setup.ts`, `metrics.ts` and `scenarioCodec.ts`. Capture current main HEAD when coding begins.
2. Verify merged HPA-502 scope against its checklist. Keep the **Calibration baseline** section of PR #66's description as the auditable gate: initially **Pending**, `main@5fc0ccf`, reviewed 2026-10-22. To unlock stage 6, record decision date, accepted economy commit SHA, and either HPA-502's accepted `after.md` or an explicit decision to treat current main as final. Mark the section **Accepted** only after that evidence exists; until then leave the checklist unchecked. **No medal calibration before that decision.**
3. Run baseline focused specs (`catalog.spec.ts`, `runtime.spec.ts`, `metrics.spec.ts`, `validation.spec.ts`, `scenarioCodec.spec.ts`). Confirm the three existing official seeds and reference traces; do not change them here.

### 1. Metrics end-to-end, test-first

1. Expand the `ScenarioMetricQuery` tagged union in `src/lib/scenarios/types.ts` with debt, missed payments, waste units/share, player share and delivered transfer units.
2. Write metric fixtures/specs for current-state debt + lifetime missed count (including paid/refinanced loans), report-window aggregation, zero receipts, demand-weighted multi-report share, delivery on arrival day, stable evidence IDs and complete/incomplete trailing windows.
3. Implement narrowly in `src/lib/scenarios/metrics.ts` using `getTotalDebt`, existing `LoanInstrument`, `DailyProductReport`, `DailyMarketReport` and `DailyLogisticsReport`. Reuse report filtering/evidence helpers, avoid new state.
4. Update `src/lib/scenarios/validation/shared.ts` (`METRIC_WINDOWS` / product metric categories) and `validation/conditions.ts` for exact query keys, product scope, supported windows and nonempty product IDs; add invalid/unknown/wrong-window test cases.
5. Update `src/lib/persistence/scenarioCodec.ts` for strict decode/encode query support and **compile-time exhaustiveness** of both scenario IDs and metric IDs. Update codec/repository tests for round trip + unknown metric rejection. Update `src/lib/i18n/scenarioCopy.ts` for currency, ratio and integer formatting. Run focused server specs before continuing.

**Watch-outs:** `daily-net-income` is already an operating-cash-flow projection; don't reinterpret it to build a new P&L engine. `product-waste-share` denominator is actual report receipts only: scenario's counted product starts at zero stock. Require separate sales volume for success. `delivered-transfer-units` is all arrivals generically; prohibit manual dispatch in the route challenge so a win proves recurring transfer activity.

### 2. Opt-in authored competitors, test-first

1. Add an optional typed retail `competitorCityIds` start override to `types.ts`, `validation/shared.ts` and `validation/start.ts`; reject duplicate, non-retail, not-opened or not-allowlisted cities.
2. Replace `setup.ts`'s unconditional final `competitors: []` with default empty plus selective `ensureCompetitorsForRetailCity` calls *after* world/city/store materialization. Prove fixed seed+setup yields identical generated rivals and that none overlap the founding footprint.
3. Preserve all prior rival-free scenarios. Update `setup.spec.ts` / `validation.spec.ts`. Amend `docs/superpowers/specs/2026-08-20-living-market-brands-competitors-design.md` only to clarify this now-supported authored opt-in; do not alter sandbox rival behavior.

### 3. Recurring-route scenario command bridge, test-first

1. Add `createRecurringRoute` / `updateRecurringRoute` / `pauseRecurringRoute` / `resumeRecurringRoute` variants and corresponding kind IDs. Reuse `RecurringRouteInput` and `RecurringRouteUpdateInput` types; ensure incoming untrusted payloads are checked, not just TypeScript-cast.
2. Extend the static allowed-command definition validation in `src/lib/scenarios/validation/commands.ts`, and put **stateful route-command** validation in `src/lib/scenarios/capabilities.ts` (`isScenarioCommandAllowed`, with access to `run.game`). For both route create/update, compare `leadTimeDays` and `transportCostPerUnit` **exactly** to `quoteInterCityRates(originCityId, destinationCityId)` from `game/interCityLogistics.ts`; reject invalid pairs or mismatched payloads before the transition runs. Do not put game-aware quote checks in the static definition validator. Keep `capacity`/`frequencyDays` player-configurable and reuse existing domain bounds/stock/payment rules. No change to sandbox's editable route economics. Cover correct quote acceptance, manipulated lead time, manipulated freight rate, update with changed cities, forbidden/invalid cities, and rejected-command immutability.
3. Extend `applyGameCommand` / the existing dispatcher in `runtime.ts` with the four genuine `interCityLogistics.ts` transitions; preserve typed error-to-rejection conversion (including route-not-found). Assert rejected input never changes persisted run or day.
4. Attach `scenarioCommand` to matching existing controller methods in `src/routes/gameRouteController.ts` so scenario mode goes through `commitMutation` and its persistence gate. Break blanket `manageLogistics` into only the minimum granular flags required by the current panel/hosts; manual dispatch, remove and reprioritize remain sandbox-only unless separately justified. Ensure read-only logistics details are visible in scenario play.
5. Add focused `runtime.spec.ts`, `capabilities.spec.ts`, `commandGate.spec.ts`, controller specs and affected Svelte component specs. Avoid adding a second operations UI or logistics state owner.

### 4. Author and validate all four definitions

1. Use existing `catalog.ts` conventions: four IDs, version 1, seeds `280_004` through `280_007`, 14–28 day limits, score 500 base + exactly 500 possible bonus points, minimum Bronze 500 and calibrated Silver/Gold.
2. Register IDs in `types.ts`, `shareCode.ts`, `scenarioCodec.ts` and `ALL_DEFINITIONS`. Update seven-scenario fixed expectations in `catalog.spec.ts`, `scenarioCodec.spec.ts`, `scenarioRepository.spec.ts`, `scenarioCopy.spec.ts` and `ScenarioCatalog.svelte.spec.ts`. Compute expected share codes with the existing encoder (never guess checksums).
3. **Debt Turnaround:** first test whether `overrides.debt` plus normal loan commands supports a near-due payment. Add a narrowly constrained founding-loan date/term override only if necessary, with validation/codec tests for starting state. No new loan subsystem.
4. **Fresh Market:** choose a grocery product actually available to the starting store, with zero initial counted stock; assert the normal replenishment/waste lifecycle produces report evidence. Tune sales/waste ratio only after obtaining a legal profitable reference trace.
5. **Rival Next Door:** pick official seed with a relevant rival product focus; prove market share actually changes via real simulated competition. Require complete trailing window and positive performance.
6. **Two-City Supply Run:** use `world`, `industrialBuildings`, `cityInventoryMaterials` start overrides to open and provision producer/source in a second industry city. Create a recurring route through the real UI/command. Count delivered arrival quantities only; ensure lead time fits deadline. No forced event or manual transfer shortcut.
7. Keep all three original definitions unchanged; no edits to their rules/version in this ticket.

### 5. Localization and in-game affordances

1. Add every title, summary, briefing, hint, objective and failure key under `scenarioDefinitions` to `src/lib/i18n/messages/en.ts`, `ja.ts` and `zh-Hant.ts`; run translation-key parity tests.
2. Reuse existing Scenario Catalog, briefing, objective progress and result UI. Gate route write controls per actual allowed command; unsupported controls disabled/hidden with non-color status.
3. Verify keyboard focus and a narrow viewport. No icons, illustration prompts, audio work or separate art-generation ticket required.

### 6. Calibrate, verify and finish in the SAME PR

**Blocking precondition:** The PR body must have a completed **Calibration baseline** decision (accepted economy SHA, decision date, and HPA-502 after-report or explicit acceptance of current main). If that section remains Pending, stage 6 must not begin. Stages 1–5 can proceed independently.

1. Record one reproducible **advance-only** command trace for each new official seed and assert its medal is *below Silver*. Prefer no-action run to deadline rather than merely a fail outcome; if no-action can win a medal, change authoring conditions/thresholds based on evidence.
2. Record one **legal, documented command trace** for each seed that earns **Gold** without direct game-state mutation/test-only cheaters. Keep reference scripts inside existing scenario runtime specs or a focused shared test utility (not a new automation engine).
3. Fix any unreachable win objective (e.g. produce never replenishes, rival generated with irrelevant focus, transfer arrives after deadline) by refining the authored start or objective; do not patch the real engine to cheat.
4. Assert byte-for-byte deterministic replay where feasible, identical setups and terminal results, accurate report evidence, valid codec save/resume and correct eligibility/share-code behavior.
5. Focused E2E: start one advanced scenario, see briefing + objectives, perform real actions, advance to terminal outcome/result. Existing First Profit / Import Squeeze / Local Lifeline E2E and their reference paths must still pass.
6. Run `bun run check`, `bun run lint`, `bun run test:unit -- --run` and affected Playwright tests. Include an implementation summary, official reference command sequences and calibration table in PR body. No separate docs/implementation PR.

## Definition of done

- Seven selectable, localized, immutable current-version definitions; existing three unchanged.
- New query kinds work across type union, evaluator, validator, window rules, serialization, display formatting, and focused coverage.
- Finance, waste, rivals and logistics challenges are playable via real transitions, not scripted simulation shortcuts.
- Four official seeds: deterministic no-action below Silver and reference Gold (with exact conditions/thresholds preserved in tests).
- No new visual assets; no extra gameplay framework; no persistence migrations.
- Full check/lint/unit + relevant E2E green, then change this existing draft PR to ready for review.

## Review checklist (planning checkpoint)

- [ ] PR #66 **Calibration baseline** is Accepted, with dated decision, pinned economy SHA, and HPA-502 after-report or explicit main-as-baseline acceptance (blocks stage 6)
- [ ] Agree with metric denominator/window definitions and necessary route command scope
- [ ] Verify scenario rival-seed and route availability with fixture-level tests during implementation
- [ ] Avoid splitting this ticket into multiple PRs
- [ ] Complete implementation and documented four-seed reference traces before marking ready
