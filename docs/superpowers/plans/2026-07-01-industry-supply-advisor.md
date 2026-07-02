# Industry Supply Advisor + Recipe-Card Build Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the industry city legible — a demand-driven **Supply Advisor** that names the next building to build per finished good, and a **recipe-card build menu** that shows each building's inputs→output with availability — Part 4 of `docs/superpowers/specs/2026-07-01-game-hud-inspector-industry-ux-design.md`.

**Architecture:** A new pure module `supplyAdvisor.ts` computes, from `GameState`, an ordered per-finished-good chain of building steps (built / buildable / blocked) with the recommended next build, plus the set of currently-available materials. A new `SupplyAdvisor.svelte` overlay renders the checklist with one-click "Build". `BuildMenu.svelte`'s industry side gains recipe cards (inputs→output + availability + a "Starter" badge on Tier-1 buildings) and an "Advisor" entry point. `+page.svelte` wires it together and arms placement from the advisor.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Vitest (`vitest-browser-svelte` + node), Playwright.

## Global Constraints

- Svelte 5 runes only. Every Vitest test contains ≥1 `expect` (`expect.assertions(N)`).
- Reuse `frames.css` / `tokens.css`; no new palette/fonts. Material icons via `getIndustryMaterialArt` and building art via `getIndustrialBuildingArt` (both from `$lib/assets/gameArt`) — no new art assets.
- New overlay (`SupplyAdvisor`) OR-ed into `isMapPaused` and the `Escape` chain in `+page.svelte`.
- New pure module → `server` Vitest project; new component → `client`. Svelte MCP `list-sections`/`get-documentation`/`svelte-autofixer` on components.
- Independently shippable; does not depend on the Control-Desk or Shop-split plans. Additive `isMapPaused`/`Escape` edits.
- Commit after each green task. Work on a feature branch.

**Verified domain facts (from `src/lib/game/industry.ts`):** recipes are `{ inputs: MaterialQuantity[]; outputs: MaterialQuantity[] }`; building types carry `{ recipeId, requiredResource, tier (1|2|3) }`. Starter (Tier-1) finished producers: `water-bottler` (water→bottled-water), `produce-packhouse` (fruit→produce), `pantry-works` (flour→pantry). `water-pump`/`fruit-farm`/`grain-farm`/`flour-mill` are Tier-1 upstream. `getFinishedMaterialIdForCategory(categoryId)` (in `stock.ts`) maps a store product category to its finished `MaterialId`.

---

### Task 1: `supplyAdvisor.ts` — chain planner + availability

**Files:**
- Create: `src/lib/game/supplyAdvisor.ts`
- Test: `src/lib/game/supplyAdvisor.spec.ts`

