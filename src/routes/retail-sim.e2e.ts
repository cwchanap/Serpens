import { expect, test, type Locator, type Page } from '@playwright/test';
import { PRODUCTION_EVENT_CATALOG } from '../lib/game/eventCatalog';
import { createInitialEventRuntime, selectEventForDay } from '../lib/game/eventSelection';
import { LANGUAGE_PREFERENCE_STORAGE_KEY } from '../lib/i18n/locales';
import {
	DEFAULT_INDUSTRY_CITY_HEIGHT,
	DEFAULT_INDUSTRY_CITY_WIDTH,
	generateIndustryCity,
	getIndustryTilesByResource
} from '../lib/game/industry';
import { recalculateCityInventoryPressure } from '../lib/game/cityInventory';
import { estimateNextLoanPayment, getScheduledPrincipalForInstallment } from '../lib/game/finance';
import { buildIndustrialBuilding } from '../lib/game/industryPlacement';
import { openStoreAtTile } from '../lib/game/placement';
import { createNewGame } from '../lib/game/state';
import { calculateStockHealth } from '../lib/game/stock';
import { openWorldCity } from '../lib/game/world';
import type { GameState, LoanInstrument } from '../lib/game/types';
import { BROWSER_SAVE_STORAGE_KEY } from '../lib/persistence/browserSaveRepository';
import { BROWSER_SCENARIO_STORAGE_KEY } from '../lib/persistence/browserScenarioRepository';
import {
	createAutoSaveRecord,
	createEmptySaveStore,
	validateSaveStoreSnapshot
} from '../lib/persistence/saveCodec';
import type { SaveStoreSnapshot } from '../lib/persistence/saveTypes';
import {
	createEmptyScenarioStore,
	encodeScenarioBestResultRecord,
	encodeScenarioRunRecord,
	scenarioDefinitionKey
} from '../lib/persistence/scenarioCodec';
import { currentScenarioDefinition } from '../lib/scenarios/catalog';
import { evaluateScenario, executeScenarioCommand, startScenario } from '../lib/scenarios/runtime';
import { encodeScenarioShareCode } from '../lib/scenarios/shareCode';
import type {
	ScenarioCommand,
	ScenarioDefinition,
	ScenarioId,
	ScenarioResult,
	ScenarioRun,
	ScenarioStoreSnapshot
} from '../lib/scenarios/types';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(
		({ languageKey, scenarioKey }) => {
			window.localStorage.setItem(languageKey, 'en');
			const isolationKey = 'serpens.e2e.challenge-storage-isolated';
			if (window.sessionStorage.getItem(isolationKey) !== 'true') {
				window.localStorage.removeItem(scenarioKey);
				window.sessionStorage.setItem(isolationKey, 'true');
			}
		},
		{
			languageKey: LANGUAGE_PREFERENCE_STORAGE_KEY,
			scenarioKey: BROWSER_SCENARIO_STORAGE_KEY
		}
	);
});

const FIRST_PROFIT_REFERENCE_OPENING: ScenarioCommand[] = [
	{
		kind: 'updatePolicy',
		patch: {
			pricing: 'competitive',
			inventory: 'lean',
			staffing: 'service',
			marketing: 'none',
			service: 'highTouch'
		}
	},
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'store-1',
		categoryId: 'bottled-water',
		sellingPrice: 6
	},
	{
		kind: 'updateStoreInventoryTargets',
		storeId: 'store-1',
		categoryId: 'bottled-water',
		reorderThreshold: 200,
		targetStock: 280
	}
];

function challengeDefinition(scenarioId: ScenarioId): ScenarioDefinition {
	const definition = currentScenarioDefinition(scenarioId);
	if (!definition) throw new Error(`Missing challenge definition ${scenarioId}.`);
	return definition;
}

function startChallengeRun(scenarioId: ScenarioId, seed?: number): ScenarioRun {
	const definition = challengeDefinition(scenarioId);
	const started = startScenario(definition, seed ?? definition.officialSeed);
	if (!started.ok) throw new Error(`Could not start challenge ${scenarioId}.`);
	return started.value;
}

function applyChallengeCommands(
	run: ScenarioRun,
	commands: readonly ScenarioCommand[]
): ScenarioRun {
	const definition = challengeDefinition(run.definition.scenarioId);
	let current = run;

	for (const command of commands) {
		const execution = executeScenarioCommand(current, definition, command);
		if (!execution.ok || !execution.changed) {
			throw new Error(`Challenge command ${command.kind} did not change the run.`);
		}
		current = execution.run;
	}

	return current;
}

function advanceActiveChallengeToDay(run: ScenarioRun, day: number): ScenarioRun {
	let current = run;
	while (current.status === 'active' && current.game.day < day) {
		current = applyChallengeCommands(current, [{ kind: 'advanceDay' }]);
	}
	if (current.status !== 'active' || current.game.day !== day) {
		throw new Error(`Challenge did not remain active through day ${day}.`);
	}
	return current;
}

function firstProfitReferenceRun(
	seed = challengeDefinition('first-profit').officialSeed
): ScenarioRun {
	return applyChallengeCommands(
		startChallengeRun('first-profit', seed),
		FIRST_PROFIT_REFERENCE_OPENING
	);
}

function terminalFirstProfitReferenceRun(): ScenarioRun {
	let run = firstProfitReferenceRun();
	while (run.status === 'active') {
		run = applyChallengeCommands(run, [{ kind: 'advanceDay' }]);
	}
	if (!run.result) throw new Error('First Profit reference run did not produce a result.');
	return run;
}

function challengeSnapshot(input: {
	activeRun?: ScenarioRun;
	bestResult?: ScenarioResult;
}): ScenarioStoreSnapshot {
	const snapshot = createEmptyScenarioStore();
	if (input.activeRun) {
		snapshot.activeRunsByScenarioId[input.activeRun.definition.scenarioId] =
			encodeScenarioRunRecord(input.activeRun);
	}
	if (input.bestResult) {
		snapshot.bestResultsByDefinitionKey[scenarioDefinitionKey(input.bestResult.definition)] =
			encodeScenarioBestResultRecord(input.bestResult);
	}
	return snapshot;
}

function selectProductionSupplierEvent(game: GameState, quietSelectionDays = 0): GameState {
	for (let eventSeed = 1; eventSeed <= 100_000; eventSeed += 1) {
		const selected = selectEventForDay(
			{
				...game,
				events: createInitialEventRuntime(eventSeed),
				decisions: []
			},
			PRODUCTION_EVENT_CATALOG
		);
		const supplier = selected.decisions.find(
			(decision) => decision.kind === 'event' && decision.eventId === 'supplier-terms'
		);
		if (!supplier) continue;

		let probe: GameState = { ...selected, decisions: [] };
		let streamIsQuiet = true;
		for (let offset = 1; offset <= quietSelectionDays; offset += 1) {
			probe = selectEventForDay(
				{ ...probe, day: game.day + offset, decisions: [] },
				PRODUCTION_EVENT_CATALOG
			);
			if (probe.decisions.some((decision) => decision.kind === 'event')) {
				streamIsQuiet = false;
				break;
			}
		}
		if (streamIsQuiet) return selected;
	}

	throw new Error('Could not find a deterministic production supplier event seed.');
}

function productionSupplierLifecycleGame(): GameState {
	const closingDay = 5;
	const base = createNewGame('convenience', 280_278);
	const prepared: GameState = {
		...base,
		day: closingDay,
		cash: 20_000,
		finance: {
			...base.finance,
			currentDayActivity: { ...base.finance.currentDayActivity, day: closingDay }
		},
		stores: base.stores.map((store) => ({
			...store,
			products: store.products.map((product) => ({
				...product,
				stock: 0,
				reorderThreshold: 1,
				targetStock: 10
			}))
		})),
		decisions: []
	};

	return selectProductionSupplierEvent(prepared, 3);
}

function buildWarehouseInCity(game: GameState, cityId: string): GameState {
	const city = game.industryCities.find((candidate) => candidate.id === cityId);

	if (!city) {
		throw new Error(`Missing generated industry city ${cityId}.`);
	}

	const activeCityGame = { ...game, activeIndustryCityId: city.id };
	for (const tile of city.tiles) {
		const built = buildIndustrialBuilding(activeCityGame, {
			tileId: tile.id,
			buildingTypeId: 'warehouse'
		});

		if (built.industrialBuildings.length === activeCityGame.industrialBuildings.length + 1) {
			return built;
		}
	}

	throw new Error(`Could not place a warehouse in ${cityId}.`);
}

function openConvenienceStoreInCity(game: GameState, cityId: string): GameState {
	const city = game.cities.find((candidate) => candidate.id === cityId);

	if (!city) {
		throw new Error(`Missing generated retail city ${cityId}.`);
	}

	const activeCityGame = { ...game, activeCityId: city.id };
	for (const tile of city.tiles) {
		const opened = openStoreAtTile(activeCityGame, {
			tileId: tile.id,
			archetypeId: 'convenience'
		});

		if (opened.stores.length === activeCityGame.stores.length + 1) {
			return opened;
		}
	}

	throw new Error(`Could not place a convenience store in ${cityId}.`);
}

function cityLocalInventoryLifecycleGame(): GameState {
	const base = createNewGame('convenience', 20260803);
	let game: GameState = {
		...base,
		day: 7,
		cash: 1_000_000,
		finance: {
			...base.finance,
			currentDayActivity: { ...base.finance.currentDayActivity, day: 7 }
		},
		world: {
			...base.world,
			revealedCityIds: [...base.world.revealedCityIds, 'campus-junction', 'breadbasket-basin']
		},
		decisions: []
	};

	game = openWorldCity(game, 'campus-junction');
	game = openWorldCity(game, 'breadbasket-basin');
	game = openConvenienceStoreInCity(game, 'campus-junction');
	game = buildWarehouseInCity(game, 'industry-city');
	game = buildWarehouseInCity(game, 'industry-city');
	game = buildWarehouseInCity(game, 'breadbasket-basin');

	const stores = game.stores.map((store) => {
		const products = store.products.map((product) => {
			if (store.cityId === 'harbor-city') {
				return {
					...product,
					stock: 0,
					reorderThreshold: 1,
					targetStock: 10
				};
			}

			return {
				...product,
				stock: 50,
				reorderThreshold: 1,
				targetStock: 50
			};
		});

		return {
			...store,
			// The second city has a visible, materially different stock position but
			// no sales capacity, making its planned no-replenishment outcome exact.
			...(store.cityId === 'campus-junction' ? { staffCapacity: 0 } : {}),
			products,
			stockHealth: calculateStockHealth(products)
		};
	});
	const cityInventories = game.cityInventories.map((inventory) => {
		if (inventory.cityId === 'industry-city') {
			return recalculateCityInventoryPressure({
				...inventory,
				materials: { 'bottled-water': 6 }
			});
		}
		if (inventory.cityId === 'breadbasket-basin') {
			return recalculateCityInventoryPressure({
				...inventory,
				materials: { 'bottled-water': 37 }
			});
		}
		return inventory;
	});

	if (cityInventories.length !== 2) {
		throw new Error('Expected exactly two initialized city inventories.');
	}

	return {
		...game,
		activeCityId: 'harbor-city',
		activeIndustryCityId: 'industry-city',
		stores,
		cityInventories,
		retailSupplyAssignments: [
			{ retailCityId: 'harbor-city', supplyCityId: null },
			{ retailCityId: 'campus-junction', supplyCityId: 'breadbasket-basin' }
		]
	};
}

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

interface SavedRailShipment {
	materialId: string;
	quantity: number;
	value: number;
	kind: 'pull-producer' | 'pull-warehouse' | 'push-warehouse';
	fromId: string;
	toId: string;
}

interface SavedDailyReport {
	day: number;
	cashBefore: number;
	operatingCashFlow: number;
	financingCashFlow: number;
	netCashChange: number;
	cashAfter: number;
	principalBorrowed: number;
	principalRepaid: number;
	interestPaid: number;
	importSpend: number;
	productionReport: {
		produced: SavedMaterialMovement[];
		importedInputs: SavedMaterialMovement[];
		warehousePulls: SavedMaterialMovement[];
		shopImports: SavedMaterialMovement[];
		importSpend: number;
		railShipments: SavedRailShipment[];
		railUsage: Record<string, number>;
	};
	storeReports: Array<{
		storeId: string;
		importSpend: number;
		productReports: SavedProductReport[];
	}>;
	modifierImpacts: Array<{
		modifierId: string;
		effectKind: 'import-cost-multiplier';
		affectedIds: string[];
		multiplier: number;
		baselineCost: number;
		applicationCount: number;
	}>;
	modifierLifecycle: Array<{
		status: 'activated' | 'replaced' | 'expired';
		modifier: { id: string; expiresOnDay: number };
	}>;
}

interface SavedFinanceTransaction {
	id: string;
	loanId: string;
	kind: 'disbursement' | 'principalPayment' | 'interestPayment' | 'missedPayment' | 'refinance';
	cashDelta: number;
	principalAmount: number;
	interestAmount: number;
}

interface SavedFinance {
	loans: LoanInstrument[];
	transactions: SavedFinanceTransaction[];
	nextLoanSequence: number;
	nextTransactionSequence: number;
}

interface SavedGame {
	day: number;
	cash: number;
	scorecard: {
		profit: number;
	};
	finance: SavedFinance;
	world: {
		revealedCityIds: string[];
		openedCityIds: string[];
	};
	stores: Array<{
		id: string;
		cityId: string;
		products: Array<{
			categoryId: string;
			stock: number;
			reorderThreshold: number;
			targetStock: number;
		}>;
	}>;
	cityInventories: Array<{
		cityId: string;
		capacity: number;
		materials: Record<string, number | undefined>;
		overflowUnits: number;
		overflowCost: number;
	}>;
	retailSupplyAssignments: Array<{
		retailCityId: string;
		supplyCityId: string | null;
	}>;
	events: {
		activeModifiers: Array<{
			id: string;
			expiresOnDay: number;
			effect: { multiplier: number };
		}>;
	};
	reports: SavedDailyReport[];
}

