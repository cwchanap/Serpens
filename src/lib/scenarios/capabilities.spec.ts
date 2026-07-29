import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import {
	SCENARIO_COMMAND_KINDS,
	type ScenarioCommand,
	type ScenarioDefinition,
	type ScenarioRun
} from './types';
import {
	isScenarioCommandAllowed,
	isScenarioContentAllowed,
	type ScenarioContentQuery
} from './capabilities';

function definition(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
	return {
		id: 'first-profit',
		version: 1,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed: 280_001,
		dayLimit: 14,
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
			cityIds: ['harbor-city', 'industry-city', 'campus-junction'],
			archetypeIds: ['convenience', 'boutique', 'electronics', 'grocery'],
			productCategoryIds: ['bottled-water', 'snacks', 'games'],
			materialIds: ['water', 'bottled-water'],
			buildingTypeIds: ['water-pump', 'water-bottler', 'warehouse'],
			retailPlacements: [
				{
					cityId: 'harbor-city',
					tileId: 'harbor-tile',
					archetypeId: 'convenience'
				}
			],
			industrialPlacements: [
				{
					cityId: 'industry-city',
					tileId: 'industry-tile',
					buildingTypeId: 'water-pump'
				}
			]
		},
		allowedCommands: SCENARIO_COMMAND_KINDS,
		modifiers: [],
		requiredObjectives: [],
		optionalObjectives: [],
		failures: [],
		scoreComponents: [],
		medalThresholds: { silver: 700, gold: 850 },
		...overrides
	};
}

function run(gameOverrides: Partial<GameState> = {}): ScenarioRun {
	const game = createNewGame('convenience', 280_001);
	const scenario = definition();
	return {
		runId: crypto.randomUUID(),
		definition: { scenarioId: scenario.id, version: scenario.version },
		seed: scenario.officialSeed,
		eligibility: 'ranked',
		status: 'active',
		game: { ...game, ...gameOverrides },
		evaluation: {
			day: game.day,
			required: [],
			optional: [],
			failures: [],
			deadline: null,
			risks: [],
			projection: { score: 500, medal: 'bronze', componentPoints: [], componentEvidence: [] }
		},
		result: null
	};
}

const commands = [
	{ kind: 'advanceDay' },
	{ kind: 'resolveDecision', decisionId: 'decision-1', optionId: 'option-1' },
	{ kind: 'updatePolicy', patch: { pricing: 'premium' } },
	{ kind: 'openWorldCity', cityId: 'campus-junction' },
	{ kind: 'selectWorldCity', cityId: 'harbor-city' },
	{ kind: 'openStore', tileId: 'harbor-tile', archetypeId: 'convenience' },
	{ kind: 'upgradeStore', storeId: 'missing-store' },
	{ kind: 'hireStaff', candidateId: 'missing-candidate' },
	{ kind: 'assignStaff', staffId: 'missing-staff', storeId: 'missing-store' },
	{ kind: 'unassignStaff', staffId: 'missing-staff' },
	{ kind: 'promoteStaff', staffId: 'missing-staff' },
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'missing-store',
		categoryId: 'bottled-water',
		sellingPrice: 5
	},
	{
		kind: 'updateStoreInventoryTargets',
		storeId: 'missing-store',
		categoryId: 'bottled-water',
		reorderThreshold: 5,
		targetStock: 20
	},
	{ kind: 'buildIndustrialBuilding', tileId: 'industry-tile', buildingTypeId: 'water-pump' },
	{ kind: 'upgradeIndustrialBuilding', buildingId: 'missing-building' },
	{
		kind: 'buildRail',
		originBuildingId: 'missing-origin',
		waypoints: [],
		destinationBuildingId: 'missing-destination'
	},
	{ kind: 'upgradeRail', cityId: 'industry-city', segmentId: 'missing-segment' },
	{ kind: 'demolishRail', cityId: 'industry-city', segmentId: 'missing-segment' },
	{ kind: 'borrow', amount: 1_000, termDays: 56 },
	{ kind: 'repayLoan', loanId: 'loan-1', amount: 100 },
	{ kind: 'payOffLoan', loanId: 'loan-1' },
	{ kind: 'refinanceLoan', loanId: 'loan-1', termDays: 84 },
	{ kind: 'financeWorldCity', cityId: 'campus-junction', expectedCost: 12_000 },
	{
		kind: 'financeRetailStore',
		tileId: 'harbor-tile',
		archetypeId: 'convenience',
		expectedCost: 12_000
	},
	{
		kind: 'financeIndustrialBuilding',
		tileId: 'industry-tile',
		buildingTypeId: 'water-pump',
		expectedCost: 12_000
	}
] as const satisfies readonly ScenarioCommand[];

