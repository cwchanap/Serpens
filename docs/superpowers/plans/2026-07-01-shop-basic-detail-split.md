# Shop Info — Basic Card + Detail Popup Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the cramped 360px store inspector into a compact, glanceable **Basic card** (identity, vital gauges, upgrade, "Open Details") and a large **Detail popup** that hosts the heavy Stock / Product Chain / Staff tabs — Part 2 of `docs/superpowers/specs/2026-07-01-game-hud-inspector-industry-ux-design.md`.

**Architecture:** A new `StoreDetailModal.svelte` (large centered modal, mirroring the existing control-tower overlay pattern) hosts three tabs whose panels reuse the existing `StoreStockTable`, `StoreProductChainPanel`, and `StoreStaffPanel` components. `TileInspector.svelte` slims to the Basic card (store) plus the unchanged empty-tile stats. `+page.svelte` owns an `isStoreDetailOpen` toggle and renders the modal. No game-logic changes.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Tailwind v4, scoped `<style>`, Vitest (`vitest-browser-svelte`), Playwright e2e.

## Global Constraints

- Svelte 5 runes only. Every Vitest test contains ≥1 `expect` (`expect.assertions(N)`).
- Reuse `frames.css` / `tokens.css` classes and variables; no new palette/fonts. Reuse the existing `.bookmark` tab motif.
- New full-screen overlay (`StoreDetailModal`) MUST be OR-ed into `isMapPaused` and handled by the `Escape` chain in `+page.svelte`.
- Svelte MCP: run `list-sections` → `get-documentation`, then `svelte-autofixer` until clean on each component.
- New component tests → `client` project. Commit after each green task. Work on a feature branch.
- **Depends on nothing from the Control-Desk plan** — this plan is independently shippable. If both are applied, the `Escape`/`isMapPaused`/`hasBlockingOverlay` edits are additive (add `isStoreDetailOpen` alongside `isCheatSheetOpen`).

---

### Task 1: `StoreDetailModal.svelte` — large three-tab store popup

**Files:**
- Create: `src/lib/components/game/StoreDetailModal.svelte`
- Test: `src/lib/components/game/StoreDetailModal.svelte.spec.ts`

