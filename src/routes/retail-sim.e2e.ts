import { expect, test, type Locator, type Page } from '@playwright/test';

interface SavedMaterialMovement {
	materialId: string;
	quantity: number;
	value: number;
	source: string;
}

interface SavedProductReport {
	categoryId: string;
	name: string;
	unitsSold: number;
	endingStock: number;
	warehouseUnits: number;
	warehouseValue: number;
	importedUnits: number;
	importCost: number;
	importSpend: number;
}

interface SavedDailyReport {
	day: number;
	importSpend: number;
	productionReport: {
		produced: SavedMaterialMovement[];
		warehousePulls: SavedMaterialMovement[];
		shopImports: SavedMaterialMovement[];
		importSpend: number;
	};
	storeReports: Array<{
		storeId: string;
		importSpend: number;
		productReports: SavedProductReport[];
	}>;
}

interface SavedGame {
	day: number;
	stores: Array<{
		id: string;
		products: Array<{
			categoryId: string;
			stock: number;
			reorderThreshold: number;
			targetStock: number;
		}>;
	}>;
	warehouse: {
		materials: Record<string, number | undefined>;
	};
	reports: SavedDailyReport[];
}

interface SavedSnapshot {
	autoSave: {
		game: SavedGame;
	} | null;
}

async function clickMapTile(page: Page, x: number, y: number) {
	const canvas = await expectRetailMapReady(page);
	await clickCanvasTile(page, canvas, x, y);
}

async function expectRetailMapReady(page: Page): Promise<Locator> {
	const canvas = page.locator('.map-canvas canvas');
	await expect(canvas).toBeVisible();
	await expect(canvas).toHaveAttribute('data-store-sprite-count', /\d+/);
	await expect(canvas).toHaveAttribute('data-terrain-asset-mode', /^(fallback|image|mixed)$/);
	await expectMapCameraReady(canvas);

	return canvas;
}

async function expectIndustryMapReady(page: Page): Promise<Locator> {
	const canvas = page.locator('.map-canvas canvas');
	await expect(canvas).toBeVisible();
	await expect(canvas).toHaveAttribute('data-industry-resource-count', /\d+/);
	await expect(canvas).toHaveAttribute('data-industry-building-count', /\d+/);
	await expect(canvas).toHaveAttribute('data-industry-terrain-asset-mode', 'image');
	await expect(canvas).toHaveAttribute('data-industry-terrain-sprite-count', /^[1-9]\d*$/);
	await expectMapCameraReady(canvas);

	return canvas;
}

async function expectMapCameraReady(canvas: Locator) {
	await expect(canvas).toHaveAttribute('data-map-tile-size', /\d+/);
	await expect(canvas).toHaveAttribute('data-map-zoom', /\d+/);
	await expect(canvas).toHaveAttribute('data-map-scroll-x', /-?\d+/);
	await expect(canvas).toHaveAttribute('data-map-scroll-y', /-?\d+/);
	await expect(canvas).toHaveAttribute('data-map-view-x', /-?\d+/);
	await expect(canvas).toHaveAttribute('data-map-view-y', /-?\d+/);
	await expect(canvas).toHaveAttribute('data-map-view-width', /\d+/);
	await expect(canvas).toHaveAttribute('data-map-view-height', /\d+/);
}

async function clickCanvasTile(page: Page, canvas: Locator, x: number, y: number) {
	const box = await canvas.boundingBox();

	if (!box) {
		throw new Error('Map canvas has no bounding box');
	}

	const worldTileSize = 32;
	const viewX = Number((await canvas.getAttribute('data-map-view-x')) ?? 0);
	const viewY = Number((await canvas.getAttribute('data-map-view-y')) ?? 0);
	const viewWidth = Number((await canvas.getAttribute('data-map-view-width')) ?? box.width);
	const viewHeight = Number((await canvas.getAttribute('data-map-view-height')) ?? box.height);
	const clientX = box.x + ((x * worldTileSize + worldTileSize / 2 - viewX) / viewWidth) * box.width;
	const clientY =
		box.y + ((y * worldTileSize + worldTileSize / 2 - viewY) / viewHeight) * box.height;

	await page.mouse.click(clientX, clientY);
}

async function expectTerrainAssets(page: Page) {
	const canvas = page.locator('.map-canvas canvas');
	await expect(canvas).toHaveAttribute('data-terrain-asset-mode', 'image');

	const baseCount = Number(await canvas.getAttribute('data-terrain-base-sprite-count'));
	const featureCount = Number(await canvas.getAttribute('data-terrain-feature-sprite-count'));
	const decorationCount = Number(await canvas.getAttribute('data-terrain-decoration-sprite-count'));

	expect(baseCount).toBe(400);
	expect(featureCount).toBe(52);
	expect(decorationCount).toBeGreaterThan(0);
}

async function expectMapToFillViewport(page: Page) {
	const viewport = page.viewportSize();
	const map = page.locator('.map-layout');
	const box = await map.boundingBox();

	if (!viewport || !box) {
		throw new Error('Map layout or viewport has no bounding box');
	}

	expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2);
	expect(box.height).toBeGreaterThanOrEqual(viewport.height - 2);
}

