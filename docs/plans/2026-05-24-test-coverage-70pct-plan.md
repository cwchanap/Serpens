# Test Coverage 70% — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Raise line coverage from ~64% to 70% by adding tests for 0%-coverage files, prioritizing trivial wins.

**Architecture:** TDD approach — write failing test first, then make it pass. Tests follow existing conventions: `.svelte.spec.ts` for components (client/Playwright), `.spec.ts` for pure logic (server/node).

**Tech Stack:** Vitest, vitest-browser-svelte, Playwright (Chromium headless), vi.mock/vi.fn for mocking.

---

### Task 1: `saveRepositoryFactory.spec.ts` — Browser path

**Files:**

- Create: `src/lib/persistence/saveRepositoryFactory.spec.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('@tauri-apps/api/core', () => ({
	isTauri: () => false
}));

describe('createSaveRepository', () => {
	it('returns browser save repository when not in Tauri', async () => {
		expect.assertions(1);
		const { createSaveRepository } = await import('./saveRepositoryFactory');
		const repo = await createSaveRepository();
		expect(repo).toBeDefined();
	});
});
```

**Step 2: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/persistence/saveRepositoryFactory.spec.ts --run`
Expected: PASS (browser path is the default, existing code handles it)

**Step 3: Commit**

```bash
git add src/lib/persistence/saveRepositoryFactory.spec.ts
git commit -m "test: cover saveRepositoryFactory browser path"
```

---

### Task 2: `Scorecard.svelte.spec.ts`

**Files:**

- Create: `src/lib/components/game/Scorecard.svelte.spec.ts`

**Step 1: Write the failing test**

```typescript
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Scorecard from './Scorecard.svelte';
import type { Scorecard as ScorecardData } from '$lib/game/types';

const scorecard: ScorecardData = {
	profit: 72,
	customerSatisfaction: 85,
	staffMorale: 60,
	marketPosition: 45
};

describe('Scorecard', () => {
	it('renders four score meters with correct values', async () => {
		expect.assertions(8);

		render(Scorecard, { scorecard });

		await expect.element(page.getByRole('heading', { name: 'Scorecard' })).toBeVisible();

		const meters = page.getByRole('meter');
		await expect.element(meters.nth(0)).toHaveAttribute('value', '72');
		await expect.element(meters.nth(1)).toHaveAttribute('value', '85');
		await expect.element(meters.nth(2)).toHaveAttribute('value', '60');
		await expect.element(meters.nth(3)).toHaveAttribute('value', '45');

		await expect.element(page.getByText('Profit')).toBeVisible();
		await expect.element(page.getByText('Customers')).toBeVisible();
		await expect.element(page.getByText('Staff')).toBeVisible();
		await expect.element(page.getByText('Market')).toBeVisible();
	});
});
```

**Step 2: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/components/game/Scorecard.svelte.spec.ts --run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/components/game/Scorecard.svelte.spec.ts
git commit -m "test: cover Scorecard component"
```

---

### Task 3: `DecisionQueue.svelte.spec.ts`

**Files:**

- Create: `src/lib/components/game/DecisionQueue.svelte.spec.ts`

**Step 1: Write the failing test**

```typescript
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DecisionQueue from './DecisionQueue.svelte';
import type { DecisionItem } from '$lib/game/types';

const decisions: DecisionItem[] = [
	{
		id: 'decision-1',
		title: 'Staff Dispute',
		context: 'Two employees are arguing over shift assignments.',
		expiresOnDay: 5,
		options: [
			{
				id: 'opt-a',
				label: 'Mediate',
				description: 'Sit them down and talk it out',
				effects: { staffMorale: 5 }
			},
			{
				id: 'opt-b',
				label: 'Ignore',
				description: 'Let them figure it out',
				effects: { staffMorale: -3 }
			}
		]
	}
];

describe('DecisionQueue', () => {
	it('shows empty message when no decisions', async () => {
		expect.assertions(1);

		render(DecisionQueue, {
			decisions: [],
			onResolve: vi.fn()
		});

		await expect.element(page.getByText('No urgent decisions today.')).toBeVisible();
	});

	it('renders decision cards with options', async () => {
		expect.assertions(5);

		render(DecisionQueue, {
			decisions,
			onResolve: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: 'Decision Queue' })).toBeVisible();
		await expect.element(page.getByText('Staff Dispute')).toBeVisible();
		await expect.element(page.getByText('Expires day 5')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Mediate/ })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Ignore/ })).toBeVisible();
	});

	it('calls onResolve with decision and option IDs when option clicked', async () => {
		expect.assertions(1);
		const onResolve = vi.fn();

		render(DecisionQueue, { decisions, onResolve });

		await page.getByRole('button', { name: /Mediate/ }).click();
		expect(onResolve).toHaveBeenCalledWith('decision-1', 'opt-a');
	});
});
```

