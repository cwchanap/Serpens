import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import type { ScenarioResultsViewModel } from '$lib/i18n/scenarioCopy';
import ScenarioResultsDialog from './ScenarioResultsDialog.svelte';

const view: ScenarioResultsViewModel = {
	title: 'First Profit',
	outcomeLabel: 'Challenge completed',
	scoreLabel: '880 points',
	medalLabel: 'Silver',
	bestLabel: 'New best recorded',
	nextMedalLabel: '20 points to Gold',
	required: [
		{
			id: 'income',
			label: 'Earn cumulative net income',
			statusLabel: 'Satisfied',
			evidenceLabel: 'Actual $1,200 · Target $1,000',
			windowLabel: 'Run to date',
			contributorLabels: ['Harbor Shop']
		}
	],
	optional: [],
	failures: [],
	deadlineLabel: 'Deadline not triggered: day 8 of 14',
	announcement: 'Challenge completed with 880 points.'
};

describe('ScenarioResultsDialog', () => {
	it('shows committed completion, best, next medal, all evidence, and actions', async () => {
		expect.assertions(10);
		const onRestart = vi.fn();
		const onCatalog = vi.fn();
		const onSandbox = vi.fn();
		render(ScenarioResultsDialog, {
			view,
			i18n: createI18n('en'),
			pending: false,
			onRestart,
			onCatalog,
			onSandbox,
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('dialog', { name: 'Challenge results' })).toBeVisible();
		await expect.element(page.getByText('Challenge completed', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Silver · 880 points')).toBeVisible();
		await expect.element(page.getByText('New best recorded')).toBeVisible();
		await expect.element(page.getByText('20 points to Gold')).toBeVisible();
		await expect.element(page.getByText('Actual $1,200 · Target $1,000')).toBeVisible();
		await expect.element(page.getByText('Deadline not triggered: day 8 of 14')).toBeVisible();
		await page.getByRole('button', { name: 'Restart challenge' }).click();
		await page.getByRole('button', { name: 'Challenge catalog' }).click();
		await page.getByRole('button', { name: 'Return to sandbox' }).click();
		expect(onRestart).toHaveBeenCalledOnce();
		expect(onCatalog).toHaveBeenCalledOnce();
		expect(onSandbox).toHaveBeenCalledOnce();
	});

	it('shows failed evidence and restores focus after Escape closes the dialog', async () => {
		expect.assertions(5);
		const opener = document.createElement('button');
		opener.textContent = 'Advance day';
		document.body.append(opener);
		opener.focus();
		const onClose = vi.fn();
		const { unmount } = render(ScenarioResultsDialog, {
			view: {
				...view,
				outcomeLabel: 'Challenge failed',
				medalLabel: 'No medal',
				bestLabel: 'Best unchanged',
				nextMedalLabel: null,
				failures: [
					{
						...view.required[0]!,
						id: 'negative-cash',
						label: 'Avoid negative cash',
						statusLabel: 'Triggered',
						evidenceLabel: 'Actual -$20 · Target $0'
					}
				],
				deadlineLabel: 'Deadline triggered on day 14'
			},
			i18n: createI18n('en'),
			pending: false,
			onRestart: vi.fn(),
			onCatalog: vi.fn(),
			onSandbox: vi.fn(),
			onClose
		});

		await expect.element(page.getByText('Challenge failed', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Triggered', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Deadline triggered on day 14')).toBeVisible();
		(document.activeElement as HTMLElement).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		);
		expect(onClose).toHaveBeenCalledOnce();
		await unmount();
		expect(document.activeElement).toBe(opener);
		opener.remove();
	});
});