async function openManagementPanel(page: Page, panelName: string | RegExp): Promise<Locator> {
	await page.getByRole('button', { name: /open menu/i }).click();
	await page.getByRole('menuitem', { name: panelName }).click();
	const panel = page.getByRole('dialog', { name: panelName });
	await expect(panel).toBeVisible();
	return panel;
}

async function openSaves(page: Page) {
	await page.getByRole('button', { name: /open menu/i }).click();
	await page.getByRole('menuitem', { name: /saves/i }).click();
	await expect(page.getByRole('dialog', { name: /saves/i })).toBeVisible();
}

async function readCompanyCash(page: Page): Promise<number> {
	const cashText = await page
		.getByRole('status', { name: /company status/i })
		.locator('strong')
		.innerText();

	return Number(cashText.replace(/[^0-9.-]/g, ''));
}

async function chooseRetailBuildTool(page: Page, storeTypeName: RegExp) {
	await page.getByRole('button', { name: /^build$/i }).click();
	const buildMenu = page.getByRole('dialog', { name: /build menu/i });
	await expect(buildMenu).toBeVisible();
	await buildMenu.getByRole('button', { name: storeTypeName }).click();
	await expect(buildMenu).toHaveCount(0);
	const canvas = page.locator('.map-canvas canvas');
	await expect(canvas).toHaveAttribute('data-placement-preview-mode', 'active');
	await expect(canvas).toHaveAttribute('data-placement-valid-tile-count', /^[1-9]\d*$/);
}

async function buildRetailStoreAt(
	page: Page,
	input: { x: number; y: number; storeTypeName: RegExp; expectedStoreCount: number }
) {
	const canvas = await expectRetailMapReady(page);
	await chooseRetailBuildTool(page, input.storeTypeName);
	await clickCanvasTile(page, canvas, input.x, input.y);
	await expect(page.getByRole('dialog', { name: /confirm store opening/i })).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
	await expect(canvas).toHaveAttribute('data-store-sprite-count', String(input.expectedStoreCount));
	await expect(canvas).toHaveAttribute('data-placement-preview-mode', 'inactive');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getStorePanelLayout(page: Page) {
	return page.locator('.store-tab-panels').evaluate((container) => {
		const readPanel = (selector: string) => {
			const panel = container.querySelector(selector);

			if (!panel) {
				throw new Error(`Missing store panel ${selector}`);
			}

			const rect = panel.getBoundingClientRect();
			const style = window.getComputedStyle(panel);
			return {
				display: style.display,
				height: rect.height
			};
		};
		const rect = container.getBoundingClientRect();

		return {
			height: rect.height,
			details: readPanel('.store-details'),
			stock: readPanel('.store-stock-panel'),
			chain: readPanel('.store-panel.store-chain-panel'),
			staff: readPanel('.store-staff-panel')
		};
	});
}

async function openMapMenuItem(page: Page, itemName: RegExp) {
	await page.getByRole('button', { name: /open menu/i }).click();
	await page.getByRole('menuitem', { name: itemName }).click();
}

async function buildIndustryBuildingAt(
	page: Page,
	canvas: Locator,
	input: { x: number; y: number; buildingName: RegExp; expectedBuildingCount: number }
) {
	await closeIndustryInspectorIfOpen(page);
	await chooseIndustryBuildTool(page, canvas, input.buildingName);
	await clickCanvasTile(page, canvas, input.x, input.y);
	await expect(page.getByRole('dialog', { name: /confirm industrial build/i })).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: /industry tile details/i })).toHaveCount(0);
	await expect(canvas).toHaveAttribute(
		'data-industry-building-count',
		String(input.expectedBuildingCount)
	);
	await expect(canvas).toHaveAttribute('data-industry-building-sprite-count', /^[1-9]\d*$/);
	await expect(canvas).toHaveAttribute('data-placement-preview-mode', 'inactive');
}

async function chooseIndustryBuildTool(page: Page, canvas: Locator, buildingName: RegExp) {
	await page.getByRole('button', { name: /^build$/i }).click();
	const buildMenu = page.getByRole('dialog', { name: /build menu/i });
	await expect(buildMenu).toBeVisible();
	await buildMenu.getByRole('button', { name: buildingName }).click();
	await expect(buildMenu).toHaveCount(0);
	await expect(canvas).toHaveAttribute('data-placement-preview-mode', 'active');
	await expect(canvas).toHaveAttribute('data-placement-valid-tile-count', /^[1-9]\d*$/);
}

async function closeIndustryInspectorIfOpen(page: Page): Promise<void> {
	const industryInspector = page.getByRole('dialog', { name: /industry tile details/i });

	if ((await industryInspector.count()) === 0) {
		return;
	}

	await industryInspector.getByRole('button', { name: /close industry tile inspector/i }).click();
	await expect(industryInspector).toHaveCount(0);
}