// The industry city the app generates for the starter "industry-city" world
// entry. Resource anchors and district bounds scale with city size (see
// RESOURCE_ANCHOR_SPECS in industry.ts), so e2e clicks must derive tile
// coordinates from the generated city rather than hardcoding the old
// fixed-anchor positions (e.g. water-source used to sit at (1,7), grain-field
// at (1,1), and the industrial district used to cover (9,6)/(11,6)).
const STARTER_INDUSTRY_CITY = generateIndustryCity({
	id: 'industry-city',
	name: 'Industry City',
	width: DEFAULT_INDUSTRY_CITY_WIDTH,
	height: DEFAULT_INDUSTRY_CITY_HEIGHT,
	seed: 20260512,
	resourceProfile: {
		resourceIds: [
			'grain-field',
			'salt-deposit',
			'oilseed-field',
			'water-source',
			'fruit-orchard',
			'sugar-field',
			'pulpwood-forest',
			'chemical-feedstock'
		],
		industrialBias: 1
	}
});

type IndustryResourceTile = Parameters<typeof getIndustryTilesByResource>[1];

function industryResourceTileCoords(resource: IndustryResourceTile): { x: number; y: number } {
	const tile = getIndustryTilesByResource(STARTER_INDUSTRY_CITY, resource)[0]!;
	return { x: tile.x, y: tile.y };
}

// Find `count` industrial-terrain anchors with mutually non-overlapping 2x2
// footprints (all four tiles industrial and unlocked). Used for buildings
// that require industrial terrain rather than a resource anchor (warehouse,
// water bottler).
function industrialBuildTileCoords(count: number): Array<{ x: number; y: number }> {
	const taken = new Set<string>();
	const result: Array<{ x: number; y: number }> = [];
	for (const tile of STARTER_INDUSTRY_CITY.tiles) {
		if (tile.terrain !== 'industrial' || tile.locked) continue;
		const footprint = [
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1]
		]
			.map(([dx, dy]) =>
				STARTER_INDUSTRY_CITY.tiles.find((t) => t.x === tile.x + dx && t.y === tile.y + dy)
			)
			.filter((t): t is NonNullable<typeof t> => Boolean(t));
		if (footprint.length !== 4) continue;
		if (footprint.some((t) => t.locked || t.terrain !== 'industrial')) continue;
		const ids = footprint.map((t) => t.id);
		if (ids.some((id) => taken.has(id))) continue;
		ids.forEach((id) => taken.add(id));
		result.push({ x: tile.x, y: tile.y });
		if (result.length >= count) break;
	}
	return result;
}

const INDUSTRIAL_BUILD_TILES = industrialBuildTileCoords(3);
const INDUSTRY_INSPECT_TILE = INDUSTRIAL_BUILD_TILES[0]!;
const WATER_SOURCE_TILE = industryResourceTileCoords('water-source');
const GRAIN_FIELD_TILE = industryResourceTileCoords('grain-field');

function industryTileHeadingRegex(x: number, y: number): RegExp {
	return new RegExp(`^industry tile ${x}, ${y}$`, 'i');
}

async function clickMapTile(page: Page, x: number, y: number) {
	const canvas = await expectRetailMapReady(page);
	await clickCanvasTile(page, canvas, x, y);
}

function activeMapCanvas(page: Page): Locator {
	return page.locator('.active-map-surface .map-canvas canvas');
}

async function expectRetailMapReady(page: Page): Promise<Locator> {
	const canvas = activeMapCanvas(page);
	await expect(canvas).toBeVisible();
	await expect(canvas).toHaveAttribute('data-store-sprite-count', /\d+/);
	await expect(canvas).toHaveAttribute('data-terrain-asset-mode', 'image');
	await expectMapCameraReady(canvas);

	return canvas;
}

async function expectIndustryMapReady(page: Page): Promise<Locator> {
	const canvas = activeMapCanvas(page);
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
	const canvas = activeMapCanvas(page);
	await expect(canvas).toHaveAttribute('data-terrain-asset-mode', 'image');

	const baseCount = Number(await canvas.getAttribute('data-terrain-base-sprite-count'));
	const featureCount = Number(await canvas.getAttribute('data-terrain-feature-sprite-count'));
	const decorationCount = Number(await canvas.getAttribute('data-terrain-decoration-sprite-count'));

	expect(baseCount).toBe(2688);
	// Feature count (road + river sprites) is incidental to the generation
	// algorithm; use a tolerance so minor road/river tweaks don't break the
	// slow e2e run. baseCount (56 * 48) is structural and stays exact.
	expect(featureCount).toBeCloseTo(517, -2);
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
	await page.getByRole('button', { name: panelName }).click();
	const panel = page.getByRole('dialog', { name: panelName });
	await expect(panel).toBeVisible();
	return panel;
}

async function openSaves(page: Page) {
	await page.getByRole('button', { name: /^menu$/i }).click();
	await page.getByRole('button', { name: /saves/i }).click();
	await expect(page.getByRole('dialog', { name: /saves/i })).toBeVisible();
}

async function readCompanyCash(page: Page): Promise<number> {
	const cashText = await page.locator('[aria-label="Cash"]').innerText();

	return Number(cashText.replace(/[^0-9.-]/g, ''));
}

async function chooseRetailBuildTool(page: Page, storeTypeName: RegExp) {
	await page.getByRole('button', { name: /^build$/i }).click();
	const buildMenu = page.getByRole('dialog', { name: /build menu/i });
	await expect(buildMenu).toBeVisible();
	await expect(activeMapCanvas(page)).toHaveAttribute('data-map-paused', 'true');
	await buildMenu.getByRole('button', { name: storeTypeName }).click();
	await expect(buildMenu).toHaveCount(0);
	const canvas = activeMapCanvas(page);
	await expect(canvas).toHaveAttribute('data-map-paused', 'false');
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

async function openStoreDetail(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: /open details/i }).click();
	const modal = page.locator('[role="dialog"][aria-modal="true"]');
	await expect(modal).toBeVisible();
	return modal;
}

async function getStoreDetailPanelLayout(page: Page) {
	return page.locator('.detail-panels').evaluate((container) => {
		const readPanel = (selector: string) => {
			const panel = container.querySelector(selector);

			if (!panel) {
				throw new Error(`Missing store detail panel ${selector}`);
			}

			const style = window.getComputedStyle(panel);
			return {
				display: style.display
			};
		};

		return {
			stock: readPanel('[id$="-stock-panel"]'),
			chain: readPanel('[id$="-chain-panel"]'),
			staff: readPanel('[id$="-staff-panel"]')
		};
	});
}

