# Staff System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named employees, hiring, store assignment, monthly payroll, and staffing effects to the retail simulation.

**Architecture:** Keep staff as pure game state in `GameState.staff` and `GameState.hiringCandidates`; derive per-store staffing from assignment instead of embedding employee lists into stores. Add `src/lib/game/staffing.ts` as the single staff rules/transition module, feed it into `state.ts`, `simulateDay.ts`, persistence validation, and a new Svelte `StaffPanel` wired from the Control Tower.

**Tech Stack:** TypeScript, SvelteKit/Svelte 5 runes, Bun, Vitest server/browser projects, Playwright e2e, existing deterministic RNG utilities.

---

## File Structure

- Modify `src/lib/game/types.ts`: add staff/candidate/requirement/report fields.
- Create `src/lib/game/staffing.ts`: own staffing requirements, candidate/starter generation, roster summary helpers, payroll helpers, and hire/assign/unassign transitions.
- Create `src/lib/game/staffing.spec.ts`: unit coverage for requirements, deterministic candidates, hiring, assignment, unassignment, payroll day calculation, and staffing summaries.
- Modify `src/lib/game/state.ts`: seed founding-store staff and five candidates when a new game is created.
- Modify `src/lib/game/state.spec.ts`: assert new game staff/candidate behavior and direct opening still works.
- Modify `src/lib/game/simulateDay.ts`: replace main wage cost with monthly roster payroll, apply staffing coverage to demand served and store health, add report fields.
- Modify `src/lib/game/simulateDay.spec.ts`: assert payroll days, non-payroll days, and understaffing warnings/effects.
- Modify `src/lib/game/reports.spec.ts`: update report fixtures for required new fields.
- Modify `src/lib/persistence/saveTypes.ts`: bump `SAVE_SCHEMA_VERSION` to invalidate old local saves.
- Modify `src/lib/persistence/saveCodec.ts`: validate `staff`, `hiringCandidates`, `payrollCost`, `staffingCoverage`, and `staffingShortage`.
- Modify `src/lib/persistence/saveRepository.spec.ts`: update fixtures and add reset-on-`SaveDataError` tests.
- Modify `src/lib/persistence/saveStoreRepository.ts`: treat driver read `SaveDataError` as an empty save store and overwrite later.
- Modify `src/lib/persistence/tauriSaveRepository.spec.ts`: update game fixture fields.
- Create `src/lib/components/game/StaffPanel.svelte`: render hiring candidates, unassigned staff, and per-store staffing controls.
- Create `src/lib/components/game/StaffPanel.svelte.spec.ts`: browser component tests for rendering and callbacks.
- Modify `src/lib/components/game/StoreOverview.svelte`: show staffing coverage/shortage alongside morale.
- Modify `src/lib/components/game/ReportsPanel.svelte`: show latest payroll cost.
- Modify `src/routes/+page.svelte`: import staff transitions, add handlers, render `StaffPanel`.
- Modify `src/routes/retail-sim.e2e.ts`: add a Control Tower staffing flow.

Before editing, check:

```bash
git status --short
```

Expected: clean, or only unrelated user changes. Do not revert unrelated changes.

---

### Task 1: Staff Types, Rules, Generation, And Roster Transitions

**Files:**

- Modify: `src/lib/game/types.ts`
- Create: `src/lib/game/staffing.ts`
- Create: `src/lib/game/staffing.spec.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`

- [ ] **Step 1: Write failing staff rules and transition tests**

