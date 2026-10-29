# HPA-318 — Sandbox Long Game Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-318/progression-give-the-sandbox-a-long-game-with-company-value-and-a-goal  
**Design:** `docs/superpowers/specs/2026-10-28-sandbox-long-game-design.md`  
**Branch / PR:** `docs/hpa-318-sandbox-long-game` · **single PR for this ticket**  
**Status:** planning checkpoint — runtime work has not started; no test outcomes implied

## Goal and scope discipline

Deliver one vertical sandbox progression feature, end to end: book-value calculation, five metric-backed tiers, persistent claims and earned cap/credit rewards, Dashboard UI, tri-language copy, deterministic calibration and tests. The PR remains draft until the complete implementation passes verification; do not create extra PRs per phase.

Do not install a new state machine, telemetry/achievement framework, asset ledger or backend. No new art, audio, city or resale path. Pre-release saves do not receive compatibility adapters.

## Step 0 — Baseline and legal command survey (no throwaway fixture)

Read implementation HEAD, not just the original HPA-318 baseline: `world.ts`, `state.ts`, `finance.ts`, `simulateDay.ts`, `scenarios/metrics.ts`, `saveCodec.ts`, `scenarioCodec.ts`, `scenarios/setup.ts`, `scenarios/validation.ts`, `gameRouteController.ts`, `tests/balance/bots.ts`, `docs/balance/after.md` and the existing objective presenter.

Inspect the existing legal `applyGameCommand` vocabulary and record the proposed opt-in progression bot policy (city-opening timing/eligibility, store upgrade priorities and cadence, borrowing rules, staffing/delegation, planner cadence, action order and deterministic tie breaks). The current `advisor` bot cannot open a world city or upgrade a store; that fact is directly visible in `tests/balance/bots.ts` and **does not require a fixture that tests the test bot**. Keep all three existing HPA-502 bots, commands, economic tuning and baseline artifacts unchanged.

**Gate:** baseline invariants read, legal command set identified, proposed policy and candidate goal table documented. There is no claimed passing pacing yet.

## Step 1 — Pure company book value + hand fixture

**Files:** `src/lib/game/companyBookValue.ts` and specs; catalog modules read-only.

Implement a deterministic `getCompanyBookValue(game)` with a testable breakdown: `{total, cash, retailAssets, cityAccessAssets, industryAssets, railAssets, inventory, debt}`.

- Founding `store-1` contributes **zero setup cost**. Remaining stores use `getExpansionSetupCost` from their current tiles/archetypes; sum completed store-level upgrade costs.
- Count `openingCost` from `WORLD_CITY_CATALOG` for each **opened nonstarter city** as an owned city-access right; not for starter/unopened cities. Verify buying city access exchanges cash for equal asset value (no phantom income/refund).
- Count only surviving industry buildings and rail cells plus their completed upgrades. Use existing build/upgrade cost catalogs.
- Use **flat catalog `importCost`** for product lots, city materials and industrial buffers. Only `TransferOrder.status === 'in-transit'` contributes transferred material `quantity`; delivered orders contribute none. Verify dispatch removes these same units from the origin to avoid counting them twice. No branded-cost resolver or separate stock ledger.
- Subtract `getTotalDebt` once and preserve negative value; loan +cash/−debt must be net-neutral.
- Preserve the design's **$55,705** hand fixture (it has no paid city opening). Add paid-city neutrality, zero-history, max levels, demolition, transfer lifecycle and loan fixtures. Assert immutability and deterministic repeatability.

**Gate:** passing focused valuation specs, no ambiguous inventory ownership, no unintended mutation.

## Step 2 — Daily report snapshot + exactly three shared metrics

**Files:** `types.ts`, `simulateDay.ts`, `scenarios/types.ts`, `scenarios/metrics.ts`, `persistence/saveCodec.ts`, specs and report fixtures.

