import { describe, expect, it } from 'vitest';
import {
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity
} from '$lib/game/city';
import { getIndustryTilesByResource } from '$lib/game/industry';
import { buildIndustrialBuilding, upgradeBuilding } from '$lib/game/industryPlacement';
import { financeIndustrialBuilding } from '$lib/game/industryPlacement';
import { borrow, payOffLoan, refinanceLoan, repayLoan } from '$lib/game/finance';
import {
	createFoundingGameAtTile,
	financeRetailStoreOpening,
	forecastOpening,
	openStoreAtTile
} from '$lib/game/placement';
import { buildRailNetwork, deriveRailSegments } from '$lib/game/rail';
import {
	buildRail,
	demolishRailSegment,
	upgradeRailSegment,
	type RailBuildInput
} from '$lib/game/railPlacement';
import { simulateDay } from '$lib/game/simulateDay';
import { resolveImportCostMultiplier } from '$lib/game/simulationRules';
import { getStaffXpForLevel } from '$lib/game/staffLeveling';
import { assignStaffToStore, hireCandidate, promoteStaff, unassignStaff } from '$lib/game/staffing';
import { resolveDecision, updatePolicy, upgradeStore } from '$lib/game/state';
import { updateStoreProduct } from '$lib/game/stock';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason
} from '$lib/game/storeFootprint';
import type { GameState } from '$lib/game/types';
import {
	financeWorldCityOpening,
	getWorldCityDefinition,
	openWorldCity,
	selectWorldCity
} from '$lib/game/world';
import { shouldReplaceBestResult } from './scoring';
import { currentScenarioDefinition } from './catalog';
import { MAX_SCENARIO_SEED } from './types';
import type {
	ScenarioCommand,
	ScenarioCondition,
	ScenarioDefinition,
	ScenarioId,
	ScenarioRun
} from './types';
import {
	abandonScenario,
	compileSimulationRules,
	evaluateScenario,
	executeScenarioCommand,
	restartScenario,
	startScenario
} from './runtime';

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

const IMPORT_SQUEEZE_REFERENCE_OPENING: ScenarioCommand[] = [
	{
		kind: 'updatePolicy',
		patch: {
			pricing: 'premium',
			inventory: 'lean',
			staffing: 'service',
			marketing: 'loyalty',
			service: 'balanced'
		}
	},
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'store-1',
		categoryId: 'games',
		sellingPrice: 72
	},
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'store-1',
		categoryId: 'accessories',
		sellingPrice: 32
	},
	{
		kind: 'updateStoreInventoryTargets',
		storeId: 'store-1',
		categoryId: 'games',
		reorderThreshold: 10,
		targetStock: 45
	},
	{
		kind: 'updateStoreInventoryTargets',
		storeId: 'store-1',
		categoryId: 'accessories',
		reorderThreshold: 12,
		targetStock: 50
	}
];

const LOCAL_LIFELINE_REFERENCE_OPENING: ScenarioCommand[] = [
	{
		kind: 'buildIndustrialBuilding',
		tileId: 'industry-city-26-8',
		buildingTypeId: 'water-bottler'
	},
	{
		kind: 'updatePolicy',
		patch: {
			pricing: 'competitive',
			inventory: 'balanced',
			staffing: 'service',
			marketing: 'loyalty',
			service: 'balanced'
		}
	},
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'store-1',
		categoryId: 'bottled-water',
		sellingPrice: 4
	}
];

const ALL_CITY_IDS = [
	'harbor-city',
	'campus-junction',
	'garden-borough',
	'industry-city',
	'breadbasket-basin',
	'quarry-works'
] as const;

function foundingGame(seed = 280_001): GameState {
	const city = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: DEFAULT_RETAIL_CITY_WIDTH,
		height: DEFAULT_RETAIL_CITY_HEIGHT,
		seed
	});
	return {
		...createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: 'harbor-city-1-1',
			seed
		}),
		cash: 1_000_000,
		storeCap: 10
	};
}

function cashCondition(
	id: string,
	comparator: ScenarioCondition['comparator'],
	target: number
): ScenarioCondition {
	return {
		id,
		labelKey: 'store.defaultName',
		query: { metric: 'cash' },
		comparator,
		target,
		window: { kind: 'current' }
	};
}

function commandDefinition(
	allowedCommands: readonly ScenarioCommand['kind'][],
	overrides: Partial<ScenarioDefinition> = {}
): ScenarioDefinition {
	return {
		id: 'first-profit',
		version: 1,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed: 280_001,
		dayLimit: 100,
		start: {
			foundingStore: {
				ref: 'founder',
				archetypeId: 'convenience',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1'
			},
			industrialBuildings: [],
			rails: [],
			overrides: {}
		},
		content: {
			cityIds: ALL_CITY_IDS,
			archetypeIds: ['convenience', 'boutique', 'electronics', 'grocery'],
			productCategoryIds: [
				'bottled-water',
				'snacks',
				'drinks',
				'essentials',
				'games',
				'accessories',
				'devices',
				'gifts',
				'produce',
				'pantry',
				'prepared'
			],
			materialIds: ['water', 'bottled-water', 'grain', 'snacks'],
			buildingTypeIds: ['grain-farm', 'water-pump', 'water-bottler', 'warehouse'],
			retailPlacements: [],
			industrialPlacements: []
		},
		allowedCommands,
		modifiers: [],
		requiredObjectives: [cashCondition('unreachable-cash', 'gt', 2_000_000_000)],
		optionalObjectives: [],
		failures: [cashCondition('catastrophic-cash', 'lt', -2_000_000_000)],
		scoreComponents: [],
		medalThresholds: { silver: 700, gold: 850 },
		...overrides
	};
}

function activeRun(definition: ScenarioDefinition, game: GameState): ScenarioRun {
	return {
		runId: crypto.randomUUID(),
		definition: { scenarioId: definition.id, version: definition.version },
		seed: game.seed,
		eligibility: game.seed === definition.officialSeed ? 'ranked' : 'unranked',
		status: 'active',
		game,
		evaluation: evaluateScenario(definition, game, false),
		result: null
	};
}