**Step 2: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/components/game/DecisionQueue.svelte.spec.ts --run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/components/game/DecisionQueue.svelte.spec.ts
git commit -m "test: cover DecisionQueue component"
```

---

### Task 4: `PolicyPanel.svelte.spec.ts`

**Files:**

- Create: `src/lib/components/game/PolicyPanel.svelte.spec.ts`

**Step 1: Write the failing test**

```typescript
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PolicyPanel from './PolicyPanel.svelte';
import type { CompanyPolicy } from '$lib/game/types';

const policy: CompanyPolicy = {
	pricing: 'competitive',
	inventory: 'balanced',
	staffing: 'efficient',
	marketing: 'awareness',
	service: 'balanced'
};

describe('PolicyPanel', () => {
	it('renders five policy selects with current values', async () => {
		expect.assertions(6);

		render(PolicyPanel, { policy, onChange: vi.fn() });

		await expect.element(page.getByRole('heading', { name: 'Policies' })).toBeVisible();

		const selects = page.getByRole('combobox');
		await expect.element(selects.nth(0)).toHaveValue('competitive');
		await expect.element(selects.nth(1)).toHaveValue('balanced');
		await expect.element(selects.nth(2)).toHaveValue('efficient');
		await expect.element(selects.nth(3)).toHaveValue('awareness');
		await expect.element(selects.nth(4)).toHaveValue('balanced');
	});

	it('calls onChange with correct patch when select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		render(PolicyPanel, { policy, onChange });

		const pricingSelect = page.getByRole('combobox').nth(0);
		await pricingSelect.selectOption('premium');
		expect(onChange).toHaveBeenCalledWith({ pricing: 'premium' });
	});
});
```

**Step 2: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/components/game/PolicyPanel.svelte.spec.ts --run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/components/game/PolicyPanel.svelte.spec.ts
git commit -m "test: cover PolicyPanel component"
```

---

### Task 5: `CityMap.svelte.spec.ts`

**Files:**

- Create: `src/lib/components/game/CityMap.svelte.spec.ts`

**Step 1: Write the failing test**

```typescript
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CityMap from './CityMap.svelte';
import type { CityMapSnapshot } from '$lib/game/mapRender';

const mockUpdateSnapshot = vi.fn();
const mockSetEventHandler = vi.fn();
const mockGameDestroy = vi.fn();

vi.mock('phaser', () => {
	return {
		default: {
			Game: vi.fn().mockImplementation(() => ({
				destroy: mockGameDestroy,
				canvas: document.createElement('canvas')
			})),
			AUTO: 0,
			Scale: {
				RESIZE: 0,
				CENTER_BOTH: 0,
				Events: { RESIZE: 'resize' }
			}
		}
	};
});

vi.mock('$lib/phaser/cityMapScene', () => ({
	CityMapScene: vi.fn().mockImplementation(() => ({
		updateSnapshot: mockUpdateSnapshot,
		setEventHandler: mockSetEventHandler
	}))
}));

const emptySnapshot: CityMapSnapshot = {
	cityId: 'test-city',
	width: 2,
	height: 2,
	selectedTileId: null,
	placementPreview: null,
	tiles: [],
	stores: []
};

describe('CityMap', () => {
	it('renders the map container', async () => {
		expect.assertions(1);

		render(CityMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn()
		});

		await expect.element(page.getByRole('region', { name: 'City map' })).toBeVisible();
	});

	it('shows fallback when Phaser fails to load', async () => {
		expect.assertions(1);
		vi.doMock('phaser', () => {
			throw new Error('Phaser not available');
		});

		render(CityMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn()
		});

		await expect.element(page.getByText('Map renderer unavailable.')).toBeVisible();
	});
});
```