**Interfaces:**
- Consumes: `INDUSTRIAL_BUILDING_TYPES`, `PRODUCTION_RECIPES`, `MATERIALS` from `$lib/game/industry`; `getFinishedMaterialIdForCategory` from `$lib/game/stock`; types from `$lib/game/types`.
- Produces:
  - `function getBuildingTypeProducing(materialId: MaterialId): IndustrialBuildingType | null`
  - `function getAvailableMaterialIds(game: GameState): MaterialId[]`
  - `type AdvisorStepState = 'built' | 'buildable' | 'blocked'`
  - `interface AdvisorChainStep { buildingTypeId: IndustrialBuildingTypeId; name: string; tier: BuildingTier; state: AdvisorStepState; isNextBuild: boolean }`
  - `interface AdvisorChain { finishedMaterialId: MaterialId; categoryName: string; tier: BuildingTier; steps: AdvisorChainStep[]; complete: boolean; nextBuildTypeId: IndustrialBuildingTypeId | null }`
  - `function buildSupplyAdvisor(game: GameState): AdvisorChain[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/game/supplyAdvisor.spec.ts
import { describe, expect, it } from 'vitest';
import { buildSupplyAdvisor, getAvailableMaterialIds, getBuildingTypeProducing } from './supplyAdvisor';
import type { GameState, IndustrialBuilding, Store } from './types';

function baseGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 1, rngState: 0, day: 1, cash: 0, debt: 0,
		policy: {} as GameState['policy'], scorecard: {} as GameState['scorecard'], world: {} as GameState['world'],
		storeCap: 5, cities: [], activeCityId: 'harbor-city', industryCities: [], activeIndustryCityId: 'industry-city',
		industrialBuildings: [], warehouse: { capacity: 0, materials: {}, overflowUnits: 0, overflowCost: 0 },
		stores: [], staff: [], hiringCandidates: [], decisions: [], reports: [], ...overrides
	};
}

function building(typeId: IndustrialBuilding['typeId']): IndustrialBuilding {
	return {
		id: `bld-${typeId}`, level: 1, typeId, cityId: 'industry-city', tileId: `t-${typeId}`,
		mapX: 0, mapY: 0, status: 'idle', lastProduction: [], producedTotal: 0, importedInputTotal: 0, blockedDays: 0
	};
}

function bottledWaterChain(game: GameState) {
	return buildSupplyAdvisor(game).find((chain) => chain.finishedMaterialId === 'bottled-water');
}

describe('getBuildingTypeProducing', () => {
	it('maps materials to the building that outputs them', () => {
		expect.assertions(2);
		expect(getBuildingTypeProducing('bottled-water')?.id).toBe('water-bottler');
		expect(getBuildingTypeProducing('water')?.id).toBe('water-pump');
	});
});

describe('buildSupplyAdvisor', () => {
	it('falls back to Tier-1 starter chains when there is no retail demand', () => {
		expect.assertions(4);
		const chain = bottledWaterChain(baseGame());
		expect(chain).toBeDefined();
		expect(chain!.steps.map((step) => step.buildingTypeId)).toEqual(['water-pump', 'water-bottler']);
		expect(chain!.nextBuildTypeId).toBe('water-pump');
		expect(chain!.steps[1].state).toBe('blocked');
	});

	it('recommends the next missing step once upstream is built', () => {
		expect.assertions(3);
		const chain = bottledWaterChain(baseGame({ industrialBuildings: [building('water-pump')] }));
		expect(chain!.steps[0].state).toBe('built');
		expect(chain!.steps[1].state).toBe('buildable');
		expect(chain!.nextBuildTypeId).toBe('water-bottler');
	});

	it('marks a chain complete when every building is placed', () => {
		expect.assertions(2);
		const chain = bottledWaterChain(baseGame({ industrialBuildings: [building('water-pump'), building('water-bottler')] }));
		expect(chain!.complete).toBe(true);
		expect(chain!.nextBuildTypeId).toBeNull();
	});

	it('is driven by retail demand when stores exist', () => {
		expect.assertions(1);
		const store = { id: 's1', products: [{ categoryId: 'bottled-water', stock: 0, reorderThreshold: 1, targetStock: 1, sellingPrice: 1 }] } as unknown as Store;
		const chains = buildSupplyAdvisor(baseGame({ stores: [store] }));
		expect(chains.some((chain) => chain.finishedMaterialId === 'bottled-water')).toBe(true);
	});
});

describe('getAvailableMaterialIds', () => {
	it('includes warehouse stock and outputs of placed buildings', () => {
		expect.assertions(2);
		const available = getAvailableMaterialIds(
			baseGame({ warehouse: { capacity: 10, materials: { grain: 4 }, overflowUnits: 0, overflowCost: 0 }, industrialBuildings: [building('water-pump')] })
		);
		expect(available).toContain('grain');
		expect(available).toContain('water');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/supplyAdvisor.spec.ts --run --project server`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/game/supplyAdvisor.ts
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
import { getFinishedMaterialIdForCategory } from './stock';
import type {
	BuildingTier,
	GameState,
	IndustrialBuildingType,
	IndustrialBuildingTypeId,
	MaterialId
} from './types';

export type AdvisorStepState = 'built' | 'buildable' | 'blocked';