function changedRun(
	run: ScenarioRun,
	definition: ScenarioDefinition,
	command: ScenarioCommand
): ScenarioRun {
	const result = executeScenarioCommand(run, definition, command);
	if (!result.ok || !result.changed) {
		throw new Error(`Expected ${command.kind} to change the run.`);
	}
	return result.run;
}

function decisionGame(cashEffect: number, overrides: Partial<GameState> = {}): GameState {
	const game = foundingGame();
	return {
		...game,
		...overrides,
		decisions: [
			{
				kind: 'event',
				id: 'test-decision',
				eventId: 'test-decision',
				definitionVersion: 1,
				generatedOnDay: game.day,
				expiresOnDay: game.day + 2,
				target: { kind: 'company' },
				copy: { key: 'events.testDecision', params: {} },
				options: [
					{
						id: 'take-option',
						effects: [{ kind: 'cash-adjust', amount: cashEffect }],
						modifiers: []
					}
				]
			}
		]
	};
}

function findExpansionTile(game: GameState) {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId)!;
	const lookup = createCityTileLookup(city);
	const occupied = getOccupiedStoreTileIds(city, game.stores, lookup);
	return city.tiles.find(
		(tile) => getStoreFootprintPlacementBlockReason(lookup, tile, occupied) === null
	)!;
}

function grainBuildFixture() {
	const game = foundingGame();
	const city = game.industryCities.find((candidate) => candidate.id === game.activeIndustryCityId)!;
	const tile = getIndustryTilesByResource(city, 'grain-field')[0]!;
	return { game, tile };
}

function railBuildFixture(): { game: GameState; input: RailBuildInput } {
	let game = foundingGame();
	game = buildIndustrialBuilding(game, {
		tileId: 'industry-city-26-6',
		buildingTypeId: 'water-bottler'
	});
	game = buildIndustrialBuilding(game, {
		tileId: 'industry-city-30-6',
		buildingTypeId: 'warehouse'
	});
	const [origin, destination] = game.industrialBuildings;
	if (!origin || !destination) throw new Error('Rail fixture buildings failed to materialize.');
	return {
		game,
		input: {
			originBuildingId: origin.id,
			waypoints: [],
			destinationBuildingId: destination.id
		}
	};
}

function builtRailFixture() {
	const fixture = railBuildFixture();
	const game = buildRail(fixture.game, fixture.input);
	if (game === fixture.game) throw new Error('Rail fixture path failed to build.');
	const city = game.industryCities.find((candidate) => candidate.id === game.activeIndustryCityId)!;
	const segment = deriveRailSegments(buildRailNetwork(city), game.industrialBuildings)[0];
	if (!segment) throw new Error('Rail fixture segment failed to derive.');
	return { game, city, segment };
}

function startableDefinition(
	id: ScenarioId = 'first-profit',
	overrides: Partial<ScenarioDefinition> = {}
): ScenarioDefinition {
	const officialSeed =
		id === 'first-profit' ? 280_001 : id === 'import-squeeze' ? 280_002 : 280_003;
	const dayLimit = id === 'first-profit' ? 14 : 21;
	return {
		id,
		version: 1,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed,
		dayLimit,
		start: {
			foundingStore: {
				ref: 'founder',
				archetypeId: 'convenience',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1'
			},
			industrialBuildings: [],
			rails: [],
			overrides: {
				cash: 100_000_000,
				storeCap: 1,
				stores: [
					{
						storeRef: 'founder',
						targetLevel: 1,
						products: [
							{
								categoryId: 'bottled-water',
								stock: 50,
								reorderThreshold: 10,
								targetStock: 70,
								sellingPrice: 3
							}
						]
					}
				]
			}
		},
		content: {
			cityIds: ['harbor-city'],
			archetypeIds: ['convenience'],
			productCategoryIds: ['bottled-water'],
			materialIds: [],
			buildingTypeIds: [],
			retailPlacements: [
				{
					cityId: 'harbor-city',
					tileId: 'harbor-city-1-1',
					archetypeId: 'convenience'
				}
			],
			industrialPlacements: []
		},
		allowedCommands: [
			'advanceDay',
			'resolveDecision',
			'updatePolicy',
			'selectWorldCity',
			'hireStaff',
			'assignStaff',
			'unassignStaff',
			'promoteStaff',
			'updateStoreSellingPrice',
			'updateStoreInventoryTargets'
		],
		modifiers: [],
		requiredObjectives: [cashCondition('unreachable-cash', 'gt', 2_000_000_000)],
		optionalObjectives: [cashCondition('kept-cash', 'gte', 0)],
		failures: [cashCondition('negative-cash', 'lt', 0)],
		scoreComponents: [{ kind: 'optional-objective', objectiveId: 'kept-cash', points: 500 }],
		medalThresholds: { silver: 700, gold: 850 },
		...overrides
	};
}

function mustStart(definition: ScenarioDefinition, seed = definition.officialSeed): ScenarioRun {
	const result = startScenario(definition, seed);
	if (!result.ok) {
		throw new Error(
			`Scenario failed to start: ${result.error.code} ${JSON.stringify(result.error.diagnostics)}`
		);
	}
	return result.value;
}

