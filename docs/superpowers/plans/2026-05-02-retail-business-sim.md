# Retail Business Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable local-chain MVP for a retail business simulation game.

**Architecture:** Keep the game engine in pure TypeScript modules under `src/lib/game`, with deterministic seeded simulation and no UI dependencies. Use Svelte 5 components for the Control Tower interface, with the route owning reactive game state and passing snapshots/callbacks into focused components. Phaser is intentionally excluded from the MVP core and can be added later as an optional visual renderer.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Tailwind CSS, Vitest, Playwright, Bun.

---

## File Structure

- Create `src/lib/game/types.ts`: shared domain types and constants.
- Create `src/lib/game/rng.ts`: deterministic seeded random helpers.
- Create `src/lib/game/archetypes.ts`: data-driven starting retail archetypes.
- Create `src/lib/game/reports.ts`: scorecard clamping and rolling report helpers.
- Create `src/lib/game/state.ts`: new game, policy updates, decision resolution, expansion helpers.
- Create `src/lib/game/simulateDay.ts`: deterministic daily simulation.
- Create `src/lib/game/events.ts`: sparse decision generation and effect resolution.
- Create `src/lib/game/*.spec.ts`: unit tests for all pure game modules.
- Create `src/lib/components/game/Scorecard.svelte`: balanced scorecard display.
- Create `src/lib/components/game/StoreOverview.svelte`: compact store status list.
- Create `src/lib/components/game/PolicyPanel.svelte`: company policy controls.
- Create `src/lib/components/game/DecisionQueue.svelte`: decision cards and options.
- Create `src/lib/components/game/ReportsPanel.svelte`: latest and rolling reports.
- Modify `src/routes/+page.svelte`: new game start and Control Tower composition.
- Modify `src/routes/layout.css`: global page styling and base colors.
- Create `src/routes/retail-sim.e2e.ts`: Playwright coverage for first playable flow.

## Shared Domain Contract

Use these core names consistently across tasks.

```ts
export const MAX_STORES = 3;

export type ArchetypeId = 'convenience' | 'boutique' | 'electronics' | 'grocery';
export type PricingPosture = 'discount' | 'competitive' | 'standard' | 'premium';
export type InventoryBuffer = 'lean' | 'balanced' | 'generous';
export type StaffingPosture = 'minimal' | 'efficient' | 'service';
export type MarketingFocus = 'none' | 'awareness' | 'promotions' | 'loyalty';
export type ServicePriority = 'speed' | 'balanced' | 'highTouch';
export type ScoreKey = 'profit' | 'customerSatisfaction' | 'staffMorale' | 'marketPosition';

export interface CompanyPolicy {
	pricing: PricingPosture;
	inventory: InventoryBuffer;
	staffing: StaffingPosture;
	marketing: MarketingFocus;
	service: ServicePriority;
}

export interface Scorecard {
	profit: number;
	customerSatisfaction: number;
	staffMorale: number;
	marketPosition: number;
}

export interface ProductCategory {
	id: string;
	name: string;
	baseDemand: number;
	margin: number;
}

export interface StoreArchetype {
	id: ArchetypeId;
	name: string;
	description: string;
	startingCash: number;
	startingDebt: number;
	baseRent: number;
	baseWage: number;
	baseTraffic: number;
	customerExpectation: number;
	startingCategories: ProductCategory[];
	risks: string[];
}

export interface Store {
	id: string;
	name: string;
	archetypeId: ArchetypeId;
	location: string;
	daysOpen: number;
	reputation: number;
	stockHealth: number;
	staffMorale: number;
	staffCapacity: number;
	localDemand: number;
	competition: number;
	managerQuality: number;
}

export interface DailyStoreReport {
	storeId: string;
	revenue: number;
	costOfGoods: number;
	grossMargin: number;
	operatingCosts: number;
	netIncome: number;
	customersServed: number;
	demandMissed: number;
	stockHealth: number;
	staffMorale: number;
	reputation: number;
	marketPosition: number;
	warnings: string[];
}

export interface DailyReport {
	day: number;
	revenue: number;
	costOfGoods: number;
	grossMargin: number;
	operatingCosts: number;
	netIncome: number;
	cashAfter: number;
	scorecard: Scorecard;
	storeReports: DailyStoreReport[];
	warnings: string[];
}

export interface DecisionOption {
	id: string;
	label: string;
	description: string;
	effects: Partial<Scorecard> & {
		cash?: number;
		stockHealth?: number;
		staffMorale?: number;
		reputation?: number;
	};
}

export interface DecisionItem {
	id: string;
	title: string;
	context: string;
	expiresOnDay: number;
	options: DecisionOption[];
}

export interface GameState {
	seed: number;
	rngState: number;
	day: number;
	cash: number;
	debt: number;
	policy: CompanyPolicy;
	scorecard: Scorecard;
	stores: Store[];
	decisions: DecisionItem[];
	reports: DailyReport[];
}
```

## Task 1: Deterministic Foundations and Archetypes

**Files:**

- Create: `src/lib/game/types.ts`
- Create: `src/lib/game/rng.ts`
- Create: `src/lib/game/archetypes.ts`
- Test: `src/lib/game/rng.spec.ts`
- Test: `src/lib/game/archetypes.spec.ts`

- [ ] **Step 1: Write the RNG tests**

Create `src/lib/game/rng.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createRng, randomBetween, randomInt } from './rng';

describe('seeded RNG', () => {
	test('creates repeatable sequences for the same seed', () => {
		expect.assertions(1);
		const first = createRng(12345);
		const second = createRng(12345);

		const firstValues = [first.next(), first.next(), first.next()];
		const secondValues = [second.next(), second.next(), second.next()];

		expect(firstValues).toEqual(secondValues);
	});

	test('generates bounded floating point and integer values', () => {
		expect.assertions(2);
		const rng = createRng(77);

		expect(randomBetween(rng, 10, 20)).toBeGreaterThanOrEqual(10);
		expect(randomInt(rng, 3, 5)).toBeLessThanOrEqual(5);
	});
});
```

- [ ] **Step 2: Write the archetype tests**

Create `src/lib/game/archetypes.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { ARCHETYPES, getArchetype } from './archetypes';

describe('retail archetypes', () => {
	test('defines the four starting archetypes', () => {
		expect.assertions(1);
		expect(ARCHETYPES.map((archetype) => archetype.id)).toEqual([
			'convenience',
			'boutique',
			'electronics',
			'grocery'
		]);
	});

	test('each archetype has economic inputs and product categories', () => {
		expect.assertions(5);
		for (const archetype of ARCHETYPES) {
			expect(archetype.startingCash).toBeGreaterThan(0);
			expect(archetype.baseRent).toBeGreaterThan(0);
			expect(archetype.baseWage).toBeGreaterThan(0);
			expect(archetype.baseTraffic).toBeGreaterThan(0);
			expect(archetype.startingCategories.length).toBeGreaterThan(0);
		}
	});

	test('looks up an archetype by id', () => {
		expect.assertions(1);
		expect(getArchetype('electronics').name).toBe('Electronics & Games');
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun run test:unit -- --run src/lib/game/rng.spec.ts src/lib/game/archetypes.spec.ts`

