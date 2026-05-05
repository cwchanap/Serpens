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

async function openControlTower(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: /views/i }).click();
	await page.getByRole('menuitem', { name: /control tower/i }).click();
	await expect(page.getByRole('dialog', { name: /control tower/i })).toBeVisible();
}

async function chooseStoreType(page: import('@playwright/test').Page, storeTypeName: RegExp) {
	await page.getByRole('button', { name: storeTypeName }).first().click();
	const confirmDialog = page.getByRole('dialog', { name: /confirm store opening/i });
	await expect(confirmDialog).toBeVisible();
	await confirmDialog.getByRole('button', { name: /confirm opening/i }).click();
}

test('player can found a store from the city map and advance a day', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText(/harbor city/i)).toBeVisible();
	await expect(page.getByRole('button', { name: /select tile/i })).toHaveCount(0);
	await clickMapTile(page, 1, 1);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
	const mapCanvas = page.locator('.map-canvas canvas');
	await expect(page.getByText(/store type/i)).toBeVisible();
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '0');
	await page.getByRole('button', { name: /open boutique goods here/i }).click();
	const confirmDialog = page.getByRole('dialog', { name: /confirm store opening/i });
	await expect(confirmDialog).toBeVisible();
	await expect(
		confirmDialog.getByRole('img', { name: /anime-style boutique storefront for an owned shop/i })
	).toBeVisible();
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '0');
	await confirmDialog.getByRole('button', { name: /confirm opening/i }).click();
	await expect(mapCanvas).toHaveAttribute('data-store-marker-mode', 'image');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');
	await expect(
		page.getByRole('img', { name: /anime-style boutique storefront for an owned shop/i })
	).toBeVisible();

	await expect(page.getByRole('heading', { name: /scorecard/i })).toHaveCount(0);
	await openControlTower(page);
	const controlTower = page.getByRole('dialog', { name: /control tower/i });
	const controlTowerStatus = controlTower.getByRole('group', { name: /control tower status/i });

	await expect(controlTower.getByRole('heading', { name: /scorecard/i })).toBeVisible();
	await expect(controlTowerStatus.getByText(/^Day 1$/i)).toBeVisible();

	await controlTower.getByLabel(/pricing/i).selectOption('premium');
	await controlTower.getByRole('button', { name: /advance day/i }).click();

	await expect(controlTowerStatus.getByText(/^Day 2$/i)).toBeVisible();
	await expect(controlTower.getByText(/latest daily result/i)).toBeVisible();
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

test('control tower opens from the map views menu and closes as an overlay', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 1);
	await chooseStoreType(page, /open .* here/i);

	await openControlTower(page);
	await page.getByRole('button', { name: /close control tower/i }).click();
	await expect(page.getByRole('dialog', { name: /control tower/i })).toHaveCount(0);

	await openControlTower(page);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /control tower/i })).toHaveCount(0);
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
	await chooseStoreType(page, /open .* here/i);

	await clickMapTile(page, 2, 1);
	await expect(page.getByText(/store type/i)).toBeVisible();
	const mapCanvas = page.locator('.map-canvas canvas');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');
	await page.getByRole('button', { name: /open electronics & games here/i }).click();
	const confirmDialog = page.getByRole('dialog', { name: /confirm store opening/i });
	await expect(confirmDialog).toBeVisible();
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');
	await confirmDialog.getByRole('button', { name: /confirm opening/i }).click();

	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
	await expect(
		page.getByLabel('Store details').getByRole('heading', { name: 'Store #2', exact: true })
	).toBeVisible();
	await expect(page.getByLabel('Store details').getByText(/\(2, 1\)/)).toBeVisible();
	await expect(
		page.getByRole('img', {
			name: /anime-style electronics and games storefront for an owned shop/i
		})
	).toBeVisible();

	await openControlTower(page);
	const controlTower = page.getByRole('dialog', { name: /control tower/i });
	await expect(
		controlTower.getByLabel('Stores').getByRole('heading', { name: 'Store #2', exact: true })
	).toBeVisible();
});

test('player can save to a manual slot and load it after reload', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 1);
	await chooseStoreType(page, /open .* here/i);
	await page.getByRole('button', { name: /saves/i }).click();
	await expect(page.getByRole('dialog', { name: /saves/i })).toBeVisible();
	await expect(page.getByText(/Day 1 · 1 stores/i)).toBeVisible();

	await page.getByRole('textbox', { name: /slot name/i }).fill('Harbor test');
	await page.getByRole('button', { name: /save slot/i }).click();
	await expect(page.getByText(/Saved Harbor test/i)).toBeVisible();
	await page.getByRole('button', { name: /close saves/i }).click();

	await page.reload();
	await page.getByRole('button', { name: /saves/i }).click();
	await expect(page.getByRole('heading', { name: /Harbor test/i })).toBeVisible();
	await page.getByRole('button', { name: /^Load$/i }).click();
	await expect(page.locator('.map-canvas canvas')).toHaveAttribute('data-store-sprite-count', '1');
	await expect(page.getByText(/Loaded Harbor test/i)).toBeVisible();
});
