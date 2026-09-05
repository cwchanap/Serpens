import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PolicyPanel from './PolicyPanel.svelte';
import { createI18n, type I18nBundle } from '$lib/i18n';
import { createNewGame } from '$lib/game/state';
import { openWorldCity } from '$lib/game/world';
import { POLICY_FIELD_OPTIONS, setPolicyOverride } from '$lib/game/policyInheritance';
import type { CompanyPolicy, GameState, PolicyOverrideScope } from '$lib/game/types';

const defaultPolicy: CompanyPolicy = {
	pricing: 'competitive',
	inventory: 'balanced',
	staffing: 'efficient',
	marketing: 'awareness',
	service: 'balanced'
};

function renderPolicyPanel(
	overrides: Partial<{
		game: GameState;
		i18n: I18nBundle;
		onChange: (patch: Partial<CompanyPolicy>) => void;
		onSetPolicyOverride: (scope: PolicyOverrideScope, patch: Partial<CompanyPolicy>) => void;
		onClearPolicyOverrideField: (scope: PolicyOverrideScope, field: keyof CompanyPolicy) => void;
		onResetPolicyOverrideScope: (scope: PolicyOverrideScope) => void;
		canUpdate: boolean;
		canUpdateScoped: boolean;
		disabledReason: string;
	}> = {}
) {
	const props = {
		game: { ...createNewGame('convenience', 20260818), policy: defaultPolicy },
		i18n: createI18n('en'),
		onChange: vi.fn(),
		onSetPolicyOverride: vi.fn(),
		onClearPolicyOverrideField: vi.fn(),
		onResetPolicyOverrideScope: vi.fn(),
		canUpdate: true,
		canUpdateScoped: true,
		...overrides
	};

	render(PolicyPanel, props);

	return props;
}

function policyRadio(groupLabel: string, optionLabel: string) {
	return page
		.getByRole('radiogroup', { name: groupLabel })
		.getByRole('radio', { name: optionLabel });
}

