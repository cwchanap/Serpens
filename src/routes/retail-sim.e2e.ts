import { expect, test } from '@playwright/test';

async function clickMapTile(page: import('@playwright/test').Page, x: number, y: number) {
	const canvas = page.locator('.map-canvas canvas');
	await expect(canvas).toBeVisible();
	await expect(canvas).toHaveAttribute('data-store-sprite-count', /\d+/);
	await expect(canvas).toHaveAttribute('data-terrain-asset-mode', /^(fallback|image|mixed)$/);
	const box = await canvas.boundingBox();

	if (!box) {
		throw new Error('Map canvas has no bounding box');
	}

	const tileSize = 32;
	await page.mouse.click(box.x + x * tileSize + tileSize / 2, box.y + y * tileSize + tileSize / 2);
}

async function expectTerrainAssets(page: import('@playwright/test').Page) {
	const canvas = page.locator('.map-canvas canvas');
	await expect(canvas).toHaveAttribute('data-terrain-asset-mode', 'image');

	const baseCount = Number(await canvas.getAttribute('data-terrain-base-sprite-count'));
	const featureCount = Number(await canvas.getAttribute('data-terrain-feature-sprite-count'));
	const decorationCount = Number(await canvas.getAttribute('data-terrain-decoration-sprite-count'));

	expect(baseCount).toBe(400);
	expect(featureCount).toBe(52);
	expect(decorationCount).toBeGreaterThan(0);
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
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
	await expect(mapCanvas).toHaveAttribute('data-store-marker-mode', 'image');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');

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

test('city map renders terrain assets and blocks road and river placement', async ({ page }) => {
	await page.goto('/');

	await expectTerrainAssets(page);

	await clickMapTile(page, 10, 1);
	const roadDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(roadDialog).toBeVisible();
	await expect(roadDialog.getByText(/road location/i).first()).toBeVisible();
	await expect(roadDialog.getByRole('button', { name: /open .* here/i }).first()).toBeDisabled();
	await page.getByRole('button', { name: /close tile inspector/i }).click();

	await clickMapTile(page, 5, 1);
	const riverDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(riverDialog).toBeVisible();
	await expect(riverDialog.getByText(/river location/i).first()).toBeVisible();
	await expect(riverDialog.getByRole('button', { name: /open .* here/i }).first()).toBeDisabled();
});

test('player can confirm a founding store from a narrow viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 700 });
	await page.goto('/');

	await clickMapTile(page, 1, 1);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
	await expectOverlayToCoverMap(page);
	await expect(page.getByRole('button', { name: /open .* here/i }).first()).toBeVisible();

	const mapCanvas = page.locator('.map-canvas canvas');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '0');
	await chooseStoreType(page, /open boutique goods here/i);

	await expect(mapCanvas).toHaveAttribute('data-store-marker-mode', 'image');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');
	await expect(page.getByText(/\$[0-9,]+ cash/i)).toBeVisible();
});

async function expectOverlayToCoverMap(page: import('@playwright/test').Page) {
	const canvas = page.locator('.map-canvas canvas');
	const overlay = page.getByRole('dialog', { name: /tile details/i });
	const [canvasBox, overlayBox] = await Promise.all([canvas.boundingBox(), overlay.boundingBox()]);

	if (!canvasBox || !overlayBox) {
		throw new Error('Map canvas or tile details overlay has no bounding box');
	}

	expect(overlayBox.y).toBeLessThan(canvasBox.y + canvasBox.height);
}

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

test('hire and assign named staff from the Control Tower', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 1);
	await chooseStoreType(page, /open boutique goods here/i);
	await openControlTower(page);

	const controlTower = page.getByRole('dialog', { name: /control tower/i });
	await expect(controlTower.getByRole('heading', { name: 'Staff' })).toBeVisible();
	await expect(controlTower.getByText('Boutique Goods: 1/1 managers, 2/2 general')).toBeVisible();

	const staffPanel = controlTower.getByRole('region', { name: 'Staff' });
	const candidatesSection = staffPanel.getByRole('region', { name: 'Candidates' });
	const generalCandidate = candidatesSection
		.locator('article')
		.filter({ has: page.getByText('General', { exact: true }) })
		.first();
	await expect(generalCandidate).toBeVisible();
	const candidateName = (await generalCandidate.getByRole('heading', { level: 4 }).innerText()).trim();
	const candidateNamePattern = escapeRegExp(candidateName);

	await generalCandidate
		.getByRole('button', { name: new RegExp(`^Hire ${candidateNamePattern},`) })
		.click();
	await staffPanel
		.getByRole('region', { name: 'Unassigned' })
		.getByLabel(new RegExp(`^Assign ${candidateNamePattern},`))
		.selectOption({ label: 'Boutique Goods' });

	await expect(controlTower.getByText('Boutique Goods: 1/1 managers, 3/2 general')).toBeVisible();
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

	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);

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
