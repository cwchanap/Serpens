import { expect, test } from '@playwright/test';

test('player can found a store from the city map and advance a day', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText(/harbor city/i)).toBeVisible();
	await page.getByRole('button', { name: 'Select tile 1, 1', exact: true }).click();
	await expect(page.getByText(/recommended/i)).toBeVisible();
	await page
		.getByRole('button', { name: /open .* here/i })
		.first()
		.click();

	await expect(page.getByRole('heading', { name: /scorecard/i })).toBeVisible();
	await expect(page.getByText(/^Day 1$/i)).toBeVisible();

	await page.getByLabel(/pricing/i).selectOption('premium');
	await page.getByRole('button', { name: /advance day/i }).click();

	await expect(page.getByText(/^Day 2$/i)).toBeVisible();
	await expect(page.getByText(/latest daily result/i)).toBeVisible();
});

test('player expands from a selected city tile', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Select tile 1, 1', exact: true }).click();
	await page
		.getByRole('button', { name: /open .* here/i })
		.first()
		.click();

	await page.getByRole('button', { name: 'Select tile 2, 1', exact: true }).click();
	await page.getByRole('button', { name: /open store here/i }).click();

	await expect(
		page.getByLabel('Store details').getByRole('heading', { name: 'Store #2', exact: true })
	).toBeVisible();
	await expect(page.getByLabel('Store details').getByText(/\(2, 1\)/)).toBeVisible();
	await expect(
		page.getByLabel('Stores').getByRole('heading', { name: 'Store #2', exact: true })
	).toBeVisible();
});
