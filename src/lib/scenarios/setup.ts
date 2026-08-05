import {
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity
} from '$lib/game/city';
import {
	DEFAULT_INDUSTRY_CITY_HEIGHT,
	DEFAULT_INDUSTRY_CITY_WIDTH,
	INDUSTRIAL_BUILDING_TYPES,
	generateIndustryCity
} from '$lib/game/industry';
import { buildIndustrialBuilding } from '$lib/game/industryPlacement';
import {
	compareWorldCityIds,
	getCityInventory,
	getCityInventoryStats,
	initializeCityInventory,
	initializeRetailSupplyAssignment
} from '$lib/game/cityInventory';
import { getStoreUpgradeCost } from '$lib/game/leveling';
import { createFoundingGameAtTile } from '$lib/game/placement';
import { railCellKey } from '$lib/game/rail';
import { isRailWaypointTarget } from '$lib/game/railPlacement';
import { normalizeSeed } from '$lib/game/rng';
import { getExpansionSetupCost, upgradeStore } from '$lib/game/state';
import { calculateStockHealth } from '$lib/game/stock';
import { replaceFoundingLoan } from '$lib/game/finance';
import type { City, GameState, IndustryCity, WorldCityId } from '$lib/game/types';
import { getWorldCityDefinition, refreshWorldProgress } from '$lib/game/world';
import { SaveDataError, validateCurrentGameState } from '$lib/persistence/saveCodec';
import type { ScenarioDefinition, ScenarioDiagnostic } from './types';
import {
	sortScenarioDiagnostics,
	validateScenarioDefinition,
	validateScenarioSetupReserve
} from './validation';

export type BuildScenarioGameResult =
	| { ok: true; game: GameState; refs: ScenarioSetupRefs }
	| { ok: false; diagnostics: ScenarioDiagnostic[] };

export interface ScenarioSetupRefs {
	storeIdsByRef: Readonly<Record<string, string>>;
	buildingIdsByRef: Readonly<Record<string, string>>;
}

interface IndexedRail {
	index: number;
	cell: ScenarioDefinition['start']['rails'][number];
}

function compareCodeUnits(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}

export function citySeed(cityId: WorldCityId, normalizedSeed: number): number | undefined {
	if (cityId === 'harbor-city') return normalizedSeed;
	if (cityId === 'industry-city') return normalizedSeed + 101;
	return getWorldCityDefinition(cityId)?.seed;
}

function createScenarioCity(
	cityId: WorldCityId,
	normalizedSeed: number
): City | IndustryCity | undefined {
	const definition = getWorldCityDefinition(cityId);
	const seed = citySeed(cityId, normalizedSeed);
	if (!definition || seed === undefined) return undefined;

	if (definition.kind === 'retail') {
		return generateCity({
			id: definition.id,
			name: definition.name,
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed
		});
	}

	return generateIndustryCity({
		id: definition.id,
		name: definition.name,
		width: DEFAULT_INDUSTRY_CITY_WIDTH,
		height: DEFAULT_INDUSTRY_CITY_HEIGHT,
		seed,
		resourceProfile: definition.industryResourceProfile
	});
}

function requiredStartingCityIds(definition: ScenarioDefinition, game: GameState): WorldCityId[] {
	const ids = new Set<WorldCityId>(game.world.openedCityIds);
	ids.add(definition.start.foundingStore.cityId);
	for (const building of definition.start.industrialBuildings) ids.add(building.cityId);
	for (const rail of definition.start.rails) ids.add(rail.cityId);
	for (const override of definition.start.overrides.cityInventoryMaterials ?? []) {
		ids.add(override.cityId);
	}
	for (const assignment of definition.start.overrides.retailSupplyAssignments ?? []) {
		ids.add(assignment.retailCityId);
		if (assignment.supplyCityId !== null) ids.add(assignment.supplyCityId);
	}
	for (const cityId of definition.start.overrides.world?.openedCityIds ?? []) ids.add(cityId);
	if (definition.start.overrides.world) {
		ids.add(definition.start.overrides.world.activeRetailCityId);
		ids.add(definition.start.overrides.world.activeIndustryCityId);
	}
	return [...ids].sort(compareWorldCityIds);
}