async function readWarehouseMaterialQuantity(page: Page, materialName: string): Promise<number> {
	const warehouseSummary = page.getByRole('region', { name: /warehouse summary/i });
	await expect(warehouseSummary).toBeVisible();
	const material = warehouseSummary
		.getByRole('list', { name: /warehouse materials/i })
		.getByText(new RegExp(`^${escapeRegExp(materialName)}:\\s+\\d+$`, 'i'));
	await expect(material).toBeVisible();

	const text = await material.innerText();
	const quantity = Number(text.match(/\d+/)?.[0] ?? Number.NaN);

	if (!Number.isFinite(quantity)) {
		throw new Error(`Could not read ${materialName} warehouse quantity from "${text}"`);
	}

	return quantity;
}

async function setStoreProductNumber(
	inspector: Locator,
	label: RegExp,
	value: number
): Promise<void> {
	const input = inspector.getByRole('spinbutton', { name: label });
	await input.fill(String(value));
	await input.blur();
	await expect(input).toHaveValue(String(value));
}

async function readAutoSaveGame(page: Page): Promise<SavedGame> {
	return page.evaluate(() => {
		const serialized = window.localStorage.getItem('serpens.saves.v2');

		if (!serialized) {
			throw new Error('Auto-save storage is empty');
		}

		const snapshot = JSON.parse(serialized) as SavedSnapshot;

		if (!snapshot.autoSave) {
			throw new Error('Auto-save record is missing');
		}

		return snapshot.autoSave.game;
	});
}

async function waitForAutoSaveDay(page: Page, day: number): Promise<SavedGame> {
	await expect.poll(async () => (await readAutoSaveGame(page)).day).toBe(day);

	return readAutoSaveGame(page);
}

async function waitForSavedProductSettings(
	page: Page,
	categoryId: string,
	expected: { day: number; reorderThreshold: number; targetStock: number }
): Promise<SavedGame> {
	await expect
		.poll(async () => {
			const game = await readAutoSaveGame(page);
			const product = getSavedProduct(game, categoryId);

			return [game.day, product.reorderThreshold, product.targetStock].join(':');
		})
		.toBe([expected.day, expected.reorderThreshold, expected.targetStock].join(':'));

	return readAutoSaveGame(page);
}

function getSavedProduct(game: SavedGame, categoryId: string) {
	const product = game.stores[0]?.products.find((item) => item.categoryId === categoryId);

	if (!product) {
		throw new Error(`Missing saved product ${categoryId}`);
	}

	return product;
}

function getLatestReport(game: SavedGame): SavedDailyReport {
	const report = game.reports.at(-1);

	if (!report) {
		throw new Error('Missing latest saved daily report');
	}

	return report;
}

function sumMaterialMovementQuantity(
	movements: SavedMaterialMovement[],
	materialId: string,
	source: string
): number {
	return movements
		.filter((movement) => movement.materialId === materialId && movement.source === source)
		.reduce((total, movement) => total + movement.quantity, 0);
}

test('player can found a store from the city map and advance a day', async ({ page }) => {
	await page.goto('/');

	await expectMapToFillViewport(page);
	await expect(page.getByText(/harbor city/i)).toBeVisible();
	await expect(page.getByRole('button', { name: /select tile/i })).toHaveCount(0);
	const mapCanvas = await expectRetailMapReady(page);
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '0');
	await chooseRetailBuildTool(page, /build boutique goods/i);
	await clickCanvasTile(page, mapCanvas, 1, 6);
	await expect(page.getByRole('dialog', { name: /confirm store opening/i })).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
	await expect(mapCanvas).toHaveAttribute('data-store-marker-mode', 'image');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');

	await expect(page.getByRole('heading', { name: /scorecard/i })).toHaveCount(0);
	const dashboard = await openManagementPanel(page, /dashboard/i);
	const dashboardStatus = dashboard.getByRole('group', { name: /dashboard status/i });

	await expect(dashboard.getByRole('heading', { name: /scorecard/i })).toBeVisible();
	await expect(dashboardStatus.getByText(/^Day 1$/i)).toBeVisible();

	await dashboard.getByRole('button', { name: /close dashboard/i }).click();
	const policies = await openManagementPanel(page, /policies/i);
	await policies.getByLabel(/pricing/i).selectOption('premium');
	await policies.getByRole('button', { name: /close policies/i }).click();
	await page.getByRole('button', { name: /^advance day$/i }).click();
	const reports = await openManagementPanel(page, /reports/i);

	await expect(
		reports.getByRole('group', { name: /reports status/i }).getByText(/^Day 2$/i)
	).toBeVisible();
	await expect(reports.getByText(/latest daily result/i)).toBeVisible();
});

