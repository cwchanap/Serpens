import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import type { ScenarioProgressViewModel } from '$lib/i18n/scenarioCopy';
import ScenarioStatusStrip from './ScenarioStatusStrip.svelte';

const view: ScenarioProgressViewModel = {
	title: 'First Profit',
	eligibilityLabel: 'Ranked',
	dayLabel: 'Day 4 of 14',
	remainingLabel: '10 days remaining',
	requiredProgressLabel: 'Required 1 of 2',
	optionalProgressLabel: 'Optional 1 of 1',
	scoreLabel: 'Projected score 760 points',
	medalLabel: 'Projected medal Silver',
	modifierLabels: ['Import costs ×1.5'],
	riskLabels: ['Deadline: 10 days remaining'],
	required: [],
	optional: [],
	failures: [],
	deadlineLabel: null,
	announcement: 'Challenge progress updated on day 4.'
};

describe('ScenarioStatusStrip', () => {
	it('shows ranked progress, modifiers, risks, and toggles details from the keyboard', async () => {
		expect.assertions(8);
		const onToggle = vi.fn();
		render(ScenarioStatusStrip, {
			view,
			i18n: createI18n('en'),
			expanded: false,
			pending: false,
			error: null,
			onToggle,
			onRetry: vi.fn(),
			onDismissError: vi.fn()
		});

		await expect.element(page.getByText('First Profit · Ranked')).toBeVisible();
		await expect.element(page.getByText('Day 4 of 14 · 10 days remaining')).toBeVisible();
		await expect.element(page.getByText('Required 1 of 2 · Optional 1 of 1')).toBeVisible();
		await expect
			.element(page.getByText('Projected score 760 points · Projected medal Silver'))
			.toBeVisible();
		await expect.element(page.getByText('Import costs ×1.5')).toBeVisible();
		await expect.element(page.getByText('Deadline: 10 days remaining')).toBeVisible();
		const toggle = page.getByRole('button', { name: 'Show objective details' });
		(await toggle.element()).focus();
		await userEvent.keyboard('{Enter}');
		expect(onToggle).toHaveBeenCalledTimes(1);
		await expect.element(page.getByText('Challenge progress updated on day 4.')).toBeVisible();
	});

	it('announces a localized persistence error, preserves progress, and retries once', async () => {
		expect.assertions(5);
		const onRetry = vi.fn();
		const onDismissError = vi.fn();
		render(ScenarioStatusStrip, {
			view: { ...view, eligibilityLabel: 'Unranked' },
			i18n: createI18n('en'),
			expanded: true,
			pending: false,
			error: 'The challenge could not be saved.',
			onToggle: vi.fn(),
			onRetry,
			onDismissError
		});

		await expect.element(page.getByText('First Profit · Unranked')).toBeVisible();
		await expect.element(page.getByText('Required 1 of 2 · Optional 1 of 1')).toBeVisible();
		await expect.element(page.getByText('The challenge could not be saved.')).toBeVisible();
		await page.getByRole('button', { name: 'Retry' }).click();
		await page.getByRole('button', { name: 'Dismiss' }).click();
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(onDismissError).toHaveBeenCalledTimes(1);
	});

	it('omits the modifiers and risks lists when both are empty', async () => {
		expect.assertions(3);
		render(ScenarioStatusStrip, {
			view: { ...view, modifierLabels: [], riskLabels: [] },
			i18n: createI18n('en'),
			expanded: false,
			pending: false,
			error: null,
			onToggle: vi.fn(),
			onRetry: vi.fn(),
			onDismissError: vi.fn()
		});

		await expect.element(page.getByText('Import costs ×1.5')).not.toBeInTheDocument();
		await expect.element(page.getByText('Deadline: 10 days remaining')).not.toBeInTheDocument();
		// The announcement live region still renders even without modifiers/risks.
		await expect.element(page.getByText('Challenge progress updated on day 4.')).toBeVisible();
	});

	it('disables the retry and dismiss buttons while a persistence operation is pending', async () => {
		expect.assertions(2);
		render(ScenarioStatusStrip, {
			view,
			i18n: createI18n('en'),
			expanded: false,
			pending: true,
			error: 'The challenge could not be saved.',
			onToggle: vi.fn(),
			onRetry: vi.fn(),
			onDismissError: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: 'Retry' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
	});
});
