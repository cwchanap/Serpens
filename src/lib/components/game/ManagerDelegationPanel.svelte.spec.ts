import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createNewGame } from '$lib/game/state';
import { openWorldCity } from '$lib/game/world';
import { createI18n, type I18nBundle } from '$lib/i18n';
import type {
	GameState,
	ManagerActionRecord,
	ManagerDelegation,
	StaffMember,
	Store
} from '$lib/game/types';
import ManagerDelegationPanel from './ManagerDelegationPanel.svelte';

const baseGame = createNewGame('convenience', 20260818);
const baseStore = baseGame.stores[0]!;
const secondStore: Store = { ...baseStore, id: 'store-2', name: 'Second Store' };
const manager: StaffMember = {
	...baseGame.staff.find((member) => member.role === 'manager')!,
	id: 'manager-1',
	name: 'Alex Chen',
	assignedStoreId: baseStore.id
};
const general: StaffMember = {
	...baseGame.staff.find((member) => member.role === 'general')!,
	id: 'general-1',
	name: 'Blair Kim',
	assignedStoreId: null
};

const defaultDelegation: ManagerDelegation = {
	managerId: manager.id,
	scope: { kind: 'store', storeId: baseStore.id },
	playbook: 'protect-margin',
	authority: { pricing: true, inventory: false, staffing: false, supply: false },
	enabled: true
};

function actionRecord(
	overrides: Partial<ManagerActionRecord> &
		Pick<ManagerActionRecord, 'outcome' | 'reason' | 'change'>
): ManagerActionRecord {
	return {
		id: `action-${overrides.outcome}-${overrides.reason}`,
		day: 4,
		managerId: manager.id,
		scope: defaultDelegation.scope,
		playbook: defaultDelegation.playbook,
		conflictKey: 'pricing:store-1',
		...overrides
	};
}

function managerGame(
	overrides: Partial<GameState> = {},
	delegation: ManagerDelegation | null = defaultDelegation
): GameState {
	return {
		...baseGame,
		staff: [manager, general],
		managerDelegations: delegation ? [delegation] : [],
		managerActionHistory: [],
		...overrides
	};
}

function renderManagerPanel(
	overrides: Partial<{
		game: GameState;
		i18n: I18nBundle;
		onChange: (delegation: ManagerDelegation) => void;
		onRemove: (managerId: string) => void;
		canUpdate: boolean;
		disabledReason: string;
	}> = {}
) {
	const props = {
		game: managerGame(),
		i18n: createI18n('en'),
		onChange: vi.fn(),
		onRemove: vi.fn(),
		canUpdate: true,
		...overrides
	};

	render(ManagerDelegationPanel, props);

	return props;
}

