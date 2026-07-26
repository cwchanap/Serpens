import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StaffPanel from './StaffPanel.svelte';
import { initializeStoreProducts } from '$lib/game/stock';
import { createI18n } from '$lib/i18n';
import type { HiringCandidate, StaffMember, Store } from '$lib/game/types';

const store: Store = {
	id: 'store-1',
	level: 1,
	name: 'Founding Store',
	archetypeId: 'boutique',
	location: { neighborhoodId: 'downtown', x: 1, y: 1 },
	cityId: 'harbor-city',
	tileId: 'harbor-city-1-1',
	mapX: 1,
	mapY: 1,
	daysOpen: 0,
	reputation: 50,
	stockHealth: 80,
	products: initializeStoreProducts('boutique'),
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
		hiredOnDay: 0,
		level: 1,
		xp: 0
	},
	{
		id: 'staff-blair',
		name: 'Blair Kim',
		role: 'general',
		monthlySalary: 3_000,
		skill: 61,
		morale: 74,
		assignedStoreId: null,
		hiredOnDay: 2,
		level: 1,
		xp: 0
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
		cash: number;
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
		onPromote: (staffId: string) => void;
		canHire: boolean;
		canAssign: boolean;
		canUnassign: boolean;
		canPromote: boolean;
		disabledReason: string;
	}> = {}
) {
	const props = {
		stores: [store],
		staff,
		hiringCandidates,
		cash: 100_000,
		i18n: createI18n('en'),
		onHire: vi.fn(),
		onAssign: vi.fn(),
		onUnassign: vi.fn(),
		onPromote: vi.fn(),
		...overrides
	};

	const result = render(StaffPanel, props);

	return { ...props, result };
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
			.getByLabelText(
				'Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store'
			)
			.selectOptions('store-2');

		expect(onAssign).toHaveBeenCalledWith('staff-alex', 'store-2');
	});

	it('calls onUnassign when selecting Unassigned from an assigned staff select', async () => {
		expect.assertions(1);
		const onUnassign = vi.fn();

		renderStaffPanel({ onUnassign });

		await page
			.getByLabelText(
				'Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store'
			)
			.selectOptions('');

		expect(onUnassign).toHaveBeenCalledWith('staff-alex');
	});

	it('allows unassigning but disables transfer destinations when assignment is unavailable', async () => {
		expect.assertions(7);
		const onAssign = vi.fn();
		const onUnassign = vi.fn();
		renderStaffPanel({
			stores: [store, secondStore],
			onAssign,
			onUnassign,
			canAssign: false,
			canUnassign: true,
			disabledReason: 'Assignment is unavailable in this challenge.'
		});

		const select = page.getByLabelText(
			'Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store'
		);
		const options = Array.from(select.element().querySelectorAll('option'));

		await expect.element(select).not.toBeDisabled();
		expect(options.find((option) => option.value === '')?.disabled).toBe(false);
		expect(options.find((option) => option.value === 'store-1')?.disabled).toBe(false);
		expect(options.find((option) => option.value === 'store-2')?.disabled).toBe(true);
		await expect
			.element(page.getByText('Assignment is unavailable in this challenge.'))
			.toBeVisible();

		await select.selectOptions('');

		expect(onUnassign).toHaveBeenCalledWith('staff-alex');
		expect(onAssign).not.toHaveBeenCalled();
	});

	it('allows transfers but disables Unassigned when unassignment is unavailable', async () => {
		expect.assertions(7);
		const onAssign = vi.fn();
		const onUnassign = vi.fn();
		renderStaffPanel({
			stores: [store, secondStore],
			onAssign,
			onUnassign,
			canAssign: true,
			canUnassign: false,
			disabledReason: 'Unassignment is unavailable in this challenge.'
		});

		const select = page.getByLabelText(
			'Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store'
		);
		const options = Array.from(select.element().querySelectorAll('option'));

		await expect.element(select).not.toBeDisabled();
		expect(options.find((option) => option.value === '')?.disabled).toBe(true);
		expect(options.find((option) => option.value === 'store-1')?.disabled).toBe(false);
		expect(options.find((option) => option.value === 'store-2')?.disabled).toBe(false);
		await expect
			.element(page.getByText('Unassignment is unavailable in this challenge.'))
			.toBeVisible();

		await select.selectOptions('store-2');

		expect(onAssign).toHaveBeenCalledWith('staff-alex', 'store-2');
		expect(onUnassign).not.toHaveBeenCalled();
	});

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

		await page.getByRole('button', { name: /Promote Drew Stone/ }).click();

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

		await expect
			.element(page.getByRole('button', { name: /Promote Quinn Walker/ }))
			.not.toBeInTheDocument();
	});

	it('disables promote button when staff cannot afford promotion', async () => {
		expect.assertions(2);

		renderStaffPanel({
			cash: 100,
			staff: [
				{
					id: 'staff-broke',
					name: 'Jordan Brooks',
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

		const promoteButton = page.getByRole('button', { name: /Promote Jordan Brooks/ });
		await expect.element(promoteButton).toBeVisible();
		await expect.element(promoteButton).toBeDisabled();
	});

	it('shows max level text for staff at maximum level', async () => {
		expect.assertions(1);

		renderStaffPanel({
			staff: [
				{
					id: 'staff-maxed',
					name: 'Morgan Singh',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 70,
					assignedStoreId: null,
					hiredOnDay: 0,
					level: 5,
					xp: 500
				}
			]
		});

		await expect.element(page.getByText('Max level')).toBeVisible();
	});

	it('shows xp progress for staff below maximum level', async () => {
		expect.assertions(1);

		renderStaffPanel({
			staff: [
				{
					id: 'staff-growing',
					name: 'Finley Kim',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 70,
					assignedStoreId: null,
					hiredOnDay: 0,
					level: 1,
					xp: 50
				}
			]
		});

		await expect.element(page.getByText(/XP \d+\/\d+/)).toBeVisible();
	});

	it('fires onPromote for an eligible, affordable assigned staff member', async () => {
		expect.assertions(1);
		const onPromote = vi.fn();

		renderStaffPanel({
			cash: 100_000,
			onPromote,
			staff: [
				{
					id: 'staff-assigned',
					name: 'Taylor Morgan',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 70,
					assignedStoreId: 'store-1',
					hiredOnDay: 0,
					level: 1,
					xp: 100
				}
			]
		});

		await page.getByRole('button', { name: /Promote Taylor Morgan/ }).click();

		expect(onPromote).toHaveBeenCalledWith('staff-assigned');
	});

	it('renders empty states when there are no candidates and no unassigned staff', async () => {
		expect.assertions(3);

		renderStaffPanel({
			hiringCandidates: [],
			staff: [
				{
					...staff[0]!,
					assignedStoreId: 'store-1'
				}
			]
		});

		await expect.element(page.getByText('No candidates available')).toBeVisible();
		await expect.element(page.getByText('No unassigned staff')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Candidates' })).toBeVisible();
	});

	it('renders a store with no assigned staff as empty', async () => {
		expect.assertions(2);

		renderStaffPanel({
			stores: [store, secondStore],
			staff: [
				{
					...staff[0]!,
					assignedStoreId: 'store-1'
				}
			]
		});

		await expect.element(page.getByText('No assigned staff')).toBeVisible();
		await expect.element(page.getByText('Mall Store: 0/1 managers, 0/2 general')).toBeVisible();
	});

	it('renders no store cards and only the Unassigned option when there are no stores', async () => {
		expect.assertions(3);

		renderStaffPanel({
			stores: [],
			staff: [
				{
					...staff[1]!,
					assignedStoreId: null
				}
			]
		});

		await expect.element(page.getByText('No unassigned staff')).not.toBeInTheDocument();
		const select = page.getByLabelText(
			'Assign Blair Kim, General staff staff-blair, currently unassigned'
		);
		await expect.element(select).toBeVisible();
		const options = select.element().querySelectorAll('option');
		expect(options).toHaveLength(1);
	});

	it('does not render a promote button for an assigned staff member without enough xp', async () => {
		expect.assertions(1);

		renderStaffPanel({
			staff: [
				{
					id: 'staff-assigned-noxp',
					name: 'Riley Hayes',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 70,
					assignedStoreId: 'store-1',
					hiredOnDay: 0,
					level: 1,
					xp: 0
				}
			]
		});

		await expect
			.element(page.getByRole('button', { name: /Promote Riley Hayes/ }))
			.not.toBeInTheDocument();
	});

	it('reconciles each-block items when props rerender with the same keys but changed data', async () => {
		expect.assertions(4);

		const { result } = renderStaffPanel();

		await expect.element(page.getByText('2 hired staff')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Alex Chen' })).toBeVisible();

		// Rerender with the SAME keys (ids) but mutated properties so Svelte's
		// keyed-each reconciliation takes the "reuse existing item" path.
		await result.rerender({
			stores: [{ ...store, name: 'Renamed Store' }],
			staff: [
				{ ...staff[0]!, name: 'Alex Renamed', level: 2, xp: 50 },
				{ ...staff[1]!, name: 'Blair Renamed', skill: 80 }
			],
			hiringCandidates: [{ ...hiringCandidates[0]!, name: 'Casey Renamed', skill: 90 }],
			cash: 100_000,
			i18n: createI18n('en'),
			onHire: vi.fn(),
			onAssign: vi.fn(),
			onUnassign: vi.fn(),
			onPromote: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: 'Alex Renamed' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Casey Renamed' })).toBeVisible();
	});

	it('reconciles each-block items across multiple rerenders with swaps and removals', async () => {
		expect.assertions(3);

		const { result } = renderStaffPanel();

		// Step 1: swap assignments (alex unassigned, blair assigned) to trigger
		// assigned-staff and unassigned-staff each-block reconciliation.
		await result.rerender({
			stores: [store, secondStore],
			staff: [
				{ ...staff[0]!, assignedStoreId: null, xp: 100 },
				{ ...staff[1]!, assignedStoreId: 'store-2', xp: 100 }
			],
			hiringCandidates: [
				...hiringCandidates,
				{
					id: 'candidate-dana',
					name: 'Dana Lee',
					role: 'manager',
					monthlySalary: 4_400,
					skill: 70,
					morale: 65
				}
			],
			cash: 100_000,
			i18n: createI18n('en'),
			onHire: vi.fn(),
			onAssign: vi.fn(),
			onUnassign: vi.fn(),
			onPromote: vi.fn()
		});

		await expect.element(page.getByText('2 hired staff')).toBeVisible();

		// Step 2: remove a candidate and a store, keep staff ids but change data.
		await result.rerender({
			stores: [store],
			staff: [
				{ ...staff[0]!, assignedStoreId: 'store-1', name: 'Alex II', level: 2 },
				{ ...staff[1]!, assignedStoreId: null, name: 'Blair II' }
			],
			hiringCandidates: [],
			cash: 100_000,
			i18n: createI18n('en'),
			onHire: vi.fn(),
			onAssign: vi.fn(),
			onUnassign: vi.fn(),
			onPromote: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: 'Alex II' })).toBeVisible();
		await expect.element(page.getByText('No candidates available')).toBeVisible();
	});

	it('disables hire, assign, unassign, and promote independently with callback protection', async () => {
		expect.assertions(6);
		const onHire = vi.fn();
		const onAssign = vi.fn();
		const onUnassign = vi.fn();
		const onPromote = vi.fn();
		renderStaffPanel({
			staff: staff.map((member) => ({ ...member, xp: 100_000 })),
			onHire,
			onAssign,
			onUnassign,
			onPromote,
			canHire: false,
			canAssign: false,
			canUnassign: false,
			canPromote: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByRole('button', { name: /hire casey/i })).toBeDisabled();
		await expect.element(page.getByLabelText(/assign blair/i)).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /unassign alex/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /promote/i }).first()).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		expect(
			[onHire, onAssign, onUnassign, onPromote].every(
				(callback) => callback.mock.calls.length === 0
			)
		).toBe(true);
	});

	it('does not show the disabled reason when every mutation is still permitted', async () => {
		expect.assertions(2);

		renderStaffPanel({
			staff: staff.map((member) => ({ ...member, xp: 100_000 })),
			canHire: true,
			canAssign: true,
			canUnassign: true,
			canPromote: true,
			disabledReason: 'Unavailable in this challenge.'
		});

		expect(document.querySelector('.disabled-copy')).toBeNull();
		await expect.element(page.getByRole('button', { name: /hire casey/i })).toBeEnabled();
	});

	it('calls onUnassign when an assigned staff member is moved to the unassigned option', async () => {
		expect.assertions(1);
		const onUnassign = vi.fn();

		renderStaffPanel({ onUnassign });

		await page
			.getByLabelText(
				'Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store'
			)
			.selectOptions('');

		expect(onUnassign).toHaveBeenCalledWith('staff-alex');
	});

	it('disables the assigned-staff select when canUnassign is false and no transfer destinations exist', async () => {
		expect.assertions(2);
		renderStaffPanel({
			canAssign: true,
			canUnassign: false,
			disabledReason: 'Unassignment is unavailable in this challenge.'
		});

		// With only one store and canUnassign=false, hasAssignmentAction returns
		// false because there is no other store to transfer to.
		const select = page.getByLabelText(
			'Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store'
		);
		await expect.element(select).toBeDisabled();
		await expect
			.element(page.getByText('Unassignment is unavailable in this challenge.'))
			.toBeVisible();
	});

	it('shows the disabled reason when only canPromote is false', async () => {
		expect.assertions(2);
		renderStaffPanel({
			staff: staff.map((member) => ({ ...member, xp: 100_000 })),
			canHire: true,
			canAssign: true,
			canUnassign: true,
			canPromote: false,
			disabledReason: 'Promotions are unavailable in this challenge.'
		});

		await expect
			.element(page.getByText('Promotions are unavailable in this challenge.'))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /promote/i }).first()).toBeDisabled();
	});

	it('guards onPromote when a click is dispatched on a disabled promote button', async () => {
		expect.assertions(1);
		const onPromote = vi.fn();
		const { result } = renderStaffPanel({
			cash: 100_000,
			canPromote: false,
			staff: [
				{
					...staff[0]!,
					assignedStoreId: null,
					xp: 100
				}
			],
			onPromote
		});

		const promoteButton = Array.from(result.container.querySelectorAll('button')).find((btn) =>
			/promote/i.test(btn.textContent ?? '')
		);
		promoteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onPromote).not.toHaveBeenCalled();
	});
});
