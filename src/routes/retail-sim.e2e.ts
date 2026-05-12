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

async function clickIndustryMapTile(page: Page, x: number, y: number) {
	const canvas = await expectIndustryMapReady(page);
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

async function openControlTower(page: Page) {
	await page.getByRole('button', { name: /open menu/i }).click();
	await page.getByRole('menuitem', { name: /control tower/i }).click();
	await expect(page.getByRole('dialog', { name: /control tower/i })).toBeVisible();
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

async function chooseStoreType(page: Page, storeTypeName: RegExp) {
	await page.getByRole('button', { name: storeTypeName }).first().click();
	const confirmDialog = page.getByRole('dialog', { name: /confirm store opening/i });
	await expect(confirmDialog).toBeVisible();
	await confirmDialog.getByRole('button', { name: /confirm opening/i }).click();
	await expect(page.getByRole('dialog', { name: /tile details/i })).toHaveCount(0);
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
	await clickCanvasTile(page, canvas, input.x, input.y);
	const industryInspector = page.getByRole('dialog', { name: /industry tile details/i });
	await expect(
		industryInspector,
		await describeCanvasClick(canvas, input.x, input.y)
	).toBeVisible();
	await industryInspector.getByRole('button', { name: input.buildingName }).click();
	await expect(canvas).toHaveAttribute(
		'data-industry-building-count',
		String(input.expectedBuildingCount)
	);
}

async function describeCanvasClick(canvas: Locator, x: number, y: number): Promise<string> {
	const attrs = await canvas.evaluate((node) => {
		const canvasElement = node as HTMLCanvasElement;

		return {
			width: canvasElement.getBoundingClientRect().width,
			height: canvasElement.getBoundingClientRect().height,
			viewX: canvasElement.dataset.mapViewX,
			viewY: canvasElement.dataset.mapViewY,
			viewWidth: canvasElement.dataset.mapViewWidth,
			viewHeight: canvasElement.dataset.mapViewHeight,
			zoom: canvasElement.dataset.mapZoom
		};
	});

	return `Expected industry inspector after clicking tile ${x}, ${y}; canvas ${JSON.stringify(attrs)}`;
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
	await clickMapTile(page, 1, 6);
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
	await controlTower.getByRole('button', { name: /close control tower/i }).click();
	await page.getByRole('button', { name: /^advance day$/i }).click();
	await openControlTower(page);

	await expect(controlTowerStatus.getByText(/^Day 2$/i)).toBeVisible();
	await expect(controlTower.getByText(/latest daily result/i)).toBeVisible();
});

test('city map renders terrain assets and blocks road and river placement', async ({ page }) => {
	await page.goto('/');

	await expectTerrainAssets(page);

	await clickMapTile(page, 10, 6);
	const roadDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(roadDialog).toBeVisible();
	await expect(roadDialog.getByText(/road location/i).first()).toBeVisible();
	await expect(roadDialog.getByRole('button', { name: /open .* here/i }).first()).toBeDisabled();
	await page.getByRole('button', { name: /close tile inspector/i }).click();

	await clickMapTile(page, 5, 6);
	const riverDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(riverDialog).toBeVisible();
	await expect(riverDialog.getByText(/river location/i).first()).toBeVisible();
	await expect(riverDialog.getByRole('button', { name: /open .* here/i }).first()).toBeDisabled();
});

test('player can confirm a founding store from a narrow viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 700 });
	await page.goto('/');

	await clickMapTile(page, 6, 6);
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
	await expectOverlayToCoverMap(page);
	await expect(page.getByRole('button', { name: /open .* here/i }).first()).toBeVisible();

	const mapCanvas = page.locator('.map-canvas canvas');
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '0');
	await chooseStoreType(page, /open boutique goods here/i);

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

test('control tower opens from the map views menu and closes as an overlay', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 6);
	await chooseStoreType(page, /open .* here/i);

	await openControlTower(page);
	await page.getByRole('button', { name: /close control tower/i }).click();
	await expect(page.getByRole('dialog', { name: /control tower/i })).toHaveCount(0);

	await openControlTower(page);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /control tower/i })).toHaveCount(0);
});