Expected: FAIL because `src/lib/game/rng.ts` and `src/lib/game/archetypes.ts` do not exist.

- [ ] **Step 4: Implement types, RNG, and archetypes**

Create `src/lib/game/types.ts` using the exact domain contract from the "Shared Domain Contract" section.

Create `src/lib/game/rng.ts`:

```ts
export interface Rng {
	next: () => number;
	getState: () => number;
}

const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;

export function normalizeSeed(seed: number): number {
	const normalized = Math.floor(Math.abs(seed)) % MODULUS;
	return normalized === 0 ? 1 : normalized;
}

export function createRng(seed: number): Rng {
	let state = normalizeSeed(seed);

	return {
		next: () => {
			state = (state * MULTIPLIER) % MODULUS;
			return state / MODULUS;
		},
		getState: () => state
	};
}

export function createRngFromState(state: number): Rng {
	return createRng(state);
}

export function randomBetween(rng: Rng, min: number, max: number): number {
	return min + (max - min) * rng.next();
}

export function randomInt(rng: Rng, min: number, max: number): number {
	return Math.floor(randomBetween(rng, min, max + 1));
}
```

Create `src/lib/game/archetypes.ts`:

```ts
import type { ArchetypeId, StoreArchetype } from './types';

export const ARCHETYPES: StoreArchetype[] = [
	{
		id: 'convenience',
		name: 'Convenience Store',
		description: 'Fast turnover, steady foot traffic, low margins, and stockout sensitivity.',
		startingCash: 32_000,
		startingDebt: 8_000,
		baseRent: 115,
		baseWage: 420,
		baseTraffic: 132,
		customerExpectation: 58,
		startingCategories: [
			{ id: 'snacks', name: 'Snacks', baseDemand: 72, margin: 0.34 },
			{ id: 'drinks', name: 'Drinks', baseDemand: 88, margin: 0.3 },
			{ id: 'essentials', name: 'Essentials', baseDemand: 45, margin: 0.22 }
		],
		risks: ['Stockouts', 'Low margins', 'High foot traffic pressure']
	},
	{
		id: 'boutique',
		name: 'Boutique Goods',
		description: 'Curated products, customer taste, reputation sensitivity, and premium upside.',
		startingCash: 38_000,
		startingDebt: 6_000,
		baseRent: 135,
		baseWage: 390,
		baseTraffic: 58,
		customerExpectation: 72,
		startingCategories: [
			{ id: 'apparel', name: 'Apparel', baseDemand: 36, margin: 0.5 },
			{ id: 'home-goods', name: 'Home Goods', baseDemand: 30, margin: 0.44 },
			{ id: 'gifts', name: 'Gifts', baseDemand: 26, margin: 0.48 }
		],
		risks: ['Trend mismatch', 'Reputation swings', 'Premium service expectations']
	},
	{
		id: 'electronics',
		name: 'Electronics & Games',
		description: 'Higher-ticket sales, trend spikes, launches, and shrink risk.',
		startingCash: 46_000,
		startingDebt: 12_000,
		baseRent: 150,
		baseWage: 460,
		baseTraffic: 52,
		customerExpectation: 68,
		startingCategories: [
			{ id: 'games', name: 'Games', baseDemand: 40, margin: 0.28 },
			{ id: 'accessories', name: 'Accessories', baseDemand: 34, margin: 0.42 },
			{ id: 'devices', name: 'Devices', baseDemand: 18, margin: 0.24 }
		],
		risks: ['Launch volatility', 'Shrink', 'Expensive inventory']
	},
	{
		id: 'grocery',
		name: 'Grocery Market',
		description: 'Recurring demand, freshness pressure, broad categories, and supply complexity.',
		startingCash: 42_000,
		startingDebt: 14_000,
		baseRent: 165,
		baseWage: 520,
		baseTraffic: 118,
		customerExpectation: 65,
		startingCategories: [
			{ id: 'produce', name: 'Produce', baseDemand: 64, margin: 0.26 },
			{ id: 'pantry', name: 'Pantry', baseDemand: 74, margin: 0.24 },
			{ id: 'prepared', name: 'Prepared Food', baseDemand: 38, margin: 0.38 }
		],
		risks: ['Freshness', 'Waste', 'Staffing pressure']
	}
];

export function getArchetype(id: ArchetypeId): StoreArchetype {
	const archetype = ARCHETYPES.find((candidate) => candidate.id === id);

	if (!archetype) {
		throw new Error(`Unknown archetype: ${id}`);
	}

	return archetype;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/lib/game/rng.spec.ts src/lib/game/archetypes.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/rng.ts src/lib/game/archetypes.ts src/lib/game/rng.spec.ts src/lib/game/archetypes.spec.ts
git commit -m "feat: add retail sim foundations"
```

## Task 2: Game State, Policies, and Expansion

**Files:**

- Create: `src/lib/game/state.ts`
- Test: `src/lib/game/state.spec.ts`

- [ ] **Step 1: Write state tests**

Create `src/lib/game/state.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createNewGame, openStore, resolveDecision, updatePolicy } from './state';

describe('game state', () => {
	test('creates a new game from an archetype', () => {
		expect.assertions(6);
		const game = createNewGame('boutique', 1001);

		expect(game.seed).toBe(1001);
		expect(game.day).toBe(1);
		expect(game.stores).toHaveLength(1);
		expect(game.stores[0]?.archetypeId).toBe('boutique');
		expect(game.policy.pricing).toBe('standard');
		expect(game.scorecard.customerSatisfaction).toBeGreaterThan(0);
	});

	test('updates company policy immutably', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 22);
		const updated = updatePolicy(game, { pricing: 'premium', inventory: 'generous' });

		expect(updated).not.toBe(game);
		expect(updated.policy.pricing).toBe('premium');
		expect(game.policy.pricing).toBe('standard');
	});

	test('opens stores up to the local chain limit', () => {
		expect.assertions(5);
		const game = createNewGame('electronics', 44);
		const second = openStore(game, { name: 'Mall Kiosk', location: 'West Mall' });
		const third = openStore(second, { name: 'Campus Shop', location: 'North Campus' });
		const fourth = openStore(third, { name: 'Airport Shop', location: 'Airport' });

		expect(second.stores).toHaveLength(2);
		expect(second.cash).toBeLessThan(game.cash);
		expect(third.stores).toHaveLength(3);
		expect(fourth.stores).toHaveLength(3);
		expect(fourth.decisions.at(-1)?.title).toBe('Expansion unavailable');
	});

	test('resolves a decision by applying effects and removing it', () => {
		expect.assertions(3);
		const game = createNewGame('grocery', 55);
		const decision = {
			id: 'supplier-1',
			title: 'Supplier discount',
			context: 'A supplier offers a short-term discount.',
			expiresOnDay: 3,
			options: [
				{
					id: 'accept',
					label: 'Accept',
					description: 'Take the savings.',
					effects: { cash: 500, customerSatisfaction: -1, stockHealth: 3 }
				}
			]
		};

		const resolved = resolveDecision({ ...game, decisions: [decision] }, 'supplier-1', 'accept');

		expect(resolved.cash).toBe(game.cash + 500);
		expect(resolved.decisions).toHaveLength(0);
		expect(resolved.scorecard.customerSatisfaction).toBe(game.scorecard.customerSatisfaction - 1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/lib/game/state.spec.ts`