function materializeStartingCities(
	definition: ScenarioDefinition,
	game: GameState,
	normalizedSeed: number
): GameState {
	const worldOverride = definition.start.overrides.world;
	const world = worldOverride
		? {
				...game.world,
				revealedCityIds: [...worldOverride.revealedCityIds],
				openedCityIds: [...worldOverride.openedCityIds]
			}
		: game.world;
	let cities = [...game.cities];
	let industryCities = [...game.industryCities];

	for (const cityId of requiredStartingCityIds(definition, game)) {
		const worldCity = getWorldCityDefinition(cityId);
		if (!worldCity) continue;
		if (worldCity.kind === 'retail') {
			if (cities.some((city) => city.id === cityId)) continue;
			const city = createScenarioCity(cityId, normalizedSeed);
			if (city) cities = [...cities, city as City];
		} else {
			if (industryCities.some((city) => city.id === cityId)) continue;
			const city = createScenarioCity(cityId, normalizedSeed);
			if (city) industryCities = [...industryCities, city as IndustryCity];
		}
	}

	let next: GameState = {
		...game,
		cities,
		industryCities,
		world,
		activeCityId: worldOverride?.activeRetailCityId ?? game.activeCityId,
		activeIndustryCityId: worldOverride?.activeIndustryCityId ?? game.activeIndustryCityId,
		retailSupplyAssignments: []
	};
	const openedCityIds = [...new Set(next.world.openedCityIds)].sort(compareWorldCityIds);
	for (const cityId of openedCityIds) {
		const city = getWorldCityDefinition(cityId);
		if (city?.kind === 'industry') next = initializeCityInventory(next, city.id);
	}
	next = {
		...next,
		cityInventories: next.cityInventories.filter((inventory) => {
			const city = getWorldCityDefinition(inventory.cityId);
			return (
				city?.kind === 'industry' &&
				next.world.openedCityIds.includes(city.id) &&
				next.industryCities.some((industryCity) => industryCity.id === city.id)
			);
		})
	};

	return next;
}

function calculateTransientSetupReserve(definition: ScenarioDefinition, game: GameState): number {
	const founding = definition.start.foundingStore;
	const city = game.cities.find((candidate) => candidate.id === founding.cityId);
	const tile = city?.tiles.find((candidate) => candidate.id === founding.tileId);
	let reserve = tile ? getExpansionSetupCost(tile, founding.archetypeId) : Number.NaN;

	for (const building of definition.start.industrialBuildings) {
		reserve += INDUSTRIAL_BUILDING_TYPES[building.typeId]?.buildCost ?? Number.NaN;
	}
	for (const override of definition.start.overrides.stores ?? []) {
		for (let level = 1; level < (override.targetLevel ?? 1); level += 1) {
			reserve += getStoreUpgradeCost(level);
		}
	}

	return reserve;
}

function transitionFailure(path: string, value: unknown, detail: string): BuildScenarioGameResult {
	return {
		ok: false,
		diagnostics: [{ path, code: 'setup-transition-failed', value, detail }]
	};
}

function installAuthoredRails(
	definition: ScenarioDefinition,
	game: GameState
): { game?: GameState; diagnostics: ScenarioDiagnostic[] } {
	const rails: IndexedRail[] = definition.start.rails
		.map((cell, index) => ({ cell, index }))
		.sort(
			(first, second) =>
				compareCodeUnits(first.cell.cityId, second.cell.cityId) ||
				first.cell.y - second.cell.y ||
				first.cell.x - second.cell.x
		);
	const seen = new Set<string>();
	const diagnostics: ScenarioDiagnostic[] = [];

	for (const { cell, index } of rails) {
		const key = `${cell.cityId}:${railCellKey(cell.x, cell.y)}`;
		if (seen.has(key)) {
			diagnostics.push({
				path: `start.rails[${index}]`,
				code: 'duplicate-rail-cell',
				value: cell,
				detail: `Duplicate authored rail cell ${key}.`
			});
			continue;
		}
		seen.add(key);
		if (!isRailWaypointTarget(game, cell.cityId, cell.x, cell.y)) {
			diagnostics.push({
				path: `start.rails[${index}]`,
				code: 'invalid-rail-coordinate',
				value: cell,
				detail: 'Rail cells must be on unlocked, unoccupied industry tiles.'
			});
		}
	}
	if (diagnostics.length > 0) return { diagnostics: sortScenarioDiagnostics(diagnostics) };

	let industryCities = game.industryCities;
	for (const { cell } of rails) {
		industryCities = industryCities.map((city) =>
			city.id === cell.cityId
				? { ...city, rails: [...city.rails, { x: cell.x, y: cell.y, level: cell.level }] }
				: city
		);
	}
	return { game: { ...game, industryCities }, diagnostics: [] };
}