**Interfaces:**
- Consumes: `StoreStockTable`, `StoreProductChainPanel`, `StoreStaffPanel` (existing); types `GameState`, `Store`, `StaffMember`, `HiringCandidate`, `DailyStoreReport`, `StoreProductPatch` from `$lib/game/types`.
- Produces (props):
  ```ts
  interface Props {
    game: GameState;
    store: Store;
    staff: StaffMember[];
    hiringCandidates: HiringCandidate[];
    latestStoreReport: DailyStoreReport | null;
    onUpdateStoreProduct: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
    onHireStaff: (candidateId: string) => void;
    onAssignStaff: (staffId: string, storeId: string) => void;
    onUnassignStaff: (staffId: string) => void;
    onClose: () => void;
    onClickFeedback?: () => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/components/game/StoreDetailModal.svelte.spec.ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { GameState, Store } from '$lib/game/types';
import StoreDetailModal from './StoreDetailModal.svelte';

function store(): Store {
	return {
		id: 'store-1', level: 3, name: 'Corner Market', archetypeId: 'convenience', location: 'Main & 3rd',
		cityId: 'harbor-city', tileId: 'tile-1', mapX: 1, mapY: 1, daysOpen: 5, reputation: 60,
		stockHealth: 80, products: [{ categoryId: 'snacks', stock: 40, reorderThreshold: 10, targetStock: 50, sellingPrice: 5 }],
		staffMorale: 70, staffCapacity: 2, localDemand: 50, competition: 20, managerQuality: 40
	};
}

function game(): GameState {
	return {
		seed: 1, rngState: 0, day: 5, cash: 5000, debt: 0,
		policy: {} as GameState['policy'], scorecard: {} as GameState['scorecard'], world: {} as GameState['world'],
		storeCap: 5, cities: [], activeCityId: 'harbor-city', industryCities: [], activeIndustryCityId: 'industry-city',
		industrialBuildings: [], warehouse: { capacity: 0, materials: {}, overflowUnits: 0, overflowCost: 0 },
		stores: [store()], staff: [], hiringCandidates: [], decisions: [], reports: []
	};
}

function props() {
	return {
		game: game(), store: store(), staff: [], hiringCandidates: [], latestStoreReport: null,
		onUpdateStoreProduct: vi.fn(), onHireStaff: vi.fn(), onAssignStaff: vi.fn(), onUnassignStaff: vi.fn(),
		onClose: vi.fn(), onClickFeedback: vi.fn()
	};
}

describe('StoreDetailModal', () => {
	it('opens on the Stock tab and switches to Staff', async () => {
		expect.assertions(3);
		render(StoreDetailModal, props());
		await expect.element(page.getByRole('dialog', { name: /corner market/i })).toBeVisible();
		await expect.element(page.getByRole('tab', { name: /stock/i })).toHaveAttribute('aria-selected', 'true');
		await page.getByRole('tab', { name: /staff/i }).click();
		await expect.element(page.getByRole('tab', { name: /staff/i })).toHaveAttribute('aria-selected', 'true');
	});

	it('closes via the close button', async () => {
		expect.assertions(1);
		const p = props();
		render(StoreDetailModal, p);
		await page.getByRole('button', { name: /close store details/i }).click();
		expect(p.onClose).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/StoreDetailModal.svelte.spec.ts --run --project client`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create the modal. Copy the tab-panel wiring for Stock / Product Chain / Staff from the current `TileInspector.svelte` (lines ~253–297 for panels; ~136–197 for the tab buttons — but only the stock/chain/staff tabs, dropping the "details" tab) and adapt into a centered modal shell modeled on the control-tower backdrop in `+page.svelte`.

