# Staff Leveling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let assigned staff earn XP by working and be promoted (for a training fee + permanent salary bump) so their `skill` rises and revenue grows through the existing skill→throughput math.

**Architecture:** A new pure module `staffLeveling.ts` holds all curve/helper functions (mirroring `leveling.ts`). `StaffMember` gains `level` + `xp`. `staffing.ts` gets a `promoteStaff` transition; `simulateDay.ts` awards daily XP to assigned staff; `saveCodec.ts` validates and migrates the new fields; `StaffPanel.svelte` shows level/XP and a Promote button.

**Tech Stack:** TypeScript, SvelteKit (Svelte 5 runes), Vitest (client + server projects), bun.

**Spec:** `docs/superpowers/specs/2026-06-15-staff-leveling-design.md`

---

## File Structure

- **Create** `src/lib/game/staffLeveling.ts` — pure leveling curves/constants/helpers (one responsibility: the staff leveling math).
- **Create** `src/lib/game/staffLeveling.spec.ts` — unit tests for the curves.
- **Modify** `src/lib/game/types.ts` — add `level`/`xp` to `StaffMember`.
- **Modify** `src/lib/game/staffing.ts` — initialize new staff with `level: 1, xp: 0`; add `promoteStaff` transition.
- **Modify** `src/lib/game/staffing.spec.ts` — fixture + tests for init and promotion.
- **Modify** `src/lib/game/simulateDay.ts` — award daily XP to assigned staff; inject updated `staff`.
- **Modify** `src/lib/game/simulateDay.spec.ts` — XP accrual test.
- **Modify** `src/lib/persistence/saveCodec.ts` — validate + migrate `level`/`xp`.
- **Modify** `src/lib/persistence/saveRepository.spec.ts` — round-trip / migration / validation tests + fixtures.
- **Modify** `src/lib/components/game/StaffPanel.svelte` — level/XP display + Promote button + `cash`/`onPromote` props.
- **Modify** `src/routes/+page.svelte` — `promoteStaffMember` handler + wire `cash`/`onPromote`.
- **Modify** `src/lib/components/game/StaffPanel.svelte.spec.ts` — fixture + promote tests.
- **Modify** `src/lib/components/game/TileInspector.svelte.spec.ts` — add `level`/`xp` to staff fixtures (compile fix).

---

## Task 1: Add `level`/`xp` to `StaffMember` and initialize on creation

**Files:**
- Modify: `src/lib/game/types.ts:357-360`
- Modify: `src/lib/game/staffing.ts:107-119` (`hireCandidate`), `src/lib/game/staffing.ts:197-207` (`createStarterStaffForRole`)
- Modify: `src/lib/game/staffing.spec.ts:307-319` (`createStaff` fixture)
- Modify (compile fixes): `src/lib/components/game/StaffPanel.svelte.spec.ts:38-59`, `src/lib/components/game/TileInspector.svelte.spec.ts:199-220`, `src/lib/persistence/saveRepository.spec.ts:1046-1057` and `:1070-1081`
- Test: `src/lib/game/staffing.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/staffing.spec.ts` inside `describe('staffing rules', ...)`:

```ts
	test('starter staff and hired candidates begin at level 1 with zero xp', () => {
		expect.assertions(3);
		const starter = generateStarterStaffForStore({
			storeId: 'store-1',
			archetypeId: 'convenience',
			day: 1,
			rng: createRng(7)
		});
		const game = createGame({
			hiringCandidates: [
				{
					id: 'candidate-4-1',
					name: 'Avery Chen',
					role: 'general',
					monthlySalary: 2_900,
					skill: 64,
					morale: 71
				}
			]
		});
		const hired = hireCandidate(game, 'candidate-4-1');

		expect(starter.every((member) => member.level === 1)).toBe(true);
		expect(starter.every((member) => member.xp === 0)).toBe(true);
		expect(hired.staff[0]).toMatchObject({ level: 1, xp: 0 });
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/staffing.spec.ts --run -t "begin at level 1"`
Expected: FAIL — type error `Property 'level' does not exist on type 'StaffMember'` (or assertion failure on `level`/`xp`).

- [ ] **Step 3: Add the fields to the type**

In `src/lib/game/types.ts`, change the `StaffMember` interface:

```ts
export interface StaffMember extends HiringCandidate {
	assignedStoreId: string | null;
	hiredOnDay: number;
	level: number;
	xp: number;
}
```

- [ ] **Step 4: Initialize the fields in both constructors**

In `src/lib/game/staffing.ts`, `hireCandidate` — update the new staff object:

```ts
		staff: [
			...game.staff,
			{
				...candidate,
				id: `staff-${candidate.id}`,
				assignedStoreId: null,
				hiredOnDay: game.day,
				level: 1,
				xp: 0
			}
		],
```

In `src/lib/game/staffing.ts`, `createStarterStaffForRole` — update the returned object:

```ts
		return {
			...candidate,
			id: `staff-${input.storeId}-${role}-${index + 1}`,
			assignedStoreId: input.storeId,
			hiredOnDay: input.day,
			level: 1,
			xp: 0
		};
```

- [ ] **Step 5: Fix the typed fixtures so the project compiles**

In `src/lib/game/staffing.spec.ts`, `createStaff` defaults — add the fields:

```ts
function createStaff(overrides: Partial<StaffMember> = {}): StaffMember {
	return {
		id: 'staff-1',
		name: 'Avery Chen',
		role: 'general',
		monthlySalary: 2_800,
		skill: 60,
		morale: 65,
		assignedStoreId: 'store-1',
		hiredOnDay: 1,
		level: 1,
		xp: 0,
		...overrides
	};
}
```

In `src/lib/components/game/StaffPanel.svelte.spec.ts`, add `level: 1, xp: 0` to **both** staff objects in the `staff` array (the `staff-alex` object after `hiredOnDay: 0`, and the `staff-blair` object after `hiredOnDay: 2`).

In `src/lib/components/game/TileInspector.svelte.spec.ts`, add `level: 1, xp: 0` to **both** staff objects in the `staff: StaffMember[]` array (after `hiredOnDay: 0` and after `hiredOnDay: 2`).

In `src/lib/persistence/saveRepository.spec.ts`, add `level: 1, xp: 0` to **both** staff objects (the `role: 'supervisor' as ...` object after `hiredOnDay: 1`, and the `assignedStoreId: ''` object after `hiredOnDay: 1`).

- [ ] **Step 6: Run the test + typecheck to verify they pass**

Run: `bun run test:unit -- src/lib/game/staffing.spec.ts --run`
Expected: PASS (all staffing tests).
Run: `bun run check`
Expected: PASS (0 errors).

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/staffing.ts src/lib/game/staffing.spec.ts src/lib/components/game/StaffPanel.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/persistence/saveRepository.spec.ts
git commit -m "feat: add level and xp fields to staff members"
```

---

## Task 2: Create the `staffLeveling.ts` pure module

**Files:**
- Create: `src/lib/game/staffLeveling.ts`
- Test: `src/lib/game/staffLeveling.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/game/staffLeveling.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
	MAX_STAFF_LEVEL,
	STAFF_ACTIVITY_XP_PER_DAY,
	STAFF_BASE_XP_PER_DAY,
	canPromoteStaff,
	getStaffDailyXp,
	getStaffSalaryAfterPromotion,
	getStaffSkillAfterPromotion,
	getStaffTrainingFee,
	getStaffXpForLevel
} from './staffLeveling';