Create `src/lib/game/staffing.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createRng } from './rng';
import {
	assignStaffToStore,
	calculateMonthlyPayroll,
	generateHiringCandidates,
	generateStarterStaffForStore,
	getAssignedStaff,
	getStaffingRequirement,
	hireCandidate,
	isPayrollDay,
	summarizeStoreStaffing,
	unassignStaff
} from './staffing';
import { createNewGame } from './state';
import type { GameState, StaffMember } from './types';

function firstStoreGame(): GameState {
	return createNewGame('boutique', 20260507);
}

describe('staffing rules', () => {
	test('defines staffing requirements by archetype', () => {
		expect.assertions(4);

		expect(getStaffingRequirement('convenience')).toEqual({ manager: 1, general: 1 });
		expect(getStaffingRequirement('boutique')).toEqual({ manager: 1, general: 2 });
		expect(getStaffingRequirement('electronics')).toEqual({ manager: 1, general: 2 });
		expect(getStaffingRequirement('grocery')).toEqual({ manager: 1, general: 3 });
	});

	test('generates starter staff assigned to the founding store requirement', () => {
		expect.assertions(6);
		const rng = createRng(1234);
		const staff = generateStarterStaffForStore({
			storeId: 'store-1',
			archetypeId: 'grocery',
			day: 1,
			rng
		});

		expect(staff).toHaveLength(4);
		expect(staff.filter((member) => member.role === 'manager')).toHaveLength(1);
		expect(staff.filter((member) => member.role === 'general')).toHaveLength(3);
		expect(staff.every((member) => member.assignedStoreId === 'store-1')).toBe(true);
		expect(staff.every((member) => member.hiredOnDay === 1)).toBe(true);
		expect(staff.every((member) => member.monthlySalary > 0)).toBe(true);
	});

	test('generates deterministic hiring candidates for the same rng state', () => {
		expect.assertions(3);
		const first = generateHiringCandidates({ count: 5, day: 1, rng: createRng(55) });
		const second = generateHiringCandidates({ count: 5, day: 1, rng: createRng(55) });

		expect(first).toEqual(second);
		expect(first).toHaveLength(5);
		expect(new Set(first.map((candidate) => candidate.name)).size).toBeGreaterThan(1);
	});

	test('summarizes coverage and shortages for assigned staff', () => {
		expect.assertions(4);
		const game = firstStoreGame();
		const store = game.stores[0]!;
		const understaffed = {
			...game,
			staff: game.staff.filter((member) => member.role === 'manager')
		};
		const summary = summarizeStoreStaffing(understaffed, store);

		expect(summary.requirement).toEqual({ manager: 1, general: 2 });
		expect(summary.assigned).toEqual({ manager: 1, general: 0 });
		expect(summary.shortage).toEqual({ manager: 0, general: 2 });
		expect(summary.coverage).toBeLessThan(100);
	});

	test('hires a candidate into the unassigned staff pool immutably', () => {
		expect.assertions(6);
		const game = firstStoreGame();
		const candidate = game.hiringCandidates[0]!;
		const result = hireCandidate(game, candidate.id);
		const hired = result.staff.find((member) => member.name === candidate.name);

		expect(result).not.toBe(game);
		expect(result.hiringCandidates.some((item) => item.id === candidate.id)).toBe(false);
		expect(result.staff).toHaveLength(game.staff.length + 1);
		expect(hired?.role).toBe(candidate.role);
		expect(hired?.assignedStoreId).toBeNull();
		expect(game.hiringCandidates).toHaveLength(5);
	});

	test('returns the same game when hiring an unknown candidate', () => {
		expect.assertions(1);
		const game = firstStoreGame();

		expect(hireCandidate(game, 'missing-candidate')).toBe(game);
	});

	test('assigns, transfers, and unassigns staff immutably', () => {
		expect.assertions(7);
		const game = firstStoreGame();
		const employee = { ...game.staff[0]!, assignedStoreId: null };
		const otherStore = { ...game.stores[0]!, id: 'store-2', tileId: 'harbor-city-2-2' };
		const withPoolEmployee = { ...game, stores: [...game.stores, otherStore], staff: [employee] };

		const assigned = assignStaffToStore(withPoolEmployee, employee.id, game.stores[0]!.id);
		const transferred = assignStaffToStore(assigned, employee.id, otherStore.id);
		const unassigned = unassignStaff(transferred, employee.id);

		expect(assigned.staff[0]?.assignedStoreId).toBe(game.stores[0]!.id);
		expect(transferred.staff[0]?.assignedStoreId).toBe(otherStore.id);
		expect(unassigned.staff[0]?.assignedStoreId).toBeNull();
		expect(withPoolEmployee.staff[0]?.assignedStoreId).toBeNull();
		expect(assignStaffToStore(withPoolEmployee, employee.id, 'missing-store')).toBe(
			withPoolEmployee
		);
		expect(assignStaffToStore(withPoolEmployee, 'missing-staff', otherStore.id)).toBe(
			withPoolEmployee
		);
		expect(unassignStaff(withPoolEmployee, 'missing-staff')).toBe(withPoolEmployee);
	});

	test('calculates monthly payroll and payroll days', () => {
		expect.assertions(4);
		const staff: StaffMember[] = [
			{
				id: 'staff-1',
				name: 'Alex Staff',
				role: 'manager',
				monthlySalary: 4200,
				skill: 70,
				morale: 65,
				assignedStoreId: 'store-1',
				hiredOnDay: 1
			},
			{
				id: 'staff-2',
				name: 'Blair Staff',
				role: 'general',
				monthlySalary: 2600,
				skill: 58,
				morale: 72,
				assignedStoreId: null,
				hiredOnDay: 1
			}
		];

		expect(calculateMonthlyPayroll(staff)).toBe(6800);
		expect(isPayrollDay(29)).toBe(false);
		expect(isPayrollDay(30)).toBe(true);
		expect(isPayrollDay(60)).toBe(true);
	});

	test('selects assigned staff for a store', () => {
		expect.assertions(1);
		const game = firstStoreGame();
		const store = game.stores[0]!;

		expect(
			getAssignedStaff(game.staff, store.id).every((member) => member.assignedStoreId === store.id)
		).toBe(true);
	});
});
```

Update the first test in `src/lib/game/state.spec.ts` from `expect.assertions(10)` to `expect.assertions(14)` and add these assertions after the existing store assertions:

```ts
expect(game.staff).toHaveLength(3);
expect(game.staff.filter((member) => member.role === 'manager')).toHaveLength(1);
expect(game.staff.every((member) => member.assignedStoreId === game.stores[0]?.id)).toBe(true);
expect(game.hiringCandidates).toHaveLength(5);
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/staffing.spec.ts src/lib/game/state.spec.ts
```

Expected: FAIL because `src/lib/game/staffing.ts` and the new staff fields do not exist.

- [ ] **Step 3: Add staff domain types**

In `src/lib/game/types.ts`, add these types near the existing policy/scorecard types:

```ts
export type StaffRole = 'manager' | 'general';

export interface StaffingRequirement {
	manager: number;
	general: number;
}

export interface StaffingSummary {
	requirement: StaffingRequirement;
	assigned: StaffingRequirement;
	shortage: StaffingRequirement;
	coverage: number;
	averageSkill: number;
	averageMorale: number;
}

export interface HiringCandidate {
	id: string;
	name: string;
	role: StaffRole;
	monthlySalary: number;
	skill: number;
	morale: number;
}

export interface StaffMember extends HiringCandidate {
	assignedStoreId: string | null;
	hiredOnDay: number;
}
```

Add new fields to `GameState`:

```ts
	staff: StaffMember[];
	hiringCandidates: HiringCandidate[];
```

- [ ] **Step 4: Implement `src/lib/game/staffing.ts`**

Create `src/lib/game/staffing.ts`:

```ts
import { clampScore } from './reports';
import { randomInt, type Rng } from './rng';
import type {
	ArchetypeId,
	GameState,
	HiringCandidate,
	StaffMember,
	StaffingRequirement,
	StaffingSummary,
	Store
} from './types';

const STAFFING_REQUIREMENTS: Readonly<Record<ArchetypeId, StaffingRequirement>> = Object.freeze({
	convenience: Object.freeze({ manager: 1, general: 1 }),
	boutique: Object.freeze({ manager: 1, general: 2 }),
	electronics: Object.freeze({ manager: 1, general: 2 }),
	grocery: Object.freeze({ manager: 1, general: 3 })
});

const FIRST_NAMES = [
	'Alex',
	'Blair',
	'Casey',
	'Drew',
	'Emery',
	'Finley',
	'Harper',
	'Jordan',
	'Morgan',
	'Quinn',
	'Reese',
	'Sawyer'
] as const;

const LAST_NAMES = [
	'Chen',
	'Patel',
	'Rivera',
	'Nguyen',
	'Walker',
	'Kim',
	'Lopez',
	'Brooks',
	'Young',
	'Foster',
	'Hayes',
	'Lin'
] as const;

export function getStaffingRequirement(archetypeId: ArchetypeId): StaffingRequirement {
	return { ...STAFFING_REQUIREMENTS[archetypeId] };
}

export function generateStarterStaffForStore(input: {
	storeId: string;
	archetypeId: ArchetypeId;
	day: number;
	rng: Rng;
}): StaffMember[] {
	const requirement = getStaffingRequirement(input.archetypeId);
	const staff: StaffMember[] = [];

	for (let index = 0; index < requirement.manager; index += 1) {
		staff.push(createStaffMember(input, 'manager', index));
	}

	for (let index = 0; index < requirement.general; index += 1) {
		staff.push(createStaffMember(input, 'general', index));
	}

	return staff;
}

export function generateHiringCandidates(input: {
	count: number;
	day: number;
	rng: Rng;
}): HiringCandidate[] {
	return Array.from({ length: input.count }, (_, index) => {
		const role = index % 3 === 0 ? 'manager' : 'general';
		const skill = clampScore(randomInt(input.rng, 45, 88));
		const morale = clampScore(randomInt(input.rng, 48, 86));

		return {
			id: `candidate-${input.day}-${index + 1}`,
			name: generateName(input.rng),
			role,
			monthlySalary: salaryFor(role, skill, morale),
			skill,
			morale
		};
	});
}

export function hireCandidate(game: GameState, candidateId: string): GameState {
	const candidate = game.hiringCandidates.find((item) => item.id === candidateId);

	if (!candidate) {
		return game;
	}

	const staffMember: StaffMember = {
		...candidate,
		id: `staff-${candidate.id}`,
		assignedStoreId: null,
		hiredOnDay: game.day
	};

	return {
		...game,
		staff: [...game.staff, staffMember],
		hiringCandidates: game.hiringCandidates.filter((item) => item.id !== candidateId)
	};
}

export function assignStaffToStore(game: GameState, staffId: string, storeId: string): GameState {
	if (!game.stores.some((store) => store.id === storeId)) {
		return game;
	}

	if (!game.staff.some((member) => member.id === staffId)) {
		return game;
	}

	return {
		...game,
		staff: game.staff.map((member) =>
			member.id === staffId ? { ...member, assignedStoreId: storeId } : member
		)
	};
}

export function unassignStaff(game: GameState, staffId: string): GameState {
	if (!game.staff.some((member) => member.id === staffId)) {
		return game;
	}

	return {
		...game,
		staff: game.staff.map((member) =>
			member.id === staffId ? { ...member, assignedStoreId: null } : member
		)
	};
}

export function getAssignedStaff(staff: StaffMember[], storeId: string): StaffMember[] {
	return staff.filter((member) => member.assignedStoreId === storeId);
}

export function summarizeStoreStaffing(
	game: { staff: StaffMember[] },
	store: Store
): StaffingSummary {
	const requirement = getStaffingRequirement(store.archetypeId);
	const assignedStaff = getAssignedStaff(game.staff, store.id);
	const assigned = {
		manager: assignedStaff.filter((member) => member.role === 'manager').length,
		general: assignedStaff.filter((member) => member.role === 'general').length
	};
	const shortage = {
		manager: Math.max(0, requirement.manager - assigned.manager),
		general: Math.max(0, requirement.general - assigned.general)
	};
	const requiredTotal = requirement.manager + requirement.general;
	const coveredTotal =
		Math.min(requirement.manager, assigned.manager) +
		Math.min(requirement.general, assigned.general);

	return {
		requirement,
		assigned,
		shortage,
		coverage: requiredTotal === 0 ? 100 : clampScore((coveredTotal / requiredTotal) * 100),
		averageSkill: averageOrDefault(
			assignedStaff.map((member) => member.skill),
			50
		),
		averageMorale: averageOrDefault(
			assignedStaff.map((member) => member.morale),
			store.staffMorale
		)
	};
}

export function calculateMonthlyPayroll(staff: StaffMember[]): number {
	return staff.reduce((total, member) => total + member.monthlySalary, 0);
}

export function isPayrollDay(day: number): boolean {
	return day > 0 && day % 30 === 0;
}

function createStaffMember(
	input: { storeId: string; day: number; rng: Rng },
	role: StaffMember['role'],
	index: number
): StaffMember {
	const skill = clampScore(
		randomInt(input.rng, role === 'manager' ? 58 : 48, role === 'manager' ? 86 : 78)
	);
	const morale = clampScore(randomInt(input.rng, 56, 84));

	return {
		id: `staff-${input.storeId}-${role}-${index + 1}`,
		name: generateName(input.rng),
		role,
		monthlySalary: salaryFor(role, skill, morale),
		skill,
		morale,
		assignedStoreId: input.storeId,
		hiredOnDay: input.day
	};
}

function salaryFor(role: StaffMember['role'], skill: number, morale: number): number {
	const base = role === 'manager' ? 3600 : 2300;
	const rolePremium = role === 'manager' ? skill * 24 : skill * 13;
	const moralePremium = morale * 5;
	return Math.round((base + rolePremium + moralePremium) / 50) * 50;
}

function generateName(rng: Rng): string {
	const first = FIRST_NAMES[randomInt(rng, 0, FIRST_NAMES.length - 1)]!;
	const last = LAST_NAMES[randomInt(rng, 0, LAST_NAMES.length - 1)]!;
	return `${first} ${last}`;
}

function averageOrDefault(values: number[], fallback: number): number {
	if (values.length === 0) {
		return fallback;
	}

	return values.reduce((total, value) => total + value, 0) / values.length;
}
```

- [ ] **Step 5: Seed staff and candidates in `createNewGame`**

In `src/lib/game/state.ts`, import staff generation:

```ts
import { generateHiringCandidates, generateStarterStaffForStore } from './staffing';
```

After `placedOpeningStore` is created and before the returned object, add:

```ts
const staff = generateStarterStaffForStore({
	storeId: placedOpeningStore.id,
	archetypeId,
	day: 1,
	rng
});
const hiringCandidates = generateHiringCandidates({
	count: 5,
	day: 1,
	rng
});
```

Add the new fields to the returned `GameState`:

```ts
		staff,
		hiringCandidates,
```

In `src/routes/+page.svelte`, update `starterMapState` with empty arrays:

```ts
		staff: [],
		hiringCandidates: [],
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/staffing.spec.ts src/lib/game/state.spec.ts
```