```svelte
<!-- src/lib/components/game/StoreDetailModal.svelte -->
<script lang="ts">
	import StoreProductChainPanel from '$lib/components/game/StoreProductChainPanel.svelte';
	import StoreStaffPanel from '$lib/components/game/StoreStaffPanel.svelte';
	import StoreStockTable from '$lib/components/game/StoreStockTable.svelte';
	import type {
		DailyStoreReport,
		GameState,
		HiringCandidate,
		StaffMember,
		Store,
		StoreProductPatch
	} from '$lib/game/types';

	interface Props {
		game: GameState;
		store: Store;
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		latestStoreReport: DailyStoreReport | null;
		onUpdateStoreProduct: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
		onHireStaff: (candidateId: string) => void;
		onAssignStaff: (staffId: string, storeId: string) => void;
		onUnassignStaff: (staffId: string) => void;
		onClose: () => void;
		onClickFeedback?: () => void;
	}

	let {
		game,
		store,
		staff,
		hiringCandidates,
		latestStoreReport,
		onUpdateStoreProduct,
		onHireStaff,
		onAssignStaff,
		onUnassignStaff,
		onClose,
		onClickFeedback = () => {}
	}: Props = $props();

	type DetailTab = 'stock' | 'chain' | 'staff';

	const tabs: Array<{ id: DetailTab; label: string }> = [
		{ id: 'stock', label: 'Stock' },
		{ id: 'chain', label: 'Product Chain' },
		{ id: 'staff', label: 'Staff' }
	];

	let activeTab = $state<DetailTab>('stock');

	function selectTab(tab: DetailTab): void {
		onClickFeedback();
		activeTab = tab;
	}
</script>

<div class="detail-backdrop">
	<button type="button" class="backdrop-button" aria-label="Close store details" onclick={onClose}></button>
	<div class="detail-modal paper" role="dialog" aria-modal="true" aria-label={store.name}>
		<header>
			<div>
				<p class="eyebrow">Store details</p>
				<h2>{store.name}</h2>
			</div>
			<button type="button" class="btn-danger" aria-label="Close store details" onclick={onClose}>Close</button>
		</header>

		<div class="detail-tabs" role="tablist" aria-label={`${store.name} sections`}>
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					class="detail-tab"
					class:active={activeTab === tab.id}
					role="tab"
					id={`${store.id}-${tab.id}-tab`}
					aria-selected={activeTab === tab.id}
					aria-controls={`${store.id}-${tab.id}-panel`}
					tabindex={activeTab === tab.id ? 0 : -1}
					onclick={() => selectTab(tab.id)}
				>
					{#if activeTab === tab.id}<span class="bookmark tab-bookmark" aria-hidden="true"></span>{/if}
					{tab.label}
				</button>
			{/each}
		</div>

		<div class="detail-panels">
			<div
				class="detail-panel"
				class:active={activeTab === 'stock'}
				id={`${store.id}-stock-panel`}
				role="tabpanel"
				aria-labelledby={`${store.id}-stock-tab`}
				aria-hidden={activeTab !== 'stock'}
				inert={activeTab !== 'stock'}
			>
				<StoreStockTable {store} latestReport={latestStoreReport} onUpdate={onUpdateStoreProduct} />
			</div>
			<div
				class="detail-panel"
				class:active={activeTab === 'chain'}
				id={`${store.id}-chain-panel`}
				role="tabpanel"
				aria-labelledby={`${store.id}-chain-tab`}
				aria-hidden={activeTab !== 'chain'}
				inert={activeTab !== 'chain'}
			>
				<StoreProductChainPanel {game} {store} onInteractionFeedback={onClickFeedback} />
			</div>
			<div
				class="detail-panel"
				class:active={activeTab === 'staff'}
				id={`${store.id}-staff-panel`}
				role="tabpanel"
				aria-labelledby={`${store.id}-staff-tab`}
				aria-hidden={activeTab !== 'staff'}
				inert={activeTab !== 'staff'}
			>
				<StoreStaffPanel {store} {staff} {hiringCandidates} onHire={onHireStaff} onAssign={onAssignStaff} onUnassign={onUnassignStaff} />
			</div>
		</div>
	</div>
</div>

<style>
	.detail-backdrop {
		position: fixed;
		inset: 0;
		z-index: 42;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.74);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		background: transparent;
		padding: 0;
	}

	.detail-modal {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		gap: 1rem;
		width: min(1000px, 100%);
		max-height: calc(100vh - 2rem);
		padding: 1.25rem;
		overflow: hidden;
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

	.detail-tabs {
		display: flex;
		gap: 0.4rem;
		border-bottom: 1px solid var(--brass-500);
	}

	.detail-tab {
		position: relative;
		flex: 1 1 auto;
		padding: 0.55rem 0.75rem 0.7rem;
		border: 1px solid var(--paper-edge);
		border-bottom: 0;
		border-radius: 2px 2px 0 0;
		background: var(--paper-50);
		color: var(--ink-500);
		font-family: var(--font-ui);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.detail-tab.active {
		color: var(--ink-900);
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.tab-bookmark {
		left: 50%;
		top: -2px;
		transform: translateX(-50%);
		width: 0.6rem;
		height: 1.2rem;
	}

	.detail-panels {
		position: relative;
		min-height: 0;
		overflow: auto;
	}

	.detail-panel {
		display: none;
	}

	.detail-panel.active {
		display: block;
	}
</style>
```

- [ ] **Step 4: `svelte-autofixer`, then run the test**

