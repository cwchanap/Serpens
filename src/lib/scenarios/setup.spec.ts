import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity
} from '$lib/game/city';
import { getCityInventoryStats } from '$lib/game/cityInventory';
import { createFoundingGameAtTile } from '$lib/game/placement';
import { getTotalDebt } from '$lib/game/finance';
import { normalizeSeed } from '$lib/game/rng';
import { upgradeStore } from '$lib/game/state';
import { calculateStockHealth } from '$lib/game/stock';
import type { ArchetypeId, GameState } from '$lib/game/types';
import {
	SaveDataError,
	type SaveDataErrorCode,
	validateCurrentGameState
} from '$lib/persistence/saveCodec';
import type { ScenarioDefinition } from './types';
import { listCurrentScenarioDefinitions } from './catalog';
import { buildScenarioGame } from './setup';

const transitionControls = vi.hoisted(() => ({
	failBuild: false,
	failUpgrade: false,
	strictValidationThrows: null as SaveDataError | null,
	failFoundingGame: false,
	emptyFoundingStores: false
}));

vi.mock('$lib/game/industryPlacement', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/game/industryPlacement')>();
	return {
		...actual,
		buildIndustrialBuilding: (...args: Parameters<typeof actual.buildIndustrialBuilding>) =>
			transitionControls.failBuild ? args[0] : actual.buildIndustrialBuilding(...args)
	};
});

vi.mock('$lib/game/state', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/game/state')>();
	return {
		...actual,
		upgradeStore: (...args: Parameters<typeof actual.upgradeStore>) =>
			transitionControls.failUpgrade ? args[0] : actual.upgradeStore(...args)
	};
});

vi.mock('$lib/persistence/saveCodec', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/persistence/saveCodec')>();
	return {
		...actual,
		validateCurrentGameState: (...args: Parameters<typeof actual.validateCurrentGameState>) => {
			if (transitionControls.strictValidationThrows) {
				throw transitionControls.strictValidationThrows;
			}
			return actual.validateCurrentGameState(...args);
		}
	};
});

vi.mock('$lib/game/placement', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/game/placement')>();
	return {
		...actual,
		createFoundingGameAtTile: (...args: Parameters<typeof actual.createFoundingGameAtTile>) => {
			if (transitionControls.failFoundingGame) throw new Error('founding transition failed');
			const game = actual.createFoundingGameAtTile(...args);
			if (transitionControls.emptyFoundingStores) return { ...game, stores: [] };
			return game;
		}
	};
});