describe('executeScenarioCommand dispatch', { timeout: 30_000 }, () => {
	it('compiles scenario modifier provenance from the scenario id and definition index', () => {
		const definition = commandDefinition([], {
			modifiers: [
				{
					kind: 'import-cost-multiplier',
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['games'] },
					multiplier: 1.5
				},
				{
					kind: 'import-cost-multiplier',
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['accessories'] },
					multiplier: 2
				}
			]
		});

		const rules = compileSimulationRules(definition);

		expect(rules.importCostMultipliers).toEqual([
			{
				source: { kind: 'scenario', sourceId: `scenario:${definition.id}:modifier:0` },
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['games'] },
				multiplier: 1.5
			},
			{
				source: { kind: 'scenario', sourceId: `scenario:${definition.id}:modifier:1` },
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['accessories'] },
				multiplier: 2
			}
		]);
		expect(
			resolveImportCostMultiplier(rules, 'retail-product', 'games').contributions
		).toHaveLength(1);
		expect(
			resolveImportCostMultiplier(rules, 'retail-product', 'accessories').contributions
		).toHaveLength(1);
	});

	it('executes advanceDay with definition modifiers and preserves automatic world reveals', () => {
		const game: GameState = {
			...foundingGame(),
			day: 6,
			world: {
				revealedCityIds: ['harbor-city', 'industry-city'],
				openedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: []
			}
		};
		const definition = commandDefinition(['advanceDay'], {
			content: {
				...commandDefinition([]).content,
				cityIds: ['harbor-city', 'industry-city']
			},
			modifiers: [
				{
					kind: 'import-cost-multiplier',
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['bottled-water'] },
					multiplier: 1.5
				}
			]
		});

		const next = changedRun(activeRun(definition, game), definition, { kind: 'advanceDay' });
		const expected = simulateDay(game, {
			importCostMultipliers: definition.modifiers.map((modifier, index) => ({
				...modifier,
				source: {
					kind: 'scenario',
					sourceId: `scenario:${definition.id}:modifier:${index}`
				}
			}))
		});

		expect(next.game).toEqual(expected);
		expect(next.game.world.revealedCityIds).toContain('campus-junction');
	});

	it('executes resolveDecision', () => {
		const game = decisionGame(500);
		const definition = commandDefinition(['resolveDecision']);

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'resolveDecision',
			decisionId: 'test-decision',
			optionId: 'take-option'
		});

		const resolved = resolveDecision(game, 'test-decision', 'take-option');
		expect(resolved.ok).toBe(true);
		if (!resolved.ok) return;
		expect(next.game).toEqual(resolved.game);
	});

	it('preserves typed decision failures without changing the scenario run', () => {
		const game = decisionGame(500);
		const definition = commandDefinition(['resolveDecision']);
		const run = activeRun(definition, game);
		const snapshot = structuredClone(run);

		const result = executeScenarioCommand(run, definition, {
			kind: 'resolveDecision',
			decisionId: 'missing-decision',
			optionId: 'missing-option'
		});

		expect(result).toEqual({
			ok: false,
			code: 'invalid-command',
			decisionFailure: {
				code: 'decision-not-found',
				context: { decisionId: 'missing-decision' }
			}
		});
		expect(run.game).toBe(game);
		expect(run).toEqual(snapshot);
	});

	it('executes updatePolicy', () => {
		const game = foundingGame();
		const definition = commandDefinition(['updatePolicy']);

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'updatePolicy',
			patch: { pricing: 'premium' }
		});

		expect(next.game).toEqual(updatePolicy(game, { pricing: 'premium' }));
	});

	it('executes openWorldCity for an allowlisted revealed city', () => {
		const game: GameState = {
			...foundingGame(),
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
				openedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: []
			}
		};
		const definition = commandDefinition(['openWorldCity']);

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'openWorldCity',
			cityId: 'campus-junction'
		});

		expect(next.game).toEqual(openWorldCity(game, 'campus-junction'));
		expect(next.game.world.openedCityIds).toContain('campus-junction');
	});

	it('executes selectWorldCity only for an opened allowlisted city', () => {
		const game = { ...foundingGame(), activeCityId: 'campus-junction' };
		const definition = commandDefinition(['selectWorldCity']);

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'selectWorldCity',
			cityId: 'harbor-city'
		});

		expect(next.game).toEqual(selectWorldCity(game, 'harbor-city'));
	});

	it('executes openStore at the exact allowlisted active-city placement', () => {
		const game = foundingGame();
		const tile = findExpansionTile(game);
		const base = commandDefinition(['openStore']);
		const definition = {
			...base,
			content: {
				...base.content,
				retailPlacements: [
					{ cityId: 'harbor-city' as const, tileId: tile.id, archetypeId: 'convenience' as const }
				]
			}
		};

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'openStore',
			tileId: tile.id,
			archetypeId: 'convenience'
		});

		expect(next.game).toEqual(
			openStoreAtTile(game, { tileId: tile.id, archetypeId: 'convenience' })
		);
		expect(next.game.stores).toHaveLength(2);
	});

	it('executes upgradeStore', () => {
		const game = foundingGame();
		const definition = commandDefinition(['upgradeStore']);
		const storeId = game.stores[0]!.id;

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'upgradeStore',
			storeId
		});

		expect(next.game).toEqual(upgradeStore(game, storeId));
	});

	it('executes hireStaff', () => {
		const game = foundingGame();
		const definition = commandDefinition(['hireStaff']);
		const candidateId = game.hiringCandidates[0]!.id;

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'hireStaff',
			candidateId
		});

		expect(next.game).toEqual(hireCandidate(game, candidateId));
	});

	it('executes assignStaff', () => {
		const game = {
			...foundingGame(),
			staff: foundingGame().staff.map((member, index) =>
				index === 0 ? { ...member, assignedStoreId: null } : member
			)
		};
		const definition = commandDefinition(['assignStaff']);
		const staffId = game.staff[0]!.id;
		const storeId = game.stores[0]!.id;

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'assignStaff',
			staffId,
			storeId
		});

		expect(next.game).toEqual(assignStaffToStore(game, staffId, storeId));
	});

	it('executes unassignStaff', () => {
		const game = foundingGame();
		const definition = commandDefinition(['unassignStaff']);
		const staffId = game.staff[0]!.id;

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'unassignStaff',
			staffId
		});

		expect(next.game).toEqual(unassignStaff(game, staffId));
	});

	it('executes promoteStaff', () => {
		const base = foundingGame();
		const staffId = base.staff[0]!.id;
		const game = {
			...base,
			staff: base.staff.map((member) =>
				member.id === staffId ? { ...member, xp: getStaffXpForLevel(member.level) } : member
			)
		};
		const definition = commandDefinition(['promoteStaff']);

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'promoteStaff',
			staffId
		});

		expect(next.game).toEqual(promoteStaff(game, staffId));
	});

	it('executes updateStoreSellingPrice with only the permitted price patch', () => {
		const game = foundingGame();
		const definition = commandDefinition(['updateStoreSellingPrice']);
		const store = game.stores[0]!;
		const product = store.products[0]!;

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'updateStoreSellingPrice',
			storeId: store.id,
			categoryId: product.categoryId,
			sellingPrice: product.sellingPrice + 3
		});

		expect(next.game).toEqual(
			updateStoreProduct(game, store.id, product.categoryId, {
				sellingPrice: product.sellingPrice + 3
			})
		);
		expect(next.game.stores[0]!.products[0]).toMatchObject({
			reorderThreshold: product.reorderThreshold,
			targetStock: product.targetStock
		});
	});

	it('executes updateStoreInventoryTargets with only the permitted inventory patch', () => {
		const game = foundingGame();
		const definition = commandDefinition(['updateStoreInventoryTargets']);
		const store = game.stores[0]!;
		const product = store.products[0]!;

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'updateStoreInventoryTargets',
			storeId: store.id,
			categoryId: product.categoryId,
			reorderThreshold: product.reorderThreshold + 2,
			targetStock: product.targetStock + 4
		});

		expect(next.game).toEqual(
			updateStoreProduct(game, store.id, product.categoryId, {
				reorderThreshold: product.reorderThreshold + 2,
				targetStock: product.targetStock + 4
			})
		);
		expect(next.game.stores[0]!.products[0]!.sellingPrice).toBe(product.sellingPrice);
	});

	it('executes buildIndustrialBuilding at the exact allowlisted active-city placement', () => {
		const { game, tile } = grainBuildFixture();
		const base = commandDefinition(['buildIndustrialBuilding']);
		const definition = {
			...base,
			content: {
				...base.content,
				industrialPlacements: [
					{
						cityId: 'industry-city' as const,
						tileId: tile.id,
						buildingTypeId: 'grain-farm' as const
					}
				]
			}
		};

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'buildIndustrialBuilding',
			tileId: tile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(next.game).toEqual(
			buildIndustrialBuilding(game, { tileId: tile.id, buildingTypeId: 'grain-farm' })
		);
	});

	it('executes upgradeIndustrialBuilding', () => {
		const fixture = grainBuildFixture();
		const game = buildIndustrialBuilding(fixture.game, {
			tileId: fixture.tile.id,
			buildingTypeId: 'grain-farm'
		});
		const definition = commandDefinition(['upgradeIndustrialBuilding']);
		const buildingId = game.industrialBuildings[0]!.id;

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'upgradeIndustrialBuilding',
			buildingId
		});

		expect(next.game).toEqual(upgradeBuilding(game, buildingId));
	});

	it('executes buildRail and clones the readonly waypoint payload', () => {
		const { game, input } = railBuildFixture();
		const definition = commandDefinition(['buildRail']);

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'buildRail',
			originBuildingId: input.originBuildingId,
			waypoints: input.waypoints,
			destinationBuildingId: input.destinationBuildingId
		});

		expect(next.game).toEqual(buildRail(game, input));
	});

	it('executes upgradeRail', () => {
		const { game, city, segment } = builtRailFixture();
		const definition = commandDefinition(['upgradeRail']);

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'upgradeRail',
			cityId: city.id,
			segmentId: segment.id
		});

		expect(next.game).toEqual(upgradeRailSegment(game, city.id, segment.id));
	});

	it('executes demolishRail', () => {
		const { game, city, segment } = builtRailFixture();
		const definition = commandDefinition(['demolishRail']);

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'demolishRail',
			cityId: city.id,
			segmentId: segment.id
		});

		expect(next.game).toEqual(demolishRailSegment(game, city.id, segment.id));
	});

	it('replays working-capital borrowing with its exact term and amount payload', () => {
		const game = foundingGame();
		const definition = commandDefinition(['borrow']);
		const command: ScenarioCommand = { kind: 'borrow', amount: 1_000, termDays: 56 };
		const next = changedRun(activeRun(definition, game), definition, command);
		const expected = borrow(game, { purpose: 'workingCapital', amount: 1_000, termDays: 56 });
		expect(expected).toMatchObject({ ok: true });
		if (!expected.ok) throw new Error('Expected finance fixture to borrow.');
		expect(next.game).toEqual(expected.game);
	});

	it('replays repayment, payoff, and refinance against the exact recorded loan id', () => {
		const borrowed = borrow(foundingGame(), {
			purpose: 'workingCapital',
			amount: 1_000,
			termDays: 56
		});
		if (!borrowed.ok) throw new Error('Expected finance fixture to borrow.');
		const loanId = borrowed.receipt.loanId;
		for (const [command, expected] of [
			[
				{ kind: 'repayLoan', loanId, amount: 100 } as const,
				repayLoan(borrowed.game, { loanId, amount: 100 })
			],
			[{ kind: 'payOffLoan', loanId } as const, payOffLoan(borrowed.game, loanId)],
			[
				{ kind: 'refinanceLoan', loanId, termDays: 84 } as const,
				refinanceLoan(borrowed.game, { loanId, termDays: 84 })
			]
		] as const) {
			expect(expected).toMatchObject({ ok: true });
			if (!expected.ok) throw new Error(`Expected ${command.kind} fixture to succeed.`);
			const definition = commandDefinition([command.kind]);
			const next = changedRun(activeRun(definition, borrowed.game), definition, command);
			expect(next.game).toEqual(expected.game);
		}
	});

	it('replays financed purchases with their exact expected-cost payloads', () => {
		const city = getWorldCityDefinition('campus-junction')!;
		const retailTile = findExpansionTile(foundingGame());
		const retailCost = forecastOpening(retailTile, 'convenience').setupCost;
		const industry = grainBuildFixture();

		// Each game is genuinely cash-short so the finance command borrows a
		// real shortfall instead of silently falling back to the cash-only
		// transition. foundingGame() forces cash to $1,000,000, which would
		// bypass the financing path entirely.
		const worldGame: GameState = {
			...foundingGame(),
			cash: city.openingCost - 250,
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
				openedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: []
			}
		};
		const retailGame: GameState = { ...foundingGame(), cash: retailCost - 250 };
		const industryGame: GameState = { ...industry.game, cash: 375 };

		const commands: Array<{
			game: GameState;
			command: ScenarioCommand;
			expected: ReturnType<typeof financeWorldCityOpening>;
		}> = [
			{
				game: worldGame,
				command: { kind: 'financeWorldCity', cityId: city.id, expectedCost: city.openingCost },
				expected: financeWorldCityOpening(worldGame, {
					cityId: city.id,
					expectedCost: city.openingCost
				})
			},
			{
				game: retailGame,
				command: {
					kind: 'financeRetailStore',
					tileId: retailTile.id,
					archetypeId: 'convenience',
					expectedCost: retailCost
				},
				expected: financeRetailStoreOpening(retailGame, {
					tileId: retailTile.id,
					archetypeId: 'convenience',
					expectedCost: retailCost
				})
			},
			{
				game: industryGame,
				command: {
					kind: 'financeIndustrialBuilding',
					tileId: industry.tile.id,
					buildingTypeId: 'grain-farm',
					expectedCost: 600
				},
				expected: financeIndustrialBuilding(industryGame, {
					tileId: industry.tile.id,
					buildingTypeId: 'grain-farm',
					expectedCost: 600
				})
			}
		];
		for (const { game, command, expected } of commands) {
			expect(expected).toMatchObject({ ok: true });
			if (!expected.ok) throw new Error(`Expected ${command.kind} fixture to succeed.`);
			const base = commandDefinition([command.kind]);
			const definition = {
				...base,
				content: {
					...base.content,
					retailPlacements:
						command.kind === 'financeRetailStore'
							? [
									{
										cityId: 'harbor-city' as const,
										tileId: command.tileId,
										archetypeId: command.archetypeId
									}
								]
							: base.content.retailPlacements,
					industrialPlacements:
						command.kind === 'financeIndustrialBuilding'
							? [
									{
										cityId: 'industry-city' as const,
										tileId: command.tileId,
										buildingTypeId: command.buildingTypeId
									}
								]
							: base.content.industrialPlacements
				}
			};
			const next = changedRun(activeRun(definition, game), definition, command);
			expect(next.game).toEqual(expected.game);
			// Assert a genuine loan was created — not a silent cash-only fallback.
			expect(expected.receipt.loanId).not.toBeNull();
			expect(expected.receipt.financedPrincipal).toBeGreaterThan(0);
			expect(next.game.finance.loans.at(-1)?.purpose).toBe('expansion');
		}
	});

	it('rejects a finance-only command when cash covers the purchase instead of falling back to the cash command', () => {
		const city = getWorldCityDefinition('campus-junction')!;
		const retailTile = findExpansionTile(foundingGame());
		const retailCost = forecastOpening(retailTile, 'convenience').setupCost;
		const industry = grainBuildFixture();

		// foundingGame() has $1,000,000 cash — more than enough for every
		// purchase. Each definition grants ONLY the finance command, not the
		// corresponding cash command. The finance command must reject with
		// cashSufficient rather than silently executing a cash purchase.
		const worldGame: GameState = {
			...foundingGame(),
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
				openedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: []
			}
		};
		const cases: Array<{
			game: GameState;
			command: ScenarioCommand;
			contentOverrides: Partial<ScenarioDefinition['content']>;
		}> = [
			{
				game: worldGame,
				command: {
					kind: 'financeWorldCity',
					cityId: city.id,
					expectedCost: city.openingCost
				},
				contentOverrides: {}
			},
			{
				game: foundingGame(),
				command: {
					kind: 'financeRetailStore',
					tileId: retailTile.id,
					archetypeId: 'convenience',
					expectedCost: retailCost
				},
				contentOverrides: {
					retailPlacements: [
						{
							cityId: 'harbor-city' as const,
							tileId: retailTile.id,
							archetypeId: 'convenience'
						}
					]
				}
			},
			{
				game: industry.game,
				command: {
					kind: 'financeIndustrialBuilding',
					tileId: industry.tile.id,
					buildingTypeId: 'grain-farm',
					expectedCost: 600
				},
				contentOverrides: {
					industrialPlacements: [
						{
							cityId: 'industry-city' as const,
							tileId: industry.tile.id,
							buildingTypeId: 'grain-farm'
						}
					]
				}
			}
		];

		for (const { game, command, contentOverrides } of cases) {
			const base = commandDefinition([command.kind]);
			const definition: ScenarioDefinition = {
				...base,
				content: { ...base.content, ...contentOverrides }
			};
			const run = activeRun(definition, game);
			const result = executeScenarioCommand(run, definition, command);
			expect(result).toMatchObject({
				ok: false,
				code: 'invalid-command',
				financeFailure: { code: 'cashSufficient' }
			});
			// The run's game must not advance.
			expect(run.game).toBe(game);
		}
	});

	it('maps a typed finance failure to invalid-command without advancing the run', () => {
		const game = foundingGame();
		const definition = commandDefinition(['repayLoan']);
		const run = activeRun(definition, game);
		expect(
			executeScenarioCommand(run, definition, {
				kind: 'repayLoan',
				loanId: 'missing-loan',
				amount: 100
			})
		).toEqual({
			ok: false,
			code: 'invalid-command',
			financeFailure: { code: 'loanNotFound', context: { loanId: 'missing-loan' } }
		});
		expect(run.game).toBe(game);
	});

	it('maps borrow, payoff, and refinance failures to invalid-command', () => {
		const game = foundingGame();
		const cases: Array<{ command: ScenarioCommand; allowed: ScenarioCommand['kind'][] }> = [
			{
				command: { kind: 'borrow', amount: 99_999_999, termDays: 56 },
				allowed: ['borrow']
			},
			{
				command: { kind: 'payOffLoan', loanId: 'missing-loan' },
				allowed: ['payOffLoan']
			},
			{
				command: { kind: 'refinanceLoan', loanId: 'missing-loan', termDays: 56 },
				allowed: ['refinanceLoan']
			}
		];
		for (const { command, allowed } of cases) {
			const definition = commandDefinition(allowed);
			const run = activeRun(definition, game);
			const result = executeScenarioCommand(run, definition, command);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('invalid-command');
			expect(run.game).toBe(game);
		}
	});

	it.each([null, 42, { id: 'loan-1' }] as const)(
		'maps a non-string finance loan id to invalid-command without advancing: %j',
		(loanId) => {
			const game = foundingGame();
			for (const command of [
				{ kind: 'repayLoan', loanId, amount: 100 },
				{ kind: 'payOffLoan', loanId },
				{ kind: 'refinanceLoan', loanId, termDays: 56 }
			] as const) {
				const definition = commandDefinition([command.kind]);
				const run = activeRun(definition, game);
				expect(
					executeScenarioCommand(run, definition, command as unknown as ScenarioCommand)
				).toEqual({ ok: false, code: 'invalid-command' });
				expect(run.game).toBe(game);
			}
		}
	);
});

