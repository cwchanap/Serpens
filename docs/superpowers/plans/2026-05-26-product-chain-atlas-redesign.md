# Product Chain Atlas Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the boxes-and-arrows product chain visualization with an "Atlas Sheet" rendering that uses real product / building PNGs, encodes status redundantly (color + shape + label + dash pattern), and shares vocabulary between the Control Tower panel and the store-inspector compact view.

**Architecture:** Keep `src/lib/game/productChainGraph.ts` data layer unchanged. Replace the rendering layer: drop `@xyflow/svelte`, build a small custom SVG-route + absolute-positioned-DOM atlas under `src/lib/components/game/atlas/`. Add a `chainNodeArt()` resolver in `src/lib/assets/gameArt.ts` plus a derived `RECIPE_BUILDING_ART` map (inverted from `INDUSTRIAL_BUILDING_TYPES`).

**Tech Stack:** SvelteKit 2 with Svelte 5 runes, TypeScript, Vitest (browser + node projects), Playwright e2e, Bun. CSS variables from `src/lib/styles/tokens.css` (parchment palette + DM Serif Display / Spectral / IBM Plex Sans / JetBrains Mono fonts).

**Spec:** `docs/superpowers/specs/2026-05-26-product-chain-atlas-redesign-design.md`

---

## File Structure

**New files:**

- `src/lib/components/game/atlas/ProductChainAtlas.svelte` — replaces `ProductChainGraph.svelte` rendering; same props.
- `src/lib/components/game/atlas/ChainNode.svelte` — single node (material / recipe / warehouse variants).
- `src/lib/components/game/atlas/ChainRoute.svelte` — single SVG path + arrowhead.
- `src/lib/components/game/atlas/ChainMap.svelte` — canvas wrapper (compass, lat-grid, legend slot).
- `src/lib/components/game/atlas/CategoryStampIndex.svelte` — replaces the `.summary-grid` in `ProductChainsPanel.svelte`.
- `src/lib/components/game/atlas/NodeBroadside.svelte` — replaces `ProductChainNodeDetail.svelte`.
- `src/lib/components/game/atlas/CompassRose.svelte` — decorative SVG, `aria-hidden`.
- `src/lib/components/game/atlas/LegendCartouche.svelte` — decorative route key, `aria-hidden`.
- Specs colocated for each new component: `ProductChainAtlas.svelte.spec.ts`, `ChainNode.svelte.spec.ts`, `NodeBroadside.svelte.spec.ts`, `CategoryStampIndex.svelte.spec.ts`.

**Modified files:**

- `src/lib/assets/gameArt.ts` — add `RECIPE_BUILDING_ART` (inverted from `INDUSTRIAL_BUILDING_TYPES`), add `ChainNodeArt` type + `chainNodeArt()` resolver, export `getChainNodeArt`.
- `src/lib/assets/gameArt.spec.ts` — extend coverage for the new map + resolver.
- `src/lib/components/game/ProductChainsPanel.svelte` — refit chrome; use `CategoryStampIndex`, `ProductChainAtlas`, `NodeBroadside`.
- `src/lib/components/game/StoreProductChainPanel.svelte` — refit to use `<ProductChainAtlas compact />` + `<NodeBroadside />`.
- `src/lib/components/game/ProductChainsPanel.svelte.spec.ts` — update selectors after rewrite.
- `src/lib/components/game/StoreProductChainPanel.svelte.spec.ts` — update selectors after rewrite.
- `src/routes/retail-sim.e2e.ts` — add one stamp-click assertion.
- `package.json` — remove `@xyflow/svelte` once nothing imports it.

**Deleted files:**

- `src/lib/components/game/ProductChainGraph.svelte`
- `src/lib/components/game/ProductChainGraph.svelte.spec.ts`
- `src/lib/components/game/ProductChainNodeDetail.svelte`
- `src/lib/components/game/ProductChainSelectionBridge.svelte`

---

## Implementation Tasks

### Task 1: Add `RECIPE_BUILDING_ART` map to `gameArt.ts`

**Files:**
- Modify: `src/lib/assets/gameArt.ts`
- Test: `src/lib/assets/gameArt.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/assets/gameArt.spec.ts` inside the existing `describe('gameArt', ...)` block (or after it):

```ts
import { INDUSTRIAL_BUILDING_TYPES, PRODUCTION_RECIPES } from '$lib/game/industry';
import { RECIPE_BUILDING_ART } from '$lib/assets/gameArt';

describe('RECIPE_BUILDING_ART', () => {
	it('maps every recipe with a registered building to that building art', () => {
		expect.assertions(1);
		const expected: Record<string, string> = {};
		for (const building of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
			if (!building.recipeId) continue;
			const art = INDUSTRIAL_BUILDING_ART[building.id];
			if (!art) continue;
			expected[building.recipeId] = art;
		}
		expect(RECIPE_BUILDING_ART).toEqual(expected);
	});

	it('covers every recipe that has a building bound to it', () => {
		expect.assertions(1);
		const recipeIdsWithBuildings = new Set(
			Object.values(INDUSTRIAL_BUILDING_TYPES)
				.map((building) => building.recipeId)
				.filter((id): id is string => Boolean(id))
		);
		const recipeIdsInMap = new Set(Object.keys(RECIPE_BUILDING_ART));
		const missing = [...recipeIdsWithBuildings].filter((id) => !recipeIdsInMap.has(id));
		expect(missing).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/assets/gameArt.spec.ts --project server --run`
Expected: FAIL with `RECIPE_BUILDING_ART is not defined` or `Cannot read properties of undefined`.

- [ ] **Step 3: Add the export in `src/lib/assets/gameArt.ts`**

Add this import near the top (after the existing `import type` block, alongside any other domain imports — there are none today, so add a new import):

```ts
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import type { ProductionRecipeId } from '$lib/game/types';
```

Add after the existing `INDUSTRIAL_BUILDING_ART` constant (around line 271):