async function openMapMenuItem(page: Page, itemName: RegExp) {
	// Map-view tabs live inside the control-desk hamburger popover; open it first.
	// Selecting a view auto-closes the popover.
	await page.getByRole('button', { name: /^menu$/i }).click();
	await page.getByRole('button', { name: itemName }).click();
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
	await expect(canvas).toHaveAttribute('data-map-paused', 'true');
	await buildMenu.getByRole('button', { name: buildingName }).click();
	await expect(buildMenu).toHaveCount(0);
	await expect(canvas).toHaveAttribute('data-map-paused', 'false');
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

async function readCityInventoryMaterialQuantity(
	page: Page,
	materialName: string
): Promise<number> {
	const cityInventory = page.getByRole('region', { name: /city inventory$/i });
	await expect(cityInventory).toBeVisible();
	const material = cityInventory
		.getByRole('list', { name: /city inventory materials/i })
		.getByText(new RegExp(`^${escapeRegExp(materialName)}:\\s+\\d+$`, 'i'));
	await expect(material).toBeVisible();

	const text = await material.innerText();
	const quantity = Number(text.match(/\d+/)?.[0] ?? Number.NaN);

	if (!Number.isFinite(quantity)) {
		throw new Error(`Could not read ${materialName} city inventory quantity from "${text}"`);
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

async function readBrowserSaveSnapshot(page: Page): Promise<SaveStoreSnapshot> {
	return page.evaluate((key) => {
		const serialized = window.localStorage.getItem(key);

		if (!serialized) {
			throw new Error('Save storage is empty');
		}

		return JSON.parse(serialized) as SaveStoreSnapshot;
	}, BROWSER_SAVE_STORAGE_KEY);
}

async function readAutoSaveGame(page: Page): Promise<SavedGame> {
	const snapshot = await readBrowserSaveSnapshot(page);

	if (!snapshot.autoSave) {
		throw new Error('Auto-save record is missing');
	}

	return snapshot.autoSave.game;
}

async function replaceBrowserAutoSave(page: Page, game: GameState): Promise<void> {
	const existing = await readBrowserSaveSnapshot(page);
	const replacement = validateSaveStoreSnapshot({
		...existing,
		autoSave: createAutoSaveRecord(game, new Date('2026-08-03T12:00:00.000Z'))
	});

	await page.evaluate(({ key, serialized }) => window.localStorage.setItem(key, serialized), {
		key: BROWSER_SAVE_STORAGE_KEY,
		serialized: JSON.stringify(replacement)
	});
}

async function installSandboxAutoSave(page: Page, game: GameState): Promise<void> {
	const snapshot = validateSaveStoreSnapshot({
		...createEmptySaveStore(),
		autoSave: createAutoSaveRecord(game, new Date('2026-08-01T12:00:00.000Z'))
	});
	await page.goto('/');
	await page.evaluate(({ key, serialized }) => window.localStorage.setItem(key, serialized), {
		key: BROWSER_SAVE_STORAGE_KEY,
		serialized: JSON.stringify(snapshot)
	});
	await page.reload();
	await openSaves(page);
	await page
		.getByRole('dialog', { name: /saves/i })
		.getByRole('button', { name: /^resume$/i })
		.click();
	await page
		.getByRole('dialog', { name: /saves/i })
		.getByRole('button', { name: /^close$/i })
		.click();
	await expectRetailMapReady(page);
}

/**
 * Force-reveal a world city in the auto-save and grant enough cash/storeCap to
 * open it. Mutates localStorage in place and reloads the page so the resume
 * flow picks up the new state. Used by cross-city tests that need a second
 * city unlocked without playing through the unlock milestone.
 */
async function revealCityAndGrantFunds(
	page: Page,
	cityId: string,
	cash = 100_000,
	storeCap = 4
): Promise<void> {
	await page.evaluate(
		({ cityId, cash, storeCap }) => {
			const serialized = window.localStorage.getItem('serpens.saves.v2');
			if (!serialized) {
				throw new Error('Missing save data');
			}
			const saveStore = JSON.parse(serialized);
			const game = saveStore.autoSave.game;
			game.cash = cash;
			game.storeCap = storeCap;
			game.world.revealedCityIds = [...new Set([...game.world.revealedCityIds, cityId])];
			window.localStorage.setItem('serpens.saves.v2', JSON.stringify(saveStore));
		},
		{ cityId, cash, storeCap }
	);
	await page.reload();
	await openSaves(page);
	await page.getByRole('button', { name: /^resume$/i }).click();
	await page
		.getByRole('dialog', { name: /saves/i })
		.getByRole('button', { name: /^close$/i })
		.click();
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

function getSavedStoreInCity(game: SavedGame, cityId: string) {
	const store = game.stores.find((candidate) => candidate.cityId === cityId);

	if (!store) {
		throw new Error(`Missing saved store in ${cityId}.`);
	}

	return store;
}

function getSavedCityInventory(game: SavedGame, cityId: string) {
	const inventory = game.cityInventories.find((candidate) => candidate.cityId === cityId);

	if (!inventory) {
		throw new Error(`Missing saved city inventory for ${cityId}.`);
	}

	return inventory;
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

function challengeRoot(page: Page): Locator {
	return page.locator('main.app');
}

function challengeStatus(page: Page): Locator {
	return page.getByRole('region', { name: 'Objectives' });
}

function challengeCard(page: Page, title: string): Locator {
	return page
		.getByRole('dialog', { name: 'Challenge catalog' })
		.getByRole('article')
		.filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

async function openChallengeCatalog(page: Page): Promise<Locator> {
	const menuTrigger = page.getByTestId('game-menu-trigger');
	if ((await menuTrigger.getAttribute('aria-expanded')) !== 'true') {
		await menuTrigger.click();
	}
	await page.getByRole('button', { name: 'Challenge catalog', exact: true }).click();
	const catalog = page.getByRole('dialog', { name: 'Challenge catalog' });
	await expect(catalog).toBeVisible();
	return catalog;
}

async function startFirstProfitChallenge(page: Page): Promise<void> {
	await openChallengeCatalog(page);
	await challengeCard(page, 'First Profit')
		.getByRole('button', { name: 'Start First Profit', exact: true })
		.click();
	await expectChallengeReady(page, { day: 1, eligibility: 'Ranked' });
}

async function expectChallengeReady(
	page: Page,
	input: { day: number; eligibility: 'Ranked' | 'Unranked' }
): Promise<void> {
	await expect(challengeRoot(page)).toHaveAttribute('data-play-mode', 'scenario');
	await expect(challengeRoot(page)).toHaveAttribute('data-scenario-command-pending', 'false');
	await expect(challengeStatus(page)).toContainText(`First Profit · ${input.eligibility}`);
	await expect(challengeStatus(page)).toContainText(`Day ${input.day} of 14`);
	const canvas = await expectRetailMapReady(page);
	await expect(canvas).toHaveAttribute('data-store-sprite-count', '1');
}

async function installChallengeSnapshot(
	page: Page,
	snapshot: ScenarioStoreSnapshot
): Promise<void> {
	await page.goto('/');
	await page.evaluate(({ key, serialized }) => window.localStorage.setItem(key, serialized), {
		key: BROWSER_SCENARIO_STORAGE_KEY,
		serialized: JSON.stringify(snapshot)
	});
	await page.reload();
}

async function resumeFirstProfitChallenge(
	page: Page,
	input: { day: number; eligibility: 'Ranked' | 'Unranked' }
): Promise<void> {
	await openChallengeCatalog(page);
	await challengeCard(page, 'First Profit')
		.getByRole('button', { name: 'Resume First Profit', exact: true })
		.click();
	await expectChallengeReady(page, input);
}

async function readChallengeSnapshot(page: Page): Promise<ScenarioStoreSnapshot> {
	return page.evaluate((key) => {
		const serialized = window.localStorage.getItem(key);
		if (!serialized) throw new Error('Challenge storage is empty.');
		return JSON.parse(serialized) as ScenarioStoreSnapshot;
	}, BROWSER_SCENARIO_STORAGE_KEY);
}

async function advanceChallengeDay(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Advance day', exact: true }).click();
	await expect(challengeRoot(page)).toHaveAttribute('data-scenario-command-pending', 'false');
}

async function openChallengeMenu(page: Page): Promise<Locator> {
	await page.getByTestId('game-menu-trigger').click();
	const menu = page.getByRole('dialog', { name: 'Menu' });
	await expect(menu).toBeVisible();
	return menu;
}

function negativeCashDecisionRun(): ScenarioRun {
	const definition = challengeDefinition('first-profit');
	const started = startChallengeRun('first-profit');
	const game = selectProductionSupplierEvent({ ...started.game, cash: 1_000 });
	return {
		...started,
		game,
		evaluation: evaluateScenario(definition, game, false)
	};
}

test('production supplier bulk discount stays active through its final import and then expires', async ({
	page
}) => {
	const seededGame = productionSupplierLifecycleGame();
	const supplierDecision = seededGame.decisions.find(
		(decision) => decision.kind === 'event' && decision.eventId === 'supplier-terms'
	);
	if (!supplierDecision || supplierDecision.kind !== 'event') {
		throw new Error('Production selector did not materialize supplier terms.');
	}
	expect(supplierDecision.id).toMatch(/^event-instance-\d+$/);
	const startingProduct = seededGame.stores[0]?.products[0];
	if (!startingProduct) throw new Error('Supplier lifecycle game has no retail product.');
	expect(startingProduct).toMatchObject({
		categoryId: 'bottled-water',
		stock: 0,
		targetStock: 10
	});

	await installSandboxAutoSave(page, seededGame);

	let decisions = await openManagementPanel(page, 'Decisions');
	const bulkDiscount = decisions
		.getByRole('region', { name: 'Decision Queue' })
		.getByRole('button', { name: /Bulk discount/ });
	await expect(bulkDiscount).toContainText(
		'Commit to larger orders for a three-day 10% retail import discount.'
	);
	await bulkDiscount.click();

	const modifierCard = decisions.getByRole('article', { name: 'Supplier terms', exact: true });
	await expect(modifierCard).toContainText('10% retail import discount');
	await expect(modifierCard).toContainText('Starts day 5');
	await expect(modifierCard).toContainText('Expires after day 7');
	await expect(modifierCard).toContainText('3 days remaining');

	await expect
		.poll(async () => {
			const saved = await readAutoSaveGame(page);
			return {
				cash: saved.cash,
				profit: saved.scorecard.profit,
				stock: getSavedProduct(saved, startingProduct.categoryId).stock,
				modifierCount: saved.events.activeModifiers.length
			};
		})
		.toEqual({
			cash: 17_500,
			profit: 65,
			stock: 1,
			modifierCount: 1
		});
	const resolvedGame = await readAutoSaveGame(page);
	const modifierId = resolvedGame.events.activeModifiers[0]?.id;
	if (!modifierId) throw new Error('Bulk discount modifier was not persisted.');

	await decisions.getByRole('button', { name: 'Close Decisions', exact: true }).click();
	await page.locator('button.alerts-bell').click();
	await page
		.getByRole('group', { name: 'Alerts list' })
		.getByRole('button', { name: 'Active modifier: Supplier terms', exact: true })
		.click();
	decisions = page.getByRole('dialog', { name: 'Decisions' });
	await expect(decisions).toBeVisible();
	await expect(
		decisions.getByRole('article', { name: 'Supplier terms', exact: true })
	).toContainText('3 days remaining');
	await decisions.getByRole('button', { name: 'Close Decisions', exact: true }).click();

	await page.getByRole('button', { name: 'Advance day', exact: true }).click();
	let saved = await waitForAutoSaveDay(page, 6);
	expect(saved.events.activeModifiers.map((modifier) => modifier.id)).toEqual([modifierId]);
	expect(getLatestReport(saved)).toMatchObject({
		day: 5,
		modifierImpacts: [],
		modifierLifecycle: [{ status: 'activated', modifier: { id: modifierId } }]
	});
	decisions = await openManagementPanel(page, 'Decisions');
	await expect(
		decisions.getByRole('article', { name: 'Supplier terms', exact: true })
	).toContainText('2 days remaining');
	await decisions.getByRole('button', { name: 'Close Decisions', exact: true }).click();

	await page.getByRole('button', { name: 'Advance day', exact: true }).click();
	saved = await waitForAutoSaveDay(page, 7);
	expect(saved.events.activeModifiers.map((modifier) => modifier.id)).toEqual([modifierId]);
	expect(getLatestReport(saved)).toMatchObject({
		day: 6,
		modifierImpacts: [],
		modifierLifecycle: []
	});
	decisions = await openManagementPanel(page, 'Decisions');
	await expect(
		decisions.getByRole('article', { name: 'Supplier terms', exact: true })
	).toContainText('1 day remaining');
	await decisions.getByRole('button', { name: 'Close Decisions', exact: true }).click();

	await page.getByRole('button', { name: 'Advance day', exact: true }).click();
	saved = await waitForAutoSaveDay(page, 8);
	const finalReport = getLatestReport(saved);
	expect(saved.events.activeModifiers).toEqual([]);
	expect(finalReport.day).toBe(7);
	expect(finalReport.modifierImpacts).toEqual([
		expect.objectContaining({
			modifierId,
			effectKind: 'import-cost-multiplier',
			affectedIds: ['bottled-water'],
			multiplier: 0.9,
			applicationCount: 1
		})
	]);
	expect(finalReport.modifierImpacts[0]?.baselineCost).toBeGreaterThan(0);
	expect(finalReport.modifierLifecycle).toEqual([
		expect.objectContaining({
			status: 'expired',
			modifier: expect.objectContaining({ id: modifierId, expiresOnDay: 8 })
		})
	]);

	const reports = await openManagementPanel(page, 'Reports');
	await expect(reports.getByRole('region', { name: 'Latest-day modifier impacts' })).toContainText(
		'Multiplier: ×0.9'
	);
	await expect(
		reports.getByRole('region', { name: 'Latest-day modifier lifecycle' })
	).toContainText('Status: Expired');
	await reports.getByRole('button', { name: 'Close Reports', exact: true }).click();

	decisions = await openManagementPanel(page, 'Decisions');
	await expect(decisions.getByRole('region', { name: 'Active modifiers' })).toContainText(
		'No active modifiers.'
	);
	await decisions.getByRole('button', { name: 'Close Decisions', exact: true }).click();
	await page.locator('button.alerts-bell').click();
	await expect(
		page
			.getByRole('group', { name: 'Alerts list' })
			.getByRole('button', { name: 'Active modifier: Supplier terms', exact: true })
	).toHaveCount(0);
});

test('challenge starts First Profit on the official ranked seed', async ({ page }) => {
	await page.goto('/');

	await startFirstProfitChallenge(page);

	await expect(challengeStatus(page)).toContainText('Required 0 of 2');
	await expect(challengeStatus(page)).toContainText('13 days remaining');
	const snapshot = await readChallengeSnapshot(page);
	const active = snapshot.activeRunsByScenarioId['first-profit'];
	expect(active?.run.seed).toBe(280_001);
	expect(active?.run.eligibility).toBe('ranked');
	expect(active?.run.status).toBe('active');
});

test('challenge advance updates objective progress and deadline state', async ({ page }) => {
	await page.goto('/');
	await startFirstProfitChallenge(page);

	await advanceChallengeDay(page);

	await expect(challengeStatus(page)).toContainText('Day 2 of 14');
	await expect(challengeStatus(page)).toContainText('12 days remaining');
	await expect(challengeStatus(page)).toContainText('Required 1 of 2');
	await challengeStatus(page).getByRole('button', { name: 'Show objective details' }).click();
	const objectiveDetails = page.locator('#scenario-objective-panel');
	const cumulativeIncome = objectiveDetails
		.getByRole('article')
		.filter({ hasText: 'Earn cumulative net income' });
	await expect(cumulativeIncome).toContainText('Satisfied');
	await expect(cumulativeIncome).toContainText('Actual $146');
	await expect(cumulativeIncome).toContainText('Day 1 report');
	const positiveIncomeStreak = objectiveDetails
		.getByRole('article')
		.filter({ hasText: 'Maintain a positive income streak' });
	await expect(positiveIncomeStreak).toContainText('Pending');
	await expect(positiveIncomeStreak).toContainText('Actual 1');
	await expect(positiveIncomeStreak).toContainText('Day 1 report');
	const snapshot = await readChallengeSnapshot(page);
	const active = snapshot.activeRunsByScenarioId['first-profit'];
	expect(active?.game).toMatchObject({ day: 2 });
	expect(
		active?.run.evaluation.required.find(
			(objective) => objective.conditionId === 'cumulative-net-income'
		)
	).toMatchObject({
		status: 'satisfied',
		evidence: { actual: 146, contributingIds: ['report:1'] }
	});
	expect(
		active?.run.evaluation.required.find(
			(objective) => objective.conditionId === 'positive-income-streak'
		)
	).toMatchObject({
		status: 'pending',
		evidence: { actual: 1, contributingIds: ['report:1'] }
	});
});

test('challenge returns to sandbox and resumes its isolated run from the catalog', async ({
	page
}) => {
	await page.goto('/');
	await startFirstProfitChallenge(page);
	await advanceChallengeDay(page);
	await expect(challengeStatus(page)).toContainText('Day 2 of 14');

	const menu = await openChallengeMenu(page);
	await menu.getByRole('button', { name: 'Return to sandbox', exact: true }).click();
	await expect(challengeRoot(page)).toHaveAttribute('data-play-mode', 'sandbox');
	await expect(activeMapCanvas(page)).toHaveAttribute('data-store-sprite-count', '0');

	await resumeFirstProfitChallenge(page, { day: 2, eligibility: 'Ranked' });
	const snapshot = await readChallengeSnapshot(page);
	expect(snapshot.activeRunsByScenarioId['first-profit']?.game).toMatchObject({ day: 2 });
});

test('challenge completes the deterministic reference run and persists its ranked best', async ({
	page
}) => {
	const activeRun = advanceActiveChallengeToDay(firstProfitReferenceRun(), 3);
	await installChallengeSnapshot(page, challengeSnapshot({ activeRun }));
	await resumeFirstProfitChallenge(page, { day: 3, eligibility: 'Ranked' });

	await advanceChallengeDay(page);

	const results = page.getByRole('dialog', { name: 'Challenge results' });
	await expect(results).toBeVisible();
	await expect(results.getByRole('heading', { name: 'Challenge completed' })).toBeVisible();
	await expect(results).toContainText('Gold · 880 points');
	await expect(results).toContainText('New best recorded');
	await expect(challengeRoot(page)).toHaveAttribute('data-scenario-result', 'completed');
	await expect(challengeRoot(page)).toHaveAttribute('data-scenario-best-updated', 'true');
	const snapshot = await readChallengeSnapshot(page);
	expect(snapshot.activeRunsByScenarioId['first-profit']).toBeUndefined();
	expect(snapshot.bestResultsByDefinitionKey['first-profit@1']?.result).toMatchObject({
		outcome: 'completed',
		eligibility: 'ranked',
		score: 880,
		medal: 'gold'
	});
});

test('challenge fails at the deadline and shows objective evidence', async ({ page }) => {
	const activeRun = advanceActiveChallengeToDay(startChallengeRun('local-lifeline'), 20);
	await installChallengeSnapshot(page, challengeSnapshot({ activeRun }));
	await openChallengeCatalog(page);
	await challengeCard(page, 'Local Lifeline')
		.getByRole('button', { name: 'Resume Local Lifeline', exact: true })
		.click();
	await expect(challengeStatus(page)).toContainText('Day 20 of 21');

	await advanceChallengeDay(page);

	const results = page.getByRole('dialog', { name: 'Challenge results' });
	await expect(results.getByRole('heading', { name: 'Challenge failed' })).toBeVisible();
	await expect(results).toContainText('Deadline triggered on day 21');
	await expect(results).toContainText('Supply local units');
	await expect(results).toContainText('Reach the local supply share');
	await expect(challengeRoot(page)).toHaveAttribute('data-scenario-result', 'failed');
	const snapshot = await readChallengeSnapshot(page);
	expect(snapshot.activeRunsByScenarioId['local-lifeline']).toBeUndefined();
	expect(snapshot.bestResultsByDefinitionKey['local-lifeline@1']).toBeUndefined();
});

test('challenge commits a non-day negative-cash decision before showing failure', async ({
	page
}) => {
	await installChallengeSnapshot(page, challengeSnapshot({ activeRun: negativeCashDecisionRun() }));
	await resumeFirstProfitChallenge(page, { day: 1, eligibility: 'Ranked' });
	await expect(page.getByRole('dialog', { name: 'Challenge results' })).toHaveCount(0);
	await expect(challengeRoot(page)).toHaveAttribute('data-scenario-result', '');

	const decisions = await openManagementPanel(page, 'Decisions');
	await decisions.getByRole('button', { name: /Bulk discount/ }).click();

	const results = page.getByRole('dialog', { name: 'Challenge results' });
	await expect(results.getByRole('heading', { name: 'Challenge failed' })).toBeVisible();
	await expect(results).toContainText('Avoid negative cash');
	await expect(challengeRoot(page)).toHaveAttribute('data-scenario-command-pending', 'false');
	await expect(challengeRoot(page)).toHaveAttribute('data-scenario-result', 'failed');
	const snapshot = await readChallengeSnapshot(page);
	expect(snapshot.activeRunsByScenarioId['first-profit']).toBeUndefined();
});

test('challenge restart restores the official seed and opening state', async ({ page }) => {
	const activeRun = advanceActiveChallengeToDay(startChallengeRun('first-profit'), 2);
	await installChallengeSnapshot(page, challengeSnapshot({ activeRun }));
	await resumeFirstProfitChallenge(page, { day: 2, eligibility: 'Ranked' });

	const menu = await openChallengeMenu(page);
	await menu.getByRole('button', { name: 'Restart challenge', exact: true }).click();

	await expectChallengeReady(page, { day: 1, eligibility: 'Ranked' });
	const snapshot = await readChallengeSnapshot(page);
	const restarted = snapshot.activeRunsByScenarioId['first-profit'];
	expect(restarted?.run.seed).toBe(280_001);
	expect(restarted?.game).toMatchObject({ day: 1, cash: 9_000, reports: [] });
});

test('challenge imports and completes an unranked seed without replacing the ranked best', async ({
	page
}) => {
	const rankedBest = terminalFirstProfitReferenceRun().result!;
	await installChallengeSnapshot(page, challengeSnapshot({ bestResult: rankedBest }));
	await openChallengeCatalog(page);
	const customSeed = 280_004;
	await page
		.getByLabel('Share code')
		.fill(encodeScenarioShareCode({ scenarioId: 'first-profit', version: 1 }, customSeed));
	await page.getByRole('button', { name: 'Import code', exact: true }).click();
	await expectChallengeReady(page, { day: 1, eligibility: 'Unranked' });

	const activeRun = advanceActiveChallengeToDay(firstProfitReferenceRun(customSeed), 3);
	await page.evaluate(({ key, serialized }) => window.localStorage.setItem(key, serialized), {
		key: BROWSER_SCENARIO_STORAGE_KEY,
		serialized: JSON.stringify(challengeSnapshot({ activeRun, bestResult: rankedBest }))
	});
	await page.reload();
	await resumeFirstProfitChallenge(page, { day: 3, eligibility: 'Unranked' });
	await advanceChallengeDay(page);

	const results = page.getByRole('dialog', { name: 'Challenge results' });
	await expect(results.getByRole('heading', { name: 'Challenge completed' })).toBeVisible();
	await expect(results).toContainText('Best unchanged');
	const snapshot = await readChallengeSnapshot(page);
	expect(snapshot.bestResultsByDefinitionKey['first-profit@1']?.result).toEqual(rankedBest);
});

test('challenge reload clears transient failed, unranked, and non-best results without history', async ({
	page
}) => {
	const rankedBest = terminalFirstProfitReferenceRun().result!;

	await installChallengeSnapshot(page, challengeSnapshot({ activeRun: negativeCashDecisionRun() }));
	await resumeFirstProfitChallenge(page, { day: 1, eligibility: 'Ranked' });
	const decisions = await openManagementPanel(page, 'Decisions');
	await decisions.getByRole('button', { name: /Bulk discount/ }).click();
	await expect(page.getByRole('dialog', { name: 'Challenge results' })).toContainText(
		'Challenge failed'
	);
	await page.reload();
	await expect(page.getByRole('dialog', { name: 'Challenge results' })).toHaveCount(0);
	await openChallengeCatalog(page);
	await expect(challengeCard(page, 'First Profit')).not.toContainText('Challenge failed');
	await page.getByRole('button', { name: 'Close challenge catalog' }).click();

	const customRun = advanceActiveChallengeToDay(firstProfitReferenceRun(280_004), 3);
	await page.evaluate(({ key, serialized }) => window.localStorage.setItem(key, serialized), {
		key: BROWSER_SCENARIO_STORAGE_KEY,
		serialized: JSON.stringify(challengeSnapshot({ activeRun: customRun, bestResult: rankedBest }))
	});
	await page.reload();
	await resumeFirstProfitChallenge(page, { day: 3, eligibility: 'Unranked' });
	await advanceChallengeDay(page);
	await expect(page.getByRole('dialog', { name: 'Challenge results' })).toContainText(
		'Challenge completed'
	);
	await page.reload();
	await expect(page.getByRole('dialog', { name: 'Challenge results' })).toHaveCount(0);

	const nonBestRun = advanceActiveChallengeToDay(startChallengeRun('first-profit'), 3);
	await page.evaluate(({ key, serialized }) => window.localStorage.setItem(key, serialized), {
		key: BROWSER_SCENARIO_STORAGE_KEY,
		serialized: JSON.stringify(challengeSnapshot({ activeRun: nonBestRun, bestResult: rankedBest }))
	});
	await page.reload();
	await resumeFirstProfitChallenge(page, { day: 3, eligibility: 'Ranked' });
	await advanceChallengeDay(page);
	await expect(page.getByRole('dialog', { name: 'Challenge results' })).toContainText(
		'Best unchanged'
	);
	await page.reload();
	await expect(page.getByRole('dialog', { name: 'Challenge results' })).toHaveCount(0);
	await openChallengeCatalog(page);
	const card = challengeCard(page, 'First Profit');
	await expect(card).toContainText('Gold · 880 points');
	await expect(card).not.toContainText('682 points');
	await expect(card).not.toContainText('Unranked result');
	const snapshot = await readChallengeSnapshot(page);
	expect(snapshot.activeRunsByScenarioId['first-profit']).toBeUndefined();
	expect(Object.keys(snapshot.bestResultsByDefinitionKey)).toEqual(['first-profit@1']);
});

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
	await expect(reports.getByText('Operating cash flow', { exact: true })).toBeVisible();
});

test('city map renders terrain assets and blocks road and river placement', async ({ page }) => {
	await page.goto('/');

	await expectTerrainAssets(page);

	await clickMapTile(page, 28, 8);
	const roadDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(roadDialog).toBeVisible();
	await expect(roadDialog.getByText(/^Road$/i)).toBeVisible();
	await expect(roadDialog.getByRole('button', { name: /open .* here/i })).toHaveCount(0);
	await page.getByRole('button', { name: /close tile inspector/i }).click();

	await clickMapTile(page, 14, 7);
	const riverDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(riverDialog).toBeVisible();
	await expect(riverDialog.getByText(/^River$/i)).toBeVisible();
	await expect(riverDialog.getByRole('button', { name: /open .* here/i })).toHaveCount(0);
	await page.getByRole('button', { name: /close tile inspector/i }).click();

	const canvas = await expectRetailMapReady(page);
	await chooseRetailBuildTool(page, /build boutique goods/i);
	await clickCanvasTile(page, canvas, 28, 8);
	await expect(page.getByRole('status', { name: /placement status/i })).toContainText(
		/road location/i
	);
	await expect(canvas).toHaveAttribute('data-placement-preview-mode', 'active');
	await expect(canvas).toHaveAttribute('data-placement-invalid-tile-count', /^[1-9]\d*$/);
	await expect(page.getByRole('dialog', { name: /confirm store opening/i })).toHaveCount(0);
	const invalidRoadDialog = page.getByRole('dialog', { name: /tile details/i });
	await expect(invalidRoadDialog.getByRole('heading', { name: /tile 28, 8/i })).toBeVisible();
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
	await expect(page.locator('[aria-label="Cash"]')).toContainText(/\$[0-9,]+/);
});

async function expectOverlayToCoverMap(page: Page) {
	const canvas = activeMapCanvas(page);
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

	// The map-view tabs are tucked inside the control-desk hamburger popover.
	await page.getByRole('button', { name: /^menu$/i }).click();
	await expect(page.getByRole('button', { name: /world map/i })).toBeEnabled();
	await expect(page.getByRole('button', { name: /retail city map/i })).toBeEnabled();
	await expect(page.getByRole('button', { name: /industry city map/i })).toBeEnabled();
	await page.getByRole('button', { name: /^menu$/i }).click();

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

test('keyboard shortcuts toggle build, switch views, and Esc closes the hamburger', async ({
	page
}) => {
	await page.goto('/');
	// Wait for the scene to boot so the window keydown handler is mounted before
	// dispatching shortcuts, otherwise the first keypress races hydration.
	await expectRetailMapReady(page);

	// "B" toggles the build menu open, then closed.
	await page.keyboard.press('b');
	await expect(page.getByRole('dialog', { name: /build menu/i })).toBeVisible();
	await page.keyboard.press('b');
	await expect(page.getByRole('dialog', { name: /build menu/i })).toHaveCount(0);

	// Number keys still switch views.
	await page.keyboard.press('2');
	// The view tabs now live in the hamburger popover; open it to read the pressed state.
	await page.getByRole('button', { name: /^menu$/i }).click();
	await expect(page.getByRole('button', { name: /industry city map/i })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	// Escape closes the hamburger menu.
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: /industry city map/i })).toHaveCount(0);
});

test('Escape toggles the hamburger menu when nothing else is open', async ({ page }) => {
	await page.goto('/');
	await expectRetailMapReady(page);

	// With no overlay or selection active, Escape opens the hamburger menu.
	await expect(page.getByRole('button', { name: /^menu$/i })).toHaveAttribute(
		'aria-expanded',
		'false'
	);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: /retail city map/i })).toBeVisible();

	// A second Escape closes it again — the key toggles the menu.
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: /retail city map/i })).toHaveCount(0);
});