function applyAuthoredOverrides(
	definition: ScenarioDefinition,
	game: GameState,
	refs: ScenarioSetupRefs,
	baseFinances: Pick<GameState, 'cash' | 'finance'>
): { game?: GameState; diagnostics: ScenarioDiagnostic[] } {
	const diagnostics: ScenarioDiagnostic[] = [];
	const overrides = definition.start.overrides;
	let upgradedGame = game;

	for (const [overrideIndex, override] of (overrides.stores ?? []).entries()) {
		const storeId = refs.storeIdsByRef[override.storeRef];
		if (!storeId) {
			return {
				diagnostics: [
					{
						path: `start.overrides.stores[${overrideIndex}].storeRef`,
						code: 'setup-transition-failed',
						value: override.storeRef,
						detail: 'The store upgrade ref did not resolve to a materialized store.'
					}
				]
			};
		}
		const targetLevel = override.targetLevel ?? 1;
		while ((upgradedGame.stores.find((store) => store.id === storeId)?.level ?? 0) < targetLevel) {
			const before = upgradedGame.stores.find((store) => store.id === storeId);
			const next = upgradeStore(upgradedGame, storeId);
			const after = next.stores.find((store) => store.id === storeId);
			if (!before || !after || after.level !== before.level + 1) {
				return {
					diagnostics: [
						{
							path: `start.overrides.stores[${overrideIndex}].targetLevel`,
							code: 'setup-transition-failed',
							value: targetLevel,
							detail: 'The normal store-upgrade transition did not reach the authored target level.'
						}
					]
				};
			}
			upgradedGame = next;
		}
	}

	let stores = upgradedGame.stores;
	let industrialBuildings = upgradedGame.industrialBuildings;

	for (const [overrideIndex, override] of (overrides.stores ?? []).entries()) {
		const storeId = refs.storeIdsByRef[override.storeRef];
		const storeIndex = stores.findIndex((store) => store.id === storeId);
		if (!storeId || storeIndex < 0) {
			diagnostics.push({
				path: `start.overrides.stores[${overrideIndex}].storeRef`,
				code: 'invalid-reference',
				value: override.storeRef,
				detail: 'Store override ref did not resolve to a materialized store.'
			});
			continue;
		}
		const store = stores[storeIndex]!;
		const productPatches = new Map(
			(override.products ?? []).map((product) => [product.categoryId, product])
		);
		for (const [productIndex, product] of (override.products ?? []).entries()) {
			if (!store.products.some((candidate) => candidate.categoryId === product.categoryId)) {
				diagnostics.push({
					path: `start.overrides.stores[${overrideIndex}].products[${productIndex}].categoryId`,
					code: 'invalid-reference',
					value: product.categoryId,
					detail: 'Product override did not resolve to a materialized store product.'
				});
			}
		}
		const products = store.products.map((product) => {
			const patch = productPatches.get(product.categoryId);
			return patch ? { ...patch } : product;
		});
		stores = stores.map((candidate, index) =>
			index === storeIndex
				? { ...store, products, stockHealth: calculateStockHealth(products) }
				: candidate
		);
	}

	for (const [overrideIndex, override] of (overrides.buildingInventories ?? []).entries()) {
		const buildingId = refs.buildingIdsByRef[override.buildingRef];
		const buildingIndex = industrialBuildings.findIndex((building) => building.id === buildingId);
		if (!buildingId || buildingIndex < 0) {
			diagnostics.push({
				path: `start.overrides.buildingInventories[${overrideIndex}].buildingRef`,
				code: 'invalid-reference',
				value: override.buildingRef,
				detail: 'Building inventory ref did not resolve to a materialized building.'
			});
			continue;
		}
		industrialBuildings = industrialBuildings.map((building, index) =>
			index === buildingIndex ? { ...building, inventory: { ...override.materials } } : building
		);
	}

	if (diagnostics.length > 0) return { diagnostics: sortScenarioDiagnostics(diagnostics) };

	const overriddenGame: GameState = {
		...upgradedGame,
		stores,
		industrialBuildings,
		policy: overrides.policy ? { ...overrides.policy } : upgradedGame.policy,
		storeCap: overrides.storeCap ?? upgradedGame.storeCap
	};

	return {
		game: {
			...overriddenGame,
			cash: overrides.cash ?? baseFinances.cash,
			finance:
				overrides.debt === undefined
					? baseFinances.finance
					: replaceFoundingLoan(baseFinances.finance, upgradedGame.day, overrides.debt)
		},
		diagnostics: []
	};
}

