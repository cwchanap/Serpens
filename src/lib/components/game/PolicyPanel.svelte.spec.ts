import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PolicyPanel from './PolicyPanel.svelte';
import type { CompanyPolicy } from '$lib/game/types';

const defaultPolicy: CompanyPolicy = {
	pricing: 'competitive',
	inventory: 'balanced',
	staffing: 'efficient',
	marketing: 'awareness',
	service: 'balanced'
};

function renderPolicyPanel(overrides: Partial<{ policy: CompanyPolicy; onChange: (patch: Partial<CompanyPolicy>) => void }> = {}) {
	const props = {
		policy: defaultPolicy,
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
});