**Step 2: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/components/game/CityMap.svelte.spec.ts --run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/components/game/CityMap.svelte.spec.ts
git commit -m "test: cover CityMap component"
```

---

### Task 6: `IndustryMap.svelte.spec.ts`

**Files:**

- Create: `src/lib/components/game/IndustryMap.svelte.spec.ts`

**Step 1: Write the failing test**

```typescript
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IndustryMap from './IndustryMap.svelte';
import type { IndustryMapSnapshot } from '$lib/game/industryMapRender';

const mockUpdateSnapshot = vi.fn();
const mockSetEventHandler = vi.fn();

vi.mock('phaser', () => ({
	default: {
		Game: vi.fn().mockImplementation(() => ({
			destroy: vi.fn(),
			canvas: document.createElement('canvas')
		})),
		AUTO: 0,
		Scale: {
			RESIZE: 0,
			CENTER_BOTH: 0,
			Events: { RESIZE: 'resize' }
		}
	}
}));

vi.mock('$lib/phaser/industryMapScene', () => ({
	IndustryMapScene: vi.fn().mockImplementation(() => ({
		updateSnapshot: mockUpdateSnapshot,
		setEventHandler: mockSetEventHandler
	}))
}));

const emptySnapshot: IndustryMapSnapshot = {
	cityId: 'test-industry-city',
	width: 2,
	height: 2,
	selectedTileId: null,
	placementPreview: null,
	tiles: [],
	buildings: []
};

describe('IndustryMap', () => {
	it('renders the map container', async () => {
		expect.assertions(1);

		render(IndustryMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn()
		});

		await expect.element(page.getByRole('region', { name: 'Industry map' })).toBeVisible();
	});

	it('shows fallback when Phaser fails to load', async () => {
		expect.assertions(1);

		render(IndustryMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn()
		});

		await expect.element(page.getByText('Industry map renderer unavailable.')).toBeVisible();
	});
});
```

**Step 2: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/components/game/IndustryMap.svelte.spec.ts --run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/components/game/IndustryMap.svelte.spec.ts
git commit -m "test: cover IndustryMap component"
```

---

### Task 7: Measure coverage checkpoint

**Step 1: Run full coverage**

Run: `bun run test:unit -- --coverage --run`

**Step 2: Check if lines >= 70%**

- If yes: stop here. Coverage target reached.
- If no: continue to Task 8 (Phaser scene mocks).

---

### Task 8 (Insurance): `cityMapScene.spec.ts`

**Files:**

- Create: `src/lib/phaser/cityMapScene.spec.ts`

This task requires a comprehensive Phaser mock. Only implement if coverage is still below 70% after Tasks 1-6.

**Step 1: Create Phaser mock factory**

Create a mock that stubs `Phaser.Scene` base class with `add`, `input`, `scale`, `cameras`, `textures`, `events`, `load`, and `game` properties. Each method should return chainable mock objects.

**Step 2: Write tests for scene lifecycle**

Test `preload`, `create`, `updateSnapshot`, `setEventHandler`, `update`, and the private `renderSnapshot` path that creates terrain sprites and store sprites from snapshot data. Assert `data-*` attributes are set on the mock canvas.

**Step 3: Commit**

```bash
git add src/lib/phaser/cityMapScene.spec.ts
git commit -m "test: cover CityMapScene with Phaser mocks"
```

---

### Task 9 (Insurance): `industryMapScene.spec.ts`

Same pattern as Task 8 but for `IndustryMapScene`. Only implement if still below 70%.

---

### Task 10 (Insurance): `+page.svelte.spec.ts`

Only implement if still below 70% after Tasks 8-9. This is the most complex test — requires mocking all game transition functions, persistence, and Phaser.