```ts
export const RECIPE_BUILDING_ART: Readonly<Record<ProductionRecipeId, string>> = Object.freeze(
	(() => {
		const map: Partial<Record<ProductionRecipeId, string>> = {};
		for (const building of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
			if (!building.recipeId) continue;
			const art = INDUSTRIAL_BUILDING_ART[building.id];
			if (!art) continue;
			map[building.recipeId] = art;
		}
		return map as Record<ProductionRecipeId, string>;
	})()
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- src/lib/assets/gameArt.spec.ts --project server --run`
Expected: PASS (all assertions including pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts
git commit -m "feat: add RECIPE_BUILDING_ART map derived from INDUSTRIAL_BUILDING_TYPES"
```

---

### Task 2: Add `chainNodeArt()` resolver

**Files:**
- Modify: `src/lib/assets/gameArt.ts`
- Test: `src/lib/assets/gameArt.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/assets/gameArt.spec.ts`:

```ts
import { chainNodeArt, type ChainNodeArt } from '$lib/assets/gameArt';
import type { ProductChainNode } from '$lib/game/productChainGraph';

function nodeStub(overrides: Partial<ProductChainNode>): ProductChainNode {
	return {
		id: 'stub',
		kind: 'material',
		label: 'Stub',
		materialId: null,
		recipeId: null,
		stage: null,
		layer: 0,
		row: 0,
		health: 'healthy',
		healthLabel: 'Healthy',
		warehouseStock: 0,
		capacity: { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 },
		actual: {
			produced: 0,
			consumed: 0,
			importedInput: 0,
			warehousePulled: 0,
			shopImported: 0,
			unitsSold: 0,
			demandMissed: 0
		},
		bottleneck: '',
		...overrides
	};
}

describe('chainNodeArt', () => {
	it('returns material art for a material node', () => {
		expect.assertions(1);
		const art: ChainNodeArt = chainNodeArt(
			nodeStub({ kind: 'material', materialId: 'flour' })
		);
		expect(art).toEqual({
			src: '/assets/game/industry/materials/flour.png',
			alt: 'Flour',
			fallbackGlyph: 'material'
		});
	});

	it('returns recipe building art for a recipe node', () => {
		expect.assertions(1);
		const art = chainNodeArt(
			nodeStub({ kind: 'recipe', recipeId: 'flour-from-grain', label: 'Flour mill' })
		);
		expect(art.src).toBe('/assets/game/industry/buildings/flour-mill.png');
	});

	it('returns warehouse art for a warehouse node', () => {
		expect.assertions(1);
		const art = chainNodeArt(nodeStub({ kind: 'warehouse', label: 'Warehouse' }));
		expect(art).toEqual({
			src: '/assets/game/industry/buildings/warehouse.png',
			alt: 'Warehouse',
			fallbackGlyph: 'warehouse'
		});
	});

	it('returns a null src with kind-keyed fallback when nothing matches', () => {
		expect.assertions(1);
		const art = chainNodeArt(nodeStub({ kind: 'material', materialId: null }));
		expect(art).toEqual({
			src: null,
			alt: 'Stub',
			fallbackGlyph: 'material'
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- src/lib/assets/gameArt.spec.ts --project server --run`
Expected: FAIL with `chainNodeArt is not exported`.

> Note: this test imports `ProductChainNode` from `$lib/game/productChainGraph`. The type is already exported there. Confirm with `grep "export interface ProductChainNode" src/lib/game/productChainGraph.ts` — should return one match.

- [ ] **Step 3: Implement `chainNodeArt` in `src/lib/assets/gameArt.ts`**

Add to the existing import-type block at the top:

```ts
import type { ProductChainNode } from '$lib/game/productChainGraph';
```

Append at the bottom of the file, after `getIndustrialBuildingArt`:

```ts
export interface ChainNodeArt {
	src: string | null;
	alt: string;
	fallbackGlyph: 'material' | 'recipe' | 'warehouse';
}

const WAREHOUSE_ART_PATH = INDUSTRIAL_BUILDING_ART.warehouse;

export function chainNodeArt(node: ProductChainNode): ChainNodeArt {
	if (node.kind === 'material' && node.materialId) {
		return {
			src: INDUSTRY_MATERIAL_ART[node.materialId] ?? null,
			alt: node.label,
			fallbackGlyph: 'material'
		};
	}

	if (node.kind === 'recipe' && node.recipeId) {
		return {
			src: RECIPE_BUILDING_ART[node.recipeId] ?? null,
			alt: node.label,
			fallbackGlyph: 'recipe'
		};
	}

	if (node.kind === 'warehouse') {
		return {
			src: WAREHOUSE_ART_PATH,
			alt: node.label,
			fallbackGlyph: 'warehouse'
		};
	}

	return { src: null, alt: node.label, fallbackGlyph: node.kind };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- src/lib/assets/gameArt.spec.ts --project server --run`
Expected: PASS for all four `chainNodeArt` tests plus the two from Task 1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts
git commit -m "feat: add chainNodeArt resolver for ProductChainNode → PNG"
```

---

### Task 3: Scaffold `ChainNode.svelte` (material variant + spec)

**Files:**
- Create: `src/lib/components/game/atlas/ChainNode.svelte`
- Create: `src/lib/components/game/atlas/ChainNode.svelte.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/game/atlas/ChainNode.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ProductChainNode } from '$lib/game/productChainGraph';
import ChainNode from './ChainNode.svelte';

function materialNode(overrides: Partial<ProductChainNode> = {}): ProductChainNode {
	return {
		id: 'material:flour',
		kind: 'material',
		label: 'Flour',
		materialId: 'flour',
		recipeId: null,
		stage: 'process',
		layer: 1,
		row: 0,
		health: 'healthy',
		healthLabel: 'Healthy',
		warehouseStock: 12,
		capacity: { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 },
		actual: {
			produced: 38,
			consumed: 28,
			importedInput: 0,
			warehousePulled: 0,
			shopImported: 0,
			unitsSold: 0,
			demandMissed: 0
		},
		bottleneck: '',
		...overrides
	};
}

describe('ChainNode', () => {
	it('renders a material node as a button with the material icon and label', async () => {
		expect.assertions(3);
		const onSelect = vi.fn();
		render(ChainNode, {
			node: materialNode(),
			selected: false,
			compact: false,
			position: { x: 0, y: 0 },
			onSelect
		});

		const button = page.getByRole('button', { name: /Flour, Healthy/i });
		await expect.element(button).toBeVisible();
		await expect.element(page.getByAltText('Flour')).toBeVisible();
		await expect.element(button).toHaveAttribute('data-node-kind', 'material');
	});

	it('calls onSelect with the node id when clicked', async () => {
		expect.assertions(1);
		const onSelect = vi.fn();
		render(ChainNode, {
			node: materialNode(),
			selected: false,
			compact: false,
			position: { x: 0, y: 0 },
			onSelect
		});

		await page.getByRole('button', { name: /Flour/i }).click();
		expect(onSelect).toHaveBeenCalledWith('material:flour');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/atlas/ChainNode.svelte.spec.ts --project client --run`
Expected: FAIL with `Cannot find module './ChainNode.svelte'`.

- [ ] **Step 3: Implement `ChainNode.svelte` (minimal material variant)**

Create `src/lib/components/game/atlas/ChainNode.svelte`:

```svelte
<script lang="ts">
	import { chainNodeArt } from '$lib/assets/gameArt';
	import { formatQuantity, type ProductChainNode } from '$lib/game/productChainGraph';

	interface Props {
		node: ProductChainNode;
		selected: boolean;
		compact: boolean;
		position: { x: number; y: number };
		onSelect: (nodeId: string) => void;
	}

	let { node, selected, compact, position, onSelect }: Props = $props();

	const art = $derived(chainNodeArt(node));
	const ariaLabel = $derived(`${node.label}, ${node.healthLabel}`);
	const statLine = $derived.by(() => {
		if (node.kind === 'recipe') {
			return `${node.capacity.buildingCount} bldg · ${formatQuantity(node.actual.produced)}/d`;
		}
		return `stock ${formatQuantity(node.warehouseStock)}`;
	});

	function handleClick(): void {
		onSelect(node.id);
	}
</script>

<button
	type="button"
	class={[
		'chain-node',
		`chain-node-${node.kind}`,
		`chain-node-${node.health}`,
		selected && 'is-selected',
		compact && 'is-compact'
	]}
	style:left={`${position.x}px`}
	style:top={`${position.y}px`}
	data-node-id={node.id}
	data-node-kind={node.kind}
	data-node-health={node.health}
	aria-pressed={selected}
	aria-label={ariaLabel}
	onclick={handleClick}
>
	<span class="frame">
		{#if art.src}
			<img src={art.src} alt={art.alt} class="icon" />
		{:else}
			<span class="glyph" aria-hidden="true">{node.label.charAt(0)}</span>
		{/if}
		<span class={['pin', `pin-${node.health}`]}>{node.healthLabel}</span>
	</span>
	<span class="cartouche">{node.label}</span>
	<span class="stat">{statLine}</span>
</button>

<style>
	.chain-node {
		position: absolute;
		display: grid;
		justify-items: center;
		gap: 6px;
		width: 132px;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--ink-700);
		text-align: center;
		cursor: pointer;
		font: inherit;
	}

	.chain-node.is-compact {
		width: 104px;
	}

	.frame {
		position: relative;
		width: 90px;
		height: 90px;
		display: flex;
		align-items: center;
		justify-content: center;
		background:
			radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--paper-50) 99%, white) 0%, var(--paper-50) 60%, color-mix(in srgb, var(--paper-50) 86%, var(--brass-100)) 100%);
		border: 2px solid var(--ink-700);
		box-shadow: 0 3px 0 var(--paper-edge), 0 6px 14px rgba(20, 12, 4, 0.18);
	}

	.is-compact .frame {
		width: 60px;
		height: 60px;
	}

	.chain-node-material .frame {
		border-radius: 50%;
	}

	.chain-node-material .frame::after {
		content: '';
		position: absolute;
		inset: 5px;
		border: 1px dashed color-mix(in srgb, var(--brass-700) 60%, transparent);
		border-radius: 50%;
		pointer-events: none;
	}

	.chain-node-recipe .frame {
		width: 100px;
		height: 100px;
		clip-path: polygon(28% 0, 72% 0, 100% 28%, 100% 72%, 72% 100%, 28% 100%, 0 72%, 0 28%);
		background:
			radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--brass-100) 80%, var(--paper-50)) 0%, color-mix(in srgb, var(--paper-50) 90%, var(--brass-100)) 75%);
	}

	.is-compact.chain-node-recipe .frame {
		width: 64px;
		height: 64px;
	}

	.chain-node-warehouse .frame {
		width: 98px;
		height: 82px;
		border-radius: 4px;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--brass-100) 75%, var(--paper-50)) 0%, color-mix(in srgb, var(--paper-50) 85%, var(--brass-100)) 100%);
	}

	.is-compact.chain-node-warehouse .frame {
		width: 64px;
		height: 52px;
	}

	.icon {
		width: 64px;
		height: 64px;
		image-rendering: pixelated;
		position: relative;
		z-index: 1;
	}

	.is-compact .icon {
		width: 40px;
		height: 40px;
	}

	.chain-node-recipe .icon {
		width: 60px;
		height: 60px;
	}

	.is-compact.chain-node-recipe .icon {
		width: 36px;
		height: 36px;
	}

	.chain-node-warehouse .icon {
		width: 64px;
		height: 56px;
	}

	.is-compact.chain-node-warehouse .icon {
		width: 40px;
		height: 34px;
	}

	.glyph {
		font-family: var(--font-display);
		font-size: 32px;
		color: var(--ink-500);
	}

	.pin {
		position: absolute;
		top: -7px;
		right: -7px;
		padding: 2px 6px;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--paper-50);
		background: var(--moss);
		border-radius: 1px;
		transform: rotate(3deg);
		box-shadow: 1px 1px 0 rgba(15, 10, 3, 0.25);
	}

	.pin-watch,
	.pin-no-report {
		background: var(--brass-700);
	}

	.pin-shortage,
	.pin-no-local-capacity {
		background: var(--wax-red);
		transform: rotate(-3deg);
	}

	.chain-node-shortage .frame,
	.chain-node-no-local-capacity .frame {
		border-color: var(--wax-red);
	}

	.chain-node-watch .frame {
		border-color: var(--brass-700);
	}

	.cartouche {
		max-width: 120px;
		padding: 3px 8px;
		font-family: var(--font-display);
		font-size: 14px;
		line-height: 1.05;
		color: var(--ink-700);
		background: var(--paper-50);
		border-top: 1px solid var(--brass-700);
		border-bottom: 2px double var(--brass-700);
		overflow-wrap: anywhere;
	}

	.is-compact .cartouche {
		font-size: 11px;
		padding: 2px 6px;
	}

	.chain-node-shortage .cartouche,
	.chain-node-no-local-capacity .cartouche {
		border-color: var(--wax-red);
		color: var(--wax-red);
	}

	.stat {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--brass-700);
	}

	.is-compact .stat {
		font-size: 9.5px;
	}

	.chain-node-shortage .stat,
	.chain-node-no-local-capacity .stat {
		color: var(--wax-red);
	}

	.chain-node.is-selected .frame {
		outline: 3px solid var(--brass-300);
		outline-offset: 4px;
	}

	.chain-node:focus-visible .frame {
		outline: 3px solid var(--brass-300);
		outline-offset: 4px;
	}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/components/game/atlas/ChainNode.svelte.spec.ts --project client --run`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/atlas/ChainNode.svelte src/lib/components/game/atlas/ChainNode.svelte.spec.ts
git commit -m "feat: add ChainNode atlas component (material/recipe/warehouse variants)"
```

---

### Task 4: Add recipe and warehouse variant tests for `ChainNode`

**Files:**
- Modify: `src/lib/components/game/atlas/ChainNode.svelte.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append two more `it` blocks inside `describe('ChainNode', ...)`:

```ts
it('renders a recipe node with the building icon and shortage styling', async () => {
	expect.assertions(2);
	const onSelect = vi.fn();
	render(ChainNode, {
		node: materialNode({
			id: 'recipe:flour-from-grain',
			kind: 'recipe',
			label: 'Flour mill',
			materialId: null,
			recipeId: 'flour-from-grain',
			health: 'shortage',
			healthLabel: 'Shortage',
			capacity: { buildingCount: 1, outputPerDay: 20, inputPerDay: 20 }
		}),
		selected: false,
		compact: false,
		position: { x: 0, y: 0 },
		onSelect
	});

	const button = page.getByRole('button', { name: /Flour mill, Shortage/i });
	await expect.element(button).toHaveAttribute('data-node-kind', 'recipe');
	await expect.element(button).toHaveAttribute('data-node-health', 'shortage');
});

it('renders a warehouse node with the warehouse icon and stock stat', async () => {
	expect.assertions(2);
	const onSelect = vi.fn();
	render(ChainNode, {
		node: materialNode({
			id: 'warehouse',
			kind: 'warehouse',
			label: 'Warehouse',
			materialId: null,
			warehouseStock: 42
		}),
		selected: true,
		compact: true,
		position: { x: 0, y: 0 },
		onSelect
	});

	const button = page.getByRole('button', { name: /Warehouse/i });
	await expect.element(button).toHaveAttribute('data-node-kind', 'warehouse');
	await expect.element(button).toHaveAttribute('aria-pressed', 'true');
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun run test:unit -- src/lib/components/game/atlas/ChainNode.svelte.spec.ts --project client --run`
Expected: PASS — all four tests green. The implementation from Task 3 already covers these cases; this task is purely additive coverage.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/game/atlas/ChainNode.svelte.spec.ts
git commit -m "test: cover recipe and warehouse ChainNode variants"
```

---

### Task 5: Add `ChainRoute.svelte`

**Files:**
- Create: `src/lib/components/game/atlas/ChainRoute.svelte`

> ChainRoute has no standalone spec — it's exercised through `ProductChainAtlas.svelte.spec.ts` in Task 8. SVG-path geometry is too implementation-detail to test in isolation; the structural assertions (one path per edge, correct stroke color) live at the parent level.

- [ ] **Step 1: Create the component**

Create `src/lib/components/game/atlas/ChainRoute.svelte`:

```svelte
<script lang="ts">
	import type { ProductChainEdge, ProductChainHealth } from '$lib/game/productChainGraph';

	interface Props {
		edge: ProductChainEdge;
		source: { x: number; y: number };
		target: { x: number; y: number };
	}

	let { edge, source, target }: Props = $props();

	const path = $derived.by(() => {
		const dx = Math.max(40, (target.x - source.x) / 2);
		const c1 = { x: source.x + dx, y: source.y };
		const c2 = { x: target.x - dx, y: target.y };
		return `M ${source.x} ${source.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${target.x} ${target.y}`;
	});

	const mid = $derived({
		x: (source.x + target.x) / 2,
		y: (source.y + target.y) / 2
	});

	const stroke = $derived(healthStroke(edge.health));
	const dashArray = $derived(healthDash(edge.health));
	const ariaLabel = $derived(`${edge.label}, ${edge.health.replace(/-/g, ' ')}`);

	function healthStroke(health: ProductChainHealth): string {
		if (health === 'healthy') return 'var(--moss)';
		if (health === 'shortage' || health === 'no-local-capacity') return 'var(--wax-red)';
		if (health === 'no-report') return 'color-mix(in srgb, var(--brass-700) 50%, var(--paper-edge))';
		return 'var(--brass-700)';
	}

	function healthDash(health: ProductChainHealth): string {
		if (health === 'shortage' || health === 'no-local-capacity') return '8 4';
		return '6 4';
	}
</script>

<g
	class={['chain-route', `chain-route-${edge.health}`]}
	data-edge-id={edge.id}
	data-edge-health={edge.health}
	role="img"
	aria-label={ariaLabel}
>
	<title>{ariaLabel}</title>
	<path
		d={path}
		stroke={stroke}
		stroke-width="2.5"
		stroke-dasharray={dashArray}
		fill="none"
		marker-end={`url(#chain-route-arrow-${edge.health})`}
	/>
	<g transform={`translate(${mid.x}, ${mid.y - 8})`}>
		<rect x="-22" y="-9" width="44" height="14" fill="var(--paper-50)" stroke="var(--paper-edge)" />
		<text
			text-anchor="middle"
			dominant-baseline="middle"
			y="-2"
			font-family="var(--font-ui)"
			font-size="10"
			font-weight="700"
			fill="var(--ink-700)"
		>
			{edge.label}
		</text>
	</g>
</g>

<style>
	.chain-route path {
		animation: chain-route-flow 1.4s linear infinite;
	}

	.chain-route-shortage path,
	.chain-route-no-local-capacity path {
		animation-duration: 0.8s;
	}

	.chain-route-no-report path {
		animation: none;
	}

	@keyframes chain-route-flow {
		to {
			stroke-dashoffset: -40;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chain-route path {
			animation: none;
		}
	}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run check`
Expected: no Svelte errors for the new file. If `svelte-check` warns about unused props, double-check the component matches the snippet above.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/game/atlas/ChainRoute.svelte
git commit -m "feat: add ChainRoute atlas SVG path component"
```

---

### Task 6: Add `CompassRose.svelte` and `LegendCartouche.svelte`

**Files:**
- Create: `src/lib/components/game/atlas/CompassRose.svelte`
- Create: `src/lib/components/game/atlas/LegendCartouche.svelte`

> Both are static decorative components. No spec — they're snapshot-stable SVG/HTML with no behavior.

- [ ] **Step 1: Create `CompassRose.svelte`**

```svelte
<script lang="ts">
	interface Props {
		size?: number;
	}

	let { size = 64 }: Props = $props();
</script>

<svg
	class="compass"
	width={size}
	height={size}
	viewBox="0 0 64 64"
	fill="none"
	stroke="var(--brass-700)"
	aria-hidden="true"
>
	<circle cx="32" cy="32" r="28" stroke-width="1" />
	<circle cx="32" cy="32" r="20" stroke-width="0.5" stroke-dasharray="2 2" />
	<path d="M32 4 L36 32 L32 60 L28 32 Z" fill="var(--brass-700)" stroke="none" />
	<path d="M4 32 L32 28 L60 32 L32 36 Z" fill="var(--brass-300)" stroke="none" opacity="0.85" />
	<text
		x="32"
		y="3"
		text-anchor="middle"
		font-family="var(--font-display)"
		font-size="6"
		fill="var(--brass-700)"
	>N</text>
</svg>

<style>
	.compass {
		display: block;
		opacity: 0.65;
	}
</style>
```

- [ ] **Step 2: Create `LegendCartouche.svelte`**

```svelte
<aside class="legend" aria-hidden="true">
	<h4>· Routes ·</h4>
	<div class="row"><span class="line healthy"></span> Healthy flow</div>
	<div class="row"><span class="line shortage"></span> Shortage</div>
	<div class="row"><span class="line imports"></span> Imports</div>
</aside>

<style>
	.legend {
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--paper-50) 96%, var(--brass-100)) 0%, var(--paper-50) 100%);
		border: 1px solid var(--brass-700);
		box-shadow:
			inset 0 0 0 3px var(--paper-50),
			inset 0 0 0 4px var(--brass-700);
		padding: 12px 16px;
	}

	h4 {
		margin: 0 0 6px;
		font-family: var(--font-ui);
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--brass-700);
		text-align: center;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 5px 0;
		font-family: var(--font-body);
		font-size: 12px;
		color: var(--ink-500);
		line-height: 1;
	}

	.line {
		display: inline-block;
		width: 38px;
		height: 0;
	}

	.line.healthy {
		border-top: 2px solid var(--moss);
	}

	.line.shortage {
		border-top: 2px dashed var(--wax-red);
	}

	.line.imports {
		border-top: 2px dotted var(--royal-ink);
	}
</style>
```

- [ ] **Step 3: Verify they compile**

Run: `bun run check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/game/atlas/CompassRose.svelte src/lib/components/game/atlas/LegendCartouche.svelte
git commit -m "feat: add CompassRose and LegendCartouche atlas decorations"
```

---

### Task 7: Add `ChainMap.svelte` (canvas + decoration wrapper)

**Files:**
- Create: `src/lib/components/game/atlas/ChainMap.svelte`

> No standalone spec — exercised through `ProductChainAtlas` in Task 8.

- [ ] **Step 1: Create the component**

Create `src/lib/components/game/atlas/ChainMap.svelte`:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import CompassRose from './CompassRose.svelte';
	import LegendCartouche from './LegendCartouche.svelte';

	interface Props {
		width: number;
		height: number;
		compact: boolean;
		children: Snippet;
		broadside?: Snippet;
	}

	let { width, height, compact, children, broadside }: Props = $props();
</script>

<div
	class={['chain-map', compact && 'is-compact']}
	style:--map-width={`${width}px`}
	style:--map-height={`${height}px`}
	data-map-width={width}
	data-map-height={height}
>
	<div class="lat-grid" aria-hidden="true"></div>
	{#if !compact}
		<div class="compass-slot">
			<CompassRose />
		</div>
		<div class="legend-slot">
			<LegendCartouche />
		</div>
		{#if broadside}
			<div class="broadside-slot">
				{@render broadside()}
			</div>
		{/if}
	{/if}
	<div class="canvas">
		{@render children()}
	</div>
</div>

<style>
	.chain-map {
		position: relative;
		width: 100%;
		min-height: var(--map-height);
		border: 1px solid var(--paper-edge);
		background:
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--paper-50) 96%, var(--brass-100)) 0%,
				var(--paper-50) 70%
			);
		overflow: hidden;
	}

	.canvas {
		position: relative;
		width: 100%;
		height: var(--map-height);
		min-width: var(--map-width);
	}

	.lat-grid {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(
				0deg,
				transparent calc(50% - 0.5px),
				color-mix(in srgb, var(--brass-700) 12%, transparent) calc(50% - 0.5px),
				color-mix(in srgb, var(--brass-700) 12%, transparent) calc(50% + 0.5px),
				transparent calc(50% + 0.5px)
			),
			linear-gradient(
				90deg,
				transparent calc(50% - 0.5px),
				color-mix(in srgb, var(--brass-700) 12%, transparent) calc(50% - 0.5px),
				color-mix(in srgb, var(--brass-700) 12%, transparent) calc(50% + 0.5px),
				transparent calc(50% + 0.5px)
			);
		pointer-events: none;
	}

	.compass-slot {
		position: absolute;
		top: 14px;
		right: 14px;
		z-index: 3;
	}

	.legend-slot {
		position: absolute;
		left: 18px;
		bottom: 18px;
		z-index: 3;
	}

	.broadside-slot {
		position: absolute;
		right: 26px;
		top: 88px;
		z-index: 3;
		width: 240px;
	}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/game/atlas/ChainMap.svelte
git commit -m "feat: add ChainMap atlas canvas wrapper with compass/legend slots"
```

---

### Task 8: Add `ProductChainAtlas.svelte` + spec (selection + empty-state)

**Files:**
- Create: `src/lib/components/game/atlas/ProductChainAtlas.svelte`
- Create: `src/lib/components/game/atlas/ProductChainAtlas.svelte.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/components/game/atlas/ProductChainAtlas.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildProductChainGraph } from '$lib/game/productChainGraph';
import { createNewGame } from '$lib/game/state';
import ProductChainAtlas from './ProductChainAtlas.svelte';

describe('ProductChainAtlas', () => {
	it('renders the empty message when graph.emptyReason is set', async () => {
		expect.assertions(1);
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph: {
				id: 'chain:none',
				title: 'No chain',
				nodes: [],
				edges: [],
				details: {},
				warnings: [],
				emptyReason: 'No local production chain available for this category yet.'
			},
			selectedNodeId: null,
			onSelectNode
		});

		await expect
			.element(page.getByText('No local production chain available for this category yet.'))
			.toBeVisible();
	});

	it('renders one button per graph node with correct aria-pressed for the selected one', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const firstNode = graph.nodes[0]!;
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph,
			selectedNodeId: firstNode.id,
			onSelectNode
		});

		const buttons = page.getByRole('button');
		await expect.element(buttons.first()).toBeVisible();
		// Vitest 4's BrowserPage has no .locator(); use getByRole with the aria-label.
		await expect
			.element(page.getByRole('button', { name: `${firstNode.label}, ${firstNode.healthLabel}` }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('clears selection when the graph id changes', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);
		const snacks = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const drinks = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'drinks'
		});
		const onSelectNode = vi.fn();
		const view = render(ProductChainAtlas, {
			graph: snacks,
			selectedNodeId: snacks.nodes[0]!.id,
			onSelectNode
		});

		view.rerender({
			graph: drinks,
			selectedNodeId: snacks.nodes[0]!.id,
			onSelectNode
		});

		await expect
			.poll(() => onSelectNode.mock.calls.some(([nodeId]) => nodeId === null))
			.toBe(true);
	});

	it('emits the node id when a node button is clicked', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const firstNode = graph.nodes[0]!;
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph,
			selectedNodeId: null,
			onSelectNode
		});

		// Vitest 4's BrowserPage has no .locator(); use getByRole with the aria-label.
		await page
			.getByRole('button', { name: `${firstNode.label}, ${firstNode.healthLabel}` })
			.click();
		expect(onSelectNode).toHaveBeenCalledWith(firstNode.id);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- src/lib/components/game/atlas/ProductChainAtlas.svelte.spec.ts --project client --run`
Expected: FAIL with `Cannot find module './ProductChainAtlas.svelte'`.

- [ ] **Step 3: Implement `ProductChainAtlas.svelte`**

Create `src/lib/components/game/atlas/ProductChainAtlas.svelte`:

```svelte
<script lang="ts">
	import type { ProductChainGraph } from '$lib/game/productChainGraph';
	import ChainMap from './ChainMap.svelte';
	import ChainNode from './ChainNode.svelte';
	import ChainRoute from './ChainRoute.svelte';

	interface Props {
		graph: ProductChainGraph;
		selectedNodeId: string | null;
		compact?: boolean;
		onSelectNode: (nodeId: string | null) => void;
		broadside?: import('svelte').Snippet;
	}

	let { graph, selectedNodeId, compact = false, onSelectNode, broadside }: Props = $props();

	let previousGraphId = $state<string | null>(null);

	const xStep = $derived(compact ? 155 : 210);
	const yStep = $derived(compact ? 92 : 124);
	const xPad = $derived(compact ? 30 : 60);
	const yPad = $derived(compact ? 30 : 60);

	const positioned = $derived.by(() =>
		graph.nodes.map((node) => ({
			node,
			position: {
				x: node.layer * xStep + xPad,
				y: node.row * yStep + yPad
			}
		}))
	);

	const centers = $derived.by(() => {
		const map = new Map<string, { x: number; y: number }>();
		const halfX = compact ? 52 : 66;
		const halfY = compact ? 46 : 60;
		for (const { node, position } of positioned) {
			map.set(node.id, { x: position.x + halfX, y: position.y + halfY });
		}
		return map;
	});

	const layout = $derived.by(() => {
		let maxX = 0;
		let maxY = 0;
		for (const { position } of positioned) {
			maxX = Math.max(maxX, position.x + (compact ? 104 : 132));
			maxY = Math.max(maxY, position.y + (compact ? 110 : 150));
		}
		return {
			width: Math.max(maxX + xPad, compact ? 520 : 880),
			height: Math.max(maxY + yPad, compact ? 280 : 460)
		};
	});

	$effect(() => {
		if (previousGraphId === null) {
			previousGraphId = graph.id;
			return;
		}
		if (graph.id !== previousGraphId) {
			previousGraphId = graph.id;
			onSelectNode(null);
			return;
		}
		if (selectedNodeId && !graph.details[selectedNodeId]) {
			onSelectNode(null);
		}
	});

	function handleCanvasClick(event: MouseEvent): void {
		if (event.target === event.currentTarget) {
			onSelectNode(null);
		}
	}
</script>

<section class={['product-chain-atlas', compact && 'is-compact']} aria-label={graph.title}>
	{#if graph.emptyReason}
		<p class="empty">{graph.emptyReason}</p>
	{:else if graph.nodes.length === 0}
		<p class="empty">No graph nodes are available for this chain.</p>
	{:else}
		<ChainMap width={layout.width} height={layout.height} {compact} {broadside}>
			<div
				class="canvas-inner"
				role="presentation"
				onclick={handleCanvasClick}
				style:width={`${layout.width}px`}
				style:height={`${layout.height}px`}
				data-testid={`product-chain-graph-${graph.id}`}
			>
				<svg
					class="routes"
					width={layout.width}
					height={layout.height}
					viewBox={`0 0 ${layout.width} ${layout.height}`}
					aria-hidden="true"
				>
					<defs>
						{#each ['healthy', 'watch', 'shortage', 'no-local-capacity', 'no-report'] as health (health)}
							<marker
								id={`chain-route-arrow-${health}`}
								viewBox="0 0 10 10"
								refX="9"
								refY="5"
								markerWidth="6"
								markerHeight="6"
								orient="auto"
							>
								<path
									d="M0,0 L10,5 L0,10 z"
									fill={health === 'healthy'
										? 'var(--moss)'
										: health === 'shortage' || health === 'no-local-capacity'
											? 'var(--wax-red)'
											: 'var(--brass-700)'}
								/>
							</marker>
						{/each}
					</defs>
					{#each graph.edges as edge (edge.id)}
						{@const source = centers.get(edge.source)}
						{@const target = centers.get(edge.target)}
						{#if source && target}
							<ChainRoute {edge} {source} {target} />
						{/if}
					{/each}
				</svg>
				{#each positioned as item (item.node.id)}
					<ChainNode
						node={item.node}
						selected={item.node.id === selectedNodeId}
						{compact}
						position={item.position}
						onSelect={(id) => onSelectNode(id)}
					/>
				{/each}
			</div>
		</ChainMap>
		{#if graph.warnings.length > 0}
			<ul class="warnings" aria-label={`${graph.title} warnings`}>
				{#each graph.warnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<style>
	.product-chain-atlas {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
		color: var(--ink-700);
	}

	.canvas-inner {
		position: relative;
	}

	.routes {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.warnings {
		margin: 0;
		padding-left: 1rem;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.86rem;
		line-height: 1.4;
	}

	.empty {
		margin: 0;
		border: 1px solid var(--paper-edge);
		border-radius: 3px;
		background: var(--paper-50);
		padding: 0.85rem;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.9rem;
		line-height: 1.45;
	}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- src/lib/components/game/atlas/ProductChainAtlas.svelte.spec.ts --project client --run`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/atlas/ProductChainAtlas.svelte src/lib/components/game/atlas/ProductChainAtlas.svelte.spec.ts
git commit -m "feat: add ProductChainAtlas renderer with SVG routes and DOM nodes"
```

---

### Task 9: Add `NodeBroadside.svelte` + spec

**Files:**
- Create: `src/lib/components/game/atlas/NodeBroadside.svelte`
- Create: `src/lib/components/game/atlas/NodeBroadside.svelte.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/game/atlas/NodeBroadside.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ProductChainNode } from '$lib/game/productChainGraph';
import NodeBroadside from './NodeBroadside.svelte';

function shortageRecipeNode(): ProductChainNode {
	return {
		id: 'recipe:flour-from-grain',
		kind: 'recipe',
		label: 'Flour mill',
		materialId: null,
		recipeId: 'flour-from-grain',
		stage: 'process',
		layer: 1,
		row: 0,
		health: 'shortage',
		healthLabel: 'Shortage',
		warehouseStock: 0,
		capacity: { buildingCount: 1, outputPerDay: 20, inputPerDay: 20 },
		actual: {
			produced: 14,
			consumed: 22,
			importedInput: 0,
			warehousePulled: 0,
			shopImported: 0,
			unitsSold: 0,
			demandMissed: 8
		},
		bottleneck: 'Insufficient flour input for the bakery.'
	};
}

describe('NodeBroadside', () => {
	it('renders the empty prompt when no node is selected', async () => {
		expect.assertions(1);
		render(NodeBroadside, { node: null });
		await expect
			.element(page.getByText('Select a graph node to inspect its latest flow metrics.'))
			.toBeVisible();
	});

	it('renders the node label, status, bottleneck, and metrics', async () => {
		expect.assertions(5);
		render(NodeBroadside, { node: shortageRecipeNode() });
		await expect.element(page.getByRole('heading', { name: 'Flour mill' })).toBeVisible();
		await expect.element(page.getByText('Shortage')).toBeVisible();
		await expect.element(page.getByText('Insufficient flour input for the bakery.')).toBeVisible();
		await expect.element(page.getByText('Missed').first()).toBeVisible();
		await expect.element(page.getByText('8')).toBeVisible();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/atlas/NodeBroadside.svelte.spec.ts --project client --run`
Expected: FAIL with `Cannot find module './NodeBroadside.svelte'`.

- [ ] **Step 3: Implement `NodeBroadside.svelte`**

Create `src/lib/components/game/atlas/NodeBroadside.svelte`:

```svelte
<script lang="ts">
	import type { ProductChainNode } from '$lib/game/productChainGraph';

	interface Props {
		node: ProductChainNode | null;
	}

	let { node }: Props = $props();

	const headingId = $props.id();
	const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

	const metrics = $derived.by(() => {
		if (!node) return [];
		return [
			{ label: 'Buildings', value: numberFormat.format(node.capacity.buildingCount) },
			{
				label: 'Capacity',
				value: `${numberFormat.format(node.capacity.outputPerDay)} out / ${numberFormat.format(
					node.capacity.inputPerDay
				)} in`
			},
			{ label: 'Produced', value: numberFormat.format(node.actual.produced) },
			{ label: 'Consumed', value: numberFormat.format(node.actual.consumed) },
			{
				label: 'Imported',
				value: numberFormat.format(node.actual.importedInput + node.actual.shopImported)
			},
			{ label: 'Sold', value: numberFormat.format(node.actual.unitsSold) },
			{ label: 'Missed', value: numberFormat.format(node.actual.demandMissed) },
			{ label: 'Stock', value: numberFormat.format(node.warehouseStock) }
		];
	});
</script>

<section class="broadside" aria-labelledby={headingId}>
	{#if node}
		<span class="sub">Inspected node</span>
		<h3 id={headingId}>{node.label}</h3>
		<span class={['status', `status-${node.health}`]}>{node.healthLabel}</span>
		{#if node.bottleneck}
			<p class="verdict">{node.bottleneck}</p>
		{/if}
		<dl>
			{#each metrics as metric (metric.label)}
				<div>
					<dt>{metric.label}</dt>
					<dd>{metric.value}</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<h3 id={headingId}>Chain node</h3>
		<p>Select a graph node to inspect its latest flow metrics.</p>
	{/if}
</section>

<style>
	.broadside {
		display: grid;
		gap: 0.65rem;
		min-width: 0;
		padding: 14px 14px 12px;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--paper-50) 96%, var(--brass-100)) 0%, var(--paper-50) 100%);
		border: 1px solid var(--brass-700);
		box-shadow:
			inset 0 0 0 3px var(--paper-50),
			inset 0 0 0 4px var(--brass-700),
			0 12px 20px rgba(20, 12, 4, 0.25);
		color: var(--ink-700);
	}

	.sub {
		font-family: var(--font-ui);
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 400;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.status {
		width: fit-content;
		padding: 2px 6px;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--paper-50);
		background: var(--moss);
		border-radius: 1px;
	}

	.status-watch,
	.status-no-report {
		background: var(--brass-700);
	}

	.status-shortage,
	.status-no-local-capacity {
		background: var(--wax-red);
	}

	.verdict {
		margin: 0;
		padding: 6px 8px;
		border-left: 3px solid var(--wax-red);
		background: color-mix(in srgb, var(--wax-red) 6%, var(--paper-50));
		font-family: var(--font-body);
		font-size: 12.5px;
		color: var(--ink-700);
		line-height: 1.45;
	}

	dl {
		margin: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 12px;
	}

	dl > div {
		border-top: 1px solid var(--paper-edge);
		padding-top: 3px;
	}

	dt {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	dd {
		margin: 1px 0 0;
		font-family: var(--font-mono);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--ink-700);
	}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/components/game/atlas/NodeBroadside.svelte.spec.ts --project client --run`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/atlas/NodeBroadside.svelte src/lib/components/game/atlas/NodeBroadside.svelte.spec.ts
git commit -m "feat: add NodeBroadside detail card to replace ProductChainNodeDetail"
```

---

### Task 10: Add `CategoryStampIndex.svelte` + spec

**Files:**
- Create: `src/lib/components/game/atlas/CategoryStampIndex.svelte`
- Create: `src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ProductChainCategorySummary } from '$lib/game/productChainGraph';
import CategoryStampIndex from './CategoryStampIndex.svelte';

function summary(overrides: Partial<ProductChainCategorySummary>): ProductChainCategorySummary {
	return {
		categoryId: 'snacks',
		name: 'Snacks',
		health: 'healthy',
		healthLabel: 'Healthy',
		bottleneck: '',
		warehouseStock: 100,
		produced: 30,
		consumed: 28,
		imported: 0,
		...overrides
	};
}

describe('CategoryStampIndex', () => {
	it('renders one stamp per summary with status seal text', async () => {
		expect.assertions(2);
		const onSelectCategory = vi.fn();
		render(CategoryStampIndex, {
			summaries: [
				summary({ categoryId: 'snacks', name: 'Snacks', health: 'shortage', healthLabel: 'Shortage' }),
				summary({ categoryId: 'drinks', name: 'Drinks' })
			],
			activeCategoryId: 'snacks',
			mode: 'store-categories',
			onSelectCategory
		});

		await expect.element(page.getByRole('button', { name: /Snacks/i })).toBeVisible();
		await expect.element(page.getByText('Shortage')).toBeVisible();
	});

	it('marks the active stamp with aria-pressed when in store-categories mode', async () => {
		expect.assertions(1);
		const onSelectCategory = vi.fn();
		render(CategoryStampIndex, {
			summaries: [summary({ categoryId: 'snacks', name: 'Snacks' })],
			activeCategoryId: 'snacks',
			mode: 'store-categories',
			onSelectCategory
		});

		await expect
			.element(page.locator('button[data-category-id="snacks"]'))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('does not mark stamps active when in warehouse-flow mode', async () => {
		expect.assertions(1);
		const onSelectCategory = vi.fn();
		render(CategoryStampIndex, {
			summaries: [summary({ categoryId: 'snacks', name: 'Snacks' })],
			activeCategoryId: 'snacks',
			mode: 'warehouse-flow',
			onSelectCategory
		});

		await expect
			.element(page.locator('button[data-category-id="snacks"]'))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('calls onSelectCategory when a stamp is clicked', async () => {
		expect.assertions(1);
		const onSelectCategory = vi.fn();
		render(CategoryStampIndex, {
			summaries: [summary({ categoryId: 'snacks', name: 'Snacks' })],
			activeCategoryId: null,
			mode: 'store-categories',
			onSelectCategory
		});

		await page.locator('button[data-category-id="snacks"]').click();
		expect(onSelectCategory).toHaveBeenCalledWith('snacks');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts --project client --run`
Expected: FAIL with `Cannot find module './CategoryStampIndex.svelte'`.

- [ ] **Step 3: Implement `CategoryStampIndex.svelte`**

Create `src/lib/components/game/atlas/CategoryStampIndex.svelte`:

```svelte
<script lang="ts">
	import { INDUSTRY_MATERIAL_ART } from '$lib/assets/gameArt';
	import { formatQuantity, type ProductChainCategorySummary } from '$lib/game/productChainGraph';
	import type { MaterialId } from '$lib/game/types';

	interface Props {
		summaries: ProductChainCategorySummary[];
		activeCategoryId: string | null;
		mode: 'store-categories' | 'warehouse-flow';
		onSelectCategory: (categoryId: string) => void;
	}

	let { summaries, activeCategoryId, mode, onSelectCategory }: Props = $props();

	function iconFor(categoryId: string): string | null {
		return INDUSTRY_MATERIAL_ART[categoryId as MaterialId] ?? null;
	}
</script>

<div class="stamp-index" role="group" aria-label="Product category index">
	{#each summaries as summary (summary.categoryId)}
		{@const active = mode === 'store-categories' && activeCategoryId === summary.categoryId}
		{@const icon = iconFor(summary.categoryId)}
		<button
			type="button"
			class={['stamp', `stamp-${summary.health}`, active && 'is-active']}
			data-category-id={summary.categoryId}
			aria-pressed={active}
			onclick={() => onSelectCategory(summary.categoryId)}
		>
			<span class={['seal', `seal-${summary.health}`]}>{summary.healthLabel}</span>
			<span class="name">{summary.name}</span>
			{#if icon}
				<span class="icons"><img src={icon} alt={summary.name} /></span>
			{/if}
			<span class="nums">
				stock {formatQuantity(summary.warehouseStock)} ·
				made {formatQuantity(summary.produced)}/d ·
				sold {formatQuantity(summary.consumed)}/d
			</span>
		</button>
	{/each}
</div>

<style>
	.stamp-index {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 0.75rem;
	}

	.stamp {
		display: grid;
		gap: 4px;
		padding: 12px 14px;
		background: color-mix(in srgb, var(--paper-50) 92%, var(--brass-100));
		border: 1px solid var(--paper-edge);
		text-align: left;
		color: var(--ink-700);
		font: inherit;
		cursor: pointer;
	}

	.stamp:hover {
		border-color: var(--brass-700);
	}

	.stamp.is-active {
		border-color: var(--brass-700);
		box-shadow:
			inset 0 0 0 1px var(--brass-700),
			0 0 0 3px color-mix(in srgb, var(--brass-700) 18%, transparent);
	}

	.seal {
		width: fit-content;
		padding: 2px 6px;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--paper-50);
		background: var(--moss);
	}

	.seal-watch,
	.seal-no-report {
		background: var(--brass-700);
	}

	.seal-shortage,
	.seal-no-local-capacity {
		background: var(--wax-red);
	}

	.name {
		font-family: var(--font-display);
		font-size: 17px;
		line-height: 1.1;
		color: var(--ink-700);
	}

	.icons {
		display: flex;
		gap: 4px;
		margin-top: 2px;
	}

	.icons img {
		width: 22px;
		height: 22px;
		padding: 1px;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 50%;
		image-rendering: pixelated;
	}

	.nums {
		font-family: var(--font-mono);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--ink-500);
	}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts --project client --run`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/atlas/CategoryStampIndex.svelte src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts
git commit -m "feat: add CategoryStampIndex to replace summary-grid"
```

---

### Task 11: Refit `ProductChainsPanel.svelte` to use the new atlas components

**Files:**
- Modify: `src/lib/components/game/ProductChainsPanel.svelte`
- Modify: `src/lib/components/game/ProductChainsPanel.svelte.spec.ts`

- [ ] **Step 1: Inspect existing spec assertions**

Run: `bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts --project client --run`
Capture the current passing assertions. Note: tests reference `.summary-grid` buttons and the Svelte Flow graph. Selectors will need to switch to `button[data-category-id]` and `[data-testid^="product-chain-graph-"]`.

- [ ] **Step 2: Rewrite `ProductChainsPanel.svelte`**

Replace the contents of `src/lib/components/game/ProductChainsPanel.svelte` with:

```svelte
<script lang="ts">
	import CategoryStampIndex from '$lib/components/game/atlas/CategoryStampIndex.svelte';
	import NodeBroadside from '$lib/components/game/atlas/NodeBroadside.svelte';
	import ProductChainAtlas from '$lib/components/game/atlas/ProductChainAtlas.svelte';
	import {
		buildProductChainGraph,
		buildStoreCategoryChainSummaries,
		buildWarehouseFlowGraph,
		getSupportedStoreChainCategories
	} from '$lib/game/productChainGraph';
	import type { GameState } from '$lib/game/types';

	interface Props {
		game: GameState;
	}

	type ChainMode = 'store-categories' | 'warehouse-flow';

	interface NodeSelection {
		graphId: string | null;
		nodeId: string | null;
	}

	let { game }: Props = $props();

	let mode = $state<ChainMode>('store-categories');
	let selectedCategoryId = $state<string | null>(null);
	let nodeSelection = $state<NodeSelection>({ graphId: null, nodeId: null });

	const summaries = $derived(buildStoreCategoryChainSummaries(game));
	const defaultCategoryId = $derived(
		game.stores.flatMap((store) => getSupportedStoreChainCategories(store))[0]?.id ?? null
	);
	const activeCategory = $derived.by(
		() =>
			summaries.find((summary) => summary.categoryId === selectedCategoryId) ??
			summaries.find((summary) => summary.categoryId === defaultCategoryId) ??
			summaries[0] ??
			null
	);
	const categoryGraph = $derived(
		activeCategory
			? buildProductChainGraph({
					game,
					store: null,
					categoryId: activeCategory.categoryId
				})
			: null
	);
	const warehouseGraph = $derived(buildWarehouseFlowGraph(game));
	const graph = $derived(mode === 'warehouse-flow' ? warehouseGraph : categoryGraph);
	const activeNodeId = $derived(
		graph && nodeSelection.graphId === graph.id ? nodeSelection.nodeId : null
	);
	const selectedNode = $derived(graph && activeNodeId ? graph.details[activeNodeId] : null);

	function selectCategory(categoryId: string): void {
		mode = 'store-categories';
		selectedCategoryId = categoryId;
		nodeSelection = { graphId: null, nodeId: null };
	}

	function selectMode(nextMode: ChainMode): void {
		mode = nextMode;
		nodeSelection = { graphId: null, nodeId: null };
	}

	function selectNode(nodeId: string | null): void {
		nodeSelection = { graphId: graph?.id ?? null, nodeId };
	}
</script>

<section class="panel paper product-chains-panel atlas-sheet" aria-labelledby="product-chains-heading">
	<div class="sheet-head">
		<div>
			<p class="eyebrow">Folio II · Production Chain</p>
			<h2 id="product-chains-heading">{activeCategory?.name ?? 'Product Chains'}</h2>
		</div>
		<div class="mode-toggle" role="group" aria-label="Product chain view">
			<button
				type="button"
				class:active={mode === 'store-categories'}
				aria-pressed={mode === 'store-categories'}
				onclick={() => selectMode('store-categories')}
			>
				Store category chains
			</button>
			<button
				type="button"
				class:active={mode === 'warehouse-flow'}
				aria-pressed={mode === 'warehouse-flow'}
				onclick={() => selectMode('warehouse-flow')}
			>
				Warehouse flow
			</button>
		</div>
	</div>

	<div class="sheet-rule" aria-hidden="true"></div>

	{#if summaries.length > 0}
		<CategoryStampIndex
			{summaries}
			activeCategoryId={activeCategory?.categoryId ?? null}
			{mode}
			onSelectCategory={selectCategory}
		/>
	{:else}
		<p class="empty">No store categories have local production chains yet.</p>
	{/if}

	{#if graph}
		<ProductChainAtlas {graph} selectedNodeId={activeNodeId} onSelectNode={selectNode}>
			{#snippet broadside()}
				<NodeBroadside node={selectedNode} />
			{/snippet}
		</ProductChainAtlas>
	{:else}
		<p class="empty">No chain graph is available.</p>
	{/if}
</section>

<style>
	.product-chains-panel {
		display: grid;
		gap: 1rem;
		padding: 1.1rem 1.2rem;
	}

	.sheet-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.sheet-head div {
		min-width: 0;
	}

	.sheet-rule {
		border-top: 1px solid var(--brass-700);
		border-bottom: 3px double var(--brass-700);
		height: 5px;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.4rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.eyebrow {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}

	.mode-toggle {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		justify-content: flex-end;
	}

	.mode-toggle button {
		min-height: 2rem;
		padding: 0.35rem 0.55rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		color: var(--ink-700);
		cursor: pointer;
	}

	.mode-toggle button.active {
		border-color: var(--brass-700);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--brass-700) 16%, transparent);
	}

	.empty {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.92rem;
		line-height: 1.45;
	}

	@media (max-width: 980px) {
		.sheet-head {
			display: grid;
		}

		.mode-toggle {
			justify-content: flex-start;
		}
	}
</style>
```

- [ ] **Step 3: Update `ProductChainsPanel.svelte.spec.ts`**

Replace failing selectors so the spec matches the new DOM. Open `src/lib/components/game/ProductChainsPanel.svelte.spec.ts` and adjust each assertion that referenced the old `.summary-grid` button or Svelte Flow nodes. For example:

- `page.locator('.summary-grid button').first()` → `page.locator('button[data-category-id]').first()`
- Assertions on `aria-pressed` for category buttons remain valid — the new component preserves that attribute.
- Any selector referencing the Svelte Flow node (`page.locator('.svelte-flow__node')` etc.) → `page.locator('button[data-node-id]').first()`.

> If you cannot locate every selector to migrate, run `bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts --project client --run` and update each failing locator in sequence.

- [ ] **Step 4: Run tests to verify everything passes**

Run: `bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts --project client --run`
Expected: PASS for every assertion. If something still fails, the diff between old and new DOM is the only reasonable cause — fix the selector, never weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/ProductChainsPanel.svelte src/lib/components/game/ProductChainsPanel.svelte.spec.ts
git commit -m "feat: refit ProductChainsPanel as atlas sheet with stamp index and broadside"
```

---

### Task 12: Refit `StoreProductChainPanel.svelte`

**Files:**
- Modify: `src/lib/components/game/StoreProductChainPanel.svelte`
- Modify: `src/lib/components/game/StoreProductChainPanel.svelte.spec.ts`

- [ ] **Step 1: Rewrite `StoreProductChainPanel.svelte`**

Replace contents with:

```svelte
<script lang="ts">
	import NodeBroadside from '$lib/components/game/atlas/NodeBroadside.svelte';
	import ProductChainAtlas from '$lib/components/game/atlas/ProductChainAtlas.svelte';
	import {
		buildProductChainGraph,
		getSupportedStoreChainCategories
	} from '$lib/game/productChainGraph';
	import type { GameState, Store } from '$lib/game/types';

	interface Props {
		game: GameState;
		store: Store;
	}

	interface StoreChainSelection {
		storeId: string | null;
		categoryId: string | null;
		nodeId: string | null;
	}

	let { game, store }: Props = $props();

	let selection = $state<StoreChainSelection>({ storeId: null, categoryId: null, nodeId: null });
	let previousStoreId = $state<string | null>(null);

	const selectId = $props.id();
	const supportedCategories = $derived(getSupportedStoreChainCategories(store));
	const activeSelection = $derived.by(
		(): StoreChainSelection =>
			selection.storeId === store.id
				? selection
				: { storeId: store.id, categoryId: null, nodeId: null }
	);
	const selectedCategory = $derived.by(
		() =>
			supportedCategories.find((category) => category.id === activeSelection.categoryId) ??
			supportedCategories[0] ??
			null
	);
	const graph = $derived(
		selectedCategory
			? buildProductChainGraph({ game, store, categoryId: selectedCategory.id })
			: null
	);
	const selectedNode = $derived(
		graph && activeSelection.nodeId ? graph.details[activeSelection.nodeId] : null
	);

	$effect(() => {
		if (previousStoreId === store.id) return;
		previousStoreId = store.id;
		selection = { storeId: store.id, categoryId: null, nodeId: null };
	});

	function selectCategory(event: Event): void {
		selection = {
			storeId: store.id,
			categoryId: (event.currentTarget as HTMLSelectElement).value,
			nodeId: null
		};
	}

	function selectNode(nodeId: string | null): void {
		selection = {
			storeId: store.id,
			categoryId: selectedCategory?.id ?? activeSelection.categoryId,
			nodeId
		};
	}
</script>

<section class="store-chain-panel" aria-label={`${store.name} product chain`}>
	{#if supportedCategories.length > 0 && selectedCategory && graph}
		<div class="chain-controls">
			<label for={selectId}>Product category</label>
			<select id={selectId} value={selectedCategory.id} onchange={selectCategory}>
				{#each supportedCategories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</div>

		<div class="chain-content">
			<ProductChainAtlas
				{graph}
				selectedNodeId={activeSelection.nodeId}
				compact
				onSelectNode={selectNode}
			/>
			<NodeBroadside node={selectedNode} />
		</div>
	{:else}
		<p class="empty">No local production chain available for this store's categories yet.</p>
	{/if}
</section>

<style>
	.store-chain-panel {
		display: grid;
		gap: 0.85rem;
		min-width: 0;
		color: var(--ink-700);
	}

	.chain-controls {
		display: grid;
		gap: 0.35rem;
	}

	label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	select {
		width: 100%;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.92rem;
		padding: 0.45rem 0.55rem;
	}

	.chain-content {
		display: grid;
		gap: 0.85rem;
		min-width: 0;
	}

	.empty {
		margin: 0;
		border: 1px dashed var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.9rem;
		line-height: 1.45;
		padding: 0.8rem;
	}
</style>
```

- [ ] **Step 2: Update `StoreProductChainPanel.svelte.spec.ts`**

Open `src/lib/components/game/StoreProductChainPanel.svelte.spec.ts` and migrate selectors the same way as Task 11 (any `.svelte-flow__node` → `button[data-node-id]`, etc.). Do not weaken assertions.

- [ ] **Step 3: Run tests**

Run: `bun run test:unit -- src/lib/components/game/StoreProductChainPanel.svelte.spec.ts --project client --run`
Expected: PASS for every assertion.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/game/StoreProductChainPanel.svelte src/lib/components/game/StoreProductChainPanel.svelte.spec.ts
git commit -m "feat: refit StoreProductChainPanel to use compact atlas"
```

---

### Task 13: Delete old `ProductChainGraph`, `ProductChainNodeDetail`, `ProductChainSelectionBridge`

**Files:**
- Delete: `src/lib/components/game/ProductChainGraph.svelte`
- Delete: `src/lib/components/game/ProductChainGraph.svelte.spec.ts`
- Delete: `src/lib/components/game/ProductChainNodeDetail.svelte`
- Delete: `src/lib/components/game/ProductChainSelectionBridge.svelte`

- [ ] **Step 1: Verify no remaining imports**

Run: `grep -rn "ProductChainGraph\b\|ProductChainNodeDetail\|ProductChainSelectionBridge" src/`
Expected: zero matches (or only matches within the doomed files themselves, if grep includes them — confirm none point to source files outside `src/lib/components/game/atlas/`).

- [ ] **Step 2: Delete the files**

```bash
rm src/lib/components/game/ProductChainGraph.svelte
rm src/lib/components/game/ProductChainGraph.svelte.spec.ts
rm src/lib/components/game/ProductChainNodeDetail.svelte
rm src/lib/components/game/ProductChainSelectionBridge.svelte
```

- [ ] **Step 3: Verify type checking is clean**

Run: `bun run check`
Expected: zero errors. If `svelte-check` complains about a stale import in a route or test file, search-replace it to the new atlas path.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove ProductChainGraph and its xyflow dependencies"
```

---

### Task 14: Remove `@xyflow/svelte` from `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Confirm no remaining imports of xyflow**

Run: `grep -rn "@xyflow" src/`
Expected: zero matches.

- [ ] **Step 2: Remove the dependency entry**

Open `package.json` and delete the line containing `"@xyflow/svelte": "^1.5.2"` from the `dependencies` block (mind the trailing comma on the previous line).

- [ ] **Step 3: Refresh the lockfile**

Run: `bun install`
Expected: lockfile updates; no install errors.

- [ ] **Step 4: Verify build + check still work**

Run in parallel:
```
bun run check
bun run build
```
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: drop @xyflow/svelte after atlas redesign"
```

> If the lockfile name in this repo is `bun.lockb` instead of `bun.lock`, adjust the `git add` accordingly. Run `ls -la | grep -i lock` to confirm.

---

### Task 15: Extend `retail-sim.e2e.ts` with one stamp-click assertion

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Find the right insertion point**

Open `src/routes/retail-sim.e2e.ts`. Look for the test that opens the Control Tower / Product Chains panel (search the file for `Product Chains` or `product-chains`). If no such test exists yet, the next step adds a fresh test rather than extending an existing one.

- [ ] **Step 2: Add the new test**

Append a new test inside the existing `test.describe` block (or top-level if there isn't one):

```ts
test('clicking a category stamp updates the atlas sheet title', async ({ page }) => {
	await page.goto('/');
	// Open Product Chains panel — the exact selector depends on the panel toggle button
	// rendered by +page.svelte. Look for a visible button with text 'Product Chains' or
	// similar; this project's e2e tests have established patterns — match them.
	await page.getByRole('button', { name: /product chains/i }).click();

	const firstStamp = page.locator('button[data-category-id]').first();
	await firstStamp.waitFor({ state: 'visible' });
	const categoryName = (await firstStamp.locator('.name').innerText()).trim();
	await firstStamp.click();

	await expect(page.locator('#product-chains-heading')).toHaveText(categoryName);
});
```

> Note: the actual button text for opening the Product Chains panel may not be `Product Chains`. Inspect `src/routes/+page.svelte` around `<ProductChainsPanel` (line ~852) to confirm — it may be exposed via an always-visible panel rather than a toggle. If always-visible, drop the first `click()` line.

- [ ] **Step 3: Run the e2e**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "clicking a category stamp"`
Expected: PASS. First-run will take longer because Playwright builds + previews.

- [ ] **Step 4: Commit**

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test(e2e): assert stamp click updates atlas sheet heading"
```

---

### Task 16: Full verification + manual smoke test

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full unit suite**

Run: `bun run test:unit --run`
Expected: PASS across both `client` and `server` projects.

- [ ] **Step 2: Run the full e2e suite**

Run: `bun run test:e2e`
Expected: PASS for every spec.

- [ ] **Step 3: Run lint and type check**

Run in parallel:
```
bun run lint
bun run check
```
Expected: zero errors.

- [ ] **Step 4: Manual smoke test**

Start the dev server: `bun run dev`. In a browser at `http://localhost:5173`:

1. Open the Product Chains panel.
2. Confirm the sheet header reads `Folio II · Production Chain` with a category-name title and the mode-toggle on the right.
3. Confirm the stamp index renders one stamp per supported category with a real product icon.
4. Click a stamp — atlas updates to that category, sheet title updates, broadside is reset.
5. Click a node in the atlas — broadside on the right of the map shows the node label, status, bottleneck (if any), and metrics.
6. Switch to `Warehouse flow` mode — atlas updates to the warehouse-centered graph, broadside resets, stamp index loses its active highlight (matches `aria-pressed=false` everywhere).
7. Open a store inspector, switch to its Product Chain tab — the compact atlas renders below the category select. Click a node — broadside below the atlas updates.
8. Trigger `prefers-reduced-motion` in browser DevTools (Rendering → Emulate CSS media) — confirm route dashes stop animating.

If any step fails, open a follow-up issue; do not paper over with weakened assertions.

- [ ] **Step 5: Final commit (if any cleanup)**

If steps 1–4 surfaced trivial fixes:

```bash
git add -A
git commit -m "chore: polish after atlas redesign smoke test"
```

Otherwise this task has nothing to commit.

---

## Self-Review Notes

The plan covers each requirement in the spec:

- **Visual system** — Tasks 3 (ChainNode), 5 (ChainRoute), 6 (CompassRose + LegendCartouche), 7 (ChainMap), 8 (ProductChainAtlas assembly), 9 (NodeBroadside), 10 (CategoryStampIndex).
- **Component architecture** — Tasks 8/11/12/13.
- **Data flow & icon resolution** — Tasks 1 (RECIPE_BUILDING_ART) and 2 (chainNodeArt).
- **Layout & positioning** — Task 8 (positioning logic in `ProductChainAtlas`).
- **Accessibility** — Tasks 3 (aria-label, aria-pressed, focus ring), 5 (`@media prefers-reduced-motion`), 6 (`aria-hidden` on decoration), 8 (svg `aria-hidden`).
- **Testing** — Each implementation task ships its own spec; Task 11/12 migrate existing panel specs; Task 15 adds the e2e assertion; Task 16 runs the full suite + manual smoke.
- **Dependency removal** — Task 14.

No placeholders ("TBD", "TODO", "add appropriate X") found in any step. Type names (`ChainNodeArt`, `ProductChainNode`, `ProductChainCategorySummary`, `ProductChainEdge`, `ProductChainGraph`, `ProductChainHealth`) are consistent throughout. Function signatures introduced in earlier tasks (`chainNodeArt(node) → ChainNodeArt`, `RECIPE_BUILDING_ART: Record<ProductionRecipeId, string>`) are used unchanged in later tasks.