test('city map renders terrain assets and blocks road and river placement', async ({ page }) => {
	await page.goto('/');

	await expectTerrainAssets(page);

	await clickMapTile(page, 10, 6);
	const roadDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(roadDialog).toBeVisible();
	await expect(roadDialog.getByText(/^Road$/i)).toBeVisible();
	await expect(roadDialog.getByRole('button', { name: /open .* here/i })).toHaveCount(0);
	await page.getByRole('button', { name: /close tile inspector/i }).click();

	await clickMapTile(page, 5, 6);
	const riverDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(riverDialog).toBeVisible();
	await expect(riverDialog.getByText(/^River$/i)).toBeVisible();
	await expect(riverDialog.getByRole('button', { name: /open .* here/i })).toHaveCount(0);
	await page.getByRole('button', { name: /close tile inspector/i }).click();

	const canvas = await expectRetailMapReady(page);
	await chooseRetailBuildTool(page, /build boutique goods/i);
	await clickCanvasTile(page, canvas, 10, 6);
	await expect(page.getByRole('status', { name: /placement status/i })).toContainText(
		/road location/i
	);
	await expect(canvas).toHaveAttribute('data-placement-preview-mode', 'active');
	await expect(canvas).toHaveAttribute('data-placement-invalid-tile-count', /^[1-9]\d*$/);
	await expect(page.getByRole('dialog', { name: /confirm store opening/i })).toHaveCount(0);
	const invalidRoadDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(invalidRoadDialog.getByRole('heading', { name: /tile 10, 6/i })).toBeVisible();
	await expect(invalidRoadDialog.getByText(/^Road$/i)).toBeVisible();
	await expect(invalidRoadDialog.getByRole('button', { name: /open .* here/i })).toHaveCount(0);
});

test('player can found a store from a narrow viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 700 });
	await page.goto('/');

	await clickMapTile(page, 6, 6);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
	await expectOverlayToCoverMap(page);
	await expect(page.getByRole('button', { name: /open .* here/i })).toHaveCount(0);
	await page.getByRole('button', { name: /close tile inspector/i }).click();
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);

	const mapCanvas = await expectRetailMapReady(page);
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '0');
	await chooseRetailBuildTool(page, /build boutique goods/i);
	await clickCanvasTile(page, mapCanvas, 6, 6);
	await expect(page.getByRole('dialog', { name: /confirm store opening/i })).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);

	await expect(mapCanvas).toHaveAttribute('data-store-marker-mode', 'image');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');
	await expect(page.locator('.map-title .status')).toContainText(/\$[0-9,]+ cash/i);
});

async function expectOverlayToCoverMap(page: Page) {
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

	await clickMapTile(page, 1, 6);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();

	await page.getByRole('button', { name: /close tile inspector/i }).click();
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);

	await clickMapTile(page, 1, 6);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
});

test('management panels open from the map menu and close as overlays', async ({ page }) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build boutique goods/i,
		expectedStoreCount: 1
	});

	const dashboard = await openManagementPanel(page, /dashboard/i);
	await dashboard.getByRole('button', { name: /close dashboard/i }).click();
	await expect(page.getByRole('dialog', { name: /dashboard/i })).toHaveCount(0);

	await openManagementPanel(page, /reports/i);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /reports/i })).toHaveCount(0);
});

test('player can switch to the industry city map and back to retail', async ({ page }) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	await page.getByRole('button', { name: /open menu/i }).click();
	await page.getByRole('menuitem', { name: /industry city map/i }).click();
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	const industryCanvas = await expectIndustryMapReady(page);
	const resourceCount = Number(await industryCanvas.getAttribute('data-industry-resource-count'));
	expect(resourceCount).toBeGreaterThan(0);

	const industryInspector = page.getByRole('dialog', { name: /industry tile details/i });

	await clickCanvasTile(page, industryCanvas, 9, 6);
	await expect(
		industryInspector.getByRole('heading', { name: /industry tile 9, 6/i })
	).toBeVisible();
	await expect(industryInspector.getByText(/^Industrial$/i).first()).toBeVisible();
	await expect(
		industryInspector.getByRole('region', { name: /industry tile stats/i })
	).toBeVisible();
	await expect(industryInspector.getByRole('button', { name: /filter:/i })).toHaveCount(0);
	await expect(industryInspector.getByLabel(/search products/i)).toHaveCount(0);
	await expect(industryInspector.getByRole('button', { name: /build /i })).toHaveCount(0);
	await closeIndustryInspectorIfOpen(page);

	await chooseIndustryBuildTool(page, industryCanvas, /build water pump/i);
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '0');
	await clickCanvasTile(page, industryCanvas, 9, 6);
	await expect(page.getByRole('status', { name: /placement status/i })).toContainText(
		/requires water source/i
	);
	await expect(industryCanvas).toHaveAttribute('data-placement-preview-mode', 'active');
	await expect(industryCanvas).toHaveAttribute('data-placement-invalid-tile-count', /^[1-9]\d*$/);
	await expect(page.getByRole('dialog', { name: /confirm industrial build/i })).toHaveCount(0);
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '0');
	await expect(
		industryInspector.getByRole('heading', { name: /industry tile 9, 6/i })
	).toBeVisible();
	await expect(industryInspector.getByText(/^Industrial$/i).first()).toBeVisible();
	await page
		.getByRole('status', { name: /placement status/i })
		.getByRole('button', { name: /^cancel$/i })
		.click();
	await expect(industryCanvas).toHaveAttribute('data-placement-preview-mode', 'inactive');
	await closeIndustryInspectorIfOpen(page);

	const cashBeforeBuild = await readCompanyCash(page);
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: 1,
		y: 7,
		buildingName: /build water pump/i,
		expectedBuildingCount: 1
	});
	expect(await readCompanyCash(page)).toBeLessThan(cashBeforeBuild);

	await clickCanvasTile(page, industryCanvas, 1, 7);
	await expect(industryInspector).toBeVisible();
	const buildingDetails = industryInspector.getByRole('region', {
		name: /industrial building details/i
	});
	await expect(buildingDetails.getByRole('heading', { name: /water pump/i })).toBeVisible();
	await expect(buildingDetails.getByText(/^Status$/i)).toBeVisible();
	await expect(
		buildingDetails.getByRole('definition').filter({ hasText: /^Idle$/i })
	).toBeVisible();

	await openSaves(page);
	const savePanel = page.getByRole('dialog', { name: /saves/i });
	const autoSave = savePanel.getByLabel('Auto-save');
	await expect(autoSave.getByText(/Day 1 · 1 stores/i)).toBeVisible();
	await expect(savePanel.getByRole('button', { name: /^Resume$/i })).toBeEnabled();
	await savePanel.getByRole('button', { name: /^Resume$/i }).click();
	await expect(savePanel.getByRole('status')).toContainText(/Loaded auto-save/i);
	await savePanel.getByRole('button', { name: /close saves/i }).click();
	await expectIndustryMapReady(page);
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '1');

	await page.getByRole('button', { name: /open menu/i }).click();
	await page.getByRole('menuitem', { name: /retail city map/i }).click();
	await expect(page.getByRole('heading', { name: /harbor city/i })).toBeVisible();
	await expectRetailMapReady(page);
	await expect(page.locator('.map-canvas canvas')).toHaveAttribute('data-store-sprite-count', '1');
	await expect(page.getByRole('dialog', { name: /industry tile details/i })).toHaveCount(0);
});