Expected: PASS for the focused staff/state tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/staffing.ts src/lib/game/staffing.spec.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/routes/+page.svelte
git commit -m "feat: add staff roster domain"
```

---

### Task 2: Payroll And Staffing Effects In Daily Simulation

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/reports.spec.ts`

- [ ] **Step 1: Write failing simulation tests**

Append these tests to `src/lib/game/simulateDay.spec.ts`:

```ts
test('charges monthly payroll on payroll days only', () => {
	expect.assertions(5);
	const base = {
		...createNewGame('convenience', 700),
		day: 30,
		cash: 50_000,
		reports: []
	};
	const payroll = base.staff.reduce((total, member) => total + member.monthlySalary, 0);
	const payrollDay = simulateDay(base);
	const nonPayrollDay = simulateDay({ ...base, day: 29 });

	expect(payroll).toBeGreaterThan(0);
	expect(payrollDay.reports[0]?.payrollCost).toBe(payroll);
	expect(nonPayrollDay.reports[0]?.payrollCost).toBe(0);
	expect(payrollDay.cash).toBeLessThan(nonPayrollDay.cash);
	expect(payrollDay.reports[0]?.operatingCosts).toBeGreaterThan(
		nonPayrollDay.reports[0]?.operatingCosts ?? 0
	);
});

test('understaffing reduces served demand and reports role shortages', () => {
	expect.assertions(5);
	const game = updatePolicy(createNewGame('grocery', 701), {
		pricing: 'discount',
		inventory: 'generous',
		marketing: 'promotions'
	});
	const stockedStores = game.stores.map((store) => ({
		...store,
		localDemand: 140,
		stockHealth: 100,
		staffCapacity: 100,
		staffMorale: 70
	}));
	const staffed = simulateDay({ ...game, stores: stockedStores });
	const understaffed = simulateDay({
		...game,
		stores: stockedStores,
		staff: game.staff.filter((member) => member.role === 'manager')
	});
	const staffedReport = staffed.reports[0]?.storeReports[0];
	const understaffedReport = understaffed.reports[0]?.storeReports[0];

	expect(understaffedReport?.customersServed).toBeLessThan(staffedReport?.customersServed ?? 0);
	expect(understaffedReport?.staffingCoverage).toBeLessThan(100);
	expect(understaffedReport?.staffingShortage).toEqual({ manager: 0, general: 3 });
	expect(understaffedReport?.warnings.some((warning) => warning.includes('short 3 general'))).toBe(
		true
	);
	expect(understaffedReport?.staffMorale).toBeLessThan(staffedReport?.staffMorale ?? 100);
});
```

Update any report fixtures in `src/lib/game/reports.spec.ts` so every `DailyReport` includes:

```ts
		payrollCost: 0,
```

and every `DailyStoreReport` includes:

```ts
			staffingCoverage: 100,
			staffingShortage: { manager: 0, general: 0 },
```

- [ ] **Step 2: Run failing simulation tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts
```

Expected: FAIL because report fields and simulation behavior are not implemented.

- [ ] **Step 3: Add report fields to types**

In `src/lib/game/types.ts`, add to `DailyStoreReport`:

```ts
staffingCoverage: number;
staffingShortage: StaffingRequirement;
```

Add to `DailyReport`:

```ts
payrollCost: number;
```

- [ ] **Step 4: Wire payroll and staffing summaries into `simulateDay.ts`**

In `src/lib/game/simulateDay.ts`, import staff helpers:

```ts
import { calculateMonthlyPayroll, isPayrollDay, summarizeStoreStaffing } from './staffing';
```

In `simulateDay`, compute payroll before cash:

```ts
const payrollCost = isPayrollDay(game.day) ? calculateMonthlyPayroll(game.staff) : 0;
```

Change net income and operating cost aggregation:

```ts
const operatingCosts = sum(storeReports, 'operatingCosts') + payrollCost;
const netIncome = grossMargin - operatingCosts;
```

Add `payrollCost` to the report:

```ts
		payrollCost,
```

In `simulateStore`, after reading policy constants, add:

```ts
const staffingSummary = summarizeStoreStaffing(game, store);
const staffingCoverageRatio = Math.max(0.22, staffingSummary.coverage / 100);
const skillMultiplier = 0.82 + staffingSummary.averageSkill / 250;
const moraleMultiplier = 0.82 + staffingSummary.averageMorale / 260;
```

Replace the existing `staffLimit` formula with:

```ts
const staffLimit =
	store.staffCapacity *
	staffing.capacity *
	service.throughput *
	(0.72 + store.staffMorale / 220) *
	staffingCoverageRatio *
	skillMultiplier *
	moraleMultiplier;
```

Remove `archetype.baseWage * staffing.wage +` from `operatingCosts`, keeping rent, marketing, and supplier costs:

```ts
const operatingCosts = Math.round(
	archetype.baseRent * (0.92 + store.competition / 450) +
		marketing.cost +
		supplierCost(archetype, inventory.cost, customersServed)
);
```

Change staff morale calculation to include staffing summary effects:

```ts
const managerPenalty = staffingSummary.shortage.manager > 0 ? 5 : 0;
const generalPenalty = staffingSummary.shortage.general * 2;
const assignedMoraleDelta = (staffingSummary.averageMorale - 60) / 18;
const staffMorale = clampScore(
	store.staffMorale +
		staffing.morale +
		service.morale +
		store.managerQuality / 40 -
		3 -
		managerPenalty -
		generalPenalty +
		assignedMoraleDelta -
		(customersServed >= staffLimit - 1 ? 2 : 0)
);
```

Change reputation calculation to include manager shortage:

```ts
const reputation = clampScore(
	store.reputation +
		pricing.satisfaction +
		inventory.satisfaction +
		staffing.satisfaction +
		service.satisfaction +
		marketing.reputation -
		managerPenalty +
		(demandMissed > demand * 0.18 ? -3 : 1)
);
```

Update `buildStoreWarnings` signature and call to include `staffingSummary`:

```ts
const warnings = buildStoreWarnings(
	updatedStore,
	customersServed,
	demandMissed,
	stockLimit,
	staffLimit,
	staffingSummary
);
```

Add fields to each store report:

```ts
			staffingCoverage: Math.round(staffingSummary.coverage),
			staffingShortage: staffingSummary.shortage,