Expected: FAIL because `src/lib/game/state.ts` does not exist.

- [ ] **Step 3: Implement state helpers**

Create `src/lib/game/state.ts`:

```ts
import { getArchetype } from './archetypes';
import { clampScore } from './reports';
import { normalizeSeed } from './rng';
import {
	MAX_STORES,
	type ArchetypeId,
	type CompanyPolicy,
	type DecisionItem,
	type GameState,
	type Store
} from './types';

export const DEFAULT_POLICY: CompanyPolicy = {
	pricing: 'standard',
	inventory: 'balanced',
	staffing: 'efficient',
	marketing: 'awareness',
	service: 'balanced'
};

export function createNewGame(archetypeId: ArchetypeId, seed = Date.now()): GameState {
	const archetype = getArchetype(archetypeId);
	const normalizedSeed = normalizeSeed(seed);

	return {
		seed: normalizedSeed,
		rngState: normalizedSeed,
		day: 1,
		cash: archetype.startingCash,
		debt: archetype.startingDebt,
		policy: DEFAULT_POLICY,
		scorecard: {
			profit: 55,
			customerSatisfaction: archetype.customerExpectation,
			staffMorale: 62,
			marketPosition: 18
		},
		stores: [
			{
				id: 'store-1',
				name: `${archetype.name} #1`,
				archetypeId,
				location: 'Downtown',
				daysOpen: 1,
				reputation: archetype.customerExpectation,
				stockHealth: 72,
				staffMorale: 64,
				staffCapacity: 1,
				localDemand: archetype.baseTraffic,
				competition: 45,
				managerQuality: 52
			}
		],
		decisions: [],
		reports: []
	};
}

export function updatePolicy(game: GameState, patch: Partial<CompanyPolicy>): GameState {
	return {
		...game,
		policy: {
			...game.policy,
			...patch
		}
	};
}

export function openStore(
	game: GameState,
	input: { name: string; location: string; setupCost?: number }
): GameState {
	if (game.stores.length >= MAX_STORES) {
		return {
			...game,
			decisions: [
				...game.decisions,
				{
					id: `expansion-blocked-${game.day}`,
					title: 'Expansion unavailable',
					context:
						'The MVP local-chain limit is 3 stores. Improve the current stores before expanding further.',
					expiresOnDay: game.day + 1,
					options: [
						{
							id: 'acknowledge',
							label: 'Acknowledge',
							description: 'Keep operating the existing chain.',
							effects: {}
						}
					]
				}
			]
		};
	}

	const archetype = getArchetype(game.stores[0]?.archetypeId ?? 'convenience');
	const setupCost = input.setupCost ?? 12_000 + game.stores.length * 4_000;

	if (game.cash < setupCost) {
		return {
			...game,
			decisions: [...game.decisions, createCashBlockedDecision(game.day, setupCost)]
		};
	}

	const storeNumber = game.stores.length + 1;
	const store: Store = {
		id: `store-${storeNumber}`,
		name: input.name,
		archetypeId: archetype.id,
		location: input.location,
		daysOpen: 1,
		reputation: Math.max(45, archetype.customerExpectation - 8),
		stockHealth: 65,
		staffMorale: 58,
		staffCapacity: 0.86,
		localDemand: Math.round(archetype.baseTraffic * (0.78 + storeNumber * 0.08)),
		competition: 48 + storeNumber * 6,
		managerQuality: 48
	};

	return {
		...game,
		cash: game.cash - setupCost,
		stores: [...game.stores, store],
		scorecard: {
			...game.scorecard,
			marketPosition: clampScore(game.scorecard.marketPosition + 8)
		}
	};
}

export function resolveDecision(game: GameState, decisionId: string, optionId: string): GameState {
	const decision = game.decisions.find((item) => item.id === decisionId);
	const option = decision?.options.find((candidate) => candidate.id === optionId);

	if (!decision || !option) {
		return game;
	}

	const cashDelta = option.effects.cash ?? 0;
	const stockDelta = option.effects.stockHealth ?? 0;
	const moraleDelta = option.effects.staffMorale ?? 0;
	const reputationDelta = option.effects.reputation ?? 0;

	return {
		...game,
		cash: game.cash + cashDelta,
		scorecard: {
			profit: clampScore(game.scorecard.profit + (option.effects.profit ?? 0)),
			customerSatisfaction: clampScore(
				game.scorecard.customerSatisfaction + (option.effects.customerSatisfaction ?? 0)
			),
			staffMorale: clampScore(game.scorecard.staffMorale + (option.effects.staffMorale ?? 0)),
			marketPosition: clampScore(
				game.scorecard.marketPosition + (option.effects.marketPosition ?? 0)
			)
		},
		stores: game.stores.map((store) => ({
			...store,
			stockHealth: clampScore(store.stockHealth + stockDelta),
			staffMorale: clampScore(store.staffMorale + moraleDelta),
			reputation: clampScore(store.reputation + reputationDelta)
		})),
		decisions: game.decisions.filter((item) => item.id !== decisionId)
	};
}

function createCashBlockedDecision(day: number, setupCost: number): DecisionItem {
	return {
		id: `cash-blocked-${day}`,
		title: 'Expansion funding gap',
		context: `Opening another store requires $${setupCost.toLocaleString()} in available cash.`,
		expiresOnDay: day + 2,
		options: [
			{
				id: 'wait',
				label: 'Wait',
				description: 'Build cash before expanding.',
				effects: { staffMorale: 1 }
			}
		]
	};
}
```

- [ ] **Step 4: Run test and note the missing report helper**

Run: `bun run test:unit -- --run src/lib/game/state.spec.ts`

Expected: FAIL because `src/lib/game/reports.ts` is imported but not implemented.

- [ ] **Step 5: Commit after Task 3 completes**

Do not commit this task until Task 3 adds `reports.ts` and all state tests pass.

## Task 3: Reports and Scorecard Helpers

**Files:**

- Create: `src/lib/game/reports.ts`
- Test: `src/lib/game/reports.spec.ts`

- [ ] **Step 1: Write report tests**

Create `src/lib/game/reports.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { clampScore, summarizeReports } from './reports';
import type { DailyReport } from './types';

function report(day: number, netIncome: number): DailyReport {
	return {
		day,
		revenue: 1_000 + day,
		costOfGoods: 400,
		grossMargin: 600,
		operatingCosts: 300,
		netIncome,
		cashAfter: 10_000 + netIncome,
		scorecard: {
			profit: 50,
			customerSatisfaction: 60,
			staffMorale: 70,
			marketPosition: 20
		},
		storeReports: [],
		warnings: []
	};
}