test('industry build menu shows construction status before founding a store', async ({ page }) => {
	await page.goto('/');

	await openMapMenuItem(page, /industry city map/i);
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	await expectIndustryMapReady(page);

	await page.getByRole('button', { name: /^build$/i }).click();
	const buildMenu = page.getByRole('dialog', { name: /build menu/i });
	await expect(buildMenu).toBeVisible();
	await expect(buildMenu.getByText(/found a retail store to unlock construction/i)).toBeVisible();
	await buildMenu.getByRole('button', { name: /filter: all products/i }).click();
	const filterPopup = buildMenu.getByRole('dialog', { name: /product chain filter/i });
	await expect(filterPopup).toBeVisible();
	await filterPopup.getByLabel(/search products/i).fill('gift');
	await expect(filterPopup.getByRole('button', { name: /gifts/i })).toBeVisible();
	await expect(filterPopup.getByRole('button', { name: /snacks/i })).toHaveCount(0);
	await filterPopup.getByRole('button', { name: /gifts/i }).click();
	await expect(buildMenu.getByRole('button', { name: /filter: gifts/i })).toBeVisible();
	await expect(buildMenu.getByRole('button', { name: /build gift workshop/i })).toBeDisabled();
	await expect(buildMenu.getByRole('button', { name: /build packaging plant/i })).toBeDisabled();
	await expect(buildMenu.getByRole('button', { name: /build drink bottling plant/i })).toHaveCount(
		0
	);
});

