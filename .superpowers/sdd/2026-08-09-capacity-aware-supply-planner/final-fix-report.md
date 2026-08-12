# HPA-281 final-review fix report

Baseline: `c5e5284` (`test(supply): cover planner category retention`).

## Scope

- `primaryBottleneck` now treats a supported required material with zero installed producers as `missing-producer`, preserving deepest-chain and code-unit tie ordering. The actions layer now consumes the projection contract directly; its private bottleneck override is removed. Pantry regressions cover both projection and plan selection of upstream Grain.
- Planner category derivation is scoped to the active retail city through `listSupplyPlannerCategories`, then intersected with scenario-allowed product IDs. Open/select/fallback, Supply Advisor props, and Product Chains handoff use the scoped list while global category IDs remain available to unrelated UI. A multi-city route regression covers a category carried only by another city.
- Supply Advisor candidate keys use stable action identity fields, including building IDs for upgrades. The displayed alternatives filter removes the winning recommendation and hides the section when empty. Identical upgrade candidates have component coverage.
- Complete `/ day` and `/ unit` metric values are message-backed in EN, JA, and zh-Hant with locale parity and visible Japanese localization coverage.
- A tied-upgrade regression reverses industrial-building source order and asserts the same ID-sorted candidate wins.
- The planner warehouse browser smoke assertion now reflects the active-city category ordering (`bottled-water`).

No HPA-297 logistics implementation or compatibility aliases were added.

## RED evidence

The new regressions were observed failing before the fixes:

- Pantry with no producers reported `production-capacity` instead of upstream Grain `missing-producer`.
- The route multi-city test could not resolve the new scoped-category helper before implementation.
- Rendering two same-type, same-level upgrades threw Svelte `each_key_duplicate` for the repeated label.
- Alternatives displayed the recommendation itself when it was the only candidate instead of hiding the section.
- Japanese Supply Advisor output still contained the English `/ day` and `/ unit` suffixes.

The existing `supply planner warehouse` browser test also exposed the intended category-order contract after route scoping: its stale initial `snacks` assertion received `bottled-water`; the assertion was updated and the test then passed.

## GREEN evidence

- `bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server` — 2 files, 32 tests passed.
- `bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client` — 14 tests passed.
- `bun run test:unit -- src/routes/page.svelte.spec.ts --run --project client` — 34 tests passed.
- `bun run test:unit -- src/lib/i18n/locales.spec.ts --run --project server` — 15 tests passed.
- `bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts --run --project client` — 17 tests passed.
- `bun run check` — 0 Svelte errors and 0 warnings.
- `bun run lint` — Prettier check and ESLint passed.
- `bun run test:unit -- --run` — 153 files, 3,310 tests passed. Existing mocked-Phaser `console.error` messages remain expected test noise.
- `bun run build` — passed. Existing large-chunk warnings remain informational.
- `bunx playwright test src/routes/retail-sim.e2e.ts -g "supply planner warehouse" --config=/private/tmp/serpens-playwright-4174.config.ts` — 1 passed on an isolated preview at `127.0.0.1:4174`.
- `git diff --check` — passed.

The canonical Playwright command could not start because an unrelated Gliese preview owns `localhost:4173`; no unrelated process was terminated.

## Svelte tooling

Official Svelte MCP `list-sections` was called first and relevant `$state`, `$derived`, `$props`, markup, `$effect`, testing, and TypeScript documentation was fetched before editing. `svelte-autofixer` reported `issues: []` for both edited components (`SupplyAdvisor.svelte` and `+page.svelte`). It retained one pre-existing non-blocking `$effect` suggestion in `+page.svelte` for the audio controller; no planner-related suggestion remained.

## Commit

`fix(supply): close HPA-281 final review findings` (final branch commit; see `git log -1`).

## Concerns

- The build continues to report existing >500 kB chunk warnings.
- Browser verification uses the alternate preview port only because port 4173 is owned by another worktree; the route test itself passes.
