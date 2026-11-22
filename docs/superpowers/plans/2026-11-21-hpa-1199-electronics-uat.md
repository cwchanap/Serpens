# HPA-1199 — Electronics UAT Fixes: Single-PR Implementation Plan

**Linear:** https://linear.app/cwchanap/issue/HPA-1199/bug-fix-empty-shelves-store-morale-save-resume-and-ui-bugs-found-in  
**Design:** `docs/superpowers/specs/2026-11-21-hpa-1199-electronics-uat-design.md`  
**Roadmap:** HPA-717. **Deferred, not included:** HPA-1147.  
**Branch:** `docs/hpa-1199-electronics-uat-fixes` -> `main`; **one PR for design + implementation + tests + evidence**. Do not open another implementation PR for this ticket.  
**Inspected base:** `main@0c7f81507398ffe829878956fcae30f8fdfb0fb8`, 2026-11-21.  
**Current state:** spec and plan only. No implementation, screenshot verification, balance results or passing tests claimed.

## Delivery rules

Use KISS/YAGNI: fix the existing stock/replenishment, staff, save and presenter paths. Avoid new frameworks, global stores, hardcoded archetype branches, extra tickets, compatibility migration, or economy-wide retuning. Reuse existing Svelte components/styles and HPA-719 electronic-accessories PNG; **no new art/SFX production**. Keep this same PR draft during implementation and the required economy review.

Group work into reviewable commits **inside this PR**. Before changing code, re-read the updated `main` and rebase if needed; use measured behavior to choose stock values rather than setting a speculative hardcoded 600. Stop and revise this plan in-place if a source-contract mismatch is found.

## Step 0 — Pin baseline and reproduce defects

- [ ] Confirm starting SHA and inspect `CLAUDE.md`, `stock.ts`, `retailSupply.ts`, `simulateDay.ts`, `staffing.ts`, `gameRouteController.ts`, `saveUi.svelte.ts`, `+page.svelte`, relevant components, localization and existing tests. Preserve only current-schema save support.
- [ ] Reproduce default Harbor City electronics opening at tile (32,20), seed `20260503`, 28 days; record revenue, zero-revenue days, in-stock days, stockout-lost demand, paid import units/spend, cash and daily balance. Confirm the ticket's historical 20/28 zero-revenue reference or record any legitimate SHA-specific discrepancy.
- [ ] Pin a fully staffed default-policy 60-day/205-day morale trace alongside the employees' morale; capture a current staffing-shortage case and the scorecard-versus-daily-income example.
- [ ] Reproduce saved-game reload and fresh-install founding separately in a browser. Capture the relevant UAT UI at 1440px plus a narrow viewport; use screenshots already attached to HPA-1199 as references.
- [ ] Capture **same-source** baseline Gate A and 50-seed progression output, with all four archetypes, using the commands in Step 6. Preserve raw generated JSON outside tracked source; report the summarized baseline in `docs/balance/hpa-1199-uat-evidence.md` when final comparison is available.

**Gate:** baseline source and reproducible defects recorded; none of this is a claim of implementation correctness.

## Step 1 — Fix inventory cadence and policy application

**Existing paths:** `src/lib/game/stock.ts`, `retailSupply.ts`, effective policy resolution (`policyInheritance.ts` and `simulateDay.ts`), `stockRecovery.ts`, related `*.spec.ts`.

- [ ] RED tests: a founder's first seven days, two full later import cycles, default/on-hand coverage for each archetype, and current-vs-last-day stockout status; probe the seeded Harbor electronics case.
- [ ] Implement minimally larger/demand-aware initial lots, reorder thresholds and default target quantities that can cover one seven-day import cycle. Derive a bounded, deterministic amount from real product demand/capacity and preserve explicit user edits. Avoid duplicating the weekly interval in conflicting modules or introducing circular imports.
- [ ] Make `lean`, `balanced` and `generous` inventory policies change the **effective refill quantities**, including scoped store policy overrides. Test monotonicity (Lean < Par < Deep where budget and caps permit), manual product-level custom target persistence, production-supported supply, import fallback, insufficient funds, and unchanged stock accounting.
- [ ] Fix the forward-looking coverage warning using existing stock recovery/status read models. UI should clearly distinguish “stock on hand now” from a prior day's stockout stamp; show shortage before next check instead of “Healthy”.
- [ ] Record focused before/after 28-day numbers. A candidate that buys more stock by breaking cash accounting, balance Gate A or scenario outcomes is rejected/revised **within this PR**, not disguised by HPA-1147 tuning.

**End-to-end check:** policy change -> daily simulation/replenishment -> actual stock receipt -> future sales -> readable store warning, with no forced inventory duplication.