Run svelte-autofixer until clean, then:
Run: `bun run test:unit -- src/lib/components/game/StoreDetailModal.svelte.spec.ts --run --project client`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/StoreDetailModal.svelte src/lib/components/game/StoreDetailModal.svelte.spec.ts
git commit -m "feat: add large store detail modal with stock/chain/staff tabs"
```

---

### Task 2: Slim `TileInspector.svelte` to the Basic card

**Files:**
- Modify: `src/lib/components/game/TileInspector.svelte`
- Create: `src/lib/components/game/TileInspector.svelte.spec.ts`

**Interfaces:**
- New prop added: `onOpenDetails: () => void`.
- Props removed (they now live on `StoreDetailModal`): `staff`, `hiringCandidates`, `onUpdateStoreProduct`, `onHireStaff`, `onAssignStaff`, `onUnassignStaff`.
- Retained props: `game`, `tile`, `store`, `latestStoreReport`, `onUpgradeStore`, `onClose`, `onClickFeedback`, plus new `onOpenDetails`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/components/game/TileInspector.svelte.spec.ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CityTile, GameState, Store } from '$lib/game/types';
import TileInspector from './TileInspector.svelte';

function tile(): CityTile {
	return {
		id: 'tile-1', x: 3, y: 4, terrain: 'commercial', feature: null, neighborhood: 'downtown',
		demand: 60, rent: 1200, footTraffic: 55, customerFit: 45, locked: false
	} as CityTile;
}

function store(): Store {
	return {
		id: 'store-1', level: 4, name: 'Corner Market', archetypeId: 'convenience', location: 'Main & 3rd',
		cityId: 'harbor-city', tileId: 'tile-1', mapX: 3, mapY: 4, daysOpen: 5, reputation: 60,
		stockHealth: 80, products: [{ categoryId: 'snacks', stock: 0, reorderThreshold: 10, targetStock: 50, sellingPrice: 5 }],
		staffMorale: 70, staffCapacity: 2, localDemand: 50, competition: 20, managerQuality: 40
	};
}

function game(): GameState {
	return {
		seed: 1, rngState: 0, day: 5, cash: 50000, debt: 0,
		policy: {} as GameState['policy'], scorecard: {} as GameState['scorecard'], world: {} as GameState['world'],
		storeCap: 5, cities: [], activeCityId: 'harbor-city', industryCities: [], activeIndustryCityId: 'industry-city',
		industrialBuildings: [], warehouse: { capacity: 0, materials: {}, overflowUnits: 0, overflowCost: 0 },
		stores: [store()], staff: [], hiringCandidates: [], decisions: [], reports: []
	};
}

describe('TileInspector basic card', () => {
	it('shows store identity, level, an out-of-stock attention flag, and opens details', async () => {
		expect.assertions(3);
		const onOpenDetails = vi.fn();
		render(TileInspector, {
			game: game(), tile: tile(), store: store(),
			latestStoreReport: { storeId: 'store-1', revenue: 2140 } as never,
			onUpgradeStore: vi.fn(), onOpenDetails, onClose: vi.fn(), onClickFeedback: vi.fn()
		});
		await expect.element(page.getByRole('heading', { name: /corner market/i })).toBeVisible();
		await expect.element(page.getByText(/out of stock/i)).toBeVisible();
		await page.getByRole('button', { name: /open details/i }).click();
		expect(onOpenDetails).toHaveBeenCalledTimes(1);
	});

	it('shows tile stats when there is no store', async () => {
		expect.assertions(1);
		render(TileInspector, {
			game: game(), tile: tile(), store: null, latestStoreReport: null,
			onUpgradeStore: vi.fn(), onOpenDetails: vi.fn(), onClose: vi.fn(), onClickFeedback: vi.fn()
		});
		await expect.element(page.getByText(/foot traffic/i)).toBeVisible();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run --project client`
Expected: FAIL — component still uses old props / no "Open Details" button.

- [ ] **Step 3: Rewrite `TileInspector.svelte` as the Basic card**

