import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { GameAlert } from '$lib/game/alerts';
import type { OpeningGuidance } from '$lib/game/openingGuidance';
import { createI18n } from '$lib/i18n';
import OpeningGuidanceCard from './OpeningGuidance.svelte';

const i18n = createI18n('en');

const missedLoanAlert: GameAlert = { id: 'alert-loan', kind: 'missedLoanPayment' };
const stockAlert: GameAlert = { id: 'alert-stock', kind: 'store-stock' };

const hints: Record<OpeningGuidance['kind'], OpeningGuidance> = {
	'cash-risk': { kind: 'cash-risk', alert: missedLoanAlert },
	'stock-recovery': { kind: 'stock-recovery', alert: stockAlert },
	'first-result': { kind: 'first-result' },
	'result-evidence': { kind: 'result-evidence' }
};

const expectedCopy: Record<OpeningGuidance['kind'], { reason: string; action: string }> = {
	'cash-risk': {
		reason: 'A payment was missed or cash runway is short — handle it today.',
		action: 'Open Finance'
	},
	'stock-recovery': {
		reason: 'A shelf is short on stock — restock it to keep selling.',
		action: 'Open store'
	},
	'first-result': {
		reason: 'Complete a day to create your first evidence.',
		action: 'Open Dashboard'
	},
	'result-evidence': {
		reason: 'Inspect the latest completed result on the Dashboard.',
		action: 'Open Dashboard'
	}
};

describe('OpeningGuidance card', () => {
	it('shows the matching reason and action label for every hint kind', async () => {
		const kinds = Object.keys(hints) as OpeningGuidance['kind'][];
		expect.assertions(kinds.length * 3);

		for (const kind of kinds) {
			const { unmount } = render(OpeningGuidanceCard, {
				hint: hints[kind],
				i18n,
				onAction: vi.fn()
			});

			await expect.element(page.getByRole('heading', { name: 'Opening guidance' })).toBeVisible();
			await expect.element(page.getByText(expectedCopy[kind].reason)).toBeVisible();
			await expect
				.element(page.getByRole('button', { name: expectedCopy[kind].action }))
				.toBeVisible();
			await unmount();
		}
	});

	it('invokes onAction exactly once with the displayed hint', async () => {
		expect.assertions(2);
		const onAction = vi.fn();
		render(OpeningGuidanceCard, { hint: hints['result-evidence'], i18n, onAction });

		await page.getByTestId('opening-guidance-action').click();

		expect(onAction).toHaveBeenCalledTimes(1);
		expect(onAction).toHaveBeenCalledWith(hints['result-evidence']);
	});

	it('renders the Dismiss button only when onDismiss is supplied', async () => {
		expect.assertions(2);
		const onAction = vi.fn();
		const dismissible = render(OpeningGuidanceCard, {
			hint: hints['first-result'],
			i18n,
			onAction,
			onDismiss: vi.fn()
		});
		await expect.element(page.getByRole('button', { name: 'Dismiss' })).toBeVisible();
		await dismissible.unmount();

		render(OpeningGuidanceCard, { hint: hints['first-result'], i18n, onAction });

		expect(page.getByTestId('opening-guidance-dismiss').elements()).toHaveLength(0);
	});

	it('invokes onDismiss exactly once and leaves onAction untouched', async () => {
		expect.assertions(2);
		const onAction = vi.fn();
		const onDismiss = vi.fn();
		render(OpeningGuidanceCard, {
			hint: hints['cash-risk'],
			i18n,
			onAction,
			onDismiss
		});

		await page.getByTestId('opening-guidance-dismiss').click();

		expect(onDismiss).toHaveBeenCalledTimes(1);
		expect(onAction).not.toHaveBeenCalled();
	});

	it('keeps both buttons as keyboard-reachable native controls', async () => {
		expect.assertions(4);
		const onAction = vi.fn();
		const onDismiss = vi.fn();
		render(OpeningGuidanceCard, {
			hint: hints['stock-recovery'],
			i18n,
			onAction,
			onDismiss
		});

		const action = page.getByRole('button', { name: 'Open store' });
		const dismiss = page.getByRole('button', { name: 'Dismiss' });
		await expect.element(action).toBeVisible();
		await expect.element(dismiss).toBeVisible();

		(await action.element()).focus();
		await userEvent.keyboard('{Enter}');
		(await dismiss.element()).focus();
		await userEvent.keyboard('{Enter}');

		expect(onAction).toHaveBeenCalledTimes(1);
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it('does not steal focus when mounted', async () => {
		expect.assertions(2);
		render(OpeningGuidanceCard, {
			hint: hints['first-result'],
			i18n,
			onAction: vi.fn(),
			onDismiss: vi.fn()
		});

		await expect.element(page.getByTestId('opening-guidance')).toBeVisible();
		expect(document.activeElement).toBe(document.body);
	});

	it('renders exactly one primary action and leaves Dismiss secondary', async () => {
		expect.assertions(3);
		render(OpeningGuidanceCard, {
			hint: hints['cash-risk'],
			i18n,
			onAction: vi.fn(),
			onDismiss: vi.fn()
		});

		expect(page.getByTestId('opening-guidance-action').elements()).toHaveLength(1);
		const card = document.querySelector('[data-testid="opening-guidance"]');
		expect(card?.querySelectorAll('.btn-primary')).toHaveLength(1);
		expect(
			page.getByTestId('opening-guidance-dismiss').element().classList.contains('btn-primary')
		).toBe(false);
	});
});
