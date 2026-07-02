# Control-Desk HUD, Alerts & Keyboard Shortcuts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top-right control cluster with a persistent bottom "Control Desk" command strip plus a slim top resource/alerts bar, and add discoverable keyboard shortcuts — the builder-sim HUD from Part 1 & Part 3 of `docs/superpowers/specs/2026-07-01-game-hud-inspector-industry-ux-design.md`.

**Architecture:** Two new pure, unit-tested modules (`alerts.ts` derives an alert list from `GameState`; `keyboardShortcuts.ts` maps a keypress+context to an action). Three new presentational Svelte components (`TopBar`, `ControlDesk`, `ShortcutCheatSheet`) that take props/callbacks and own no game state. `+page.svelte` stays the single state owner: it wires the components, computes `alerts` with `$derived`, and dispatches shortcut actions from `handleKeydown`. The Phaser renderers and their `data-*` contracts are untouched.

**Tech Stack:** SvelteKit + Svelte 5 (runes mode forced), Tailwind v4, scoped `<style>`, Vitest (`vitest-browser-svelte` for `client` project, node for `server` project), Playwright e2e.

## Global Constraints

- Svelte 5 runes only: `$state` / `$derived` / `$effect` / `$props`. No legacy `let` reactivity.
- Every Vitest test MUST contain at least one `expect` (config enforces `requireAssertions`). Start each test with `expect.assertions(N)`.
- Keep the Mercantile Ledger aesthetic — reuse `src/lib/styles/frames.css` classes (`.paper`, `.plaque`, `.btn-primary`, `.btn-danger`, `.btn-icon`, `.seal`, `.eyebrow`, `.bookmark`) and `src/lib/styles/tokens.css` variables (`--paper-*`, `--brass-*`, `--ink-*`, `--moss`, `--wax-red`, `--font-display/ui/body/mono`). Introduce no new palette or fonts.
- Do NOT change map renderers (`cityMapScene.ts`, `industryMapScene.ts`) or the canvas `data-*` attributes the e2e suite awaits.
- Preserve the `isMapPaused` optimization: any new full-screen overlay must be OR-ed into `isMapPaused`.
- Svelte MCP tooling is mandatory for Svelte work: run `list-sections` → `get-documentation` for relevant sections, and run `svelte-autofixer` on each component until clean before considering a step done.
- New pure modules → `server` Vitest project (`*.spec.ts`). New Svelte components → `client` project (`*.svelte.spec.ts`).
- Commit after each task's tests are green. This work is on a feature branch (create one before Task 1 if still on `main`).

---

### Task 1: `alerts.ts` — derive the alert list from GameState

**Files:**
- Create: `src/lib/game/alerts.ts`
- Test: `src/lib/game/alerts.spec.ts`

**Interfaces:**
- Consumes: `GameState`, `Store`, `IndustrialBuilding`, `DecisionItem` from `$lib/game/types`; `getStoreProductStatus` from `$lib/game/stock`; `INDUSTRIAL_BUILDING_TYPES` from `$lib/game/industry`.
- Produces:
  - `type GameAlertKind = 'store-stock' | 'decision' | 'factory-blocked'`
  - `interface GameAlert { id: string; kind: GameAlertKind; message: string; cityId?: string; storeId?: string; buildingId?: string; tileId?: string; decisionId?: string }`
  - `function collectGameAlerts(game: GameState): GameAlert[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/game/alerts.spec.ts
import { describe, expect, it } from 'vitest';
import { collectGameAlerts } from './alerts';
import type { GameState, Store, IndustrialBuilding, DecisionItem, StoreProduct } from './types';

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
	return { categoryId: 'snacks', stock: 50, reorderThreshold: 10, targetStock: 60, sellingPrice: 5, ...overrides };
}

function store(overrides: Partial<Store> = {}): Store {
	return {
		id: 'store-1', level: 1, name: 'Corner Market', archetypeId: 'convenience', location: 'Main & 3rd',
		cityId: 'harbor-city', tileId: 'tile-1', mapX: 1, mapY: 1, daysOpen: 3, reputation: 50,
		stockHealth: 90, products: [product()], staffMorale: 80, staffCapacity: 2, localDemand: 50,
		competition: 20, managerQuality: 40, ...overrides
	};
}

function building(overrides: Partial<IndustrialBuilding> = {}): IndustrialBuilding {
	return {
		id: 'bld-1', level: 1, typeId: 'flour-mill', cityId: 'industry-city', tileId: 'itile-1',
		mapX: 2, mapY: 2, status: 'produced', lastProduction: [], producedTotal: 10,
		importedInputTotal: 0, blockedDays: 0, ...overrides
	};
}

function baseGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 1, rngState: 0, day: 5, cash: 1000, debt: 0,
		policy: {} as GameState['policy'], scorecard: {} as GameState['scorecard'],
		world: {} as GameState['world'], storeCap: 5,
		cities: [], activeCityId: 'harbor-city', industryCities: [], activeIndustryCityId: 'industry-city',
		industrialBuildings: [], warehouse: { capacity: 0, materials: {}, overflowUnits: 0, overflowCost: 0 },
		stores: [], staff: [], hiringCandidates: [], decisions: [], reports: [], ...overrides
	};
}

describe('collectGameAlerts', () => {
	it('returns no alerts for a healthy game', () => {
		expect.assertions(1);
		expect(collectGameAlerts(baseGame({ stores: [store()] }))).toEqual([]);
	});

	it('flags a store with out-of-stock products and deep-links to its tile', () => {
		expect.assertions(4);
		const alerts = collectGameAlerts(baseGame({ stores: [store({ products: [product({ stock: 0 })] })] }));
		expect(alerts).toHaveLength(1);
		expect(alerts[0].kind).toBe('store-stock');
		expect(alerts[0].tileId).toBe('tile-1');
		expect(alerts[0].message).toMatch(/out of stock/i);
	});

	it('flags a store that needs import (below reorder threshold)', () => {
		expect.assertions(2);
		const alerts = collectGameAlerts(baseGame({ stores: [store({ products: [product({ stock: 5, reorderThreshold: 10 })] })] }));
		expect(alerts).toHaveLength(1);
		expect(alerts[0].message).toMatch(/need import/i);
	});

	it('flags pending decisions', () => {
		expect.assertions(2);
		const decision: DecisionItem = { id: 'dec-1', title: 'Lease renewal', context: '', expiresOnDay: 9, options: [] };
		const alerts = collectGameAlerts(baseGame({ decisions: [decision] }));
		expect(alerts.some((alert) => alert.kind === 'decision' && alert.decisionId === 'dec-1')).toBe(true);
		expect(alerts[0].message).toMatch(/lease renewal/i);
	});

	it('flags a blocked factory and deep-links to its tile', () => {
		expect.assertions(3);
		const alerts = collectGameAlerts(baseGame({ industrialBuildings: [building({ status: 'blocked', blockedDays: 2 })] }));
		expect(alerts).toHaveLength(1);
		expect(alerts[0].kind).toBe('factory-blocked');
		expect(alerts[0].tileId).toBe('itile-1');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/alerts.spec.ts --run --project server`