- Add required `DailyReport.companyBookValueAfter` once on the **post-finance** closing state, next to cash/principal fields; validate it as a finite integer and decode with existing report handling. Never introduce a second history array.
- Extend `METRIC_REGISTRY` / query union with `max-store-level`, `opened-city-count` and `peak-company-book-value` only. The peak is a run-to-date maximum of validated daily reports; do not register a live `company-book-value` metric.
- Export existing `evaluateCondition` from `scenarios/metrics.ts` so progression reuses the **same comparator and complete-window rules**. No second objective engine.

**Gate:** metric/window tests pass; all seven existing scenario definitions still validate and score identically; report snapshots match actual post-service state.

## Step 3 — Pure tiers, receipt claims and the existing cap transitions

**Files:** `src/lib/game/progression.ts`, `types.ts`, `state.ts`, `routes/+page.svelte`, scenario setup initialization and focused specs. **Do not modify `game/world.ts`.**

- Define five immutable `PROGRESSION_TIERS` with 2–3 monotone `ScenarioCondition[]` goals each, stable IDs, labels and a uniform +1 store capacity / +$25k underwriting-base + hard-ceiling reward. Existing `store-count` and `retail-local-units` metrics are reused; progression evaluates goals with exported `evaluateCondition`.
- The first candidate peak target is **$70k**, not $20k. Verify it exceeds all initial book values/no-management day-one peaks across calibration archetypes/seeds; adjust during Step 4 as measured. All other numeric goals stay provisional until calibration.
- Initialize `GameState.progression.claims` to `[]` in sandbox, starter-map and scenario states.
- `claimEarnedTiers(game)`: append **only newly eligible contiguous-prefix** `{tierId,claimedOnDay}` receipts; advance `storeCap` by **exactly the number of newly appended claims**, using the existing `game.storeCap` as the base. Append once-only localized system notices per new claim. When nothing is newly eligible, return the original reference.
- Leave `openWorldCity` and `refreshWorldProgress` unchanged; their incremental changes preserve authored `storeCap: 1` in scenarios. Never compute cap from a sandbox starter constant, require cap equality, or add a mode flag.

**Gate:** ordering, repeat-call reference stability, multi-claim and multi-transition cap tests; scenario world-open/milestone still respect custom cap. The tier transition is testable without a browser.

## Step 4 — Progression bot and **multi-seed calibration before UI** (blocking gate)

**Files:** `tests/balance/bots.ts` (new opt-in bot only), focused specs and `docs/balance/progression-calibration.md`.

- Add the smallest deterministic progression-capable strategy to the existing harness. Use **legal `applyGameCommand` operations only** for city opening, store upgrading, staffing, expansion, supply management and credit. After **every successfully applied command**, including `advanceDay`, call the production `claimEarnedTiers(transition.game)` (same semantics as the eventual sandbox route commit). Never reproduce claim rules or edit synthetic state to award tiers; leave the original HPA-502 bots untouched.
- Retain ticket seed **20260503** as the named, detailed 365-day acceptance trace. Also run **50 seeds × four archetypes (200 progression runs)** with a corresponding **50-seed idle negative-control set** (cover each archetype if practical). The baseline after-sweep ran 450 traces in ≈3 minutes, so prefer this affordable distribution to one-seed threshold fitting; record actual runtime instead of promising it.
- For each tier, record reached count / total, **p10, median and p90 claim day among reached runs**, with never-claimed runs reported distinctly; include blockers, seed-level outliers, final book value and any observable effect of extra credit capacity on lending/borrowing. Require **zero idle claims across all tested seeds**. Show tier-3 day ~120 and final days 250–365 **only if supported**; otherwise revise goal targets and document deviations, not the settled simulation economy.
- The committed calibration doc must contain **bot policy + action trace + seed definitions + per-tier completion distribution + blockers/credit impact**. Verify the first peak target is not a decorative founding-cash goal. Fix and freeze authored goals **before** UI, translation, persistence proof fixtures and E2E.

