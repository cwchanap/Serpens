import { describe, expect, it } from 'vitest';
import type { GameState, WorldCityId } from '$lib/game/types';
import { buildScenarioGame } from '../setup';
import type { ScenarioDefinition, ScenarioStartBlueprint } from '../types';
import { validateCityInventoryCapacities, validateRetailSupplyAssignments } from './cityInventory';

function cityInventoryDefinition(): ScenarioDefinition {
	return {
		id: 'first-profit',
		version: 1,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed: 280,
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
					ref: 'warehouse',
					typeId: 'warehouse',
					cityId: 'industry-city',
					tileId: 'industry-city-26-6'
				}
			],
			rails: [],
			overrides: {
				storeCap: 1,
				stores: [
					{
						storeRef: 'founder',
						targetLevel: 1,
						products: [
							{
								categoryId: 'bottled-water',
								stock: 10,
								reorderThreshold: 2,
								targetStock: 12,
								sellingPrice: 3
							}
						]
					}
				],
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: 1 } }],
				retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }]
			}
		},
		content: {
			cityIds: ['harbor-city', 'industry-city'],
			archetypeIds: ['convenience'],
			productCategoryIds: ['bottled-water'],
			materialIds: ['water'],
			buildingTypeIds: ['warehouse'],
			retailPlacements: [
				{
					cityId: 'harbor-city',
					tileId: 'harbor-city-1-1',
					archetypeId: 'convenience'
				}
			],
			industrialPlacements: []
		},
		allowedCommands: ['advanceDay'],
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

interface BaseFixture {
	game: GameState;
	blueprint: ScenarioStartBlueprint;
}