function scenarioDefinition(): ScenarioDefinition {
	return {
		id: 'first-profit',
		version: 1,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed: 280_001,
		dayLimit: 30,
		start: {
			foundingStore: {
				ref: 'founder',
				archetypeId: 'convenience',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1'
			},
			industrialBuildings: [
				{
					ref: 'bottler',
					typeId: 'water-bottler',
					cityId: 'industry-city',
					tileId: 'industry-city-26-6'
				},
				{
					ref: 'warehouse',
					typeId: 'warehouse',
					cityId: 'industry-city',
					tileId: 'industry-city-30-6'
				}
			],
			rails: [
				{ cityId: 'industry-city', x: 29, y: 7, level: 3 },
				{ cityId: 'industry-city', x: 28, y: 6, level: 1 },
				{ cityId: 'industry-city', x: 29, y: 6, level: 2 },
				{ cityId: 'industry-city', x: 28, y: 7, level: 4 }
			],
			overrides: {
				cash: 1_234,
				debt: 432,
				policy: {
					pricing: 'premium',
					inventory: 'generous',
					staffing: 'service',
					marketing: 'loyalty',
					service: 'highTouch'
				},
				storeCap: 3,
				stores: [
					{
						storeRef: 'founder',
						targetLevel: 1,
						products: [
							{
								productId: 'bottled-water',
								stock: 5,
								reorderThreshold: 2,
								targetStock: 10,
								sellingPrice: 1
							}
						]
					}
				],
				buildingInventories: [{ buildingRef: 'bottler', materials: { water: 20 } }],
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { 'bottled-water': 30 } }],
				retailSupplyAssignments: [
					{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
					{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
				],
				world: {
					revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
					openedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
					activeRetailCityId: 'campus-junction',
					activeIndustryCityId: 'industry-city'
				}
			}
		},
		content: {
			cityIds: ['harbor-city', 'industry-city', 'campus-junction'],
			archetypeIds: ['convenience'],
			productIds: ['bottled-water'],
			materialIds: ['water', 'bottled-water'],
			buildingTypeIds: ['water-bottler', 'warehouse'],
			retailPlacements: [
				{
					cityId: 'harbor-city',
					tileId: 'harbor-city-1-1',
					archetypeId: 'convenience'
				}
			],
			industrialPlacements: [
				{
					cityId: 'industry-city',
					tileId: 'industry-city-26-6',
					buildingTypeId: 'water-bottler'
				},
				{
					cityId: 'industry-city',
					tileId: 'industry-city-30-6',
					buildingTypeId: 'warehouse'
				}
			]
		},
		allowedCommands: ['advanceDay', 'openStore'],
		modifiers: [],
		requiredObjectives: [
			{
				id: 'keep-cash',
				labelKey: 'store.defaultName',
				query: { metric: 'cash' },
				comparator: 'gte',
				target: 0,
				window: { kind: 'current' }
			}
		],
		optionalObjectives: [
			{
				id: 'one-store',
				labelKey: 'store.defaultName',
				query: { metric: 'store-count' },
				comparator: 'gte',
				target: 1,
				window: { kind: 'current' }
			}
		],
		failures: [],
		scoreComponents: [{ kind: 'optional-objective', objectiveId: 'one-store', points: 500 }],
		medalThresholds: { silver: 700, gold: 850 }
	};
}

function importSqueezeFixture(): ScenarioDefinition {
	const definition = scenarioDefinition();
	definition.id = 'import-squeeze';
	definition.start.foundingStore.archetypeId = 'electronics';
	definition.start.industrialBuildings = [];
	definition.start.rails = [];
	definition.start.overrides = {
		cash: 2_800,
		debt: 700,
		storeCap: 1,
		stores: [{ storeRef: 'founder', targetLevel: 4 }]
	};
	definition.content.cityIds = ['harbor-city'];
	definition.content.archetypeIds = ['electronics'];
	definition.content.productIds = ['games', 'accessories'];
	definition.content.materialIds = [];
	definition.content.buildingTypeIds = [];
	definition.content.retailPlacements = [
		{
			cityId: 'harbor-city',
			tileId: 'harbor-city-1-1',
			archetypeId: 'electronics'
		}
	];
	definition.content.industrialPlacements = [];
	definition.allowedCommands = ['advanceDay'];
	return definition;
}

function createFoundingFixtureGame(archetypeId: ArchetypeId, seed: number) {
	const normalizedSeed = normalizeSeed(seed);
	const city = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: DEFAULT_RETAIL_CITY_WIDTH,
		height: DEFAULT_RETAIL_CITY_HEIGHT,
		seed: normalizedSeed
	});
	return createFoundingGameAtTile({
		archetypeId,
		city,
		tileId: 'harbor-city-1-1',
		seed
	});
}

function diagnosticCodes(result: ReturnType<typeof buildScenarioGame>) {
	return result.ok ? [] : result.diagnostics.map(({ path, code }) => ({ path, code }));
}