function applyCityInventoryMaterials(
	definition: ScenarioDefinition,
	game: GameState
): { game?: GameState; diagnostics: ScenarioDiagnostic[] } {
	const overrides = definition.start.overrides.cityInventoryMaterials;
	if (!overrides || overrides.length === 0) return { game, diagnostics: [] };
	const materialsByCityId = new Map(
		overrides.map((override) => [override.cityId, { ...override.materials }])
	);
	const cityInventories = game.cityInventories.map((inventory) => {
		const materials = materialsByCityId.get(inventory.cityId);
		return materials ? { ...inventory, materials } : inventory;
	});
	const next = { ...game, cityInventories };
	const diagnostics: ScenarioDiagnostic[] = [];

	for (const [index, override] of overrides.entries()) {
		const cityPath = `start.overrides.cityInventoryMaterials[${index}].cityId`;
		const materialsPath = `start.overrides.cityInventoryMaterials[${index}].materials`;
		const access = getCityInventory(next, override.cityId);
		if (!access.ok) {
			diagnostics.push({
				path: cityPath,
				code:
					access.reason === 'city-closed'
						? 'city-inventory-city-closed'
						: access.reason === 'inventory-missing'
							? 'city-inventory-unavailable'
							: 'city-inventory-city-unavailable',
				value: override.cityId,
				detail: 'City inventory overrides require an opened, materialized industry inventory.'
			});
			continue;
		}

		const { capacity, used } = getCityInventoryStats(next, access.inventory.cityId);
		if (used > capacity) {
			diagnostics.push({
				path: materialsPath,
				code: 'city-inventory-capacity-exceeded',
				value: override.materials,
				detail: `Starting city inventory uses ${used} units but ${access.inventory.cityId} has capacity ${capacity}.`
			});
		}
	}

	if (diagnostics.length > 0) return { diagnostics: sortScenarioDiagnostics(diagnostics) };

	return { game: next, diagnostics: [] };
}

function applyRetailSupplyAssignments(
	definition: ScenarioDefinition,
	game: GameState
): { game?: GameState; diagnostics: ScenarioDiagnostic[] } {
	const overrides = definition.start.overrides.retailSupplyAssignments;
	if (!overrides) return { game, diagnostics: [] };
	const diagnostics: ScenarioDiagnostic[] = [];

	for (const [index, assignment] of overrides.entries()) {
		if (assignment.supplyCityId === null) continue;
		const access = getCityInventory(game, assignment.supplyCityId);
		if (access.ok) continue;
		diagnostics.push({
			path: `start.overrides.retailSupplyAssignments[${index}].supplyCityId`,
			code:
				access.reason === 'city-closed'
					? 'supply-city-closed'
					: access.reason === 'inventory-missing'
						? 'supply-city-unavailable'
						: access.reason === 'unsupported-city'
							? 'supply-city-unmaterialized'
							: 'supply-city-unavailable',
			value: assignment.supplyCityId,
			detail: 'Retail supply sources must resolve to an opened, materialized city inventory.'
		});
	}

	if (diagnostics.length > 0) return { diagnostics: sortScenarioDiagnostics(diagnostics) };

	return {
		game: {
			...game,
			retailSupplyAssignments: [...overrides]
				.map((assignment) => ({
					retailCityId: assignment.retailCityId,
					supplyCityId: assignment.supplyCityId
				}))
				.sort((left, right) => compareWorldCityIds(left.retailCityId, right.retailCityId))
		},
		diagnostics: []
	};
}

