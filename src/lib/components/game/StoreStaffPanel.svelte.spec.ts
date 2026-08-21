import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StoreStaffPanel from './StoreStaffPanel.svelte';
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

const managerAssigned: StaffMember = {
	id: 'staff-alex',
	name: 'Alex Chen',
	role: 'manager',
	monthlySalary: 4_800,
	skill: 72,
	morale: 68,
	assignedStoreId: store.id,
	hiredOnDay: 0,
	level: 1,
	xp: 0
};

const generalAssigned: StaffMember = {
	id: 'staff-blair',
	name: 'Blair Kim',
	role: 'general',
	monthlySalary: 3_000,
	skill: 61,
	morale: 74,
	assignedStoreId: store.id,
	hiredOnDay: 2,
	level: 1,
	xp: 0
};

const managerUnassigned: StaffMember = {
	id: 'staff-drew',
	name: 'Drew Stone',
	role: 'manager',
	monthlySalary: 4_200,
	skill: 66,
	morale: 70,
	assignedStoreId: null,
	hiredOnDay: 3,
	level: 1,
	xp: 0
};

const generalCandidate: HiringCandidate = {
	id: 'candidate-casey',
	name: 'Casey Rivera',
	role: 'general',
	monthlySalary: 2_900,
	skill: 64,
	morale: 70
};

const managerCandidate: HiringCandidate = {
	id: 'candidate-morgan',
	name: 'Morgan Singh',
	role: 'manager',
	monthlySalary: 4_500,
	skill: 78,
	morale: 72
};

function renderStaffPanel(
	overrides: Partial<{
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
		canHire: boolean;
		canAssign: boolean;
		canUnassign: boolean;
		disabledReason: string;
	}> = {}
) {
	const props = {
		i18n: createI18n('en'),
		store,
		ordinal: 1,
		staff: [managerAssigned, generalAssigned, managerUnassigned],
		hiringCandidates: [generalCandidate, managerCandidate],
		onHire: vi.fn(),
		onAssign: vi.fn(),
		onUnassign: vi.fn(),
		...overrides
	};

	render(StoreStaffPanel, props);

	return props;
}

