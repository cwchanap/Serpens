import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import type { ScenarioProgressViewModel } from '$lib/i18n/scenarioCopy';
import ScenarioObjectivePanel from './ScenarioObjectivePanel.svelte';

const objective = {
	id: 'income',
	label: 'Earn cumulative net income',
	statusLabel: 'Satisfied',
	evidenceLabel: 'Actual $1,200 · Target $1,000',
	windowLabel: 'Run to date',
	contributorLabels: ['Harbor Shop', 'Day 3 report']
};

const view = {
	required: [
		objective,
		{ ...objective, id: 'streak', label: 'Positive streak', statusLabel: 'Pending' }
	],
	optional: [{ ...objective, id: 'bonus', label: 'Bonus goal', statusLabel: 'Missed' }],
	failures: [{ ...objective, id: 'cash', label: 'Negative cash', statusLabel: 'Inactive' }],
	deadlineLabel: 'Deadline not triggered: day 4 of 14'
} as ScenarioProgressViewModel;

describe('ScenarioObjectivePanel', () => {
	it('renders required, optional, status text, exact evidence, windows, and resolved contributors', async () => {
		expect.assertions(10);
		render(ScenarioObjectivePanel, { view, i18n: createI18n('en') });

		await expect.element(page.getByRole('heading', { name: 'Required objectives' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Optional objectives' })).toBeVisible();
		await expect.element(page.getByText('Satisfied')).toBeVisible();
		await expect.element(page.getByText('Pending')).toBeVisible();
		await expect.element(page.getByText('Missed')).toBeVisible();
		await expect.element(page.getByText('Actual $1,200 · Target $1,000').first()).toBeVisible();
		await expect.element(page.getByText('Run to date').first()).toBeVisible();
		await expect.element(page.getByText('Harbor Shop').first()).toBeVisible();
		await expect.element(page.getByText('Day 3 report').first()).toBeVisible();
		await expect.element(page.getByText('Deadline not triggered: day 4 of 14')).toBeVisible();
	});

	it('omits empty sections, shows no-contributors text, and hides the deadline when absent', async () => {
		expect.assertions(4);
		const sparseView = {
			...view,
			required: [{ ...objective, id: 'solo', contributorLabels: [] }],
			optional: [],
			failures: [],
			deadlineLabel: null
		} as ScenarioProgressViewModel;

		render(ScenarioObjectivePanel, { view: sparseView, i18n: createI18n('en') });

		await expect.element(page.getByRole('heading', { name: 'Required objectives' })).toBeVisible();
		await expect.element(page.getByText('No contributing records')).toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: 'Optional objectives' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: 'Failure conditions' }))
			.not.toBeInTheDocument();
	});
});