test('Escape closes the alerts popover', async ({ page }) => {
	await page.goto('/');
	await expectRetailMapReady(page);

	// Open the top-bar alerts popover, then dismiss it with Escape.
	await page.getByRole('button', { name: /^alerts/i }).click();
	await expect(page.getByRole('group', { name: /alerts list/i })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('group', { name: /alerts list/i })).toHaveCount(0);
});

test('? toggles the shortcut cheat sheet open and closed', async ({ page }) => {
	await page.goto('/');
	await expectRetailMapReady(page);

	// "?" opens the cheat sheet.
	await page.keyboard.press('?');
	await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();

	// "?" again closes it — the key is a true toggle, not open-only.
	await page.keyboard.press('?');
	await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toHaveCount(0);
});

test('management panels open before founding a store', async ({ page }) => {
	await page.goto('/');
	await expectRetailMapReady(page);

	// No store founded yet — the Dashboard still opens on its empty starter state.
	await page.keyboard.press('d');
	await expect(page.getByRole('dialog', { name: /dashboard/i })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /dashboard/i })).toHaveCount(0);
});

test('modifier + shortcut key is left to the browser', async ({ page }) => {
	await page.goto('/');
	await expectRetailMapReady(page);

	// Ctrl/Cmd + D must NOT open the Dashboard — the browser keeps its own shortcut.
	await page.keyboard.press('Control+d');
	await expect(page.getByRole('dialog', { name: /dashboard/i })).toHaveCount(0);
	await page.keyboard.press('Meta+d');
	await expect(page.getByRole('dialog', { name: /dashboard/i })).toHaveCount(0);

	// A plain "d" still opens it — proving the modifier is the only thing guarding it.
	await page.keyboard.press('d');
	await expect(page.getByRole('dialog', { name: /dashboard/i })).toBeVisible();
});

test('management panel shortcuts toggle their panels', async ({ page }) => {
	await page.goto('/');
	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	// "D" toggles the Dashboard panel open, then closed.
	await page.keyboard.press('d');
	await expect(page.getByRole('dialog', { name: /dashboard/i })).toBeVisible();
	await page.keyboard.press('d');
	await expect(page.getByRole('dialog', { name: /dashboard/i })).toHaveCount(0);

	// A different mnemonic switches straight to another panel; Esc closes it.
	await page.keyboard.press('r');
	await expect(page.getByRole('dialog', { name: /reports/i })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: /reports/i })).toHaveCount(0);
});

test('audio controls persist as local app preferences', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: /^menu$/i }).click();
	const audioSettings = page.getByRole('group', { name: /audio settings/i });
	await expect(audioSettings).toBeVisible();

	const bgmToggle = audioSettings.getByRole('checkbox', { name: 'BGM' });
	const sfxToggle = audioSettings.getByRole('checkbox', { name: 'SFX' });
	await bgmToggle.uncheck();
	await sfxToggle.uncheck();

	await page.reload();
	await page.getByRole('button', { name: /^menu$/i }).click();
	const audioSettingsAfterReload = page.getByRole('group', { name: /audio settings/i });

	await expect(audioSettingsAfterReload.getByRole('checkbox', { name: 'BGM' })).not.toBeChecked();
	await expect(audioSettingsAfterReload.getByRole('checkbox', { name: 'SFX' })).not.toBeChecked();

	const stored = await page.evaluate(() => localStorage.getItem('serpens.audioPreferences.v1'));
	expect(stored).toContain('"bgmEnabled":false');
	expect(stored).toContain('"sfxEnabled":false');
});

test('switches language without resetting game state', async ({ page }) => {
	await page.goto('/');
	await expectRetailMapReady(page);
	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	await page.getByTestId('game-menu-trigger').click();
	await page.getByTestId('language-selector').selectOption('ja');

	await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
	await expect(page.getByTestId('game-menu-trigger')).toBeVisible();
	await expect(page.getByTestId('language-selector')).not.toBeVisible();
	await expect(activeMapCanvas(page)).toHaveAttribute('data-store-sprite-count', '1');

	await page.getByTestId('game-menu-trigger').click();
	await expect(page.getByTestId('language-selector')).toHaveValue('ja');
	await expect(page.getByTestId('cash-readout')).toBeVisible();
	await expect(activeMapCanvas(page)).toHaveAttribute('data-terrain-asset-mode', 'image');
});