function replayLaunchCalibration(
	scenarioId: ScenarioId,
	openingCommands: readonly ScenarioCommand[],
	resolveSupplierTerms: boolean
): ScenarioRun {
	const definition = currentScenarioDefinition(scenarioId);
	if (!definition) throw new Error(`Missing launch definition ${scenarioId}.`);
	const started = startScenario(definition, definition.officialSeed);
	if (!started.ok) throw new Error(`Launch definition ${scenarioId} failed setup.`);
	let run = started.value;

	for (const command of openingCommands) {
		const result = executeScenarioCommand(run, definition, command);
		if (!result.ok || !result.changed) {
			throw new Error(`${scenarioId} calibration command ${command.kind} did not change the run.`);
		}
		run = result.run;
		if (run.status !== 'active') return run;
	}

	while (run.status === 'active') {
		const day = executeScenarioCommand(run, definition, { kind: 'advanceDay' });
		if (!day.ok || !day.changed) {
			throw new Error(`${scenarioId} calibration failed to advance.`);
		}
		run = day.run;
		if (run.status !== 'active' || !resolveSupplierTerms) continue;
		const supplierTerms = run.game.decisions.find(
			(decision) => decision.kind === 'event' && decision.eventId === 'supplier-terms'
		);
		if (!supplierTerms) continue;
		const resolved = executeScenarioCommand(run, definition, {
			kind: 'resolveDecision',
			decisionId: supplierTerms.id,
			optionId: 'negotiate-credit'
		});
		if (!resolved.ok || !resolved.changed) {
			throw new Error(`${scenarioId} supplier terms were not resolved deterministically.`);
		}
		run = resolved.run;
	}

	return run;
}

