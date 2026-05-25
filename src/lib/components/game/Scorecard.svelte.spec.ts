import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Scorecard from './Scorecard.svelte';
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

		render(Scorecard, { scorecard: sampleScorecard });

		await expect.element(page.getByRole('heading', { name: 'Scorecard' })).toBeVisible();
	});

	it('renders four meter elements with correct values', async () => {
		expect.assertions(4);

		render(Scorecard, { scorecard: sampleScorecard });

		const meters = page.getByRole('meter');

		await expect.element(meters.nth(0)).toHaveAttribute('value', '75');
		await expect.element(meters.nth(1)).toHaveAttribute('value', '60');
		await expect.element(meters.nth(2)).toHaveAttribute('value', '90');
		await expect.element(meters.nth(3)).toHaveAttribute('value', '45');
	});

	it('renders the four labels', async () => {
		expect.assertions(4);

		render(Scorecard, { scorecard: sampleScorecard });

		await expect.element(page.getByText('Profit')).toBeVisible();
		await expect.element(page.getByText('Customers')).toBeVisible();
		await expect.element(page.getByText('Staff')).toBeVisible();
		await expect.element(page.getByText('Market')).toBeVisible();
	});

	it('displays meter elements with correct aria-labels', async () => {
		expect.assertions(4);

		render(Scorecard, { scorecard: sampleScorecard });

		await expect.element(page.getByRole('meter', { name: 'Profit' })).toBeVisible();
		await expect.element(page.getByRole('meter', { name: 'Customers' })).toBeVisible();
		await expect.element(page.getByRole('meter', { name: 'Staff' })).toBeVisible();
		await expect.element(page.getByRole('meter', { name: 'Market' })).toBeVisible();
	});

	it('reflects updated values when scorecard changes', async () => {
		expect.assertions(2);

		const lowScorecard: ScorecardData = {
			profit: 10,
			customerSatisfaction: 20,
			staffMorale: 30,
			marketPosition: 40
		};

		render(Scorecard, { scorecard: lowScorecard });

		const profitMeter = page.getByRole('meter', { name: 'Profit' });
		const marketMeter = page.getByRole('meter', { name: 'Market' });

		await expect.element(profitMeter).toHaveAttribute('value', '10');
		await expect.element(marketMeter).toHaveAttribute('value', '40');
	});
});
