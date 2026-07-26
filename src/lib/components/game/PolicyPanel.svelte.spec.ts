import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PolicyPanel from './PolicyPanel.svelte';
import { createI18n, type I18nBundle } from '$lib/i18n';
import type { CompanyPolicy } from '$lib/game/types';

const defaultPolicy: CompanyPolicy = {
	pricing: 'competitive',
	inventory: 'balanced',
	staffing: 'efficient',
	marketing: 'awareness',
	service: 'balanced'
};

function renderPolicyPanel(
	overrides: Partial<{
		policy: CompanyPolicy;
		i18n: I18nBundle;
		onChange: (patch: Partial<CompanyPolicy>) => void;
		canUpdate: boolean;
		disabledReason: string;
	}> = {}
) {
	const props = {
		policy: defaultPolicy,
		i18n: createI18n('en'),
		onChange: vi.fn(),
		...overrides
	};

	render(PolicyPanel, props);

	return props;
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

	it('renders five selects with correct current values', async () => {
		expect.assertions(5);

		renderPolicyPanel();

		const selects = page.getByRole('combobox');

		await expect.element(selects.nth(0)).toHaveValue('competitive');
		await expect.element(selects.nth(1)).toHaveValue('balanced');
		await expect.element(selects.nth(2)).toHaveValue('efficient');
		await expect.element(selects.nth(3)).toHaveValue('awareness');
		await expect.element(selects.nth(4)).toHaveValue('balanced');
	});

	it('fires onChange with { pricing: "premium" } when the pricing select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await page.getByLabelText('Pricing').selectOptions('premium');

		expect(onChange).toHaveBeenCalledWith({ pricing: 'premium' });
	});

	it('fires onChange with { staffing: "service" } when the staffing select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await page.getByLabelText('Staffing').selectOptions('service');

		expect(onChange).toHaveBeenCalledWith({ staffing: 'service' });
	});

	it('fires onChange with { marketing: "loyalty" } when the marketing select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await page.getByLabelText('Marketing').selectOptions('loyalty');

		expect(onChange).toHaveBeenCalledWith({ marketing: 'loyalty' });
	});

	it('fires onChange with { inventory: "generous" } when the inventory select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await page.getByLabelText('Inventory').selectOptions('generous');

		expect(onChange).toHaveBeenCalledWith({ inventory: 'generous' });
	});

	it('fires onChange with { service: "highTouch" } when the service select changes', async () => {
		expect.assertions(1);
		const onChange = vi.fn();

		renderPolicyPanel({ onChange });

		await page.getByLabelText('Service').selectOptions('highTouch');

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

		await expect.element(page.getByLabelText('Pricing')).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		expect(onChange).not.toHaveBeenCalled();
	});

	it('disables selects without rendering a reason when canUpdate is false and no disabledReason is supplied', async () => {
		expect.assertions(3);
		const onChange = vi.fn();
		renderPolicyPanel({ onChange, canUpdate: false });

		await expect.element(page.getByLabelText('Pricing')).toBeDisabled();
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
		const select = await page.getByLabelText('Pricing').element();
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onChange).not.toHaveBeenCalled();
	});
});