describe('launch scenario calibration contracts', { timeout: 30_000 }, () => {
	it('keeps the first-profit calibration stable after instance-id resolution cutover', () => {
		const run = replayLaunchCalibration('first-profit', FIRST_PROFIT_REFERENCE_OPENING, true);

		expect(run.result).toMatchObject({ outcome: 'completed', completionDay: 4, score: 880 });
	});

	it.each([
		['first-profit', [], 'completed', 4, 682],
		['import-squeeze', [], 'completed', 18, 645],
		['local-lifeline', [], 'failed', 21, 500]
	] as const)(
		'%s no-action trace ends %s on day %i with the calibrated score %i',
		(scenarioId, opening, outcome, completionDay, score) => {
			const run = replayLaunchCalibration(scenarioId, opening, false);
			expect(run.status).not.toBe('active');
			expect(run.result).not.toBeNull();
			expect(run.result).toMatchObject({ outcome, completionDay, score });
			expect(run.result!.score).toBeLessThan(700);
			expect(run.result!.medal === null || run.result!.medal === 'bronze').toBe(true);
		}
	);

	it.each([
		['first-profit', FIRST_PROFIT_REFERENCE_OPENING, 4, 880, 'gold'],
		['import-squeeze', IMPORT_SQUEEZE_REFERENCE_OPENING, 15, 841, 'silver'],
		['local-lifeline', LOCAL_LIFELINE_REFERENCE_OPENING, 15, 877, 'gold']
	] as const)(
		'%s documented reference trace completes on day %i with calibrated score %i',
		(scenarioId, opening, completionDay, score, medal) => {
			const run = replayLaunchCalibration(scenarioId, opening, true);
			expect(run.status).toBe('completed');
			expect(run.result).toMatchObject({ outcome: 'completed', completionDay, score });
			expect(run.result?.medal).toBe(medal);
		}
	);
});