describe('reports', () => {
	test('clamps score values into the scorecard range', () => {
		expect.assertions(3);
		expect(clampScore(-4)).toBe(0);
		expect(clampScore(48.7)).toBe(49);
		expect(clampScore(140)).toBe(100);
	});

	test('summarizes available history for 7-day and 30-day windows', () => {
		expect.assertions(6);
		const reports = Array.from({ length: 10 }, (_, index) => report(index + 1, 100 + index));
		const summary = summarizeReports(reports);

		expect(summary.latest?.day).toBe(10);
		expect(summary.sevenDay.days).toBe(7);
		expect(summary.thirtyDay.days).toBe(10);
		expect(summary.sevenDay.netIncome).toBe(742);
		expect(summary.thirtyDay.netIncome).toBe(1_045);
		expect(summary.sevenDay.averageRevenue).toBe(1007);
	});
});
```

- [ ] **Step 2: Run report and state tests to verify failure**

Run: `bun run test:unit -- --run src/lib/game/reports.spec.ts src/lib/game/state.spec.ts`

Expected: FAIL because `reports.ts` does not exist.

- [ ] **Step 3: Implement reports**

Create `src/lib/game/reports.ts`:

```ts
import type { DailyReport } from './types';

export interface ReportWindowSummary {
	days: number;
	revenue: number;
	netIncome: number;
	averageRevenue: number;
	averageNetIncome: number;
}

export interface ReportSummary {
	latest: DailyReport | undefined;
	sevenDay: ReportWindowSummary;
	thirtyDay: ReportWindowSummary;
}

export function clampScore(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

export function summarizeReports(reports: DailyReport[]): ReportSummary {
	return {
		latest: reports.at(-1),
		sevenDay: summarizeWindow(reports, 7),
		thirtyDay: summarizeWindow(reports, 30)
	};
}

function summarizeWindow(reports: DailyReport[], windowSize: number): ReportWindowSummary {
	const window = reports.slice(-windowSize);
	const revenue = Math.round(window.reduce((sum, report) => sum + report.revenue, 0));
	const netIncome = Math.round(window.reduce((sum, report) => sum + report.netIncome, 0));
	const days = window.length;

	return {
		days,
		revenue,
		netIncome,
		averageRevenue: days === 0 ? 0 : Math.round(revenue / days),
		averageNetIncome: days === 0 ? 0 : Math.round(netIncome / days)
	};
}
```

- [ ] **Step 4: Run report and state tests**

Run: `bun run test:unit -- --run src/lib/game/reports.spec.ts src/lib/game/state.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/reports.ts src/lib/game/reports.spec.ts
git commit -m "feat: add retail sim state and reports"
```

## Task 4: Daily Simulation

**Files:**

- Create: `src/lib/game/simulateDay.ts`
- Test: `src/lib/game/simulateDay.spec.ts`

- [ ] **Step 1: Write daily simulation tests**

Create `src/lib/game/simulateDay.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createNewGame, updatePolicy } from './state';
import { simulateDay } from './simulateDay';