describe('scenario command capabilities', () => {
	it.each(commands)(
		'allows the $kind command when its command and content are permitted',
		(command) => {
			expect(isScenarioCommandAllowed(definition(), run(), command)).toEqual({ allowed: true });
		}
	);

	it('checks command permission before command content', () => {
		const scenario = definition({ allowedCommands: [] });
		const command = { kind: 'openStore', tileId: 'not-allowed', archetypeId: 'grocery' } as const;

		expect(isScenarioCommandAllowed(scenario, run(), command)).toEqual({
			allowed: false,
			code: 'forbidden-command',
			path: 'allowedCommands.openStore'
		});
	});

	it('keeps selling-price and inventory-target permissions independent', () => {
		const state = run();
		const price = {
			kind: 'updateStoreSellingPrice',
			storeId: 'store-1',
			categoryId: 'bottled-water',
			sellingPrice: 6
		} as const;
		const inventory = {
			kind: 'updateStoreInventoryTargets',
			storeId: 'store-1',
			categoryId: 'bottled-water',
			reorderThreshold: 10,
			targetStock: 40
		} as const;

		expect(
			isScenarioCommandAllowed(
				definition({ allowedCommands: ['updateStoreSellingPrice'] }),
				state,
				price
			)
		).toEqual({ allowed: true });
		expect(
			isScenarioCommandAllowed(
				definition({ allowedCommands: ['updateStoreSellingPrice'] }),
				state,
				inventory
			)
		).toMatchObject({ allowed: false, code: 'forbidden-command' });
		expect(
			isScenarioCommandAllowed(
				definition({ allowedCommands: ['updateStoreInventoryTargets'] }),
				state,
				price
			)
		).toMatchObject({ allowed: false, code: 'forbidden-command' });
		expect(
			isScenarioCommandAllowed(
				definition({ allowedCommands: ['updateStoreInventoryTargets'] }),
				state,
				inventory
			)
		).toEqual({ allowed: true });
	});

	it('allows city selection only for opened allowlisted cities', () => {
		const scenario = definition({ allowedCommands: ['selectWorldCity'] });
		const state = run({
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
				openedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: []
			}
		});

		expect(
			isScenarioCommandAllowed(scenario, state, {
				kind: 'selectWorldCity',
				cityId: 'campus-junction'
			})
		).toEqual({
			allowed: false,
			code: 'forbidden-content',
			path: 'command.selectWorldCity.cityId'
		});

		const opened = {
			...state,
			game: {
				...state.game,
				world: {
					...state.game.world,
					openedCityIds: [...state.game.world.openedCityIds, 'campus-junction' as const]
				}
			}
		};
		expect(
			isScenarioCommandAllowed(scenario, opened, {
				kind: 'selectWorldCity',
				cityId: 'campus-junction'
			})
		).toEqual({ allowed: true });
	});

	it('enforces exact retail placement tuples in the active city', () => {
		const scenario = definition({ allowedCommands: ['openStore'] });

		expect(
			isScenarioCommandAllowed(scenario, run(), {
				kind: 'openStore',
				tileId: 'different-tile',
				archetypeId: 'convenience'
			})
		).toEqual({
			allowed: false,
			code: 'forbidden-content',
			path: 'command.openStore.tileId'
		});
	});

	it('enforces exact industrial placement tuples in the active industry city', () => {
		const scenario = definition({ allowedCommands: ['buildIndustrialBuilding'] });

		expect(
			isScenarioCommandAllowed(scenario, run(), {
				kind: 'buildIndustrialBuilding',
				tileId: 'different-tile',
				buildingTypeId: 'water-pump'
			})
		).toEqual({
			allowed: false,
			code: 'forbidden-content',
			path: 'command.buildIndustrialBuilding.tileId'
		});
	});

	it.each([
		{
			kind: 'financeRetailStore' as const,
			tileId: 'different-tile',
			archetypeId: 'convenience' as const,
			expectedCost: 12_000
		},
		{
			kind: 'financeIndustrialBuilding' as const,
			tileId: 'different-tile',
			buildingTypeId: 'water-pump' as const,
			expectedCost: 12_000
		}
	])('enforces exact content tuples for $kind', (command) => {
		const scenario = definition({ allowedCommands: [command.kind] });
		expect(isScenarioCommandAllowed(scenario, run(), command)).toMatchObject({
			allowed: false,
			code: 'forbidden-content'
		});
	});

	it('rejects malformed finance payloads before dispatch', () => {
		const scenario = definition({ allowedCommands: ['borrow', 'repayLoan'] });
		expect(
			isScenarioCommandAllowed(scenario, run(), {
				kind: 'borrow',
				amount: 100.5,
				termDays: 56
			} as ScenarioCommand)
		).toMatchObject({ allowed: false, code: 'forbidden-content' });
		expect(
			isScenarioCommandAllowed(scenario, run(), {
				kind: 'repayLoan',
				loanId: '',
				amount: 100
			} as ScenarioCommand)
		).toMatchObject({ allowed: false, code: 'invalid-command' });
	});

	it.each([null, 42, { id: 'loan-1' }] as const)(
		'rejects a non-string loan id as an invalid command: %j',
		(loanId) => {
			const scenario = definition({
				allowedCommands: ['repayLoan', 'payOffLoan', 'refinanceLoan']
			});
			for (const command of [
				{ kind: 'repayLoan', loanId, amount: 100 },
				{ kind: 'payOffLoan', loanId },
				{ kind: 'refinanceLoan', loanId, termDays: 56 }
			] as const) {
				expect(
					isScenarioCommandAllowed(scenario, run(), command as unknown as ScenarioCommand)
				).toMatchObject({ allowed: false, code: 'invalid-command' });
			}
		}
	);

	it.each(['upgradeRail', 'demolishRail'] as const)(
		'rejects %s when its explicit city is outside the content allowlist',
		(kind) => {
			const base = definition({ allowedCommands: [kind] });
			const scenario = {
				...base,
				content: { ...base.content, cityIds: ['harbor-city', 'industry-city'] as const }
			};

			expect(
				isScenarioCommandAllowed(scenario, run(), {
					kind,
					cityId: 'garden-borough',
					segmentId: 'segment-1'
				})
			).toEqual({
				allowed: false,
				code: 'forbidden-content',
				path: `command.${kind}.cityId`
			});
		}
	);
});