function initializeDefaultRetailSupplyAssignments(game: GameState): GameState {
	let next = game;
	const openedRetailCityIds = [...new Set(next.world.openedCityIds)]
		.filter((cityId) => {
			const city = getWorldCityDefinition(cityId);
			return city?.kind === 'retail' && next.cities.some((candidate) => candidate.id === city.id);
		})
		.sort(compareWorldCityIds);
	for (const cityId of openedRetailCityIds) {
		next = initializeRetailSupplyAssignment(next, cityId);
	}
	return next;
}

function validateStartingContentCitiesAreOpened(
	definition: ScenarioDefinition,
	game: GameState
): ScenarioDiagnostic | undefined {
	const opened = new Set<string>(game.world.openedCityIds);
	const everyStartingContentCityIsOpened =
		game.stores.every((store) => opened.has(store.cityId)) &&
		game.industrialBuildings.every((building) => opened.has(building.cityId)) &&
		definition.start.rails.every((rail) => opened.has(rail.cityId));
	if (everyStartingContentCityIsOpened) return undefined;

	return {
		path: 'start.overrides.world',
		code: 'setup-invariant-failed',
		value: {
			activeRetailCityId: game.activeCityId,
			activeIndustryCityId: game.activeIndustryCityId
		},
		detail: 'The built game starting-content cities must be opened.'
	};
}

function strictSetupFailure(error: SaveDataError, game: GameState): ScenarioDiagnostic {
	// Map structured SaveDataError invariant codes to scenario setup diagnostics.
	// The codes are set at the throw sites in saveCodec.ts validateCurrentGameState
	// path; the default branch covers any untagged validation failure.
	switch (error.code) {
		case 'invariant-store-cap':
			return {
				path: 'start.overrides.storeCap',
				code: 'setup-invariant-failed',
				value: game.storeCap,
				detail: 'The built game store cap must be an integer and at least its starting store count.'
			};
		case 'invariant-products':
			return {
				path: 'start.overrides.stores',
				code: 'setup-invariant-failed',
				value: game.stores.flatMap((store) => store.products.map((product) => product.categoryId)),
				detail:
					'The built game product categories must exactly match the categories unlocked at its store level.'
			};
		case 'invariant-stock-health':
			return {
				path: 'start.overrides.stores',
				code: 'setup-invariant-failed',
				value: game.stores.map((store) => store.stockHealth),
				detail: 'The built game store stock health does not match its products.'
			};
		case 'invariant-city-inventory':
			return {
				path: 'start.overrides.cityInventoryMaterials',
				code: 'setup-invariant-failed',
				value: game.cityInventories,
				detail: 'The built game city inventory contents or pressure exceed same-city capacity.'
			};
		case 'invariant-retail-supply':
			return {
				path: 'start.overrides.retailSupplyAssignments',
				code: 'setup-invariant-failed',
				value: game.retailSupplyAssignments,
				detail: 'The built game retail supply assignments must resolve every opened retail city.'
			};
		case 'invariant-inventory':
			return {
				path: 'start.overrides.buildingInventories',
				code: 'setup-invariant-failed',
				value: game.industrialBuildings.map((building) => building.inventory),
				detail: 'A built game industrial inventory exceeds its derived buffer capacity.'
			};
		default:
			return {
				path: 'start',
				code: 'setup-invariant-failed',
				value: error.message,
				detail: 'The built game failed strict current-state validation.'
			};
	}
}