const strictFailureCases: readonly {
	label: string;
	errorCode: SaveDataErrorCode;
	message: string;
	path: string;
	expectedValue: (game: GameState) => unknown;
}[] = [
	{
		label: 'store-cap',
		errorCode: 'invariant-store-cap',
		message: 'Store cap invalid',
		path: 'start.overrides.storeCap',
		expectedValue: (game) => game.storeCap
	},
	{
		label: 'products',
		errorCode: 'invariant-products',
		message: 'Products invalid',
		path: 'start.overrides.stores',
		expectedValue: (game) =>
			game.stores.flatMap((store) => store.products.map((product) => product.productId))
	},
	{
		label: 'stock health',
		errorCode: 'invariant-stock-health',
		message: 'Stock health invalid',
		path: 'start.overrides.stores',
		expectedValue: (game) => game.stores.map((store) => store.stockHealth)
	},
	{
		label: 'city inventory',
		errorCode: 'invariant-city-inventory',
		message: 'City inventory invalid',
		path: 'start.overrides.cityInventoryMaterials',
		expectedValue: (game) => game.cityInventories
	},
	{
		label: 'retail supply',
		errorCode: 'invariant-retail-supply',
		message: 'Retail supply invalid',
		path: 'start.overrides.retailSupplyAssignments',
		expectedValue: (game) => game.retailSupplyAssignments
	},
	{
		label: 'industrial inventory',
		errorCode: 'invariant-inventory',
		message: 'Industrial inventory invalid',
		path: 'start.overrides.buildingInventories',
		expectedValue: (game) => game.industrialBuildings.map((building) => building.inventory)
	},
	{
		label: 'unknown invariant',
		errorCode: 'invariant-entity-city-opened',
		message: 'Unknown failure',
		path: 'start',
		expectedValue: () => 'Unknown failure'
	}
];

