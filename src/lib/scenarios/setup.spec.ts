import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity
} from '$lib/game/city';
import { getWarehouseCapacity } from '$lib/game/industryProduction';
import { createFoundingGameAtTile } from '$lib/game/placement';
import { getTotalDebt } from '$lib/game/finance';
import { normalizeSeed } from '$lib/game/rng';
import { upgradeStore } from '$lib/game/state';
import { calculateStockHealth } from '$lib/game/stock';
import type { ArchetypeId } from '$lib/game/types';
import { SaveDataError, validateCurrentGameState } from '$lib/persistence/saveCodec';
import type { ScenarioDefinition } from './types';
import { listCurrentScenarioDefinitions } from './catalog';
import { buildScenarioGame } from './setup';
import { validateScenarioDefinition } from './validation';

const transitionControls = vi.hoisted(() => ({
	failBuild: false,
	failUpgrade: false,
	omitMilestoneProduct: false,
	strictValidationThrows: null as Error | null,
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
		upgradeStore: (...args: Parameters<typeof actual.upgradeStore>) => {
			if (transitionControls.failUpgrade) return args[0];
			const next = actual.upgradeStore(...args);
			if (!transitionControls.omitMilestoneProduct) return next;
			const [beforeGame, storeId] = args;
			const before = beforeGame.stores.find((store) => store.id === storeId);
			const after = next.stores.find((store) => store.id === storeId);
			if (!before || after?.level !== 4) return next;
			return {
				...next,
				stores: next.stores.map((store) =>
					store.id === storeId
						? { ...store, products: before.products, stockHealth: before.stockHealth }
						: store
				)
			};
		}
	};
});