test('player can switch to the industry city map and back to retail', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.map-canvas canvas')).toHaveCount(1);

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	await openMapMenuItem(page, /industry city map/i);
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	const industryCanvas = await expectIndustryMapReady(page);
	await expect(page.locator('.map-canvas canvas')).toHaveCount(2);
	const resourceCount = Number(await industryCanvas.getAttribute('data-industry-resource-count'));
	expect(resourceCount).toBeGreaterThan(0);

	const industryInspector = page.getByRole('dialog', { name: /industry tile details/i });

	await clickCanvasTile(page, industryCanvas, INDUSTRY_INSPECT_TILE.x, INDUSTRY_INSPECT_TILE.y);
	await expect(
		industryInspector.getByRole('heading', {
			name: industryTileHeadingRegex(INDUSTRY_INSPECT_TILE.x, INDUSTRY_INSPECT_TILE.y)
		})
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
	await clickCanvasTile(page, industryCanvas, INDUSTRY_INSPECT_TILE.x, INDUSTRY_INSPECT_TILE.y);
	await expect(page.getByRole('status', { name: /placement status/i })).toContainText(
		/requires water source/i
	);
	await expect(industryCanvas).toHaveAttribute('data-placement-preview-mode', 'active');
	await expect(industryCanvas).toHaveAttribute('data-placement-invalid-tile-count', /^[1-9]\d*$/);
	await expect(page.getByRole('dialog', { name: /confirm industrial build/i })).toHaveCount(0);
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '0');
	await expect(
		industryInspector.getByRole('heading', {
			name: industryTileHeadingRegex(INDUSTRY_INSPECT_TILE.x, INDUSTRY_INSPECT_TILE.y)
		})
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
		x: WATER_SOURCE_TILE.x,
		y: WATER_SOURCE_TILE.y,
		buildingName: /build water pump/i,
		expectedBuildingCount: 1
	});
	expect(await readCompanyCash(page)).toBeLessThan(cashBeforeBuild);

	await clickCanvasTile(page, industryCanvas, WATER_SOURCE_TILE.x, WATER_SOURCE_TILE.y);
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
	await expect(autoSave.getByText(/Day 1 · 1 store/i)).toBeVisible();
	await expect(savePanel.getByRole('button', { name: /^Resume$/i })).toBeEnabled();
	await savePanel.getByRole('button', { name: /^Resume$/i }).click();
	await expect(savePanel.getByRole('status')).toContainText(/Loaded auto-save/i);
	await savePanel.getByRole('button', { name: /^close$/i }).click();
	await expectIndustryMapReady(page);
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '1');

	await openMapMenuItem(page, /retail city map/i);
	await expect(page.getByRole('heading', { name: /harbor city/i })).toBeVisible();
	await expectRetailMapReady(page);
	await expect(page.locator('.map-canvas canvas')).toHaveCount(2);
	await expect(activeMapCanvas(page)).toHaveAttribute('data-store-sprite-count', '1');
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
	await expect(buildMenu.getByText(/open a retail store to unlock construction/i)).toBeVisible();
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