export function buildScenarioGame(
	definition: ScenarioDefinition,
	seed: number
): BuildScenarioGameResult {
	const definitionDiagnostics = validateScenarioDefinition(definition);
	if (definitionDiagnostics.length > 0) {
		return { ok: false, diagnostics: definitionDiagnostics };
	}

	const normalizedSeed = normalizeSeed(seed);
	const founding = definition.start.foundingStore;
	const foundingCity = createScenarioCity(founding.cityId, normalizedSeed);
	if (!foundingCity || getWorldCityDefinition(founding.cityId)?.kind !== 'retail') {
		return transitionFailure(
			'start.foundingStore.cityId',
			founding.cityId,
			'The founding retail city could not be materialized.'
		);
	}

	let game: GameState;
	try {
		game = createFoundingGameAtTile({
			archetypeId: founding.archetypeId,
			city: foundingCity as City,
			tileId: founding.tileId,
			seed: normalizedSeed
		});
	} catch {
		return transitionFailure(
			'start.foundingStore.tileId',
			founding.tileId,
			'The normal founding-store transition rejected the authored placement.'
		);
	}

	const foundingStore = game.stores.at(-1);
	if (!foundingStore) {
		return transitionFailure(
			'start.foundingStore',
			founding,
			'The normal founding-store transition did not create a store.'
		);
	}
	const storeIdsByRef = new Map<string, string>([[founding.ref, foundingStore.id]]);
	const buildingIdsByRef = new Map<string, string>();
	const baseFinances = { cash: game.cash, finance: game.finance };

	game = materializeStartingCities(definition, game, normalizedSeed);
	const reserve = calculateTransientSetupReserve(definition, game);
	const reserveDiagnostics = validateScenarioSetupReserve(reserve);
	if (reserveDiagnostics.length > 0) return { ok: false, diagnostics: reserveDiagnostics };
	game = { ...game, cash: game.cash + reserve };

	for (const [index, authored] of definition.start.industrialBuildings.entries()) {
		const beforeIds = new Set(game.industrialBuildings.map((building) => building.id));
		const beforeLength = game.industrialBuildings.length;
		const next = buildIndustrialBuilding(
			{ ...game, activeIndustryCityId: authored.cityId },
			{ tileId: authored.tileId, buildingTypeId: authored.typeId }
		);
		const appended = next.industrialBuildings.at(-1);
		if (
			next.industrialBuildings.length !== beforeLength + 1 ||
			!appended ||
			beforeIds.has(appended.id) ||
			appended.cityId !== authored.cityId ||
			appended.tileId !== authored.tileId ||
			appended.typeId !== authored.typeId
		) {
			return transitionFailure(
				`start.industrialBuildings[${index}]`,
				authored,
				'The normal industrial-building transition did not append the authored building.'
			);
		}
		game = next;
		buildingIdsByRef.set(authored.ref, appended.id);
	}

	const refs: ScenarioSetupRefs = {
		storeIdsByRef: Object.fromEntries(storeIdsByRef),
		buildingIdsByRef: Object.fromEntries(buildingIdsByRef)
	};

	const installedRails = installAuthoredRails(definition, game);
	if (!installedRails.game) return { ok: false, diagnostics: installedRails.diagnostics };
	game = installedRails.game;

	const overridden = applyAuthoredOverrides(definition, game, refs, baseFinances);
	if (!overridden.game) return { ok: false, diagnostics: overridden.diagnostics };
	game = overridden.game;
	const cityInventory = applyCityInventoryMaterials(definition, game);
	if (!cityInventory.game) return { ok: false, diagnostics: cityInventory.diagnostics };
	game = cityInventory.game;
	if (!definition.start.overrides.retailSupplyAssignments) {
		game = initializeDefaultRetailSupplyAssignments(game);
	}
	const retailSupply = applyRetailSupplyAssignments(definition, game);
	if (!retailSupply.game) return { ok: false, diagnostics: retailSupply.diagnostics };
	game = retailSupply.game;
	game = refreshWorldProgress(game);
	const startingContentDiagnostic = validateStartingContentCitiesAreOpened(definition, game);
	if (startingContentDiagnostic) return { ok: false, diagnostics: [startingContentDiagnostic] };

	try {
		game = validateCurrentGameState(game);
	} catch (error) {
		if (error instanceof SaveDataError) {
			return { ok: false, diagnostics: [strictSetupFailure(error, game)] };
		}
		throw error;
	}

	return { ok: true, game, refs };
}