Replace the whole store branch (the `{#if store}` … tab machinery … `{/if}` block, currently lines ~135–297) with the Basic card below, and update the `<script>` props. Keep the empty-tile stats `<section>` (currently ~299–318), the heading (~127–133), the close button, and the `blockMapInteraction` attachment. Remove imports for `StoreProductChainPanel`, `StoreStaffPanel`, `StoreStockTable`, and the `activeStoreTab` state and `selectStoreTab` function (moved to `StoreDetailModal`). Keep the leveling imports and upgrade derivations.

New `<script>` prop block:

```ts
interface Props {
	game: GameState;
	tile: CityTile | null;
	store: Store | null;
	latestStoreReport: DailyStoreReport | null;
	onUpgradeStore?: (storeId: string) => void;
	onOpenDetails: () => void;
	onClose: () => void;
	onClickFeedback?: () => void;
}

let {
	game,
	tile,
	store,
	latestStoreReport,
	onUpgradeStore = () => {},
	onOpenDetails,
	onClose,
	onClickFeedback = () => {}
}: Props = $props();
```

Add derivations for the attention flag near the other `$derived`s:

```ts
import { getStoreProductStatus } from '$lib/game/stock';

const troubledProducts = $derived(
	store ? store.products.filter((product) => getStoreProductStatus(product) !== 'Healthy') : []
);
const attentionMessage = $derived.by(() => {
	if (troubledProducts.length === 0) return null;
	const outOfStock = troubledProducts.some((product) => getStoreProductStatus(product) === 'Out of stock');
	const noun = troubledProducts.length === 1 ? 'product' : 'products';
	return `${troubledProducts.length} ${noun} ${outOfStock ? 'out of stock' : 'need import'}`;
});
const dailyRevenue = $derived(latestStoreReport?.revenue ?? null);
```

New store-branch markup (replaces the old tab block, inside `{#if store}`):

```svelte
{#if store}
	<div class="basic-card">
		{#if storeArt}
			<div class="store-art">
				<img src={storeArtSrc} alt={storeArt.alt} width="1024" height="1024" loading="lazy" decoding="async" />
			</div>
		{/if}
		<h3>{store.name}</h3>
		<p class="location">{store.location}</p>

		<div class="gauges" aria-label="Store vitals">
			<div class="gauge">
				<dt>Revenue/day</dt>
				<dd>{dailyRevenue === null ? '—' : currency.format(dailyRevenue)}</dd>
			</div>
			<div class="gauge">
				<dt>Stock health</dt>
				<dd>{store.stockHealth}</dd>
			</div>
			<div class="gauge">
				<dt>Staff morale</dt>
				<dd>{store.staffMorale}</dd>
			</div>
		</div>

		{#if attentionMessage}
			<p class="attention"><span class="seal" data-urgent="true">!</span> {attentionMessage}</p>
		{/if}

		<div class="store-level">
			<p class="level-label">Level {store.level} / {MAX_STORE_LEVEL}</p>
			<p class="level-next">Next: {nextBenefit}</p>
			<button
				type="button"
				class="upgrade"
				disabled={!storeCanUpgrade || !canAffordUpgrade}
				onclick={() => onUpgradeStore(store.id)}
			>
				{storeCanUpgrade ? `Upgrade — ${currency.format(upgradeCost)}` : 'Max level'}
			</button>
			{#if storeCanUpgrade && !canAffordUpgrade}
				<p class="level-hint">Not enough cash.</p>
			{/if}
		</div>

		<button type="button" class="open-details" onclick={onOpenDetails}>Open Details ▸</button>
	</div>
{:else}
	<!-- keep the existing empty-tile stats section unchanged -->
{/if}
```

Add/replace the store-specific styles (drop `.store-tabs`, `.store-tab`, `.store-tab-panels`, `.store-panel`; keep `.store-art`, `.store-level`, `.level-*`, `.upgrade`). Add:

```css
.basic-card {
	display: grid;
	gap: 0.85rem;
}

.gauges {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 0.5rem;
}

.gauge {
	border: 1px solid var(--paper-edge);
	border-radius: 2px;
	background: var(--paper-50);
	padding: 0.45rem 0.5rem;
	text-align: center;
}

.gauge dt {
	color: var(--brass-700);
	font-family: var(--font-ui);
	font-size: 0.62rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.gauge dd {
	margin: 0.25rem 0 0;
	font-family: var(--font-mono);
	font-variant-numeric: tabular-nums lining-nums;
	font-weight: 700;
	color: var(--ink-700);
}

.attention {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0;
	color: var(--wax-red);
	font-family: var(--font-body);
	font-size: 0.85rem;
}

.open-details {
	width: 100%;
	border: 1px solid var(--brass-500);
	border-radius: 2px;
	background: var(--paper-100);
	color: var(--ink-700);
	font-family: var(--font-ui);
	font-weight: 700;
	padding: 0.55rem 0.75rem;
}

.open-details:hover,
.open-details:focus-visible {
	background: var(--paper-200);
}
```

Also update the container: the `.inspector.store-inspector` fixed-height/overflow rule (currently forcing a tall panel for the tab layout) can be simplified — the Basic card is short. Remove the `grid-template-rows`/`height`/`overflow: hidden` from `.inspector.store-inspector` so the card sizes to content (keep `class:store-inspector` if other styling relies on it, otherwise the class may be dropped).

- [ ] **Step 4: `svelte-autofixer`, then run the test**

Run svelte-autofixer until clean, then:
Run: `bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run --project client`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts
git commit -m "feat: slim tile inspector to a basic store card with open-details"
```

---

### Task 3: Wire the Basic card + Detail modal into `+page.svelte`

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**
- Consumes: `StoreDetailModal` (Task 1), slimmed `TileInspector` (Task 2).

- [ ] **Step 1: Import the modal and add state**

Add import:

```ts
import StoreDetailModal from '$lib/components/game/StoreDetailModal.svelte';
```

Add state near the other panel toggles:

```ts
let isStoreDetailOpen = $state(false);
```

- [ ] **Step 2: Add open/close handlers and close-on-deselect**

```ts
function openStoreDetail(): void {
	if (selectedStore) {
		isStoreDetailOpen = true;
	}
}

function closeStoreDetail(): void {
	isStoreDetailOpen = false;
}
```

In `closeInspector` (and anywhere `selectedTileId` is reset while a store is selected), also close the detail modal so it can't outlive its store:

```ts
function closeInspector() {
	selectedTileId = null;
	isStoreDetailOpen = false;
}
```

- [ ] **Step 3: Fold the modal into `isMapPaused`**

Add `isStoreDetailOpen` to the paused set:

```ts
let isMapPaused = $derived(
	!isPlacementModeActive &&
		(isStoreDetailOpen || isViewMenuOpen || isBuildMenuOpen || activeManagementPanelId !== null || isSavePanelOpen)
);
```

(If the Control-Desk plan is also applied, include `isCheatSheetOpen` here too.)

- [ ] **Step 4: Handle Escape for the modal first**

At the top of the `Escape` handling in `handleKeydown`, before the other cases:

```ts
if (isStoreDetailOpen) {
	isStoreDetailOpen = false;
	return;
}
```

- [ ] **Step 5: Update the `TileInspector` usage and render the modal**

Change the existing `<TileInspector .../>` invocation (inside `inspector-overlay`) to the slimmed prop set:

```svelte
<TileInspector
	game={game ?? starterMapState}
	tile={selectedTile}
	store={selectedStore}
	latestStoreReport={latestSelectedStoreReport}
	onUpgradeStore={upgradeStoreHandler}
	onOpenDetails={openStoreDetail}
	onClickFeedback={() => playSfx('sfx.ui.click')}
	onClose={closeInspector}