test('player builds convenience production and refills from city inventory', async ({ page }) => {
	// This is the longest e2e test: it founds a retail store, switches to the
	// industry city, advances 5 days, builds 3 industrial buildings, advances
	// to the weekly import cycle, returns to retail, tunes stock settings, and
	// verifies the full city-inventory-to-store flow across 3 management panels. On CI
	// runners the cumulative wait exceeds the default 60s timeout, so allow
	// extra time.
	test.setTimeout(120_000);
	// Width must exceed the control desk's 980px breakpoint so the management
	// launchers (Reports, Stores, Product Chains) stay on the desk. Height keeps
	// the industry map tall enough for the build tiles used below.
	await page.setViewportSize({ width: 1200, height: 1000 });
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});
	await waitForAutoSaveDay(page, 1);
	// The warehouse building, water pump, water bottler, and rail link exceed starter
	// cash; grant funds up front like the other industrial-build tests.
	await injectCashAndReload(page, 1_000_000);

	await openMapMenuItem(page, /industry city map/i);
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	const industryCanvas = await expectIndustryMapReady(page);

	for (let day = 1; day < 6; day += 1) {
		await page.getByRole('button', { name: /^advance day$/i }).click();
		await waitForAutoSaveDay(page, day + 1);
	}

	await buildIndustryBuildingAt(page, industryCanvas, {
		x: INDUSTRIAL_BUILD_TILES[0]!.x,
		y: INDUSTRIAL_BUILD_TILES[0]!.y,
		buildingName: /build warehouse/i,
		expectedBuildingCount: 1
	});
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: WATER_SOURCE_TILE.x,
		y: WATER_SOURCE_TILE.y,
		buildingName: /build water pump/i,
		expectedBuildingCount: 2
	});
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: INDUSTRIAL_BUILD_TILES[1]!.x,
		y: INDUSTRIAL_BUILD_TILES[1]!.y,
		buildingName: /build water bottler/i,
		expectedBuildingCount: 3
	});
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '3');

	// Rail-gated city inventory flow: a producer's output only reaches the shared
	// city inventory across a rail link. Connect the water-bottler (origin) to the
	// warehouse building (destination) — both industrial-district tiles on the same
	// side of the internal separator — so bottled water accumulates in city inventory
	// for the retail store to draw on. Destination selection is two-step
	// (select target → re-click same building to confirm; see handleRailBuildTileClick).
	await page.getByRole('button', { name: /build rail/i }).click();
	const railStatus = page.getByRole('status', { name: /placement status/i });
	await expect(railStatus).toContainText(/select the first building/i);
	await clickCanvasTile(
		page,
		industryCanvas,
		INDUSTRIAL_BUILD_TILES[1]!.x,
		INDUSTRIAL_BUILD_TILES[1]!.y
	);
	await expect(railStatus).toContainText(/select waypoints, then the destination building/i);
	await clickCanvasTile(
		page,
		industryCanvas,
		INDUSTRIAL_BUILD_TILES[0]!.x,
		INDUSTRIAL_BUILD_TILES[0]!.y
	);
	// First destination click only previews; confirm cost summary stays visible.
	await expect(railStatus).toContainText(/new cells/i);
	await clickCanvasTile(
		page,
		industryCanvas,
		INDUSTRIAL_BUILD_TILES[0]!.x,
		INDUSTRIAL_BUILD_TILES[0]!.y
	);
	await expect(railStatus).toHaveCount(0);
	await expect(industryCanvas).toHaveAttribute('data-rail-cell-count', /^[1-9]\d*$/);

	await page.getByRole('button', { name: /^advance day$/i }).click();
	await waitForAutoSaveDay(page, 7);
	await expect(industryCanvas).toHaveAttribute('data-industry-building-count', '3');
	await clickCanvasTile(
		page,
		industryCanvas,
		INDUSTRIAL_BUILD_TILES[0]!.x,
		INDUSTRIAL_BUILD_TILES[0]!.y
	);
	const visibleCityInventoryBottledWater = await readCityInventoryMaterialQuantity(
		page,
		'Bottled Water'
	);
	expect(visibleCityInventoryBottledWater).toBeGreaterThan(0);

	await openMapMenuItem(page, /retail city map/i);
	await expect(page.getByRole('heading', { name: /harbor city/i })).toBeVisible();
	await expectRetailMapReady(page);
	await clickMapTile(page, 1, 6);
	const inspector = page.getByRole('dialog', { name: /tile details/i });
	await expect(inspector).toBeVisible();
	const storeModal = await openStoreDetail(page);
	await expect(storeModal.getByRole('table', { name: /Store #1 stock/i })).toBeVisible();
	await setStoreProductNumber(storeModal, /reorder threshold for bottled water/i, 10);
	await setStoreProductNumber(storeModal, /target stock for bottled water/i, 25);
	await storeModal.getByRole('button', { name: /close store details/i }).click();
	await expect(storeModal).toHaveCount(0);

	const preWeeklyGame = await waitForSavedProductSettings(page, 'bottled-water', {
		day: 7,
		reorderThreshold: 10,
		targetStock: 25
	});
	const preWeeklyBottledWater = getSavedProduct(preWeeklyGame, 'bottled-water');
	await page.getByRole('button', { name: /^advance day$/i }).click();
	const postWeeklyGame = await waitForAutoSaveDay(page, 8);
	const latestReport = getLatestReport(postWeeklyGame);
	const storeReport = latestReport.storeReports[0];
	const bottledWaterReport = storeReport?.productReports.find(
		(report) => report.categoryId === 'bottled-water'
	);

	if (!storeReport || !bottledWaterReport) {
		throw new Error('Missing latest Bottled Water report');
	}

	const stockBeforeRefill = Math.max(0, preWeeklyBottledWater.stock - bottledWaterReport.unitsSold);
	const neededUnits =
		stockBeforeRefill < preWeeklyBottledWater.reorderThreshold
			? Math.max(0, preWeeklyBottledWater.targetStock - stockBeforeRefill)
			: 0;

	expect(neededUnits).toBeGreaterThan(0);
	expect(bottledWaterReport.endingStock).toBe(preWeeklyBottledWater.targetStock);
	// The rail-fed city inventory supplies part of the weekly refill and external imports
	// cover the rest. A level-1 rail moves ~1 unit/day, far below the store's
	// weekly need, so both sources are exercised and together they exactly meet
	// the refill quantity (the store always refills to target).
	expect(bottledWaterReport.warehouseUnits).toBeGreaterThan(0);
	expect(bottledWaterReport.importedUnits).toBeGreaterThan(0);
	expect(bottledWaterReport.warehouseUnits + bottledWaterReport.importedUnits).toBe(neededUnits);
	expect(bottledWaterReport.importSpend).toBe(
		bottledWaterReport.importedUnits * bottledWaterReport.importCost
	);
	expect(
		sumMaterialMovementQuantity(
			latestReport.productionReport.warehousePulls,
			'bottled-water',
			'warehouse'
		)
	).toBe(bottledWaterReport.warehouseUnits);
	expect(
		sumMaterialMovementQuantity(
			latestReport.productionReport.shopImports,
			'bottled-water',
			'import'
		)
	).toBe(bottledWaterReport.importedUnits);

	const reports = await openManagementPanel(page, /reports/i);
	const railShipmentUnits = latestReport.productionReport.railShipments.reduce(
		(total, shipment) => total + shipment.quantity,
		0
	);
	const railShipmentsMetric = reports.getByText('Rail shipments', { exact: true }).locator('..');
	await expect(railShipmentsMetric.locator('strong')).toHaveText(String(railShipmentUnits));
	await reports.getByRole('button', { name: /close reports/i }).click();
	await expect(reports).toHaveCount(0);
	const storesPanel = await openManagementPanel(page, /stores/i);
	const productSources = storesPanel.getByRole('list', {
		name: /Store #1 product source split/i
	});
	await expect(productSources.getByText('Bottled Water')).toBeVisible();
	await expect(
		productSources.getByText(`${bottledWaterReport.warehouseUnits} local supply`)
	).toBeVisible();
	await expect(
		productSources.getByText(`${bottledWaterReport.importedUnits} external imports`)
	).toBeVisible();
	await expect(
		storesPanel.locator('article').filter({
			hasText: new RegExp(
				`^Store #1[\\s\\S]*External imports\\s+\\$${escapeRegExp(
					bottledWaterReport.importSpend.toLocaleString('en-US')
				)}`
			)
		})
	).toBeVisible();
	await storesPanel.getByRole('button', { name: /close stores/i }).click();
	// Wait for the Stores overlay to fully unmount before opening the next
	// panel; on slower CI runners the Svelte DOM update can lag just enough
	// for the control-desk button to be briefly non-interactable.
	await expect(storesPanel).toHaveCount(0);
	const productChains = await openManagementPanel(page, /product chains/i);
	await expect(productChains).toBeVisible();
	await expect(productChains.getByTestId('category-stamp-bottled-water')).toBeVisible();
	await expect(productChains.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();
	await productChains.getByTestId('category-stamp-snacks').click();
	await expect(productChains.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();
	await productChains.getByRole('button', { name: 'City inventory flow' }).click();
	await expect(productChains.getByTestId('product-chain-graph-warehouse-flow')).toBeVisible();
	await expect(productChains.getByRole('heading', { name: 'City inventory flow' })).toBeVisible();
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
	await expect(staffDialog.getByText('Store #1: 1/1 managers, 2/2 general')).toBeVisible();
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
		.selectOption({ label: 'Store #1' });

	await expect(staffDialog.getByText('Store #1: 1/1 managers, 3/2 general')).toBeVisible();
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
	// Store #1 occupies the 2x2 footprint anchored at (1,6) — tiles (1,6),
	// (2,6), (1,7), (2,7) — so the second store's anchor must avoid that
	// footprint. (3,6) is the nearest valid 2x2 electronics anchor.
	await clickCanvasTile(page, mapCanvas, 3, 6);
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

	await revealCityAndGrantFunds(page, 'campus-junction');

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

test('finance flow borrows, reconciles a scheduled payment, focuses its alert, and repays', async ({
	page
}) => {
	await page.goto('/');
	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build boutique goods/i,
		expectedStoreCount: 1
	});
	await waitForAutoSaveDay(page, 1);

	const beforeBorrow = await readAutoSaveGame(page);
	await page.keyboard.press('f');
	const finance = page.getByRole('dialog', { name: 'Finance' });
	await expect(finance).toBeVisible();
	await finance.getByRole('button', { name: '28 days', exact: true }).click();
	await finance.getByLabel('Borrow amount').fill('1000');
	await finance.getByRole('button', { name: 'Review borrowing', exact: true }).click();
	await expect(finance.getByRole('heading', { name: 'Review borrowing' })).toBeVisible();
	await finance.getByRole('button', { name: 'Confirm borrowing', exact: true }).click();

	await expect
		.poll(async () => (await readAutoSaveGame(page)).finance.loans.length)
		.toBe(beforeBorrow.finance.loans.length + 1);
	const afterBorrow = await readAutoSaveGame(page);
	const workingCapitalLoan = afterBorrow.finance.loans.find(
		(loan) => loan.purpose === 'workingCapital'
	);
	if (!workingCapitalLoan) throw new Error('Working-capital loan was not saved.');
	expect(afterBorrow.cash).toBe(beforeBorrow.cash + 1_000);
	expect(workingCapitalLoan).toMatchObject({
		originalPrincipal: 1_000,
		remainingPrincipal: 1_000,
		status: 'active'
	});
	const scheduledWorkingCapitalPrincipal = getScheduledPrincipalForInstallment(
		workingCapitalLoan,
		workingCapitalLoan.installmentsProcessed
	);
	await expect(finance.getByText('Loan disbursement', { exact: true })).toBeVisible();
	await finance.getByRole('button', { name: /close finance/i }).click();
	await expect(finance).toHaveCount(0);

	// Close days 1 through 8 so the day-8 scheduled payment is recorded.
	for (let day = 0; day < 8; day += 1) {
		await page.getByRole('button', { name: 'Advance day', exact: true }).click();
	}
	const afterScheduledPayment = await waitForAutoSaveDay(page, 9);
	const scheduledReport = afterScheduledPayment.reports.find((report) => report.day === 8);
	if (!scheduledReport) throw new Error('Expected the day-8 scheduled-payment report.');
	const scheduledWorkingCapitalLoan = afterScheduledPayment.finance.loans.find(
		(loan) => loan.id === workingCapitalLoan.id
	);
	if (!scheduledWorkingCapitalLoan)
		throw new Error('Working-capital loan disappeared after service.');
	expect(scheduledWorkingCapitalLoan.remainingPrincipal).toBe(
		workingCapitalLoan.remainingPrincipal - scheduledWorkingCapitalPrincipal
	);
	expect(scheduledWorkingCapitalLoan.nextPaymentDay).toBe(workingCapitalLoan.nextPaymentDay! + 7);
	expect(
		afterScheduledPayment.finance.transactions.some(
			(transaction) =>
				transaction.loanId === workingCapitalLoan.id &&
				transaction.kind === 'principalPayment' &&
				transaction.principalAmount === scheduledWorkingCapitalPrincipal
		)
	).toBe(true);
	expect(scheduledReport.principalRepaid).toBeGreaterThan(0);
	expect(scheduledReport.financingCashFlow).toBeLessThan(0);
	expect(scheduledReport.cashAfter - scheduledReport.cashBefore).toBe(
		scheduledReport.operatingCashFlow + scheduledReport.financingCashFlow
	);
	expect(scheduledReport.netCashChange).toBe(
		scheduledReport.operatingCashFlow + scheduledReport.financingCashFlow
	);

	const reports = await openManagementPanel(page, /reports/i);
	await expect(
		reports.getByText('Operating cash flow', { exact: true }).locator('..')
	).toContainText(`$${scheduledReport.operatingCashFlow.toLocaleString('en-US')}`);
	await expect(
		reports.getByText('Financing cash flow', { exact: true }).locator('..')
	).toContainText(
		scheduledReport.financingCashFlow < 0
			? `-$${Math.abs(scheduledReport.financingCashFlow).toLocaleString('en-US')}`
			: `$${scheduledReport.financingCashFlow.toLocaleString('en-US')}`
	);
	await reports.getByRole('button', { name: /close reports/i }).click();

	// Closing days 9–11 leaves the next day-15 payment inside the three-day
	// alert window while retaining the already-verified payment report above.
	for (let day = 0; day < 3; day += 1) {
		await page.getByRole('button', { name: 'Advance day', exact: true }).click();
	}
	const alertWindowGame = await waitForAutoSaveDay(page, 12);
	const alertWindowLoan = alertWindowGame.finance.loans.find(
		(loan) => loan.id === workingCapitalLoan.id
	);
	if (!alertWindowLoan) throw new Error('Working-capital loan disappeared before its alert.');

	await page.getByRole('button', { name: /^\d+ alerts?$/i }).click();
	const alerts = page.getByRole('group', { name: 'Alerts list' });
	const scheduledWorkingCapitalPayment =
		estimateNextLoanPayment(alertWindowLoan).toLocaleString('en-US');
	const expectedWorkingCapitalAlertName = new RegExp(
		`^Working capital payment of ${escapeRegExp(`$${scheduledWorkingCapitalPayment}`)} is due on day ${alertWindowLoan.nextPaymentDay}\\.$`
	);
	const upcomingLoanAlert = alerts.getByRole('button', {
		name: expectedWorkingCapitalAlertName,
		exact: true
	});
	await expect(upcomingLoanAlert).toHaveCount(1);
	await upcomingLoanAlert.click();
	await expect(finance).toBeVisible();
	const focusedLoan = page.locator(`#finance-loan-${workingCapitalLoan.id}`);
	await expect(focusedLoan).toBeFocused();

	const beforeRepayment = await readAutoSaveGame(page);
	const principalBeforeRepayment = beforeRepayment.finance.loans.find(
		(loan) => loan.id === workingCapitalLoan.id
	)?.remainingPrincipal;
	if (principalBeforeRepayment === undefined) throw new Error('Working-capital loan disappeared.');
	const transactionIdsBeforeRepayment = new Set(
		beforeRepayment.finance.transactions.map((transaction) => transaction.id)
	);
	await focusedLoan.getByLabel('Repay amount').fill('100');
	await focusedLoan.getByRole('button', { name: 'Review repayment', exact: true }).click();
	await expect(finance.getByRole('heading', { name: 'Review repayment' })).toBeVisible();
	await finance.getByRole('button', { name: 'Confirm repayment', exact: true }).click();

	await expect
		.poll(async () => {
			const saved = await readAutoSaveGame(page);
			return saved.finance.transactions
				.filter(
					(transaction) =>
						!transactionIdsBeforeRepayment.has(transaction.id) &&
						transaction.loanId === workingCapitalLoan.id &&
						(transaction.kind === 'interestPayment' || transaction.kind === 'principalPayment')
				)
				.reduce(
					(total, transaction) => total + transaction.interestAmount + transaction.principalAmount,
					0
				);
		})
		.toBe(100);
	const afterRepayment = await readAutoSaveGame(page);
	const repaidLoan = afterRepayment.finance.loans.find((loan) => loan.id === workingCapitalLoan.id);
	const repaymentTransactions = afterRepayment.finance.transactions.filter(
		(transaction) =>
			!transactionIdsBeforeRepayment.has(transaction.id) &&
			transaction.loanId === workingCapitalLoan.id
	);
	expect(
		repaymentTransactions.every(
			(transaction) =>
				transaction.kind === 'interestPayment' || transaction.kind === 'principalPayment'
		)
	).toBe(true);
	const principalPaid = repaymentTransactions.reduce(
		(total, transaction) => total + transaction.principalAmount,
		0
	);
	const interestPaid = repaymentTransactions.reduce(
		(total, transaction) => total + transaction.interestAmount,
		0
	);
	expect(principalPaid + interestPaid).toBe(100);
	expect(repaidLoan?.remainingPrincipal).toBe(principalBeforeRepayment - principalPaid);
	await expect(finance.getByText('Repayment confirmed.', { exact: true })).toBeVisible();
});

test('financed expansion opens one city with its exact shortfall and no cash-out', async ({
	page
}) => {
	await page.goto('/');
	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build boutique goods/i,
		expectedStoreCount: 1
	});
	await waitForAutoSaveDay(page, 1);
	await revealCityAndGrantFunds(page, 'campus-junction', 17_000);

	const beforeFinancing = await readAutoSaveGame(page);
	await openMapMenuItem(page, /world map/i);
	await page.getByRole('button', { name: /campus junction/i }).click();
	await page.getByRole('button', { name: 'Finance opening', exact: true }).click();
	const review = page.getByRole('dialog', { name: 'Review financing' });
	await expect(review).toBeVisible();
	await expect(review.getByText('Purchase cost', { exact: true }).locator('..')).toContainText(
		'$18,000'
	);
	await expect(review.getByText('Cash', { exact: true }).locator('..')).toContainText('$17,000');
	await expect(review.getByText('Cash shortfall', { exact: true }).locator('..')).toContainText(
		'$1,000'
	);
	await expect(review).toContainText('84 days');
	await review.getByRole('button', { name: 'Confirm financing', exact: true }).click();

	await expect
		.poll(async () => (await readAutoSaveGame(page)).world.openedCityIds)
		.toContain('campus-junction');
	const afterFinancing = await readAutoSaveGame(page);
	const priorLoanIds = new Set(beforeFinancing.finance.loans.map((loan) => loan.id));
	const priorTransactionIds = new Set(
		beforeFinancing.finance.transactions.map((transaction) => transaction.id)
	);
	const newExpansionLoans = afterFinancing.finance.loans.filter(
		(loan) => !priorLoanIds.has(loan.id)
	);
	const newTransactions = afterFinancing.finance.transactions.filter(
		(transaction) => !priorTransactionIds.has(transaction.id)
	);
	expect(afterFinancing.world.openedCityIds).toEqual(
		expect.arrayContaining([...beforeFinancing.world.openedCityIds, 'campus-junction'])
	);
	expect(afterFinancing.world.openedCityIds).toHaveLength(
		beforeFinancing.world.openedCityIds.length + 1
	);
	expect(afterFinancing.finance.loans).toHaveLength(beforeFinancing.finance.loans.length + 1);
	expect(afterFinancing.finance.transactions).toHaveLength(
		beforeFinancing.finance.transactions.length + 1
	);
	expect(afterFinancing.finance.nextLoanSequence).toBe(
		beforeFinancing.finance.nextLoanSequence + 1
	);
	expect(afterFinancing.finance.nextTransactionSequence).toBe(
		beforeFinancing.finance.nextTransactionSequence + 1
	);
	expect(newExpansionLoans).toHaveLength(1);
	expect(newExpansionLoans[0]).toMatchObject({
		purpose: 'expansion',
		originalPrincipal: 1_000,
		remainingPrincipal: 1_000,
		status: 'active'
	});
	expect(afterFinancing.cash).toBe(0);
	expect(newTransactions).toEqual([
		expect.objectContaining({
			loanId: newExpansionLoans[0]?.id,
			kind: 'disbursement',
			cashDelta: 1_000,
			principalAmount: 1_000,
			interestAmount: 0
		})
	]);
});

test('cross-city stock alert deep-links to the origin city and tile', async ({ page }) => {
	await page.goto('/');

	// Start in harbor-city with one store so campus-junction's reveal condition
	// (stores.length >= 2) is within reach after we force-reveal it.
	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	// Force-reveal campus-junction and grant enough cash/storeCap to open it.
	await revealCityAndGrantFunds(page, 'campus-junction');

	// Open campus-junction and build a store there.
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

	// Switch the active city back to harbor-city and starve the campus-junction
	// store's stock so a store-stock alert fires from the non-active city.
	await page.evaluate(() => {
		const serialized = window.localStorage.getItem('serpens.saves.v2');
		if (!serialized) {
			throw new Error('Missing save data');
		}
		const saveStore = JSON.parse(serialized);
		const game = saveStore.autoSave.game;
		game.activeCityId = 'harbor-city';
		const campusStore = game.stores.find(
			(store: { cityId: string }) => store.cityId === 'campus-junction'
		);
		if (!campusStore) {
			throw new Error('Missing campus-junction store');
		}
		for (const product of campusStore.products) {
			product.stock = 0;
		}
		window.localStorage.setItem('serpens.saves.v2', JSON.stringify(saveStore));
	});
	await page.reload();
	await openSaves(page);
	await page.getByRole('button', { name: /^resume$/i }).click();
	await page
		.getByRole('dialog', { name: /saves/i })
		.getByRole('button', { name: /^close$/i })
		.click();

	// Active city is harbor-city; the alerts popover should list the
	// campus-junction stock alert. Clicking it deep-links back to campus-junction.
	await expect(page.getByRole('heading', { name: /harbor city/i })).toBeVisible();
	await page.getByRole('button', { name: /alerts?$/i }).click();
	const alertsList = page.getByRole('group', { name: /alerts list/i });
	await expect(alertsList).toBeVisible();
	await alertsList
		.getByRole('button', { name: /out of stock/i })
		.first()
		.click();

	// The map should switch to campus-junction and select the store's tile.
	await expect(page.getByRole('heading', { name: /campus junction/i })).toBeVisible();
	await expect(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
});

test('manage selected store stock and see weekly imports', async ({ page }) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	const mapCanvas = activeMapCanvas(page);
	await expect(mapCanvas).toHaveAttribute('data-store-sprite-count', '1');

	await clickMapTile(page, 1, 6);
	const inspector = page.getByRole('dialog', { name: /tile details/i });
	await expect(inspector).toBeVisible();
	// The basic card carries no in-line tabs or stock table — those moved to the detail modal.
	await expect(inspector.getByRole('tab', { name: /stock/i })).toHaveCount(0);
	await expect(inspector.getByRole('table', { name: /Store #1 stock/i })).toHaveCount(0);
	const openDetails = inspector.getByRole('button', { name: /open details/i });
	await openDetails.scrollIntoViewIfNeeded();
	const [openDetailsBox, controlDeskBox] = await Promise.all([
		openDetails.boundingBox(),
		page.getByLabel('Control desk').boundingBox()
	]);
	if (!openDetailsBox || !controlDeskBox) {
		throw new Error('Open Details or control desk has no bounding box');
	}
	expect(openDetailsBox.y + openDetailsBox.height).toBeLessThan(controlDeskBox.y);

	const storeModal = await openStoreDetail(page);
	// The modal opens on the Stock tab by default.
	await expect(storeModal.getByRole('tab', { name: /stock/i })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(storeModal.getByRole('tab', { name: /staff/i })).toHaveAttribute(
		'aria-selected',
		'false'
	);

	const stockPanelLayout = await getStoreDetailPanelLayout(page);
	expect(stockPanelLayout.stock.display).toBe('block');
	expect(stockPanelLayout.chain.display).toBe('none');
	expect(stockPanelLayout.staff.display).toBe('none');

	await expect(storeModal.getByRole('table', { name: /Store #1 stock/i })).toBeVisible();
	await expect(storeModal.getByRole('cell', { name: 'Bottled Water' })).toBeVisible();

	await storeModal.getByRole('tab', { name: /product chain/i }).click();
	const chainPanelLayout = await getStoreDetailPanelLayout(page);
	expect(chainPanelLayout.stock.display).toBe('none');
	expect(chainPanelLayout.chain.display).toBe('block');
	expect(chainPanelLayout.staff.display).toBe('none');
	const productCategorySelect = storeModal.getByLabel('Product category');
	await expect(productCategorySelect).toBeVisible();
	await expect(storeModal.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();
	await productCategorySelect.selectOption('snacks');
	await expect(storeModal.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();

	await storeModal.getByRole('tab', { name: /staff/i }).click();
	const staffPanelLayout = await getStoreDetailPanelLayout(page);
	expect(staffPanelLayout.stock.display).toBe('none');
	expect(staffPanelLayout.chain.display).toBe('none');
	expect(staffPanelLayout.staff.display).toBe('block');

	await storeModal.getByRole('tab', { name: /stock/i }).click();

	const bottledWaterPrice = storeModal.getByRole('spinbutton', {
		name: /selling price for bottled water/i
	});
	await bottledWaterPrice.fill('7');
	await bottledWaterPrice.blur();
	await expect(bottledWaterPrice).toHaveValue('7');

	const bottledWaterTarget = storeModal.getByRole('spinbutton', {
		name: /target stock for bottled water/i
	});
	await bottledWaterTarget.fill('140');
	await bottledWaterTarget.blur();
	await expect(bottledWaterTarget).toHaveValue('140');

	const bottledWaterReorder = storeModal.getByRole('spinbutton', {
		name: /reorder threshold for bottled water/i
	});
	await bottledWaterReorder.fill('100');
	await bottledWaterReorder.blur();
	await expect(bottledWaterReorder).toHaveValue('100');

	await storeModal.getByRole('button', { name: /close store details/i }).click();
	await expect(storeModal).toHaveCount(0);

	for (let day = 0; day < 7; day += 1) {
		await page.getByRole('button', { name: /^advance day$/i }).click();
	}

	const reports = await openManagementPanel(page, /reports/i);
	const importsMetric = reports
		.getByLabel('Reports')
		.locator('.metrics > div')
		.filter({ hasText: /^External imports\s+\$[1-9][\d,]*$/ });
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
	await expect(page.getByText(/Day 1 · 1 store/i)).toBeVisible();

	await page.getByRole('textbox', { name: /slot name/i }).fill('Harbor test');
	await page.getByRole('button', { name: /save slot/i }).click();
	await expect(page.getByText(/Saved Harbor test/i)).toBeVisible();
	await page
		.getByRole('dialog', { name: /saves/i })
		.getByRole('button', { name: /^close$/i })
		.click();

	await page.reload();
	await openSaves(page);
	await expect(page.getByRole('heading', { name: /Harbor test/i })).toBeVisible();
	await page.getByRole('button', { name: /^Load$/i }).click();
	await expect(activeMapCanvas(page)).toHaveAttribute('data-store-sprite-count', '1');
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

async function injectCashAndReload(page: Page, cash: number): Promise<void> {
	await page.evaluate((amount) => {
		const serialized = window.localStorage.getItem('serpens.saves.v2');

		if (!serialized) {
			throw new Error('Missing save data');
		}

		const saveStore = JSON.parse(serialized);
		saveStore.autoSave.game.cash = amount;
		window.localStorage.setItem('serpens.saves.v2', JSON.stringify(saveStore));
	}, cash);
	await page.reload();
	await openSaves(page);
	await page.getByRole('button', { name: /^resume$/i }).click();
	await page
		.getByRole('dialog', { name: /saves/i })
		.getByRole('button', { name: /^close$/i })
		.click();
}

test('player upgrades a store from the tile inspector', async ({ page }) => {
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	await injectCashAndReload(page, 1_000_000);

	await clickMapTile(page, 1, 6);
	const inspector = page.getByRole('dialog', { name: /tile details/i });
	await expect(inspector).toBeVisible();
	await expect(inspector.getByText(/Level 1 \/ 10/i)).toBeVisible();

	const upgradeButton = inspector.getByRole('button', { name: /Upgrade/i });
	await upgradeButton.click();

	await expect(inspector.getByText(/Level 2 \/ 10/i)).toBeVisible();
});

test('store card Open Details stays reachable above the control desk on a narrow viewport', async ({
	page
}) => {
	// At <=980px the inspector is a bottom sheet; the fixed control desk must not
	// cover its Open Details button (regression: the button was obscured and the
	// click was intercepted).
	await page.setViewportSize({ width: 960, height: 800 });
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	await clickMapTile(page, 1, 6);
	const inspector = page.getByRole('dialog', { name: /tile details/i });
	await expect(inspector).toBeVisible();

	const modal = await openStoreDetail(page);
	await expect(modal.getByRole('tab', { name: /stock/i })).toBeVisible();
});

test('store card Open Details clears the three-row control desk just above compact mode', async ({
	page
}) => {
	// At 981–1023px the desktop management launchers remain visible and wrap the
	// Control Desk to three rows. The inspector must reserve that taller footprint
	// until the <=980px compact bottom-sheet rule takes over.
	await page.setViewportSize({ width: 1000, height: 800 });
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	await clickMapTile(page, 1, 6);
	const inspector = page.getByRole('dialog', { name: /tile details/i });
	await expect(inspector).toBeVisible();

	const openDetails = inspector.getByRole('button', { name: /open details/i });
	await openDetails.scrollIntoViewIfNeeded();
	const [openDetailsBox, controlDeskBox] = await Promise.all([
		openDetails.boundingBox(),
		page.getByLabel('Control desk').boundingBox()
	]);
	if (!openDetailsBox || !controlDeskBox) {
		throw new Error('Open Details or control desk has no bounding box');
	}
	expect(openDetailsBox.y + openDetailsBox.height).toBeLessThanOrEqual(controlDeskBox.y);

	await openDetails.click();
	const modal = page.locator('[role="dialog"][aria-modal="true"]');
	await expect(modal.getByRole('tab', { name: /stock/i })).toBeVisible();
});

test('management panels stay reachable from the hamburger menu on a narrow viewport', async ({
	page
}) => {
	// At <=980px the control desk hides the .manage cluster, so the only clickable
	// path to management panels is the hamburger menu. Regression: the menu used to
	// only surface Saves + Audio, leaving Dashboard/Reports/etc. unreachable without
	// keyboard shortcuts on touch/narrow layouts.
	await page.setViewportSize({ width: 960, height: 800 });
	await page.goto('/');
	await expectRetailMapReady(page);

	// The desk management launchers are hidden at this width.
	await expect(page.getByRole('group', { name: /management/i })).not.toBeVisible();

	// The hamburger menu surfaces a Management section that opens the Dashboard.
	await page.getByRole('button', { name: /^menu$/i }).click();
	const menuManagement = page.getByRole('group', { name: /management panels/i });
	await expect(menuManagement).toBeVisible();
	await menuManagement.getByRole('button', { name: /dashboard/i }).click();
	await expect(page.getByRole('dialog', { name: /dashboard/i })).toBeVisible();
});

test('player upgrades an industrial building from the tile inspector', async ({ page }) => {
	// Height must be tall enough that the fixed control-desk footer does not
	// overlap the tile inspector's Upgrade button; at a short viewport the
	// desk's volume sliders intercept the click. (The top-bar location plaque
	// no longer blocks the top-left grain-field placement — it is now
	// pointer-events: none.)
	await page.setViewportSize({ width: 1200, height: 1000 });
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});

	await openMapMenuItem(page, /industry city map/i);
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	const industryCanvas = await expectIndustryMapReady(page);

	await buildIndustryBuildingAt(page, industryCanvas, {
		x: GRAIN_FIELD_TILE.x,
		y: GRAIN_FIELD_TILE.y,
		buildingName: /build grain farm/i,
		expectedBuildingCount: 1
	});

	await injectCashAndReload(page, 1_000_000);

	await openMapMenuItem(page, /industry city map/i);
	const reloadedCanvas = await expectIndustryMapReady(page);

	await clickCanvasTile(page, reloadedCanvas, GRAIN_FIELD_TILE.x, GRAIN_FIELD_TILE.y);
	const industryInspector = page.getByRole('dialog', { name: /industry tile details/i });
	await expect(industryInspector).toBeVisible();
	await expect(industryInspector.getByText(/Level 1 \/ 10/i)).toBeVisible();

	const upgradeButton = industryInspector.getByRole('button', { name: /Upgrade/i });
	await upgradeButton.click();

	await expect(industryInspector.getByText(/Level 2 \/ 10/i)).toBeVisible();
});

test('camera zoom and scroll persist across map view switches', async ({ page }) => {
	await page.goto('/');

	const canvas = await expectRetailMapReady(page);
	const box = await canvas.boundingBox();
	expect(box).toBeDefined();

	// Read the initial camera state (auto-fit values).
	const initialZoom = await canvas.getAttribute('data-map-zoom');
	const initialScrollX = await canvas.getAttribute('data-map-scroll-x');
	const initialScrollY = await canvas.getAttribute('data-map-scroll-y');
	expect(initialZoom).toBeTruthy();

	// Zoom in by scrolling the wheel with negative deltaY over the canvas
	// center. The scene's handleWheel clamps to [MIN_ZOOM, MAX_ZOOM] and
	// sets hasUserAdjustedCamera so the auto-fit no longer overrides it.
	const centerX = box!.x + box!.width / 2;
	const centerY = box!.y + box!.height / 2;
	await page.mouse.move(centerX, centerY);
	await page.mouse.wheel(0, -1000);

	// Wait for the scene to write the new camera attributes.
	await expect(canvas).not.toHaveAttribute('data-map-zoom', initialZoom!);
	const zoomedZoom = await canvas.getAttribute('data-map-zoom');

	// Drag the map to scroll the camera. pointerdown → pointermove → pointerup
	// with movement beyond the click slop triggers handlePointerMove's drag
	// branch, which adjusts cameras.main.scrollX/Y.
	await page.mouse.move(centerX, centerY);
	await page.mouse.down();
	await page.mouse.move(centerX - 80, centerY - 60, { steps: 5 });
	await page.mouse.up();

	// Wait for the scene to write the new scroll attributes. Poll instead
	// of reading once: Phaser writes camera attributes on its next render
	// frame, so an immediate read after mouse.up() can race and observe the
	// pre-drag value.
	await expect(canvas).not.toHaveAttribute('data-map-scroll-x', initialScrollX!);
	await expect(canvas).not.toHaveAttribute('data-map-scroll-y', initialScrollY!);
	const scrolledScrollX = await canvas.getAttribute('data-map-scroll-x');
	const scrolledScrollY = await canvas.getAttribute('data-map-scroll-y');

	// Switch to the industry city map. The retail scene stays alive (keep-alive)
	// so its camera state should be preserved on the hidden canvas.
	await openMapMenuItem(page, /industry city map/i);
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	await expectIndustryMapReady(page);

	// Switch back to the retail city map.
	await openMapMenuItem(page, /retail city map/i);
	await expect(page.getByRole('heading', { name: /harbor city/i })).toBeVisible();
	const restoredCanvas = await expectRetailMapReady(page);

	// The camera zoom and scroll must match the values we set before the
	// view switch, proving the scene instance (and its camera) survived.
	await expect(restoredCanvas).toHaveAttribute('data-map-zoom', zoomedZoom!);
	await expect(restoredCanvas).toHaveAttribute('data-map-scroll-x', scrolledScrollX!);
	await expect(restoredCanvas).toHaveAttribute('data-map-scroll-y', scrolledScrollY!);
});

test('supply advisor recommends and arms a starter build', async ({ page }) => {
	await page.goto('/');

	// Industry construction (and the Supply Advisor button) stays locked until
	// the player founds at least one retail store, so unlock it first.
	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});
	await waitForAutoSaveDay(page, 1);

	await openMapMenuItem(page, /industry city map/i);
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	await expectIndustryMapReady(page);

	await page.getByRole('button', { name: /^build$/i }).click();
	const buildMenu = page.getByRole('dialog', { name: /build menu/i });
	await expect(buildMenu).toBeVisible();

	await buildMenu.getByRole('button', { name: /supply advisor|what should i build/i }).click();
	const advisor = page.getByRole('dialog', { name: /supply advisor/i });
	await expect(advisor).toBeVisible();

	await advisor
		.getByRole('button', { name: /^build /i })
		.first()
		.click();
	await expect(advisor).toHaveCount(0);
	await expect(page.getByText(/choose a highlighted tile to build/i)).toBeVisible();
});

test('rail-fed production connects two industrial buildings and records a rail shipment', async ({
	page
}) => {
	// This exercises rail-fed production between two industrial-district
	// buildings on the same side of the internal separator wall, so a short
	// direct rail path exists with no waypoints — the compact, robust case for
	// a UI-level smoke test. The cross-wall raw -> process case (a grain-farm
	// on a west-side resource tile reaching an east-side flour-mill through a
	// separator crossing) is now possible thanks to the crossings in
	// `isInternalServiceSeparator` and is covered deterministically by the
	// railPlacement.spec `buildRailPreview` acceptance test. Here, flour-mill
	// produces flour into its own local buffer (its grain input is imported,
	// irrelevant to the assertions below, which only look at pantry-works'
	// flour sourcing), and pantry-works consumes that flour from a *different*
	// building over the rail — the same producer/consumer relationship,
	// exercising local buffer -> rail pull -> import fallback,
	// `data-rail-cell-count`, and a recorded `railShipments` entry.
	test.setTimeout(90_000);
	// Width keeps the management launchers on the control desk; height keeps
	// the industry map tall enough for the build tiles used below.
	await page.setViewportSize({ width: 1200, height: 1000 });
	await page.goto('/');

	await buildRetailStoreAt(page, {
		x: 1,
		y: 6,
		storeTypeName: /build convenience store/i,
		expectedStoreCount: 1
	});
	await waitForAutoSaveDay(page, 1);
	// flour-mill (1200) + pantry-works (900) + the rail itself comfortably
	// exceed the starter cash, so grant funds up front like the other
	// industrial-upgrade tests do.
	await injectCashAndReload(page, 1_000_000);

	await openMapMenuItem(page, /industry city map/i);
	await expect(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	const industryCanvas = await expectIndustryMapReady(page);

	const millTile = INDUSTRIAL_BUILD_TILES[0]!;
	const pantryTile = INDUSTRIAL_BUILD_TILES[1]!;

	await buildIndustryBuildingAt(page, industryCanvas, {
		x: millTile.x,
		y: millTile.y,
		buildingName: /build flour mill/i,
		expectedBuildingCount: 1
	});
	await buildIndustryBuildingAt(page, industryCanvas, {
		x: pantryTile.x,
		y: pantryTile.y,
		buildingName: /build pantry works/i,
		expectedBuildingCount: 2
	});

	// Day 1 production: pantry-works has no local flour, no rail connection,
	// and nothing in the shared city inventory, so its whole flour need (6
	// units/day) is imported.
	await page.getByRole('button', { name: /^advance day$/i }).click();
	let game = await waitForAutoSaveDay(page, 2);

	const industryInspector = page.getByRole('dialog', { name: /industry tile details/i });
	await clickCanvasTile(page, industryCanvas, pantryTile.x, pantryTile.y);
	await expect(industryInspector).toBeVisible();
	const pantryDetails = industryInspector.getByRole('region', {
		name: /industrial building details/i
	});
	await expect(
		pantryDetails.getByRole('definition').filter({ hasText: /^Imported inputs$/i })
	).toBeVisible();
	await closeIndustryInspectorIfOpen(page);

	const preRailReport = getLatestReport(game);
	const preRailImportedFlour = sumMaterialMovementQuantity(
		preRailReport.productionReport.importedInputs,
		'flour',
		'import'
	);
	expect(preRailImportedFlour).toBeGreaterThan(0);

	// Build a rail connecting flour-mill (origin) to pantry-works
	// (destination). Both anchors are industrial-district tiles on the same
	// side of the wall described above, so a direct path exists with no
	// waypoints needed. Destination selection is two-step (select target →
	// re-click same building to confirm; see handleRailBuildTileClick).
	await page.getByRole('button', { name: /build rail/i }).click();
	const placementStatus = page.getByRole('status', { name: /placement status/i });
	await expect(placementStatus).toContainText(/select the first building/i);

	await clickCanvasTile(page, industryCanvas, millTile.x, millTile.y);
	await expect(placementStatus).toContainText(/select waypoints, then the destination building/i);

	await clickCanvasTile(page, industryCanvas, pantryTile.x, pantryTile.y);
	// First destination click only previews; confirm cost summary stays visible.
	await expect(placementStatus).toContainText(/new cells/i);
	await clickCanvasTile(page, industryCanvas, pantryTile.x, pantryTile.y);
	await expect(placementStatus).toHaveCount(0);
	await expect(industryCanvas).toHaveAttribute('data-rail-cell-count', /^[1-9]\d*$/);

	// Day 2 production: a freshly-built rail segment is level 1, whose
	// bottleneck capacity is 1 unit/day regardless of path length (the design
	// doc's own test note: "an 8-cell level-1 path moves 1/day"). Pantry-works
	// still needs 6 flour/day, so only 1 unit arrives via rail and 5 remain
	// imported — the status stays 'imported-inputs' rather than flipping to
	// 'produced'. This is the brief's documented fallback: assert the rail
	// cell count, a nonzero rail shipment, and a drop in imports instead of a
	// full status flip.
	await page.getByRole('button', { name: /^advance day$/i }).click();
	game = await waitForAutoSaveDay(page, 3);

	const postRailReport = getLatestReport(game);
	const postRailImportedFlour = sumMaterialMovementQuantity(
		postRailReport.productionReport.importedInputs,
		'flour',
		'import'
	);
	const railFlourShipments = postRailReport.productionReport.railShipments.filter(
		(shipment) => shipment.materialId === 'flour'
	);
	const railFlourQuantity = railFlourShipments.reduce(
		(total, shipment) => total + shipment.quantity,
		0
	);

	expect(railFlourShipments.length).toBeGreaterThan(0);
	expect(railFlourQuantity).toBeGreaterThan(0);
	expect(postRailImportedFlour).toBeLessThan(preRailImportedFlour);
	expect(Object.keys(postRailReport.productionReport.railUsage).length).toBeGreaterThan(0);

	// The consuming building's status is still 'imported-inputs' (per the
	// bottleneck math above), never a synthetic "rail-supplied" status — the
	// spec is explicit that no such status exists.
	await clickCanvasTile(page, industryCanvas, pantryTile.x, pantryTile.y);
	await expect(industryInspector).toBeVisible();
	await expect(
		industryInspector
			.getByRole('region', { name: /industrial building details/i })
			.getByRole('definition')
			.filter({ hasText: /^Imported inputs$/i })
	).toBeVisible();
});

test('city-local inventory keeps multi-city supply, replenishment, reporting, and saves isolated', async ({
	page
}) => {
	test.setTimeout(90_000);
	await installSandboxAutoSave(page, cityLocalInventoryLifecycleGame());

	const stores = await openManagementPanel(page, /stores/i);
	const harborSource = stores.getByRole('combobox', {
		name: 'Local supply source for Harbor City'
	});
	const campusSource = stores.getByRole('combobox', {
		name: 'Local supply source for Campus Junction'
	});
	await expect(harborSource).toHaveValue('__retail_supply_imports_only__');
	await expect(
		stores
			.getByRole('status')
			.filter({ hasText: 'Breadbasket Basin 37 / 200 city inventory used.' })
	).toBeVisible();
	await expect(campusSource).toHaveValue('breadbasket-basin');

	await harborSource.selectOption('industry-city');
	await expect(harborSource).toHaveValue('industry-city');
	await expect
		.poll(async () => (await readAutoSaveGame(page)).retailSupplyAssignments)
		.toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'campus-junction', supplyCityId: 'breadbasket-basin' }
		]);
	await expect(campusSource).toHaveValue('breadbasket-basin');
	await stores.getByRole('button', { name: 'Close Stores' }).click();

	// Day 7 is the weekly cadence. Harbor's 0/10 bottled-water position pulls
	// the 6 local units from Industry City, then imports the 4-unit shortfall.
	await page.getByRole('button', { name: /^advance day$/i }).click();
	const postCycle = await waitForAutoSaveDay(page, 8);
	const harborStore = getSavedStoreInCity(postCycle, 'harbor-city');
	const campusStore = getSavedStoreInCity(postCycle, 'campus-junction');
	const harborProductReport = getLatestReport(postCycle)
		.storeReports.find((report) => report.storeId === harborStore.id)
		?.productReports.find((report) => report.categoryId === 'bottled-water');

	if (!harborProductReport) {
		throw new Error('Missing Harbor City bottled-water replenishment report.');
	}

	expect(harborProductReport).toMatchObject({
		warehouseUnits: 6,
		warehouseValue: 12,
		importedUnits: 4,
		importCost: 2,
		importSpend: 8
	});
	expect(harborStore.products).toMatchObject([
		{ categoryId: 'bottled-water', stock: 10, reorderThreshold: 1, targetStock: 10 }
	]);
	expect(campusStore.products).toMatchObject([
		{ categoryId: 'bottled-water', stock: 50, reorderThreshold: 1, targetStock: 50 }
	]);
	expect(getSavedCityInventory(postCycle, 'industry-city')).toEqual({
		cityId: 'industry-city',
		capacity: 400,
		materials: { 'bottled-water': 0 },
		overflowUnits: 0,
		overflowCost: 0
	});
	expect(getSavedCityInventory(postCycle, 'breadbasket-basin')).toEqual({
		cityId: 'breadbasket-basin',
		capacity: 200,
		materials: { 'bottled-water': 37 },
		overflowUnits: 0,
		overflowCost: 0
	});
	expect(postCycle.retailSupplyAssignments).toEqual([
		{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
		{ retailCityId: 'campus-junction', supplyCityId: 'breadbasket-basin' }
	]);

	const reports = await openManagementPanel(page, /reports/i);
	const productionCloseInventory = reports.getByRole('region', {
		name: 'Production-close inventory (before retail replenishment)'
	});
	const currentInventory = reports.getByRole('region', {
		name: 'Current city inventory (after the latest replenishment)'
	});
	const cityAttributedMovements = reports.getByRole('region', {
		name: 'City-attributed movements'
	});
	await expect(productionCloseInventory).toBeVisible();
	await expect(
		productionCloseInventory.getByText('Industry City: 6 / 400 city inventory used.', {
			exact: true
		})
	).toBeVisible();
	await expect(
		productionCloseInventory.getByText('Breadbasket Basin: 37 / 200 city inventory used.', {
			exact: true
		})
	).toBeVisible();
	await expect(currentInventory).toBeVisible();
	await expect(
		currentInventory.getByText('Industry City: 0 / 400 city inventory used.', { exact: true })
	).toBeVisible();
	await expect(
		currentInventory.getByText('Breadbasket Basin: 37 / 200 city inventory used.', {
			exact: true
		})
	).toBeVisible();
	await expect(
		cityAttributedMovements.getByText('Local supply — Industry City → Harbor City: 6 units', {
			exact: true
		})
	).toBeVisible();
	await expect(
		cityAttributedMovements.getByText('External imports — Harbor City: 4 units', { exact: true })
	).toBeVisible();
	await expect(reports.getByText('$8', { exact: true })).toBeVisible();
	await reports.getByRole('button', { name: 'Close Reports' }).click();

	await openSaves(page);
	const savePanel = page.getByRole('dialog', { name: /saves/i });
	await savePanel.getByRole('textbox', { name: /slot name/i }).fill('City local lifecycle');
	await savePanel.getByRole('button', { name: /save slot/i }).click();
	await expect(page.getByText('Saved City local lifecycle', { exact: true })).toBeVisible();

	const savedSnapshot = await readBrowserSaveSnapshot(page);
	const savedManualSlot = savedSnapshot.manualSlots.find(
		(slot) => slot.metadata.name === 'City local lifecycle'
	);
	if (!savedManualSlot) {
		throw new Error('Missing saved City local lifecycle manual slot.');
	}
	expect(savedManualSlot.game.retailSupplyAssignments).toEqual([
		{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
		{ retailCityId: 'campus-junction', supplyCityId: 'breadbasket-basin' }
	]);
	expect(getSavedCityInventory(savedManualSlot.game, 'industry-city')).toEqual({
		cityId: 'industry-city',
		capacity: 400,
		materials: { 'bottled-water': 0 },
		overflowUnits: 0,
		overflowCost: 0
	});
	expect(getSavedCityInventory(savedManualSlot.game, 'breadbasket-basin')).toEqual({
		cityId: 'breadbasket-basin',
		capacity: 200,
		materials: { 'bottled-water': 37 },
		overflowUnits: 0,
		overflowCost: 0
	});

	await replaceBrowserAutoSave(page, cityLocalInventoryLifecycleGame());
	const divergentAutoSave = await readAutoSaveGame(page);
	expect(divergentAutoSave.retailSupplyAssignments).toEqual([
		{ retailCityId: 'harbor-city', supplyCityId: null },
		{ retailCityId: 'campus-junction', supplyCityId: 'breadbasket-basin' }
	]);
	expect(getSavedCityInventory(divergentAutoSave, 'industry-city')).toEqual({
		cityId: 'industry-city',
		capacity: 400,
		materials: { 'bottled-water': 6 },
		overflowUnits: 0,
		overflowCost: 0
	});
	await savePanel.getByRole('button', { name: /^close$/i }).click();

	await page.reload();
	await openSaves(page);
	await expect(savePanel.getByRole('heading', { name: 'City local lifecycle' })).toBeVisible();
	await savePanel.getByRole('button', { name: /^load$/i }).click();
	await expect(page.getByText('Loaded City local lifecycle', { exact: true })).toBeVisible();
	await savePanel.getByRole('button', { name: /^close$/i }).click();
	await expectRetailMapReady(page);

	// Manual Load replaces the live game but intentionally does not rewrite the
	// divergent auto-save. Verify the rendered game, not the stale auto-save record.
	const reloadedStores = await openManagementPanel(page, /stores/i);
	await expect(
		reloadedStores.getByRole('combobox', { name: 'Local supply source for Harbor City' })
	).toHaveValue('industry-city');
	await expect(
		reloadedStores.getByRole('combobox', { name: 'Local supply source for Campus Junction' })
	).toHaveValue('breadbasket-basin');
	await expect(
		reloadedStores
			.getByRole('status')
			.filter({ hasText: 'Industry City 0 / 400 city inventory used.' })
	).toBeVisible();
	await expect(
		reloadedStores
			.getByRole('status')
			.filter({ hasText: 'Breadbasket Basin 37 / 200 city inventory used.' })
	).toBeVisible();
	await reloadedStores.getByRole('button', { name: 'Close Stores' }).click();

	const reloadedReports = await openManagementPanel(page, /reports/i);
	const reloadedCurrentInventory = reloadedReports.getByRole('region', {
		name: 'Current city inventory (after the latest replenishment)'
	});
	const reloadedCityAttributedMovements = reloadedReports.getByRole('region', {
		name: 'City-attributed movements'
	});
	await expect(
		reloadedCurrentInventory.getByText('Current city inventory (after the latest replenishment)', {
			exact: true
		})
	).toBeVisible();
	await expect(
		reloadedCurrentInventory.getByText('Industry City: 0 / 400 city inventory used.', {
			exact: true
		})
	).toBeVisible();
	await expect(
		reloadedCurrentInventory.getByText('Breadbasket Basin: 37 / 200 city inventory used.', {
			exact: true
		})
	).toBeVisible();
	await expect(
		reloadedCityAttributedMovements.getByText(
			'Local supply — Industry City → Harbor City: 6 units',
			{
				exact: true
			}
		)
	).toBeVisible();
});