**Gate:** measured, reviewable reachability across seeds/archetypes; reference and idle behavior documented. If the final tier is unreachable, retain draft status with the blocker. Do not proceed to UI as if pacing passed.

## Step 5 — Sandbox route/save wiring and credit underwriting

**Files:** `src/routes/gameRouteController.ts`, `src/lib/game/finance.ts`, `src/lib/persistence/saveCodec.ts`, scenario codec regression specs and test fixtures. Shared world transitions and scenario validation API stay untouched.

- The single sandbox command boundary is `commitMutation`. **After** `normalizeRouteTransition` accepts a command, call `claimEarnedTiers(transition.game)` **before** `runImmediateSandboxOperation`. Use that transformed game consistently for publishing, autosaving and `onAcceptedGameChange`. The scenario branch must not claim anything. This includes `advanceDay`, a mid-day store purchase and founding.
- Adjust **both** lending terms in `finance.ts:assessCredit`: `underwritingBase = 15_000 + 25_000 * claims.length` and `hardLimit = 100_000 + 25_000 * claims.length`. Continue the existing health/history, repayment-service, outstanding-principal and delinquency constraints; do not hand out cash or an automatic loan. Tests show limits can improve but borrowing can still be denied. In UI say **underwriting base increase / higher possible credit**, never guaranteed available credit.
- Keep `validateCurrentGameState` shared between sandbox and scenarios. Only **receipt shape** is checked there: valid catalog IDs sourced from `PROGRESSION_TIERS` (not a duplicated list), no duplicates/skips, claim days integers within `[0, game.day]`; preserve the existing `storeCap >= stores.length` and world fixed-point checks.
- In **`validateSaveRecordInternal` only**, after decoding historical reports through the shared validator, enforce `claimEarnedTiers(game) === game` and rerun each claimed tier's monotone goals with the shared evaluator. Reject forged/unearned or missing-evidence claims; do not auto-repair. Scenarios use `validateCurrentGameState` directly, not `validateSaveRecordInternal`, so there is **no context param** and authored caps stay valid.
- Update required schema/fixtures (pre-release, no migration). Preserve `revealCityAndGrantFunds` E2E test helper that legitimately sets a custom cap. Verify cap-1 scenario open/milestone, same-commit cap changes, reports decoder dropping malformed evidence, and exact-once reward after reload.

**Gate:** sandbox autosave/manual-save and resume remain valid; incorrect receipts rejected; scenario setup/save/resume/results unchanged; existing custom-cap fixtures work.

## Step 6 — Reused objective panel, Dashboard and localized notices

**Files:** `src/lib/components/game/ScenarioObjectivePanel.svelte`, `src/lib/i18n/scenarioCopy.ts`, `src/lib/components/game/SandboxProgression.svelte` (thin header/container), `src/routes/ManagementPanelHost.svelte`, `src/routes/+page.svelte`, locale files and specs.

- Live Dashboard headline reads `getCompanyBookValue(game).total`, formatted by existing `i18n.format.currency`. Show tier title, actual/target evidence and +1 cap / increased underwriting-base reward.
- **Reuse `ScenarioObjectivePanel` directly** with `{required: tierRows, optional: [], failures: [], deadlineLabel: null}`, instead of duplicating row markup. Give it optional `requiredHeading` and root `id` props with **unchanged scenario defaults**; reuse/export `conditionViews` from `i18n/scenarioCopy.ts`. Use distinct sandbox root ID; empty sections stay hidden, optional deadline stays absent.
- Render ladder only when `playMode === 'sandbox'`. Keep scenario UI and scoring unchanged. Use existing nonblocking system-decision acknowledgement for one-time notices; the final summary shows claim day, peak and cap but **no redundant Continue playing action** (play never ends).
- Add en / ja / zh-Hant strings for titles, goal labels, statuses and notices. Keep color-independent status labels, keyboard access and compact layouts; no art/SFX, no new management tab.