test('player builds convenience production and refills from warehouse', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 900 });
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});
	await waitForAutoSaveDay(page, 1);

	await openMapMenuItem(page, /industry city map/i);
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	const industryCanvas = await expectIndustryMapReady(page);

	for (let day = 1; day < 6; day += 1) {
		await page.getByRole('button', { name: /^advance day$/i }).click();
		await waitForAutoSaveDay(page, day + 1);
	}

	await buildIndustryBuildingAt(page, industryCanvas, {
		x: 9,
		y: 6,
		buildingName: /build warehouse/i,
		expectedBuildingCount: 1
	});
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: 1,
		y: 1,
		buildingName: /build grain farm/i,
		expectedBuildingCount: 2
	});
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: 1,
		y: 4,
		buildingName: /build salt mine/i,
		expectedBuildingCount: 3
	});
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: 3,
		y: 1,
		buildingName: /build oilseed farm/i,
		expectedBuildingCount: 4
	});
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: 11,
		y: 6,
		buildingName: /build flour mill/i,
		expectedBuildingCount: 5
	});
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: 12,
		y: 6,
		buildingName: /build oil press/i,
		expectedBuildingCount: 6
	});
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: 13,
		y: 6,
		buildingName: /build snack factory/i,
		expectedBuildingCount: 7
	});
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '7');

	await page.getByRole('button', { name: /^advance day$/i }).click();
	await waitForAutoSaveDay(page, 7);
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '7');
	await clickCanvasTile(page, industryCanvas, 9, 6);
	const visibleWarehouseSnacks = await readWarehouseMaterialQuantity(page, 'Snacks');
	expect(visibleWarehouseSnacks).toBeGreaterThan(0);

	await openMapMenuItem(page, /retail city map/i);
	await expect(page.getByRole('heading', { name: /harbor city/i })).toBeVisible();
	await expectRetailMapReady(page);
	await clickMapTile(page, 1, 6);
	const inspector = page.getByRole('dialog', { name: /tile details/i });
	await expect(inspector).toBeVisible();
	await inspector.getByRole('tab', { name: /stock/i }).click();
	await expect(inspector.getByRole('table', { name: /convenience store stock/i })).toBeVisible();
	await setStoreProductNumber(inspector, /reorder threshold for snacks/i, 10);
	await setStoreProductNumber(inspector, /target stock for snacks/i, 25);
	await setStoreProductNumber(inspector, /reorder threshold for drinks/i, 0);
	await setStoreProductNumber(inspector, /reorder threshold for essentials/i, 0);

	const preWeeklyGame = await waitForSavedProductSettings(page, 'snacks', {
		day: 7,
		reorderThreshold: 10,
		targetStock: 25
	});
	const preWeeklySnacks = getSavedProduct(preWeeklyGame, 'snacks');
	const warehouseSnacksBeforeWeekly = preWeeklyGame.warehouse.materials.snacks ?? 0;
	await page.getByRole('button', { name: /^advance day$/i }).click();
	const postWeeklyGame = await waitForAutoSaveDay(page, 8);
	const latestReport = getLatestReport(postWeeklyGame);
	const storeReport = latestReport.storeReports[0];
	const snacksReport = storeReport?.productReports.find((report) => report.categoryId === 'snacks');

	if (!storeReport || !snacksReport) {
		throw new Error('Missing latest Snacks report');
	}

	const producedSnacks = sumMaterialMovementQuantity(
		latestReport.productionReport.produced,
		'snacks',
		'local'
	);
	const stockBeforeRefill = Math.max(0, preWeeklySnacks.stock - snacksReport.unitsSold);
	const neededUnits =
		stockBeforeRefill < preWeeklySnacks.reorderThreshold
			? Math.max(0, preWeeklySnacks.targetStock - stockBeforeRefill)
			: 0;
	const warehouseSnacksAvailable = warehouseSnacksBeforeWeekly + producedSnacks;
	const expectedWarehouseUnits = Math.min(warehouseSnacksAvailable, neededUnits);
	const expectedImportedUnits = Math.max(0, neededUnits - warehouseSnacksAvailable);

	expect(neededUnits).toBeGreaterThan(0);
	expect(snacksReport.endingStock).toBe(preWeeklySnacks.targetStock);
	expect(snacksReport.warehouseUnits).toBeGreaterThan(0);
	expect(snacksReport.importedUnits).toBeGreaterThan(0);
	expect(snacksReport.warehouseUnits).toBe(expectedWarehouseUnits);
	expect(snacksReport.importedUnits).toBe(expectedImportedUnits);
	expect(snacksReport.importSpend).toBe(expectedImportedUnits * snacksReport.importCost);
	expect(
		sumMaterialMovementQuantity(latestReport.productionReport.warehousePulls, 'snacks', 'warehouse')
	).toBe(snacksReport.warehouseUnits);
	expect(
		sumMaterialMovementQuantity(latestReport.productionReport.shopImports, 'snacks', 'import')
	).toBe(snacksReport.importedUnits);

	const reports = await openManagementPanel(page, /reports/i);
	await expect(reports.getByText(/latest daily result/i)).toBeVisible();
	await reports.getByRole('button', { name: /close reports/i }).click();
	const storesPanel = await openManagementPanel(page, /stores/i);
	const productSources = storesPanel.getByRole('list', {
		name: /convenience store product source split/i
	});
	await expect(productSources.getByText('Snacks')).toBeVisible();
	await expect(productSources.getByText(`${snacksReport.warehouseUnits} warehouse`)).toBeVisible();
	await expect(productSources.getByText(`${snacksReport.importedUnits} imported`)).toBeVisible();
	await expect(
		storesPanel.locator('article').filter({
			hasText: new RegExp(
				`^Convenience Store[\\s\\S]*Imports\\s+\\$${escapeRegExp(
					snacksReport.importSpend.toLocaleString('en-US')
				)}`
			)
		})
	).toBeVisible();
	await storesPanel.getByRole('button', { name: /close stores/i }).click();
	const productChains = await openManagementPanel(page, /product chains/i);
	await expect(productChains).toBeVisible();
	await expect(productChains.getByTestId('category-stamp-snacks')).toBeVisible();
	await expect(productChains.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();
	await productChains.getByRole('button', { name: 'Warehouse flow' }).click();
	await expect(productChains.getByTestId('product-chain-graph-warehouse-flow')).toBeVisible();
	await expect(productChains.getByRole('heading', { name: 'Warehouse flow' })).toBeVisible();
});