export interface AdvisorChainStep {
	buildingTypeId: IndustrialBuildingTypeId;
	name: string;
	tier: BuildingTier;
	state: AdvisorStepState;
	isNextBuild: boolean;
}

export interface AdvisorChain {
	finishedMaterialId: MaterialId;
	categoryName: string;
	tier: BuildingTier;
	steps: AdvisorChainStep[];
	complete: boolean;
	nextBuildTypeId: IndustrialBuildingTypeId | null;
}

export function getBuildingTypeProducing(materialId: MaterialId): IndustrialBuildingType | null {
	for (const type of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
		if (!type.recipeId) {
			continue;
		}
		if (PRODUCTION_RECIPES[type.recipeId].outputs.some((output) => output.materialId === materialId)) {
			return type;
		}
	}
	return null;
}

export function getAvailableMaterialIds(game: GameState): MaterialId[] {
	const available = new Set<MaterialId>();

	for (const [materialId, quantity] of Object.entries(game.warehouse.materials)) {
		if ((quantity ?? 0) > 0) {
			available.add(materialId as MaterialId);
		}
	}

	for (const placed of game.industrialBuildings) {
		const type = INDUSTRIAL_BUILDING_TYPES[placed.typeId];
		if (!type?.recipeId) {
			continue;
		}
		for (const output of PRODUCTION_RECIPES[type.recipeId].outputs) {
			available.add(output.materialId);
		}
	}

	return [...available];
}

function collectChain(materialId: MaterialId, seen: Set<IndustrialBuildingTypeId>, ordered: IndustrialBuildingTypeId[]): void {
	const producer = getBuildingTypeProducing(materialId);
	if (!producer) {
		return;
	}

	const recipe = producer.recipeId ? PRODUCTION_RECIPES[producer.recipeId] : null;
	if (recipe) {
		for (const input of recipe.inputs) {
			collectChain(input.materialId, seen, ordered);
		}
	}

	if (!seen.has(producer.id)) {
		seen.add(producer.id);
		ordered.push(producer.id);
	}
}

function getWantedFinishedMaterials(game: GameState): MaterialId[] {
	const wanted = new Set<MaterialId>();

	for (const store of game.stores) {
		for (const product of store.products) {
			const material = getFinishedMaterialIdForCategory(product.categoryId);
			if (material) {
				wanted.add(material);
			}
		}
	}

	if (wanted.size === 0) {
		for (const material of Object.values(MATERIALS)) {
			if (material.kind !== 'finished') {
				continue;
			}
			const producer = getBuildingTypeProducing(material.id);
			if (producer && producer.tier === 1) {
				wanted.add(material.id);
			}
		}
	}

	return [...wanted];
}