vi.mock('$lib/persistence/saveCodec', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/persistence/saveCodec')>();
	return {
		...actual,
		validateCurrentGameState: (...args: Parameters<typeof actual.validateCurrentGameState>) => {
			if (transitionControls.strictValidationThrows)
				throw transitionControls.strictValidationThrows;
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
								categoryId: 'bottled-water',
								stock: 5,
								reorderThreshold: 2,
								targetStock: 10,
								sellingPrice: 1
							}
						]
					}
				],
				buildingInventories: [{ buildingRef: 'bottler', materials: { water: 20 } }],
				warehouseMaterials: { 'bottled-water': 30 },
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
			productCategoryIds: ['bottled-water'],
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
	definition.content.productCategoryIds = ['games', 'accessories'];
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
			categoryId: 'bottled-water',
			stock: 5,
			reorderThreshold: 2,
			targetStock: 10,
			sellingPrice: 1
		});
		expect(store.stockHealth).toBe(calculateStockHealth(store.products));
		expect(result.game.industrialBuildings[0]?.inventory).toEqual({ water: 20 });
		expect(result.game.warehouse).toEqual({
			capacity: getWarehouseCapacity(result.game),
			materials: { 'bottled-water': 30 },
			overflowUnits: 0,
			overflowCost: 0
		});
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

	it('restores authored finances after transiently funding builds and upgrades', () => {
		const definition = scenarioDefinition();
		definition.start.overrides.cash = 0;
		definition.start.overrides.debt = 0;
		definition.start.overrides.stores = [{ storeRef: 'founder', targetLevel: 4 }];
		definition.content.productCategoryIds = ['bottled-water', 'snacks'];

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
		definition.content.productCategoryIds = ['bottled-water', 'snacks'];
		const ordinary = createFoundingFixtureGame('convenience', 280_002);

		const result = buildScenarioGame(definition, 280_002);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.cash).toBe(ordinary.cash);
		expect(result.game.finance).toEqual(ordinary.finance);
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
		expect(scenarioStore.products.map((product) => product.categoryId)).toEqual([
			'games',
			'accessories'
		]);
		expect(scenarioStore.staffCapacity).toBe(ordinaryStore.staffCapacity);
		expect(scenarioStore.stockHealth).toBe(ordinaryStore.stockHealth);
	});

	it('rejects a level-4 state missing its milestone product', () => {
		transitionControls.omitMilestoneProduct = true;
		try {
			expect(buildScenarioGame(importSqueezeFixture(), 280_002)).toEqual({
				ok: false,
				diagnostics: [
					{
						path: 'start.overrides.stores',
						code: 'setup-invariant-failed',
						value: ['games'],
						detail:
							'The built game product categories must exactly match the categories unlocked at its store level.'
					}
				]
			});
		} finally {
			transitionControls.omitMilestoneProduct = false;
		}
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

	it('rejects building and warehouse inventories beyond derived capacity', () => {
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

		const warehouseOverflow = scenarioDefinition();
		warehouseOverflow.start.overrides.warehouseMaterials = { 'bottled-water': 201 };
		expect(
			diagnosticCodes(buildScenarioGame(warehouseOverflow, warehouseOverflow.officialSeed))
		).toContainEqual({
			path: 'start.overrides.warehouseMaterials',
			code: 'warehouse-capacity-exceeded'
		});
	});

	it('rejects a world override that closes a city containing starting content', () => {
		const definition = scenarioDefinition();
		definition.start.overrides.world = {
			revealedCityIds: ['industry-city', 'campus-junction'],
			openedCityIds: ['industry-city', 'campus-junction'],
			activeRetailCityId: 'campus-junction',
			activeIndustryCityId: 'industry-city'
		};

		expect(diagnosticCodes(buildScenarioGame(definition, definition.officialSeed))).toContainEqual({
			path: 'start.overrides.world',
			code: 'setup-invariant-failed'
		});
	});

	it('rejects a rail-only starting city that is not opened', () => {
		const definition = scenarioDefinition();
		definition.start.industrialBuildings = [];
		definition.start.overrides.buildingInventories = [];
		definition.start.overrides.warehouseMaterials = {};
		definition.start.overrides.storeCap = 1;
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'breadbasket-basin'],
			openedCityIds: ['harbor-city', 'breadbasket-basin'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'breadbasket-basin'
		};
		definition.content.cityIds = ['harbor-city', 'industry-city', 'breadbasket-basin'];
		definition.content.materialIds = [];
		definition.content.buildingTypeIds = ['water-bottler', 'warehouse'];
		definition.content.industrialPlacements = [
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
		];
		definition.allowedCommands = ['advanceDay', 'buildIndustrialBuilding'];

		expect(validateScenarioDefinition(definition)).toEqual([]);
		expect(diagnosticCodes(buildScenarioGame(definition, definition.officialSeed))).toEqual([
			{ path: 'start.overrides.world', code: 'setup-invariant-failed' }
		]);
	});

	it('refreshes world progress after authored warehouse inventory is applied', () => {
		const definition = scenarioDefinition();
		definition.start.overrides.warehouseMaterials = { snacks: 1 };
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

	it('maps strict store-cap validation failures to setup diagnostics', () => {
		transitionControls.strictValidationThrows = new SaveDataError(
			'Store cap invalid',
			'invariant-store-cap'
		);
		try {
			const definition = scenarioDefinition();
			const result = buildScenarioGame(definition, definition.officialSeed);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.diagnostics).toContainEqual({
				path: 'start.overrides.storeCap',
				code: 'setup-invariant-failed',
				value: result.diagnostics[0]?.value,
				detail: 'The built game store cap must be an integer and at least its starting store count.'
			});
		} finally {
			transitionControls.strictValidationThrows = null;
		}
	});

	it('maps strict stock-health validation failures to setup diagnostics', () => {
		transitionControls.strictValidationThrows = new SaveDataError(
			'Stock health mismatch',
			'invariant-stock-health'
		);
		try {
			const definition = scenarioDefinition();
			const result = buildScenarioGame(definition, definition.officialSeed);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.diagnostics).toContainEqual({
				path: 'start.overrides.stores',
				code: 'setup-invariant-failed',
				value: result.diagnostics[0]?.value,
				detail: 'The built game store stock health does not match its products.'
			});
		} finally {
			transitionControls.strictValidationThrows = null;
		}
	});

	it('maps strict warehouse validation failures to setup diagnostics', () => {
		transitionControls.strictValidationThrows = new SaveDataError(
			'Warehouse overflow',
			'invariant-warehouse'
		);
		try {
			const definition = scenarioDefinition();
			const result = buildScenarioGame(definition, definition.officialSeed);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.diagnostics).toContainEqual({
				path: 'start.overrides.warehouseMaterials',
				code: 'setup-invariant-failed',
				value: result.diagnostics[0]?.value,
				detail: 'The built game warehouse contents or pressure exceed derived capacity.'
			});
		} finally {
			transitionControls.strictValidationThrows = null;
		}
	});

	it('maps strict inventory validation failures to setup diagnostics', () => {
		transitionControls.strictValidationThrows = new SaveDataError(
			'Inventory overflow',
			'invariant-inventory'
		);
		try {
			const definition = scenarioDefinition();
			const result = buildScenarioGame(definition, definition.officialSeed);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.diagnostics).toContainEqual({
				path: 'start.overrides.buildingInventories',
				code: 'setup-invariant-failed',
				value: result.diagnostics[0]?.value,
				detail: 'A built game industrial inventory exceeds its derived buffer capacity.'
			});
		} finally {
			transitionControls.strictValidationThrows = null;
		}
	});

	it('maps strict validation failures with unknown codes to a generic diagnostic', () => {
		transitionControls.strictValidationThrows = new SaveDataError(
			'Unknown failure',
			'invariant-entity-city-opened'
		);
		try {
			const definition = scenarioDefinition();
			const result = buildScenarioGame(definition, definition.officialSeed);
			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.diagnostics).toContainEqual({
				path: 'start',
				code: 'setup-invariant-failed',
				value: 'Unknown failure',
				detail: 'The built game failed strict current-state validation.'
			});
		} finally {
			transitionControls.strictValidationThrows = null;
		}
	});

	it('rethrows non-SaveDataError exceptions from strict validation', () => {
		transitionControls.strictValidationThrows = new Error('unexpected crash');
		try {
			const definition = scenarioDefinition();
			expect(() => buildScenarioGame(definition, definition.officialSeed)).toThrow(
				'unexpected crash'
			);
		} finally {
			transitionControls.strictValidationThrows = null;
		}
	});

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

	it('covers railEndpoints with buildIndustrialBuilding in allowed commands', () => {
		const definition = scenarioDefinition();
		definition.allowedCommands = ['advanceDay', 'openStore', 'buildIndustrialBuilding'];
		const result = buildScenarioGame(definition, definition.officialSeed);
		expect(result.ok).toBe(true);
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
			expect(first.game.warehouse).not.toBe(second.game.warehouse);
			expect(first.game.reports).not.toBe(second.game.reports);
		}
	});
});