describe('scenario content capabilities', () => {
	const allowedQueries = [
		{ kind: 'city', cityId: 'harbor-city' },
		{ kind: 'archetype', archetypeId: 'convenience' },
		{ kind: 'product', categoryId: 'bottled-water' },
		{ kind: 'material', materialId: 'water' },
		{ kind: 'building', buildingTypeId: 'water-pump' },
		{
			kind: 'retail-placement',
			cityId: 'harbor-city',
			tileId: 'harbor-tile',
			archetypeId: 'convenience'
		},
		{
			kind: 'industrial-placement',
			cityId: 'industry-city',
			tileId: 'industry-tile',
			buildingTypeId: 'water-pump'
		}
	] as const satisfies readonly ScenarioContentQuery[];

	it.each(allowedQueries)('allows an exact $kind query', (query) => {
		expect(isScenarioContentAllowed(definition(), query)).toBe(true);
	});

	it('rejects values and placement tuples outside their individual allowlists', () => {
		const scenario = definition();

		expect(isScenarioContentAllowed(scenario, { kind: 'city', cityId: 'garden-borough' })).toBe(
			false
		);
		expect(isScenarioContentAllowed(scenario, { kind: 'archetype', archetypeId: 'grocery' })).toBe(
			true
		);
		expect(isScenarioContentAllowed(scenario, { kind: 'product', categoryId: 'not-allowed' })).toBe(
			false
		);
		expect(
			isScenarioContentAllowed(scenario, {
				kind: 'retail-placement',
				cityId: 'harbor-city',
				tileId: 'harbor-tile',
				archetypeId: 'grocery'
			})
		).toBe(false);
		expect(
			isScenarioContentAllowed(scenario, {
				kind: 'industrial-placement',
				cityId: 'industry-city',
				tileId: 'industry-tile',
				buildingTypeId: 'warehouse'
			})
		).toBe(false);
	});

	it('rejects openStore when the archetype is outside the content allowlist', () => {
		const scenario = definition({
			allowedCommands: ['openStore'],
			content: {
				...definition().content,
				archetypeIds: ['convenience']
			}
		});

		expect(
			isScenarioCommandAllowed(scenario, run(), {
				kind: 'openStore',
				tileId: 'harbor-tile',
				archetypeId: 'grocery'
			})
		).toEqual({
			allowed: false,
			code: 'forbidden-content',
			path: 'command.openStore.archetypeId'
		});
	});

	it('rejects buildIndustrialBuilding when the building type is outside the content allowlist', () => {
		const scenario = definition({
			allowedCommands: ['buildIndustrialBuilding'],
			content: {
				...definition().content,
				buildingTypeIds: ['water-pump']
			}
		});

		expect(
			isScenarioCommandAllowed(scenario, run(), {
				kind: 'buildIndustrialBuilding',
				tileId: 'industry-tile',
				buildingTypeId: 'water-bottler'
			})
		).toEqual({
			allowed: false,
			code: 'forbidden-content',
			path: 'command.buildIndustrialBuilding.buildingTypeId'
		});
	});
});