describe('scenario runtime lifecycle order', { timeout: 30_000 }, () => {
	it('returns the exact run without refreshing evaluation for a semantic no-op', () => {
		const game = foundingGame();
		const definition = commandDefinition(['updatePolicy']);
		const run = activeRun(definition, game);
		const evaluation = run.evaluation;

		const result = executeScenarioCommand(run, definition, {
			kind: 'updatePolicy',
			patch: { pricing: game.policy.pricing }
		});

		expect(result).toEqual({ ok: true, changed: false, run });
		if (result.ok) {
			expect(result.run).toBe(run);
			expect(result.run.evaluation).toBe(evaluation);
		}
	});

	it('dispatches retail supply source selections while preserving rejected and unchanged runs', () => {
		const game = foundingGame();
		const definition = commandDefinition(['setRetailSupplySource']);
		const run = activeRun(definition, game);
		const changed = executeScenarioCommand(run, definition, {
			kind: 'setRetailSupplySource',
			retailCityId: 'harbor-city',
			supplyCityId: null
		});

		expect(changed).toMatchObject({ ok: true, changed: true });
		if (!changed.ok || !changed.changed) {
			throw new Error('Expected the Imports-only selection to change the scenario run.');
		}
		expect(changed.run.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: null }
		]);

		expect(
			executeScenarioCommand(changed.run, definition, {
				kind: 'setRetailSupplySource',
				retailCityId: 'harbor-city',
				supplyCityId: null
			})
		).toEqual({ ok: true, changed: false, run: changed.run });

		const beforeRejected = structuredClone(run);
		expect(
			executeScenarioCommand(run, definition, {
				kind: 'setRetailSupplySource',
				retailCityId: 'harbor-city',
				supplyCityId: 'breadbasket-basin'
			})
		).toEqual({
			ok: false,
			code: 'invalid-command',
			retailSupplyFailure: { reason: 'supply-city-closed' }
		});
		expect(run).toEqual(beforeRejected);

		const forbiddenContent = {
			...definition,
			content: { ...definition.content, cityIds: ['harbor-city', 'industry-city'] as const }
		};
		expect(
			executeScenarioCommand(run, forbiddenContent, {
				kind: 'setRetailSupplySource',
				retailCityId: 'harbor-city',
				supplyCityId: 'breadbasket-basin'
			})
		).toEqual({ ok: false, code: 'forbidden-content' });
		expect(
			executeScenarioCommand(run, commandDefinition([]), {
				kind: 'setRetailSupplySource',
				retailCityId: 'harbor-city',
				supplyCityId: null
			})
		).toEqual({ ok: false, code: 'forbidden-command' });
	});

	it('rejects forbidden commands and content without mutating the run or evaluation', () => {
		const game = foundingGame();
		const definition = commandDefinition([]);
		const run = activeRun(definition, game);
		const before = structuredClone(run);

		expect(
			executeScenarioCommand(run, definition, {
				kind: 'updateStoreSellingPrice',
				storeId: game.stores[0]!.id,
				categoryId: 'not-allowed',
				sellingPrice: 9
			})
		).toEqual({ ok: false, code: 'forbidden-command' });
		expect(run).toEqual(before);

		const contentDefinition = commandDefinition(['updateStoreSellingPrice']);
		expect(
			executeScenarioCommand(run, contentDefinition, {
				kind: 'updateStoreSellingPrice',
				storeId: game.stores[0]!.id,
				categoryId: 'not-allowed',
				sellingPrice: 9
			})
		).toEqual({ ok: false, code: 'forbidden-content' });
		expect(run).toEqual(before);
	});

	it('fails immediately when a non-day decision makes cash negative', () => {
		const game = decisionGame(-1_000_001);
		const definition = commandDefinition(['resolveDecision'], {
			failures: [cashCondition('negative-cash', 'lt', 0)]
		});

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'resolveDecision',
			decisionId: 'test-decision',
			optionId: 'take-option'
		});

		expect(next.status).toBe('failed');
		expect(next.result?.outcome).toBe('failed');
		expect(next.result?.medal).toBeNull();
		expect(next.evaluation.failures[0]?.status).toBe('triggered');
	});

	it('gives failure precedence when success and failure become true together', () => {
		const game = decisionGame(-1_000_001);
		const definition = commandDefinition(['resolveDecision'], {
			requiredObjectives: [cashCondition('non-positive-cash', 'lte', 0)],
			failures: [cashCondition('negative-cash', 'lt', 0)]
		});

		const next = changedRun(activeRun(definition, game), definition, {
			kind: 'resolveDecision',
			decisionId: 'test-decision',
			optionId: 'take-option'
		});

		expect(next.evaluation.required[0]?.status).toBe('satisfied');
		expect(next.evaluation.failures[0]?.status).toBe('triggered');
		expect(next.status).toBe('failed');
	});

	it.each([
		{
			name: 'policy',
			command: { kind: 'updatePolicy', patch: { pricing: 'premium' } } as const
		},
		{
			name: 'product',
			command: {
				kind: 'updateStoreSellingPrice',
				storeId: 'store-1',
				categoryId: 'bottled-water',
				sellingPrice: 9
			} as const
		},
		{
			name: 'staff',
			command: { kind: 'hireStaff', candidateId: 'candidate-1-1' } as const
		}
	])('completes after a changed non-day $name command', ({ command }) => {
		const game = foundingGame();
		const candidateId = game.hiringCandidates[0]!.id;
		const store = game.stores[0]!;
		const product = store.products[0]!;
		const resolvedCommand: ScenarioCommand =
			command.kind === 'hireStaff'
				? { ...command, candidateId }
				: command.kind === 'updateStoreSellingPrice'
					? { ...command, storeId: store.id, categoryId: product.categoryId }
					: command;
		const definition = commandDefinition([resolvedCommand.kind], {
			requiredObjectives: [cashCondition('cash-preserved', 'gte', 0)],
			failures: []
		});

		const next = changedRun(activeRun(definition, game), definition, resolvedCommand);

		expect(next.status).toBe('completed');
		expect(next.result?.outcome).toBe('completed');
		expect(next.result?.medal).toBe('bronze');
	});

	it('applies the deadline only after advanceDay', () => {
		const game = { ...foundingGame(), day: 10 };
		const definition = commandDefinition(['advanceDay', 'updatePolicy'], {
			dayLimit: 10
		});
		const run = activeRun(definition, game);

		const afterPolicy = changedRun(run, definition, {
			kind: 'updatePolicy',
			patch: { pricing: 'premium' }
		});
		expect(afterPolicy.status).toBe('active');
		expect(afterPolicy.evaluation.deadline?.triggered).toBe(true);
		expect(afterPolicy.result).toBeNull();

		const afterDay = changedRun(afterPolicy, definition, { kind: 'advanceDay' });
		expect(afterDay.status).toBe('failed');
		expect(afterDay.result?.outcome).toBe('failed');
		expect(afterDay.evaluation.deadline?.triggered).toBe(true);
	});

	it('gives completion precedence over an advanceDay deadline', () => {
		const game = { ...foundingGame(), day: 9 };
		const definition = commandDefinition(['advanceDay'], {
			dayLimit: 10,
			requiredObjectives: [cashCondition('cash-preserved', 'gte', 0)],
			failures: []
		});

		const next = changedRun(activeRun(definition, game), definition, { kind: 'advanceDay' });

		expect(next.game.day).toBe(10);
		expect(next.evaluation.deadline?.triggered).toBe(true);
		expect(next.status).toBe('completed');
	});

	it('rejects stale and terminal runs before attempting a transition', () => {
		const definition = commandDefinition(['advanceDay']);
		const run = activeRun(definition, foundingGame());

		expect(
			executeScenarioCommand(run, { ...definition, version: 2 }, { kind: 'advanceDay' })
		).toEqual({ ok: false, code: 'stale-definition' });

		const terminal = abandonScenario(run);
		const result = terminal.result;
		expect(executeScenarioCommand(terminal, definition, { kind: 'advanceDay' })).toEqual({
			ok: false,
			code: 'terminal-run'
		});
		expect(terminal.result).toBe(result);
	});

	it('abandons once with no medal or best-result eligibility', () => {
		const definition = commandDefinition(['advanceDay']);
		const run = activeRun(definition, foundingGame());

		const abandoned = abandonScenario(run);

		expect(abandoned.status).toBe('abandoned');
		expect(abandoned.game).toBe(run.game);
		expect(abandoned.evaluation.required[0]?.status).toBe('missed');
		expect(abandoned.result).toMatchObject({ outcome: 'abandoned', medal: null });
		expect(shouldReplaceBestResult(null, abandoned.result!)).toBe(false);
		expect(abandonScenario(abandoned)).toBe(abandoned);
	});

	it('restarts the stored definition version with the selected seed', () => {
		const definition = startableDefinition();
		const customSeed = 280_111;
		const run = mustStart(definition, customSeed);

		const stale = restartScenario(run, { ...definition, version: 2, officialSeed: 999_999 });
		expect(stale).toMatchObject({ ok: false, error: { code: 'stale-definition' } });

		const restarted = restartScenario(run, definition);
		const fresh = startScenario(definition, customSeed);
		// runId is a persistence identity generated per startScenario call,
		// so exclude it when comparing restart equivalence.
		expect(restarted.ok).toBe(fresh.ok);
		if (restarted.ok && fresh.ok) {
			const { runId: _restartedId, ...restartedWithoutId } = restarted.value;
			void _restartedId;
			const { runId: _freshId, ...freshWithoutId } = fresh.value;
			void _freshId;
			expect(restartedWithoutId).toEqual(freshWithoutId);
		}
		if (restarted.ok) {
			expect(restarted.value.definition).toEqual(run.definition);
			expect(restarted.value.seed).toBe(customSeed);
			expect(restarted.value.eligibility).toBe('unranked');
		}
	});

	it('replays the same multi-command sequence to a deeply equal terminal result', () => {
		const game = { ...foundingGame(), day: 7 };
		const definition = commandDefinition(
			['advanceDay', 'updatePolicy', 'updateStoreSellingPrice'],
			{
				requiredObjectives: [
					{
						id: 'one-import-cycle',
						labelKey: 'store.defaultName',
						query: { metric: 'completed-retail-import-cycles' },
						comparator: 'gte',
						target: 1,
						window: { kind: 'run-to-date' }
					}
				],
				failures: [],
				scoreComponents: [
					{
						kind: 'metric',
						query: { metric: 'cash' },
						window: { kind: 'current' },
						zeroBonusAt: 0,
						fullBonusAt: 1_000_000,
						points: 500
					}
				]
			}
		);
		const store = game.stores[0]!;
		const product = store.products[0]!;
		const commands: ScenarioCommand[] = [
			{ kind: 'updatePolicy', patch: { pricing: 'premium' } },
			{
				kind: 'updateStoreSellingPrice',
				storeId: store.id,
				categoryId: product.categoryId,
				sellingPrice: product.sellingPrice + 2
			},
			{ kind: 'advanceDay' }
		];
		const replay = () =>
			commands.reduce(
				(current, command) => changedRun(current, definition, command),
				activeRun(definition, structuredClone(game))
			);

		const first = replay();
		const second = replay();

		expect(first.status).toBe('completed');
		expect(second.game).toEqual(first.game);
		expect(second.evaluation).toEqual(first.evaluation);
		expect(second.result).toEqual(first.result);
		expect(second.result?.score).toBe(first.result?.score);
		expect(second.result?.medal).toBe(first.result?.medal);
	});
});