describe('staff leveling curves', () => {
	test('xp threshold scales linearly with level', () => {
		expect.assertions(3);
		expect(getStaffXpForLevel(1)).toBe(100);
		expect(getStaffXpForLevel(2)).toBe(200);
		expect(getStaffXpForLevel(4)).toBe(400);
	});

	test('training fee scales with the pre-promotion level', () => {
		expect.assertions(3);
		expect(getStaffTrainingFee(1)).toBe(2_000);
		expect(getStaffTrainingFee(2)).toBe(4_000);
		expect(getStaffTrainingFee(4)).toBe(8_000);
	});

	test('promotion raises skill by a fixed amount and clamps at 100', () => {
		expect.assertions(2);
		expect(getStaffSkillAfterPromotion(60)).toBe(68);
		expect(getStaffSkillAfterPromotion(96)).toBe(100);
	});

	test('promotion raises salary by 12 percent, rounded', () => {
		expect.assertions(2);
		expect(getStaffSalaryAfterPromotion(2_800)).toBe(3_136);
		expect(getStaffSalaryAfterPromotion(4_600)).toBe(5_152);
	});

	test('daily xp is base plus an activity bonus scaled by clamped utilization', () => {
		expect.assertions(4);
		expect(getStaffDailyXp(0)).toBe(STAFF_BASE_XP_PER_DAY);
		expect(getStaffDailyXp(1)).toBe(STAFF_BASE_XP_PER_DAY + STAFF_ACTIVITY_XP_PER_DAY);
		expect(getStaffDailyXp(2)).toBe(STAFF_BASE_XP_PER_DAY + STAFF_ACTIVITY_XP_PER_DAY);
		expect(getStaffDailyXp(-1)).toBe(STAFF_BASE_XP_PER_DAY);
	});

	test('canPromoteStaff requires enough xp and a level below the max', () => {
		expect.assertions(4);
		expect(canPromoteStaff({ level: 1, xp: 100 })).toBe(true);
		expect(canPromoteStaff({ level: 1, xp: 99 })).toBe(false);
		expect(canPromoteStaff({ level: MAX_STAFF_LEVEL, xp: 10_000 })).toBe(false);
		expect(canPromoteStaff({ level: 2, xp: 200 })).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/staffLeveling.spec.ts --run`
Expected: FAIL — cannot find module `./staffLeveling`.

- [ ] **Step 3: Write the module**

Create `src/lib/game/staffLeveling.ts`:

```ts
import { clampScore } from './reports';
import type { StaffMember } from './types';

export const MAX_STAFF_LEVEL = 5;
export const STAFF_SKILL_GAIN_PER_LEVEL = 8;
export const STAFF_SALARY_BONUS_PER_LEVEL = 0.12;
export const STAFF_TRAINING_BASE_COST = 2_000;
export const STAFF_BASE_XP_PER_DAY = 5;
export const STAFF_ACTIVITY_XP_PER_DAY = 5;
export const STAFF_XP_BASE_PER_LEVEL = 100;

/** XP required to advance from `level` to `level + 1`. */
export function getStaffXpForLevel(level: number): number {
	return STAFF_XP_BASE_PER_LEVEL * level;
}

/** Cash cost to promote a member currently at `level` (pre-promotion level). */
export function getStaffTrainingFee(level: number): number {
	return STAFF_TRAINING_BASE_COST * level;
}

export function getStaffSkillAfterPromotion(skill: number): number {
	return clampScore(skill + STAFF_SKILL_GAIN_PER_LEVEL);
}

export function getStaffSalaryAfterPromotion(salary: number): number {
	return Math.round(salary * (1 + STAFF_SALARY_BONUS_PER_LEVEL));
}

/** Daily XP for an assigned member; `utilization` is customersServed / staffLimit. */
export function getStaffDailyXp(utilization: number): number {
	const clamped = Math.max(0, Math.min(1, utilization));
	return STAFF_BASE_XP_PER_DAY + Math.round(STAFF_ACTIVITY_XP_PER_DAY * clamped);
}

export function canPromoteStaff(member: Pick<StaffMember, 'level' | 'xp'>): boolean {
	return member.level < MAX_STAFF_LEVEL && member.xp >= getStaffXpForLevel(member.level);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/staffLeveling.spec.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/staffLeveling.ts src/lib/game/staffLeveling.spec.ts
git commit -m "feat: add staff leveling curve module"
```

---

## Task 3: Add the `promoteStaff` transition

**Files:**
- Modify: `src/lib/game/staffing.ts` (imports + new exported function)
- Test: `src/lib/game/staffing.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/staffing.spec.ts` inside `describe('staffing rules', ...)`. First extend the import from `./staffing` to include `promoteStaff` (add it to the existing import list):

```ts
	test('promotes an eligible staff member: pays fee, raises level, skill, salary, resets xp', () => {
		expect.assertions(6);
		const game = createGame({
			cash: 10_000,
			staff: [createStaff({ id: 'staff-1', level: 1, xp: 100, skill: 60, monthlySalary: 2_800 })]
		});

		const promoted = promoteStaff(game, 'staff-1');
		const member = promoted.staff[0]!;

		expect(promoted.cash).toBe(8_000); // 10_000 - 2_000 training fee
		expect(member.level).toBe(2);
		expect(member.xp).toBe(0);
		expect(member.skill).toBe(68);
		expect(member.monthlySalary).toBe(3_136);
		expect(promoted).not.toBe(game);
	});

	test('does not promote when xp is short, level is maxed, cash is short, or id is unknown', () => {
		expect.assertions(4);
		const lowXp = createGame({
			cash: 10_000,
			staff: [createStaff({ id: 'staff-1', level: 1, xp: 99 })]
		});
		const maxed = createGame({
			cash: 10_000,
			staff: [createStaff({ id: 'staff-1', level: 5, xp: 10_000 })]
		});
		const broke = createGame({
			cash: 1_000,
			staff: [createStaff({ id: 'staff-1', level: 1, xp: 100 })]
		});
		const unknown = createGame({
			cash: 10_000,
			staff: [createStaff({ id: 'staff-1', level: 1, xp: 100 })]
		});

		expect(promoteStaff(lowXp, 'staff-1')).toBe(lowXp);
		expect(promoteStaff(maxed, 'staff-1')).toBe(maxed);
		expect(promoteStaff(broke, 'staff-1')).toBe(broke);
		expect(promoteStaff(unknown, 'missing')).toBe(unknown);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/staffing.spec.ts --run -t "promote"`
Expected: FAIL — `promoteStaff` is not exported / not a function.

- [ ] **Step 3: Implement `promoteStaff`**

In `src/lib/game/staffing.ts`, add the import near the top (after the existing `./leveling` import):

```ts
import {
	canPromoteStaff,
	getStaffSalaryAfterPromotion,
	getStaffSkillAfterPromotion,
	getStaffTrainingFee,
	getStaffXpForLevel
} from './staffLeveling';
```

Then add the exported transition (place it after `hireCandidate`):

```ts
export function promoteStaff(game: GameState, staffId: string): GameState {
	const member = game.staff.find((item) => item.id === staffId);

	if (!member || !canPromoteStaff(member)) {
		return game;
	}

	const fee = getStaffTrainingFee(member.level);

	if (game.cash < fee) {
		return game;
	}

	return {
		...game,
		cash: game.cash - fee,
		staff: game.staff.map((item) =>
			item.id === staffId
				? {
						...item,
						level: item.level + 1,
						xp: item.xp - getStaffXpForLevel(item.level),
						skill: getStaffSkillAfterPromotion(item.skill),
						monthlySalary: getStaffSalaryAfterPromotion(item.monthlySalary)
					}
				: item
		)
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test:unit -- src/lib/game/staffing.spec.ts --run`
Expected: PASS (all staffing tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/staffing.ts src/lib/game/staffing.spec.ts
git commit -m "feat: add promoteStaff transition"
```

---

## Task 4: Award daily XP to assigned staff in `simulateDay`

**Files:**
- Modify: `src/lib/game/simulateDay.ts` (imports, new helper, inject `staff` in returned state)
- Test: `src/lib/game/simulateDay.spec.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/game/simulateDay.spec.ts`, extend the type import to include `StaffMember`:

```ts
import type { DecisionItem, GameState, StaffMember } from './types';
```

Add this test inside `describe('daily simulation', ...)`:

```ts
	test('assigned staff accrue xp each day while unassigned staff do not', () => {
		expect.assertions(3);
		const base = createNewGame('grocery', 20260615);
		const idle: StaffMember = {
			id: 'staff-idle',
			name: 'Idle Worker',
			role: 'general',
			monthlySalary: 2_800,
			skill: 60,
			morale: 65,
			assignedStoreId: null,
			hiredOnDay: 1,
			level: 1,
			xp: 0
		};
		const result = simulateDay({ ...base, staff: [...base.staff, idle] });
		const assigned = result.staff.filter((member) => member.assignedStoreId !== null);

		expect(assigned.length).toBeGreaterThan(0);
		expect(assigned.every((member) => member.xp > 0)).toBe(true);
		expect(result.staff.find((member) => member.id === 'staff-idle')?.xp).toBe(0);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/simulateDay.spec.ts --run -t "accrue xp"`
Expected: FAIL — assigned staff `xp` is still `0` (no accrual yet).

- [ ] **Step 3: Add the XP-accrual helper and imports**

In `src/lib/game/simulateDay.ts`, add the import (after the existing `./staffing` import block):

```ts
import { getStaffDailyXp, getStaffXpForLevel, MAX_STAFF_LEVEL } from './staffLeveling';
```

Add this helper function (place it next to the other module-private helpers, e.g. after `buildStoreOperationProfile`):

```ts
function accrueStaffXp(
	staff: GameState['staff'],
	storeReports: DailyStoreReport[],
	profileByStoreId: Map<string, StoreOperationProfile>
): GameState['staff'] {
	const utilizationByStoreId = new Map<string, number>();
	for (const report of storeReports) {
		const staffLimit = profileByStoreId.get(report.storeId)?.staffLimit ?? 0;
		const utilization = staffLimit > 0 ? report.customersServed / staffLimit : 0;
		utilizationByStoreId.set(report.storeId, utilization);
	}

	let changed = false;
	const next = staff.map((member) => {
		if (member.assignedStoreId === null || member.level >= MAX_STAFF_LEVEL) {
			return member;
		}
		const utilization = utilizationByStoreId.get(member.assignedStoreId);
		if (utilization === undefined) {
			return member;
		}
		const cap = getStaffXpForLevel(member.level);
		if (member.xp >= cap) {
			return member;
		}
		changed = true;
		return { ...member, xp: Math.min(cap, member.xp + getStaffDailyXp(utilization)) };
	});

	return changed ? next : staff;
}
```

- [ ] **Step 4: Wire the helper into `simulateDay`**

In `src/lib/game/simulateDay.ts`, immediately after this line (currently around line 137):

```ts
	const storeReports = storeResults.map((result) => result.report);
```

add:

```ts
	const staffWithXp = accrueStaffXp(productionGame.staff, storeReports, profileByStoreId);
```

Then, in the final `return refreshWorldProgress({ ... })` object, add a `staff` entry (e.g. right after the `hiringCandidates,` line):

```ts
		hiringCandidates,
		staff: staffWithXp,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test:unit -- src/lib/game/simulateDay.spec.ts --run`
Expected: PASS (including the existing determinism test, which now also covers staff-xp determinism).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat: accrue staff xp during the daily tick"
```

---

## Task 5: Persist and migrate `level`/`xp`

**Files:**
- Modify: `src/lib/persistence/saveCodec.ts` (import, validation, migration)
- Test: `src/lib/persistence/saveRepository.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/persistence/saveRepository.spec.ts`, add these tests inside the top-level `describe` block (alongside the other `validateSaveStoreSnapshot`/`validateSaveRecord` tests):

```ts
	test('migrates legacy staff without level/xp to level 1 and xp 0', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260615);
		const legacyStaff = {
			id: 'staff-legacy',
			name: 'Avery Chen',
			role: 'general' as const,
			monthlySalary: 2_800,
			skill: 60,
			morale: 65,
			assignedStoreId: null,
			hiredOnDay: 1
		};
		const record = createSaveRecord(
			{ ...game, staff: [legacyStaff as GameState['staff'][number]] },
			{
				id: 'manual-legacy-staff',
				name: 'Legacy Staff Save',
				kind: 'manual',
				updatedAt: new Date('2026-06-15T12:00:00.000Z')
			}
		);

		const migrated = validateSaveRecord(record).game.staff[0]!;

		expect(migrated.level).toBe(1);
		expect(migrated.xp).toBe(0);
	});

	test('rejects saved staff with an out-of-range level', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			staff: [
				{
					id: 'staff-1',
					name: 'Avery Chen',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 65,
					assignedStoreId: 'store-1',
					hiredOnDay: 1,
					level: 9,
					xp: 0
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game staff[0] level must be an integer between 1 and 5'
		);
	});

	test('rejects saved staff with negative xp', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			staff: [
				{
					id: 'staff-1',
					name: 'Avery Chen',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 65,
					assignedStoreId: 'store-1',
					hiredOnDay: 1,
					level: 1,
					xp: -5
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('Saved game staff[0] xp must be at least 0');
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- src/lib/persistence/saveRepository.spec.ts --run -t "staff"`
Expected: FAIL — migration test sees `undefined` level/xp; the out-of-range and negative tests do not throw (no validation yet).

- [ ] **Step 3: Add the import**

In `src/lib/persistence/saveCodec.ts`, add (next to the existing `$lib/game/leveling` import):

```ts
import { MAX_STAFF_LEVEL } from '$lib/game/staffLeveling';
```

- [ ] **Step 4: Add validation in `validateSavedStaffMember`**

Replace the body of `validateSavedStaffMember` with:

```ts
function validateSavedStaffMember(value: unknown, label: string): void {
	const member = requireRecord(value, label);

	validateSavedHiringCandidate(member, label);
	if (member.assignedStoreId !== null) {
		requireString(member.assignedStoreId, `${label} assignedStoreId`);
	}
	requireNumber(member.hiredOnDay, `${label} hiredOnDay`);
	const level = requireNumber(member.level, `${label} level`);
	if (!Number.isInteger(level) || level < 1 || level > MAX_STAFF_LEVEL) {
		throw new SaveDataError(`${label} level must be an integer between 1 and ${MAX_STAFF_LEVEL}`);
	}
	const xp = requireNumber(member.xp, `${label} xp`);
	if (xp < 0) {
		throw new SaveDataError(`${label} xp must be at least 0`);
	}
}
```

- [ ] **Step 5: Add the migration helper and apply it**

In `src/lib/persistence/saveCodec.ts`, add this helper next to `normalizeSavedStoreLevel`/`normalizeSavedBuildingLevel`:

```ts
function normalizeSavedStaffLevel(member: unknown): unknown {
	if (typeof member !== 'object' || member === null) {
		return member;
	}

	const record = member as Record<string, unknown>;
	const level = record.level === undefined ? 1 : record.level;
	const xp = record.xp === undefined ? 0 : record.xp;
	return { ...record, level, xp };
}
```

In `normalizeSavedGame`, after the `normalizedBuildings` declaration, add:

```ts
	const normalizedStaff = Array.isArray(game.staff)
		? game.staff.map((member) => normalizeSavedStaffLevel(member))
		: game.staff;
```

and add `staff: normalizedStaff,` to the returned object (next to `stores: normalizedStores,`):

```ts
	return {
		...game,
		stores: normalizedStores,
		staff: normalizedStaff,
		industrialBuildings: normalizedBuildings,
		world: normalizedWorld,
		storeCap: normalizedStoreCap
	} as GameState;
```

- [ ] **Step 6: Run tests + typecheck to verify they pass**

Run: `bun run test:unit -- src/lib/persistence/saveRepository.spec.ts --run`
Expected: PASS.
Run: `bun run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/persistence/saveCodec.ts src/lib/persistence/saveRepository.spec.ts
git commit -m "feat: validate and migrate staff level/xp in saves"
```

---

## Task 6: StaffPanel UI — level/XP display + Promote button

**Files:**
- Modify: `src/lib/components/game/StaffPanel.svelte`
- Modify: `src/routes/+page.svelte` (handler + props)
- Test: `src/lib/components/game/StaffPanel.svelte.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/components/game/StaffPanel.svelte.spec.ts`, update the `renderStaffPanel` props type and defaults to include `cash` and `onPromote`:

```ts
function renderStaffPanel(
	overrides: Partial<{
		stores: Store[];
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		cash: number;
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
		onPromote: (staffId: string) => void;
	}> = {}
) {
	const props = {
		stores: [store],
		staff,
		hiringCandidates,
		cash: 100_000,
		onHire: vi.fn(),
		onAssign: vi.fn(),
		onUnassign: vi.fn(),
		onPromote: vi.fn(),
		...overrides
	};

	render(StaffPanel, props);

	return props;
}
```

Add these tests inside `describe('StaffPanel', ...)`:

```ts
	it('fires onPromote for an eligible, affordable staff member', async () => {
		expect.assertions(1);
		const onPromote = vi.fn();

		renderStaffPanel({
			cash: 100_000,
			onPromote,
			staff: [
				{
					id: 'staff-grow',
					name: 'Drew Stone',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 70,
					assignedStoreId: null,
					hiredOnDay: 0,
					level: 1,
					xp: 100
				}
			]
		});

		await page
			.getByRole('button', { name: /Promote Drew Stone/ })
			.click();

		expect(onPromote).toHaveBeenCalledWith('staff-grow');
	});

	it('does not render a promote button for staff without enough xp', async () => {
		expect.assertions(1);

		renderStaffPanel({
			staff: [
				{
					id: 'staff-new',
					name: 'Quinn Walker',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 70,
					assignedStoreId: null,
					hiredOnDay: 0,
					level: 1,
					xp: 0
				}
			]
		});

		await expect.element(page.getByRole('button', { name: /Promote Quinn Walker/ })).not.toBeInTheDocument();
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- src/lib/components/game/StaffPanel.svelte.spec.ts --run`
Expected: FAIL — `onPromote`/`cash` not declared as props; no Promote button rendered.

- [ ] **Step 3: Use the Svelte MCP docs (required for Svelte work)**

Call `list-sections`, then `get-documentation` for the sections relevant to runes props (`$props`), conditional rendering, and event handlers, before editing the component.

- [ ] **Step 4: Update `StaffPanel.svelte` script**

In `src/lib/components/game/StaffPanel.svelte`, extend the imports and props. Replace the import line for staffing types/helpers area to add the leveling helpers:

```ts
	import { summarizeStoreStaffing } from '$lib/game/staffing';
	import {
		canPromoteStaff,
		getStaffTrainingFee,
		getStaffXpForLevel,
		MAX_STAFF_LEVEL
	} from '$lib/game/staffLeveling';
	import type { HiringCandidate, StaffMember, StaffRole, Store } from '$lib/game/types';
```

Replace the `Props` interface and `$props()` destructure:

```ts
	interface Props {
		stores: Store[];
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		cash: number;
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
		onPromote: (staffId: string) => void;
	}

	let { stores, staff, hiringCandidates, cash, onHire, onAssign, onUnassign, onPromote }: Props =
		$props();
```

Add these helpers alongside the existing label helpers:

```ts
	function canAffordPromotion(member: StaffMember): boolean {
		return cash >= getStaffTrainingFee(member.level);
	}

	function promoteActionLabel(member: StaffMember): string {
		return `Promote ${member.name}, ${roleLabel(member.role)} staff ${member.id} to level ${member.level + 1} for ${currency.format(getStaffTrainingFee(member.level))}`;
	}

	function levelProgress(member: StaffMember): string {
		return member.level >= MAX_STAFF_LEVEL
			? 'Max level'
			: `XP ${member.xp}/${getStaffXpForLevel(member.level)}`;
	}
```

- [ ] **Step 5: Update `StaffPanel.svelte` markup**

In the **Unassigned** section's `person-card` (the `{#each unassignedStaff ...}` block), add a Level metric to the `dl.metrics` and a promote button after the `<select>`. Replace that card's body with:

```svelte
				<article class="person-card">
					<div class="person-heading">
						<div>
							<h4>{member.name}</h4>
							<p>{roleLabel(member.role)}</p>
						</div>
						<strong>{currency.format(member.monthlySalary)}/mo</strong>
					</div>
					<dl class="metrics">
						<div>
							<dt>Level</dt>
							<dd>{member.level}</dd>
						</div>
						<div>
							<dt>Skill</dt>
							<dd>{member.skill}</dd>
						</div>
						<div>
							<dt>Morale</dt>
							<dd>{member.morale}</dd>
						</div>
					</dl>
					<p class="progress">{levelProgress(member)}</p>
					<select
						aria-label={assignActionLabel(member)}
						value=""
						onchange={(event) => handleAssignment(member, event.currentTarget.value)}
					>
						<option value="">Unassigned</option>
						{#each stores as store (store.id)}
							<option value={store.id}>{store.name}</option>
						{/each}
					</select>
					{#if canPromoteStaff(member)}
						<button
							type="button"
							disabled={!canAffordPromotion(member)}
							aria-label={promoteActionLabel(member)}
							onclick={() => onPromote(member.id)}
						>
							Promote {member.name} ({currency.format(getStaffTrainingFee(member.level))})
						</button>
					{/if}
				</article>
```

In the **Store staffing** section's assigned row (`{#each item.assignedStaff ...}`), append level to the summary line and add the promote button. Replace the `assigned-row` body with:

```svelte
						<div class="assigned-row">
							<div>
								<h4>{member.name}</h4>
								<p>
									{roleLabel(member.role)} · Lvl {member.level} · Skill {member.skill} · Morale {member.morale}
								</p>
								<p class="progress">{levelProgress(member)}</p>
							</div>
							<div class="assignment-actions">
								<select
									aria-label={assignActionLabel(member)}
									value={member.assignedStoreId ?? ''}
									onchange={(event) => handleAssignment(member, event.currentTarget.value)}
								>
									<option value="">Unassigned</option>
									{#each stores as store (store.id)}
										<option value={store.id}>{store.name}</option>
									{/each}
								</select>
								{#if canPromoteStaff(member)}
									<button
										type="button"
										disabled={!canAffordPromotion(member)}
										aria-label={promoteActionLabel(member)}
										onclick={() => onPromote(member.id)}
									>
										Promote {member.name} ({currency.format(getStaffTrainingFee(member.level))})
									</button>
								{/if}
								<button
									type="button"
									class="secondary"
									aria-label={unassignActionLabel(member, item.store)}
									onclick={() => onUnassign(member.id)}>Unassign {member.name}</button
								>
							</div>
						</div>
```

Add a `.progress` style rule inside the `<style>` block:

```css
	.progress {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 0.78rem;
		color: var(--ink-500);
	}
```

- [ ] **Step 6: Run the Svelte autofixer**

Run the `svelte-autofixer` MCP tool on the full updated `StaffPanel.svelte` source; apply fixes and re-run until it reports no issues.

- [ ] **Step 7: Wire the page handler and props**

In `src/routes/+page.svelte`, extend the staffing import:

```ts
	import { assignStaffToStore, hireCandidate, promoteStaff, unassignStaff } from '$lib/game/staffing';
```

Add the handler after `unassignStoreStaff`:

```ts
	function promoteStaffMember(staffId: string) {
		if (game) {
			setGameAndAutosave(promoteStaff(game, staffId));
		}
	}
```

Update the `<StaffPanel ... />` usage to pass `cash` and `onPromote`:

```svelte
					<StaffPanel
						stores={game.stores}
						staff={game.staff}
						hiringCandidates={game.hiringCandidates}
						cash={game.cash}
						onHire={hireStaff}
						onAssign={assignStaff}
						onUnassign={unassignStoreStaff}
						onPromote={promoteStaffMember}
					/>
```

- [ ] **Step 8: Run the tests + typecheck**

Run: `bun run test:unit -- src/lib/components/game/StaffPanel.svelte.spec.ts --run`
Expected: PASS.
Run: `bun run check`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/game/StaffPanel.svelte src/routes/+page.svelte src/lib/components/game/StaffPanel.svelte.spec.ts
git commit -m "feat: show staff level and promote control in StaffPanel"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `bun run check`
Expected: PASS (0 errors, 0 warnings).

- [ ] **Step 2: Lint + format**

Run: `bun run lint`
Expected: PASS. If Prettier flags formatting, run `bun run format` and re-commit.

- [ ] **Step 3: Full unit suite**

Run: `bun run test:unit -- --run`
Expected: PASS (all client + server projects).

- [ ] **Step 4: Production build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 5: Commit any formatting fixes**

```bash
git add -A
git commit -m "chore: lint/format staff leveling" || echo "nothing to commit"
```

---

## Self-Review Notes

**Spec coverage:**
- §Domain model → Task 1. §New module → Task 2. §Transitions (`promoteStaff`) → Task 3. §Daily tick (XP accrual, utilization guard, non-banking cap) → Task 4. §Persistence (validation + migration) → Task 5. §UI (level/XP display, Promote button, `onPromote`, cash gating) → Task 6. §Testing → tasks 2–6 + Task 7 full suite.
- §Balance defaults → encoded as constants in Task 2 (`MAX_STAFF_LEVEL`, `STAFF_SKILL_GAIN_PER_LEVEL`, `STAFF_SALARY_BONUS_PER_LEVEL`, `STAFF_TRAINING_BASE_COST`, XP constants).
- §Known tradeoff (skill clamp) → covered by `getStaffSkillAfterPromotion` clamp test in Task 2.

**Type consistency:** `level`/`xp` names match across types, constructors, transition, simulate, codec, and UI. Helper names (`getStaffXpForLevel`, `getStaffTrainingFee`, `getStaffSkillAfterPromotion`, `getStaffSalaryAfterPromotion`, `getStaffDailyXp`, `canPromoteStaff`, `MAX_STAFF_LEVEL`) are identical in every consumer.

**Non-banking cap:** daily accrual caps `xp` at `getStaffXpForLevel(level)`, so on promotion `xp - getStaffXpForLevel(oldLevel)` resolves to 0 — consistent with the Task 3 test asserting `xp === 0`.