describe('PolicyPanel', () => {
	it('renders the Policies heading', async () => {
		expect.assertions(1);

		renderPolicyPanel();

		await expect.element(page.getByRole('heading', { name: 'Policies' })).toBeVisible();
	});

	it('renders Japanese policy field labels', async () => {
		expect.assertions(1);

		renderPolicyPanel({ i18n: createI18n('ja') });

		await expect.element(page.getByLabelText('価格戦略')).toBeVisible();
	});

	it('renders five segmented policy groups with correct current values', async () => {
		expect.assertions(5);

		renderPolicyPanel();

		await expect.element(policyRadio('Pricing', 'Competitive')).toBeChecked();
		await expect.element(policyRadio('Inventory', 'Balanced')).toBeChecked();
		await expect.element(policyRadio('Staffing', 'Efficient')).toBeChecked();
		await expect.element(policyRadio('Marketing', 'Awareness')).toBeChecked();
		await expect.element(policyRadio('Service', 'Balanced')).toBeChecked();
	});

	it('fires onChange with { pricing: "premium" } when the pricing select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await policyRadio('Pricing', 'Premium').click();

		expect(onChange).toHaveBeenCalledWith({ pricing: 'premium' });
	});

	it('fires onChange with { staffing: "service" } when the staffing select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await policyRadio('Staffing', 'Service').click();

		expect(onChange).toHaveBeenCalledWith({ staffing: 'service' });
	});

	it('fires onChange with { marketing: "loyalty" } when the marketing select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await policyRadio('Marketing', 'Loyalty').click();

		expect(onChange).toHaveBeenCalledWith({ marketing: 'loyalty' });
	});

	it('fires onChange with { inventory: "generous" } when the inventory select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await policyRadio('Inventory', 'Generous').click();

		expect(onChange).toHaveBeenCalledWith({ inventory: 'generous' });
	});

	it('fires onChange with { service: "highTouch" } when the service select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await policyRadio('Service', 'High Touch').click();

		expect(onChange).toHaveBeenCalledWith({ service: 'highTouch' });
	});

	it('keeps policy readable but blocks changes with a textual explanation', async () => {
		expect.assertions(3);
		const onChange = vi.fn();
		renderPolicyPanel({
			onChange,
			canUpdate: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(policyRadio('Pricing', 'Competitive')).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		expect(onChange).not.toHaveBeenCalled();
	});

	it('disables selects without rendering a reason when canUpdate is false and no disabledReason is supplied', async () => {
		expect.assertions(3);
		const onChange = vi.fn();
		renderPolicyPanel({ onChange, canUpdate: false });

		await expect.element(policyRadio('Pricing', 'Competitive')).toBeDisabled();
		// The disabled-copy paragraph only renders when a disabledReason is
		// supplied, so the status region stays empty here.
		await expect.element(page.getByRole('status')).not.toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
	});

	it('guards onChange when a change event is dispatched on a disabled select', async () => {
		expect.assertions(1);
		const onChange = vi.fn();
		renderPolicyPanel({ onChange, canUpdate: false });

		// A programmatic change event still reaches the onchange handler, which
		// must bail out via the `if (!canUpdate) return` guard.
		const radio = await policyRadio('Pricing', 'Competitive').element();
		radio.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onChange).not.toHaveBeenCalled();
	});

	it('renders effective, parent, and provenance values through company, city, and store scopes', async () => {
		expect.assertions(7);
		const base = createNewGame('convenience', 20260818);
		const cityOverride = setPolicyOverride(
			base,
			{ kind: 'city', cityId: 'harbor-city' },
			{
				pricing: 'premium'
			}
		);
		const game = setPolicyOverride(
			cityOverride,
			{ kind: 'store', storeId: 'store-1' },
			{
				pricing: 'discount'
			}
		);
		renderPolicyPanel({ game });

		await expect.element(page.getByText('Company policy').first()).toBeVisible();
		await page.getByRole('tab', { name: 'City' }).click();
		await expect.element(policyRadio('Pricing', 'Premium')).toBeChecked();
		await expect.element(page.getByText('Parent: Standard')).toBeVisible();
		await expect.element(page.getByText('Explicit override (City override)')).toBeVisible();

		await page.getByRole('tab', { name: 'Store' }).click();
		await expect.element(policyRadio('Pricing', 'Discount')).toBeChecked();
		await expect.element(page.getByText('Parent: Premium')).toBeVisible();
		await expect.element(page.getByText('Explicit override (Store override)')).toBeVisible();
	});

	it('keeps an explicit value equal to its parent visibly explicit', async () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260818);
		const game = setPolicyOverride(
			base,
			{ kind: 'city', cityId: 'harbor-city' },
			{
				pricing: base.policy.pricing
			}
		);
		renderPolicyPanel({ game });
		await page.getByRole('tab', { name: 'City' }).click();

		await expect.element(page.getByText('Explicit override (City override)')).toBeVisible();
		expect(document.querySelectorAll('small.provenance[data-provenance="city"]')).toHaveLength(1);
	});

	it('clears one scoped field when its Inherit action is selected', async () => {
		expect.assertions(1);
		const onClearPolicyOverrideField = vi.fn();
		const base = createNewGame('convenience', 20260818);
		const game = setPolicyOverride(
			base,
			{ kind: 'city', cityId: 'harbor-city' },
			{
				pricing: 'premium'
			}
		);
		renderPolicyPanel({ game, onClearPolicyOverrideField });
		await page.getByRole('tab', { name: 'City' }).click();
		await page.getByRole('button', { name: 'Inherit Pricing' }).click();

		expect(onClearPolicyOverrideField).toHaveBeenCalledWith(
			{ kind: 'city', cityId: 'harbor-city' },
			'pricing'
		);
	});

	it('resets the selected scoped override', async () => {
		expect.assertions(1);
		const onResetPolicyOverrideScope = vi.fn();
		const base = createNewGame('convenience', 20260818);
		const game = setPolicyOverride(
			base,
			{ kind: 'city', cityId: 'harbor-city' },
			{
				pricing: 'premium'
			}
		);
		renderPolicyPanel({ game, onResetPolicyOverrideScope });
		await page.getByRole('tab', { name: 'City' }).click();
		await page.getByRole('button', { name: 'Reset scope' }).click();

		expect(onResetPolicyOverrideScope).toHaveBeenCalledWith({
			kind: 'city',
			cityId: 'harbor-city'
		});
	});

	it('renders each policy select option in POLICY_FIELD_OPTIONS order', async () => {
		expect.assertions(5);
		renderPolicyPanel();

		for (const field of Object.keys(POLICY_FIELD_OPTIONS) as (keyof CompanyPolicy)[]) {
			const values = Array.from(
				(
					await page
						.getByRole('radiogroup', { name: field[0]!.toUpperCase() + field.slice(1) })
						.element()
				).querySelectorAll('input[type="radio"]')
			).map((input) => (input as HTMLInputElement).value);
			expect(values).toEqual([...POLICY_FIELD_OPTIONS[field]]);
		}
	});

	it('fires onSetPolicyOverride when changing a policy field in a city scope', async () => {
		expect.assertions(1);
		const onSetPolicyOverride = vi.fn();
		const base = createNewGame('convenience', 20260818);
		const game = setPolicyOverride(
			base,
			{ kind: 'city', cityId: 'harbor-city' },
			{
				pricing: 'premium'
			}
		);
		renderPolicyPanel({ game, onSetPolicyOverride });
		await page.getByRole('tab', { name: 'City' }).click();

		await policyRadio('Pricing', 'Discount').click();

		expect(onSetPolicyOverride).toHaveBeenCalledWith(
			{ kind: 'city', cityId: 'harbor-city' },
			{ pricing: 'discount' }
		);
	});

	it('updates the city target when selecting a different city', async () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260818);
		const opened = openWorldCity(
			{
				...base,
				cash: 100_000,
				world: {
					...base.world,
					revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
				}
			},
			'campus-junction'
		);
		renderPolicyPanel({ game: opened });
		await page.getByRole('tab', { name: 'City' }).click();
		await page.getByLabelText('Target').selectOptions('campus-junction');

		await expect.element(page.getByText('City: Campus Junction')).toBeVisible();
	});

	it('updates the store target when selecting a different store', async () => {
		expect.assertions(1);
		const onSetPolicyOverride = vi.fn();
		const base = createNewGame('convenience', 20260818);
		const opened = openWorldCity(
			{
				...base,
				cash: 100_000,
				world: {
					...base.world,
					revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
				}
			},
			'campus-junction'
		);
		const secondStore = { ...opened.stores[0]!, id: 'store-2', name: 'Second Store' };
		const game = { ...opened, stores: [...opened.stores, secondStore] };
		renderPolicyPanel({ game, onSetPolicyOverride });
		await page.getByRole('tab', { name: 'Store' }).click();
		await page.getByLabelText('Target').selectOptions(secondStore.id);
		await policyRadio('Pricing', 'Discount').click();

		expect(onSetPolicyOverride).toHaveBeenCalledWith(
			{ kind: 'store', storeId: secondStore.id },
			{ pricing: 'discount' }
		);
	});

	it('disables scoped controls when canUpdateScoped is false', async () => {
		expect.assertions(2);
		const onSetPolicyOverride = vi.fn();
		const base = createNewGame('convenience', 20260818);
		const game = setPolicyOverride(
			base,
			{ kind: 'city', cityId: 'harbor-city' },
			{
				pricing: 'premium'
			}
		);
		renderPolicyPanel({
			game,
			onSetPolicyOverride,
			canUpdateScoped: false,
			disabledReason: 'Scenario mode'
		});
		await page.getByRole('tab', { name: 'City' }).click();

		await expect.element(policyRadio('Pricing', 'Premium')).toBeDisabled();
		await expect.element(page.getByText('Scenario mode')).toBeVisible();
	});

	it('disables clear and reset actions when canUpdateScoped is false', async () => {
		expect.assertions(3);
		const onClearPolicyOverrideField = vi.fn();
		const onResetPolicyOverrideScope = vi.fn();
		const base = createNewGame('convenience', 20260818);
		const game = setPolicyOverride(
			base,
			{ kind: 'city', cityId: 'harbor-city' },
			{ pricing: 'premium' }
		);
		renderPolicyPanel({
			game,
			onClearPolicyOverrideField,
			onResetPolicyOverrideScope,
			canUpdateScoped: false
		});
		await page.getByRole('tab', { name: 'City' }).click();

		await expect.element(page.getByRole('button', { name: 'Inherit Pricing' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Reset scope' })).toBeDisabled();
		expect(onClearPolicyOverrideField).not.toHaveBeenCalled();
	});

	it('disables city and store scope options when no retail cities are open', async () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260818);
		const game: GameState = { ...base, cities: [], stores: [] };
		renderPolicyPanel({ game });

		await expect.element(page.getByRole('tab', { name: 'City' })).toBeDisabled();
		await expect.element(page.getByRole('tab', { name: 'Store' })).toBeDisabled();
	});
});