describe(
	'scenario start and deterministic launch-shaped decision streams',
	{ timeout: 30_000 },
	() => {
		it('maps setup diagnostics into the shared scenario operation result', () => {
			const definition = startableDefinition();
			const invalid = {
				...definition,
				start: {
					...definition.start,
					foundingStore: { ...definition.start.foundingStore, tileId: 'missing-tile' }
				}
			};

			expect(startScenario(invalid, invalid.officialSeed)).toMatchObject({
				ok: false,
				error: { code: 'invalid-definition' }
			});
		});

		it.each([
			['zero', 0, 1],
			['negative', -5, 5],
			['over-max', MAX_SCENARIO_SEED + 1, 1]
		] as const)(
			'normalizes a non-canonical seed (%s) so the run seed matches the game seed',
			(_label, input, expected) => {
				const definition = startableDefinition();
				const result = startScenario(definition, input);
				expect.assertions(3);
				if (!result.ok) throw new Error('Expected start to succeed with a normalized seed.');
				expect(result.value.seed).toBe(expected);
				expect(result.value.game.seed).toBe(expected);
				expect(result.value.seed).toBe(result.value.game.seed);
			}
		);

		it.each([
			['first-profit', 280_001],
			['import-squeeze', 280_002],
			['local-lifeline', 280_003]
		] as const)(
			'accepts the normal deterministic decision stream for %s',
			(scenarioId, officialSeed) => {
				const definition = startableDefinition(scenarioId, { officialSeed });
				let run = mustStart(definition);
				let resolvedCount = 0;

				while (run.status === 'active') {
					const dayResult = executeScenarioCommand(run, definition, { kind: 'advanceDay' });
					if (!dayResult.ok || !dayResult.changed) {
						throw new Error('Launch-shaped fixture failed to advance deterministically.');
					}
					run = dayResult.run;
					if (run.status !== 'active') break;

					for (const decision of [...run.game.decisions]) {
						const option = decision.options[0];
						if (!option) continue;
						const decisionResult = executeScenarioCommand(run, definition, {
							kind: 'resolveDecision',
							decisionId: decision.id,
							optionId: option.id
						});
						if (!decisionResult.ok) {
							// A generated finance decision can be unavailable under the
							// deterministic credit model. Leave it pending and continue the trace.
							if (decisionResult.decisionFailure?.code === 'finance-unavailable') continue;
							throw new Error(
								`Generated scenario decision was rejected: ${decisionResult.decisionFailure?.code ?? decisionResult.code}`
							);
						}
						if (!decisionResult.changed) continue;
						run = decisionResult.run;
						resolvedCount += 1;
					}
				}

				expect(resolvedCount).toBeGreaterThan(0);
				expect(run.status).toBe('failed');
				expect(run.evaluation.deadline?.triggered).toBe(true);
			}
		);
	}
);