function buildBaseFixture(): BaseFixture {
	const definition = cityInventoryDefinition();
	const result = buildScenarioGame(definition, definition.officialSeed);
	if (!result.ok) {
		throw new Error(`Base fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
	}
	return { game: result.game, blueprint: definition.start };
}

function codesFrom(
	diagnostics: ReturnType<typeof validateCityInventoryCapacities>
): Array<{ path: string; code: string }> {
	return diagnostics.map(({ path, code }) => ({ path, code }));
}

function diagnostics(
	game: GameState,
	blueprint: ScenarioStartBlueprint
): Array<{ path: string; code: string }> {
	const combined = [
		...validateCityInventoryCapacities(game, blueprint),
		...validateRetailSupplyAssignments(game, blueprint)
	];
	return codesFrom(combined);
}

describe('validateCityInventoryCapacities', () => {
	it('returns no diagnostics when overrides are absent', () => {
		const { game, blueprint } = buildBaseFixture();
		const noOverrides: ScenarioStartBlueprint = {
			...blueprint,
			overrides: { ...blueprint.overrides }
		};
		delete (noOverrides.overrides as Partial<ScenarioStartBlueprint['overrides']>)
			.cityInventoryMaterials;
		expect(validateCityInventoryCapacities(game, noOverrides)).toEqual([]);
	});

	it('flags a non-string city inventory cityId', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 123, materials: { water: 1 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].cityId',
			code: 'invalid-string'
		});
	});

	it('flags an empty-string city inventory cityId', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: '', materials: { water: 1 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].cityId',
			code: 'invalid-string'
		});
	});

	it('flags an unknown city inventory city reference', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'missing-city', materials: { water: 1 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].cityId',
			code: 'invalid-reference'
		});
	});

	it('flags a retail city used as a city inventory endpoint', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'harbor-city', materials: { water: 1 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].cityId',
			code: 'invalid-city-inventory-city'
		});
	});

	it('flags a closed industry city inventory endpoint', () => {
		const { game, blueprint } = buildBaseFixture();
		const closedGame = {
			...game,
			world: {
				...game.world,
				openedCityIds: game.world.openedCityIds.filter((id) => id !== 'industry-city')
			}
		};
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: 1 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(closedGame, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].cityId',
			code: 'city-inventory-city-closed'
		});
	});

	it('flags an industry city with a missing materialized inventory', () => {
		const { game, blueprint } = buildBaseFixture();
		const missingInventoryGame = {
			...game,
			cityInventories: []
		};
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: 1 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(missingInventoryGame, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].cityId',
			code: 'city-inventory-unavailable'
		});
	});

	it('flags an industry city that is opened but not materialized as unsupported', () => {
		const { game, blueprint } = buildBaseFixture();
		const ungeneratedGame = {
			...game,
			industryCities: game.industryCities.filter((city) => city.id !== 'industry-city')
		};
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: 1 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(ungeneratedGame, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].cityId',
			code: 'city-inventory-city-unavailable'
		});
	});

	it('flags a non-object materials map', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: 'not-an-object' }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials',
			code: 'invalid-object'
		});
	});

	it('flags a null materials map', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: null }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials',
			code: 'invalid-object'
		});
	});

	it('flags an array materials map', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: [] }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials',
			code: 'invalid-object'
		});
	});

	it('flags an unknown material reference inside materials', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { 'missing-material': 1 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials.missing-material',
			code: 'invalid-reference'
		});
	});

	it('flags a non-number material quantity', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: 'lots' } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials.water',
			code: 'invalid-non-negative-number'
		});
	});

	it('flags a negative material quantity', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: -1 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials.water',
			code: 'invalid-non-negative-number'
		});
	});

	it('flags a non-integer material quantity', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: 1.5 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials.water',
			code: 'invalid-city-inventory-quantity'
		});
	});

	it('flags a non-finite material quantity', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: Infinity } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials.water',
			code: 'invalid-non-negative-number'
		});
	});

	it('flags an unsafe aggregate material total', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [
					{
						cityId: 'industry-city',
						materials: { water: Number.MAX_SAFE_INTEGER - 1, produce: 5 }
					}
				]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials',
			code: 'unsafe-city-inventory-total'
		});
	});

	it('flags an over-capacity city inventory total', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: 1_000_000 } }]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials',
			code: 'city-inventory-capacity-exceeded'
		});
	});

	it('flags a duplicate city inventory override', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutated = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				cityInventoryMaterials: [
					{ cityId: 'industry-city', materials: { water: 1 } },
					{ cityId: 'industry-city', materials: { water: 2 } }
				]
			}
		} as unknown as ScenarioStartBlueprint;
		expect(diagnostics(game, mutated)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[1].cityId',
			code: 'duplicate-reference'
		});
	});

	it('accepts a valid city inventory override within capacity', () => {
		const { game, blueprint } = buildBaseFixture();
		expect(validateCityInventoryCapacities(game, blueprint)).toEqual([]);
	});
});

describe('validateRetailSupplyAssignments', () => {
	it('accepts a valid canonical assignment collection', () => {
		const { game, blueprint } = buildBaseFixture();
		expect(codesFrom(validateRetailSupplyAssignments(game, blueprint))).toEqual([]);
	});

	it('flags a non-string retail owner cityId', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutatedGame: GameState = {
			...game,
			retailSupplyAssignments: [
				{ retailCityId: 42 as unknown as WorldCityId, supplyCityId: 'industry-city' }
			]
		};
		expect(codesFrom(validateRetailSupplyAssignments(mutatedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].retailCityId',
			code: 'invalid-string'
		});
	});

	it('flags an empty-string retail owner cityId', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutatedGame: GameState = {
			...game,
			retailSupplyAssignments: [
				{ retailCityId: '' as unknown as WorldCityId, supplyCityId: 'industry-city' }
			]
		};
		expect(codesFrom(validateRetailSupplyAssignments(mutatedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].retailCityId',
			code: 'invalid-string'
		});
	});

	it('flags an unknown retail owner city reference', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutatedGame: GameState = {
			...game,
			retailSupplyAssignments: [
				{ retailCityId: 'missing-city' as unknown as WorldCityId, supplyCityId: 'industry-city' }
			]
		};
		expect(codesFrom(validateRetailSupplyAssignments(mutatedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].retailCityId',
			code: 'invalid-reference'
		});
	});

	it('flags an industry city used as a retail owner', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutatedGame: GameState = {
			...game,
			retailSupplyAssignments: [
				{ retailCityId: 'industry-city' as unknown as WorldCityId, supplyCityId: 'industry-city' }
			]
		};
		expect(codesFrom(validateRetailSupplyAssignments(mutatedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].retailCityId',
			code: 'invalid-retail-supply-city'
		});
	});

	it('flags a closed retail owner city', () => {
		const { game, blueprint } = buildBaseFixture();
		const closedGame: GameState = {
			...game,
			world: {
				...game.world,
				openedCityIds: game.world.openedCityIds.filter((id) => id !== 'harbor-city')
			}
		};
		expect(codesFrom(validateRetailSupplyAssignments(closedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].retailCityId',
			code: 'retail-supply-city-closed'
		});
	});

	it('flags an ungenerated retail owner city', () => {
		const { game, blueprint } = buildBaseFixture();
		const ungeneratedGame: GameState = {
			...game,
			cities: game.cities.filter((city) => city.id !== 'harbor-city')
		};
		expect(codesFrom(validateRetailSupplyAssignments(ungeneratedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].retailCityId',
			code: 'retail-supply-city-unavailable'
		});
	});

	it('flags a non-string supply cityId', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutatedGame: GameState = {
			...game,
			retailSupplyAssignments: [
				{ retailCityId: 'harbor-city', supplyCityId: 99 as unknown as WorldCityId }
			]
		};
		expect(codesFrom(validateRetailSupplyAssignments(mutatedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].supplyCityId',
			code: 'invalid-string'
		});
	});

	it('flags an unknown supply city reference', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutatedGame: GameState = {
			...game,
			retailSupplyAssignments: [
				{ retailCityId: 'harbor-city', supplyCityId: 'missing-city' as unknown as WorldCityId }
			]
		};
		expect(codesFrom(validateRetailSupplyAssignments(mutatedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].supplyCityId',
			code: 'invalid-reference'
		});
	});

	it('flags a retail city used as a supply source', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutatedGame: GameState = {
			...game,
			retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'harbor-city' }]
		};
		expect(codesFrom(validateRetailSupplyAssignments(mutatedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].supplyCityId',
			code: 'invalid-supply-city'
		});
	});

	it('flags a closed supply city', () => {
		const { game, blueprint } = buildBaseFixture();
		const closedGame: GameState = {
			...game,
			world: {
				...game.world,
				openedCityIds: game.world.openedCityIds.filter((id) => id !== 'industry-city')
			}
		};
		expect(codesFrom(validateRetailSupplyAssignments(closedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].supplyCityId',
			code: 'supply-city-closed'
		});
	});

	it('flags a supply city with a missing materialized inventory', () => {
		const { game, blueprint } = buildBaseFixture();
		const missingInventoryGame: GameState = {
			...game,
			cityInventories: []
		};
		expect(
			codesFrom(validateRetailSupplyAssignments(missingInventoryGame, blueprint))
		).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].supplyCityId',
			code: 'supply-city-unavailable'
		});
	});

	it('flags a supply city that is opened but not materialized as unsupported', () => {
		const { game, blueprint } = buildBaseFixture();
		const ungeneratedGame: GameState = {
			...game,
			industryCities: game.industryCities.filter((city) => city.id !== 'industry-city')
		};
		expect(codesFrom(validateRetailSupplyAssignments(ungeneratedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].supplyCityId',
			code: 'supply-city-unavailable'
		});
	});

	it('accepts a null supply cityId as imports-only', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutatedGame: GameState = {
			...game,
			retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: null }]
		};
		expect(codesFrom(validateRetailSupplyAssignments(mutatedGame, blueprint))).toEqual([]);
	});

	it('flags a duplicate retail owner assignment', () => {
		const { game, blueprint } = buildBaseFixture();
		const mutatedGame: GameState = {
			...game,
			retailSupplyAssignments: [
				{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
				{ retailCityId: 'harbor-city', supplyCityId: null }
			]
		};
		expect(codesFrom(validateRetailSupplyAssignments(mutatedGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[1].retailCityId',
			code: 'duplicate-reference'
		});
	});

	it('flags a noncanonical game-state assignment order', () => {
		const { game, blueprint } = buildBaseFixture();
		// harbor-city is the only retail city, so construct a second opened
		// retail city to produce an out-of-order pair.
		const campusGame: GameState = {
			...game,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction'],
				openedCityIds: [...game.world.openedCityIds, 'campus-junction']
			},
			cities: [
				...game.cities,
				// Reuse an existing retail city shape; only the id matters for ordering.
				{ ...game.cities.find((city) => city.id === 'harbor-city')!, id: 'campus-junction' }
			],
			retailSupplyAssignments: [
				{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' },
				{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
			]
		};
		expect(codesFrom(validateRetailSupplyAssignments(campusGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments',
			code: 'noncanonical-retail-supply-assignment'
		});
	});

	it('flags a missing retail supply assignment for an opened retail city', () => {
		const { game, blueprint } = buildBaseFixture();
		const campusGame: GameState = {
			...game,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction'],
				openedCityIds: [...game.world.openedCityIds, 'campus-junction']
			},
			cities: [
				...game.cities,
				{ ...game.cities.find((city) => city.id === 'harbor-city')!, id: 'campus-junction' }
			],
			retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }]
		};
		expect(codesFrom(validateRetailSupplyAssignments(campusGame, blueprint))).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments',
			code: 'missing-retail-supply-assignment'
		});
	});

	it('flags a noncanonical authored override order while the game state is canonical', () => {
		const { game, blueprint } = buildBaseFixture();
		// Add a second opened retail city so two assignments exist. harbor-city
		// sorts before campus-junction, so the canonical order is
		// [harbor-city, campus-junction].
		const canonicalGame: GameState = {
			...game,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction'],
				openedCityIds: [...game.world.openedCityIds, 'campus-junction']
			},
			cities: [
				...game.cities,
				{ ...game.cities.find((city) => city.id === 'harbor-city')!, id: 'campus-junction' }
			],
			retailSupplyAssignments: [
				{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
				{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
			]
		};
		// Authored overrides are reversed relative to canonical order, which the
		// authored-order check flags independently of the canonical game state.
		const reversedAuthored: ScenarioStartBlueprint = {
			...blueprint,
			overrides: {
				...blueprint.overrides,
				retailSupplyAssignments: [
					{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' },
					{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
				]
			}
		};
		expect(
			codesFrom(validateRetailSupplyAssignments(canonicalGame, reversedAuthored))
		).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments',
			code: 'noncanonical-retail-supply-assignment'
		});
	});

	it('does not check authored order when no authored overrides are present', () => {
		const { game, blueprint } = buildBaseFixture();
		const noAuthored: ScenarioStartBlueprint = {
			...blueprint,
			overrides: { ...blueprint.overrides }
		};
		delete (noAuthored.overrides as Partial<ScenarioStartBlueprint['overrides']>)
			.retailSupplyAssignments;
		expect(codesFrom(validateRetailSupplyAssignments(game, noAuthored))).toEqual([]);
	});
});