test('hire and assign named staff from the staff menu', async ({ page }) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build boutique goods/i,
		expectedStoreCount: 1
	});
	const staffDialog = await openManagementPanel(page, /staff/i);

	const staffPanel = staffDialog.getByRole('region', { name: 'Staff' });
	await expect(staffPanel.getByRole('heading', { name: 'Staff' })).toBeVisible();
	await expect(staffDialog.getByText('Boutique Goods: 1/1 managers, 2/2 general')).toBeVisible();
	const candidatesSection = staffPanel.getByRole('region', { name: 'Candidates' });
	const generalCandidate = candidatesSection
		.locator('article')
		.filter({ has: page.getByText('General', { exact: true }) })
		.first();
	await expect(generalCandidate).toBeVisible();
	const candidateName = (
		await generalCandidate.getByRole('heading', { level: 4 }).innerText()
	).trim();
	const candidateNamePattern = escapeRegExp(candidateName);

	await generalCandidate
		.getByRole('button', { name: new RegExp(`^Hire ${candidateNamePattern},`) })
		.click();
	await staffPanel
		.getByRole('region', { name: 'Unassigned' })
		.getByLabel(new RegExp(`^Assign ${candidateNamePattern},`))
		.selectOption({ label: 'Boutique Goods' });

	await expect(staffDialog.getByText('Boutique Goods: 1/1 managers, 3/2 general')).toBeVisible();
});

test('locked map tiles still show inspector feedback', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText(/harbor city/i)).toBeVisible();
	await clickMapTile(page, 0, 6);

	const inspector = page.getByRole('dialog', { name: /tile details/i });
	await expect(inspector.getByRole('heading', { name: /tile 0, 6/i })).toBeVisible();
	await expect(inspector.getByRole('region', { name: /tile stats/i })).toBeVisible();
	await expect(inspector.getByRole('button', { name: /open .* here/i })).toHaveCount(0);
});

test('player expands from a selected city tile', async ({ page }) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build boutique goods/i,
		expectedStoreCount: 1
	});

	const mapCanvas = await expectRetailMapReady(page);
	await chooseRetailBuildTool(page, /build electronics & games/i);
	await clickCanvasTile(page, mapCanvas, 2, 6);
	await expect(page.getByRole('dialog', { name: /confirm store opening/i })).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '2');
	await expect(mapCanvas).toHaveAttribute('data-placement-preview-mode', 'inactive');

	const storesPanel = await openManagementPanel(page, /stores/i);
	await expect(
		storesPanel.getByLabel('Stores').getByRole('heading', { name: 'Store #2', exact: true })
	).toBeVisible();
});

test('player opens a revealed retail city from the world map and builds there', async ({
	page
}) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	await openMapMenuItem(page, /world map/i);
	await expect(page.getByRole('region', { name: /world map/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /harbor city/i })).toBeVisible();

	await page.evaluate(() => {
		const serialized = window.localStorage.getItem('serpens.saves.v2');

		if (!serialized) {
			throw new Error('Missing save data');
		}

		const saveStore = JSON.parse(serialized);
		const game = saveStore.autoSave.game;
		game.cash = 100_000;
		game.storeCap = 4;
		game.world.revealedCityIds = [...new Set([...game.world.revealedCityIds, 'campus-junction'])];
		window.localStorage.setItem('serpens.saves.v2', JSON.stringify(saveStore));
	});
	await page.reload();
	await openSaves(page);
	await page.getByRole('button', { name: /^resume$/i }).click();
	await page.getByRole('button', { name: /close saves/i }).click();

	await openMapMenuItem(page, /world map/i);
	await page.getByRole('button', { name: /campus junction/i }).click();
	await page.getByRole('button', { name: /open for/i }).click();
	await page.getByRole('button', { name: /campus junction/i }).click();
	await openMapMenuItem(page, /retail city map/i);
	await expect(page.getByRole('heading', { name: /campus junction/i })).toBeVisible();

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build electronics & games/i,
		expectedStoreCount: 1
	});
	await expect.poll(async () => (await readAutoSaveGame(page)).stores.length).toBe(2);
});