## Step 2 — Fix morale and staffing behavior

**Existing paths:** `simulateDay.ts`, `staffing.ts`, `StoreOverview.svelte`, `StaffPanel.svelte`, `TileInspector.svelte`, their specs and locale strings.

- [ ] RED simulations: a default-policy fully staffed store with employees at 60–80 morale; shortage, low-morale staff, policy change, employee assignment and a store upgrade that raises staffing requirements.
- [ ] Remove the unconditional `-3`-per-day morale drain. Use a simple, clamped adjustment towards actual assigned morale and existing policy/manager effects, while keeping specific shortage and overload penalties meaningful. Assert deterministic 60+ day traces, staff/sales capacity and scorecard behavior.
- [ ] Derive immediate warnings from **current** `summarizeStoreStaffing` requirements in `StoreOverview`, rather than only using the latest completed `report.warnings`. Deduplicate warnings when the report already contains the same shortage. Preserve context/locale.
- [ ] On hire, choose an eligible store missing that role; prefer existing relevant staff-panel selection if available and otherwise stable store order/ID. Auto-assign in `staffing.ts` in the same immutable transition, not a second UI command. If full, keep Unassigned. Test role and multiple-store ties, no extra salary/duplicate hire, manual reassignment and scenario command paths.
- [ ] A successful store upgrade acknowledges the **new** required staff in the existing inspector feedback and live warning; do not announce extra need for a rejected/no-op upgrade.
- [ ] Make same-batch candidate display names unique using deterministic generation with a bounded collision fallback. Remove internal IDs from hire accessibility labels in EN/JA/zh-Hant, while retaining internal IDs as React/Svelte keys and command payloads.

**End-to-end check:** open a second unstaffed store -> immediate warning -> hire manager and general staff -> automatic assignment and changed coverage -> upgrade -> visible new shortage -> hire again -> morale stabilizes over days.

## Step 3 — Fix launch/resume without destructive writes

**Existing paths:** `src/routes/+page.svelte`, `saveUi.svelte.ts`, `gameRouteController.ts`, save repository and current page/menu confirmation patterns.

- [ ] RED browser/controller tests: fresh no-save startup; valid day-N autosave at reload; stored autosave with a different active scenario; corrupted/unavailable read; explicit start-over cancel/confirm; quick reload before save completion.
- [ ] Reuse `initializeSaves` / `resumeAutoSave` and normal startup wiring. When a valid sandbox autosave exists, adopt it **before** showing interactive founding and before any auto-write could replace it. Remove reliance on `?ui-comparison=1` for normal resume while preserving the comparison test's selection behavior.
- [ ] Keep founding for genuinely empty stores. Make reset/new-game a user-initiated, confirmed action using existing dialog style and permission flow; cancel leaves state and stored save untouched. Do not invent a migration or change the manual-save format.
- [ ] If storage read fails, show existing save error/diagnostic and avoid writes that might erase the record; preserve scenario run/resume lifecycles. Maintain controller as owner of save mutations.

**End-to-end check:** create/advance/save -> reload -> same day, cash, stores and stock automatically visible -> cancel New Game and reload unchanged -> confirm New Game yields a fresh founding path; scenario save remains independently restorable.

## Step 4 — Fix existing UI, art and localization surfaces

Keep each change in its current owner, with nearby mounted Svelte tests. Use the Linear screenshots as the visual comparison set.

- [ ] **Product art:** `src/lib/assets/gameArt.ts` maps electronics `accessories` to the pre-existing `industry/materials/electronic-accessories.png`. Update asset mapping spec, ensure fashion accessories art unchanged; no new sprite.
- [ ] **Stock table:** `StoreStockTable.svelte` status/evidence wording matches the forward-looking coverage fix; make its horizontal scrolling or column reflow usable at 1440px so **LATEST** is visible/reachable and no data overlap occurs.
- [ ] **Industry inspector:** `IndustryTileInspector.svelte` gets only targeted wrapping/gap/min-width adjustment for long Accessory Assembly Plant names and eyebrow; no inspector redesign.
- [ ] **Build quick filters:** `BuildMenu.svelte` derives a small deterministic set from active stores' sellable/unlocked products (not `['snacks','soft-drinks','essentials']`), with an empty/founding fallback; retain full filter/search.
- [ ] **Industry header:** `TopBar.svelte` / `RouteHeader.svelte` derive three material readouts from nonzero city inventory and the products actually sold, avoiding the `grain/flour/oilseeds` default in electronics; retain useful empty-state behavior. Test electronics and convenience.
- [ ] **Localization/save title:** fill `game.managementPanels.logistics` in JA and zh-Hant. Use neutral “Saves” in EN and equivalent locale strings rather than “Desktop Saves” in a browser.
- [ ] **Scorecard:** add a deterministic regression for positive daily income after a run of poor scores. If computation is incorrect, correct it at source; otherwise clearly rename/describe the rolling `0–100` Profit *score* and show daily recorded income separately, with no false monetary implication. Keep scenario scoring stable.
- [ ] **Scenario results:** `ScenarioResultsDialog.svelte` / root scenario host use existing typography to distinguish title, outcome and medal and ensure terminal results obscure/hide the empty founding state; do not reintroduce a fake playable game.