describe('daily simulation', () => {
	test('advances one day deterministically for the same seed and actions', () => {
		expect.assertions(4);
		const first = simulateDay(createNewGame('convenience', 2026));
		const second = simulateDay(createNewGame('convenience', 2026));

		expect(first.day).toBe(2);
		expect(first.cash).toBe(second.cash);
		expect(first.reports[0]?.netIncome).toBe(second.reports[0]?.netIncome);
		expect(first.rngState).toBe(second.rngState);
	});

	test('premium pricing improves gross margin but can reduce customers served', () => {
		expect.assertions(2);
		const base = createNewGame('boutique', 900);
		const standard = simulateDay(updatePolicy(base, { pricing: 'standard' }));
		const premium = simulateDay(updatePolicy(base, { pricing: 'premium' }));

		expect(premium.reports[0]?.grossMargin).toBeGreaterThan(standard.reports[0]?.grossMargin ?? 0);
		expect(premium.reports[0]?.storeReports[0]?.customersServed).toBeLessThanOrEqual(
			standard.reports[0]?.storeReports[0]?.customersServed ?? 0
		);
	});

	test('lean inventory can create stock warnings', () => {
		expect.assertions(1);
		const game = updatePolicy(createNewGame('grocery', 10), { inventory: 'lean' });
		const result = simulateDay({
			...game,
			stores: game.stores.map((store) => ({ ...store, stockHealth: 18 }))
		});

		expect(result.reports[0]?.warnings.some((warning) => warning.includes('stock'))).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/lib/game/simulateDay.spec.ts`

Expected: FAIL because `src/lib/game/simulateDay.ts` does not exist.

- [ ] **Step 3: Implement daily simulation**

Create `src/lib/game/simulateDay.ts`:

```ts
import { getArchetype } from './archetypes';
import { clampScore } from './reports';
import { createRngFromState, randomBetween } from './rng';
import type { DailyReport, DailyStoreReport, GameState, Store } from './types';

const PRICING = {
	discount: { demand: 1.16, margin: 0.86, satisfaction: 2 },
	competitive: { demand: 1.07, margin: 0.95, satisfaction: 1 },
	standard: { demand: 1, margin: 1, satisfaction: 0 },
	premium: { demand: 0.86, margin: 1.18, satisfaction: -2 }
};

const INVENTORY = {
	lean: { carryingCost: 0.86, stockUse: 1.18, satisfaction: -1 },
	balanced: { carryingCost: 1, stockUse: 1, satisfaction: 0 },
	generous: { carryingCost: 1.18, stockUse: 0.84, satisfaction: 1 }
};

const STAFFING = {
	minimal: { wage: 0.78, capacity: 0.82, morale: -2 },
	efficient: { wage: 1, capacity: 1, morale: 0 },
	service: { wage: 1.24, capacity: 1.14, morale: 2 }
};

const MARKETING = {
	none: { demand: 0.94, cost: 0, market: -1 },
	awareness: { demand: 1.04, cost: 90, market: 1 },
	promotions: { demand: 1.14, cost: 180, market: 2 },
	loyalty: { demand: 1.08, cost: 140, market: 1 }
};

const SERVICE = {
	speed: { satisfaction: 0, capacity: 1.08 },
	balanced: { satisfaction: 1, capacity: 1 },
	highTouch: { satisfaction: 3, capacity: 0.92 }
};

export function simulateDay(game: GameState): GameState {
	const rng = createRngFromState(game.rngState);
	const storeReports = game.stores.map((store) => simulateStoreDay(game, store, rng));
	const revenue = roundMoney(sum(storeReports, 'revenue'));
	const costOfGoods = roundMoney(sum(storeReports, 'costOfGoods'));
	const grossMargin = roundMoney(sum(storeReports, 'grossMargin'));
	const operatingCosts = roundMoney(sum(storeReports, 'operatingCosts'));
	const netIncome = roundMoney(sum(storeReports, 'netIncome'));
	const cashAfter = roundMoney(game.cash + netIncome);
	const warnings = storeReports.flatMap((report) => report.warnings);
	const averageSatisfaction =
		storeReports.reduce((total, report) => total + report.reputation, 0) /
		Math.max(1, storeReports.length);
	const averageMorale =
		storeReports.reduce((total, report) => total + report.staffMorale, 0) /
		Math.max(1, storeReports.length);
	const averageMarket =
		storeReports.reduce((total, report) => total + report.marketPosition, 0) /
		Math.max(1, storeReports.length);

	const report: DailyReport = {
		day: game.day,
		revenue,
		costOfGoods,
		grossMargin,
		operatingCosts,
		netIncome,
		cashAfter,
		scorecard: {
			profit: clampScore(game.scorecard.profit + netIncome / 850),
			customerSatisfaction: clampScore(averageSatisfaction),
			staffMorale: clampScore(averageMorale),
			marketPosition: clampScore(averageMarket)
		},
		storeReports,
		warnings
	};

	return {
		...game,
		day: game.day + 1,
		rngState: rng.getState(),
		cash: cashAfter,
		scorecard: report.scorecard,
		stores: game.stores.map((store) => {
			const storeReport = storeReports.find((candidate) => candidate.storeId === store.id);

			return {
				...store,
				daysOpen: store.daysOpen + 1,
				stockHealth: storeReport?.stockHealth ?? store.stockHealth,
				staffMorale: storeReport?.staffMorale ?? store.staffMorale,
				reputation: storeReport?.reputation ?? store.reputation
			};
		}),
		reports: [...game.reports, report]
	};
}

function simulateStoreDay(
	game: GameState,
	store: Store,
	rng: ReturnType<typeof createRngFromState>
): DailyStoreReport {
	const archetype = getArchetype(store.archetypeId);
	const pricing = PRICING[game.policy.pricing];
	const inventory = INVENTORY[game.policy.inventory];
	const staffing = STAFFING[game.policy.staffing];
	const marketing = MARKETING[game.policy.marketing];
	const service = SERVICE[game.policy.service];
	const categoryDemand = archetype.startingCategories.reduce(
		(total, category) => total + category.baseDemand,
		0
	);
	const averageMargin =
		archetype.startingCategories.reduce((total, category) => total + category.margin, 0) /
		archetype.startingCategories.length;
	const variance = randomBetween(rng, 0.92, 1.08);
	const demand =
		(categoryDemand + store.localDemand) *
		pricing.demand *
		marketing.demand *
		(store.reputation / 70) *
		(1 - store.competition / 240) *
		variance;
	const capacity =
		archetype.baseTraffic * store.staffCapacity * staffing.capacity * service.capacity;
	const stockLimitedDemand = demand * Math.min(1, Math.max(0.2, store.stockHealth / 70));
	const customersServed = Math.max(0, Math.round(Math.min(stockLimitedDemand, capacity)));
	const demandMissed = Math.max(0, Math.round(demand - customersServed));
	const averageTicket = archetype.id === 'electronics' ? 84 : archetype.id === 'boutique' ? 46 : 18;
	const revenue = roundMoney(
		customersServed *
			averageTicket *
			(game.policy.pricing === 'discount' ? 0.9 : game.policy.pricing === 'premium' ? 1.14 : 1)
	);
	const effectiveMargin = averageMargin * pricing.margin;
	const costOfGoods = roundMoney(revenue * (1 - effectiveMargin));
	const grossMargin = roundMoney(revenue - costOfGoods);
	const operatingCosts = roundMoney(
		archetype.baseRent +
			archetype.baseWage * staffing.wage +
			marketing.cost +
			35 * inventory.carryingCost
	);
	const netIncome = roundMoney(grossMargin - operatingCosts);
	const stockHealth = clampScore(
		store.stockHealth -
			(customersServed / 18) * inventory.stockUse +
			(game.policy.inventory === 'generous' ? 4 : 1)
	);
	const staffPressure = customersServed / Math.max(1, capacity);
	const staffMorale = clampScore(
		store.staffMorale + staffing.morale - Math.max(0, staffPressure - 0.82) * 7
	);
	const reputation = clampScore(
		store.reputation +
			pricing.satisfaction +
			inventory.satisfaction +
			service.satisfaction -
			demandMissed / 35
	);
	const marketPosition = clampScore(
		game.scorecard.marketPosition +
			marketing.market +
			customersServed / 120 -
			store.competition / 200
	);
	const warnings = [
		...(stockHealth < 25 ? [`${store.name} has low stock health.`] : []),
		...(staffMorale < 35 ? [`${store.name} staff morale is under pressure.`] : []),
		...(netIncome < 0 ? [`${store.name} lost money today.`] : [])
	];

	return {
		storeId: store.id,
		revenue,
		costOfGoods,
		grossMargin,
		operatingCosts,
		netIncome,
		customersServed,
		demandMissed,
		stockHealth,
		staffMorale,
		reputation,
		marketPosition,
		warnings
	};
}

function sum(
	reports: DailyStoreReport[],
	key: keyof Pick<
		DailyStoreReport,
		'revenue' | 'costOfGoods' | 'grossMargin' | 'operatingCosts' | 'netIncome'
	>
): number {
	return reports.reduce((total, report) => total + report[key], 0);
}

function roundMoney(value: number): number {
	return Math.round(value);
}
```

- [ ] **Step 4: Run daily simulation tests**

Run: `bun run test:unit -- --run src/lib/game/simulateDay.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat: simulate retail business days"
```

## Task 5: Decision Queue Generation

**Files:**

- Create: `src/lib/game/events.ts`
- Test: `src/lib/game/events.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Test: `src/lib/game/simulateDay.spec.ts`

- [ ] **Step 1: Write decision tests**

Create `src/lib/game/events.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { generateDecisions } from './events';
import { createNewGame } from './state';

describe('decision generation', () => {
	test('is sparse for healthy early businesses', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 33);
		const decisions = generateDecisions(game);

		expect(decisions.length).toBeLessThanOrEqual(1);
	});

	test('creates a cash pressure decision when cash is negative', () => {
		expect.assertions(2);
		const game = { ...createNewGame('electronics', 33), cash: -500 };
		const decisions = generateDecisions(game);

		expect(decisions[0]?.title).toBe('Cash pressure');
		expect(decisions[0]?.options).toHaveLength(3);
	});

	test('creates an expansion opportunity after the business has traction', () => {
		expect.assertions(1);
		const game = {
			...createNewGame('boutique', 33),
			day: 16,
			cash: 70_000,
			scorecard: {
				profit: 70,
				customerSatisfaction: 74,
				staffMorale: 66,
				marketPosition: 32
			}
		};

		expect(generateDecisions(game).some((decision) => decision.id.startsWith('expansion-'))).toBe(
			true
		);
	});
});
```

- [ ] **Step 2: Run decision tests to verify failure**

Run: `bun run test:unit -- --run src/lib/game/events.spec.ts`

Expected: FAIL because `src/lib/game/events.ts` does not exist.

- [ ] **Step 3: Implement decision generation**

Create `src/lib/game/events.ts`:

```ts
import { createRngFromState } from './rng';
import { MAX_STORES, type DecisionItem, type GameState } from './types';

export function generateDecisions(game: GameState): DecisionItem[] {
	const existingIds = new Set(game.decisions.map((decision) => decision.id));
	const decisions: DecisionItem[] = [];

	if (game.cash < 0 && !existingIds.has(`cash-pressure-${game.day}`)) {
		decisions.push({
			id: `cash-pressure-${game.day}`,
			title: 'Cash pressure',
			context: 'The company is below zero cash. Choose how to stabilize operations.',
			expiresOnDay: game.day + 2,
			options: [
				{
					id: 'short-loan',
					label: 'Take short-term financing',
					description: 'Gain cash now, but pressure profit later.',
					effects: { cash: 8_000, profit: -4 }
				},
				{
					id: 'cut-costs',
					label: 'Cut operating costs',
					description: 'Improve cash flow while hurting staff morale and satisfaction.',
					effects: { cash: 2_500, staffMorale: -6, customerSatisfaction: -3 }
				},
				{
					id: 'hold-course',
					label: 'Hold course',
					description: 'Avoid disruption and accept the risk.',
					effects: { marketPosition: -2 }
				}
			]
		});
	}

	if (
		game.day >= 14 &&
		game.cash >= 55_000 &&
		game.stores.length < MAX_STORES &&
		game.scorecard.profit >= 62 &&
		!existingIds.has(`expansion-${game.stores.length + 1}`)
	) {
		decisions.push({
			id: `expansion-${game.stores.length + 1}`,
			title: 'Expansion opportunity',
			context:
				'A promising local site is available. Opening it would grow market position and fixed costs.',
			expiresOnDay: game.day + 5,
			options: [
				{
					id: 'prepare',
					label: 'Prepare the site',
					description: 'Reserve the opportunity and boost expansion momentum.',
					effects: { cash: -2_000, marketPosition: 4 }
				},
				{
					id: 'pass',
					label: 'Pass for now',
					description: 'Keep focus on current stores.',
					effects: { staffMorale: 1 }
				}
			]
		});
	}

	const rng = createRngFromState(game.rngState + game.day);
	if (decisions.length === 0 && rng.next() > 0.82) {
		decisions.push({
			id: `supplier-${game.day}`,
			title: 'Supplier terms',
			context:
				'A supplier offers better prices if you accept a less flexible replenishment schedule.',
			expiresOnDay: game.day + 3,
			options: [
				{
					id: 'accept',
					label: 'Accept the terms',
					description: 'Improve cash and stock health, with a small service risk.',
					effects: { cash: 1_200, stockHealth: 5, customerSatisfaction: -1 }
				},
				{
					id: 'decline',
					label: 'Decline',
					description: 'Keep the current operating rhythm.',
					effects: { staffMorale: 1 }
				}
			]
		});
	}

	return decisions.slice(0, 1);
}

export function pruneExpiredDecisions(game: GameState): DecisionItem[] {
	return game.decisions.filter((decision) => decision.expiresOnDay >= game.day);
}
```

- [ ] **Step 4: Integrate decisions after each simulated day**

Modify `src/lib/game/simulateDay.ts`:

```ts
import { generateDecisions, pruneExpiredDecisions } from './events';
```

In the returned `GameState`, replace the `decisions` line with:

```ts
decisions: [...pruneExpiredDecisions(game), ...generateDecisions({ ...game, day: game.day + 1, cash: cashAfter, scorecard: report.scorecard })],
```

- [ ] **Step 5: Run unit tests**

Run: `bun run test:unit -- --run src/lib/game/events.spec.ts src/lib/game/simulateDay.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/events.ts src/lib/game/events.spec.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat: add retail decision queue"
```

## Task 6: Control Tower UI

**Files:**

- Create: `src/lib/components/game/Scorecard.svelte`
- Create: `src/lib/components/game/StoreOverview.svelte`
- Create: `src/lib/components/game/PolicyPanel.svelte`
- Create: `src/lib/components/game/DecisionQueue.svelte`
- Create: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/layout.css`

- [ ] **Step 1: Replace the starter page with a minimal shell**

Modify `src/routes/+page.svelte` to import the game modules and render a start screen before a game exists. Use Svelte 5 `$state` for `game`, `$derived` for report summaries, keyed `{#each}` blocks for archetypes, and callback props for all child updates.

The route state must use these functions:

```ts
import { ARCHETYPES } from '$lib/game/archetypes';
import { summarizeReports } from '$lib/game/reports';
import { createNewGame, openStore, resolveDecision, updatePolicy } from '$lib/game/state';
import { simulateDay } from '$lib/game/simulateDay';
```

- [ ] **Step 2: Create the scorecard component**

Create `src/lib/components/game/Scorecard.svelte`:

```svelte
<script lang="ts">
	import type { Scorecard } from '$lib/game/types';

	let { scorecard }: { scorecard: Scorecard } = $props();

	const labels = [
		['profit', 'Profit'],
		['customerSatisfaction', 'Customers'],
		['staffMorale', 'Staff'],
		['marketPosition', 'Market']
	] as const;
</script>

<section class="panel">
	<h2>Balanced Scorecard</h2>
	<div class="score-grid">
		{#each labels as [key, label] (key)}
			<div class="score">
				<span>{label}</span>
				<strong>{scorecard[key]}</strong>
				<meter min="0" max="100" value={scorecard[key]}>{scorecard[key]}</meter>
			</div>
		{/each}
	</div>
</section>

<style>
	.panel {
		border: 1px solid color-mix(in srgb, white 12%, transparent);
		border-radius: 8px;
		background: #121620;
		padding: 1rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-size: 1rem;
	}

	.score-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.score {
		display: grid;
		gap: 0.35rem;
	}

	.score span {
		color: #aab4c4;
		font-size: 0.8rem;
	}

	.score strong {
		font-size: 1.4rem;
	}

	meter {
		width: 100%;
	}

	@media (max-width: 760px) {
		.score-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
```

- [ ] **Step 3: Create the store overview component**

Create `src/lib/components/game/StoreOverview.svelte`:

```svelte
<script lang="ts">
	import type { DailyStoreReport, Store } from '$lib/game/types';

	let {
		stores,
		latestReports
	}: {
		stores: Store[];
		latestReports: DailyStoreReport[];
	} = $props();
</script>

<section class="panel">
	<h2>Stores</h2>
	<div class="stores">
		{#each stores as store (store.id)}
			{@const report = latestReports.find((item) => item.storeId === store.id)}
			<article class="store">
				<div>
					<h3>{store.name}</h3>
					<p>{store.location}</p>
				</div>
				<dl>
					<div>
						<dt>Revenue</dt>
						<dd>${(report?.revenue ?? 0).toLocaleString()}</dd>
					</div>
					<div>
						<dt>Margin</dt>
						<dd>${(report?.grossMargin ?? 0).toLocaleString()}</dd>
					</div>
					<div>
						<dt>Stock</dt>
						<dd>{store.stockHealth}</dd>
					</div>
					<div>
						<dt>Staff</dt>
						<dd>{store.staffMorale}</dd>
					</div>
				</dl>
				{#if report?.warnings.length}
					<ul>
						{#each report.warnings as warning (warning)}
							<li>{warning}</li>
						{/each}
					</ul>
				{/if}
			</article>
		{/each}
	</div>
</section>

<style>
	.panel {
		border: 1px solid color-mix(in srgb, white 12%, transparent);
		border-radius: 8px;
		background: #121620;
		padding: 1rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	.stores {
		display: grid;
		gap: 0.75rem;
	}

	.store {
		display: grid;
		gap: 0.75rem;
		border: 1px solid color-mix(in srgb, white 10%, transparent);
		border-radius: 8px;
		padding: 0.85rem;
		background: #171d29;
	}

	p,
	dt {
		color: #aab4c4;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 0;
	}

	dd {
		margin: 0.2rem 0 0;
		font-weight: 700;
	}

	ul {
		margin: 0;
		padding-left: 1.1rem;
		color: #f4c27a;
	}
</style>
```

- [ ] **Step 4: Create the policy panel component**

Create `src/lib/components/game/PolicyPanel.svelte`:

```svelte
<script lang="ts">
	import type { CompanyPolicy } from '$lib/game/types';

	let {
		policy,
		onChange
	}: {
		policy: CompanyPolicy;
		onChange: (patch: Partial<CompanyPolicy>) => void;
	} = $props();

	const fields = [
		{
			key: 'pricing',
			label: 'Pricing',
			options: ['discount', 'competitive', 'standard', 'premium']
		},
		{ key: 'inventory', label: 'Inventory', options: ['lean', 'balanced', 'generous'] },
		{ key: 'staffing', label: 'Staffing', options: ['minimal', 'efficient', 'service'] },
		{
			key: 'marketing',
			label: 'Marketing',
			options: ['none', 'awareness', 'promotions', 'loyalty']
		},
		{ key: 'service', label: 'Service', options: ['speed', 'balanced', 'highTouch'] }
	] as const;

	function update(key: keyof CompanyPolicy, value: string) {
		onChange({ [key]: value } as Partial<CompanyPolicy>);
	}
</script>

<section class="panel">
	<h2>Policies</h2>
	<div class="policy-grid">
		{#each fields as field (field.key)}
			<label>
				<span>{field.label}</span>
				<select
					aria-label={field.label}
					value={policy[field.key]}
					onchange={(event) => update(field.key, event.currentTarget.value)}
				>
					{#each field.options as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>
		{/each}
	</div>
</section>

<style>
	.panel {
		border: 1px solid color-mix(in srgb, white 12%, transparent);
		border-radius: 8px;
		background: #121620;
		padding: 1rem;
	}

	h2 {
		margin: 0 0 0.75rem;
	}

	.policy-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.75rem;
	}

	label {
		display: grid;
		gap: 0.35rem;
	}

	span {
		color: #aab4c4;
		font-size: 0.8rem;
	}

	select {
		width: 100%;
		border: 1px solid #30394a;
		border-radius: 6px;
		background: #0c1118;
		color: #edf2f7;
		padding: 0.55rem;
	}

	@media (max-width: 980px) {
		.policy-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
```

- [ ] **Step 5: Create the decision queue component**

Create `src/lib/components/game/DecisionQueue.svelte`:

```svelte
<script lang="ts">
	import type { DecisionItem } from '$lib/game/types';

	let {
		decisions,
		onResolve
	}: {
		decisions: DecisionItem[];
		onResolve: (decisionId: string, optionId: string) => void;
	} = $props();
</script>

<section class="panel">
	<h2>Decision Queue</h2>
	{#if decisions.length === 0}
		<p class="empty">No urgent decisions today.</p>
	{:else}
		<div class="queue">
			{#each decisions as decision (decision.id)}
				<article>
					<h3>{decision.title}</h3>
					<p>{decision.context}</p>
					<div class="options">
						{#each decision.options as option (option.id)}
							<button type="button" onclick={() => onResolve(decision.id, option.id)}>
								<strong>{option.label}</strong>
								<span>{option.description}</span>
							</button>
						{/each}
					</div>
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.panel {
		border: 1px solid color-mix(in srgb, white 12%, transparent);
		border-radius: 8px;
		background: #121620;
		padding: 1rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	.empty,
	p {
		color: #aab4c4;
	}

	.queue,
	article,
	.options {
		display: grid;
		gap: 0.75rem;
	}

	button {
		display: grid;
		gap: 0.25rem;
		border: 1px solid #365173;
		border-radius: 8px;
		background: #18283a;
		color: #edf2f7;
		padding: 0.75rem;
		text-align: left;
	}

	button:hover {
		background: #213752;
	}

	span {
		color: #b8c3d4;
	}
</style>
```

- [ ] **Step 6: Create the reports component**

Create `src/lib/components/game/ReportsPanel.svelte`:

```svelte
<script lang="ts">
	import type { ReportSummary } from '$lib/game/reports';

	let { summary }: { summary: ReportSummary } = $props();
</script>

<section class="panel">
	<h2>Reports</h2>
	{#if summary.latest}
		<div class="metrics">
			<div>
				<span>Latest Daily Result</span><strong>${summary.latest.netIncome.toLocaleString()}</strong
				>
			</div>
			<div><span>Revenue</span><strong>${summary.latest.revenue.toLocaleString()}</strong></div>
			<div>
				<span>Cash After</span><strong>${summary.latest.cashAfter.toLocaleString()}</strong>
			</div>
			<div>
				<span>7-Day Net</span><strong>${summary.sevenDay.netIncome.toLocaleString()}</strong>
			</div>
			<div>
				<span>30-Day Net</span><strong>${summary.thirtyDay.netIncome.toLocaleString()}</strong>
			</div>
		</div>
		{#if summary.latest.warnings.length}
			<ul>
				{#each summary.latest.warnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<p>No reports yet. Advance the first day to generate results.</p>
	{/if}
</section>

<style>
	.panel {
		border: 1px solid color-mix(in srgb, white 12%, transparent);
		border-radius: 8px;
		background: #121620;
		padding: 1rem;
	}

	h2,
	p {
		margin: 0;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.metrics div {
		display: grid;
		gap: 0.25rem;
	}

	span,
	p {
		color: #aab4c4;
	}

	strong {
		font-size: 1.1rem;
	}

	ul {
		margin: 0.8rem 0 0;
		color: #f4c27a;
	}

	@media (max-width: 980px) {
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
```

- [ ] **Step 7: Replace the starter page with the Control Tower route**

Modify `src/routes/+page.svelte`:

```svelte
<script lang="ts">
	import DecisionQueue from '$lib/components/game/DecisionQueue.svelte';
	import PolicyPanel from '$lib/components/game/PolicyPanel.svelte';
	import ReportsPanel from '$lib/components/game/ReportsPanel.svelte';
	import Scorecard from '$lib/components/game/Scorecard.svelte';
	import StoreOverview from '$lib/components/game/StoreOverview.svelte';
	import { ARCHETYPES } from '$lib/game/archetypes';
	import { summarizeReports } from '$lib/game/reports';
	import { createNewGame, openStore, resolveDecision, updatePolicy } from '$lib/game/state';
	import { simulateDay } from '$lib/game/simulateDay';
	import type { ArchetypeId, CompanyPolicy, GameState } from '$lib/game/types';

	let game: GameState | null = $state(null);
	let summary = $derived(game ? summarizeReports(game.reports) : summarizeReports([]));

	function start(archetypeId: ArchetypeId) {
		game = createNewGame(archetypeId, 20260502);
	}

	function advanceDay() {
		if (game) game = simulateDay(game);
	}

	function changePolicy(patch: Partial<CompanyPolicy>) {
		if (game) game = updatePolicy(game, patch);
	}

	function chooseDecision(decisionId: string, optionId: string) {
		if (game) game = resolveDecision(game, decisionId, optionId);
	}

	function addStore() {
		if (!game) return;
		const next = game.stores.length + 1;
		game = openStore(game, {
			name: `Store #${next}`,
			location: next === 2 ? 'West Mall' : 'North Campus'
		});
	}
</script>

<svelte:head>
	<title>Retail Control Tower</title>
</svelte:head>

{#if game === null}
	<main class="start">
		<section>
			<p class="eyebrow">Retail Business Simulation</p>
			<h1>Choose your first store</h1>
			<div class="archetypes">
				{#each ARCHETYPES as archetype (archetype.id)}
					<button type="button" onclick={() => start(archetype.id)}>
						<strong>{archetype.name}</strong>
						<span>{archetype.description}</span>
					</button>
				{/each}
			</div>
		</section>
	</main>
{:else}
	<main class="app">
		<header>
			<div>
				<p class="eyebrow">Control Tower</p>
				<h1>Day {game.day}</h1>
			</div>
			<div class="top-actions">
				<strong>${game.cash.toLocaleString()} cash</strong>
				<button type="button" onclick={addStore}>Open store</button>
				<button type="button" class="primary" onclick={advanceDay}>Advance day</button>
			</div>
		</header>

		<Scorecard scorecard={game.scorecard} />
		<PolicyPanel policy={game.policy} onChange={changePolicy} />
		<div class="grid">
			<StoreOverview stores={game.stores} latestReports={summary.latest?.storeReports ?? []} />
			<DecisionQueue decisions={game.decisions} onResolve={chooseDecision} />
		</div>
		<ReportsPanel {summary} />
	</main>
{/if}

<style>
	.start,
	.app {
		width: min(1180px, calc(100vw - 2rem));
		margin: 0 auto;
		padding: 2rem 0;
	}

	.start {
		min-height: 100vh;
		display: grid;
		align-items: center;
	}

	.eyebrow {
		margin: 0 0 0.35rem;
		color: #7fb4ff;
		font-weight: 700;
		text-transform: uppercase;
		font-size: 0.78rem;
	}

	h1 {
		margin: 0;
		font-size: clamp(2rem, 6vw, 4rem);
	}

	.archetypes {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.8rem;
		margin-top: 1.5rem;
	}

	.archetypes button,
	.top-actions button {
		border: 1px solid #344256;
		border-radius: 8px;
		background: #151c28;
		color: #edf2f7;
		padding: 1rem;
	}

	.archetypes button {
		display: grid;
		gap: 0.5rem;
		text-align: left;
	}

	.archetypes span {
		color: #aab4c4;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.top-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.primary {
		background: #2f6fed !important;
		border-color: #2f6fed !important;
	}

	.app {
		display: grid;
		gap: 1rem;
	}

	.grid {
		display: grid;
		grid-template-columns: 1.35fr 0.85fr;
		gap: 1rem;
	}

	@media (max-width: 980px) {
		.archetypes,
		.grid {
			grid-template-columns: 1fr;
		}

		header,
		.top-actions {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
```

- [ ] **Step 8: Style the app globally**

Modify `src/routes/layout.css` to keep Tailwind imported and add global base styles:

```css
@import 'tailwindcss';

:root {
	color: #edf2f7;
	background: #0c1118;
	font-family:
		Inter,
		ui-sans-serif,
		system-ui,
		-apple-system,
		BlinkMacSystemFont,
		'Segoe UI',
		sans-serif;
}

body {
	margin: 0;
	min-width: 320px;
	min-height: 100vh;
	background: #0c1118;
}

button,
select {
	font: inherit;
}

button {
	cursor: pointer;
}
```

- [ ] **Step 9: Run Svelte autofixer on each component**

Use the Svelte MCP `svelte-autofixer` on:

- `Scorecard.svelte`
- `StoreOverview.svelte`
- `PolicyPanel.svelte`
- `DecisionQueue.svelte`
- `ReportsPanel.svelte`
- `+page.svelte`

Expected: no remaining issues or suggestions before proceeding.

- [ ] **Step 10: Run project checks**

Run: `bun run check`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/components/game src/routes/+page.svelte src/routes/layout.css
git commit -m "feat: build retail control tower UI"
```

## Task 7: E2E Flow and Final Verification

**Files:**

- Create: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Write Playwright e2e test**

Create `src/routes/retail-sim.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('player can start a business and advance a day', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: /electronics & games/i }).click();
	await expect(page.getByRole('heading', { name: /control tower/i })).toBeVisible();
	await expect(page.getByText(/day 1/i)).toBeVisible();

	await page.getByLabel(/pricing/i).selectOption('premium');
	await page.getByRole('button', { name: /advance day/i }).click();

	await expect(page.getByText(/day 2/i)).toBeVisible();
	await expect(page.getByText(/latest daily result/i)).toBeVisible();
});
```

- [ ] **Step 2: Run unit and Svelte checks**

Run: `bun run test:unit -- --run`

Expected: PASS.

Run: `bun run check`

Expected: PASS.

- [ ] **Step 3: Run e2e test**

Run: `bun run test:e2e`

Expected: PASS. If Playwright browser installation is missing and the command fails with a browser-install message, run `bunx playwright install chromium`, then rerun `bun run test:e2e`.

- [ ] **Step 4: Run production build**

Run: `bun run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test: cover retail sim start flow"
```

## Self-Review

Spec coverage:

- Store archetype choice is covered by Tasks 1, 2, and 6.
- Daily economy is covered by Task 4.
- Policies are covered by Tasks 2, 4, and 6.
- Sparse decision queue is covered by Task 5 and UI rendering in Task 6.
- Growth to 3 stores is covered by Task 2 and can be surfaced in Task 6.
- Balanced scorecard is covered by Tasks 1, 3, 4, and 6.
- Control Tower interface is covered by Task 6.
- Pure TypeScript simulation, deterministic RNG, and no Phaser core dependency are covered by Tasks 1 through 5.
- Unit and e2e verification are covered by Tasks 1 through 7.

Type consistency:

- All domain entities use the names in the shared contract.
- `createNewGame`, `updatePolicy`, `openStore`, `resolveDecision`, `simulateDay`, `generateDecisions`, and `summarizeReports` are introduced before UI code uses them.
- Component props reference types from `src/lib/game/types.ts` and `src/lib/game/reports.ts`.

Execution notes:

- Implement tasks in order.
- Do not add Phaser in this MVP.
- Keep simulation code free of Svelte imports.
- Keep UI callbacks one-way; child components should not mutate parent-owned state directly.