test('manage selected store stock and see weekly imports', async ({ page }) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	const mapCanvas = page.locator('.map-canvas canvas');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');

	await clickMapTile(page, 1, 6);
	const inspector = page.getByRole('dialog', { name: /tile details/i });
	await expect(inspector).toBeVisible();
	await expect(inspector.getByRole('tab', { name: /details/i })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(inspector.getByRole('tab', { name: /staff/i })).toHaveAttribute(
		'aria-selected',
		'false'
	);
	await expect(inspector.getByRole('table', { name: /convenience store stock/i })).toHaveCount(0);
	const detailsInspectorBox = await inspector.boundingBox();

	if (!detailsInspectorBox) {
		throw new Error('Tile details inspector has no bounding box on the details tab');
	}

	const detailsPanelLayout = await getStorePanelLayout(page);
	expect(detailsPanelLayout.details.display).toBe('grid');
	expect(detailsPanelLayout.stock.display).toBe('none');
	expect(detailsPanelLayout.chain.display).toBe('none');
	expect(detailsPanelLayout.staff.display).toBe('none');
	expect(detailsPanelLayout.height).toBeLessThan(520);

	await inspector.getByRole('tab', { name: /stock/i }).click();
	const stockInspectorBox = await inspector.boundingBox();

	if (!stockInspectorBox) {
		throw new Error('Tile details inspector has no bounding box on the stock tab');
	}

	const stockPanelLayout = await getStorePanelLayout(page);
	expect(stockPanelLayout.details.display).toBe('none');
	expect(stockPanelLayout.stock.display).toBe('grid');
	expect(stockPanelLayout.chain.display).toBe('none');
	expect(stockPanelLayout.staff.display).toBe('none');
	expect(Math.abs(stockInspectorBox.height - detailsInspectorBox.height)).toBeLessThanOrEqual(1);
	expect(Math.abs(stockPanelLayout.height - detailsPanelLayout.height)).toBeLessThanOrEqual(1);

	await expect(inspector.getByRole('table', { name: /convenience store stock/i })).toBeVisible();
	await expect(inspector.getByRole('cell', { name: 'Snacks' })).toBeVisible();

	await inspector.getByRole('tab', { name: /product chain/i }).click();
	const chainInspectorBox = await inspector.boundingBox();

	if (!chainInspectorBox) {
		throw new Error('Tile details inspector has no bounding box on the product chain tab');
	}

	const chainPanelLayout = await getStorePanelLayout(page);
	expect(chainPanelLayout.details.display).toBe('none');
	expect(chainPanelLayout.stock.display).toBe('none');
	expect(chainPanelLayout.chain.display).toBe('grid');
	expect(chainPanelLayout.staff.display).toBe('none');
	expect(Math.abs(chainInspectorBox.height - detailsInspectorBox.height)).toBeLessThanOrEqual(1);
	expect(Math.abs(chainPanelLayout.height - detailsPanelLayout.height)).toBeLessThanOrEqual(1);
	await expect(inspector.getByLabel('Product category')).toBeVisible();
	await expect(inspector.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();

	await inspector.getByRole('tab', { name: /staff/i }).click();
	const staffInspectorBox = await inspector.boundingBox();

	if (!staffInspectorBox) {
		throw new Error('Tile details inspector has no bounding box on the staff tab');
	}

	const staffPanelLayout = await getStorePanelLayout(page);
	expect(staffPanelLayout.details.display).toBe('none');
	expect(staffPanelLayout.stock.display).toBe('none');
	expect(staffPanelLayout.chain.display).toBe('none');
	expect(staffPanelLayout.staff.display).toBe('grid');
	expect(Math.abs(staffInspectorBox.height - detailsInspectorBox.height)).toBeLessThanOrEqual(1);
	expect(Math.abs(staffPanelLayout.height - detailsPanelLayout.height)).toBeLessThanOrEqual(1);

	await inspector.getByRole('tab', { name: /stock/i }).click();

	const snacksPrice = inspector.getByRole('spinbutton', { name: /selling price for snacks/i });
	await snacksPrice.fill('7');
	await snacksPrice.blur();
	await expect(snacksPrice).toHaveValue('7');

	const snacksTarget = inspector.getByRole('spinbutton', { name: /target stock for snacks/i });
	await snacksTarget.fill('140');
	await snacksTarget.blur();
	await expect(snacksTarget).toHaveValue('140');

	const snacksReorder = inspector.getByRole('spinbutton', {
		name: /reorder threshold for snacks/i
	});
	await snacksReorder.fill('100');
	await snacksReorder.blur();
	await expect(snacksReorder).toHaveValue('100');

	for (let day = 0; day < 7; day += 1) {
		await page.getByRole('button', { name: /^advance day$/i }).click();
	}

	const reports = await openManagementPanel(page, /reports/i);
	const importsMetric = reports
		.getByLabel('Reports')
		.locator('.metrics > div')
		.filter({ hasText: /^Imports\s+\$[1-9][\d,]*$/ });
	await expect(importsMetric).toBeVisible();
});

test('player can save to a manual slot and load it after reload', async ({ page }) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build boutique goods/i,
		expectedStoreCount: 1
	});
	await openSaves(page);
	await expect(page.getByText(/Day 1 · 1 stores/i)).toBeVisible();

	await page.getByRole('textbox', { name: /slot name/i }).fill('Harbor test');
	await page.getByRole('button', { name: /save slot/i }).click();
	await expect(page.getByText(/Saved Harbor test/i)).toBeVisible();
	await page.getByRole('button', { name: /close saves/i }).click();

	await page.reload();
	await openSaves(page);
	await expect(page.getByRole('heading', { name: /Harbor test/i })).toBeVisible();
	await page.getByRole('button', { name: /^Load$/i }).click();
	await expect(page.locator('.map-canvas canvas')).toHaveAttribute('data-store-sprite-count', '1');
	await expect(page.getByText(/Loaded Harbor test/i)).toBeVisible();
});

test('clicking a category stamp updates the atlas heading', async ({ page }) => {
	await page.goto('/');
	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	const panel = await openManagementPanel(page, /product chains/i);
	const drinksStamp = panel.getByTestId('category-stamp-drinks');
	await expect(drinksStamp).toBeVisible();
	await drinksStamp.click();

	await expect(panel.getByRole('heading', { level: 2, name: 'Drinks' })).toBeVisible();
});