Expected: FAIL — `collectGameAlerts` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/game/alerts.ts
import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import { getStoreProductStatus } from './stock';
import type { GameState } from './types';

export type GameAlertKind = 'store-stock' | 'decision' | 'factory-blocked';

export interface GameAlert {
	id: string;
	kind: GameAlertKind;
	message: string;
	cityId?: string;
	storeId?: string;
	buildingId?: string;
	tileId?: string;
	decisionId?: string;
}

export function collectGameAlerts(game: GameState): GameAlert[] {
	const alerts: GameAlert[] = [];

	for (const store of game.stores) {
		const troubled = store.products.filter((product) => getStoreProductStatus(product) !== 'Healthy');

		if (troubled.length === 0) {
			continue;
		}

		const outOfStock = troubled.some((product) => getStoreProductStatus(product) === 'Out of stock');
		const noun = troubled.length === 1 ? 'product' : 'products';
		const verb = outOfStock ? 'out of stock' : 'need import';

		alerts.push({
			id: `store-stock:${store.id}`,
			kind: 'store-stock',
			message: `${store.name}: ${troubled.length} ${noun} ${verb}`,
			cityId: store.cityId,
			storeId: store.id,
			tileId: store.tileId
		});
	}

	for (const decision of game.decisions) {
		alerts.push({
			id: `decision:${decision.id}`,
			kind: 'decision',
			message: `Decision: ${decision.title}`,
			decisionId: decision.id
		});
	}

	for (const building of game.industrialBuildings) {
		if (building.status !== 'blocked' && building.blockedDays <= 0) {
			continue;
		}

		const name = INDUSTRIAL_BUILDING_TYPES[building.typeId]?.name ?? building.typeId;

		alerts.push({
			id: `factory-blocked:${building.id}`,
			kind: 'factory-blocked',
			message: `${name} starved of inputs`,
			cityId: building.cityId,
			buildingId: building.id,
			tileId: building.tileId
		});
	}

	return alerts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/alerts.spec.ts --run --project server`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/alerts.ts src/lib/game/alerts.spec.ts
git commit -m "feat: derive game alerts from state"
```

---

### Task 2: `keyboardShortcuts.ts` — map keypress + context to an action

**Files:**
- Create: `src/lib/game/keyboardShortcuts.ts`
- Test: `src/lib/game/keyboardShortcuts.spec.ts`

**Interfaces:**
- Consumes: `MapViewId` from `$lib/game/mapViewKeepAlive`.
- Produces:
  - `type ShortcutAction = { type: 'build' } | { type: 'advance-day' } | { type: 'view'; view: MapViewId }`
  - `interface ShortcutContext { key: string; isTypingTarget: boolean; hasBlockingOverlay: boolean; activeMapView: MapViewId; hasGame: boolean }`
  - `function resolveShortcutAction(context: ShortcutContext): ShortcutAction | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/game/keyboardShortcuts.spec.ts
import { describe, expect, it } from 'vitest';
import { resolveShortcutAction, type ShortcutContext } from './keyboardShortcuts';

function context(overrides: Partial<ShortcutContext> = {}): ShortcutContext {
	return { key: 'b', isTypingTarget: false, hasBlockingOverlay: false, activeMapView: 'retail', hasGame: true, ...overrides };
}

describe('resolveShortcutAction', () => {
	it('opens build on "b" and "B"', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: 'b' }))).toEqual({ type: 'build' });
		expect(resolveShortcutAction(context({ key: 'B' }))).toEqual({ type: 'build' });
	});

	it('does not open build on the world view', () => {
		expect.assertions(1);
		expect(resolveShortcutAction(context({ key: 'b', activeMapView: 'world' }))).toBeNull();
	});

	it('advances the day on Space only when a game exists', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: ' ' }))).toEqual({ type: 'advance-day' });
		expect(resolveShortcutAction(context({ key: ' ', hasGame: false }))).toBeNull();
	});

	it('switches views on 1/2/3', () => {
		expect.assertions(3);
		expect(resolveShortcutAction(context({ key: '1' }))).toEqual({ type: 'view', view: 'retail' });
		expect(resolveShortcutAction(context({ key: '2' }))).toEqual({ type: 'view', view: 'industry' });
		expect(resolveShortcutAction(context({ key: '3' }))).toEqual({ type: 'view', view: 'world' });
	});

	it('ignores shortcuts while typing or when an overlay is open', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: 'b', isTypingTarget: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'b', hasBlockingOverlay: true }))).toBeNull();
	});

	it('returns null for unmapped keys', () => {
		expect.assertions(1);
		expect(resolveShortcutAction(context({ key: 'q' }))).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/keyboardShortcuts.spec.ts --run --project server`
Expected: FAIL — `resolveShortcutAction` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/game/keyboardShortcuts.ts
import type { MapViewId } from './mapViewKeepAlive';

export type ShortcutAction =
	| { type: 'build' }
	| { type: 'advance-day' }
	| { type: 'view'; view: MapViewId };

export interface ShortcutContext {
	key: string;
	isTypingTarget: boolean;
	hasBlockingOverlay: boolean;
	activeMapView: MapViewId;
	hasGame: boolean;
}

export function resolveShortcutAction(context: ShortcutContext): ShortcutAction | null {
	if (context.isTypingTarget || context.hasBlockingOverlay) {
		return null;
	}

	switch (context.key) {
		case 'b':
		case 'B':
			return context.activeMapView === 'world' ? null : { type: 'build' };
		case ' ':
			return context.hasGame ? { type: 'advance-day' } : null;
		case '1':
			return { type: 'view', view: 'retail' };
		case '2':
			return { type: 'view', view: 'industry' };
		case '3':
			return { type: 'view', view: 'world' };
		default:
			return null;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/keyboardShortcuts.spec.ts --run --project server`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/keyboardShortcuts.ts src/lib/game/keyboardShortcuts.spec.ts
git commit -m "feat: resolve keyboard shortcut actions"
```

---

### Task 3: `TopBar.svelte` — slim location + resources + alerts bell

**Files:**
- Create: `src/lib/components/game/TopBar.svelte`
- Test: `src/lib/components/game/TopBar.svelte.spec.ts`

**Interfaces:**
- Consumes: `GameAlert` from `$lib/game/alerts` (Task 1).
- Produces (props): `{ eyebrow: string; title: string; day: number | null; cash: number | null; alerts: GameAlert[]; onSelectAlert: (alert: GameAlert) => void }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/components/game/TopBar.svelte.spec.ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { GameAlert } from '$lib/game/alerts';
import TopBar from './TopBar.svelte';

const alerts: GameAlert[] = [
	{ id: 'store-stock:s1', kind: 'store-stock', message: 'Corner Market: 2 products out of stock', tileId: 'tile-1' }
];

describe('TopBar', () => {
	it('renders the location, day and cash', async () => {
		expect.assertions(3);
		render(TopBar, { eyebrow: 'Retail City Map', title: 'Harbor City', day: 42, cash: 128400, alerts: [], onSelectAlert: vi.fn() });
		await expect.element(page.getByRole('heading', { name: /harbor city/i })).toBeVisible();
		await expect.element(page.getByText(/day 42/i)).toBeVisible();
		await expect.element(page.getByText(/\$128,400/)).toBeVisible();
	});

	it('shows the alert count and deep-links a clicked alert', async () => {
		expect.assertions(2);
		const onSelectAlert = vi.fn();
		render(TopBar, { eyebrow: 'Retail City Map', title: 'Harbor City', day: 1, cash: 0, alerts, onSelectAlert });
		await expect.element(page.getByText('1', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: /alerts/i }).click();
		await page.getByRole('button', { name: /corner market/i }).click();
		expect(onSelectAlert).toHaveBeenCalledWith(alerts[0]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/TopBar.svelte.spec.ts --run --project client`
Expected: FAIL — module `./TopBar.svelte` not found.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- src/lib/components/game/TopBar.svelte -->
<script lang="ts">
	import type { GameAlert } from '$lib/game/alerts';

	interface Props {
		eyebrow: string;
		title: string;
		day: number | null;
		cash: number | null;
		alerts: GameAlert[];
		onSelectAlert: (alert: GameAlert) => void;
	}

	let { eyebrow, title, day, cash, alerts, onSelectAlert }: Props = $props();

	const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

	let alertsOpen = $state(false);

	function toggleAlerts(): void {
		alertsOpen = !alertsOpen;
	}

	function selectAlert(alert: GameAlert): void {
		alertsOpen = false;
		onSelectAlert(alert);
	}
</script>

<header class="top-bar" aria-label="Status bar">
	<div class="location plaque">
		<p class="eyebrow">{eyebrow}</p>
		<h1>{title}</h1>
	</div>

	<div class="readouts plaque">
		{#if day !== null}
			<span class="ticker" aria-label="Day">Day {day}</span>
		{/if}
		{#if cash !== null}
			<span class="ticker" aria-label="Cash">{currency.format(cash)}</span>
		{/if}

		<div class="alerts">
			<button
				type="button"
				class="btn-icon alerts-bell"
				aria-label="Alerts"
				aria-expanded={alertsOpen}
				onclick={toggleAlerts}
			>
				<svg aria-hidden="true" viewBox="0 0 24 24">
					<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
					<path d="M10 20a2 2 0 0 0 4 0" />
				</svg>
				{#if alerts.length > 0}
					<span class="seal alert-count" data-urgent="true">{alerts.length}</span>
				{/if}
			</button>

			{#if alertsOpen}
				<div class="alerts-popover paper" role="group" aria-label="Alerts list">
					{#if alerts.length === 0}
						<p class="muted">No alerts</p>
					{:else}
						{#each alerts as alert (alert.id)}
							<button type="button" class="alert-row" onclick={() => selectAlert(alert)}>
								{alert.message}
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</header>

<style>
	.top-bar {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		right: 0.75rem;
		z-index: 30;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		pointer-events: none;
	}

	.location,
	.readouts {
		pointer-events: auto;
		padding: 0.5rem 0.85rem;
	}

	.location h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		line-height: 1.05;
		color: var(--ink-700);
	}

	.location .eyebrow {
		margin: 0;
	}

	.readouts {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.ticker {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 0.9rem;
		color: var(--ink-700);
		white-space: nowrap;
	}

	.alerts {
		position: relative;
	}

	.alerts-bell {
		width: 2.4rem;
		height: 2.4rem;
	}

	.alert-count {
		position: absolute;
		top: -0.35rem;
		right: -0.35rem;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.3rem;
	}

	.alerts-popover {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		z-index: 31;
		display: grid;
		gap: 0.35rem;
		width: min(20rem, 80vw);
		max-height: 60vh;
		overflow: auto;
		padding: 0.6rem;
	}

	.alert-row {
		width: 100%;
		text-align: left;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 0.5rem 0.6rem;
	}

	.alert-row:hover,
	.alert-row:focus-visible {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.muted {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.85rem;
	}

	@media (max-width: 980px) {
		.readouts .ticker[aria-label='Cash'] {
			display: none;
		}
	}
</style>
```

- [ ] **Step 4: Run `svelte-autofixer`, then the test to verify it passes**

Run svelte-autofixer on the component until clean, then:
Run: `bun run test:unit -- src/lib/components/game/TopBar.svelte.spec.ts --run --project client`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/TopBar.svelte src/lib/components/game/TopBar.svelte.spec.ts
git commit -m "feat: add top status bar with alerts bell"
```

---

### Task 4: `ControlDesk.svelte` — bottom command strip

**Files:**
- Create: `src/lib/components/game/ControlDesk.svelte`
- Modify: `src/lib/styles/frames.css` (add shared `.keycap`)
- Test: `src/lib/components/game/ControlDesk.svelte.spec.ts`

**Interfaces:**
- Consumes: `MapViewId` from `$lib/game/mapViewKeepAlive`; `Snippet` from `svelte`.
- Produces (props):
  ```ts
  interface ManagementItem { id: string; label: string }
  interface Props {
    activeMapView: MapViewId;
    managementItems: ManagementItem[];
    buildDisabled: boolean;
    advanceDisabled: boolean;
    onBuild: () => void;
    onSelectView: (view: MapViewId) => void;
    onOpenManagement: (id: string) => void;
    onAdvanceDay: () => void;
    menuContent?: Snippet;
  }
  ```

- [ ] **Step 1: Add the shared `.keycap` class to `frames.css`**

Append to `src/lib/styles/frames.css`:

```css
/* --- Keycaps ------------------------------------------------------------ */

.keycap {
	display: inline-grid;
	place-items: center;
	min-width: 1.25rem;
	height: 1.25rem;
	margin-left: 0.4rem;
	padding: 0 0.3rem;
	border: 1px solid var(--brass-500);
	border-bottom-width: 2px;
	border-radius: 3px;
	background: var(--paper-50);
	color: var(--ink-700);
	font-family: var(--font-mono);
	font-size: 0.68rem;
	line-height: 1;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/components/game/ControlDesk.svelte.spec.ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ControlDesk from './ControlDesk.svelte';

const managementItems = [
	{ id: 'dashboard', label: 'Dashboard' },
	{ id: 'policies', label: 'Policies' }
];

function baseProps() {
	return {
		activeMapView: 'retail' as const,
		managementItems,
		buildDisabled: false,
		advanceDisabled: false,
		onBuild: vi.fn(),
		onSelectView: vi.fn(),
		onOpenManagement: vi.fn(),
		onAdvanceDay: vi.fn()
	};
}

describe('ControlDesk', () => {
	it('renders build, view tabs, management launchers, and advance day', async () => {
		expect.assertions(4);
		render(ControlDesk, baseProps());
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /industry city map/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /dashboard/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^advance day$/i })).toBeVisible();
	});

	it('invokes callbacks on interaction', async () => {
		expect.assertions(3);
		const props = baseProps();
		render(ControlDesk, props);
		await page.getByRole('button', { name: /^build$/i }).click();
		await page.getByRole('button', { name: /industry city map/i }).click();
		await page.getByRole('button', { name: /^advance day$/i }).click();
		expect(props.onBuild).toHaveBeenCalledTimes(1);
		expect(props.onSelectView).toHaveBeenCalledWith('industry');
		expect(props.onAdvanceDay).toHaveBeenCalledTimes(1);
	});

	it('disables build on the world view and marks the active view', async () => {
		expect.assertions(2);
		render(ControlDesk, { ...baseProps(), activeMapView: 'world', buildDisabled: true });
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /world map/i })).toHaveAttribute('aria-pressed', 'true');
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/ControlDesk.svelte.spec.ts --run --project client`
Expected: FAIL — module `./ControlDesk.svelte` not found.

- [ ] **Step 4: Write minimal implementation**

```svelte
<!-- src/lib/components/game/ControlDesk.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';

	interface ManagementItem {
		id: string;
		label: string;
	}

	interface Props {
		activeMapView: MapViewId;
		managementItems: ManagementItem[];
		buildDisabled: boolean;
		advanceDisabled: boolean;
		onBuild: () => void;
		onSelectView: (view: MapViewId) => void;
		onOpenManagement: (id: string) => void;
		onAdvanceDay: () => void;
		menuContent?: Snippet;
	}

	let {
		activeMapView,
		managementItems,
		buildDisabled,
		advanceDisabled,
		onBuild,
		onSelectView,
		onOpenManagement,
		onAdvanceDay,
		menuContent
	}: Props = $props();

	const views: Array<{ id: MapViewId; label: string; ariaLabel: string }> = [
		{ id: 'retail', label: 'Retail', ariaLabel: 'Retail city map' },
		{ id: 'industry', label: 'Industry', ariaLabel: 'Industry city map' },
		{ id: 'world', label: 'World', ariaLabel: 'World map' }
	];

	let menuOpen = $state(false);

	function toggleMenu(): void {
		menuOpen = !menuOpen;
	}
</script>

<footer class="control-desk plaque" aria-label="Control desk">
	<div class="cluster">
		<button type="button" class="desk-build" aria-label="Build" disabled={buildDisabled} onclick={onBuild}>
			Build <kbd class="keycap">B</kbd>
		</button>
	</div>

	<div class="cluster views" role="group" aria-label="Map view">
		{#each views as view (view.id)}
			<button
				type="button"
				class="view-tab"
				class:active-view={activeMapView === view.id}
				aria-label={view.ariaLabel}
				aria-pressed={activeMapView === view.id}
				onclick={() => onSelectView(view.id)}
			>
				{view.label}
			</button>
		{/each}
	</div>

	<div class="cluster manage" role="group" aria-label="Management">
		{#each managementItems as item (item.id)}
			<button type="button" class="manage-btn" onclick={() => onOpenManagement(item.id)}>
				{item.label}
			</button>
		{/each}
	</div>

	<div class="cluster time">
		<div class="desk-menu">
			<button type="button" class="btn-icon" aria-label="Menu" aria-expanded={menuOpen} onclick={toggleMenu}>
				<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>
			</button>
			{#if menuOpen && menuContent}
				<div class="desk-popover paper" role="group" aria-label="Menu">
					{@render menuContent()}
				</div>
			{/if}
		</div>
		<button type="button" class="btn-primary advance" aria-label="Advance day" disabled={advanceDisabled} onclick={onAdvanceDay}>
			Advance Day <kbd class="keycap">Space</kbd>
		</button>
	</div>
</footer>

<style>
	.control-desk {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 25;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		padding: 0.6rem 0.85rem;
	}

	.cluster {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.manage {
		flex-wrap: wrap;
	}

	.time {
		margin-left: auto;
	}

	.desk-build {
		display: inline-flex;
		align-items: center;
		border: 1.5px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
		padding: 0.55rem 0.85rem;
	}

	.desk-build:hover:not(:disabled),
	.desk-build:focus-visible:not(:disabled) {
		background: var(--paper-200);
	}

	.desk-build:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.views {
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		overflow: hidden;
	}

	.view-tab {
		border: 0;
		border-right: 1px solid var(--brass-500);
		background: var(--paper-50);
		color: var(--ink-500);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.5rem 0.85rem;
	}

	.views .view-tab:last-child {
		border-right: 0;
	}

	.view-tab.active-view {
		background: var(--paper-300);
		color: var(--ink-900);
		font-weight: 700;
	}

	.manage-btn {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 0.45rem 0.7rem;
	}

	.manage-btn:hover,
	.manage-btn:focus-visible {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.desk-menu {
		position: relative;
	}

	.desk-popover {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		right: 0;
		z-index: 26;
		display: grid;
		gap: 0.5rem;
		width: min(20rem, 80vw);
		padding: 0.7rem;
	}

	.advance {
		display: inline-flex;
		align-items: center;
	}

	@media (max-width: 980px) {
		.manage {
			display: none;
		}
	}
</style>
```

> Note: at ≤980px the management launchers hide (`.manage { display: none }`). A "Manage ▾" collapse popover for narrow screens is deferred to a follow-up; the e2e suite runs at desktop width where launchers are visible.

- [ ] **Step 5: Run `svelte-autofixer`, then the test to verify it passes**

Run svelte-autofixer until clean, then:
Run: `bun run test:unit -- src/lib/components/game/ControlDesk.svelte.spec.ts --run --project client`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/game/ControlDesk.svelte src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/styles/frames.css
git commit -m "feat: add bottom control desk command strip"
```

---

### Task 5: `ShortcutCheatSheet.svelte` — the `?` overlay

**Files:**
- Create: `src/lib/components/game/ShortcutCheatSheet.svelte`
- Test: `src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts`

**Interfaces:**
- Produces (props): `{ onClose: () => void }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ShortcutCheatSheet from './ShortcutCheatSheet.svelte';

describe('ShortcutCheatSheet', () => {
	it('lists shortcuts and closes', async () => {
		expect.assertions(3);
		const onClose = vi.fn();
		render(ShortcutCheatSheet, { onClose });
		await expect.element(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();
		await expect.element(page.getByText(/open build menu/i)).toBeVisible();
		await page.getByRole('button', { name: /close shortcuts/i }).first().click();
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts --run --project client`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- src/lib/components/game/ShortcutCheatSheet.svelte -->
<script lang="ts">
	interface Shortcut {
		keys: string;
		action: string;
	}

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	const shortcuts: Shortcut[] = [
		{ keys: 'B', action: 'Open build menu' },
		{ keys: 'Space', action: 'Advance day' },
		{ keys: '1 / 2 / 3', action: 'Retail / Industry / World view' },
		{ keys: 'Esc', action: 'Cancel or close' },
		{ keys: '?', action: 'Toggle this cheat sheet' }
	];
</script>

<div class="cheat-backdrop">
	<button type="button" class="backdrop-button" aria-label="Close shortcuts" onclick={onClose}></button>
	<div class="cheat-sheet paper" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
		<header>
			<h2>Keyboard Shortcuts</h2>
			<button type="button" class="btn-danger" aria-label="Close shortcuts" onclick={onClose}>×</button>
		</header>
		<dl>
			{#each shortcuts as shortcut (shortcut.keys)}
				<div class="row">
					<dt><kbd class="keycap">{shortcut.keys}</kbd></dt>
					<dd>{shortcut.action}</dd>
				</div>
			{/each}
		</dl>
	</div>
</div>

<style>
	.cheat-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.7);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		background: transparent;
		padding: 0;
	}

	.cheat-sheet {
		position: relative;
		z-index: 1;
		width: min(26rem, 100%);
		padding: 1.1rem 1.2rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.6rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.btn-danger {
		width: 2rem;
		height: 2rem;
		padding: 0;
	}

	dl {
		display: grid;
		gap: 0.5rem;
		margin: 0.85rem 0 0;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	dt {
		flex: 0 0 6rem;
	}

	dd {
		margin: 0;
		font-family: var(--font-body);
		color: var(--ink-500);
	}
</style>
```

- [ ] **Step 4: Run `svelte-autofixer`, then the test to verify it passes**

Run svelte-autofixer until clean, then:
Run: `bun run test:unit -- src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts --run --project client`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/ShortcutCheatSheet.svelte src/lib/components/game/ShortcutCheatSheet.svelte.spec.ts
git commit -m "feat: add keyboard shortcut cheat sheet"
```

---

### Task 6: Integrate the desk, top bar & shortcuts into `+page.svelte`

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**
- Consumes: `TopBar`, `ControlDesk`, `ShortcutCheatSheet` (Tasks 3–5); `collectGameAlerts`, `GameAlert` (Task 1); `resolveShortcutAction` (Task 2).

- [ ] **Step 1: Add imports**

In the import block of `src/routes/+page.svelte`, add:

```ts
import ControlDesk from '$lib/components/game/ControlDesk.svelte';
import ShortcutCheatSheet from '$lib/components/game/ShortcutCheatSheet.svelte';
import TopBar from '$lib/components/game/TopBar.svelte';
import { collectGameAlerts, type GameAlert } from '$lib/game/alerts';
import { resolveShortcutAction } from '$lib/game/keyboardShortcuts';
```

- [ ] **Step 2: Replace `isViewMenuOpen` state with cheat-sheet state and add derived helpers**

Remove the line `let isViewMenuOpen = $state(false);` and the `toggleViewMenu` function. Add:

```ts
let isCheatSheetOpen = $state(false);

let alerts = $derived<GameAlert[]>(game ? collectGameAlerts(game) : []);

let mapEyebrow = $derived(
	activeMapView === 'world' ? 'World Map' : activeMapView === 'industry' ? 'Industry City Map' : 'Retail City Map'
);
let mapTitle = $derived(
	activeMapView === 'world' ? 'Regional Network' : activeMapView === 'industry' ? industryCity.name : activeCity.name
);
```

- [ ] **Step 3: Update `isMapPaused` to include the cheat sheet**

Change the `isMapPaused` derived to OR in `isCheatSheetOpen`:

```ts
let isMapPaused = $derived(
	!isPlacementModeActive &&
		(isCheatSheetOpen || isBuildMenuOpen || activeManagementPanelId !== null || isSavePanelOpen)
);
```

(Note: `isViewMenuOpen` is gone; the desk view switcher no longer opens a map-covering menu.)

- [ ] **Step 4: Add the alert deep-link and shortcut handlers**

Add these functions (near `handleKeydown`):

```ts
function isTypingElement(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	const tag = target.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function handleSelectAlert(alert: GameAlert): void {
	if (alert.kind === 'decision') {
		openManagementPanel('decisions');
		return;
	}
	if (alert.kind === 'store-stock' && alert.tileId) {
		showRetailMap();
		selectedTileId = alert.tileId;
		return;
	}
	if (alert.kind === 'factory-blocked' && alert.tileId) {
		showIndustryMap();
		selectedIndustryTileId = alert.tileId;
	}
}
```

- [ ] **Step 5: Extend `handleKeydown` with `?`, Esc-closes-cheatsheet, and shortcut dispatch**

Replace the body of `handleKeydown` with:

```ts
function handleKeydown(event: KeyboardEvent) {
	unlockAudio();

	if (event.key === '?') {
		if (!isTypingElement(event.target)) {
			event.preventDefault();
			isCheatSheetOpen = !isCheatSheetOpen;
		}
		return;
	}

	if (event.key === 'Escape') {
		if (isCheatSheetOpen) {
			isCheatSheetOpen = false;
			return;
		}
		if (isBuildMenuOpen) {
			isBuildMenuOpen = false;
			return;
		}
		if (isPlacementModeActive) {
			cancelPlacement();
			return;
		}
		if (isSavePanelOpen) {
			isSavePanelOpen = false;
			return;
		}
		if (activeManagementPanelId !== null) {
			activeManagementPanelId = null;
			return;
		}
		if (selectedWorldCityId !== null) {
			selectedWorldCityId = null;
			return;
		}
		if (selectedTileId !== null) {
			selectedTileId = null;
			return;
		}
		if (selectedIndustryTileId !== null) {
			selectedIndustryTileId = null;
		}
		return;
	}

	const action = resolveShortcutAction({
		key: event.key,
		isTypingTarget: isTypingElement(event.target),
		hasBlockingOverlay:
			isCheatSheetOpen ||
			isBuildMenuOpen ||
			isSavePanelOpen ||
			isPlacementModeActive ||
			activeManagementPanelId !== null,
		activeMapView,
		hasGame: game !== null
	});

	if (!action) {
		return;
	}

	event.preventDefault();

	if (action.type === 'build') {
		openBuildMenu();
	} else if (action.type === 'advance-day') {
		advanceDay();
	} else if (action.type === 'view') {
		if (action.view === 'retail') {
			showRetailMap();
		} else if (action.view === 'industry') {
			showIndustryMap();
		} else {
			showWorldMap();
		}
	}
}
```

- [ ] **Step 6: Replace the `.map-hud` markup with `TopBar` + `ControlDesk`**

Delete the entire `<div class="map-hud" ...> … </div>` block (from `<div class="map-hud"` through its closing `</div>` before `{#if isPlacementModeActive}`). In its place, and keeping the `map-surfaces` div above it, render:

```svelte
<TopBar
	eyebrow={mapEyebrow}
	title={mapTitle}
	day={game?.day ?? null}
	cash={game?.cash ?? null}
	{alerts}
	onSelectAlert={handleSelectAlert}
/>

<ControlDesk
	{activeMapView}
	managementItems={managementPanelMenuItems}
	buildDisabled={activeMapView === 'world'}
	advanceDisabled={game === null}
	onBuild={openBuildMenu}
	onSelectView={(view) => {
		if (view === 'retail') showRetailMap();
		else if (view === 'industry') showIndustryMap();
		else showWorldMap();
	}}
	onOpenManagement={(id) => openManagementPanel(id as ManagementPanelId)}
	onAdvanceDay={advanceDay}
>
	{#snippet menuContent()}
		<button type="button" onclick={openSavePanel}>Saves</button>
		<AudioSettings preferences={audioPreferences} onChange={updateAudioPreferences} />
	{/snippet}
</ControlDesk>
```

- [ ] **Step 7: Render the cheat sheet overlay**

Just before the closing `</main>` (after the SavePanel block), add:

```svelte
{#if isCheatSheetOpen}
	<ShortcutCheatSheet onClose={() => (isCheatSheetOpen = false)} />
{/if}
```

- [ ] **Step 8: Reposition the placement status bar above the desk and drop dead HUD CSS**

In the `<style>` block, change `.placement-status` `bottom: 1rem;` to `bottom: 4.5rem;` (clears the desk). Delete now-unused rules: `.map-hud`, `.map-actions`, `.map-title`, `.map-title-bookmark`, `.hud-menu`, `.hud-status`, `.hud-status strong`, `.hud-status span`, `.hud-dropdown` (+ its descendant selectors), and `.primary` / `.primary:hover` (the old advance-day button styles). Keep `.status`, `.ticker`, `.inspector-overlay`, `.tower-*`, and the `@media (max-width: 980px)` block minus the deleted selectors (`.map-hud`, `.map-title`, `.map-actions`, `.hud-status`).

- [ ] **Step 9: Run type-check and unit tests**

Run: `bun run check`
Expected: no errors.
Run: `bun run test:unit -- --run`
Expected: all pass (including Tasks 1–5).

- [ ] **Step 10: Update e2e helpers for the new HUD**

In `src/routes/retail-sim.e2e.ts`:

Replace the `openMapMenuItem` helper body (it currently clicks "open menu" then a menuitem) with a direct desk-button click:

```ts
async function openMapMenuItem(page: Page, itemName: RegExp) {
	await page.getByRole('button', { name: itemName }).click();
}
```

Replace the `openSaves` helper (currently "open menu" → Saves) with the desk menu:

```ts
async function openSaves(page: Page) {
	await page.getByRole('button', { name: /^menu$/i }).click();
	await page.getByRole('button', { name: /saves/i }).click();
}
```

Find the map-navigation test that uses `getByRole('menu', { name: /map navigation/i })` and its `menuitem` assertions (around the block that clicks "open menu" then checks `mapMenu` menuitems). Replace those assertions with direct desk-button checks, e.g.:

```ts
await expect(page.getByRole('button', { name: /world map/i })).toBeEnabled();
await expect(page.getByRole('button', { name: /retail city map/i })).toBeEnabled();
await expect(page.getByRole('button', { name: /industry city map/i })).toBeEnabled();
```

The existing `/^build$/i`, `/^advance day$/i`, and `/close saves/i` selectors are preserved by the new components and need no change.

- [ ] **Step 11: Add a shortcut e2e assertion**

Add a focused test (near the existing HUD tests) verifying keyboard shortcuts drive the HUD:

```ts
test('keyboard shortcuts open build and switch views', async ({ page }) => {
	await gotoRetailSim(page); // use the suite's existing navigation/setup helper
	await page.keyboard.press('b');
	await expect(page.getByRole('dialog', { name: /build menu/i })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /build menu/i })).toHaveCount(0);
	await page.keyboard.press('2');
	await expect(page.getByRole('button', { name: /industry city map/i })).toHaveAttribute('aria-pressed', 'true');
});
```

> Match the suite's existing setup helper name for navigating to the built app (inspect the top of `retail-sim.e2e.ts`); `gotoRetailSim` is a placeholder for whatever the file already uses.

- [ ] **Step 12: Run lint, check, unit and e2e**

Run: `bun run lint`
Expected: clean.
Run: `bun run check`
Expected: clean.
Run: `bun run test:unit -- --run`
Expected: all pass.
Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts`
Expected: all pass.

- [ ] **Step 13: Commit**

```bash
git add src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat: wire control desk, top bar, and keyboard shortcuts into the game page"
```

---

## Self-Review

**Spec coverage (Parts 1 & 3 of the design doc):**
- Bottom control desk (Build, view switcher, management launchers, Advance Day, ⚙ Menu with Saves + Audio) → Task 4 + Task 6.
- Slim top bar (location + Day + Cash + alerts bell) → Task 3 + Task 6.
- Alerts derived from out-of-stock stores, pending decisions, blocked factories → Task 1; bell + deep-links → Tasks 3 & 6.
- Shortcuts `B` / `Space` / `1-3` / `Esc` / `?` with typing/overlay guards → Task 2 + Task 6; on-button keycaps → Tasks 4 & 5; cheat sheet → Task 5.
- `isMapPaused` preserved → Task 6 Step 3. Renderer `data-*` untouched (no renderer files modified).
- Responsive collapse noted (management hides ≤980px; full "Manage ▾" popover deferred) → Task 4 note.

Parts 2 (shop split) and 4 (industry advisor) are intentionally out of this plan — separate plans follow.

**Placeholder scan:** No TBD/TODO. Two explicit "match the existing helper" notes (e2e setup helper name; narrow-screen Manage popover deferral) are flagged as such, not silent gaps.

**Type consistency:** `GameAlert` shape identical in Task 1 (definition), Task 3 (prop), Task 6 (derived + handler). `resolveShortcutAction` / `ShortcutContext` identical in Task 2 and Task 6. `ManagementItem { id; label }` in Task 4 matches `managementPanelMenuItems` (`{ id: ManagementPanelId; label: string }`) passed in Task 6, with the `id as ManagementPanelId` cast at the call site. `MapViewId` union (`'retail' | 'industry' | 'world'`) consistent across Tasks 2, 4, 6.

## Execution note

This plan assumes work happens on a feature branch. If the repo is on `main`, create a branch (e.g. `git switch -c hud-control-desk`) before Task 1.