**Gate:** component and visual checks pass, no duplicate IDs, no scenario objective regressions, language parity.

## Step 7 — Integration E2E, docs and full verification

**Files:** closest existing `src/routes/retail-sim.e2e.ts` / time-flow journey, `CLAUDE.md`, test fixtures.

- E2E: found sandbox, achieve first tier via real commands and day settlement, observe one notice and +1 cap, save/reload and retain claim; verify all seven scenario starts/round trips preserve authored cap and hide ladder. Include a scenario city opening and milestone path; existing `revealCityAndGrantFunds` helper must still work.
- Check daily book-value snapshots, city-access valuation, in-transit no-double-count, lending-denial protections, report validation, the stored report-based peak, missing-claim fixed-point, and after-sweep HPA-502 regression. Verify scenario scoring/allowed actions remain unchanged.
- Fix stale `CLAUDE.md` `MAX_STORES` language to document **incremental world bonuses plus per-tier store-cap grants**, not a derived formula.
- Run focused checks at each green commit and finish with:

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
git diff --check main...HEAD
```

**Gate:** no test failure or unresolved threshold/blocker; only then mark **this same PR** ready. **No tests have been run in this docs-only review checkpoint.**

## Review/implementation risks and resolutions

| Risk | Containment |
| --- | --- |
| Scenario `storeCap: 1` overwritten by sandbox-derived cap | Do not change shared `world.ts` increments or add strict derived-cap equality; claim rewards increment only on newly appended sandbox receipts |
| Bot tests claim rules that the route never executes | Both the opt-in harness and sandbox `commitMutation` call the **same** `claimEarnedTiers` after every legal command, including `advanceDay` |
| Reachability discovered after UI/i18n build | Run the seed-20260503 trace and 200-run four-archetype distribution **before** wiring/UI; document completion rates, quantiles and negative controls |
| $25k only on the faraway hard ceiling has no effect | Raise underwriting **base** and hard bound; preserve service, health, history and delinquency checks; measure actual loan impact |
| City opening reduces value despite being required | Capitalize the durable city-access right at catalog `openingCost` in the game-value proxy; paid opening is cash/asset neutral |
| Founding cash satisfies a decorative tier-1 value requirement | First candidate $70k and explicit comparison with maximum no-management/founding values across archetypes/seeds before freezing |
| Historical reports dropped by decoder | Save-record proof after report decoding; claims never satisfied by missing report snapshots |
| In-transit stock double counted | `TransferOrder.status === 'in-transit'` and `quantity` define outstanding owned stock; ensure source inventory was decremented on dispatch |
| Extra UI presentational code | Reuse `ScenarioObjectivePanel` with optional heading/root ID and existing `conditionViews`; dismiss final notice to continue |
| Save replay or manual cap fixtures regress | Shared receipt-shape validation, sandbox-only fixed-point/evidence check; keep original min-store-count cap invariant and scenario codec unchanged |
| Existing advisor bot lacks world-opening/upgrades | Separate legal-command progression bot, documented action policy and fixed seeds; do not change existing bots |
| Expansion/setup amounts are not historically persisted | Be explicit: current-cost **book-value proxy**, not GAAP balance sheet or sales value; no historical asset ledger |

## PR review checkpoints, not extra PRs

1. **Current:** revised design and plan, **no runtime changes**.
2. **Domain:** valuation, report, three metrics, tiers/claims, focused green tests.
3. **Calibration gate:** policy plus seed 20260503 and 50-seed × four-archetype measured distribution; thresholds frozen.
4. **Integration:** sandbox-only route/save/credit wiring, reused objective panel, Dashboard/locales, browser regression.
5. **Readiness:** full verification, after-sweep stability and scenario acceptance; mark **this PR** ready only when the measurements support it.

This work is complete only when every acceptance gate in the revised design document holds; do not split design/domain/UI into separate tickets or PRs.
