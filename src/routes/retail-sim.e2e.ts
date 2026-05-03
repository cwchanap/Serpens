import { expect, test } from '@playwright/test';

async function clickMapTile(page: import('@playwright/test').Page, x: number, y: number) {
	const canvas = page.locator('.map-canvas canvas');
	await expect(canvas).toBeVisible();
	const box = await canvas.boundingBox();

	if (!box) {
		throw new Error('Map canvas has no bounding box');
	}

	const tileSize = 32;
	await page.mouse.click(box.x + x * tileSize + tileSize / 2, box.y + y * tileSize + tileSize / 2);
}

test('player can found a store from the city map and advance a day', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText(/harbor city/i)).toBeVisible();
	await expect(page.getByRole('button', { name: /select tile/i })).toHaveCount(0);
	await clickMapTile(page, 1, 1);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
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

test('tile popup can be closed from the map', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 1);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();

	await page.getByRole('button', { name: /close tile inspector/i }).click();
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);

	await clickMapTile(page, 1, 1);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
});

test('locked map tiles still show inspector feedback', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText(/harbor city/i)).toBeVisible();
	await clickMapTile(page, 0, 0);

	await expect(page.getByRole('heading', { name: /tile 0, 0/i })).toBeVisible();
	await expect(page.getByText(/locked location/i)).toBeVisible();
});

test('player expands from a selected city tile', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 1);
	await page
		.getByRole('button', { name: /open .* here/i })
		.first()
		.click();

	await clickMapTile(page, 2, 1);
	await page.getByRole('button', { name: /open store here/i }).click();

	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
	await expect(
		page.getByLabel('Store details').getByRole('heading', { name: 'Store #2', exact: true })
	).toBeVisible();
	await expect(page.getByLabel('Store details').getByText(/\(2, 1\)/)).toBeVisible();
	await expect(
		page.getByLabel('Stores').getByRole('heading', { name: 'Store #2', exact: true })
	).toBeVisible();
});