```

Update `buildStoreWarnings`:

```ts
function buildStoreWarnings(
	store: Store,
	customersServed: number,
	demandMissed: number,
	stockLimit: number,
	staffLimit: number,
	staffingSummary: StaffingSummary
): string[] {
	const warnings: string[] = [];

	if (store.stockHealth < 25 || (demandMissed > 0 && stockLimit <= customersServed + 1)) {
		warnings.push(`${store.name} has stock pressure`);
	}

	if (staffingSummary.shortage.manager > 0) {
		warnings.push(`${store.name} is short ${staffingSummary.shortage.manager} manager`);
	}

	if (staffingSummary.shortage.general > 0) {
		warnings.push(`${store.name} is short ${staffingSummary.shortage.general} general staff`);
	}

	if (store.staffMorale < 30 || staffLimit <= customersServed + 1) {
		warnings.push(`${store.name} is near staff capacity`);
	}

	if (store.reputation < 35) {
		warnings.push(`${store.name} reputation is slipping`);
	}

	return warnings;
}
```

Add `StaffingSummary` to the type import from `./types`.

- [ ] **Step 5: Run focused simulation tests**

Run:

```bash
bun run test:unit -- --run src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts
```

Expected: PASS for simulation and report tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts
git commit -m "feat: apply staff payroll and coverage"
```

---

### Task 3: Save Schema, Validation, And Old-Save Reset

**Files:**

- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveStoreRepository.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/persistence/tauriSaveRepository.spec.ts`

- [ ] **Step 1: Write failing persistence tests**

In `src/lib/persistence/saveRepository.spec.ts`, update `createGame()` so the returned game includes:

```ts
		staff: [
			{
				id: 'staff-store-1-manager-1',
				name: 'Alex Chen',
				role: 'manager',
				monthlySalary: 5300,
				skill: 72,
				morale: 68,
				assignedStoreId: 'store-1',
				hiredOnDay: 1
			},
			{
				id: 'staff-store-1-general-1',
				name: 'Blair Kim',
				role: 'general',
				monthlySalary: 3300,
				skill: 61,
				morale: 70,
				assignedStoreId: 'store-1',
				hiredOnDay: 1
			}
		],
		hiringCandidates: [
			{
				id: 'candidate-1-1',
				name: 'Casey Rivera',
				role: 'general',
				monthlySalary: 3100,
				skill: 58,
				morale: 64
			}
		],
```

In any persisted report fixture, add:

```ts
					payrollCost: 0,
```

and for each store report:

```ts
							staffingCoverage: 100,
							staffingShortage: { manager: 0, general: 0 },
```

Add these tests:

```ts
test('rejects saved games with invalid staff shapes', () => {
	expect.assertions(2);
	const game = createGame();
	const record = createManualSaveRecord({
		game: {
			...game,
			staff: [{ ...game.staff[0]!, role: 'owner' as GameState['staff'][number]['role'] }]
		}
	});
	const snapshot = {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: null,
		manualSlots: [record]
	};

	expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
	expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
		'Saved game staff[0] role must be one of: manager, general'
	);
});

test('rejects saved games with invalid hiring candidate shapes', () => {
	expect.assertions(2);
	const game = createGame();
	const record = createManualSaveRecord({
		game: {
			...game,
			hiringCandidates: [{ ...game.hiringCandidates[0]!, monthlySalary: Number.NaN }]
		}
	});
	const snapshot = {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: null,
		manualSlots: [record]
	};

	expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
	expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
		'Saved game hiringCandidates[0] monthlySalary must be a finite number'
	);
});

test('resets an unreadable save store after a save data error', async () => {
	expect.assertions(3);
	const brokenSnapshot = {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: null,
		manualSlots: [
			createManualSaveRecord({
				game: { ...createGame(), staff: [] }
			})
		]
	};
	const driver = new MemorySaveStoreDriver(brokenSnapshot as SaveStoreSnapshot);
	const repository = new SaveRepositoryFromDriver(
		driver,
		() => new Date('2026-05-05T12:00:00.000Z')
	);

	const summary = await repository.getSummary();
	const metadata = await repository.saveAuto(createGame());
	const saved = await driver.read();

	expect(summary.manualSlots).toHaveLength(0);
	expect(metadata.kind).toBe('auto');
	expect(saved.autoSave?.game.staff).toHaveLength(2);
});
```

Update `src/lib/persistence/tauriSaveRepository.spec.ts` fixtures with the same `staff` and `hiringCandidates` fields.

- [ ] **Step 2: Run failing persistence tests**

Run:

```bash
bun run test:unit -- --run src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts
```

Expected: FAIL because save validation and reset behavior do not support staff yet.

- [ ] **Step 3: Bump save schema version**

In `src/lib/persistence/saveTypes.ts`, change:

```ts
export const SAVE_SCHEMA_VERSION = 2;
```

- [ ] **Step 4: Validate staff and new report fields**

In `src/lib/persistence/saveCodec.ts`, add:

```ts
const STAFF_ROLES = ['manager', 'general'] as const;
```

In `validateSavedGame`, add after `stores` validation:

```ts
const staff = requireArray(game.staff, 'Saved game staff');
const hiringCandidates = requireArray(game.hiringCandidates, 'Saved game hiringCandidates');
staff.forEach((member, index) => validateSavedStaffMember(member, `Saved game staff[${index}]`));
hiringCandidates.forEach((candidate, index) =>
	validateSavedHiringCandidate(candidate, `Saved game hiringCandidates[${index}]`)
);
```

Add helper functions:

```ts
function validateSavedHiringCandidate(value: unknown, label: string): void {
	const candidate = requireRecord(value, label);

	requireString(candidate.id, `${label} id`);
	requireString(candidate.name, `${label} name`);
	requireOneOf(candidate.role, `${label} role`, STAFF_ROLES);
	requireNumber(candidate.monthlySalary, `${label} monthlySalary`);
	requireNumber(candidate.skill, `${label} skill`);
	requireNumber(candidate.morale, `${label} morale`);
}

function validateSavedStaffMember(value: unknown, label: string): void {
	const member = requireRecord(value, label);

	validateSavedHiringCandidate(member, label);

	if (member.assignedStoreId !== null) {
		requireString(member.assignedStoreId, `${label} assignedStoreId`);
	}

	requireNumber(member.hiredOnDay, `${label} hiredOnDay`);
}

