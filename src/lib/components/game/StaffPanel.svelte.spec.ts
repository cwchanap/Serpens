import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StaffPanel from './StaffPanel.svelte';
import type { HiringCandidate, StaffMember, Store } from '$lib/game/types';

const store: Store = {
	id: 'store-1',
	name: 'Founding Store',
	archetypeId: 'boutique',
	location: 'Downtown (1, 1)',
	cityId: 'harbor-city',
	tileId: 'harbor-city-1-1',
	mapX: 1,
	mapY: 1,
	daysOpen: 0,
	reputation: 50,
	stockHealth: 80,
	staffMorale: 75,
	staffCapacity: 70,
	localDemand: 72,
	competition: 15,
	managerQuality: 60
};

const secondStore: Store = {
	...store,
	id: 'store-2',
	name: 'Mall Store',
	tileId: 'harbor-city-2-2',
	mapX: 2,
	mapY: 2
};

const staff: StaffMember[] = [
	{
		id: 'staff-alex',
		name: 'Alex Chen',
		role: 'manager',
		monthlySalary: 4_800,
		skill: 72,
		morale: 68,
		assignedStoreId: 'store-1',
		hiredOnDay: 0
	},
	{
		id: 'staff-blair',
		name: 'Blair Kim',
		role: 'general',
		monthlySalary: 3_000,
		skill: 61,
		morale: 74,
		assignedStoreId: null,
		hiredOnDay: 2
	}
];

const hiringCandidates: HiringCandidate[] = [
	{
		id: 'candidate-casey',
		name: 'Casey Rivera',
		role: 'general',
		monthlySalary: 2_900,
		skill: 64,
		morale: 70
	}
];

function renderStaffPanel(
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
		stores: [store],
		staff,
		hiringCandidates,
		onHire: vi.fn(),
		onAssign: vi.fn(),
		onUnassign: vi.fn(),
		...overrides
	};

	render(StaffPanel, props);

	return props;
}

describe('StaffPanel', () => {
	it('renders staff, candidates, unassigned staff, and store coverage', async () => {
		expect.assertions(6);

		renderStaffPanel();

		await expect.element(page.getByRole('heading', { name: 'Staff' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Candidates' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Casey Rivera' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Blair Kim' })).toBeVisible();
		await expect.element(page.getByText('Founding Store: 1/1 managers, 0/2 general')).toBeVisible();
		await expect.element(page.getByText('2 hired staff')).toBeVisible();
	});

	it('calls onHire with the selected candidate id', async () => {
		expect.assertions(1);
		const onHire = vi.fn();

		renderStaffPanel({ onHire });

		await page
			.getByRole('button', { name: 'Hire Casey Rivera, General candidate candidate-casey' })
			.click();

		expect(onHire).toHaveBeenCalledWith('candidate-casey');
	});

	it('calls onAssign with staff id and store id when assigning unassigned staff', async () => {
		expect.assertions(1);
		const onAssign = vi.fn();

		renderStaffPanel({ onAssign });

		await page
			.getByLabelText('Assign Blair Kim, General staff staff-blair, currently unassigned')
			.selectOptions('store-1');

		expect(onAssign).toHaveBeenCalledWith('staff-blair', 'store-1');
	});

	it('calls onUnassign with staff id when clicking an assigned staff unassign button', async () => {
		expect.assertions(1);
		const onUnassign = vi.fn();

		renderStaffPanel({ onUnassign });

		await page
			.getByRole('button', {
				name: 'Unassign Alex Chen, Manager staff staff-alex from Founding Store'
			})
			.click();

		expect(onUnassign).toHaveBeenCalledWith('staff-alex');
	});

	it('disambiguates duplicate names in actionable control labels', async () => {
		expect.assertions(3);
		const onHire = vi.fn();
		const onAssign = vi.fn();
		const onUnassign = vi.fn();

		renderStaffPanel({
			onHire,
			onAssign,
			onUnassign,
			hiringCandidates: [
				...hiringCandidates,
				{
					...hiringCandidates[0]!,
					id: 'candidate-casey-manager',
					role: 'manager'
				}
			],
			staff: [
				...staff,
				{
					...staff[1]!,
					id: 'staff-blair-assigned',
					assignedStoreId: 'store-1'
				}
			]
		});

		await page
			.getByRole('button', { name: 'Hire Casey Rivera, Manager candidate candidate-casey-manager' })
			.click();
		await page
			.getByLabelText('Assign Blair Kim, General staff staff-blair, currently unassigned')
			.selectOptions('store-1');
		await page
			.getByRole('button', {
				name: 'Unassign Blair Kim, General staff staff-blair-assigned from Founding Store'
			})
			.click();

		expect(onHire).toHaveBeenCalledWith('candidate-casey-manager');
		expect(onAssign).toHaveBeenCalledWith('staff-blair', 'store-1');
		expect(onUnassign).toHaveBeenCalledWith('staff-blair-assigned');
	});

	it('calls onAssign with assigned staff id and target store id when transferring stores', async () => {
		expect.assertions(1);
		const onAssign = vi.fn();

		renderStaffPanel({ stores: [store, secondStore], onAssign });

		await page
			.getByLabelText('Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store')
			.selectOptions('store-2');

		expect(onAssign).toHaveBeenCalledWith('staff-alex', 'store-2');
	});

	it('calls onUnassign when selecting Unassigned from an assigned staff select', async () => {
		expect.assertions(1);
		const onUnassign = vi.fn();

		renderStaffPanel({ onUnassign });

		await page
			.getByLabelText('Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store')
			.selectOptions('');

		expect(onUnassign).toHaveBeenCalledWith('staff-alex');
	});
});