export function buildSupplyAdvisor(game: GameState): AdvisorChain[] {
	const placed = new Set<IndustrialBuildingTypeId>(game.industrialBuildings.map((building) => building.typeId));
	const chains: AdvisorChain[] = [];

	for (const finishedMaterialId of getWantedFinishedMaterials(game)) {
		const producer = getBuildingTypeProducing(finishedMaterialId);
		if (!producer) {
			continue;
		}

		const ordered: IndustrialBuildingTypeId[] = [];
		collectChain(finishedMaterialId, new Set(), ordered);

		const steps: AdvisorChainStep[] = ordered.map((typeId) => {
			const type = INDUSTRIAL_BUILDING_TYPES[typeId];
			const built = placed.has(typeId);
			const recipe = type.recipeId ? PRODUCTION_RECIPES[type.recipeId] : null;
			const inputsSatisfied =
				!recipe ||
				recipe.inputs.every((input) => {
					const inputProducer = getBuildingTypeProducing(input.materialId);
					return inputProducer ? placed.has(inputProducer.id) : true;
				});
			const state: AdvisorStepState = built ? 'built' : inputsSatisfied ? 'buildable' : 'blocked';
			return { buildingTypeId: typeId, name: type.name, tier: type.tier, state, isNextBuild: false };
		});

		const next = steps.find((step) => step.state === 'buildable') ?? null;
		if (next) {
			next.isNextBuild = true;
		}

		chains.push({
			finishedMaterialId,
			categoryName: MATERIALS[finishedMaterialId].name,
			tier: producer.tier,
			steps,
			complete: steps.every((step) => step.state === 'built'),
			nextBuildTypeId: next ? next.buildingTypeId : null
		});
	}

	return chains.sort((a, b) => a.tier - b.tier || a.categoryName.localeCompare(b.categoryName));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/supplyAdvisor.spec.ts --run --project server`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/supplyAdvisor.ts src/lib/game/supplyAdvisor.spec.ts
git commit -m "feat: add demand-driven industry supply advisor"
```

---

### Task 2: `SupplyAdvisor.svelte` — the "what to build next" checklist

**Files:**
- Create: `src/lib/components/game/SupplyAdvisor.svelte`
- Test: `src/lib/components/game/SupplyAdvisor.svelte.spec.ts`

**Interfaces:**
- Consumes: `AdvisorChain` from `$lib/game/supplyAdvisor`; `IndustrialBuildingTypeId` from `$lib/game/types`.
- Produces (props): `{ chains: AdvisorChain[]; onBuild: (buildingTypeId: IndustrialBuildingTypeId) => void; onClose: () => void }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/components/game/SupplyAdvisor.svelte.spec.ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { AdvisorChain } from '$lib/game/supplyAdvisor';
import SupplyAdvisor from './SupplyAdvisor.svelte';

const chains: AdvisorChain[] = [
	{
		finishedMaterialId: 'bottled-water',
		categoryName: 'Bottled Water',
		tier: 1,
		complete: false,
		nextBuildTypeId: 'water-pump',
		steps: [
			{ buildingTypeId: 'water-pump', name: 'Water Pump', tier: 1, state: 'buildable', isNextBuild: true },
			{ buildingTypeId: 'water-bottler', name: 'Water Bottler', tier: 1, state: 'blocked', isNextBuild: false }
		]
	}
];

describe('SupplyAdvisor', () => {
	it('lists the chain and builds the recommended next step', async () => {
		expect.assertions(3);
		const onBuild = vi.fn();
		render(SupplyAdvisor, { chains, onBuild, onClose: vi.fn() });
		await expect.element(page.getByRole('heading', { name: /bottled water/i })).toBeVisible();
		await expect.element(page.getByText(/water bottler/i)).toBeVisible();
		await page.getByRole('button', { name: /build water pump/i }).click();
		expect(onBuild).toHaveBeenCalledWith('water-pump');
	});

	it('shows an empty state when there are no chains', async () => {
		expect.assertions(1);
		render(SupplyAdvisor, { chains: [], onBuild: vi.fn(), onClose: vi.fn() });
		await expect.element(page.getByText(/nothing to plan/i)).toBeVisible();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- src/lib/components/game/SupplyAdvisor.svelte -->
<script lang="ts">
	import type { AdvisorChain } from '$lib/game/supplyAdvisor';
	import type { IndustrialBuildingTypeId } from '$lib/game/types';

	interface Props {
		chains: AdvisorChain[];
		onBuild: (buildingTypeId: IndustrialBuildingTypeId) => void;
		onClose: () => void;
	}

	let { chains, onBuild, onClose }: Props = $props();

	function stateMark(state: AdvisorChain['steps'][number]['state']): string {
		if (state === 'built') return '✓';
		if (state === 'buildable') return '→';
		return '·';
	}
</script>

<div class="advisor-backdrop">
	<button type="button" class="backdrop-button" aria-label="Close supply advisor" onclick={onClose}></button>
	<div class="advisor paper" role="dialog" aria-modal="true" aria-label="Supply advisor">
		<header>
			<div>
				<p class="eyebrow">Industry</p>
				<h2>Supply Advisor</h2>
			</div>
			<button type="button" class="btn-danger" aria-label="Close supply advisor" onclick={onClose}>Close</button>
		</header>

		{#if chains.length === 0}
			<p class="muted">Nothing to plan — found a retail store to create demand.</p>
		{:else}
			<div class="chains">
				{#each chains as chain (chain.finishedMaterialId)}
					<section class="chain" aria-label={`${chain.categoryName} supply chain`}>
						<div class="chain-heading">
							<h3>{chain.categoryName}</h3>
							{#if chain.tier === 1}<span class="starter">Starter</span>{/if}
							{#if chain.complete}<span class="done">Supplied ✓</span>{/if}
						</div>
						<ol class="steps">
							{#each chain.steps as step (step.buildingTypeId)}
								<li class={`step ${step.state}`}>
									<span class="mark" aria-hidden="true">{stateMark(step.state)}</span>
									<span class="step-name">{step.name}</span>
									{#if step.isNextBuild}
										<button type="button" class="build-next" onclick={() => onBuild(step.buildingTypeId)}>
											Build {step.name}
										</button>
									{/if}
								</li>
							{/each}
						</ol>
					</section>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.advisor-backdrop {
		position: fixed;
		inset: 0;
		z-index: 46;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.72);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		background: transparent;
		padding: 0;
	}

	.advisor {
		position: relative;
		z-index: 1;
		width: min(40rem, 100%);
		max-height: calc(100vh - 2rem);
		overflow: auto;
		padding: 1.2rem;
		display: grid;
		gap: 1rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.chains {
		display: grid;
		gap: 0.85rem;
	}

	.chain {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.8rem;
		display: grid;
		gap: 0.6rem;
	}

	.chain-heading {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.starter {
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		background: var(--brass-100);
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.1rem 0.5rem;
	}

	.done {
		color: var(--moss);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
	}

	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.88rem;
		color: var(--ink-700);
	}

	.step.blocked .step-name {
		color: var(--ink-400);
	}

	.mark {
		width: 1.2rem;
		text-align: center;
		font-family: var(--font-mono);
		color: var(--brass-700);
	}

	.step.built .mark {
		color: var(--moss);
	}

	.build-next {
		margin-left: auto;
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		background: var(--moss);
		color: var(--paper-50);
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 0.78rem;
		padding: 0.35rem 0.7rem;
	}

	.build-next:hover,
	.build-next:focus-visible {
		background: var(--moss-2);
	}

	.muted {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
	}
</style>
```

- [ ] **Step 4: `svelte-autofixer`, then run the test**

Run svelte-autofixer until clean, then:
Run: `bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/SupplyAdvisor.svelte src/lib/components/game/SupplyAdvisor.svelte.spec.ts
git commit -m "feat: add supply advisor checklist component"
```

---

### Task 3: Recipe cards + Advisor entry in `BuildMenu.svelte`

**Files:**
- Modify: `src/lib/components/game/BuildMenu.svelte`
- Modify: `src/lib/components/game/BuildMenu.svelte.spec.ts`

**Interfaces:**
- New optional props (backward-compatible): `availableMaterialIds?: string[]` (default `[]`), `onOpenAdvisor?: () => void`.
- Consumes: `PRODUCTION_RECIPES`, `MATERIALS` from `$lib/game/industry`; `getIndustryMaterialArt` from `$lib/assets/gameArt`; `getBuildingTypeProducing` from `$lib/game/supplyAdvisor` (Task 1).

- [ ] **Step 1: Add a failing test for recipe cards + advisor button**

Append to `src/lib/components/game/BuildMenu.svelte.spec.ts`:

```ts
describe('BuildMenu industry recipe cards', () => {
	it('shows a Starter badge and opens the advisor', async () => {
		expect.assertions(2);
		const onOpenAdvisor = vi.fn();
		render(BuildMenu, {
			activeMapView: 'industry',
			retailOptions: [],
			industryLockedReason: null,
			availableMaterialIds: [],
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onOpenAdvisor,
			onClose: vi.fn()
		});
		await expect.element(page.getByText(/starter/i).first()).toBeVisible();
		await page.getByRole('button', { name: /supply advisor|what should i build/i }).click();
		expect(onOpenAdvisor).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/BuildMenu.svelte.spec.ts --run --project client`
Expected: FAIL — no advisor button / no Starter badge / unknown prop.

- [ ] **Step 3: Extend the `BuildMenu` script**

Add imports:

```ts
import { getIndustryMaterialArt } from '$lib/assets/gameArt';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES, getIndustrialBuildingTypesForProductChain } from '$lib/game/industry';
import { getBuildingTypeProducing } from '$lib/game/supplyAdvisor';
import type { MaterialId } from '$lib/game/types';
```

(Note: `INDUSTRIAL_BUILDING_TYPES` and `getIndustrialBuildingTypesForProductChain` are already imported — merge, do not duplicate.)

Add to `Props` and destructuring:

```ts
availableMaterialIds?: string[];
onOpenAdvisor?: () => void;
```
```ts
availableMaterialIds = [],
onOpenAdvisor = () => {},
```

Add helpers:

```ts
const availableSet = $derived(new Set(availableMaterialIds));

function recipeForType(typeId: IndustrialBuildingTypeId) {
	const type = INDUSTRIAL_BUILDING_TYPES[typeId];
	return type.recipeId ? PRODUCTION_RECIPES[type.recipeId] : null;
}

function materialName(materialId: MaterialId): string {
	return MATERIALS[materialId]?.name ?? materialId;
}

function materialArt(materialId: MaterialId): string {
	return asset(getIndustryMaterialArt(materialId));
}

function isAvailable(materialId: MaterialId): boolean {
	return availableSet.has(materialId);
}

function neededProducerName(materialId: MaterialId): string {
	return getBuildingTypeProducing(materialId)?.name ?? materialName(materialId);
}
```

- [ ] **Step 4: Replace the industry option card markup**

In the industry `<div class="option-list">`, replace the inner `<span>…</span>` of each `build-option` with the recipe card. Also add the Advisor button just above the option list (after the product-filter block). Replace the industry option loop body with:

```svelte
<button type="button" class="advisor-open" onclick={onOpenAdvisor}>
	Supply Advisor — what should I build?
</button>

<div class="option-list">
	{#each visibleIndustryBuildingTypes as type (type.id)}
		{@const recipe = recipeForType(type.id)}
		<button type="button" class="build-option" disabled={industryLockedReason !== null} onclick={() => chooseIndustry(type.id)}>
			<img src={asset(getIndustrialBuildingArt(type.id))} alt="" width="44" height="44" />
			<span>
				<strong>
					Build {type.name}
					{#if type.tier === 1}<em class="starter">Starter</em>{/if}
				</strong>
				<small>Cost {currency.format(type.buildCost)} | Operating {currency.format(type.dailyOperatingCost)}/day</small>
				{#if recipe}
					<span class="recipe" aria-label="Recipe">
						{#each recipe.inputs as input (input.materialId)}
							<span class="chip" class:missing={!isAvailable(input.materialId)}>
								<img src={materialArt(input.materialId)} alt={materialName(input.materialId)} width="18" height="18" />
								{input.quantity}
							</span>
						{/each}
						<span class="arrow" aria-hidden="true">→</span>
						{#each recipe.outputs as output (output.materialId)}
							<span class="chip out">
								<img src={materialArt(output.materialId)} alt={materialName(output.materialId)} width="18" height="18" />
								{output.quantity}
							</span>
						{/each}
					</span>
					{#each recipe.inputs.filter((input) => !isAvailable(input.materialId)) as missing (missing.materialId)}
						<small class="need">Needs {neededProducerName(missing.materialId)}</small>
					{/each}
				{:else if type.requiredResource}
					<small class="need">Needs a {materialName(type.requiredResource as MaterialId)} resource tile</small>
				{/if}
			</span>
		</button>
	{:else}
		<p class="muted">No industrial buildings available</p>
	{/each}
</div>
```

Add styles:

```css
.advisor-open {
	width: 100%;
	border: 1px solid var(--brass-500);
	border-radius: 2px;
	background: var(--paper-100);
	color: var(--ink-700);
	font-family: var(--font-ui);
	font-weight: 700;
	padding: 0.6rem 0.75rem;
	text-align: left;
}

.advisor-open:hover,
.advisor-open:focus-visible {
	background: var(--paper-200);
}

.starter {
	margin-left: 0.4rem;
	border: 1px solid var(--brass-500);
	border-radius: 999px;
	background: var(--brass-100);
	color: var(--brass-700);
	font-family: var(--font-ui);
	font-size: 0.6rem;
	font-weight: 700;
	font-style: normal;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	padding: 0.05rem 0.4rem;
}

.recipe {
	display: inline-flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 0.3rem;
	margin-top: 0.15rem;
}

.chip {
	display: inline-flex;
	align-items: center;
	gap: 0.2rem;
	border: 1px solid var(--paper-edge);
	border-radius: 2px;
	background: var(--paper-100);
	padding: 0.1rem 0.3rem;
	font-family: var(--font-mono);
	font-size: 0.72rem;
	color: var(--ink-700);
}

.chip.missing {
	border-color: var(--wax-red);
	color: var(--wax-red);
}

.chip.out {
	border-color: var(--moss);
}

.arrow {
	color: var(--brass-700);
	font-family: var(--font-mono);
}

.need {
	color: var(--wax-red);
	font-family: var(--font-body);
	font-size: 0.76rem;
}
```

- [ ] **Step 5: `svelte-autofixer`, then run the tests**

Run svelte-autofixer until clean, then:
Run: `bun run test:unit -- src/lib/components/game/BuildMenu.svelte.spec.ts --run --project client`
Expected: PASS (existing tests + the 2 new assertions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/game/BuildMenu.svelte src/lib/components/game/BuildMenu.svelte.spec.ts
git commit -m "feat: industry build menu recipe cards with availability and advisor entry"
```

---

### Task 4: Wire the advisor + availability into `+page.svelte`

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**
- Consumes: `SupplyAdvisor` (Task 2), `buildSupplyAdvisor` + `getAvailableMaterialIds` (Task 1), extended `BuildMenu` (Task 3).

- [ ] **Step 1: Imports and state**

```ts
import SupplyAdvisor from '$lib/components/game/SupplyAdvisor.svelte';
import { buildSupplyAdvisor, getAvailableMaterialIds } from '$lib/game/supplyAdvisor';
```
```ts
let isSupplyAdvisorOpen = $state(false);
```

- [ ] **Step 2: Derived advisor data**

```ts
let supplyAdvisorChains = $derived(buildSupplyAdvisor(game ?? starterMapState));
let availableMaterialIds = $derived(getAvailableMaterialIds(game ?? starterMapState));
```

- [ ] **Step 3: Handlers**

```ts
function openSupplyAdvisor(): void {
	isBuildMenuOpen = false;
	isSupplyAdvisorOpen = true;
}

function closeSupplyAdvisor(): void {
	isSupplyAdvisorOpen = false;
}

function buildFromAdvisor(buildingTypeId: IndustrialBuildingTypeId): void {
	isSupplyAdvisorOpen = false;
	isBuildMenuOpen = false;
	armIndustryPlacement(buildingTypeId);
}
```

- [ ] **Step 4: Fold into `isMapPaused` and the `Escape` chain**

Add `isSupplyAdvisorOpen` to `isMapPaused`:

```ts
let isMapPaused = $derived(
	!isPlacementModeActive &&
		(isSupplyAdvisorOpen || isViewMenuOpen || isBuildMenuOpen || activeManagementPanelId !== null || isSavePanelOpen)
);
```

At the top of the `Escape` handling in `handleKeydown`:

```ts
if (isSupplyAdvisorOpen) {
	isSupplyAdvisorOpen = false;
	return;
}
```

- [ ] **Step 5: Pass new props to `BuildMenu` and render the advisor**

Update the `<BuildMenu .../>` invocation to add:

```svelte
{availableMaterialIds}
onOpenAdvisor={openSupplyAdvisor}
```

After the BuildMenu block, render:

```svelte
{#if isSupplyAdvisorOpen}
	<SupplyAdvisor chains={supplyAdvisorChains} onBuild={buildFromAdvisor} onClose={closeSupplyAdvisor} />
{/if}
```

- [ ] **Step 6: Type-check and unit tests**

Run: `bun run check` → clean.
Run: `bun run test:unit -- --run` → all pass.

- [ ] **Step 7: e2e — advisor drives placement**

Add to `src/routes/retail-sim.e2e.ts` (reuse the file's existing helper that switches to the industry map and opens the build menu — see `openMapMenuItem(page, /industry city map/i)` and the `/^build$/i` button usage around line 745):

```ts
test('supply advisor recommends and arms a starter build', async ({ page }) => {
	await gotoRetailSim(page); // match the suite's existing setup/navigation helper
	await openMapMenuItem(page, /industry city map/i);
	await page.getByRole('button', { name: /^build$/i }).click();
	await page.getByRole('button', { name: /supply advisor|what should i build/i }).click();
	const advisor = page.getByRole('dialog', { name: /supply advisor/i });
	await expect(advisor).toBeVisible();
	await advisor.getByRole('button', { name: /^build /i }).first().click();
	await expect(advisor).toHaveCount(0);
	await expect(page.getByText(/choose a highlighted tile to build/i)).toBeVisible();
});
```

> `gotoRetailSim` is a placeholder — use whatever navigation/setup helper the suite already defines at the top of the file. The placement-status copy `Choose a highlighted tile to build.` comes from `+page.svelte`'s placement bar.

- [ ] **Step 8: Run lint, check, unit, e2e**

Run: `bun run lint` → clean.
Run: `bun run check` → clean.
Run: `bun run test:unit -- --run` → all pass.
Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts` → all pass.

- [ ] **Step 9: Commit**

```bash
git add src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat: wire supply advisor and recipe availability into the game page"
```

---

## Self-Review

**Spec coverage (Part 4):**
- Demand-driven advisor: reads store categories → chains, recommends next build; Tier-1 fallback for fresh cities → Task 1 (`getWantedFinishedMaterials`, `buildSupplyAdvisor`) + Task 2 (UI).
- One-click "build this next" arming placement → Task 2 (`onBuild`) + Task 4 (`buildFromAdvisor` → `armIndustryPlacement`).
- Recipe cards: inputs→output with availability + "needs {building}" + Tier-1 "Starter" tag → Task 3.
- Advisor reachable from the build menu (the natural "what to build" moment) → Task 3 + Task 4. (Spec also mentioned an industry-inspector empty-state entry; deferred as an optional extra — the build-menu entry satisfies discoverability. To add it later: pass `onOpenAdvisor` into `IndustryTileInspector` and render a button in its no-building state.)
- Existing chain graph retained untouched (deep view) — no `productChainGraph`/`ProductChainsPanel` changes.
- New overlay respects `isMapPaused` + `Escape` → Task 4.

**Placeholder scan:** No TBD/TODO. `gotoRetailSim` is explicitly flagged as "match the suite's existing helper," not a silent gap. The deferred inspector entry is called out with exact wiring.

**Type consistency:** `AdvisorChain` / `AdvisorChainStep` identical across Task 1 (definition), Task 2 (prop + render), Task 4 (derived). `getBuildingTypeProducing` / `getAvailableMaterialIds` signatures match usage in Tasks 3 and 4. `buildFromAdvisor(buildingTypeId: IndustrialBuildingTypeId)` matches `SupplyAdvisor`'s `onBuild` and `armIndustryPlacement`'s existing parameter type. `availableMaterialIds: string[]` (BuildMenu prop) matches `getAvailableMaterialIds` return (`MaterialId[]`, assignable to `string[]`).

## Note

Independent of the Control-Desk and Shop-split plans; `isMapPaused`/`Escape` edits compose additively.