function validateSavedStaffingRequirement(value: unknown, label: string): void {
	const requirement = requireRecord(value, label);

	requireNumber(requirement.manager, `${label} manager`);
	requireNumber(requirement.general, `${label} general`);
}
```

In `validateSavedReport`, add:

```ts
requireNumber(report.payrollCost, `${label} payrollCost`);
```

In `validateSavedStoreReport`, add:

```ts
requireNumber(report.staffingCoverage, `${label} staffingCoverage`);
validateSavedStaffingRequirement(report.staffingShortage, `${label} staffingShortage`);
```

- [ ] **Step 5: Reset unreadable save stores in the repository**

In `src/lib/persistence/saveStoreRepository.ts`, update imports:

```ts
	createEmptySaveStore,
```

from `./saveCodec`.

Replace `readSnapshot` with:

```ts
	private async readSnapshot(): Promise<SaveStoreSnapshot> {
		try {
			return cloneSaveStoreSnapshot(await this.driver.read());
		} catch (error) {
			if (error instanceof SaveDataError) {
				return createEmptySaveStore();
			}

			throw error;
		}
	}
```

- [ ] **Step 6: Run focused persistence tests**

Run:

```bash
bun run test:unit -- --run src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts
```

Expected: PASS for persistence tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/persistence/saveTypes.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveStoreRepository.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts
git commit -m "feat: persist staff roster state"
```

---

### Task 4: Staff Panel Component

**Files:**

- Create: `src/lib/components/game/StaffPanel.svelte`
- Create: `src/lib/components/game/StaffPanel.svelte.spec.ts`

- [ ] **Step 1: Write failing browser component tests**

Create `src/lib/components/game/StaffPanel.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StaffPanel from './StaffPanel.svelte';
import type { HiringCandidate, StaffMember, Store } from '$lib/game/types';

const stores: Store[] = [
	{
		id: 'store-1',
		name: 'Founding Store',
		archetypeId: 'boutique',
		location: 'Downtown (1, 1)',
		cityId: 'harbor-city',
		tileId: 'harbor-city-1-1',
		mapX: 1,
		mapY: 1,
		daysOpen: 2,
		reputation: 60,
		stockHealth: 70,
		staffMorale: 65,
		staffCapacity: 66,
		localDemand: 72,
		competition: 40,
		managerQuality: 58
	}
];

const staff: StaffMember[] = [
	{
		id: 'staff-1',
		name: 'Alex Chen',
		role: 'manager',
		monthlySalary: 5300,
		skill: 72,
		morale: 68,
		assignedStoreId: 'store-1',
		hiredOnDay: 1
	},
	{
		id: 'staff-2',
		name: 'Blair Kim',
		role: 'general',
		monthlySalary: 3300,
		skill: 61,
		morale: 70,
		assignedStoreId: null,
		hiredOnDay: 1
	}
];

const candidates: HiringCandidate[] = [
	{
		id: 'candidate-1',
		name: 'Casey Rivera',
		role: 'general',
		monthlySalary: 3100,
		skill: 58,
		morale: 64
	}
];

function renderPanel(
	overrides: Partial<{
		stores: Store[];
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
	}> = {}
) {
	const props = {
		stores,
		staff,
		hiringCandidates: candidates,
		onHire: vi.fn(),
		onAssign: vi.fn(),
		onUnassign: vi.fn(),
		...overrides
	};

	render(StaffPanel, props);

	return props;
}

describe('StaffPanel', () => {
	it('renders candidates, roster, and store coverage', async () => {
		expect.assertions(5);

		renderPanel();

		await expect.element(page.getByRole('heading', { name: 'Staff' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Candidates' })).toBeVisible();
		await expect.element(page.getByText('Casey Rivera')).toBeVisible();
		await expect.element(page.getByText('Blair Kim')).toBeVisible();
		await expect.element(page.getByText('Founding Store: 1/1 managers, 0/2 general')).toBeVisible();
	});

	it('calls hire and assignment callbacks', async () => {
		expect.assertions(3);
		const onHire = vi.fn();
		const onAssign = vi.fn();

		renderPanel({ onHire, onAssign });

		await page.getByRole('button', { name: /hire casey rivera/i }).click();
		await page.getByLabel(/assign blair kim/i).selectOption('store-1');

		expect(onHire).toHaveBeenCalledWith('candidate-1');
		expect(onAssign).toHaveBeenCalledWith('staff-2', 'store-1');
		expect(onAssign).toHaveBeenCalledOnce();
	});

	it('calls unassign for assigned staff', async () => {
		expect.assertions(1);
		const onUnassign = vi.fn();

		renderPanel({ onUnassign });

		await page.getByRole('button', { name: /unassign alex chen/i }).click();

		expect(onUnassign).toHaveBeenCalledWith('staff-1');
	});
});
```

- [ ] **Step 2: Run failing component test**

Run:

```bash
bun run test:unit -- --run --project client src/lib/components/game/StaffPanel.svelte.spec.ts
```

Expected: FAIL because `StaffPanel.svelte` does not exist.

- [ ] **Step 3: Implement `StaffPanel.svelte`**

Create `src/lib/components/game/StaffPanel.svelte`:

```svelte
<script lang="ts">
	import { summarizeStoreStaffing } from '$lib/game/staffing';
	import type { HiringCandidate, StaffMember, Store } from '$lib/game/types';

	interface Props {
		stores: Store[];
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
	}

	let { stores, staff, hiringCandidates, onHire, onAssign, onUnassign }: Props = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const staffState = $derived({ staff });
	const unassignedStaff = $derived(staff.filter((member) => member.assignedStoreId === null));

	function roleLabel(role: StaffMember['role']): string {
		return role === 'manager' ? 'Manager' : 'General staff';
	}

	function describePay(value: number): string {
		return `${currency.format(value)}/mo`;
	}

	function handleAssignment(member: StaffMember, value: string): void {
		if (value === '') {
			onUnassign(member.id);
			return;
		}

		onAssign(member.id, value);
	}
</script>

<section class="panel" aria-labelledby="staff-heading">
	<div class="panel-header">
		<div>
			<p>Roster</p>
			<h2 id="staff-heading">Staff</h2>
		</div>
		<strong>{staff.length} hired</strong>
	</div>

	<div class="staff-grid">
		<section aria-labelledby="candidates-heading">
			<h3 id="candidates-heading">Candidates</h3>
			{#if hiringCandidates.length > 0}
				<div class="list">
					{#each hiringCandidates as candidate (candidate.id)}
						<article class="person">
							<div>
								<h4>{candidate.name}</h4>
								<p>{roleLabel(candidate.role)} · {describePay(candidate.monthlySalary)}</p>
								<p>Skill {candidate.skill} · Morale {candidate.morale}</p>
							</div>
							<button type="button" onclick={() => onHire(candidate.id)}>
								Hire {candidate.name}
							</button>
						</article>
					{/each}
				</div>
			{:else}
				<p class="quiet">No candidates available.</p>
			{/if}
		</section>

		<section aria-labelledby="unassigned-heading">
			<h3 id="unassigned-heading">Unassigned</h3>
			{#if unassignedStaff.length > 0}
				<div class="list">
					{#each unassignedStaff as member (member.id)}
						<article class="person">
							<div>
								<h4>{member.name}</h4>
								<p>{roleLabel(member.role)} · {describePay(member.monthlySalary)}</p>
								<p>Skill {member.skill} · Morale {member.morale}</p>
							</div>
							<label>
								<span>Assign {member.name}</span>
								<select
									aria-label={`Assign ${member.name}`}
									value=""
									onchange={(event) => handleAssignment(member, event.currentTarget.value)}
								>
									<option value="">Unassigned</option>
									{#each stores as store (store.id)}
										<option value={store.id}>{store.name}</option>
									{/each}
								</select>
							</label>
						</article>
					{/each}
				</div>
			{:else}
				<p class="quiet">No unassigned staff.</p>
			{/if}
		</section>
	</div>

	<section aria-labelledby="store-staffing-heading">
		<h3 id="store-staffing-heading">Store Staffing</h3>
		<div class="stores">
			{#each stores as store (store.id)}
				{@const summary = summarizeStoreStaffing(staffState, store)}
				{@const assignedStaff = staff.filter((member) => member.assignedStoreId === store.id)}
				<article class="store-staff">
					<header>
						<div>
							<h4>{store.name}</h4>
							<p>
								{store.name}: {summary.assigned.manager}/{summary.requirement.manager} managers,
								{summary.assigned.general}/{summary.requirement.general} general
							</p>
						</div>
						<strong>{Math.round(summary.coverage)}%</strong>
					</header>

					{#if assignedStaff.length > 0}
						<div class="assigned-list">
							{#each assignedStaff as member (member.id)}
								<div class="assigned-person">
									<div>
										<strong>{member.name}</strong>
										<span>{roleLabel(member.role)} · Skill {member.skill}</span>
									</div>
									<label>
										<span>Assign {member.name}</span>
										<select
											aria-label={`Assign ${member.name}`}
											value={store.id}
											onchange={(event) => handleAssignment(member, event.currentTarget.value)}
										>
											<option value="">Unassigned</option>
											{#each stores as optionStore (optionStore.id)}
												<option value={optionStore.id}>{optionStore.name}</option>
											{/each}
										</select>
									</label>
									<button type="button" onclick={() => onUnassign(member.id)}>
										Unassign {member.name}
									</button>
								</div>
							{/each}
						</div>
					{:else}
						<p class="quiet">No assigned staff.</p>
					{/if}
				</article>
			{/each}
		</div>
	</section>
</section>

<style>
	.panel {
		display: grid;
		gap: 1rem;
		border: 1px solid #253244;
		border-radius: 8px;
		background: #111823;
		padding: 1rem;
	}

	.panel-header,
	header,
	.person,
	.assigned-person {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h2,
	h3,
	h4,
	p {
		margin: 0;
	}

	h2 {
		font-size: 0.95rem;
	}

	h3 {
		margin-bottom: 0.65rem;
		font-size: 0.88rem;
	}

	h4 {
		font-size: 0.9rem;
	}

	.panel-header p,
	p,
	span,
	label span {
		color: #a7b4c8;
		font-size: 0.78rem;
	}

	.staff-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.list,
	.stores,
	.assigned-list {
		display: grid;
		gap: 0.65rem;
	}

	.person,
	.store-staff,
	.assigned-person {
		border: 1px solid #26374d;
		border-radius: 8px;
		background: #151f2d;
		padding: 0.75rem;
	}

	.assigned-person {
		align-items: center;
	}

	label {
		display: grid;
		gap: 0.25rem;
	}

	select,
	button {
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #1a2636;
		color: #edf2f7;
		font: inherit;
	}

	select {
		min-width: 10rem;
		padding: 0.35rem 0.5rem;
	}

	button {
		padding: 0.45rem 0.65rem;
	}

	button:hover,
	button:focus-visible,
	select:hover,
	select:focus-visible {
		border-color: #5f8fd0;
		background: #21324a;
	}

	.quiet {
		color: #a7b4c8;
	}

	@media (max-width: 760px) {
		.staff-grid,
		.panel-header,
		header,
		.person,
		.assigned-person {
			grid-template-columns: 1fr;
			display: grid;
		}

		select,
		button {
			width: 100%;
		}
	}
</style>
```

- [ ] **Step 4: Run Svelte autofixer**

Run `svelte-autofixer` against the full `StaffPanel.svelte` source with:

- filename: `StaffPanel.svelte`
- desired_svelte_version: `5`

Expected: no issues. Apply any autofixer recommendations before continuing.

- [ ] **Step 5: Run focused component test**

Run:

```bash
bun run test:unit -- --run --project client src/lib/components/game/StaffPanel.svelte.spec.ts
```

Expected: PASS for `StaffPanel`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/game/StaffPanel.svelte src/lib/components/game/StaffPanel.svelte.spec.ts
git commit -m "feat: add staff management panel"
```

---

### Task 5: Route Wiring, Store Overview, Reports, And E2E

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/game/StoreOverview.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Write failing e2e test**

Append this test to `src/routes/retail-sim.e2e.ts`:

```ts
test('player can hire and assign named staff from the control tower', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 1);
	await chooseStoreType(page, /open boutique goods here/i);
	await openControlTower(page);

	const controlTower = page.getByRole('dialog', { name: /control tower/i });
	await expect(controlTower.getByRole('heading', { name: 'Staff' })).toBeVisible();
	const candidate = controlTower
		.getByRole('heading', { level: 4 })
		.filter({ hasText: /./ })
		.first();
	const candidateName = (await candidate.textContent()) ?? '';

	if (!candidateName) {
		throw new Error('Expected a visible hiring candidate name');
	}

	await controlTower
		.getByRole('button', { name: new RegExp(`hire ${candidateName}`, 'i') })
		.click();
	await expect(controlTower.getByText(candidateName).first()).toBeVisible();
	await controlTower.getByLabel(new RegExp(`assign ${candidateName}`, 'i')).selectOption('store-1');

	await expect(
		controlTower.getByText(/founding store: 1\/1 managers, 2\/2 general/i)
	).toBeVisible();
});
```

- [ ] **Step 2: Run failing e2e test**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "hire and assign named staff"
```

