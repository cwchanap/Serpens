import { expect, test } from '@playwright/test';

test('player can start a business and advance a day', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: /electronics & games/i }).click();
	await expect(page.getByText(/control tower/i)).toBeVisible();
	await expect(page.getByRole('heading', { name: /day 1/i })).toBeVisible();

	await page.getByLabel(/pricing/i).selectOption('premium');
	await page.getByRole('button', { name: /advance day/i }).click();

	await expect(page.getByRole('heading', { name: /day 2/i })).toBeVisible();
	await expect(page.getByText(/latest daily result/i)).toBeVisible();
});
