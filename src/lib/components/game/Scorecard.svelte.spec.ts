import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Scorecard from './Scorecard.svelte';
import { createI18n } from '$lib/i18n';
import type { Scorecard as ScorecardData } from '$lib/game/types';

const sampleScorecard: ScorecardData = {
	profit: 75,
	customerSatisfaction: 60,
	staffMorale: 90,
	marketPosition: 45
};

describe('Scorecard', () => {
	it('renders the heading', async () => {
		expect.assertions(1);

		render(Scorecard, { i18n: createI18n('en'), scorecard: sampleScorecard });

		await expect.element(page.getByRole('heading', { name: 'Scorecard' })).toBeVisible();
	});

	it('renders four meter elements with correct values', async () => {
		expect.assertions(4);

		render(Scorecard, { i18n: createI18n('en'), scorecard: sampleScorecard });

		const meters = page.getByRole('meter');

		await expect.element(meters.nth(0)).toHaveAttribute('value', '75');
		await expect.element(meters.nth(1)).toHaveAttribute('value', '60');
		await expect.element(meters.nth(2)).toHaveAttribute('value', '90');
		await expect.element(meters.nth(3)).toHaveAttribute('value', '45');
	});

	it('renders the four labels', async () => {
		expect.assertions(4);

		render(Scorecard, { i18n: createI18n('en'), scorecard: sampleScorecard });

		await expect.element(page.getByText('Profit')).toBeVisible();
		await expect.element(page.getByText('Customer Satisfaction')).toBeVisible();
		await expect.element(page.getByText('Staff Morale')).toBeVisible();
		await expect.element(page.getByText('Market Position')).toBeVisible();
	});

	it('displays meter elements with correct aria-labels', async () => {
		expect.assertions(4);

		render(Scorecard, { i18n: createI18n('en'), scorecard: sampleScorecard });

		await expect.element(page.getByRole('meter', { name: 'Profit' })).toBeVisible();
		await expect.element(page.getByRole('meter', { name: 'Customer Satisfaction' })).toBeVisible();
		await expect.element(page.getByRole('meter', { name: 'Staff Morale' })).toBeVisible();
		await expect.element(page.getByRole('meter', { name: 'Market Position' })).toBeVisible();
	});

	it('updates rendered values when scorecard prop changes', async () => {
		expect.assertions(4);

		const lowScorecard: ScorecardData = {
			profit: 10,
			customerSatisfaction: 20,
			staffMorale: 30,
			marketPosition: 40
		};
		const highScorecard: ScorecardData = {
			profit: 95,
			customerSatisfaction: 80,
			staffMorale: 70,
			marketPosition: 85
		};

		const view = render(Scorecard, { i18n: createI18n('en'), scorecard: lowScorecard });

		const profitMeter = page.getByRole('meter', { name: 'Profit' });
		const marketMeter = page.getByRole('meter', { name: 'Market Position' });

		await expect.element(profitMeter).toHaveAttribute('value', '10');
		await expect.element(marketMeter).toHaveAttribute('value', '40');

		view.rerender({ i18n: createI18n('en'), scorecard: highScorecard });

		await expect.element(profitMeter).toHaveAttribute('value', '95');
		await expect.element(marketMeter).toHaveAttribute('value', '85');
	});
});