/>
```

Then, after the industry inspector block (before the management `{#if game && activeManagementPanel}` block), render:

```svelte
{#if isStoreDetailOpen && selectedStore}
	<StoreDetailModal
		game={game ?? starterMapState}
		store={selectedStore}
		staff={game?.staff ?? []}
		hiringCandidates={game?.hiringCandidates ?? []}
		latestStoreReport={latestSelectedStoreReport}
		onUpdateStoreProduct={changeStoreProduct}
		onHireStaff={hireStaff}
		onAssignStaff={assignStaff}
		onUnassignStaff={unassignStoreStaff}
		onClickFeedback={() => playSfx('sfx.ui.click')}
		onClose={closeStoreDetail}
	/>
{/if}
```

- [ ] **Step 6: Type-check and unit tests**

Run: `bun run check`
Expected: no errors (TileInspector's removed props are no longer passed).
Run: `bun run test:unit -- --run`
Expected: all pass.

- [ ] **Step 7: Update e2e for the modal**

In `src/routes/retail-sim.e2e.ts`:

Add a helper that opens the detail modal and returns its locator:

```ts
async function openStoreDetail(page: Page) {
	await page.getByRole('button', { name: /open details/i }).click();
	return page.getByRole('dialog', { name: /corner market|store #\d+/i });
}
```

> Adjust the modal name regex to match the store name the suite's store-founding helper creates (named "Store #N" / the default). Inspect the store-founding helper at the top of the file and match its naming.

Migrate the store-tab interactions now behind the modal:
- The stock-inspection helper reading `.store-tab-panels` (around line 284) → read `.detail-panels` inside the modal instead, after `openStoreDetail(page)`.
- The test that clicks `inspector.getByRole('tab', { name: /stock/i })` and asserts the stock table (around lines 823–824) → first `const modal = await openStoreDetail(page);` then `await modal.getByRole('tab', { name: /stock/i }).click()` and assert within `modal`.
- The inspector tab-navigation test (around lines 1062–1137) → the modal now has only Stock / Product Chain / Staff tabs (no "Details" tab). Update: open the modal, assert Stock is the default selected tab, then cycle Product Chain and Staff; drop the "details" tab assertions. Bounding-box checks target the modal dialog.
- The stock-edit flow (around lines 831–862) → perform edits inside the modal after opening it.

The store-upgrade test (line ~1232–1250) stays on the Basic card: the Upgrade button remains in the `TileInspector`, so `inspector.getByRole('button', { name: /Upgrade/i })` still works — no change needed there.

- [ ] **Step 8: Run lint, check, unit, e2e**

Run: `bun run lint` → clean.
Run: `bun run check` → clean.
Run: `bun run test:unit -- --run` → all pass.
Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts` → all pass.

- [ ] **Step 9: Commit**

```bash
git add src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat: split store inspector into basic card and detail modal"
```

---

## Self-Review

**Spec coverage (Part 2):**
- Compact Basic card with identity + level badge + three vital gauges (Revenue/day, Stock health, Staff morale) + attention flag + Upgrade + Open Details → Task 2.
- Large Detail popup hosting the heavy tabs, reusing existing panel components → Task 1.
- Empty tiles keep their compact stat card → Task 2 (empty branch retained).
- New overlay respects `isMapPaused` and `Escape` → Task 3 Steps 3–4.

**Placeholder scan:** No TBD/TODO. Two flagged "match your setup helper" notes for e2e store naming — inherent to the existing suite, called out explicitly.

**Type consistency:** `StoreDetailModal` props (Task 1) exactly match what `+page.svelte` passes (Task 3 Step 5) — `onUpdateStoreProduct`/`onHireStaff`/`onAssignStaff`/`onUnassignStaff`/`onClickFeedback`/`onClose`/`latestStoreReport`. Slimmed `TileInspector` prop set (Task 2) matches the new invocation (Task 3 Step 5) — the removed props are no longer passed. `DailyStoreReport.revenue` used for the gauge is a real field.

## Note

Independent of the Control-Desk plan. The three `isMapPaused` / `Escape` / overlay edits are written to compose additively if both plans land.