describe('ManagerDelegationPanel', () => {
	it('only renders manager-role staff and keeps physical assignment as context', async () => {
		expect.assertions(3);
		renderManagerPanel();

		await expect.element(page.getByRole('heading', { name: 'Alex Chen' })).toBeVisible();
		await expect.element(page.getByText(`Physical assignment: ${baseStore.name}`)).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Blair Kim' })).not.toBeInTheDocument();
	});

	it('emits typed delegation changes for scope, playbook, and enabled controls', async () => {
		expect.assertions(3);
		const onChange = vi.fn();
		renderManagerPanel({ onChange });

		await page.getByLabelText('Delegation scope for Alex Chen').selectOptions('city');
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				managerId: manager.id,
				scope: { kind: 'city', cityId: 'harbor-city' }
			})
		);

		await page.getByLabelText('Playbook for Alex Chen').selectOptions('protect-availability');
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ managerId: manager.id, playbook: 'protect-availability' })
		);

		await page.getByLabelText('Enable delegation for Alex Chen').click();
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ managerId: manager.id, enabled: false })
		);
	});

	it('renders only authority domains relevant to the selected playbook and emits revocations', async () => {
		expect.assertions(4);
		const onChange = vi.fn();
		const delegation: ManagerDelegation = {
			...defaultDelegation,
			playbook: 'protect-availability',
			authority: { pricing: true, inventory: true, staffing: true, supply: true }
		};
		renderManagerPanel({ game: managerGame({}, delegation), onChange });

		await expect.element(page.getByLabelText('Inventory authority for Alex Chen')).toBeVisible();
		await expect.element(page.getByLabelText('Staffing authority for Alex Chen')).toBeVisible();
		await expect
			.element(page.getByLabelText('Pricing authority for Alex Chen'))
			.not.toBeInTheDocument();
		await page.getByLabelText('Inventory authority for Alex Chen').click();
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ authority: expect.objectContaining({ inventory: false }) })
		);
	});

	it('forces Prefer Local Supply to use a city scope', async () => {
		expect.assertions(2);
		const onChange = vi.fn();
		renderManagerPanel({ game: managerGame({}, null), onChange });

		await page.getByLabelText('Playbook for Alex Chen').selectOptions('prefer-local-supply');
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				playbook: 'prefer-local-supply',
				scope: { kind: 'city', cityId: 'harbor-city' }
			})
		);
		await expect.element(page.getByLabelText('Delegation scope for Alex Chen')).toHaveValue('city');
	});

	it('renders every recent outcome, localized reason, and change summary', async () => {
		expect.assertions(9);
		const game = managerGame({
			managerActionHistory: [
				actionRecord({
					outcome: 'applied',
					reason: 'margin-below-threshold',
					change: {
						kind: 'pricing-policy',
						storeId: baseStore.id,
						before: 'competitive',
						proposed: 'premium',
						applied: 'premium'
					}
				}),
				actionRecord({
					outcome: 'overridden',
					reason: 'conflict-lost',
					change: {
						kind: 'staffing-policy',
						storeId: baseStore.id,
						before: 'efficient',
						proposed: 'service',
						applied: null
					}
				}),
				actionRecord({
					outcome: 'rejected',
					reason: 'transition-rejected',
					change: {
						kind: 'inventory-targets',
						storeId: baseStore.id,
						productId: 'bottled-water',
						before: { reorderThreshold: 2, targetStock: 4 },
						proposed: { reorderThreshold: 3, targetStock: 5 },
						applied: null
					}
				}),
				actionRecord({
					outcome: 'out-of-authority',
					reason: 'authority-disabled',
					change: {
						kind: 'supply-source',
						retailCityId: 'harbor-city',
						before: null,
						proposed: 'industry-city',
						applied: null
					}
				})
			]
		});
		renderManagerPanel({ game });

		await expect.element(page.getByText('Applied', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Overridden', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Rejected', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Out of authority', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Margin below threshold', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Conflict lost', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Transition rejected', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Authority disabled', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Competitive → Premium')).toBeVisible();
	});

	it('disables delegation controls in scenario mode without emitting changes', async () => {
		expect.assertions(3);
		const onChange = vi.fn();
		renderManagerPanel({
			onChange,
			canUpdate: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByLabelText('Playbook for Alex Chen')).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		expect(onChange).not.toHaveBeenCalled();
	});

	it('renders the empty state when there are no manager-role staff', async () => {
		expect.assertions(1);
		renderManagerPanel({ game: { ...baseGame, staff: [general] } });

		await expect.element(page.getByText('No manager-role staff available.')).toBeVisible();
	});

	it('defaults to a city scope when a manager has no assigned store', async () => {
		expect.assertions(2);
		const unassignedManager: StaffMember = {
			...manager,
			id: 'manager-unassigned',
			name: 'Unassigned Manager',
			assignedStoreId: null
		};
		renderManagerPanel({
			game: {
				...baseGame,
				staff: [unassignedManager, general],
				managerDelegations: []
			}
		});

		await expect.element(page.getByRole('heading', { name: 'Unassigned Manager' })).toBeVisible();
		await expect
			.element(page.getByLabelText('Delegation scope for Unassigned Manager'))
			.toHaveValue('city');
	});

	it('emits a removal when the remove button is clicked', async () => {
		expect.assertions(1);
		const onRemove = vi.fn();
		renderManagerPanel({ onRemove });

		await page.getByRole('button', { name: 'Remove delegation' }).click();

		expect(onRemove).toHaveBeenCalledWith(manager.id);
	});

	it('emits a store scope change when switching from city to store', async () => {
		expect.assertions(1);
		const onChange = vi.fn();
		const cityDelegation: ManagerDelegation = {
			...defaultDelegation,
			scope: { kind: 'city', cityId: 'harbor-city' }
		};
		renderManagerPanel({ game: managerGame({}, cityDelegation), onChange });

		await page.getByLabelText('Delegation scope for Alex Chen').selectOptions('store');

		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ scope: { kind: 'store', storeId: baseStore.id } })
		);
	});

	it('emits a scope target change for a store-scoped delegation', async () => {
		expect.assertions(1);
		const onChange = vi.fn();
		renderManagerPanel({
			game: managerGame({ stores: [baseStore, secondStore] }, defaultDelegation),
			onChange
		});

		await page.getByLabelText('Delegation target for Alex Chen').selectOptions(secondStore.id);

		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ scope: { kind: 'store', storeId: secondStore.id } })
		);
	});

	it('renders applied change summaries for staffing, inventory, and supply changes', async () => {
		expect.assertions(3);
		const game = managerGame({
			managerActionHistory: [
				actionRecord({
					outcome: 'applied',
					reason: 'margin-below-threshold',
					change: {
						kind: 'staffing-policy',
						storeId: baseStore.id,
						before: 'efficient',
						proposed: 'service',
						applied: 'service'
					}
				}),
				actionRecord({
					id: 'action-inv-applied',
					outcome: 'applied',
					reason: 'margin-below-threshold',
					change: {
						kind: 'inventory-targets',
						storeId: baseStore.id,
						productId: 'bottled-water',
						before: { reorderThreshold: 2, targetStock: 4 },
						proposed: { reorderThreshold: 3, targetStock: 5 },
						applied: { reorderThreshold: 3, targetStock: 5 }
					}
				}),
				actionRecord({
					id: 'action-sup-applied',
					outcome: 'applied',
					reason: 'margin-below-threshold',
					change: {
						kind: 'supply-source',
						retailCityId: 'harbor-city',
						before: 'industry-city',
						proposed: 'industry-city',
						applied: 'industry-city'
					}
				})
			]
		});
		renderManagerPanel({ game });

		await expect.element(page.getByText('Efficient → Service')).toBeVisible();
		await expect.element(page.getByText('2/4 → 3/5')).toBeVisible();
		await expect.element(page.getByText('Industry City → Industry City')).toBeVisible();
	});

	it('renders the empty history state when a manager has no action records', async () => {
		expect.assertions(1);
		renderManagerPanel();

		await expect.element(page.getByText('No manager actions recorded.')).toBeVisible();
	});

	it('emits a city scope target change when selecting a different city', async () => {
		expect.assertions(1);
		const onChange = vi.fn();
		const opened = openWorldCity(
			{
				...baseGame,
				cash: 100_000,
				world: {
					...baseGame.world,
					revealedCityIds: [...baseGame.world.revealedCityIds, 'campus-junction']
				}
			},
			'campus-junction'
		);
		const cityDelegation: ManagerDelegation = {
			...defaultDelegation,
			scope: { kind: 'city', cityId: 'harbor-city' }
		};
		renderManagerPanel({
			game: { ...opened, staff: [manager, general], managerDelegations: [cityDelegation] },
			onChange
		});

		await page.getByLabelText('Delegation target for Alex Chen').selectOptions('campus-junction');

		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ scope: { kind: 'city', cityId: 'campus-junction' } })
		);
	});

	it('does not emit when disabled and the remove button is clicked', async () => {
		expect.assertions(2);
		const onRemove = vi.fn();
		renderManagerPanel({
			onRemove,
			canUpdate: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByRole('button', { name: 'Remove delegation' })).toBeDisabled();
		expect(onRemove).not.toHaveBeenCalled();
	});

	it('renders a manager with no assigned store and no retail cities', async () => {
		expect.assertions(1);
		const unassignedManager: StaffMember = {
			...manager,
			id: 'manager-no-city',
			name: 'No City Manager',
			assignedStoreId: null
		};
		const gameWithoutCities: GameState = {
			...baseGame,
			cities: [],
			staff: [unassignedManager, general],
			managerDelegations: []
		};

		renderManagerPanel({ game: gameWithoutCities });

		await expect.element(page.getByText('No manager-role staff available.')).toBeVisible();
	});
});