**Visual check:** browser MCP renders at 1440px and narrower width; compare screenshots with HPA-1199 attachments for electronics purse, Store Stock table, manufacturing inspector, staff warnings, translated menu and challenge results. Verify no horizontal clipping or overlap and that screenshot content matches actual displayed data.

## Step 5 — Automated and MCP-driven end-to-end acceptance

Acceptance is **machine/visual verification only**; no human acceptance/sign-off checklist item.

- [ ] **Static and test suite:** `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:e2e` all green on final implementation head. No skipped tests or broad snapshot rewrites used to conceal behavior.
- [ ] **MCP browser E2E:** using connected browser automation/Playwright MCP, complete the fresh-found -> sell/refill -> policy change -> hire/assign -> upgrade -> warning -> reload/resume -> start-over cancel/confirm journey; inspect persisted game state, not only visual labels. A **single browser platform** is sufficient; no native Tauri acceptance required for these cross-platform changes.
- [ ] **Challenge E2E:** run a deterministic official scenario through completion, verify its objective/medal/report semantics unchanged, and inspect the results modal screenshot without the founding map behind it.
- [ ] **Visual MCP regression:** capture 1440px and narrow screenshots for stock table, two-line industrial inspector, electronics Build menu/material header, product icon, staffing panel, EN/JA/zh-Hant Logistics, Saves dialog and scenario results; compare to relevant Linear ticket screenshots (no separate UI mockup is supplied). Check no clipped LATEST, overlapping titles, wrong art or untranslated menu labels.
- [ ] **Stock and morale expectations:** first-cycle and subsequent-cycle defaults cover expected sellable demand up to scheduled refill under tested normal conditions; inventory policies materially change refill quantities; the Harbor 28-day case has fewer than the reported 20 zero-revenue days without hidden economy changes; a fully staffed default-policy 60+ day store does not drift to zero morale. Bad-policy/understaffing penalties still appear.
- [ ] **Coverage and feedback:** warnings appear immediately for newly opened/leveled stores; hiring auto-assigns to real vacancies; staff names are unique in the visible candidate list and hire labels have no IDs; source/replenishment and report terminology remains truthful.
- [ ] **Persistence:** no-save founding, valid autosave reload, cancelled new game and confirmed new game preserve/replace the intended save as expected; corrupt-load error cannot destructively auto-save over the last good record; scenario resume unaffected.
- [ ] **Balance Gate A:** `bun run balance` passes **5/5** on final HEAD (not just historic base). Existing official scenario/reference and no-action behaviors retain their intended contracts.
- [ ] **Progression measurement:** same 50 seeds × 365 days on both base and final HEAD. Evidence includes tier 1–5 reach **for each archetype**, median/quantiles of reach days, final cash per archetype/median/negative counts, plus overall sums and changes. Report electronics zero-revenue days, paid import spending and morale on the 28-day UAT seed separately; disclose any regressions instead of claiming full economy balance.
- [ ] **Documentation:** commit final `docs/balance/hpa-1199-uat-evidence.md` with exact HEAD/base SHAs, commands, before/after tabulation, known limitations and screenshot pointers. Final PR description links the spec, plan and evidence. `git diff --check main...HEAD` is clean.

### Reproducible balance commands

Run each command on the pinned base and separately on the same-source final implementation HEAD (isolated checkout/output directories; do not mix artifacts or mutate an active worktree during measurement):

```sh
bun run balance
bun tests/balance/progressionRun.ts --seeds 20260501..20260550 --days 365 --output <dir>
```

The historical HPA-1199 report from `main@0c7f815` says Gate A 5/5, tier 3 in 158/200, tiers 4/5 in 42/200 and 41/200 (boutique only), negative final cash in 189/200 and electronics median final cash −$51,464. **Re-run and label source**; do not treat these quoted values as the final after-fix result or a promise of profitability.

## Review hold point (outside acceptance criteria)

HPA-1199 calls for Hapadona to review measured before/after economy figures before merge. Preserve those numbers and keep the **single PR** in draft during review. HPA-1147 remains separate and in Backlog: no Harbor founding-economics, expansion/local-chain profitability or Tier-5 rebalancing work is authorized by this ticket.