describe('buildScenarioGame', { timeout: 30_000 }, () => {
	it('forwards the explicit seed and produces repeatable factory RNG state', () => {
		const definition = importSqueezeFixture();
		const first = buildScenarioGame(definition, 280_002);
		const repeated = buildScenarioGame(definition, 280_002);
		const differentSeed = buildScenarioGame(definition, 280_003);

		expect(first.ok).toBe(true);
		expect(repeated).toEqual(first);
		expect(differentSeed.ok).toBe(true);
		if (!first.ok || !differentSeed.ok) return;

		const ordinary = createFoundingFixtureGame('electronics', 280_002);
		expect(first.game.seed).toBe(normalizeSeed(280_002));
		expect(first.game.rngState).toBe(ordinary.rngState);
		expect(differentSeed.game.rngState).not.toBe(first.game.rngState);
	});

	it('applies every authored override and maps setup refs to generated ids', () => {
		const definition = scenarioDefinition();
		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.refs).toEqual({
			storeIdsByRef: { founder: 'store-1' },
			buildingIdsByRef: {
				bottler: 'industry-building-1',
				warehouse: 'industry-building-2'
			}
		});
		expect(result.game.cash).toBe(1_234);
		expect(getTotalDebt(result.game)).toBe(432);
		expect(result.game.finance.loans[0]).toMatchObject({
			purpose: 'founding',
			openedOnDay: result.game.day,
			nextPaymentDay: result.game.day + 7,
			installmentsProcessed: 0,
			scheduledPaymentCount: 0,
			onTimePaymentCount: 0,
			missedPaymentCount: 0
		});
		expect(result.game.policy).toEqual(definition.start.overrides.policy);
		expect(result.game.storeCap).toBe(3);

		const store = result.game.stores[0]!;
		expect(store.products[0]).toEqual({
			productId: 'bottled-water',
			stock: 5,
			reorderThreshold: 2,
			targetStock: 10,
			sellingPrice: 1
		});
		expect(store.stockHealth).toBe(calculateStockHealth(store.products));
		expect(result.game.industrialBuildings[0]?.inventory).toEqual({ water: 20 });
		expect(result.game.cityInventories).toEqual([
			{
				cityId: 'industry-city',
				materials: { 'bottled-water': 30 }
			}
		]);
		expect(getCityInventoryStats(result.game, 'industry-city').capacity).toBe(200);
		expect(result.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		]);
		expect(result.game).not.toHaveProperty('warehouse');
		expect(result.game.world.revealedCityIds).toEqual([
			'harbor-city',
			'industry-city',
			'campus-junction'
		]);
		expect(result.game.world.openedCityIds).toEqual([
			'harbor-city',
			'industry-city',
			'campus-junction'
		]);
		expect(result.game.activeCityId).toBe('campus-junction');
		expect(result.game.activeIndustryCityId).toBe('industry-city');
		expect(result.game.cities.map((city) => city.id)).toContain('campus-junction');
	});

	it('normalizes authored retail supply assignments to world catalog order', () => {
		const definition = scenarioDefinition();
		definition.start.overrides.retailSupplyAssignments = [
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' },
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
		];

		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		]);
	});

	it('keeps authored inventory isolated by city after warehouse capacity is materialized', () => {
		const definition = scenarioDefinition();
		definition.start.industrialBuildings = [
			...definition.start.industrialBuildings,
			{
				ref: 'breadbasket-warehouse',
				typeId: 'warehouse',
				cityId: 'breadbasket-basin',
				tileId: 'breadbasket-basin-30-6'
			}
		];
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'campus-junction', 'industry-city', 'breadbasket-basin'],
			openedCityIds: ['harbor-city', 'campus-junction', 'industry-city', 'breadbasket-basin'],
			activeRetailCityId: 'campus-junction',
			activeIndustryCityId: 'breadbasket-basin'
		};
		definition.start.overrides.cityInventoryMaterials = [
			{ cityId: 'breadbasket-basin', materials: { grain: 7 } },
			{ cityId: 'industry-city', materials: { 'bottled-water': 30 } }
		];
		definition.start.overrides.retailSupplyAssignments = [
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'campus-junction', supplyCityId: 'breadbasket-basin' }
		];
		definition.content.cityIds = [
			'harbor-city',
			'campus-junction',
			'industry-city',
			'breadbasket-basin'
		];
		definition.content.materialIds = ['water', 'bottled-water', 'grain'];
		definition.content.industrialPlacements = [
			...definition.content.industrialPlacements,
			{
				cityId: 'breadbasket-basin',
				tileId: 'breadbasket-basin-30-6',
				buildingTypeId: 'warehouse'
			}
		];

		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.cityInventories).toEqual([
			{
				cityId: 'industry-city',
				materials: { 'bottled-water': 30 }
			},
			{
				cityId: 'breadbasket-basin',
				materials: { grain: 7 }
			}
		]);
		expect(getCityInventoryStats(result.game, 'industry-city').capacity).toBe(200);
		expect(getCityInventoryStats(result.game, 'breadbasket-basin').capacity).toBe(200);
		expect(result.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'campus-junction', supplyCityId: 'breadbasket-basin' }
		]);
		expect(result.game).not.toHaveProperty('warehouse');
	});

	it('restores authored finances after transiently funding builds and upgrades', () => {
		const definition = scenarioDefinition();
		definition.start.overrides.cash = 0;
		definition.start.overrides.debt = 0;
		definition.start.overrides.stores = [{ storeRef: 'founder', targetLevel: 4 }];
		definition.content.productIds = ['bottled-water', 'snacks'];

		const result = buildScenarioGame(definition, 280_002);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.stores[0]?.level).toBe(4);
		expect(result.game.industrialBuildings).toHaveLength(2);
		expect(result.game.cash).toBe(0);
		expect(result.game.finance.loans).toEqual([]);
	});

	it('restores factory finances when cash and debt overrides are omitted', () => {
		const definition = scenarioDefinition();
		delete definition.start.overrides.cash;
		delete definition.start.overrides.debt;
		definition.start.overrides.stores = [{ storeRef: 'founder', targetLevel: 4 }];
		definition.content.productIds = ['bottled-water', 'snacks'];
		const ordinary = createFoundingFixtureGame('convenience', 280_002);

		const result = buildScenarioGame(definition, 280_002);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.cash).toBe(ordinary.cash);
		expect(result.game.finance).toEqual(ordinary.finance);
	});

	it('creates deterministic lifecycle supply defaults when no assignment is authored', () => {
		const result = buildScenarioGame(importSqueezeFixture(), 280_002);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
		]);
	});

	it('chooses the capacity-leading industry city for a delayed lifecycle supply default', () => {
		const definition = scenarioDefinition();
		definition.start.industrialBuildings = [
			{
				ref: 'bottler',
				typeId: 'water-bottler',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			},
			{
				ref: 'breadbasket-warehouse',
				typeId: 'warehouse',
				cityId: 'breadbasket-basin',
				tileId: 'breadbasket-basin-30-6'
			}
		];
		definition.start.rails = [];
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city', 'breadbasket-basin'],
			openedCityIds: ['harbor-city', 'industry-city', 'breadbasket-basin'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'industry-city'
		};
		delete definition.start.overrides.cityInventoryMaterials;
		delete definition.start.overrides.retailSupplyAssignments;
		definition.content.cityIds = ['harbor-city', 'industry-city', 'breadbasket-basin'];
		definition.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-26-6',
				buildingTypeId: 'water-bottler'
			},
			{
				cityId: 'breadbasket-basin',
				tileId: 'breadbasket-basin-30-6',
				buildingTypeId: 'warehouse'
			}
		];

		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.cityInventories).toEqual([
			{ cityId: 'industry-city', materials: {} },
			{ cityId: 'breadbasket-basin', materials: {} }
		]);
		expect(getCityInventoryStats(result.game, 'industry-city').capacity).toBe(0);
		expect(getCityInventoryStats(result.game, 'breadbasket-basin').capacity).toBe(200);
		expect(result.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'breadbasket-basin' }
		]);
	});

	it('materializes a level-4 electronics store through normal upgrades', () => {
		const result = buildScenarioGame(importSqueezeFixture(), 280_002);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		let ordinary = createFoundingFixtureGame('electronics', 280_002);
		ordinary = { ...ordinary, cash: 1_000_000 };
		ordinary = upgradeStore(ordinary, 'store-1');
		ordinary = upgradeStore(ordinary, 'store-1');
		ordinary = upgradeStore(ordinary, 'store-1');

		const scenarioStore = result.game.stores[0]!;
		const ordinaryStore = ordinary.stores[0]!;
		expect(scenarioStore.level).toBe(4);
		expect(scenarioStore.products.map((product) => product.productId)).toEqual([
			'games',
			'accessories'
		]);
		expect(scenarioStore.staffCapacity).toBe(ordinaryStore.staffCapacity);
		expect(scenarioStore.stockHealth).toBe(ordinaryStore.stockHealth);
	});

	it('sorts authored rail cells by city, y, and x using code-unit ordering', () => {
		const definition = scenarioDefinition();
		const authoredOrder = [...definition.start.rails];
		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.industryCities[0]?.rails).toEqual([
			{ x: 28, y: 6, level: 1 },
			{ x: 29, y: 6, level: 2 },
			{ x: 28, y: 7, level: 4 },
			{ x: 29, y: 7, level: 3 }
		]);
		expect(definition.start.rails).toEqual(authoredOrder);
	});

	it('returns diagnostics for unknown setup refs instead of throwing', () => {
		const definition = scenarioDefinition();
		definition.start.overrides.stores = [{ storeRef: 'missing-store', targetLevel: 1 }];
		definition.start.overrides.buildingInventories = [
			{ buildingRef: 'missing-building', materials: { water: 1 } }
		];

		expect(diagnosticCodes(buildScenarioGame(definition, definition.officialSeed))).toEqual(
			expect.arrayContaining([
				{
					path: 'start.overrides.buildingInventories[0].buildingRef',
					code: 'invalid-reference'
				},
				{ path: 'start.overrides.stores[0].storeRef', code: 'invalid-reference' }
			])
		);
	});

	it('returns a diagnostic when a funded building transition does not append', () => {
		transitionControls.failBuild = true;
		try {
			const definition = scenarioDefinition();
			expect(diagnosticCodes(buildScenarioGame(definition, definition.officialSeed))).toEqual([
				{ path: 'start.industrialBuildings[0]', code: 'setup-transition-failed' }
			]);
		} finally {
			transitionControls.failBuild = false;
		}
	});

	it('returns a diagnostic when a funded upgrade transition does not advance', () => {
		transitionControls.failUpgrade = true;
		try {
			expect(diagnosticCodes(buildScenarioGame(importSqueezeFixture(), 280_002))).toEqual([
				{
					path: 'start.overrides.stores[0].targetLevel',
					code: 'setup-transition-failed'
				}
			]);
		} finally {
			transitionControls.failUpgrade = false;
		}
	});

	it('rejects duplicate, overlapping, and invalid authored rail cells', () => {
		const duplicate = scenarioDefinition();
		duplicate.start.rails = [
			...duplicate.start.rails,
			{ cityId: 'industry-city', x: 28, y: 6, level: 1 }
		];
		expect(diagnosticCodes(buildScenarioGame(duplicate, duplicate.officialSeed))).toContainEqual({
			path: 'start.rails[4]',
			code: 'duplicate-rail-cell'
		});

		const overlapping = scenarioDefinition();
		overlapping.start.rails = [
			...overlapping.start.rails,
			{ cityId: 'industry-city', x: 26, y: 6, level: 1 }
		];
		expect(
			diagnosticCodes(buildScenarioGame(overlapping, overlapping.officialSeed))
		).toContainEqual({
			path: 'start.rails[4]',
			code: 'invalid-rail-coordinate'
		});

		const invalid = scenarioDefinition();
		invalid.start.rails = [
			...invalid.start.rails,
			{ cityId: 'industry-city', x: -1, y: 6, level: 1 }
		];
		expect(diagnosticCodes(buildScenarioGame(invalid, invalid.officialSeed))).toContainEqual({
			path: 'start.rails[4]',
			code: 'invalid-rail-coordinate'
		});
	});

	it('rejects a rail-only starting city that is not opened', () => {
		const definition = scenarioDefinition();
		definition.start.industrialBuildings = [];
		definition.start.overrides.buildingInventories = [];
		delete definition.start.overrides.cityInventoryMaterials;
		delete definition.start.overrides.retailSupplyAssignments;
		definition.start.overrides.storeCap = 1;
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city', 'breadbasket-basin'],
			openedCityIds: ['harbor-city', 'breadbasket-basin'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'breadbasket-basin'
		};
		definition.content.cityIds = ['harbor-city', 'industry-city', 'breadbasket-basin'];
		definition.content.materialIds = [];
		definition.content.buildingTypeIds = ['water-bottler', 'warehouse'];
		definition.allowedCommands = ['advanceDay', 'buildIndustrialBuilding'];

		expect(diagnosticCodes(buildScenarioGame(definition, definition.officialSeed))).toEqual([
			{ path: 'start.overrides.world', code: 'setup-invariant-failed' }
		]);
	});

	it('rejects an industrial building starting city that is not opened', () => {
		const definition = scenarioDefinition();
		definition.start.rails = [];
		definition.start.overrides.buildingInventories = [];
		delete definition.start.overrides.cityInventoryMaterials;
		delete definition.start.overrides.retailSupplyAssignments;
		definition.start.overrides.storeCap = 1;
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city', 'breadbasket-basin'],
			openedCityIds: ['harbor-city', 'breadbasket-basin'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'breadbasket-basin'
		};
		definition.content.cityIds = ['harbor-city', 'industry-city', 'breadbasket-basin'];
		definition.content.materialIds = [];
		definition.content.buildingTypeIds = ['water-bottler', 'warehouse'];
		definition.allowedCommands = ['advanceDay', 'buildIndustrialBuilding'];

		expect(diagnosticCodes(buildScenarioGame(definition, definition.officialSeed))).toEqual([
			{ path: 'start.overrides.world', code: 'setup-invariant-failed' }
		]);
	});

	it('accepts a retail supply assignment with imports-only (null supply city)', () => {
		const definition = scenarioDefinition();
		definition.start.overrides.retailSupplyAssignments = [
			{ retailCityId: 'harbor-city', supplyCityId: null },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		];

		const result = buildScenarioGame(definition, definition.officialSeed);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const harborAssignment = result.game.retailSupplyAssignments.find(
			(assignment) => assignment.retailCityId === 'harbor-city'
		);
		expect(harborAssignment?.supplyCityId).toBeNull();
	});

	it('rejects building and city inventories beyond their own derived capacity', () => {
		const buildingOverflow = scenarioDefinition();
		buildingOverflow.start.overrides.buildingInventories = [
			{ buildingRef: 'bottler', materials: { water: 101 } }
		];
		expect(
			diagnosticCodes(buildScenarioGame(buildingOverflow, buildingOverflow.officialSeed))
		).toContainEqual({
			path: 'start.overrides.buildingInventories[0].materials',
			code: 'building-inventory-capacity-exceeded'
		});

		const cityInventoryOverflow = scenarioDefinition();
		cityInventoryOverflow.start.overrides.cityInventoryMaterials = [
			{ cityId: 'industry-city', materials: { 'bottled-water': 201 } }
		];
		expect(
			diagnosticCodes(buildScenarioGame(cityInventoryOverflow, cityInventoryOverflow.officialSeed))
		).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials',
			code: 'city-inventory-capacity-exceeded'
		});
	});

	it('refreshes world progress after authored city inventory is applied', () => {
		const definition = scenarioDefinition();
		definition.start.overrides.cityInventoryMaterials = [
			{ cityId: 'industry-city', materials: { snacks: 1 } }
		];
		definition.content.materialIds = [...definition.content.materialIds, 'snacks'];

		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.world.revealedCityIds).toContain('quarry-works');
		expect(result.game.world.claimedMilestoneIds).toContain('reveal-quarry-works');
	});

	it('leaves the initial evaluation input at day 1 with no reports or scenario metadata', () => {
		const definition = scenarioDefinition();
		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.day).toBe(1);
		expect(result.game.reports).toEqual([]);
		expect(result.game).not.toHaveProperty('scenario');
		expect(result.game).not.toHaveProperty('scenarioDefinition');
	});

	it('returns a built game that strict validation deep-clones without changing', () => {
		const definition = scenarioDefinition();
		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const validated = validateCurrentGameState(result.game);
		expect(validated).toEqual(result.game);
		expect(validated).not.toBe(result.game);
	});

	it.each(strictFailureCases)(
		'maps strict $label failures to path/value-specific setup diagnostics',
		({ errorCode, message, path, expectedValue }) => {
			const definition = scenarioDefinition();
			const baseline = buildScenarioGame(definition, definition.officialSeed);
			expect(baseline.ok).toBe(true);
			if (!baseline.ok) return;

			transitionControls.strictValidationThrows = new SaveDataError(message, errorCode);
			try {
				const result = buildScenarioGame(definition, definition.officialSeed);
				expect(result).toEqual({
					ok: false,
					diagnostics: [
						expect.objectContaining({
							path,
							code: 'setup-invariant-failed',
							value: expectedValue(baseline.game)
						})
					]
				});
			} finally {
				transitionControls.strictValidationThrows = null;
			}
		}
	);

	it('returns a transition failure when the founding store transition throws', () => {
		transitionControls.failFoundingGame = true;
		try {
			const definition = scenarioDefinition();
			expect(diagnosticCodes(buildScenarioGame(definition, definition.officialSeed))).toEqual([
				{
					path: 'start.foundingStore.tileId',
					code: 'setup-transition-failed'
				}
			]);
		} finally {
			transitionControls.failFoundingGame = false;
		}
	});

	it('returns a transition failure when the founding store is not created', () => {
		transitionControls.emptyFoundingStores = true;
		try {
			const definition = scenarioDefinition();
			expect(diagnosticCodes(buildScenarioGame(definition, definition.officialSeed))).toEqual([
				{
					path: 'start.foundingStore',
					code: 'setup-transition-failed'
				}
			]);
		} finally {
			transitionControls.emptyFoundingStores = false;
		}
	});
});

describe('launch catalog setup isolation', { timeout: 30_000 }, () => {
	it('builds each official run deterministically without sharing mutable game branches', () => {
		for (const definition of listCurrentScenarioDefinitions()) {
			const first = buildScenarioGame(definition, definition.officialSeed);
			const second = buildScenarioGame(definition, definition.officialSeed);
			expect(first.ok).toBe(true);
			expect(second.ok).toBe(true);
			if (!first.ok || !second.ok) continue;
			expect(first.game).toEqual(second.game);
			expect(first.game).not.toBe(second.game);
			expect(first.game.cities).not.toBe(second.game.cities);
			expect(first.game.industryCities).not.toBe(second.game.industryCities);
			expect(first.game.stores).not.toBe(second.game.stores);
			expect(first.game.industrialBuildings).not.toBe(second.game.industrialBuildings);
			expect(first.game.cityInventories).not.toBe(second.game.cityInventories);
			expect(first.game.reports).not.toBe(second.game.reports);
		}
	});
});
