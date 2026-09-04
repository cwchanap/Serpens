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

async function renderStaffPanel(
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

	// The assignment machinery (unassigned list, selects, XP/promotion) lives in
	// the compacted "Manage assignments" disclosure; open it so the tests below
	// can drive those controls.
	await page.getByText('Manage assignments').click();

	return { ...props, result };
}

describe('StaffPanel', () => {
	it('renders staff, candidates, unassigned staff, and store coverage', async () => {
		expect.assertions(7);

		await renderStaffPanel();

		await expect.element(page.getByRole('heading', { name: 'Staff' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Candidates' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Casey Rivera' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Blair Kim' })).toBeVisible();
		await expect.element(page.getByText('Mgr 1/1')).toBeVisible();
		await expect.element(page.getByText('Gen 0/2')).toBeVisible();
		await expect.element(page.getByText('2 hired staff')).toBeVisible();
	});

	it('calls onHire with the selected candidate id', async () => {
		expect.assertions(1);
		const onHire = vi.fn();

		await renderStaffPanel({ onHire });

		await page
			.getByRole('button', { name: 'Hire Casey Rivera, General candidate candidate-casey' })
			.click();

		expect(onHire).toHaveBeenCalledWith('candidate-casey');
	});

	it('calls onAssign with staff id and store id when assigning unassigned staff', async () => {
		expect.assertions(1);
		const onAssign = vi.fn();

		await renderStaffPanel({ onAssign });

		await page
			.getByLabelText('Assign Blair Kim, General staff staff-blair, currently unassigned')
			.selectOptions('store-1');

		expect(onAssign).toHaveBeenCalledWith('staff-blair', 'store-1');
	});

	it('calls onUnassign with staff id when clicking an assigned staff unassign button', async () => {
		expect.assertions(1);
		const onUnassign = vi.fn();

		await renderStaffPanel({ onUnassign });

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

		await renderStaffPanel({
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

		await renderStaffPanel({ stores: [store, secondStore], onAssign });

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

		await renderStaffPanel({ onUnassign });

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
		await renderStaffPanel({
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
		await renderStaffPanel({
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
		expect.assertions(2);
		const onPromote = vi.fn();

		await renderStaffPanel({
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

		const promoteButton = page.getByRole('button', { name: /Promote Drew Stone/ });
		await expect.element(promoteButton).toBeVisible();
		await promoteButton.click();

		expect(onPromote).toHaveBeenCalledWith('staff-grow');
	});

	it('does not render a promote button for staff without enough xp', async () => {
		expect.assertions(1);

		await renderStaffPanel({
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

		await renderStaffPanel({
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

		await renderStaffPanel({
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

		await renderStaffPanel({
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

		await renderStaffPanel({
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

		await renderStaffPanel({
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

		await renderStaffPanel({
			stores: [store, secondStore],
			staff: [
				{
					...staff[0]!,
					assignedStoreId: 'store-1'
				}
			]
		});

		await expect.element(page.getByText('No assigned staff')).toBeVisible();
		await expect.element(page.getByText('Mgr 0/1')).toBeVisible();
	});

	it('expands manage assignments and focuses the store when the coverage add token is used', async () => {
		expect.assertions(3);

		await renderStaffPanel();

		// Collapse the disclosure again so the add token must re-open it.
		await page.getByText('Manage assignments').click();
		expect((document.querySelector('details.manage') as HTMLDetailsElement | null)?.open).toBe(
			false
		);

		await page.getByRole('button', { name: 'Add staff to Founding Store' }).click();

		expect((document.querySelector('details.manage') as HTMLDetailsElement | null)?.open).toBe(
			true
		);
		expect(document.activeElement?.id).toBe('manage-store-store-1');
	});

	it('renders no store cards and only the Unassigned option when there are no stores', async () => {
		expect.assertions(3);

		await renderStaffPanel({
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

		await renderStaffPanel({
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

		const { result } = await renderStaffPanel();

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

		const { result } = await renderStaffPanel();

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
		await renderStaffPanel({
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

		await renderStaffPanel({
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

		await renderStaffPanel({ onUnassign });

		await page
			.getByLabelText(
				'Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store'
			)
			.selectOptions('');

		expect(onUnassign).toHaveBeenCalledWith('staff-alex');
	});

	it('disables the assigned-staff select when canUnassign is false and no transfer destinations exist', async () => {
		expect.assertions(2);
		await renderStaffPanel({
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
		await renderStaffPanel({
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
		expect.assertions(2);
		const onPromote = vi.fn();
		const { result } = await renderStaffPanel({
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
		// Assert the promote button is actually rendered so the dispatched
		// click reaches a real target. The optional-short-circuit (`?.`)
		// would silently pass the test if the button were absent, masking a
		// regression where the disabled guard is never exercised.
		expect(promoteButton).toBeInstanceOf(HTMLButtonElement);
		promoteButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onPromote).not.toHaveBeenCalled();
	});

	it('guards onAssign when a change event is dispatched on a disabled select with a store value', async () => {
		// handleAssignment's `if (canAssign)` guard: when canAssign is false
		// but a change event fires with a truthy storeId (bypassing the
		// disabled option), onAssign must not be called. The function
		// returns early without falling through to onUnassign.
		expect.assertions(2);
		const onAssign = vi.fn();
		const onUnassign = vi.fn();
		await renderStaffPanel({
			stores: [store, secondStore],
			onAssign,
			onUnassign,
			canAssign: false,
			canUnassign: true
		});

		// Find the unassigned staff select (Blair's) and dispatch a change
		// event directly, bypassing the disabled option UI restriction.
		const select = page.getByLabelText(
			'Assign Blair Kim, General staff staff-blair, currently unassigned'
		);
		const selectElement = select.element() as HTMLSelectElement;
		selectElement.value = 'store-2';
		selectElement.dispatchEvent(new Event('change', { bubbles: true }));

		expect(onAssign).not.toHaveBeenCalled();
		// The early return means onUnassign is also not called even though
		// canUnassign is true — the storeId is truthy so we never reach the
		// unassign branch.
		expect(onUnassign).not.toHaveBeenCalled();
	});

	it('guards onUnassign when a change event is dispatched with an empty storeId and canUnassign is false', async () => {
		// handleAssignment's `if (canUnassign)` guard: when canUnassign is
		// false and a change event fires with an empty storeId, onUnassign
		// must not be called.
		expect.assertions(2);
		const onAssign = vi.fn();
		const onUnassign = vi.fn();
		await renderStaffPanel({
			stores: [store, secondStore],
			onAssign,
			onUnassign,
			canAssign: true,
			canUnassign: false
		});

		// Find the assigned staff select (Alex's) and dispatch a change
		// event with an empty value, bypassing the disabled option.
		const select = page.getByLabelText(
			'Assign Alex Chen, Manager staff staff-alex, currently assigned to Founding Store'
		);
		const selectElement = select.element() as HTMLSelectElement;
		selectElement.value = '';
		selectElement.dispatchEvent(new Event('change', { bubbles: true }));

		expect(onUnassign).not.toHaveBeenCalled();
		expect(onAssign).not.toHaveBeenCalled();
	});

	it('shows the disabled reason when only canHire is false', async () => {
		expect.assertions(2);
		await renderStaffPanel({
			canHire: false,
			canAssign: true,
			canUnassign: true,
			canPromote: true,
			disabledReason: 'Hiring is unavailable in this challenge.'
		});

		await expect.element(page.getByText('Hiring is unavailable in this challenge.')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /hire casey/i })).toBeDisabled();
	});

	it('shows the disabled reason when only canAssign is false', async () => {
		expect.assertions(1);
		await renderStaffPanel({
			canHire: true,
			canAssign: false,
			canUnassign: true,
			canPromote: true,
			disabledReason: 'Assignment is unavailable in this challenge.'
		});

		await expect
			.element(page.getByText('Assignment is unavailable in this challenge.'))
			.toBeVisible();
	});

	it('shows the disabled reason when only canUnassign is false', async () => {
		expect.assertions(1);
		await renderStaffPanel({
			canHire: true,
			canAssign: true,
			canUnassign: false,
			canPromote: true,
			disabledReason: 'Unassignment is unavailable in this challenge.'
		});

		await expect
			.element(page.getByText('Unassignment is unavailable in this challenge.'))
			.toBeVisible();
	});
});