test('player can switch to the industry city map and back to retail', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 6);
	await chooseStoreType(page, /open convenience store here/i);

	await page.getByRole('button', { name: /open menu/i }).click();
	await page.getByRole('menuitem', { name: /industry city map/i }).click();
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	await expectIndustryMapReady(page);
	const industryCanvas = page.locator('.map-canvas canvas');
	const resourceCount = Number(await industryCanvas.getAttribute('data-industry-resource-count'));
	expect(resourceCount).toBeGreaterThan(0);

	await clickIndustryMapTile(page, 1, 7);
	const industryInspector = page.getByRole('dialog', { name: /industry tile details/i });
	await expect(industryInspector).toBeVisible();
	await expect(industryInspector.getByRole('heading', { name: /industry tile/i })).toBeVisible();
	await expect(industryInspector.getByRole('button', { name: /build water pump/i })).toBeVisible();
	const cashBeforeBuild = await readCompanyCash(page);

	await industryInspector.getByRole('button', { name: /build water pump/i }).click();
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '1');
	const buildingDetails = industryInspector.getByRole('region', {
		name: /industrial building details/i
	});
	await expect(buildingDetails.getByRole('heading', { name: /water pump/i })).toBeVisible();
	await expect(buildingDetails.getByText(/^Status$/i)).toBeVisible();
	await expect(
		buildingDetails.getByRole('definition').filter({ hasText: /^Idle$/i })
	).toBeVisible();
	expect(await readCompanyCash(page)).toBeLessThan(cashBeforeBuild);

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

test('player builds convenience production and refills from warehouse', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 900 });
	await page.goto('/');

	await clickMapTile(page, 1, 6);
	await chooseStoreType(page, /open convenience store here/i);
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

	const preWeeklyGame = await waitForAutoSaveDay(page, 7);
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
	expect(snacksReport.warehouseUnits).toBe(expectedWarehouseUnits);
	expect(snacksReport.importedUnits).toBe(expectedImportedUnits);
	expect(snacksReport.importSpend).toBe(expectedImportedUnits * snacksReport.importCost);
	expect(
		sumMaterialMovementQuantity(latestReport.productionReport.warehousePulls, 'snacks', 'warehouse')
	).toBe(snacksReport.warehouseUnits);
	expect(
		sumMaterialMovementQuantity(latestReport.productionReport.shopImports, 'snacks', 'import')
	).toBe(snacksReport.importedUnits);

	await openControlTower(page);
	const controlTower = page.getByRole('dialog', { name: /control tower/i });
	await expect(controlTower.getByRole('region', { name: /reports/i })).toBeVisible();
	await expect(controlTower.getByText(/latest daily result/i)).toBeVisible();
	await expect(
		controlTower
			.getByLabel('Stores')
			.locator('article')
			.filter({
				hasText: new RegExp(
					`^Convenience Store[\\s\\S]*Imports\\s+\\$${escapeRegExp(
						snacksReport.importSpend.toLocaleString('en-US')
					)}`
				)
			})
	).toBeVisible();
});

test('hire and assign named staff from the Control Tower', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 6);
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

	await expect(controlTower.getByText('Boutique Goods: 1/1 managers, 3/2 general')).toBeVisible();
});

test('locked map tiles still show inspector feedback', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByText(/harbor city/i)).toBeVisible();
	await clickMapTile(page, 0, 6);

	await expect(page.getByRole('heading', { name: /tile 0, 6/i })).toBeVisible();
	await expect(page.getByText(/locked location/i)).toBeVisible();
});

test('player expands from a selected city tile', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 6);
	await chooseStoreType(page, /open .* here/i);

	await clickMapTile(page, 2, 6);
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

test('manage selected store stock and see weekly imports', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 6);
	await chooseStoreType(page, /open convenience store here/i);

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
	expect(stockPanelLayout.staff.display).toBe('none');
	expect(Math.abs(stockInspectorBox.height - detailsInspectorBox.height)).toBeLessThanOrEqual(1);
	expect(Math.abs(stockPanelLayout.height - detailsPanelLayout.height)).toBeLessThanOrEqual(1);

	await expect(inspector.getByRole('table', { name: /convenience store stock/i })).toBeVisible();
	await expect(inspector.getByRole('cell', { name: 'Snacks' })).toBeVisible();

	await inspector.getByRole('tab', { name: /staff/i }).click();
	const staffInspectorBox = await inspector.boundingBox();

	if (!staffInspectorBox) {
		throw new Error('Tile details inspector has no bounding box on the staff tab');
	}

	const staffPanelLayout = await getStorePanelLayout(page);
	expect(staffPanelLayout.details.display).toBe('none');
	expect(staffPanelLayout.stock.display).toBe('none');
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

	await openControlTower(page);
	const controlTower = page.getByRole('dialog', { name: /control tower/i });
	const importsMetric = controlTower
		.getByLabel('Reports')
		.locator('.metrics > div')
		.filter({ hasText: /^Imports\s+\$[1-9][\d,]*$/ });
	await expect(importsMetric).toBeVisible();
});

test('player can save to a manual slot and load it after reload', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 6);
	await chooseStoreType(page, /open .* here/i);
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
