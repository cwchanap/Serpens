import { clampScore } from './reports';
import { getUnlockedCategoryCount } from './leveling';
import { randomInt, type Rng } from './rng';
import type {
	ArchetypeId,
	GameState,
	HiringCandidate,
	StaffingRequirement,
	StaffingSummary,
	StaffMember,
	StaffRole,
	Store
} from './types';

const STAFFING_REQUIREMENTS: Record<ArchetypeId, StaffingRequirement> = {
	convenience: { manager: 1, general: 1 },
	boutique: { manager: 1, general: 2 },
	electronics: { manager: 1, general: 2 },
	grocery: { manager: 1, general: 3 }
};

export const HIRING_CANDIDATE_COUNT = 5;
export const HIRING_MARKET_REFRESH_INTERVAL_DAYS = 7;

const FIRST_NAMES = [
	'Avery',
	'Blake',
	'Casey',
	'Drew',
	'Emery',
	'Finley',
	'Harper',
	'Jordan',
	'Morgan',
	'Quinn'
];

const LAST_NAMES = [
	'Chen',
	'Diaz',
	'Patel',
	'Rivera',
	'Stone',
	'Nguyen',
	'Kim',
	'Brooks',
	'Singh',
	'Walker'
];

export function getStaffingRequirement(archetypeId: ArchetypeId, level = 1): StaffingRequirement {
	const base = STAFFING_REQUIREMENTS[archetypeId];
	const milestoneStaff = getUnlockedCategoryCount(level) - 1;

	return { manager: base.manager, general: base.general + milestoneStaff };
}

export function generateStarterStaffForStore(input: {
	storeId: string;
	archetypeId: ArchetypeId;
	day: number;
	rng: Rng;
}): StaffMember[] {
	const requirement = getStaffingRequirement(input.archetypeId);

	return [
		...createStarterStaffForRole(input, 'manager', requirement.manager),
		...createStarterStaffForRole(input, 'general', requirement.general)
	];
}

export function generateHiringCandidates(input: {
	count: number;
	day: number;
	rng: Rng;
}): HiringCandidate[] {
	return Array.from({ length: input.count }, (_, index) => {
		const role: StaffRole = index % 3 === 0 ? 'manager' : 'general';
		const firstName = FIRST_NAMES[randomInt(input.rng, 0, FIRST_NAMES.length - 1)]!;
		const lastName = LAST_NAMES[randomInt(input.rng, 0, LAST_NAMES.length - 1)]!;
		const baseSalary = role === 'manager' ? 4_300 : 2_700;
		const salaryVariance =
			role === 'manager' ? randomInt(input.rng, 0, 900) : randomInt(input.rng, 0, 650);

		return {
			id: `candidate-${input.day}-${index + 1}`,
			name: `${firstName} ${lastName}`,
			role,
			monthlySalary: baseSalary + salaryVariance,
			skill: clampScore(45 + randomInt(input.rng, 0, 35)),
			morale: clampScore(50 + randomInt(input.rng, 0, 35))
		};
	});
}

export function shouldRefreshHiringMarket(day: number): boolean {
	return day > 1 && (day - 1) % HIRING_MARKET_REFRESH_INTERVAL_DAYS === 0;
}

export function hireCandidate(game: GameState, candidateId: string): GameState {
	const candidate = game.hiringCandidates.find((item) => item.id === candidateId);

	if (!candidate) {
		return game;
	}

	return {
		...game,
		staff: [
			...game.staff,
			{
				...candidate,
				id: `staff-${candidate.id}`,
				assignedStoreId: null,
				hiredOnDay: game.day
			}
		],
		hiringCandidates: game.hiringCandidates.filter((item) => item.id !== candidateId)
	};
}

export function assignStaffToStore(game: GameState, staffId: string, storeId: string): GameState {
	if (
		!game.staff.some((member) => member.id === staffId) ||
		!game.stores.some((store) => store.id === storeId)
	) {
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
	const requirement = getStaffingRequirement(store.archetypeId, store.level);
	const assignedStaff = getAssignedStaff(game.staff, store.id);
	const assigned = countRoles(assignedStaff);
	const requiredTotal = requirement.manager + requirement.general;
	const coveredTotal =
		Math.min(assigned.manager, requirement.manager) +
		Math.min(assigned.general, requirement.general);

	return {
		requirement,
		assigned,
		shortage: {
			manager: Math.max(0, requirement.manager - assigned.manager),
			general: Math.max(0, requirement.general - assigned.general)
		},
		coverage: requiredTotal === 0 ? 100 : clampScore((coveredTotal / requiredTotal) * 100),
		averageSkill: averageScore(assignedStaff, 'skill', 50),
		averageMorale: averageScore(assignedStaff, 'morale', store.staffMorale)
	};
}

export function calculateMonthlyPayroll(staff: StaffMember[]): number {
	return staff.reduce((sum, member) => sum + member.monthlySalary, 0);
}

export function isPayrollDay(day: number): boolean {
	return day > 0 && day % 30 === 0;
}

function createStarterStaffForRole(
	input: {
		storeId: string;
		day: number;
		rng: Rng;
	},
	role: StaffRole,
	count: number
): StaffMember[] {
	return Array.from({ length: count }, (_, index) => {
		const candidate = generateStaffProfile(input.rng, role);

		return {
			...candidate,
			id: `staff-${input.storeId}-${role}-${index + 1}`,
			assignedStoreId: input.storeId,
			hiredOnDay: input.day
		};
	});
}

function generateStaffProfile(rng: Rng, role: StaffRole): HiringCandidate {
	const firstName = FIRST_NAMES[randomInt(rng, 0, FIRST_NAMES.length - 1)]!;
	const lastName = LAST_NAMES[randomInt(rng, 0, LAST_NAMES.length - 1)]!;
	const baseSalary = role === 'manager' ? 4_600 : 2_800;
	const salaryVariance = role === 'manager' ? randomInt(rng, 0, 700) : randomInt(rng, 0, 500);

	return {
		id: 'staff-profile',
		name: `${firstName} ${lastName}`,
		role,
		monthlySalary: baseSalary + salaryVariance,
		skill: clampScore(55 + randomInt(rng, 0, 25)),
		morale: clampScore(58 + randomInt(rng, 0, 24))
	};
}

function countRoles(staff: StaffMember[]): StaffingRequirement {
	return staff.reduce<StaffingRequirement>(
		(counts, member) => ({
			...counts,
			[member.role]: counts[member.role] + 1
		}),
		{ manager: 0, general: 0 }
	);
}

function averageScore(staff: StaffMember[], field: 'skill' | 'morale', fallback: number): number {
	if (staff.length === 0) {
		return clampScore(fallback);
	}

	return clampScore(staff.reduce((sum, member) => sum + member[field], 0) / staff.length);
}
