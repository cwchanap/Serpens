import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { GameAlert } from '$lib/game/alerts';
import type { CashRecoveryPlan } from '$lib/game/cashRecovery';
import { createI18n } from '$lib/i18n';
import CashRecoveryGuidance from './CashRecoveryGuidance.svelte';

const i18n = createI18n('en');

const runwayAlert: GameAlert = { id: 'lowCashRunway', kind: 'lowCashRunway' };
const stockAlert: GameAlert = { id: 'store-stock:store-1', kind: 'store-stock' };

const fullPlan: CashRecoveryPlan = {
	alert: runwayAlert,
	steps: [
		{ kind: 'restock', alert: stockAlert },
		{ kind: 'finance', alert: runwayAlert },
		{ kind: 'release-idle-staff', count: 2 },
		{ kind: 'pause-routes', count: 1 }
	]
};

describe('CashRecoveryGuidance card', () => {
	it('lists every step with its label and makes the first one primary', async () => {
		expect.assertions(7);
		render(CashRecoveryGuidance, { plan: fullPlan, i18n, onStep: vi.fn() });

		await expect.element(page.getByRole('heading', { name: 'Cash recovery' })).toBeVisible();
		await expect
			.element(page.getByText('Cash is running out. These steps can stop the slide:'))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Restock empty shelves' })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Borrow or refinance in Finance' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Release 2 idle staff members' }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Pause 1 active route' })).toBeVisible();
		expect(
			page.getByTestId('cash-recovery-step-restock').element().classList.contains('btn-primary')
		).toBe(true);
	});

	it('uses singular and payroll copy for the smaller plan', async () => {
		expect.assertions(2);
		render(CashRecoveryGuidance, {
			plan: {
				alert: runwayAlert,
				steps: [
					{ kind: 'finance', alert: runwayAlert },
					{ kind: 'release-idle-staff', count: 1 }
				]
			},
			i18n,
			onStep: vi.fn()
		});

		await expect
			.element(page.getByRole('button', { name: 'Release 1 idle staff member' }))
			.toBeVisible();

		const { unmount } = render(CashRecoveryGuidance, {
			plan: { alert: runwayAlert, steps: [{ kind: 'review-payroll' }] },
			i18n,
			onStep: vi.fn()
		});
		await expect.element(page.getByRole('button', { name: 'Cut payroll in Staff' })).toBeVisible();
		await unmount();
	});

	it('passes the clicked step to onStep', async () => {
		expect.assertions(2);
		const onStep = vi.fn();
		render(CashRecoveryGuidance, { plan: fullPlan, i18n, onStep });

		await page.getByTestId('cash-recovery-step-release-idle-staff').click();

		expect(onStep).toHaveBeenCalledTimes(1);
		expect(onStep).toHaveBeenCalledWith({ kind: 'release-idle-staff', count: 2 });
	});

	it('renders Dismiss only when onDismiss is supplied', async () => {
		expect.assertions(3);
		const onDismiss = vi.fn();
		const dismissible = render(CashRecoveryGuidance, {
			plan: fullPlan,
			i18n,
			onStep: vi.fn(),
			onDismiss
		});

		await page.getByTestId('cash-recovery-dismiss').click();
		expect(onDismiss).toHaveBeenCalledTimes(1);
		await dismissible.unmount();

		render(CashRecoveryGuidance, { plan: fullPlan, i18n, onStep: vi.fn() });
		expect(page.getByTestId('cash-recovery-dismiss').elements()).toHaveLength(0);
		expect(page.getByTestId('cash-recovery-guidance').elements()).toHaveLength(1);
	});
});