describe('StoreStaffPanel', () => {
	it('renders the store heading, staffing counts, and skill/morale metrics', async () => {
		expect.assertions(4);

		renderStaffPanel();

		await expect.element(page.getByRole('heading', { name: 'Founding Store staff' })).toBeVisible();
		await expect.element(page.getByText('1/1 managers, 1/2 general')).toBeVisible();
		await expect.element(page.getByText('Skill', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Morale', { exact: true })).toBeVisible();
	});

	it('renders a general staff member in the assigned section', async () => {
		expect.assertions(1);

		renderStaffPanel();

		await expect
			.element(
				page.getByRole('button', {
					name: 'Unassign Blair Kim, General staff staff-blair from Founding Store'
				})
			)
			.toBeVisible();
	});

	it('renders a manager staff member in the unassigned section', async () => {
		expect.assertions(1);

		renderStaffPanel();

		await expect
			.element(
				page.getByRole('button', {
					name: 'Assign Drew Stone, Manager staff staff-drew to Founding Store'
				})
			)
			.toBeVisible();
	});

	it('renders a manager candidate in the candidates section', async () => {
		expect.assertions(1);

		renderStaffPanel();

		await expect
			.element(
				page.getByRole('button', {
					name: 'Hire Morgan Singh, Manager candidate candidate-morgan'
				})
			)
			.toBeVisible();
	});

	it('shows empty-state messages when there are no assigned, unassigned, or candidate staff', async () => {
		expect.assertions(3);

		renderStaffPanel({ staff: [], hiringCandidates: [] });

		await expect.element(page.getByText('No assigned staff')).toBeVisible();
		await expect.element(page.getByText('No unassigned staff')).toBeVisible();
		await expect.element(page.getByText('No candidates available')).toBeVisible();
	});

	it('dispatches onHire, onAssign, and onUnassign with the correct ids', async () => {
		expect.assertions(3);
		const onHire = vi.fn();
		const onAssign = vi.fn();
		const onUnassign = vi.fn();

		renderStaffPanel({ onHire, onAssign, onUnassign });

		await page
			.getByRole('button', {
				name: 'Hire Morgan Singh, Manager candidate candidate-morgan'
			})
			.click();
		await page
			.getByRole('button', {
				name: 'Assign Drew Stone, Manager staff staff-drew to Founding Store'
			})
			.click();
		await page
			.getByRole('button', {
				name: 'Unassign Blair Kim, General staff staff-blair from Founding Store'
			})
			.click();

		expect(onHire).toHaveBeenCalledWith('candidate-morgan');
		expect(onAssign).toHaveBeenCalledWith('staff-drew', store.id);
		expect(onUnassign).toHaveBeenCalledWith('staff-blair');
	});

	it('disables all store staffing mutations with a textual explanation', async () => {
		expect.assertions(5);
		const props = renderStaffPanel({
			canHire: false,
			canAssign: false,
			canUnassign: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByRole('button', { name: /hire morgan/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /assign drew/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /unassign blair/i })).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		expect(
			[props.onHire, props.onAssign, props.onUnassign].every(
				(callback) => vi.mocked(callback).mock.calls.length === 0
			)
		).toBe(true);
	});

	it('does not show the disabled reason when all mutations are still permitted', async () => {
		expect.assertions(2);

		renderStaffPanel({
			canHire: true,
			canAssign: true,
			canUnassign: true,
			disabledReason: 'Unavailable in this challenge.'
		});

		expect(document.querySelector('.disabled-copy')).toBeNull();
		await expect.element(page.getByRole('button', { name: /hire morgan/i })).toBeEnabled();
	});

	it('disables only hiring while leaving assign and unassign enabled', async () => {
		expect.assertions(4);

		renderStaffPanel({
			canHire: false,
			canAssign: true,
			canUnassign: true,
			disabledReason: 'Hiring is unavailable.'
		});

		await expect.element(page.getByRole('button', { name: /hire morgan/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /assign drew/i })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: /unassign blair/i })).toBeEnabled();
		await expect.element(page.getByText('Hiring is unavailable.')).toBeVisible();
	});

	it('guards callbacks when clicks are dispatched on disabled buttons', async () => {
		expect.assertions(1);
		const onHire = vi.fn();
		const onAssign = vi.fn();
		const onUnassign = vi.fn();
		renderStaffPanel({
			onHire,
			onAssign,
			onUnassign,
			canHire: false,
			canAssign: false,
			canUnassign: false
		});

		// Programmatic clicks still reach the onclick handlers, which must each
		// bail out via their `if (canX)` guards.
		const hire = await page.getByRole('button', { name: /hire morgan/i }).element();
		const assign = await page.getByRole('button', { name: /assign drew/i }).element();
		const unassign = await page.getByRole('button', { name: /unassign blair/i }).element();
		hire.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		assign.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		unassign.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect([onHire, onAssign, onUnassign].every((fn) => fn.mock.calls.length === 0)).toBe(true);
	});

	it('shows the disabled reason when only assignment is unavailable', async () => {
		expect.assertions(3);
		renderStaffPanel({
			canAssign: false,
			canUnassign: true,
			canHire: true,
			disabledReason: 'Assignment is unavailable.'
		});

		await expect.element(page.getByRole('button', { name: /assign drew/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /unassign blair/i })).toBeEnabled();
		await expect.element(page.getByText('Assignment is unavailable.')).toBeVisible();
	});

	it('shows the disabled reason when only unassignment is unavailable', async () => {
		expect.assertions(3);
		renderStaffPanel({
			canUnassign: false,
			canAssign: true,
			canHire: true,
			disabledReason: 'Unassignment is unavailable.'
		});

		await expect.element(page.getByRole('button', { name: /unassign blair/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /assign drew/i })).toBeEnabled();
		await expect.element(page.getByText('Unassignment is unavailable.')).toBeVisible();
	});
});
