import { describe, expect, test } from 'vitest';
import { createRng } from './rng';
import { initializeStoreProducts } from './stock';
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
import type { GameState, StaffMember, Store } from './types';

describe('staffing rules', () => {
	test('returns staffing requirements by archetype', () => {
		expect.assertions(4);

		expect(getStaffingRequirement('convenience')).toEqual({ manager: 1, general: 1 });
		expect(getStaffingRequirement('boutique')).toEqual({ manager: 1, general: 2 });
		expect(getStaffingRequirement('electronics')).toEqual({ manager: 1, general: 2 });
		expect(getStaffingRequirement('grocery')).toEqual({ manager: 1, general: 3 });
	});

	test('generates assigned starter staff for a store archetype requirement', () => {
		expect.assertions(7);
		const staff = generateStarterStaffForStore({
			storeId: 'store-1',
			archetypeId: 'grocery',
			day: 7,
			rng: createRng(123)
		});

		expect(staff).toHaveLength(4);
		expect(staff.map((member) => member.id)).toEqual([
			'staff-store-1-manager-1',
			'staff-store-1-general-1',
			'staff-store-1-general-2',
			'staff-store-1-general-3'
		]);
		expect(staff.filter((member) => member.role === 'manager')).toHaveLength(1);
		expect(staff.filter((member) => member.role === 'general')).toHaveLength(3);
		expect(staff.every((member) => member.assignedStoreId === 'store-1')).toBe(true);
		expect(staff.every((member) => member.hiredOnDay === 7)).toBe(true);
		expect(staff.every((member) => member.monthlySalary > 0)).toBe(true);
	});

	test('generates deterministic varied hiring candidates', () => {
		expect.assertions(5);
		const first = generateHiringCandidates({ count: 5, day: 3, rng: createRng(2026) });
		const second = generateHiringCandidates({ count: 5, day: 3, rng: createRng(2026) });

		expect(first).toEqual(second);
		expect(first).toHaveLength(5);
		expect(first.map((candidate) => candidate.role)).toEqual([
			'manager',
			'general',
			'general',
			'manager',
			'general'
		]);
		expect(new Set(first.map((candidate) => candidate.name)).size).toBeGreaterThan(1);
		expect(first.map((candidate) => candidate.id)).toEqual([
			'candidate-3-1',
			'candidate-3-2',
			'candidate-3-3',
			'candidate-3-4',
			'candidate-3-5'
		]);
	});

	test('summarizes store staffing for an understaffed game', () => {
		expect.assertions(6);
		const store = createStore({ id: 'store-1', archetypeId: 'grocery', staffMorale: 62 });
		const staff = [
			createStaff({
				id: 'staff-1',
				role: 'manager',
				assignedStoreId: store.id,
				skill: 70,
				morale: 80
			}),
			createStaff({
				id: 'staff-2',
				role: 'general',
				assignedStoreId: store.id,
				skill: 50,
				morale: 60
			}),
			createStaff({ id: 'staff-3', role: 'general', assignedStoreId: null, skill: 90, morale: 20 })
		];

		const summary = summarizeStoreStaffing({ staff }, store);

		expect(summary.requirement).toEqual({ manager: 1, general: 3 });
		expect(summary.assigned).toEqual({ manager: 1, general: 1 });
		expect(summary.shortage).toEqual({ manager: 0, general: 2 });
		expect(summary.coverage).toBe(50);
		expect(summary.averageSkill).toBe(60);
		expect(summary.averageMorale).toBe(70);
	});

	test('summarizes fallback averages when no staff are assigned', () => {
		expect.assertions(4);
		const store = createStore({ id: 'store-1', archetypeId: 'convenience', staffMorale: 62 });
		const summary = summarizeStoreStaffing({ staff: [] }, store);

		expect(summary.assigned).toEqual({ manager: 0, general: 0 });
		expect(summary.coverage).toBe(0);
		expect(summary.averageSkill).toBe(50);
		expect(summary.averageMorale).toBe(62);
	});

	test('caps coverage by required role when one role is overstaffed', () => {
		expect.assertions(4);
		const store = createStore({ id: 'store-1', archetypeId: 'boutique' });
		const staff = [
			createStaff({ id: 'staff-1', role: 'manager', assignedStoreId: store.id }),
			createStaff({ id: 'staff-2', role: 'manager', assignedStoreId: store.id }),
			createStaff({ id: 'staff-3', role: 'manager', assignedStoreId: store.id })
		];

		const summary = summarizeStoreStaffing({ staff }, store);

		expect(summary.requirement).toEqual({ manager: 1, general: 2 });
		expect(summary.assigned).toEqual({ manager: 3, general: 0 });
		expect(summary.shortage).toEqual({ manager: 0, general: 2 });
		expect(summary.coverage).toBe(33);
	});

	test('hires a candidate as an unassigned staff member', () => {
		expect.assertions(8);
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

		expect(hired).not.toBe(game);
		expect(hired.staff).toHaveLength(1);
		expect(hired.staff[0]?.id).toBe('staff-candidate-4-1');
		expect(hired.staff[0]?.assignedStoreId).toBeNull();
		expect(hired.staff[0]?.hiredOnDay).toBe(game.day);
		expect(hired.hiringCandidates).toHaveLength(0);
		expect(game.staff).toHaveLength(0);
		expect(game.hiringCandidates).toHaveLength(1);
	});

	test('returns the same game when hiring an unknown candidate', () => {
		expect.assertions(1);
		const game = createGame();

		expect(hireCandidate(game, 'missing')).toBe(game);
	});

	test('assigns transfers and unassigns staff immutably', () => {
		expect.assertions(12);
		const game = createGame({
			stores: [
				createStore({ id: 'store-1', archetypeId: 'convenience' }),
				createStore({ id: 'store-2', archetypeId: 'boutique' })
			],
			staff: [createStaff({ id: 'staff-1', assignedStoreId: null })]
		});

		const assigned = assignStaffToStore(game, 'staff-1', 'store-1');
		const transferred = assignStaffToStore(assigned, 'staff-1', 'store-2');
		const unassigned = unassignStaff(transferred, 'staff-1');

		expect(assigned).not.toBe(game);
		expect(assigned.staff[0]?.assignedStoreId).toBe('store-1');
		expect(game.staff[0]?.assignedStoreId).toBeNull();
		expect(transferred).not.toBe(assigned);
		expect(transferred.staff[0]?.assignedStoreId).toBe('store-2');
		expect(unassigned).not.toBe(transferred);
		expect(unassigned.staff[0]?.assignedStoreId).toBeNull();
		expect(assignStaffToStore(game, 'missing', 'store-1')).toBe(game);
		expect(assignStaffToStore(game, 'staff-1', 'missing')).toBe(game);
		expect(unassignStaff(game, 'missing')).toBe(game);
		expect(assigned.staff).not.toBe(game.staff);
		expect(assigned.stores).toBe(game.stores);
	});

	test('calculates payroll schedule and monthly salaries', () => {
		expect.assertions(4);
		const staff = [
			createStaff({ id: 'staff-1', monthlySalary: 3_200 }),
			createStaff({ id: 'staff-2', monthlySalary: 2_700 })
		];

		expect(calculateMonthlyPayroll(staff)).toBe(5_900);
		expect(isPayrollDay(29)).toBe(false);
		expect(isPayrollDay(30)).toBe(true);
		expect(isPayrollDay(60)).toBe(true);
	});

	test('returns only staff assigned to a store', () => {
		expect.assertions(1);
		const staff = [
			createStaff({ id: 'staff-1', assignedStoreId: 'store-1' }),
			createStaff({ id: 'staff-2', assignedStoreId: 'store-2' }),
			createStaff({ id: 'staff-3', assignedStoreId: null })
		];

		expect(getAssignedStaff(staff, 'store-1').map((member) => member.id)).toEqual(['staff-1']);
	});
});

function createGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 1,
		rngState: 1,
		day: 4,
		cash: 10_000,
		debt: 0,
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		scorecard: {
			profit: 50,
			customerSatisfaction: 50,
			staffMorale: 50,
			marketPosition: 50
		},
		cities: [],
		activeCityId: 'city-1',
		industryCities: [
			{
				id: 'industry-city',
				name: 'Industry City',
				width: 1,
				height: 1,
				tiles: []
			}
		],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		warehouse: {
			capacity: 0,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		},
		stores: [createStore({ id: 'store-1', archetypeId: 'convenience' })],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: [],
		...overrides
	};
}

function createStore(input: {
	id: string;
	archetypeId: Store['archetypeId'];
	staffMorale?: number;
}): Store {
	return {
		id: input.id,
		name: input.id,
		archetypeId: input.archetypeId,
		location: 'Test location',
		cityId: 'city-1',
		tileId: `${input.id}-tile`,
		mapX: 0,
		mapY: 0,
		daysOpen: 1,
		reputation: 50,
		stockHealth: 50,
		products: initializeStoreProducts(input.archetypeId),
		staffMorale: input.staffMorale ?? 50,
		staffCapacity: 50,
		localDemand: 50,
		competition: 50,
		managerQuality: 50
	};
}

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
		...overrides
	};
}