Expected: FAIL because the Staff panel is not wired into the Control Tower.

- [ ] **Step 3: Wire staff transitions into `+page.svelte`**

In `src/routes/+page.svelte`, import the component and transitions:

```ts
import StaffPanel from '$lib/components/game/StaffPanel.svelte';
import { assignStaffToStore, hireCandidate, unassignStaff } from '$lib/game/staffing';
```

Add handlers near existing `chooseDecision`:

```ts
function hireStaff(candidateId: string) {
	if (game) {
		setGameAndAutosave(hireCandidate(game, candidateId));
	}
}

function assignStaff(staffId: string, storeId: string) {
	if (game) {
		setGameAndAutosave(assignStaffToStore(game, staffId, storeId));
	}
}

function unassignStoreStaff(staffId: string) {
	if (game) {
		setGameAndAutosave(unassignStaff(game, staffId));
	}
}
```

Render `StaffPanel` inside the Control Tower after `PolicyPanel`:

```svelte
<StaffPanel
	stores={game.stores}
	staff={game.staff}
	hiringCandidates={game.hiringCandidates}
	onHire={hireStaff}
	onAssign={assignStaff}
	onUnassign={unassignStoreStaff}
/>
```

- [ ] **Step 4: Show staffing coverage in store overview**

In `src/lib/components/game/StoreOverview.svelte`, import `summarizeStoreStaffing` and accept the current staff list:

```ts
import { summarizeStoreStaffing } from '$lib/game/staffing';
import type { DailyStoreReport, StaffMember, Store } from '$lib/game/types';

let {
	stores,
	staff,
	latestReports
}: {
	stores: Store[];
	staff: StaffMember[];
	latestReports: DailyStoreReport[];
} = $props();

const staffState = $derived({ staff });
```

Inside the store loop, add:

```svelte
{@const staffing = summarizeStoreStaffing(staffState, store)}
```

Replace the Staff `<dd>` with:

```svelte
<dd>{report?.staffingCoverage ?? Math.round(staffing.coverage)}%</dd>
```

Add a new `<div>` in the `<dl>`:

```svelte
<div>
	<dt>Coverage</dt>
	<dd>
		{staffing.assigned.manager}/{staffing.requirement.manager} mgr ·
		{staffing.assigned.general}/{staffing.requirement.general} gen
	</dd>
</div>
```

Because the definition list now has five metrics, change CSS:

```css
grid-template-columns: repeat(5, minmax(0, 1fr));
```

Update the component usage in `+page.svelte`:

```svelte
<StoreOverview
	stores={game.stores}
	staff={game.staff}
	latestReports={summary.latest?.storeReports ?? []}
/>
```

- [ ] **Step 5: Show payroll in reports**

In `src/lib/components/game/ReportsPanel.svelte`, add a payroll metric after Cash after:

```svelte
<div>
	<span>Payroll</span>
	<strong>{currency.format(summary.latest.payrollCost)}</strong>
</div>
```

Update `.metrics` to six columns:

```css
grid-template-columns: repeat(6, minmax(0, 1fr));
```

- [ ] **Step 6: Run Svelte autofixer**

Run `svelte-autofixer` on these full component sources:

- `StaffPanel.svelte` if changed during wiring fixes.
- `StoreOverview.svelte`
- `ReportsPanel.svelte`
- `+page.svelte`

Use desired Svelte version `5`. Expected: no issues after applying fixes.

- [ ] **Step 7: Run focused UI and e2e tests**

Run:

```bash
bun run test:unit -- --run --project client src/lib/components/game/StaffPanel.svelte.spec.ts
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "hire and assign named staff"
```

Expected: both commands PASS.

- [ ] **Step 8: Commit**

```bash
git add src/routes/+page.svelte src/lib/components/game/StoreOverview.svelte src/lib/components/game/ReportsPanel.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat: wire staff panel into control tower"
```

---

### Task 6: Full Verification And Polish

**Files:**

- Review all touched files from Tasks 1-5.

- [ ] **Step 1: Run formatting and diagnostics**

Run:

```bash
bun run check
bun run lint
```

Expected: both commands PASS. If `lint` reports formatting issues, run `bun run format`, inspect the diff, and rerun `bun run lint`.

- [ ] **Step 2: Run unit tests**

Run:

```bash
bun run test:unit -- --run
```

Expected: PASS across both Vitest projects.

- [ ] **Step 3: Run e2e tests**

Run:

```bash
bun run test:e2e
```

Expected: PASS. This command builds and previews the app before Playwright runs.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intentional files changed since the last task commit, or clean if every task committed.

- [ ] **Step 5: Commit verification fixes**

If Step 1-3 required fixes after Task 5, commit them:

```bash
git add src docs
git commit -m "fix: polish staff system verification"
```

Skip this commit if the working tree is clean.

## Self-Review Checklist

- Spec coverage:
  - Named staff and persisted candidates: Task 1 and Task 3.
  - Chain-wide hiring and assignment: Task 1, Task 4, Task 5.
  - Archetype requirements: Task 1.
  - Monthly payroll: Task 2.
  - Understaffing penalties and warnings: Task 2.
  - Staff panel UI: Task 4 and Task 5.
  - No old-save migration: Task 3.
  - Tests and e2e: Tasks 1-6.
- Open-ended instruction scan: none should remain.
- Type consistency:
  - `StaffRole`, `StaffMember`, `HiringCandidate`, `StaffingRequirement`, and `StaffingSummary` are introduced before they are used.
  - Report field names are consistently `payrollCost`, `staffingCoverage`, and `staffingShortage`.
  - Transition names are consistently `hireCandidate`, `assignStaffToStore`, and `unassignStaff`.
