import { getArchetype } from '$lib/game/archetypes';
import type { DecisionContext } from '$lib/game/decisionContext';
import {
	computeStoreLocalDemand,
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity,
	getTileById,
	isTileBuildable
} from '$lib/game/city';
import { getRecipeMaterialIds, inventoryUsed } from '$lib/game/buildingInventory';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS } from '$lib/game/industry';
import {
	createIndustryTileLookup,
	getIndustryBuildingFootprint
} from '$lib/game/industryFootprint';
import { getUnlockedCategoryCount, MAX_STORE_LEVEL, MAX_BUILDING_LEVEL } from '$lib/game/leveling';
import { formatLocation } from '$lib/game/placement';
import { RAIL_MAX_LEVEL } from '$lib/game/rail';
import {
	createCityTileLookup,
	getRetailStoreFootprint,
	type CityTileLookup
} from '$lib/game/storeFootprint';
import {
	compareWorldCityIds,
	findEntityCityOwnershipIssues,
	getCityInventory
} from '$lib/game/cityInventory';
import { MAX_STAFF_LEVEL } from '$lib/game/staffLeveling';
import { FINANCE_TRANSACTION_LIMIT, getInstallmentCount } from '$lib/game/finance';
import { EVENT_SELECTION_SCHEMA_VERSION } from '$lib/game/eventSelection';
import { EVENT_HISTORY_LIMIT } from '$lib/game/eventHistory';
import { calculateStockHealth } from '$lib/game/stock';
import type {
	City,
	CityTile,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	IndustryCity,
	StoreProduct,
	WorldCityId
} from '$lib/game/types';
import { getWorldCityDefinition, isWorldCityId, refreshWorldProgress } from '$lib/game/world';
import {
	AUTO_SAVE_SLOT_ID,
	SAVE_SCHEMA_VERSION,
	type SaveRecord,
	type SaveSlotKind,
	type SaveStoreSnapshot,
	type SaveSummary
} from './saveTypes';

export type SaveDataErrorCode =
	| 'corrupt'
	| 'storage-unavailable'
	| 'slot-not-found'
	| 'invariant-store-cap'
	| 'invariant-products'
	| 'invariant-stock-health'
	| 'invariant-inventory'
	| 'invariant-entity-city-opened'
	| 'invariant-entity-city-ownership'
	| 'invariant-city-inventory'
	| 'invariant-retail-supply'
	| 'invariant-logistics'
	| 'invariant-report-attribution'
	| 'invariant-event-runtime';

export class SaveDataError extends Error {
	readonly code: SaveDataErrorCode;
	readonly cause?: unknown;

	constructor(message: string, code: SaveDataErrorCode = 'corrupt', cause?: unknown) {
		super(message);
		this.name = 'SaveDataError';
		this.code = code;
		this.cause = cause;
	}
}

function withSaveDataBoundary<T>(context: string, operation: () => T): T {
	try {
		return operation();
	} catch (error) {
		if (error instanceof SaveDataError) throw error;
		throw new SaveDataError(`${context} rejected malformed save data`, 'corrupt', error);
	}
}

const PRICING_POSTURES = ['discount', 'competitive', 'standard', 'premium'] as const;
const INVENTORY_BUFFERS = ['lean', 'balanced', 'generous'] as const;
const STAFFING_POSTURES = ['minimal', 'efficient', 'service'] as const;
const STAFF_ROLES = ['manager', 'general'] as const;
const MARKETING_FOCUSES = ['none', 'awareness', 'promotions', 'loyalty'] as const;
const SERVICE_PRIORITIES = ['speed', 'balanced', 'highTouch'] as const;
const ARCHETYPE_IDS = ['convenience', 'boutique', 'electronics', 'grocery'] as const;
const NEIGHBORHOOD_IDS = [
	'downtown',
	'campus',
	'residential',
	'mall',
	'transit',
	'industrial',
	'suburb',
	'parkEdge'
] as const;
const TERRAIN_IDS = ['commercial', 'residential', 'green', 'transit', 'industrial'] as const;
const CITY_TILE_FEATURES = ['road', 'river'] as const;
const INDUSTRY_TERRAIN_IDS = [
	'farmland',
	'forest',
	'water',
	'deposit',
	'industrial',
	'blocked'
] as const;
const INDUSTRIAL_BUILDING_STATUSES = [
	'idle',
	'produced',
	'imported-inputs',
	'stalled',
	'blocked'
] as const;
const MATERIAL_MOVEMENT_SOURCES = ['local', 'import', 'warehouse', 'overflow', 'rail'] as const;
const RAIL_SHIPMENT_KINDS = ['pull-producer', 'pull-warehouse', 'push-warehouse'] as const;
const MATERIAL_ID_SET = new Set<string>(Object.keys(MATERIALS));
const INDUSTRIAL_BUILDING_TYPE_ID_SET = new Set<string>(Object.keys(INDUSTRIAL_BUILDING_TYPES));
const INDUSTRY_RESOURCE_ID_SET = new Set<string>(
	Object.values(INDUSTRIAL_BUILDING_TYPES).flatMap((buildingType) =>
		buildingType.requiredResource === null ? [] : [buildingType.requiredResource]
	)
);
const WORLD_CITY_IDS = [
	'harbor-city',
	'campus-junction',
	'garden-borough',
	'industry-city',
	'breadbasket-basin',
	'quarry-works'
] as const;
const WORLD_MILESTONE_IDS = [
	'reveal-campus-junction',
	'reveal-breadbasket-basin',
	'reveal-garden-borough',
	'reveal-quarry-works',
	'positive-income-store-cap'
] as const;
const SCORE_KEYS = ['profit', 'customerSatisfaction', 'staffMorale', 'marketPosition'] as const;

export function createEmptySaveStore(): SaveStoreSnapshot {
	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: null,
		manualSlots: []
	};
}

export function createSaveRecord(
	game: GameState,
	input: { id: string; name: string; kind: SaveSlotKind; updatedAt: Date }
): SaveRecord {
	const updatedAt = input.updatedAt.toISOString();

	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		metadata: {
			id: input.id,
			name: input.name,
			kind: input.kind,
			updatedAt,
			day: game.day,
			cash: game.cash,
			storeCount: game.stores.length,
			activeCityId: game.activeCityId
		},
		game
	};
}

export function createAutoSaveRecord(game: GameState, updatedAt: Date): SaveRecord {
	return createSaveRecord(game, {
		id: AUTO_SAVE_SLOT_ID,
		name: 'Auto-save',
		kind: 'auto',
		updatedAt
	});
}

export function createManualSlotId(name: string, updatedAt: Date): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	return `manual-${slug || 'slot'}-${updatedAt.getTime()}`;
}

export function createSaveSummary(snapshot: SaveStoreSnapshot): SaveSummary {
	return {
		autoSave: snapshot.autoSave ? { ...snapshot.autoSave.metadata } : null,
		manualSlots: snapshot.manualSlots.map((record) => ({ ...record.metadata }))
	};
}

export function cloneSaveStoreSnapshot(snapshot: SaveStoreSnapshot): SaveStoreSnapshot {
	const validated = validateSaveStoreSnapshot(snapshot);
	try {
		return structuredClone(validated);
	} catch {
		throw new SaveDataError(
			'Save store must contain only structured-cloneable own data properties'
		);
	}
}

export function parseSaveStoreSnapshot(serialized: string): SaveStoreSnapshot {
	try {
		return validateSaveStoreSnapshot(JSON.parse(serialized));
	} catch (error) {
		if (error instanceof SaveDataError) {
			throw error;
		}

		throw new SaveDataError('Save data is not valid JSON');
	}
}

export function validateSaveStoreSnapshot(value: unknown): SaveStoreSnapshot {
	return withSaveDataBoundary('Save-store validation', () =>
		validateSaveStoreSnapshotInternal(value)
	);
}

function validateSaveStoreSnapshotInternal(value: unknown): SaveStoreSnapshot {
	const sourceStore = createPlainSnapshot(value, 'Save store');
	const record = requireRecord(sourceStore, 'Save store');
	const schemaVersion = requireNumber(record.schemaVersion, 'Save store schemaVersion');

	if (schemaVersion !== SAVE_SCHEMA_VERSION) {
		throw new SaveDataError(`Unsupported save schema version: ${schemaVersion}`);
	}

	const autoSave = record.autoSave === null ? null : validateSaveRecord(record.autoSave);
	const manualSlots = requireArray(record.manualSlots, 'manualSlots').map(validateSaveRecord);
	validateSlotInvariants(autoSave, manualSlots);

	return {
		...(record as unknown as SaveStoreSnapshot),
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave,
		manualSlots
	};
}

export function validateSaveRecord(value: unknown): SaveRecord {
	return withSaveDataBoundary('Save-record validation', () => validateSaveRecordInternal(value));
}

function validateSaveRecordInternal(value: unknown): SaveRecord {
	const sourceValue = createPlainSnapshot(value, 'Save record');
	const record = requireRecord(sourceValue, 'Save record');
	const schemaVersion = requireNumber(record.schemaVersion, 'Save record schemaVersion');

	if (schemaVersion !== SAVE_SCHEMA_VERSION) {
		throw new SaveDataError(`Unsupported save schema version: ${schemaVersion}`);
	}

	const metadata = requireRecord(record.metadata, 'Save metadata');
	const game = validateCurrentGameStateInternal(
		regenerateLegacyRetailCitiesForStrictValidation(record.game)
	);
	const kind = requireString(metadata.kind, 'Save metadata kind');

	if (kind !== 'auto' && kind !== 'manual') {
		throw new SaveDataError(`Unsupported save slot kind: ${kind}`);
	}

	requireString(metadata.id, 'Save metadata id');
	requireString(metadata.name, 'Save metadata name');
	requireString(metadata.updatedAt, 'Save metadata updatedAt');
	requireNumber(metadata.day, 'Save metadata day');
	requireNumber(metadata.cash, 'Save metadata cash');
	requireNumber(metadata.storeCount, 'Save metadata storeCount');
	requireString(metadata.activeCityId, 'Save metadata activeCityId');

	return {
		...(record as unknown as SaveRecord),
		schemaVersion: SAVE_SCHEMA_VERSION,
		game
	};
}

/**
 * Validates the current required schema while preserving additional own data
 * properties. Extras are allowed only when the whole state is structured-cloneable.
 */
export function validateCurrentGameState(value: unknown): GameState {
	return withSaveDataBoundary('Current-game validation', () =>
		validateCurrentGameStateInternal(value)
	);
}

function validateCurrentGameStateInternal(value: unknown): GameState {
	const sourceGame = createPlainSnapshot(value, 'Saved game');
	const game = requireRecord(sourceGame, 'Saved game');
	assertNoResidualGlobalWarehouseData(game);
	const policy = requireRecord(game.policy, 'Saved game policy');
	const scorecard = requireRecord(game.scorecard, 'Saved game scorecard');
	const cities = requireArray(game.cities, 'Saved game cities');
	const industryCities = requireArray(game.industryCities, 'Saved game industryCities');
	const industrialBuildings = requireArray(
		game.industrialBuildings,
		'Saved game industrialBuildings'
	);
	const stores = requireArray(game.stores, 'Saved game stores');
	const staff = requireArray(game.staff, 'Saved game staff');
	const hiringCandidates = requireArray(game.hiringCandidates, 'Saved game hiringCandidates');
	const decisions = requireArray(game.decisions, 'Saved game decisions');
	const reports = requireArray(game.reports, 'Saved game reports');

	requireNumber(game.seed, 'Saved game seed');
	requireNumber(game.rngState, 'Saved game rngState');
	const gameDay = requireNonNegativeInteger(game.day, 'Saved game day');
	requireNumber(game.cash, 'Saved game cash');
	validateSavedFinance(game.finance, gameDay, 'Saved game finance');
	const world = validateSavedWorld(game.world, 'Saved game world');
	requireOneOf(policy.pricing, 'Saved game policy pricing', PRICING_POSTURES);
	requireOneOf(policy.inventory, 'Saved game policy inventory', INVENTORY_BUFFERS);
	requireOneOf(policy.staffing, 'Saved game policy staffing', STAFFING_POSTURES);
	requireOneOf(policy.marketing, 'Saved game policy marketing', MARKETING_FOCUSES);
	requireOneOf(policy.service, 'Saved game policy service', SERVICE_PRIORITIES);
	requireNumber(scorecard.profit, 'Saved game scorecard profit');
	requireNumber(scorecard.customerSatisfaction, 'Saved game scorecard customerSatisfaction');
	requireNumber(scorecard.staffMorale, 'Saved game scorecard staffMorale');
	requireNumber(scorecard.marketPosition, 'Saved game scorecard marketPosition');
	cities.forEach((city, index) => {
		const label = `Saved game cities[${index}]`;
		validateSavedCity(city, label);
		validateCurrentRetailCitySize(city, label);
	});
	validateUniqueCityIds(cities, 'Saved game retail city IDs');
	const activeCityId = requireString(game.activeCityId, 'Saved game activeCityId');
	if (!cities.some((city) => (city as Record<string, unknown>).id === activeCityId)) {
		throw new SaveDataError('Saved game activeCityId must reference a materialized city');
	}
	industryCities.forEach((city, index) =>
		validateSavedIndustryCity(city, `Saved game industryCities[${index}]`)
	);
	validateUniqueCityIds(industryCities, 'Saved game industry city IDs');
	const activeIndustryCityId = requireString(
		game.activeIndustryCityId,
		'Saved game activeIndustryCityId'
	);
	if (
		!industryCities.some((city) => (city as Record<string, unknown>).id === activeIndustryCityId)
	) {
		throw new SaveDataError('Saved game activeIndustryCityId must reference a materialized city');
	}
	validateCurrentActiveWorldCityReferences(world, activeCityId, activeIndustryCityId);
	industrialBuildings.forEach((building, index) =>
		validateSavedIndustrialBuilding(building, `Saved game industrialBuildings[${index}]`)
	);
	stores.forEach((store, index) => validateSavedStore(store, `Saved game stores[${index}]`));
	const currentGame = game as unknown as GameState;
	validateCurrentEntityCityOwnership(currentGame);
	validateCurrentWorldCityReferences(
		world,
		cities,
		industryCities,
		activeCityId,
		activeIndustryCityId
	);
	validateCurrentCityInventories(currentGame);
	validateCurrentRetailSupplyAssignments(currentGame);
	validateCurrentLogisticsState(currentGame);
	validateCurrentIndustrialBuildingPlacements(industrialBuildings, industryCities);
	validateCurrentRetailStorePlacements(stores, cities);
	staff.forEach((member, index) => validateSavedStaffMember(member, `Saved game staff[${index}]`));
	hiringCandidates.forEach((candidate, index) =>
		validateSavedHiringCandidate(candidate, `Saved game hiringCandidates[${index}]`)
	);
	const decisionIds = new Set<string>();
	decisions.forEach((decision, index) => {
		const id = validateSavedDecision(decision, gameDay, `Saved game decisions[${index}]`);
		if (decisionIds.has(id)) {
			throw new SaveDataError(
				`Saved game decisions[${index}] id must be unique: ${id}`,
				'invariant-event-runtime'
			);
		}
		decisionIds.add(id);
	});
	const decodedReports = decodeHistoricalReports(reports);
	currentGame.reports = decodedReports;
	validateSavedEventRuntime(game.events, gameDay, decisions, decodedReports, 'Saved game events');
	const storeCap = requireNumber(game.storeCap, 'Saved game storeCap');
	if (!Number.isInteger(storeCap)) {
		throw new SaveDataError('Saved game storeCap must be an integer', 'invariant-store-cap');
	}
	if (storeCap < stores.length) {
		throw new SaveDataError(
			'Saved game storeCap must be at least the current store count',
			'invariant-store-cap'
		);
	}

	// Reference-stability contract: refreshWorldProgress returns the SAME game
	// reference when no milestone/city reveal applies (see world.ts: `if (!changed
	// && !normalized && storeCap === game.storeCap) return game;`). This check
	// relies on that identity — a structural comparison would mask the real
	// invariant (the caller must have already run refreshWorldProgress). If
	// refreshWorldProgress ever changes to always return a new object, this check
	// must switch to a structural equality test.
	if (refreshWorldProgress(currentGame) !== currentGame) {
		throw new SaveDataError('Saved game world progress must already be current');
	}
	for (const [index, building] of currentGame.industrialBuildings.entries()) {
		const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];
		const recipeMaterialIds = getRecipeMaterialIds(buildingType);
		if (
			Object.keys(building.inventory).some(
				(materialId) => !recipeMaterialIds.has(materialId as keyof typeof MATERIALS)
			) ||
			inventoryUsed(building.inventory) > buildingType.bufferCapacity
		) {
			throw new SaveDataError(
				`Saved game industrialBuildings[${index}] inventory must fit its recipe buffer`,
				'invariant-inventory'
			);
		}
	}

	return currentGame;
}

function validateSlotInvariants(autoSave: SaveRecord | null, manualSlots: SaveRecord[]): void {
	if (autoSave && autoSave.metadata.kind !== 'auto') {
		throw new SaveDataError(`Auto-save must have auto metadata kind: ${autoSave.metadata.id}`);
	}

	if (autoSave && autoSave.metadata.id !== AUTO_SAVE_SLOT_ID) {
		throw new SaveDataError(`Auto-save must use slot id: ${AUTO_SAVE_SLOT_ID}`);
	}

	const manualSlotIds = new Set<string>();

	for (const slot of manualSlots) {
		if (slot.metadata.kind !== 'manual') {
			throw new SaveDataError(
				`Manual save slot must have manual metadata kind: ${slot.metadata.id}`
			);
		}

		if (autoSave && slot.metadata.id === autoSave.metadata.id) {
			throw new SaveDataError(
				`Save slot ids must not collide between auto-save and manual slots: ${slot.metadata.id}`
			);
		}

		if (slot.metadata.id === AUTO_SAVE_SLOT_ID) {
			throw new SaveDataError(
				`Manual save slot id is reserved for auto-save: ${AUTO_SAVE_SLOT_ID}`
			);
		}

		if (manualSlotIds.has(slot.metadata.id)) {
			throw new SaveDataError(`Manual save slot ids must be unique: ${slot.metadata.id}`);
		}

		manualSlotIds.add(slot.metadata.id);
	}
}

function regenerateLegacyRetailCitiesForStrictValidation(value: unknown): unknown {
	const sourceGame = createPlainSnapshot(value, 'Saved game');
	const game = requireRecord(sourceGame, 'Saved game');
	const regenerated = regenerateLegacyRetailCities(game);

	if (regenerated.regeneratedCityIds.size === 0) {
		return game;
	}

	return {
		...game,
		cities: regenerated.cities,
		stores: reconcileRetailStorePlacements(
			game.stores,
			regenerated.cities,
			regenerated.regeneratedCityIds
		)
	};
}

function regenerateLegacyRetailCities(game: Record<string, unknown>): {
	cities: unknown;
	regeneratedCityIds: Set<string>;
} {
	if (!Array.isArray(game.cities)) {
		return { cities: game.cities, regeneratedCityIds: new Set() };
	}

	const regeneratedCityIds = new Set<string>();
	const cities = game.cities.map((city) => {
		const regenerated = regenerateLegacyRetailCity(game, city);
		if (
			typeof city === 'object' &&
			city !== null &&
			typeof (city as Record<string, unknown>).id === 'string' &&
			regenerated !== city
		) {
			regeneratedCityIds.add((city as Record<string, unknown>).id as string);
		}
		return regenerated;
	});
	return { cities, regeneratedCityIds };
}

function regenerateLegacyRetailCity(game: Record<string, unknown>, city: unknown): unknown {
	if (typeof city !== 'object' || city === null) {
		return city;
	}

	const record = city as Record<string, unknown>;
	if (typeof record.id !== 'string') {
		return city;
	}

	const definition = getWorldCityDefinition(record.id as WorldCityId);
	if (!definition || definition.kind !== 'retail') {
		return city;
	}

	if (record.width === DEFAULT_RETAIL_CITY_WIDTH && record.height === DEFAULT_RETAIL_CITY_HEIGHT) {
		return city;
	}

	// Migrate saves created when the retail city was the intermediate 28x24
	// size. The game has not been released, so in-development saves are not
	// treated as legacy data that must be preserved. This 28x24 path is
	// retained as a no-op safety net for any in-development autosaves from
	// that window; no other non-default sizes (e.g. the earlier 20x20
	// world-progression cities) are migrated. See AGENTS.md for the legacy
	// save policy. Do not broaden this without a release actually shipping a
	// new intermediate size.
	if (record.width !== 28 || record.height !== 24) {
		return city;
	}

	const seed =
		record.id === 'harbor-city' && typeof game.seed === 'number' ? game.seed : definition.seed;

	return generateCity({
		id: definition.id,
		name: typeof record.name === 'string' ? record.name : definition.name,
		width: DEFAULT_RETAIL_CITY_WIDTH,
		height: DEFAULT_RETAIL_CITY_HEIGHT,
		seed
	});
}

// This only mutates stores in `regeneratedCityIds`, which is populated solely
// by the documented 28x24 retail-city regeneration path. With an empty set it
// is used as a placement validator for current-schema saves.
function reconcileRetailStorePlacements(
	stores: unknown,
	cities: unknown,
	regeneratedCityIds: Set<string>,
	emitWarnings = true,
	onInvalidPlacement?: (index: number) => void
): unknown {
	if (!Array.isArray(stores) || !Array.isArray(cities)) {
		return stores;
	}

	const cityById = new Map(
		cities
			.filter((city): city is City => isSavedCityLike(city))
			.map((city) => [city.id, city] as const)
	);
	const cityLookupById = new Map<string, CityTileLookup>(
		[...cityById.values()].map((city) => [city.id, createCityTileLookup(city)] as const)
	);
	const occupiedTileIdsByCity = new Map<string, Set<string>>();

	// Pass 1: reserve tiles for stores that are already correctly placed. This
	// prevents a later invalid store's fallback closest-tile search from
	// claiming a valid store's tile just because it appeared earlier in the
	// array and would otherwise be relocated first. The resolved tile is kept
	// so pass 2 can refresh tile-derived fields (location/localDemand) for
	// stores in regenerated cities even when the store is not relocated — a
	// regenerated city can change a tile's neighborhood/demand at unchanged
	// coordinates, and simulateDay reads localDemand, so leaving it stale
	// skews revenue. Stores in non-regenerated cities keep their saved fields
	// untouched (the opening store intentionally carries an archetype-based
	// localDemand rather than tile-derived values).
	//
	// The reservation covers the store's full 2x2 footprint, not just the
	// anchor tile, so a relocated store can never land at an anchor whose
	// footprint overlaps this store's footprint — the same invariant the live
	// placement logic enforces.
	const validPlacementTiles = new Map<number, { tile: CityTile; regenerated: boolean }>();
	stores.forEach((store, index) => {
		if (typeof store !== 'object' || store === null) {
			return;
		}
		const record = store as Record<string, unknown>;
		if (typeof record.cityId !== 'string' || typeof record.tileId !== 'string') {
			return;
		}
		const city = cityById.get(record.cityId);
		if (!city) {
			return;
		}
		const tile = getTileById(city, record.tileId);
		if (!tile || !isTileBuildable(tile) || record.mapX !== tile.x || record.mapY !== tile.y) {
			return;
		}
		const reservedTileIds = getOccupiedTileIds(occupiedTileIdsByCity, city.id);
		if (reservedTileIds.has(tile.id)) {
			return;
		}
		const lookup = cityLookupById.get(city.id);
		if (lookup) {
			// Validate the full 2x2 footprint, not just the anchor — the same
			// invariant findSavedStoreTile's isAnchorAvailable enforces in pass
			// 2. Without this, a store whose footprint now spills onto a
			// river/road/locked tile, off the map, or onto another store's
			// already-reserved footprint (via a non-anchor tile whose anchor is
			// itself unreserved) would survive pass 1 verbatim and never reach
			// the pass-2 relocation that logs and fixes it.
			const footprint = getRetailStoreFootprint(lookup, tile);
			if (
				footprint.missingCoordinates.length > 0 ||
				footprint.tiles.length === 0 ||
				footprint.tiles.some(
					(footprintTile) =>
						!isTileBuildable(footprintTile) || reservedTileIds.has(footprintTile.id)
				)
			) {
				return;
			}
			for (const footprintTile of footprint.tiles) {
				reservedTileIds.add(footprintTile.id);
			}
		} else {
			reservedTileIds.add(tile.id);
		}
		validPlacementTiles.set(index, {
			tile,
			regenerated: regeneratedCityIds.has(city.id)
		});
	});

	// Pass 2: relocate every store that is not already validly placed, never
	// reusing a tile reserved by a valid placement in pass 1. Validly placed
	// stores in regenerated cities also get location/localDemand refreshed
	// from the new tile so tile-derived fields stay in sync with live data.
	return stores.map((store, index) => {
		const validPlacement = validPlacementTiles.get(index);
		if (validPlacement) {
			if (!validPlacement.regenerated || typeof store !== 'object' || store === null) {
				return store;
			}
			return {
				...(store as Record<string, unknown>),
				location: formatLocation(validPlacement.tile),
				localDemand: computeStoreLocalDemand(validPlacement.tile)
			};
		}
		if (typeof store !== 'object' || store === null) {
			onInvalidPlacement?.(index);
			return store;
		}

		const record = store as Record<string, unknown>;
		if (
			typeof record.cityId !== 'string' ||
			record.cityId.length === 0 ||
			typeof record.tileId !== 'string' ||
			record.tileId.length === 0 ||
			typeof record.mapX !== 'number' ||
			!Number.isFinite(record.mapX) ||
			typeof record.mapY !== 'number' ||
			!Number.isFinite(record.mapY)
		) {
			onInvalidPlacement?.(index);
			return store;
		}

		const city = cityById.get(record.cityId);
		if (!city) {
			onInvalidPlacement?.(index);
			return store;
		}
		if (!regeneratedCityIds.has(city.id)) {
			onInvalidPlacement?.(index);
			return store;
		}
		onInvalidPlacement?.(index);

		const occupiedTileIds = getOccupiedTileIds(occupiedTileIdsByCity, city.id);
		const lookup = cityLookupById.get(city.id);
		const targetTile = findSavedStoreTile(city, record, occupiedTileIds, lookup);
		if (!targetTile) {
			const storeId = typeof record.id === 'string' ? record.id : '<unknown>';
			if (emitWarnings) {
				console.warn(
					`saveCodec: store "${storeId}" in city "${city.id}" has no buildable tile (saved tileId "${record.tileId ?? '?'}"); left on stale tile.`
				);
			}
			return store;
		}

		// Reserve the relocated store's full footprint so a later relocated
		// store cannot land at an overlapping anchor.
		if (lookup) {
			for (const footprintTile of getRetailStoreFootprint(lookup, targetTile).tiles) {
				occupiedTileIds.add(footprintTile.id);
			}
		} else {
			occupiedTileIds.add(targetTile.id);
		}

		const storeId = typeof record.id === 'string' ? record.id : '<unknown>';
		if (emitWarnings) {
			console.warn(
				`saveCodec: relocated store "${storeId}" in city "${city.id}" from tile "${record.tileId ?? '?'}" (${record.mapX ?? '?'}, ${record.mapY ?? '?'}) to tile "${targetTile.id}" (${targetTile.x}, ${targetTile.y}).`
			);
		}

		return {
			...record,
			tileId: targetTile.id,
			mapX: targetTile.x,
			mapY: targetTile.y,
			// Refresh tile-derived fields so a relocated store matches live
			// placement instead of carrying stale coordinates/demand from the
			// pre-migration tile.
			location: formatLocation(targetTile),
			localDemand: computeStoreLocalDemand(targetTile)
		};
	});
}

function validateCurrentRetailStorePlacements(stores: unknown[], cities: unknown[]): void {
	let invalidIndex = -1;
	reconcileRetailStorePlacements(stores, cities, new Set(), false, (index) => {
		if (invalidIndex < 0) invalidIndex = index;
	});
	if (invalidIndex >= 0) {
		throw new SaveDataError(
			`Saved game stores[${invalidIndex}] placement must already match a buildable, non-overlapping city footprint`
		);
	}
}

function validateCurrentIndustrialBuildingPlacements(
	buildings: unknown[],
	industryCities: unknown[]
): void {
	const citiesById = new Map(
		(industryCities as IndustryCity[]).map((city) => [city.id, city] as const)
	);
	const occupiedTileIdsByCity = new Map<string, Set<string>>();

	for (const [index, building] of (buildings as IndustrialBuilding[]).entries()) {
		const label = `Saved game industrialBuildings[${index}] placement`;
		const city = citiesById.get(building.cityId);
		if (!city) {
			throw new SaveDataError(`${label} must reference a materialized industry city`);
		}
		const lookup = createIndustryTileLookup(city);
		const anchor = lookup.byId.get(building.tileId);
		if (!anchor) {
			throw new SaveDataError(`${label} must reference an existing industry tile`);
		}
		if (building.mapX !== anchor.x || building.mapY !== anchor.y) {
			throw new SaveDataError(`${label} coordinates must match its anchor tile`);
		}

		const footprint = getIndustryBuildingFootprint(lookup, anchor);
		if (footprint.missingCoordinates.length > 0 || footprint.tiles.length !== 4) {
			throw new SaveDataError(`${label} footprint must fit entirely within its city`);
		}
		if (footprint.tiles.some((tile) => tile.locked)) {
			throw new SaveDataError(`${label} footprint must contain only unlocked tiles`);
		}
		if (
			city.rails.some((rail) =>
				footprint.tiles.some((tile) => tile.x === rail.x && tile.y === rail.y)
			)
		) {
			throw new SaveDataError(`${label} footprint must not overlap rail`);
		}

		const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];
		if (buildingType.requiredResource && anchor.resource !== buildingType.requiredResource) {
			throw new SaveDataError(`${label} anchor must provide its required resource`);
		}
		if (
			buildingType.requiresIndustrialTile &&
			footprint.tiles.some((tile) => tile.terrain !== 'industrial')
		) {
			throw new SaveDataError(`${label} footprint must contain only industrial terrain`);
		}

		let occupiedTileIds = occupiedTileIdsByCity.get(city.id);
		if (!occupiedTileIds) {
			occupiedTileIds = new Set();
			occupiedTileIdsByCity.set(city.id, occupiedTileIds);
		}
		if (footprint.tiles.some((tile) => occupiedTileIds.has(tile.id))) {
			throw new SaveDataError(`${label} footprint must not overlap another industrial building`);
		}
		for (const tile of footprint.tiles) occupiedTileIds.add(tile.id);
	}
}

function isSavedCityLike(value: unknown): value is City {
	const tiles = (value as { tiles?: unknown } | null)?.tiles;
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { id?: unknown }).id === 'string' &&
		Array.isArray(tiles) &&
		tiles.every(
			(tile) =>
				typeof tile === 'object' &&
				tile !== null &&
				typeof (tile as { id?: unknown }).id === 'string' &&
				typeof (tile as { cityId?: unknown }).cityId === 'string' &&
				typeof (tile as { x?: unknown }).x === 'number' &&
				typeof (tile as { y?: unknown }).y === 'number'
		)
	);
}

function getOccupiedTileIds(
	occupiedTileIdsByCity: Map<string, Set<string>>,
	cityId: string
): Set<string> {
	let occupiedTileIds = occupiedTileIdsByCity.get(cityId);
	if (!occupiedTileIds) {
		occupiedTileIds = new Set();
		occupiedTileIdsByCity.set(cityId, occupiedTileIds);
	}

	return occupiedTileIds;
}

function findSavedStoreTile(
	city: City,
	store: Record<string, unknown>,
	occupiedTileIds: Set<string>,
	lookup?: CityTileLookup
): CityTile | null {
	// A candidate anchor is only acceptable when its full 2x2 footprint is
	// buildable and none of its footprint tiles are already reserved. This
	// mirrors the live placement invariant, so a relocated store can never
	// land at an anchor whose footprint overlaps an already-placed store.
	const isAnchorAvailable = (anchor: CityTile): boolean => {
		if (!isTileBuildable(anchor) || occupiedTileIds.has(anchor.id)) {
			return false;
		}
		if (!lookup) {
			return true;
		}
		const footprint = getRetailStoreFootprint(lookup, anchor);
		if (footprint.missingCoordinates.length > 0 || footprint.tiles.length === 0) {
			return false;
		}
		for (const footprintTile of footprint.tiles) {
			if (!isTileBuildable(footprintTile) || occupiedTileIds.has(footprintTile.id)) {
				return false;
			}
		}
		return true;
	};

	if (typeof store.tileId === 'string') {
		const tile = getTileById(city, store.tileId);
		if (tile && isAnchorAvailable(tile)) {
			return tile;
		}
	}

	const originX = typeof store.mapX === 'number' ? store.mapX : 1;
	const originY = typeof store.mapY === 'number' ? store.mapY : 1;
	const buildableTiles = city.tiles.filter((tile) => isAnchorAvailable(tile));

	return buildableTiles.reduce<CityTile | null>((best, tile) => {
		if (!best) {
			return tile;
		}

		const bestDistance = getTileDistance(best, originX, originY);
		const tileDistance = getTileDistance(tile, originX, originY);

		return tileDistance < bestDistance ? tile : best;
	}, null);
}

function getTileDistance(tile: CityTile, x: number, y: number): number {
	return Math.abs(tile.x - x) + Math.abs(tile.y - y);
}

function validateSavedWorld(value: unknown, label: string): GameState['world'] {
	const world = requireRecord(value, label);
	const revealedCityIds = requireArray(world.revealedCityIds, `${label} revealedCityIds`).map(
		(cityId, index) => requireOneOf(cityId, `${label} revealedCityIds[${index}]`, WORLD_CITY_IDS)
	);
	const openedCityIds = requireArray(world.openedCityIds, `${label} openedCityIds`).map(
		(cityId, index) => requireOneOf(cityId, `${label} openedCityIds[${index}]`, WORLD_CITY_IDS)
	);
	const claimedMilestoneIds = requireArray(
		world.claimedMilestoneIds,
		`${label} claimedMilestoneIds`
	).map((milestoneId, index) =>
		requireOneOf(milestoneId, `${label} claimedMilestoneIds[${index}]`, WORLD_MILESTONE_IDS)
	);

	for (const cityId of openedCityIds) {
		if (!revealedCityIds.includes(cityId)) {
			throw new SaveDataError(`${label} opened city must also be revealed: ${cityId}`);
		}
	}

	return {
		revealedCityIds: [...new Set(revealedCityIds)],
		openedCityIds: [...new Set(openedCityIds)],
		claimedMilestoneIds: [...new Set(claimedMilestoneIds)]
	};
}

function validateUniqueCityIds(cities: unknown[], label: string): void {
	const seen = new Set<string>();
	for (const city of cities as Array<Record<string, unknown>>) {
		const cityId = city.id as string;
		if (seen.has(cityId)) throw new SaveDataError(`${label} must be unique`);
		seen.add(cityId);
	}
}

function validateCurrentActiveWorldCityReferences(
	world: GameState['world'],
	activeCityId: string,
	activeIndustryCityId: string
): void {
	if (getWorldCityDefinition(activeCityId)?.kind !== 'retail') {
		throw new SaveDataError('Saved game activeCityId must reference a retail catalog city');
	}
	if (getWorldCityDefinition(activeIndustryCityId)?.kind !== 'industry') {
		throw new SaveDataError(
			'Saved game activeIndustryCityId must reference an industry catalog city'
		);
	}

	const opened = new Set<string>(world.openedCityIds);
	if (!opened.has(activeCityId)) {
		throw new SaveDataError('Saved game activeCityId must reference an opened city');
	}
	if (!opened.has(activeIndustryCityId)) {
		throw new SaveDataError('Saved game activeIndustryCityId must reference an opened city');
	}
}

function validateCurrentWorldCityReferences(
	world: GameState['world'],
	cities: unknown[],
	industryCities: unknown[],
	activeCityId: string,
	activeIndustryCityId: string
): void {
	validateCurrentActiveWorldCityReferences(world, activeCityId, activeIndustryCityId);

	const retailIds = new Set(
		(cities as Array<Record<string, unknown>>).map((city) => city.id as string)
	);
	const industryIds = new Set(
		(industryCities as Array<Record<string, unknown>>).map((city) => city.id as string)
	);
	for (const cityId of retailIds) {
		if (getWorldCityDefinition(cityId)?.kind === 'industry') {
			throw new SaveDataError(`Saved game retail city ${cityId} must use a retail catalog ID`);
		}
	}
	for (const cityId of industryIds) {
		if (getWorldCityDefinition(cityId)?.kind === 'retail') {
			throw new SaveDataError(`Saved game industry city ${cityId} must use an industry catalog ID`);
		}
	}
	for (const cityId of retailIds) {
		if (industryIds.has(cityId)) {
			throw new SaveDataError(
				`Saved game retail and industry city IDs must be disjoint: ${cityId}`
			);
		}
	}
	for (const cityId of world.openedCityIds) {
		const definition = getWorldCityDefinition(cityId);
		if (definition?.kind === 'retail' && !retailIds.has(cityId)) {
			throw new SaveDataError(`Saved game opened retail city ${cityId} must be materialized`);
		}
		if (definition?.kind === 'industry' && !industryIds.has(cityId)) {
			throw new SaveDataError(`Saved game opened industry city ${cityId} must be materialized`);
		}
	}
}

function validateCurrentEntityCityOwnership(game: GameState): void {
	const issue = findEntityCityOwnershipIssues(game)[0];
	if (!issue) return;

	const collection = issue.kind === 'store' ? 'stores' : 'industrialBuildings';
	const entities = issue.kind === 'store' ? game.stores : game.industrialBuildings;
	const index = entities.findIndex((entity) => entity.id === issue.entityId);
	throw new SaveDataError(
		`Saved game ${collection}[${Math.max(index, 0)}] must belong to an opened city (found ${issue.cityId})`,
		'invariant-entity-city-ownership'
	);
}

function cityInventoryInvariant(message: string): never {
	throw new SaveDataError(message, 'invariant-city-inventory');
}

function retailSupplyInvariant(message: string): never {
	throw new SaveDataError(message, 'invariant-retail-supply');
}

function requireCityInventoryRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return cityInventoryInvariant(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function requireCityInventorySafeInteger(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return cityInventoryInvariant(`${label} must be a finite number`);
	}
	if (!Number.isSafeInteger(value) || value < 0) {
		return cityInventoryInvariant(`${label} must be a non-negative safe integer`);
	}
	return value;
}

function addCityInventorySafeInteger(total: number, value: number, label: string): number {
	if (value > Number.MAX_SAFE_INTEGER - total) {
		return cityInventoryInvariant(`${label} must not exceed the safe-integer range`);
	}
	return total + value;
}

function resolveCurrentInventoryCityId(
	game: GameState,
	value: unknown,
	label: string
): WorldCityId {
	if (typeof value !== 'string' || value.length === 0) {
		return cityInventoryInvariant(`${label} must be a non-empty string`);
	}
	const definition = getWorldCityDefinition(value);
	if (!definition || definition.kind !== 'industry') {
		return cityInventoryInvariant(`${label} must reference a known industry city`);
	}
	if (!game.world.openedCityIds.includes(definition.id)) {
		return cityInventoryInvariant(`${label} must reference an opened industry city`);
	}
	if (!game.industryCities.some((city) => city.id === definition.id)) {
		return cityInventoryInvariant(`${label} must reference a materialized industry city`);
	}
	return definition.id;
}

function validateCurrentCityInventories(game: GameState): void {
	if (!Array.isArray(game.cityInventories)) {
		cityInventoryInvariant('Saved game cityInventories must be an array');
	}

	const inventories = game.cityInventories;
	const seenCityIds = new Set<WorldCityId>();
	for (const [index, value] of inventories.entries()) {
		const label = `Saved game cityInventories[${index}]`;
		const inventory = requireCityInventoryRecord(value, label);
		try {
			requireExactKeys(inventory, ['cityId', 'materials'], label);
		} catch (error) {
			if (error instanceof SaveDataError) {
				cityInventoryInvariant(error.message);
			}
			throw error;
		}
		const cityId = resolveCurrentInventoryCityId(game, inventory.cityId, `${label} cityId`);
		if (seenCityIds.has(cityId)) {
			cityInventoryInvariant(`${label} cityId must be unique: ${cityId}`);
		}
		seenCityIds.add(cityId);

		const materials = requireCityInventoryRecord(inventory.materials, `${label} materials`);
		let used = 0;
		for (const [materialId, quantity] of Object.entries(materials)) {
			if (!MATERIAL_ID_SET.has(materialId)) {
				cityInventoryInvariant(`${label} materials ${materialId} must be a known material`);
			}
			const materialQuantity = requireCityInventorySafeInteger(
				quantity,
				`${label} materials ${materialId}`
			);
			used = addCityInventorySafeInteger(used, materialQuantity, `${label} used capacity`);
		}
	}

	const expectedCityIds = game.world.openedCityIds
		.filter((cityId) => {
			const definition = getWorldCityDefinition(cityId);
			return (
				definition?.kind === 'industry' &&
				game.industryCities.some((industryCity) => industryCity.id === cityId)
			);
		})
		.sort(compareWorldCityIds);
	if (
		seenCityIds.size !== expectedCityIds.length ||
		expectedCityIds.some((cityId) => !seenCityIds.has(cityId))
	) {
		cityInventoryInvariant(
			'Saved game cityInventories must contain one record for every opened industry city'
		);
	}
	game.cityInventories = [...inventories].sort((left, right) =>
		compareWorldCityIds(left.cityId, right.cityId)
	);
}

function resolveCurrentRetailAssignmentOwner(
	game: GameState,
	value: unknown,
	label: string
): WorldCityId {
	if (typeof value !== 'string' || value.length === 0) {
		return retailSupplyInvariant(`${label} must be a non-empty string`);
	}
	const definition = getWorldCityDefinition(value);
	if (!definition || definition.kind !== 'retail') {
		return retailSupplyInvariant(`${label} must reference a known retail city`);
	}
	if (!game.world.openedCityIds.includes(definition.id)) {
		return retailSupplyInvariant(`${label} must reference an opened retail city`);
	}
	if (!game.cities.some((city) => city.id === definition.id)) {
		return retailSupplyInvariant(`${label} must reference a materialized retail city`);
	}
	return definition.id;
}

function validateCurrentRetailSupplyAssignments(game: GameState): void {
	if (!Array.isArray(game.retailSupplyAssignments)) {
		retailSupplyInvariant('Saved game retailSupplyAssignments must be an array');
	}

	const assignments = game.retailSupplyAssignments;
	const seenRetailCityIds = new Set<WorldCityId>();
	for (const [index, value] of assignments.entries()) {
		const label = `Saved game retailSupplyAssignments[${index}]`;
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			retailSupplyInvariant(`${label} must be an object`);
		}
		const assignment = value as unknown as Record<string, unknown>;
		const retailCityId = resolveCurrentRetailAssignmentOwner(
			game,
			assignment.retailCityId,
			`${label} retailCityId`
		);
		if (seenRetailCityIds.has(retailCityId)) {
			retailSupplyInvariant(`${label} retailCityId must be unique: ${retailCityId}`);
		}
		seenRetailCityIds.add(retailCityId);

		if (assignment.supplyCityId !== null) {
			if (typeof assignment.supplyCityId !== 'string' || assignment.supplyCityId.length === 0) {
				retailSupplyInvariant(`${label} supplyCityId must be a city ID or null`);
			}
			const supply = getWorldCityDefinition(assignment.supplyCityId);
			if (!supply || supply.kind !== 'industry') {
				retailSupplyInvariant(`${label} supplyCityId must reference a known industry city`);
			}
			if (!getCityInventory(game, supply.id).ok) {
				retailSupplyInvariant(`${label} supplyCityId must reference a current industry inventory`);
			}
		}
	}

	const expectedRetailCityIds = game.world.openedCityIds
		.filter((cityId) => {
			const definition = getWorldCityDefinition(cityId);
			return definition?.kind === 'retail' && game.cities.some((city) => city.id === cityId);
		})
		.sort(compareWorldCityIds);
	if (
		seenRetailCityIds.size !== expectedRetailCityIds.length ||
		expectedRetailCityIds.some((cityId) => !seenRetailCityIds.has(cityId))
	) {
		retailSupplyInvariant(
			'Saved game retailSupplyAssignments must contain one record for every opened retail city'
		);
	}
	game.retailSupplyAssignments = [...assignments].sort((left, right) =>
		compareWorldCityIds(left.retailCityId, right.retailCityId)
	);
}

function logisticsInvariant(message: string): never {
	throw new SaveDataError(message, 'invariant-logistics');
}

function requireLogisticsRecord(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return logisticsInvariant(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function requireLogisticsArray(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) return logisticsInvariant(`${label} must be an array`);
	return value;
}

function requireLogisticsExactKeys(
	value: Record<string, unknown>,
	allowedKeys: readonly string[],
	label: string
): void {
	const allowed = new Set(allowedKeys);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) logisticsInvariant(`${label} contains an unknown field: ${key}`);
	}
}

function requireLogisticsString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		return logisticsInvariant(`${label} must be a non-empty string`);
	}
	return value;
}

function requireLogisticsPositiveSafeInteger(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
		return logisticsInvariant(`${label} must be a positive safe integer`);
	}
	return value;
}

function requireLogisticsAdvanceableSequence(value: unknown, label: string): number {
	const sequence = requireLogisticsPositiveSafeInteger(value, label);
	// `nextTransferSequence`/`nextRouteSequence` are incremented with checkedAdd(..., 1)
	// when a transfer or route is created, so a save at exactly MAX_SAFE_INTEGER would
	// pass validation but throw on the next creation. Reject it up front, mirroring the
	// generic requirePositiveSafeInteger "can advance safely" invariant.
	if (sequence >= Number.MAX_SAFE_INTEGER) {
		return logisticsInvariant(`${label} must be a positive safe integer that can advance safely`);
	}
	return sequence;
}

function requireLogisticsNonNegativeSafeInteger(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		return logisticsInvariant(`${label} must be a non-negative safe integer`);
	}
	return value;
}

function requireLogisticsOneOf<T extends readonly string[]>(
	value: unknown,
	label: string,
	allowed: T
): T[number] {
	const text = requireLogisticsString(value, label);
	if (!(allowed as readonly string[]).includes(text)) {
		return logisticsInvariant(`${label} must be one of: ${allowed.join(', ')}`);
	}
	return text as T[number];
}

function requireCanonicalLogisticsId(
	value: unknown,
	prefix: string,
	label: string
): { id: string; sequence: number } {
	const id = requireLogisticsString(value, label);
	// `generatedIdSequence` is the sole canonical numeric-suffix parser. Its
	// result is used only to prove that the next generated ID cannot collide.
	const sequence = generatedIdSequence(id, prefix);
	if (sequence === 0) {
		return logisticsInvariant(`${label} must use ${prefix}<positive-safe-integer>`);
	}
	return { id, sequence };
}

function requireCanonicalRouteIdBeforeNextSequence(
	value: unknown,
	label: string,
	nextRouteSequence: number
): string {
	const { id, sequence } = requireCanonicalLogisticsId(value, 'route-', label);
	if (sequence >= nextRouteSequence) {
		logisticsInvariant('Saved game logistics nextRouteSequence must exceed generated route IDs');
	}
	return id;
}

function resolveLogisticsEndpoint(game: GameState, value: unknown, label: string): WorldCityId {
	const cityId = requireLogisticsString(value, label);
	const definition = getWorldCityDefinition(cityId);
	if (!definition || definition.kind !== 'industry') {
		return logisticsInvariant(`${label} must reference a known industry city`);
	}
	if (!game.world.openedCityIds.includes(definition.id)) {
		return logisticsInvariant(`${label} must reference an opened industry city`);
	}
	if (!game.industryCities.some((city) => city.id === definition.id)) {
		return logisticsInvariant(`${label} must reference a materialized industry city`);
	}
	if (!getCityInventory(game, definition.id).ok) {
		return logisticsInvariant(`${label} must reference a current industry inventory`);
	}
	return definition.id;
}

function validateCurrentTransferOrderSource(
	value: unknown,
	label: string,
	nextRouteSequence: number
): void {
	const source = requireLogisticsRecord(value, label);
	const kind = requireLogisticsString(source.kind, `${label} kind`);
	if (kind === 'manual') {
		requireLogisticsExactKeys(source, ['kind'], label);
		return;
	}
	if (kind === 'recurring-route') {
		requireLogisticsExactKeys(source, ['kind', 'routeId'], label);
		requireCanonicalRouteIdBeforeNextSequence(
			source.routeId,
			`${label} routeId`,
			nextRouteSequence
		);
		return;
	}
	logisticsInvariant(`${label} kind must be one of: manual, recurring-route`);
}

function validateCurrentLogisticsState(game: GameState): void {
	const label = 'Saved game logistics';
	const logistics = requireLogisticsRecord(game.logistics, label);
	requireLogisticsExactKeys(
		logistics,
		['transferOrders', 'recurringRoutes', 'nextTransferSequence', 'nextRouteSequence'],
		label
	);
	const transferOrders = requireLogisticsArray(logistics.transferOrders, `${label} transferOrders`);
	const recurringRoutes = requireLogisticsArray(
		logistics.recurringRoutes,
		`${label} recurringRoutes`
	);
	const nextTransferSequence = requireLogisticsAdvanceableSequence(
		logistics.nextTransferSequence,
		`${label} nextTransferSequence`
	);
	const nextRouteSequence = requireLogisticsAdvanceableSequence(
		logistics.nextRouteSequence,
		`${label} nextRouteSequence`
	);

	const transferIds = new Set<string>();
	for (const [index, value] of transferOrders.entries()) {
		const orderLabel = `${label} transferOrders[${index}]`;
		const order = requireLogisticsRecord(value, orderLabel);
		requireLogisticsExactKeys(
			order,
			[
				'id',
				'source',
				'originCityId',
				'destinationCityId',
				'materialId',
				'quantity',
				'createdOnDay',
				'dispatchedOnDay',
				'arrivalOnDay',
				'transportCost',
				'status'
			],
			orderLabel
		);
		const { id, sequence } = requireCanonicalLogisticsId(order.id, 'transfer-', `${orderLabel} id`);
		if (transferIds.has(id)) logisticsInvariant(`${label} transferOrders must have unique IDs`);
		if (sequence >= nextTransferSequence) {
			logisticsInvariant(`${label} nextTransferSequence must exceed generated transfer IDs`);
		}
		transferIds.add(id);
		validateCurrentTransferOrderSource(order.source, `${orderLabel} source`, nextRouteSequence);
		const originCityId = resolveLogisticsEndpoint(
			game,
			order.originCityId,
			`${orderLabel} originCityId`
		);
		const destinationCityId = resolveLogisticsEndpoint(
			game,
			order.destinationCityId,
			`${orderLabel} destinationCityId`
		);
		if (originCityId === destinationCityId) {
			logisticsInvariant(`${orderLabel} endpoints must be distinct`);
		}
		const materialId = requireLogisticsString(order.materialId, `${orderLabel} materialId`);
		if (!MATERIAL_ID_SET.has(materialId)) {
			logisticsInvariant(`${orderLabel} materialId must be a known material`);
		}
		requireLogisticsPositiveSafeInteger(order.quantity, `${orderLabel} quantity`);
		const createdOnDay = requireLogisticsNonNegativeSafeInteger(
			order.createdOnDay,
			`${orderLabel} createdOnDay`
		);
		const dispatchedOnDay = requireLogisticsNonNegativeSafeInteger(
			order.dispatchedOnDay,
			`${orderLabel} dispatchedOnDay`
		);
		const arrivalOnDay = requireLogisticsNonNegativeSafeInteger(
			order.arrivalOnDay,
			`${orderLabel} arrivalOnDay`
		);
		requireLogisticsNonNegativeSafeInteger(order.transportCost, `${orderLabel} transportCost`);
		if (createdOnDay !== dispatchedOnDay || dispatchedOnDay >= arrivalOnDay) {
			logisticsInvariant(
				`${orderLabel} days must satisfy createdOnDay === dispatchedOnDay < arrivalOnDay`
			);
		}
		const status = requireLogisticsOneOf(order.status, `${orderLabel} status`, [
			'in-transit',
			'delivered'
		] as const);
		if (status === 'in-transit' && arrivalOnDay < game.day) {
			logisticsInvariant(`${orderLabel} in-transit arrivalOnDay must not be before the game day`);
		}
		if (status === 'delivered' && arrivalOnDay >= game.day) {
			logisticsInvariant(`${orderLabel} delivered arrivalOnDay must be before the game day`);
		}
	}

	const routeIds = new Set<string>();
	for (const [index, value] of recurringRoutes.entries()) {
		const routeLabel = `${label} recurringRoutes[${index}]`;
		const route = requireLogisticsRecord(value, routeLabel);
		requireLogisticsExactKeys(
			route,
			[
				'id',
				'originCityId',
				'destinationCityId',
				'materialId',
				'capacity',
				'frequencyDays',
				'leadTimeDays',
				'transportCostPerUnit',
				'priority',
				'state',
				'nextDispatchOnDay'
			],
			routeLabel
		);
		const id = requireCanonicalRouteIdBeforeNextSequence(
			route.id,
			`${routeLabel} id`,
			nextRouteSequence
		);
		if (routeIds.has(id)) logisticsInvariant(`${label} recurringRoutes must have unique IDs`);
		routeIds.add(id);
		const originCityId = resolveLogisticsEndpoint(
			game,
			route.originCityId,
			`${routeLabel} originCityId`
		);
		const destinationCityId = resolveLogisticsEndpoint(
			game,
			route.destinationCityId,
			`${routeLabel} destinationCityId`
		);
		if (originCityId === destinationCityId) {
			logisticsInvariant(`${routeLabel} endpoints must be distinct`);
		}
		const materialId = requireLogisticsString(route.materialId, `${routeLabel} materialId`);
		if (!MATERIAL_ID_SET.has(materialId)) {
			logisticsInvariant(`${routeLabel} materialId must be a known material`);
		}
		requireLogisticsPositiveSafeInteger(route.capacity, `${routeLabel} capacity`);
		requireLogisticsPositiveSafeInteger(route.frequencyDays, `${routeLabel} frequencyDays`);
		requireLogisticsPositiveSafeInteger(route.leadTimeDays, `${routeLabel} leadTimeDays`);
		requireLogisticsPositiveSafeInteger(
			route.transportCostPerUnit,
			`${routeLabel} transportCostPerUnit`
		);
		requireLogisticsNonNegativeSafeInteger(route.priority, `${routeLabel} priority`);
		const state = requireLogisticsOneOf(route.state, `${routeLabel} state`, [
			'active',
			'paused'
		] as const);
		const nextDispatchOnDay = requireLogisticsNonNegativeSafeInteger(
			route.nextDispatchOnDay,
			`${routeLabel} nextDispatchOnDay`
		);
		if (state === 'active' && nextDispatchOnDay < game.day) {
			logisticsInvariant(`${routeLabel} active nextDispatchOnDay must not be before the game day`);
		}
	}
}

function assertNoResidualGlobalWarehouseData(game: Record<string, unknown>): void {
	if (Object.hasOwn(game, 'warehouse')) {
		cityInventoryInvariant('Saved game must not contain residual global warehouse data');
	}
}

function validateSavedCity(value: unknown, label: string): void {
	const city = requireRecord(value, label);

	const cityId = requireString(city.id, `${label} id`);
	requireString(city.name, `${label} name`);
	const width = requirePositiveInteger(city.width, `${label} width`);
	const height = requirePositiveInteger(city.height, `${label} height`);
	const tiles = requireArray(city.tiles, `${label} tiles`).map((tile, index) =>
		validateSavedCityTile(tile, `${label} tiles[${index}]`, cityId, width, height)
	);
	validateCompleteCityTileGrid(tiles, width, height, label);
}

function validateCurrentRetailCitySize(value: unknown, label: string): void {
	const city = value as Record<string, unknown>;
	if (typeof city.id !== 'string') return;
	const definition = getWorldCityDefinition(city.id);
	if (definition?.kind !== 'retail') return;
	if (city.width === DEFAULT_RETAIL_CITY_WIDTH && city.height === DEFAULT_RETAIL_CITY_HEIGHT) {
		return;
	}
	if (city.width === 28 && city.height === 24) {
		throw new SaveDataError(`${label} uses the legacy 28x24 sandbox city size`);
	}
	throw new SaveDataError(
		`${label} must use the default ${DEFAULT_RETAIL_CITY_WIDTH}x${DEFAULT_RETAIL_CITY_HEIGHT} retail city size`
	);
}

interface ValidatedTileIdentity {
	id: string;
	x: number;
	y: number;
}

function validateCompleteCityTileGrid(
	tiles: ValidatedTileIdentity[],
	width: number,
	height: number,
	label: string
): void {
	if (tiles.length !== width * height) {
		throw new SaveDataError(`${label} city tile grid must contain exactly width * height tiles`);
	}
	const tileIds = new Set<string>();
	const coordinateKeys = new Set<string>();
	for (const tile of tiles) {
		if (tileIds.has(tile.id)) throw new SaveDataError(`${label} tile IDs must be unique`);
		tileIds.add(tile.id);
		const key = `${tile.x},${tile.y}`;
		if (coordinateKeys.has(key)) {
			throw new SaveDataError(`${label} tile coordinates must be unique`);
		}
		coordinateKeys.add(key);
	}
}

function validateSavedCityTile(
	value: unknown,
	label: string,
	cityId: string,
	cityWidth: number,
	cityHeight: number
): ValidatedTileIdentity {
	const tile = requireRecord(value, label);

	const id = requireString(tile.id, `${label} id`);
	if (requireString(tile.cityId, `${label} cityId`) !== cityId) {
		throw new SaveDataError(`${label} cityId must match containing city ${cityId}`);
	}
	const x = requireNumber(tile.x, `${label} x`);
	const y = requireNumber(tile.y, `${label} y`);
	validateTileCoordinates(x, y, label, cityWidth, cityHeight);
	requireOneOf(tile.neighborhood, `${label} neighborhood`, NEIGHBORHOOD_IDS);
	requireOneOf(tile.terrain, `${label} terrain`, TERRAIN_IDS);
	validateSavedCityTileFeature(tile, `${label} feature`);
	requireNumber(tile.demand, `${label} demand`);
	requireNumber(tile.rent, `${label} rent`);
	requireNumber(tile.footTraffic, `${label} footTraffic`);
	requireNumber(tile.customerFit, `${label} customerFit`);
	requireBoolean(tile.locked, `${label} locked`);
	return { id, x, y };
}

function validateSavedCityTileFeature(tile: Record<string, unknown>, label: string): void {
	if (tile.feature === null) return;

	if (
		typeof tile.feature !== 'string' ||
		!CITY_TILE_FEATURES.includes(tile.feature as (typeof CITY_TILE_FEATURES)[number])
	) {
		throw new SaveDataError(`${label} must be null, road, or river`);
	}
}

function validateSavedIndustryCity(value: unknown, label: string): void {
	const city = requireRecord(value, label);

	const cityId = requireString(city.id, `${label} id`);
	requireString(city.name, `${label} name`);
	const width = requirePositiveInteger(city.width, `${label} width`);
	const height = requirePositiveInteger(city.height, `${label} height`);
	const tiles = requireArray(city.tiles, `${label} tiles`).map((tile, index) =>
		validateSavedIndustryTile(tile, `${label} tiles[${index}]`, cityId, width, height)
	);
	const tileCoordinateKeys = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
	const seenRailKeys = new Set<string>();
	requireArray(city.rails, `${label} rails`).forEach((cell, index) =>
		validateSavedRailCell(
			cell,
			`${label} rails[${index}]`,
			width,
			height,
			seenRailKeys,
			tileCoordinateKeys
		)
	);
	validateCompleteCityTileGrid(tiles, width, height, label);
}

function validateSavedRailCell(
	value: unknown,
	label: string,
	cityWidth: number,
	cityHeight: number,
	seenKeys: Set<string>,
	tileCoordinateKeys: ReadonlySet<string>
): void {
	const cell = requireRecord(value, label);
	const x = requireNumber(cell.x, `${label} x`);
	const y = requireNumber(cell.y, `${label} y`);
	if (!Number.isInteger(x)) {
		throw new SaveDataError(`${label} x must be an integer`);
	}
	if (!Number.isInteger(y)) {
		throw new SaveDataError(`${label} y must be an integer`);
	}
	if (x < 0 || y < 0 || x >= cityWidth || y >= cityHeight) {
		throw new SaveDataError(`${label} coordinates (${x},${y}) must map to a valid city grid tile`);
	}
	const key = `${x},${y}`;
	if (!tileCoordinateKeys.has(key)) {
		throw new SaveDataError(`${label} rail coordinate ${key} must reference an actual tile`);
	}
	if (seenKeys.has(key)) {
		throw new SaveDataError(`${label} duplicates rail coordinate ${key}`);
	}
	seenKeys.add(key);
	const level = requireNumber(cell.level, `${label} level`);
	if (!Number.isInteger(level) || level < 1 || level > RAIL_MAX_LEVEL) {
		throw new SaveDataError(`${label} level must be an integer between 1 and ${RAIL_MAX_LEVEL}`);
	}
}

function validateSavedIndustryTile(
	value: unknown,
	label: string,
	cityId: string,
	cityWidth: number,
	cityHeight: number
): ValidatedTileIdentity {
	const tile = requireRecord(value, label);

	const id = requireString(tile.id, `${label} id`);
	if (requireString(tile.cityId, `${label} cityId`) !== cityId) {
		throw new SaveDataError(`${label} cityId must match containing city ${cityId}`);
	}
	const x = requireNumber(tile.x, `${label} x`);
	const y = requireNumber(tile.y, `${label} y`);
	validateTileCoordinates(x, y, label, cityWidth, cityHeight);
	requireOneOf(tile.terrain, `${label} terrain`, INDUSTRY_TERRAIN_IDS);
	validateSavedIndustryResource(tile.resource, `${label} resource`);
	requireBoolean(tile.locked, `${label} locked`);
	return { id, x, y };
}

function validateSavedIndustryResource(value: unknown, label: string): void {
	if (value === null) {
		return;
	}

	requireKnownId(value, label, INDUSTRY_RESOURCE_ID_SET, 'industry resource');
}

function validateSavedIndustrialBuilding(value: unknown, label: string): void {
	const building = requireRecord(value, label);

	requireString(building.id, `${label} id`);
	const buildingLevel = requireNumber(building.level, `${label} level`);
	if (!Number.isInteger(buildingLevel) || buildingLevel < 1 || buildingLevel > MAX_BUILDING_LEVEL) {
		throw new SaveDataError(
			`${label} level must be an integer between 1 and ${MAX_BUILDING_LEVEL}`
		);
	}
	requireKnownId(
		building.typeId,
		`${label} typeId`,
		INDUSTRIAL_BUILDING_TYPE_ID_SET,
		'industrial building type'
	);
	requireString(building.cityId, `${label} cityId`);
	requireString(building.tileId, `${label} tileId`);
	requireNumber(building.mapX, `${label} mapX`);
	requireNumber(building.mapY, `${label} mapY`);
	requireOneOf(building.status, `${label} status`, INDUSTRIAL_BUILDING_STATUSES);
	requireArray(building.lastProduction, `${label} lastProduction`).forEach((movement, index) =>
		validateSavedDailyMaterialMovement(movement, `${label} lastProduction[${index}]`, true)
	);
	requireNumber(building.producedTotal, `${label} producedTotal`);
	requireNumber(building.importedInputTotal, `${label} importedInputTotal`);
	requireNumber(building.blockedDays, `${label} blockedDays`);

	const inventory = requireRecord(building.inventory, `${label} inventory`);
	for (const [materialId, quantity] of Object.entries(inventory)) {
		if (!MATERIAL_ID_SET.has(materialId)) {
			throw new SaveDataError(`${label} inventory ${materialId} must be a known material`);
		}

		const inventoryQuantity = requireNumber(quantity, `${label} inventory ${materialId}`);
		if (inventoryQuantity < 0) {
			throw new SaveDataError(`${label} inventory ${materialId} must be at least 0`);
		}
	}
}

function validateSavedDailyMaterialMovement(
	value: unknown,
	label: string,
	requireCityAttribution = false
): void {
	const movement = requireRecord(value, label);

	if (requireCityAttribution) requireString(movement.cityId, `${label} cityId`);
	requireKnownId(movement.materialId, `${label} materialId`, MATERIAL_ID_SET, 'material');
	requireNumber(movement.quantity, `${label} quantity`);
	requireNumber(movement.value, `${label} value`);
	requireOneOf(movement.source, `${label} source`, MATERIAL_MOVEMENT_SOURCES);
}

function validateSavedFinance(value: unknown, gameDay: number, label: string): void {
	const finance = requireRecord(value, label);
	const loans = requireArray(finance.loans, `${label} loans`);
	const transactions = requireArray(finance.transactions, `${label} transactions`);
	const nextLoanSequence = requirePositiveSafeInteger(
		finance.nextLoanSequence,
		`${label} nextLoanSequence`
	);
	const nextTransactionSequence = requirePositiveSafeInteger(
		finance.nextTransactionSequence,
		`${label} nextTransactionSequence`
	);
	validateSavedFinanceDayActivity(
		finance.currentDayActivity,
		gameDay,
		`${label} currentDayActivity`
	);

	const loanIds = new Set<string>();
	const loansById = new Map<
		string,
		{ loan: Record<string, unknown>; purpose: string; status: string }
	>();
	let highestLoanSequence = 0;
	// Loans are intentionally append-only: closed (paid/refinanced) instruments
	// are retained for lifetime repayment history and are never pruned at runtime.
	// Only `transactions` are bounded by FINANCE_TRANSACTION_LIMIT, so the loan
	// collection must not be capped here — doing so would make a valid in-memory
	// state (e.g. the 201st lifetime loan) impossible to save.
	loans.forEach((value, index) => {
		const loan = requireRecord(value, `${label} loans[${index}]`);
		const id = requireString(loan.id, `${label} loans[${index}] id`);
		if (loanIds.has(id)) throw new SaveDataError(`${label} loans must have unique IDs`);
		loanIds.add(id);
		highestLoanSequence = Math.max(highestLoanSequence, generatedIdSequence(id, 'loan-'));
		const purpose = requireOneOf(loan.purpose, `${label} loans[${index}] purpose`, [
			'founding',
			'workingCapital',
			'emergency',
			'supplierCredit',
			'expansion',
			'refinance'
		] as const);
		const status = requireOneOf(loan.status, `${label} loans[${index}] status`, [
			'active',
			'delinquent',
			'paid',
			'refinanced'
		] as const);
		loansById.set(id, { loan, purpose, status });
		const openedOnDay = requireNonNegativeInteger(
			loan.openedOnDay,
			`${label} loans[${index}] openedOnDay`
		);
		if (openedOnDay > gameDay)
			throw new SaveDataError(
				`${label} loans[${index}] openedOnDay must not be after the game day`
			);
		const originalPrincipal = requireNonNegativeInteger(
			loan.originalPrincipal,
			`${label} loans[${index}] originalPrincipal`
		);
		if (originalPrincipal === 0)
			throw new SaveDataError(`${label} loans[${index}] originalPrincipal must be positive`);
		const remainingPrincipal = requireNonNegativeInteger(
			loan.remainingPrincipal,
			`${label} loans[${index}] remainingPrincipal`
		);
		if (remainingPrincipal > originalPrincipal)
			throw new SaveDataError(
				`${label} loans[${index}] remainingPrincipal must not exceed originalPrincipal`
			);
		requireNonNegativeInteger(
			loan.annualInterestRateBps,
			`${label} loans[${index}] annualInterestRateBps`
		);
		if (loan.termDays !== 28 && loan.termDays !== 56 && loan.termDays !== 84) {
			throw new SaveDataError(`${label} loans[${index}] termDays must be 28, 56, or 84`);
		}
		const installmentCount = getInstallmentCount(loan.termDays);
		const installmentsProcessed = requireNonNegativeInteger(
			loan.installmentsProcessed,
			`${label} loans[${index}] installmentsProcessed`
		);
		if (installmentsProcessed > installmentCount)
			throw new SaveDataError(`${label} loans[${index}] installmentsProcessed exceeds its term`);
		const nextPaymentDay =
			loan.nextPaymentDay === null
				? null
				: requireNonNegativeInteger(loan.nextPaymentDay, `${label} loans[${index}] nextPaymentDay`);
		const lastInterestAccrualDay = requireNonNegativeInteger(
			loan.lastInterestAccrualDay,
			`${label} loans[${index}] lastInterestAccrualDay`
		);
		if (lastInterestAccrualDay < openedOnDay || lastInterestAccrualDay > gameDay)
			throw new SaveDataError(
				`${label} loans[${index}] lastInterestAccrualDay must be between openedOnDay and game day`
			);
		const accruedInterestMicros = requireNonNegativeInteger(
			loan.accruedInterestMicros,
			`${label} loans[${index}] accruedInterestMicros`
		);
		const overdueInterest = requireNonNegativeInteger(
			loan.overdueInterest,
			`${label} loans[${index}] overdueInterest`
		);
		const overduePrincipal = requireNonNegativeInteger(
			loan.overduePrincipal,
			`${label} loans[${index}] overduePrincipal`
		);
		if (overduePrincipal > remainingPrincipal)
			throw new SaveDataError(
				`${label} loans[${index}] overduePrincipal must not exceed remainingPrincipal`
			);
		const arrearsSinceDay =
			loan.arrearsSinceDay === null
				? null
				: requireNonNegativeInteger(
						loan.arrearsSinceDay,
						`${label} loans[${index}] arrearsSinceDay`
					);
		if (arrearsSinceDay !== null && (arrearsSinceDay < openedOnDay || arrearsSinceDay > gameDay))
			throw new SaveDataError(
				`${label} loans[${index}] arrearsSinceDay must be between openedOnDay and game day`
			);
		const scheduledPaymentCount = requireNonNegativeInteger(
			loan.scheduledPaymentCount,
			`${label} loans[${index}] scheduledPaymentCount`
		);
		const onTimePaymentCount = requireNonNegativeInteger(
			loan.onTimePaymentCount,
			`${label} loans[${index}] onTimePaymentCount`
		);
		const missedPaymentCount = requireNonNegativeInteger(
			loan.missedPaymentCount,
			`${label} loans[${index}] missedPaymentCount`
		);
		if (
			scheduledPaymentCount > installmentsProcessed ||
			onTimePaymentCount + missedPaymentCount !== scheduledPaymentCount
		)
			throw new SaveDataError(
				`${label} loans[${index}] payment counters must reconcile with installmentsProcessed`
			);
		const hasArrears =
			overdueInterest > 0 ||
			overduePrincipal > 0 ||
			(nextPaymentDay === null && accruedInterestMicros > 0);
		const expectedNextPaymentDay =
			installmentsProcessed === installmentCount
				? null
				: openedOnDay + (installmentsProcessed + 1) * 7;
		if (
			(status === 'active' || status === 'delinquent') &&
			nextPaymentDay !== expectedNextPaymentDay
		)
			throw new SaveDataError(
				`${label} loans[${index}] nextPaymentDay must match its installment schedule`
			);
		if (
			(status === 'active' || status === 'delinquent') &&
			nextPaymentDay !== null &&
			nextPaymentDay < gameDay
		)
			throw new SaveDataError(
				`${label} loans[${index}] nextPaymentDay must not be before the game day`
			);
		if (status === 'active' && (hasArrears || arrearsSinceDay !== null || nextPaymentDay === null))
			throw new SaveDataError(
				`${label} loans[${index}] active loan must have no arrears and a next payment`
			);
		if (status === 'delinquent' && (!hasArrears || arrearsSinceDay === null))
			throw new SaveDataError(
				`${label} loans[${index}] delinquent loan must have arrears and arrearsSinceDay`
			);
		if (
			(status === 'paid' || status === 'refinanced') &&
			(remainingPrincipal !== 0 ||
				accruedInterestMicros !== 0 ||
				overdueInterest !== 0 ||
				overduePrincipal !== 0 ||
				arrearsSinceDay !== null ||
				nextPaymentDay !== null)
		)
			throw new SaveDataError(
				`${label} loans[${index}] closed loan must not retain a balance, interest, arrears, or next payment`
			);
		if (purpose === 'refinance' && loan.refinancedFromLoanId === undefined)
			throw new SaveDataError(
				`${label} loans[${index}] refinance loan must retain its source link`
			);
		if (status === 'refinanced' && loan.refinancedByLoanId === undefined)
			throw new SaveDataError(
				`${label} loans[${index}] refinanced loan must retain its replacement link`
			);
		// Reverse constraints: a source link is only valid on a refinance-purpose
		// loan, and a replacement link is only valid on a refinanced-status loan.
		// Without these, an active source could carry refinancedByLoanId and a
		// non-refinance replacement could carry refinancedFromLoanId, forming a
		// symmetric graph where both instruments remain outstanding.
		if (loan.refinancedFromLoanId !== undefined && purpose !== 'refinance')
			throw new SaveDataError(
				`${label} loans[${index}] refinancedFromLoanId is only valid on a refinance-purpose loan`
			);
		if (loan.refinancedByLoanId !== undefined && status !== 'refinanced')
			throw new SaveDataError(
				`${label} loans[${index}] refinancedByLoanId is only valid on a refinanced-status loan`
			);
		if (loan.refinancedFromLoanId !== undefined) {
			requireString(loan.refinancedFromLoanId, `${label} loans[${index}] refinancedFromLoanId`);
		}
		if (loan.refinancedByLoanId !== undefined) {
			requireString(loan.refinancedByLoanId, `${label} loans[${index}] refinancedByLoanId`);
		}
	});
	if (nextLoanSequence <= highestLoanSequence) {
		throw new SaveDataError(`${label} nextLoanSequence must exceed generated loan IDs`);
	}

	const transactionIds = new Set<string>();
	let highestTransactionSequence = 0;
	let previousDay = -1;
	if (transactions.length > FINANCE_TRANSACTION_LIMIT)
		throw new SaveDataError(
			`${label} transactions must not exceed ${FINANCE_TRANSACTION_LIMIT} entries`
		);
	transactions.forEach((value, index) => {
		const transaction = requireRecord(value, `${label} transactions[${index}]`);
		const id = requireString(transaction.id, `${label} transactions[${index}] id`);
		if (transactionIds.has(id))
			throw new SaveDataError(`${label} transactions must have unique IDs`);
		transactionIds.add(id);
		highestTransactionSequence = Math.max(
			highestTransactionSequence,
			generatedIdSequence(id, 'finance-transaction-')
		);
		const day = requireNonNegativeInteger(transaction.day, `${label} transactions[${index}] day`);
		if (day > gameDay || day < previousDay)
			throw new SaveDataError(
				`${label} transactions must be ordered by day within the game timeline`
			);
		previousDay = day;
		requireOneOf(transaction.kind, `${label} transactions[${index}] kind`, [
			'disbursement',
			'principalPayment',
			'interestPayment',
			'missedPayment',
			'refinance'
		] as const);
		const loanId = requireString(transaction.loanId, `${label} transactions[${index}] loanId`);
		if (!loanIds.has(loanId))
			throw new SaveDataError(`${label} transactions[${index}] loanId must reference a known loan`);
		if (transaction.relatedLoanId !== undefined) {
			const relatedLoanId = requireString(
				transaction.relatedLoanId,
				`${label} transactions[${index}] relatedLoanId`
			);
			if (!loanIds.has(relatedLoanId))
				throw new SaveDataError(
					`${label} transactions[${index}] relatedLoanId must reference a known loan`
				);
		}
		requireInteger(transaction.cashDelta, `${label} transactions[${index}] cashDelta`);
		requireNonNegativeInteger(
			transaction.principalAmount,
			`${label} transactions[${index}] principalAmount`
		);
		requireInteger(transaction.principalDelta, `${label} transactions[${index}] principalDelta`);
		requireNonNegativeInteger(
			transaction.interestAmount,
			`${label} transactions[${index}] interestAmount`
		);
	});
	if (nextTransactionSequence <= highestTransactionSequence) {
		throw new SaveDataError(
			`${label} nextTransactionSequence must exceed generated transaction IDs`
		);
	}

	for (const [loanId, entry] of loansById) {
		const loan = entry.loan;
		const from = loan.refinancedFromLoanId;
		const by = loan.refinancedByLoanId;
		if (from !== undefined) {
			const source = loansById.get(from as string);
			if (
				!source ||
				source.loan.refinancedByLoanId !== loanId ||
				from === loanId ||
				source.status !== 'refinanced'
			)
				throw new SaveDataError(`${label} refinance links must be symmetric and non-cyclic`);
		}
		if (by !== undefined) {
			const replacement = loansById.get(by as string);
			if (
				!replacement ||
				replacement.loan.refinancedFromLoanId !== loanId ||
				by === loanId ||
				replacement.purpose !== 'refinance'
			)
				throw new SaveDataError(`${label} refinance links must be symmetric and non-cyclic`);
		}
	}
	// Cycle detection over the refinancedByLoanId links. Each loan has at most
	// one outgoing refinancedByLoanId edge, so the graph is functional: every
	// chain either terminates or cycles. A naive per-node traversal is quadratic
	// for a long valid linear chain (N refinances -> ~N^2/2 lookups), and loans
	// are now retained unbounded, so use a single-pass tri-colour walk: each loan
	// and link is visited at most once.
	const cycleState = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 in progress, 2 done
	for (const startId of loansById.keys()) {
		if (cycleState.get(startId) === 2) continue;
		const path: string[] = [];
		let currentLoanId: string | undefined = startId;
		while (currentLoanId !== undefined && cycleState.get(currentLoanId) !== 2) {
			if (cycleState.get(currentLoanId) === 1) {
				throw new SaveDataError(`${label} refinance links must not form a cycle`);
			}
			cycleState.set(currentLoanId, 1);
			path.push(currentLoanId);
			currentLoanId = loansById.get(currentLoanId)?.loan.refinancedByLoanId as string | undefined;
		}
		for (const id of path) cycleState.set(id, 2);
	}
}

function validateSavedFinanceDayActivity(value: unknown, gameDay: number, label: string): void {
	const activity = requireRecord(value, label);
	if (requireNonNegativeInteger(activity.day, `${label} day`) !== gameDay)
		throw new SaveDataError(`${label} day must equal the game day`);
	const principalBorrowed = requireNonNegativeInteger(
		activity.principalBorrowed,
		`${label} principalBorrowed`
	);
	const principalRepaid = requireNonNegativeInteger(
		activity.principalRepaid,
		`${label} principalRepaid`
	);
	const interestPaid = requireNonNegativeInteger(activity.interestPaid, `${label} interestPaid`);
	requireNonNegativeInteger(activity.interestCapitalized, `${label} interestCapitalized`);
	requireNonNegativeInteger(activity.refinancedPrincipal, `${label} refinancedPrincipal`);
	const financingCashFlow = requireInteger(
		activity.financingCashFlow,
		`${label} financingCashFlow`
	);
	if (financingCashFlow !== principalBorrowed - principalRepaid - interestPaid)
		throw new SaveDataError(`${label} financingCashFlow must reconcile with cash transactions`);
}

function validateSavedStore(value: unknown, label: string): void {
	const store = requireRecord(value, label);

	requireString(store.id, `${label} id`);
	const storeLevel = requireNumber(store.level, `${label} level`);
	if (!Number.isInteger(storeLevel) || storeLevel < 1 || storeLevel > MAX_STORE_LEVEL) {
		throw new SaveDataError(`${label} level must be an integer between 1 and ${MAX_STORE_LEVEL}`);
	}
	requireStringAllowEmpty(store.name, `${label} name`);
	requireOneOf(store.archetypeId, `${label} archetypeId`, ARCHETYPE_IDS);
	validateStoreLocation(store.location, `${label} location`);
	requireString(store.cityId, `${label} cityId`);
	requireString(store.tileId, `${label} tileId`);
	requireNumber(store.mapX, `${label} mapX`);
	requireNumber(store.mapY, `${label} mapY`);
	requireNumber(store.daysOpen, `${label} daysOpen`);
	requireNumber(store.reputation, `${label} reputation`);
	const stockHealth = requireNumber(store.stockHealth, `${label} stockHealth`);
	const products = validateSavedStoreProducts(store, label);
	if (stockHealth !== calculateStockHealth(products)) {
		throw new SaveDataError(
			`${label} stockHealth must match its products`,
			'invariant-stock-health'
		);
	}
	requireNumber(store.staffMorale, `${label} staffMorale`);
	requireNumber(store.staffCapacity, `${label} staffCapacity`);
	requireNumber(store.localDemand, `${label} localDemand`);
	requireNumber(store.competition, `${label} competition`);
	requireNumber(store.managerQuality, `${label} managerQuality`);
}

function validateSavedHiringCandidate(value: unknown, label: string): void {
	const candidate = requireRecord(value, label);

	requireString(candidate.id, `${label} id`);
	requireString(candidate.name, `${label} name`);
	requireOneOf(candidate.role, `${label} role`, STAFF_ROLES);
	requireNumber(candidate.monthlySalary, `${label} monthlySalary`);
	requireNumber(candidate.skill, `${label} skill`);
	requireNumber(candidate.morale, `${label} morale`);
}

function validateSavedStaffMember(value: unknown, label: string): void {
	const member = requireRecord(value, label);

	validateSavedHiringCandidate(member, label);
	if (member.assignedStoreId !== null) {
		requireString(member.assignedStoreId, `${label} assignedStoreId`);
	}
	requireNumber(member.hiredOnDay, `${label} hiredOnDay`);
	const level = requireNumber(member.level, `${label} level`);
	if (!Number.isInteger(level) || level < 1 || level > MAX_STAFF_LEVEL) {
		throw new SaveDataError(`${label} level must be an integer between 1 and ${MAX_STAFF_LEVEL}`);
	}
	const xp = requireNumber(member.xp, `${label} xp`);
	if (xp < 0) {
		throw new SaveDataError(`${label} xp must be at least 0`);
	}
}

function requireIndustrialBuildingTypeId(value: unknown, label: string): IndustrialBuildingTypeId {
	const id = requireString(value, label);
	if (!INDUSTRIAL_BUILDING_TYPE_ID_SET.has(id)) {
		throw new SaveDataError(`${label} must be a known industrial building type id: ${id}`);
	}
	return id as IndustrialBuildingTypeId;
}

function requireIndustryResourceId(value: unknown, label: string): string {
	const id = requireString(value, label);
	if (!INDUSTRY_RESOURCE_ID_SET.has(id)) {
		throw new SaveDataError(`${label} must be a known industry resource id: ${id}`);
	}
	return id;
}

function validateSavedDecisionContext(value: unknown, label: string): DecisionContext {
	const ctx = requireRecord(value, `${label} context`);
	const code = requireString(ctx.code, `${label} context code`);
	switch (code) {
		case 'expansionUnavailable':
			return { code, storeCap: requireNumber(ctx.storeCap, `${label} context storeCap`) };
		case 'expansionCashBlocked':
			return { code, cash: requireNumber(ctx.cash, `${label} context cash`) };
		case 'locationBlocked':
			requireString(ctx.reason, `${label} context reason`);
			if (ctx.reason !== 'locked' && ctx.reason !== 'road' && ctx.reason !== 'river') {
				throw new SaveDataError(`${label} context reason must be locked|road|river`);
			}
			return { code, reason: ctx.reason };
		case 'locationGeneric':
			return { code };
		case 'worldCityOpeningCost':
			return { code, cash: requireNumber(ctx.cash, `${label} context cash`) };
		case 'worldCityUnknown':
			return { code };
		case 'worldCityNotAvailableYet': {
			const cityId = requireString(ctx.cityId, `${label} context cityId`);
			if (!isWorldCityId(cityId)) {
				throw new SaveDataError(`${label} context cityId must be a known WorldCityId: ${cityId}`);
			}
			return { code, cityId };
		}
		case 'industrialUnknownTile':
			return { code };
		case 'industrialUnknownBuilding':
			return { code };
		case 'industrialLockedTile':
			return { code };
		case 'industrialOccupiedTile':
			return { code };
		case 'industrialRequiresResource':
			return {
				code,
				resourceId: requireIndustryResourceId(ctx.resourceId, `${label} context resourceId`)
			};
		case 'industrialRequiresIndustrialTile':
			return { code };
		case 'industrialRequiresCash':
			return {
				code,
				buildingTypeId: requireIndustrialBuildingTypeId(
					ctx.buildingTypeId,
					`${label} context buildingTypeId`
				),
				cash: requireNumber(ctx.cash, `${label} context cash`)
			};
		case 'cashPressure':
			return { code };
		case 'expansionOpportunity':
			return { code };
		case 'supplierTerms':
			return { code };
		case 'railUnknownBuilding':
			return { code };
		case 'railCrossCity':
			return { code };
		case 'railSelfConnected':
			return { code };
		case 'railNoValidPath':
			return { code };
		case 'railAlreadyConnected':
			return { code };
		case 'railRequiresCash':
			return {
				code,
				cost: requireNumber(ctx.cost, `${label} context cost`),
				cash: requireNumber(ctx.cash, `${label} context cash`)
			};
		case 'railSegmentAtMaxLevel':
			return { code };
		case 'railUnknownSegment':
			return { code };
		case 'industrialTileHasRail':
			return { code };
		default:
			throw new SaveDataError(`${label} context code must be a known decision context code`);
	}
}

function validateSavedDecision(value: unknown, gameDay: number, label: string): string {
	return withEventInvariant(() => {
		const decision = requireRecord(value, label);
		const kind = requireOneOf(decision.kind, `${label} kind`, ['system', 'event'] as const);
		const id = requireString(decision.id, `${label} id`);
		const expiresOnDay = requireNonNegativeInteger(decision.expiresOnDay, `${label} expiresOnDay`);
		if (expiresOnDay < gameDay) {
			throw new SaveDataError(`${label} expiresOnDay must not be before the game day`);
		}

		if (kind === 'system') {
			requireExactKeys(
				decision,
				['kind', 'id', 'title', 'context', 'expiresOnDay', 'options'],
				label
			);
			requireString(decision.title, `${label} title`);
			validateSavedDecisionContext(decision.context, label);
			validateUniqueArrayIds(
				requireArray(decision.options, `${label} options`),
				`${label} options`,
				validateSavedSystemDecisionOption
			);
			return id;
		}

		requireExactKeys(
			decision,
			[
				'kind',
				'id',
				'eventId',
				'definitionVersion',
				'generatedOnDay',
				'expiresOnDay',
				'target',
				'copy',
				'options'
			],
			label
		);
		requireGeneratedId(id, 'event-instance-', `${label} id`);
		requireString(decision.eventId, `${label} eventId`);
		requirePositiveSafeInteger(decision.definitionVersion, `${label} definitionVersion`);
		const generatedOnDay = requireNonNegativeInteger(
			decision.generatedOnDay,
			`${label} generatedOnDay`
		);
		if (generatedOnDay > gameDay) {
			throw new SaveDataError(`${label} generatedOnDay must not be after the game day`);
		}
		if (expiresOnDay <= generatedOnDay) {
			throw new SaveDataError(`${label} expiresOnDay must be after generatedOnDay`);
		}
		validateCompanyTarget(decision.target, `${label} target`);
		validateStructuredCopyRef(decision.copy, `${label} copy`);
		validateUniqueArrayIds(
			requireArray(decision.options, `${label} options`),
			`${label} options`,
			validateSavedEventDecisionOption
		);
		return id;
	});
}

function validateSavedSystemDecisionOption(value: unknown, label: string): string {
	const option = requireRecord(value, label);
	requireExactKeys(option, ['id', 'label', 'description'], label);
	const id = requireString(option.id, `${label} id`);
	requireString(option.label, `${label} label`);
	requireString(option.description, `${label} description`);
	return id;
}

function validateSavedEventDecisionOption(value: unknown, label: string): string {
	const option = requireRecord(value, label);
	requireExactKeys(option, ['id', 'effects', 'modifiers'], label);
	const id = requireString(option.id, `${label} id`);
	const effects = requireArray(option.effects, `${label} effects`);
	let financeEffectCount = 0;
	let hasCashAdjustment = false;
	for (const [index, effect] of effects.entries()) {
		const effectKind = validateSavedEventImmediateEffect(effect, `${label} effects[${index}]`);
		if (effectKind === 'finance-borrow') financeEffectCount += 1;
		if (effectKind === 'cash-adjust') hasCashAdjustment = true;
	}
	if (financeEffectCount > 1) {
		throw new SaveDataError(`${label} effects must contain at most one finance-borrow effect`);
	}
	if (financeEffectCount > 0 && hasCashAdjustment) {
		throw new SaveDataError(`${label} effects must not combine cash-adjust and finance-borrow`);
	}
	requireArray(option.modifiers, `${label} modifiers`).forEach((modifier, index) =>
		validateSavedModifierTemplate(modifier, `${label} modifiers[${index}]`)
	);
	return id;
}

function validateSavedEventImmediateEffect(value: unknown, label: string): string {
	const effect = requireRecord(value, label);
	const kind = requireOneOf(effect.kind, `${label} kind`, [
		'cash-adjust',
		'score-adjust',
		'store-morale-adjust',
		'store-stock-adjust-by-target-percent',
		'finance-borrow'
	] as const);

	switch (kind) {
		case 'cash-adjust':
			requireExactKeys(effect, ['kind', 'amount'], label);
			requireNumber(effect.amount, `${label} amount`);
			break;
		case 'score-adjust':
			requireExactKeys(effect, ['kind', 'score', 'amount'], label);
			requireOneOf(effect.score, `${label} score`, SCORE_KEYS);
			requireNumber(effect.amount, `${label} amount`);
			break;
		case 'store-morale-adjust':
			requireExactKeys(effect, ['kind', 'scope', 'amount'], label);
			requireOneOf(effect.scope, `${label} scope`, ['all-stores'] as const);
			requireNumber(effect.amount, `${label} amount`);
			break;
		case 'store-stock-adjust-by-target-percent':
			requireExactKeys(effect, ['kind', 'scope', 'percent'], label);
			requireOneOf(effect.scope, `${label} scope`, ['all-stores'] as const);
			requireNumber(effect.percent, `${label} percent`);
			break;
		case 'finance-borrow':
			requireExactKeys(effect, ['kind', 'purpose', 'amount', 'termDays'], label);
			validateSavedBorrowTerms(effect, label);
			break;
	}
	return kind;
}

function validateSavedBorrowTerms(value: Record<string, unknown>, label: string): void {
	const purpose = requireOneOf(value.purpose, `${label} purpose`, [
		'emergency',
		'supplierCredit'
	] as const);
	const amount = requireNumber(value.amount, `${label} amount`);
	if (!Number.isSafeInteger(amount) || amount <= 0) {
		throw new SaveDataError(`${label} amount must be a positive safe whole-dollar amount`);
	}
	const termDays = requireNumber(value.termDays, `${label} termDays`);
	if (
		(purpose === 'emergency' && termDays !== 56) ||
		(purpose === 'supplierCredit' && termDays !== 28)
	) {
		throw new SaveDataError(`${label} purpose and termDays must be a supported pair`);
	}
}

function validateSavedModifierTemplate(value: unknown, label: string): void {
	const modifier = requireRecord(value, label);
	requireExactKeys(
		modifier,
		['durationDays', 'stackingKey', 'stackingRule', 'effect', 'explanation', 'importance'],
		label
	);
	requirePositiveSafeInteger(modifier.durationDays, `${label} durationDays`);
	requireString(modifier.stackingKey, `${label} stackingKey`);
	requireOneOf(modifier.stackingRule, `${label} stackingRule`, ['replace'] as const);
	validateSavedTimedEffect(modifier.effect, `${label} effect`);
	validateStructuredCopyRef(modifier.explanation, `${label} explanation`);
	requireOneOf(modifier.importance, `${label} importance`, ['normal', 'important'] as const);
}

function validateSavedTimedEffect(value: unknown, label: string): void {
	const effect = requireRecord(value, label);
	requireExactKeys(effect, ['kind', 'scope', 'target', 'multiplier'], label);
	requireOneOf(effect.kind, `${label} kind`, ['import-cost-multiplier'] as const);
	requireOneOf(effect.scope, `${label} scope`, ['retail-product'] as const);
	const target = requireRecord(effect.target, `${label} target`);
	requireExactKeys(target, ['kind'], `${label} target`);
	requireOneOf(target.kind, `${label} target kind`, ['all'] as const);
	const multiplier = requireNumber(effect.multiplier, `${label} multiplier`);
	if (multiplier <= 0) throw new SaveDataError(`${label} multiplier must be positive`);
}

function validateStructuredCopyRef(value: unknown, label: string): void {
	const copy = requireRecord(value, label);
	requireExactKeys(copy, ['key', 'params'], label);
	requireString(copy.key, `${label} key`);
	const params = requireRecord(copy.params, `${label} params`);
	for (const [key, parameter] of Object.entries(params)) {
		if (
			typeof parameter !== 'string' &&
			(typeof parameter !== 'number' || !Number.isFinite(parameter))
		) {
			throw new SaveDataError(`${label} params ${key} must be a string or finite number`);
		}
	}
}

function validateCompanyTarget(value: unknown, label: string): void {
	const target = requireRecord(value, label);
	requireExactKeys(target, ['kind'], label);
	requireOneOf(target.kind, `${label} kind`, ['company'] as const);
}

function validateSavedEventRuntime(
	value: unknown,
	gameDay: number,
	decisions: unknown[],
	reports: unknown[],
	label: string
): void {
	withEventInvariant(() => {
		const events = requireRecord(value, label);
		requireExactKeys(
			events,
			[
				'selectionSchemaVersion',
				'rngState',
				'nextInstanceSequence',
				'nextModifierSequence',
				'cooldowns',
				'activeModifiers',
				'history'
			],
			label
		);
		if (events.selectionSchemaVersion !== EVENT_SELECTION_SCHEMA_VERSION) {
			throw new SaveDataError(
				`${label} selectionSchemaVersion must be ${EVENT_SELECTION_SCHEMA_VERSION}`
			);
		}
		const rngState = requirePositiveSafeInteger(events.rngState, `${label} rngState`);
		if (rngState >= 2_147_483_647) {
			throw new SaveDataError(`${label} rngState must be a normalized event RNG state`);
		}
		const nextInstanceSequence = requirePositiveSafeInteger(
			events.nextInstanceSequence,
			`${label} nextInstanceSequence`
		);
		const nextModifierSequence = requirePositiveSafeInteger(
			events.nextModifierSequence,
			`${label} nextModifierSequence`
		);

		const cooldownKeys = new Set<string>();
		requireArray(events.cooldowns, `${label} cooldowns`).forEach((cooldownValue, index) => {
			const cooldownLabel = `${label} cooldowns[${index}]`;
			const cooldown = requireRecord(cooldownValue, cooldownLabel);
			requireExactKeys(
				cooldown,
				['eventId', 'target', 'generatedOnDay', 'eligibleOnDay'],
				cooldownLabel
			);
			const eventId = requireString(cooldown.eventId, `${cooldownLabel} eventId`);
			validateCompanyTarget(cooldown.target, `${cooldownLabel} target`);
			const generatedOnDay = requireNonNegativeInteger(
				cooldown.generatedOnDay,
				`${cooldownLabel} generatedOnDay`
			);
			const eligibleOnDay = requireNonNegativeInteger(
				cooldown.eligibleOnDay,
				`${cooldownLabel} eligibleOnDay`
			);
			if (generatedOnDay > gameDay) {
				throw new SaveDataError(`${cooldownLabel} generatedOnDay must not be after the game day`);
			}
			if (eligibleOnDay <= generatedOnDay) {
				throw new SaveDataError(`${cooldownLabel} eligibleOnDay must be after generatedOnDay`);
			}
			const key = `${eventId}:company`;
			if (cooldownKeys.has(key)) {
				throw new SaveDataError(`${cooldownLabel} must have a unique event/target key: ${key}`);
			}
			cooldownKeys.add(key);
		});

		let highestInstanceSequence = 0;
		let highestModifierSequence = 0;
		for (const decisionValue of decisions) {
			const decision = requireRecord(decisionValue, `${label} decision sequence evidence`);
			if (decision.kind === 'event') {
				highestInstanceSequence = Math.max(
					highestInstanceSequence,
					requireGeneratedId(decision.id, 'event-instance-', `${label} decision id`)
				);
			}
		}

		const activeModifierIds = new Set<string>();
		const activeStackingKeys = new Set<string>();
		requireArray(events.activeModifiers, `${label} activeModifiers`).forEach(
			(modifierValue, index) => {
				const modifierLabel = `${label} activeModifiers[${index}]`;
				const modifier = validateSavedActiveModifier(modifierValue, gameDay, modifierLabel);
				if (activeModifierIds.has(modifier.id)) {
					throw new SaveDataError(`${modifierLabel} id must be unique: ${modifier.id}`);
				}
				if (activeStackingKeys.has(modifier.stackingKey)) {
					throw new SaveDataError(
						`${modifierLabel} stackingKey must be unique among active modifiers: ${modifier.stackingKey}`
					);
				}
				activeModifierIds.add(modifier.id);
				activeStackingKeys.add(modifier.stackingKey);
				highestInstanceSequence = Math.max(
					highestInstanceSequence,
					requireGeneratedId(
						modifier.instanceId,
						'event-instance-',
						`${modifierLabel} source instanceId`
					)
				);
				highestModifierSequence = Math.max(
					highestModifierSequence,
					requireGeneratedId(modifier.id, 'event-modifier-', `${modifierLabel} id`)
				);
			}
		);

		const history = requireArray(events.history, `${label} history`);
		if (history.length > EVENT_HISTORY_LIMIT) {
			throw new SaveDataError(
				`${label} history must contain at most ${EVENT_HISTORY_LIMIT} entries`
			);
		}
		let previousHistoryDay = -1;
		for (const [index, entryValue] of history.entries()) {
			const entryLabel = `${label} history[${index}]`;
			const evidence = validateSavedEventHistoryEntry(entryValue, gameDay, entryLabel);
			if (evidence.day < previousHistoryDay) {
				throw new SaveDataError(`${entryLabel} day must not be before the previous history day`);
			}
			previousHistoryDay = evidence.day;
			highestInstanceSequence = Math.max(highestInstanceSequence, evidence.instanceSequence);
			highestModifierSequence = Math.max(highestModifierSequence, evidence.modifierSequence);
		}

		for (const [reportIndex, reportValue] of reports.entries()) {
			const report = requireRecord(
				reportValue,
				`${label} report sequence evidence[${reportIndex}]`
			);
			for (const impactValue of requireArray(
				report.modifierImpacts,
				`${label} report sequence evidence[${reportIndex}] modifierImpacts`
			)) {
				const impact = requireRecord(
					impactValue,
					`${label} report modifier impact sequence evidence`
				);
				highestModifierSequence = Math.max(
					highestModifierSequence,
					requireGeneratedId(impact.modifierId, 'event-modifier-', `${label} report modifierId`)
				);
				const source = requireRecord(impact.source, `${label} report modifier source`);
				highestInstanceSequence = Math.max(
					highestInstanceSequence,
					requireGeneratedId(
						source.instanceId,
						'event-instance-',
						`${label} report modifier source instanceId`
					)
				);
			}
			for (const lifecycleValue of requireArray(
				report.modifierLifecycle,
				`${label} report sequence evidence[${reportIndex}] modifierLifecycle`
			)) {
				const lifecycle = requireRecord(
					lifecycleValue,
					`${label} report modifier lifecycle evidence`
				);
				const modifier = requireRecord(
					lifecycle.modifier,
					`${label} report modifier lifecycle evidence modifier`
				);
				highestModifierSequence = Math.max(
					highestModifierSequence,
					requireGeneratedId(
						modifier.id,
						'event-modifier-',
						`${label} report lifecycle modifier id`
					)
				);
				const source = requireRecord(
					modifier.source,
					`${label} report modifier lifecycle evidence source`
				);
				highestInstanceSequence = Math.max(
					highestInstanceSequence,
					requireGeneratedId(
						source.instanceId,
						'event-instance-',
						`${label} report lifecycle source instanceId`
					)
				);
				if (Object.hasOwn(lifecycle, 'replacedByModifierId')) {
					highestModifierSequence = Math.max(
						highestModifierSequence,
						requireGeneratedId(
							lifecycle.replacedByModifierId,
							'event-modifier-',
							`${label} report lifecycle replacedByModifierId`
						)
					);
				}
			}
		}

		if (nextInstanceSequence <= highestInstanceSequence) {
			throw new SaveDataError(
				`${label} nextInstanceSequence must exceed every persisted event-instance sequence`
			);
		}
		if (nextModifierSequence <= highestModifierSequence) {
			throw new SaveDataError(
				`${label} nextModifierSequence must exceed every persisted event-modifier sequence`
			);
		}
	});
}

function validateSavedActiveModifier(
	value: unknown,
	gameDay: number,
	label: string
): { id: string; instanceId: string; stackingKey: string } {
	const modifier = requireRecord(value, label);
	requireExactKeys(
		modifier,
		[
			'id',
			'source',
			'target',
			'startsOnDay',
			'expiresOnDay',
			'stackingKey',
			'stackingRule',
			'effect',
			'explanation',
			'importance'
		],
		label
	);
	const base = validateSavedModifierFields(modifier, label);
	requireOneOf(modifier.stackingRule, `${label} stackingRule`, ['replace'] as const);
	if (!(base.startsOnDay <= gameDay && gameDay < base.expiresOnDay)) {
		throw new SaveDataError(`${label} must be active on the current game day ${gameDay}`);
	}
	return { id: base.id, instanceId: base.instanceId, stackingKey: base.stackingKey };
}

function validateSavedModifierSnapshot(
	value: unknown,
	label: string
): { id: string; instanceId: string; startsOnDay: number; expiresOnDay: number } {
	const modifier = requireRecord(value, label);
	requireExactKeys(
		modifier,
		[
			'id',
			'source',
			'target',
			'startsOnDay',
			'expiresOnDay',
			'stackingKey',
			'effect',
			'explanation',
			'importance'
		],
		label
	);
	return validateSavedModifierFields(modifier, label);
}

function validateSavedModifierFields(
	modifier: Record<string, unknown>,
	label: string
): {
	id: string;
	instanceId: string;
	stackingKey: string;
	startsOnDay: number;
	expiresOnDay: number;
} {
	const id = requireString(modifier.id, `${label} id`);
	requireGeneratedId(id, 'event-modifier-', `${label} id`);
	const source = validateSavedModifierSource(modifier.source, `${label} source`);
	validateCompanyTarget(modifier.target, `${label} target`);
	const startsOnDay = requireNonNegativeInteger(modifier.startsOnDay, `${label} startsOnDay`);
	const expiresOnDay = requireNonNegativeInteger(modifier.expiresOnDay, `${label} expiresOnDay`);
	if (expiresOnDay <= startsOnDay) {
		throw new SaveDataError(`${label} expiresOnDay must be after startsOnDay`);
	}
	const stackingKey = requireString(modifier.stackingKey, `${label} stackingKey`);
	validateSavedTimedEffect(modifier.effect, `${label} effect`);
	validateStructuredCopyRef(modifier.explanation, `${label} explanation`);
	requireOneOf(modifier.importance, `${label} importance`, ['normal', 'important'] as const);
	return { id, instanceId: source.instanceId, stackingKey, startsOnDay, expiresOnDay };
}

function validateSavedModifierSource(
	value: unknown,
	label: string
): { eventId: string; instanceId: string; optionId: string } {
	const source = requireRecord(value, label);
	requireExactKeys(source, ['eventId', 'instanceId', 'optionId'], label);
	return {
		eventId: requireString(source.eventId, `${label} eventId`),
		instanceId: requireString(source.instanceId, `${label} instanceId`),
		optionId: requireString(source.optionId, `${label} optionId`)
	};
}

function validateSavedEventHistoryEntry(
	value: unknown,
	gameDay: number,
	label: string
): { day: number; instanceSequence: number; modifierSequence: number } {
	const entry = requireRecord(value, label);
	const kind = requireOneOf(entry.kind, `${label} kind`, [
		'event-generated',
		'event-resolved',
		'event-decision-expired',
		'modifier-lifecycle'
	] as const);
	const day = requireNonNegativeInteger(entry.day, `${label} day`);
	if (day > gameDay) throw new SaveDataError(`${label} day must not be after the game day`);

	if (kind === 'modifier-lifecycle') {
		requireExactKeys(entry, ['kind', 'day', 'status', 'modifier', 'replacedByModifierId'], label);
		const lifecycle = validateSavedModifierLifecycle(entry, label, true, day);
		return {
			day,
			instanceSequence: requireGeneratedId(
				lifecycle.instanceId,
				'event-instance-',
				`${label} modifier source instanceId`
			),
			modifierSequence: Math.max(lifecycle.modifierSequence, lifecycle.replacedBySequence)
		};
	}

	const baseKeys = ['kind', 'day', 'eventId', 'instanceId', 'target'];
	requireExactKeys(entry, kind === 'event-resolved' ? [...baseKeys, 'optionId'] : baseKeys, label);
	requireString(entry.eventId, `${label} eventId`);
	const instanceSequence = requireGeneratedId(
		entry.instanceId,
		'event-instance-',
		`${label} instanceId`
	);
	validateCompanyTarget(entry.target, `${label} target`);
	if (kind === 'event-resolved') requireString(entry.optionId, `${label} optionId`);
	return { day, instanceSequence, modifierSequence: 0 };
}

function validateSavedModifierLifecycle(
	value: Record<string, unknown>,
	label: string,
	hasHistoryFields: boolean,
	lifecycleDay: number
): { instanceId: string; modifierSequence: number; replacedBySequence: number } {
	const status = requireOneOf(value.status, `${label} status`, [
		'activated',
		'replaced',
		'expired'
	] as const);
	const modifier = validateSavedModifierSnapshot(value.modifier, `${label} modifier`);
	let replacedBySequence = 0;
	if (status === 'replaced') {
		if (!(modifier.startsOnDay <= lifecycleDay && lifecycleDay < modifier.expiresOnDay)) {
			throw new SaveDataError(`${label} status replaced must occur while the modifier is active`);
		}
		replacedBySequence = requireGeneratedId(
			value.replacedByModifierId,
			'event-modifier-',
			`${label} replacedByModifierId`
		);
		if (value.replacedByModifierId === modifier.id) {
			throw new SaveDataError(
				`${label} replacedByModifierId must differ from the replaced modifier`
			);
		}
	} else if (Object.hasOwn(value, 'replacedByModifierId')) {
		throw new SaveDataError(`${label} replacedByModifierId is only valid for replaced lifecycle`);
	}
	if (status === 'activated' && lifecycleDay !== modifier.startsOnDay) {
		throw new SaveDataError(`${label} status activated must occur on modifier startsOnDay`);
	}
	if (status === 'expired' && lifecycleDay !== modifier.expiresOnDay - 1) {
		throw new SaveDataError(`${label} status expired must occur on expiresOnDay minus one`);
	}
	if (hasHistoryFields && value.kind !== 'modifier-lifecycle') {
		throw new SaveDataError(`${label} kind must be modifier-lifecycle`);
	}
	return {
		instanceId: modifier.instanceId,
		modifierSequence: requireGeneratedId(modifier.id, 'event-modifier-', `${label} modifier id`),
		replacedBySequence
	};
}

function withEventInvariant<T>(operation: () => T): T {
	try {
		return operation();
	} catch (error) {
		if (error instanceof SaveDataError) {
			if (error.code === 'invariant-event-runtime') throw error;
			throw new SaveDataError(error.message, 'invariant-event-runtime', error);
		}
		throw error;
	}
}

function decodeHistoricalReports(reports: unknown[]): GameState['reports'] {
	const decoded: GameState['reports'] = [];

	for (const [index, report] of reports.entries()) {
		try {
			validateSavedReport(report, `Saved game reports[${index}]`);
			decoded.push(report as GameState['reports'][number]);
		} catch (error) {
			if (!(error instanceof SaveDataError)) throw error;
			console.warn('Dropping malformed historical report', { index, error });
		}
	}

	return decoded;
}

function validateSavedReport(value: unknown, label: string): void {
	const report = requireRecord(value, label);

	const day = requireNonNegativeInteger(report.day, `${label} day`);
	requireNumber(report.revenue, `${label} revenue`);
	requireNumber(report.costOfGoods, `${label} costOfGoods`);
	requireNumber(report.grossMargin, `${label} grossMargin`);
	requireNumber(report.operatingCosts, `${label} operatingCosts`);
	requireNumber(report.payrollCost, `${label} payrollCost`);
	requireNumber(report.importSpend, `${label} importSpend`);
	requireInteger(report.cashBefore, `${label} cashBefore`);
	requireInteger(report.operatingIncome, `${label} operatingIncome`);
	requireInteger(report.operatingCashFlow, `${label} operatingCashFlow`);
	const interestAccrued = requireNumber(report.interestAccrued, `${label} interestAccrued`);
	if (interestAccrued < 0) throw new SaveDataError(`${label} interestAccrued must be non-negative`);
	requireNonNegativeInteger(report.interestPaid, `${label} interestPaid`);
	requireNonNegativeInteger(report.interestCapitalized, `${label} interestCapitalized`);
	requireNonNegativeInteger(report.principalBorrowed, `${label} principalBorrowed`);
	requireNonNegativeInteger(report.principalRepaid, `${label} principalRepaid`);
	requireNonNegativeInteger(report.refinancedPrincipal, `${label} refinancedPrincipal`);
	requireInteger(report.financingCashFlow, `${label} financingCashFlow`);
	requireInteger(report.netCashChange, `${label} netCashChange`);
	requireNonNegativeInteger(report.outstandingPrincipalAfter, `${label} outstandingPrincipalAfter`);
	if (report.nextLoanPayment !== null) {
		const payment = requireRecord(report.nextLoanPayment, `${label} nextLoanPayment`);
		requireString(payment.loanId, `${label} nextLoanPayment loanId`);
		requireNonNegativeInteger(payment.day, `${label} nextLoanPayment day`);
		requireNonNegativeInteger(payment.amount, `${label} nextLoanPayment amount`);
	}
	requireNumber(report.netIncome, `${label} netIncome`);
	requireNumber(report.cashAfter, `${label} cashAfter`);
	validateSavedScorecard(report.scorecard, `${label} scorecard`);
	validateSavedProductionReport(report.productionReport, `${label} productionReport`);
	validateSavedDailyLogisticsReport(report.logistics, `${label} logistics`);
	const seenStoreIds = new Set<string>();
	requireArray(report.storeReports, `${label} storeReports`).forEach((storeReport, index) => {
		const storeId = validateSavedStoreReport(storeReport, `${label} storeReports[${index}]`);
		if (seenStoreIds.has(storeId)) {
			throw new SaveDataError(
				`${label} storeReports[${index}] storeId must be unique within its daily report`
			);
		}
		seenStoreIds.add(storeId);
	});
	withEventInvariant(() => {
		validateSavedModifierImpacts(report.modifierImpacts, `${label} modifierImpacts`);
		validateSavedReportModifierLifecycle(
			report.modifierLifecycle,
			`${label} modifierLifecycle`,
			day
		);
	});
	validateSavedWarningArray(report.warnings, `${label} warnings`, false);
}

function validateSavedModifierImpacts(value: unknown, label: string): void {
	const modifierIds = new Set<string>();
	let previousModifierId: string | undefined;
	requireArray(value, label).forEach((impactValue, index) => {
		const impactLabel = `${label}[${index}]`;
		const impact = requireRecord(impactValue, impactLabel);
		requireExactKeys(
			impact,
			[
				'modifierId',
				'source',
				'target',
				'effectKind',
				'explanation',
				'scope',
				'affectedIds',
				'multiplier',
				'resolvedMultiplier',
				'baselineCost',
				'actualCost',
				'applicationCount'
			],
			impactLabel
		);
		const modifierId = requireString(impact.modifierId, `${impactLabel} modifierId`);
		requireGeneratedId(modifierId, 'event-modifier-', `${impactLabel} modifierId`);
		if (modifierIds.has(modifierId)) {
			throw new SaveDataError(`${impactLabel} modifierId must be unique: ${modifierId}`);
		}
		if (previousModifierId !== undefined && modifierId <= previousModifierId) {
			throw new SaveDataError(`${impactLabel} modifierId must be in ascending code-unit order`);
		}
		modifierIds.add(modifierId);
		previousModifierId = modifierId;
		const source = validateSavedModifierSource(impact.source, `${impactLabel} source`);
		requireGeneratedId(source.instanceId, 'event-instance-', `${impactLabel} source instanceId`);
		validateCompanyTarget(impact.target, `${impactLabel} target`);
		requireOneOf(impact.effectKind, `${impactLabel} effectKind`, [
			'import-cost-multiplier'
		] as const);
		validateStructuredCopyRef(impact.explanation, `${impactLabel} explanation`);
		requireOneOf(impact.scope, `${impactLabel} scope`, ['retail-product'] as const);
		const affectedIds = requireArray(impact.affectedIds, `${impactLabel} affectedIds`);
		if (affectedIds.length === 0) {
			throw new SaveDataError(`${impactLabel} affectedIds must not be empty`);
		}
		const seenAffectedIds = new Set<string>();
		let previousAffectedId: string | undefined;
		affectedIds.forEach((affectedId, affectedIndex) => {
			const id = requireString(affectedId, `${impactLabel} affectedIds[${affectedIndex}]`);
			if (seenAffectedIds.has(id)) {
				throw new SaveDataError(
					`${impactLabel} affectedIds[${affectedIndex}] must be unique: ${id}`
				);
			}
			if (previousAffectedId !== undefined && id <= previousAffectedId) {
				throw new SaveDataError(
					`${impactLabel} affectedIds[${affectedIndex}] must be in ascending code-unit order`
				);
			}
			seenAffectedIds.add(id);
			previousAffectedId = id;
		});
		const multiplier = requireNumber(impact.multiplier, `${impactLabel} multiplier`);
		if (multiplier <= 0) throw new SaveDataError(`${impactLabel} multiplier must be positive`);
		const resolvedMultiplier = requireNumber(
			impact.resolvedMultiplier,
			`${impactLabel} resolvedMultiplier`
		);
		if (resolvedMultiplier <= 0) {
			throw new SaveDataError(`${impactLabel} resolvedMultiplier must be positive`);
		}
		const baselineCost = requireNumber(impact.baselineCost, `${impactLabel} baselineCost`);
		if (baselineCost <= 0) {
			throw new SaveDataError(`${impactLabel} baselineCost must be positive`);
		}
		const actualCost = requireNumber(impact.actualCost, `${impactLabel} actualCost`);
		if (!Number.isSafeInteger(actualCost) || actualCost < 0) {
			throw new SaveDataError(`${impactLabel} actualCost must be a non-negative safe integer`);
		}
		const applicationCount = requirePositiveSafeInteger(
			impact.applicationCount,
			`${impactLabel} applicationCount`
		);
		if (applicationCount < affectedIds.length) {
			throw new SaveDataError(`${impactLabel} applicationCount must cover every affectedIds entry`);
		}
	});
}

function validateSavedReportModifierLifecycle(
	value: unknown,
	label: string,
	reportDay: number
): void {
	requireArray(value, label).forEach((lifecycleValue, index) => {
		const lifecycleLabel = `${label}[${index}]`;
		const lifecycle = requireRecord(lifecycleValue, lifecycleLabel);
		requireExactKeys(lifecycle, ['status', 'modifier', 'replacedByModifierId'], lifecycleLabel);
		validateSavedModifierLifecycle(lifecycle, lifecycleLabel, false, reportDay);
	});
}

function validateSavedDailyLogisticsReport(value: unknown, label: string): void {
	const report = requireRecord(value, label);
	requireExactKeys(
		report,
		['arrivals', 'routeDispatchAttempts', 'deliveredUnits', 'scheduledTransportCost'],
		label
	);

	const seenArrivalOrderIds = new Set<string>();
	let deliveredUnits = 0;
	requireArray(report.arrivals, `${label} arrivals`).forEach((arrivalValue, index) => {
		const { transferOrderId, quantity } = validateSavedDailyTransferArrival(
			arrivalValue,
			`${label} arrivals[${index}]`
		);
		if (seenArrivalOrderIds.has(transferOrderId)) {
			throw new SaveDataError(`${label} arrivals[${index}] transferOrderId must be unique`);
		}
		seenArrivalOrderIds.add(transferOrderId);
		deliveredUnits = addHistoricalLogisticsTotal(
			deliveredUnits,
			quantity,
			`${label} deliveredUnits`
		);
	});
	if (
		requireHistoricalLogisticsNonNegativeSafeInteger(
			report.deliveredUnits,
			`${label} deliveredUnits`
		) !== deliveredUnits
	) {
		throw new SaveDataError(`${label} deliveredUnits must equal the sum of arrival quantities`);
	}

	const seenRouteIds = new Set<string>();
	const seenDispatchOrderIds = new Set<string>();
	let scheduledTransportCost = 0;
	requireArray(report.routeDispatchAttempts, `${label} routeDispatchAttempts`).forEach(
		(attemptValue, index) => {
			const { routeId, transferOrderId, transportCost } = validateSavedDailyRouteDispatchAttempt(
				attemptValue,
				`${label} routeDispatchAttempts[${index}]`
			);
			if (seenRouteIds.has(routeId)) {
				throw new SaveDataError(`${label} routeDispatchAttempts[${index}] routeId must be unique`);
			}
			seenRouteIds.add(routeId);
			if (transferOrderId !== null) {
				if (seenDispatchOrderIds.has(transferOrderId)) {
					throw new SaveDataError(
						`${label} routeDispatchAttempts[${index}] transferOrderId must be unique`
					);
				}
				seenDispatchOrderIds.add(transferOrderId);
			}
			scheduledTransportCost = addHistoricalLogisticsTotal(
				scheduledTransportCost,
				transportCost,
				`${label} scheduledTransportCost`
			);
		}
	);
	if (
		requireHistoricalLogisticsNonNegativeSafeInteger(
			report.scheduledTransportCost,
			`${label} scheduledTransportCost`
		) !== scheduledTransportCost
	) {
		throw new SaveDataError(
			`${label} scheduledTransportCost must equal the sum of route dispatch costs`
		);
	}
}

function validateSavedDailyTransferArrival(
	value: unknown,
	label: string
): { transferOrderId: string; quantity: number } {
	const arrival = requireRecord(value, label);
	requireExactKeys(
		arrival,
		['transferOrderId', 'originCityId', 'destinationCityId', 'materialId', 'quantity'],
		label
	);
	const transferOrderId = requireString(arrival.transferOrderId, `${label} transferOrderId`);
	const originCityId = requireHistoricalReportCityId(
		arrival.originCityId,
		'industry',
		`${label} originCityId`
	);
	const destinationCityId = requireHistoricalReportCityId(
		arrival.destinationCityId,
		'industry',
		`${label} destinationCityId`
	);
	if (originCityId === destinationCityId) {
		throw new SaveDataError(`${label} endpoints must differ`);
	}
	requireKnownId(arrival.materialId, `${label} materialId`, MATERIAL_ID_SET, 'material');
	const quantity = requireHistoricalLogisticsPositiveSafeInteger(
		arrival.quantity,
		`${label} quantity`
	);

	return { transferOrderId, quantity };
}

function validateSavedDailyRouteDispatchAttempt(
	value: unknown,
	label: string
): { routeId: string; transferOrderId: string | null; transportCost: number } {
	const attempt = requireRecord(value, label);
	requireExactKeys(
		attempt,
		[
			'routeId',
			'originCityId',
			'destinationCityId',
			'materialId',
			'destinationNeed',
			'capacity',
			'availableOriginStock',
			'dispatchedQuantity',
			'unusedCapacity',
			'unmetDestinationNeed',
			'transportCost',
			'transferOrderId'
		],
		label
	);
	const routeId = requireString(attempt.routeId, `${label} routeId`);
	const originCityId = requireHistoricalReportCityId(
		attempt.originCityId,
		'industry',
		`${label} originCityId`
	);
	const destinationCityId = requireHistoricalReportCityId(
		attempt.destinationCityId,
		'industry',
		`${label} destinationCityId`
	);
	if (originCityId === destinationCityId) {
		throw new SaveDataError(`${label} endpoints must differ`);
	}
	requireKnownId(attempt.materialId, `${label} materialId`, MATERIAL_ID_SET, 'material');
	const destinationNeed = requireHistoricalLogisticsNonNegativeSafeInteger(
		attempt.destinationNeed,
		`${label} destinationNeed`
	);
	const capacity = requireHistoricalLogisticsPositiveSafeInteger(
		attempt.capacity,
		`${label} capacity`
	);
	const availableOriginStock = requireHistoricalLogisticsNonNegativeSafeInteger(
		attempt.availableOriginStock,
		`${label} availableOriginStock`
	);
	const dispatchedQuantity = requireHistoricalLogisticsNonNegativeSafeInteger(
		attempt.dispatchedQuantity,
		`${label} dispatchedQuantity`
	);
	const unusedCapacity = requireHistoricalLogisticsNonNegativeSafeInteger(
		attempt.unusedCapacity,
		`${label} unusedCapacity`
	);
	const unmetDestinationNeed = requireHistoricalLogisticsNonNegativeSafeInteger(
		attempt.unmetDestinationNeed,
		`${label} unmetDestinationNeed`
	);
	const transportCost = requireHistoricalLogisticsNonNegativeSafeInteger(
		attempt.transportCost,
		`${label} transportCost`
	);

	if (dispatchedQuantity > destinationNeed) {
		throw new SaveDataError(`${label} dispatchedQuantity must not exceed destinationNeed`);
	}
	if (dispatchedQuantity > capacity) {
		throw new SaveDataError(`${label} dispatchedQuantity must not exceed capacity`);
	}
	if (dispatchedQuantity > availableOriginStock) {
		throw new SaveDataError(`${label} dispatchedQuantity must not exceed availableOriginStock`);
	}
	if (unusedCapacity !== capacity - dispatchedQuantity) {
		throw new SaveDataError(`${label} unusedCapacity must equal capacity minus dispatchedQuantity`);
	}
	const expectedUnmetDestinationNeed =
		destinationNeed === 0 ? 0 : destinationNeed - dispatchedQuantity;
	if (unmetDestinationNeed !== expectedUnmetDestinationNeed) {
		throw new SaveDataError(
			`${label} unmetDestinationNeed must equal destinationNeed minus dispatchedQuantity`
		);
	}

	if (dispatchedQuantity === 0) {
		if (transportCost !== 0 || attempt.transferOrderId !== null) {
			throw new SaveDataError(
				`${label} zero dispatch must have zero transportCost and null transferOrderId`
			);
		}
		return { routeId, transferOrderId: null, transportCost };
	}

	if (transportCost === 0) {
		throw new SaveDataError(`${label} positive dispatch must have positive transportCost`);
	}
	return {
		routeId,
		transferOrderId: requireString(attempt.transferOrderId, `${label} transferOrderId`),
		transportCost
	};
}

function requireHistoricalLogisticsPositiveSafeInteger(value: unknown, label: string): number {
	const number = requireNumber(value, label);
	if (!Number.isSafeInteger(number) || number <= 0) {
		throw new SaveDataError(`${label} must be a positive safe integer`);
	}
	return number;
}

function requireHistoricalLogisticsNonNegativeSafeInteger(value: unknown, label: string): number {
	const number = requireNumber(value, label);
	if (!Number.isSafeInteger(number) || number < 0) {
		throw new SaveDataError(`${label} must be a non-negative safe integer`);
	}
	return number;
}

function addHistoricalLogisticsTotal(total: number, value: number, label: string): number {
	const next = total + value;
	if (!Number.isSafeInteger(next)) {
		throw new SaveDataError(`${label} must not exceed the safe integer range`);
	}
	return next;
}

function validateSavedProductionReport(value: unknown, label: string): void {
	const report = requireRecord(value, label);

	requireArray(report.produced, `${label} produced`).forEach((movement, index) =>
		validateSavedHistoricalMaterialMovement(movement, 'industry', `${label} produced[${index}]`)
	);
	requireArray(report.consumed, `${label} consumed`).forEach((movement, index) =>
		validateSavedHistoricalMaterialMovement(movement, 'industry', `${label} consumed[${index}]`)
	);
	requireArray(report.importedInputs, `${label} importedInputs`).forEach((movement, index) =>
		validateSavedHistoricalMaterialMovement(
			movement,
			'industry',
			`${label} importedInputs[${index}]`
		)
	);
	requireArray(report.warehousePulls, `${label} warehousePulls`).forEach((movement, index) =>
		validateSavedHistoricalMaterialMovement(
			movement,
			'industry',
			`${label} warehousePulls[${index}]`
		)
	);
	requireArray(report.shopImports, `${label} shopImports`).forEach((movement, index) =>
		validateSavedHistoricalMaterialMovement(movement, 'retail', `${label} shopImports[${index}]`)
	);
	requireNumber(report.importSpend, `${label} importSpend`);
	requireNumber(report.operatingCost, `${label} operatingCost`);
	requireNonNegativeInteger(report.overflowUnits, `${label} overflowUnits`);
	requireNonNegativeInteger(report.overflowCost, `${label} overflowCost`);
	requireNonNegativeInteger(report.warehouseCapacity, `${label} warehouseCapacity`);
	requireNonNegativeInteger(report.warehouseUsed, `${label} warehouseUsed`);
	requireArray(report.cityInventories, `${label} cityInventories`).forEach((summary, index) =>
		validateSavedDailyCityInventorySummary(summary, `${label} cityInventories[${index}]`)
	);
	requireArray(report.railShipments, `${label} railShipments`).forEach((shipment, index) =>
		validateSavedRailShipment(shipment, `${label} railShipments[${index}]`)
	);
	const railUsage = requireRecord(report.railUsage, `${label} railUsage`);
	for (const [key, units] of Object.entries(railUsage)) {
		const usageUnits = requireNumber(units, `${label} railUsage ${key}`);
		if (usageUnits < 0) throw new SaveDataError(`${label} railUsage ${key} must be at least 0`);
	}
}

function validateSavedHistoricalMaterialMovement(
	value: unknown,
	expectedCityKind: 'retail' | 'industry',
	label: string
): void {
	validateSavedDailyMaterialMovement(value, label, true);
	const movement = requireRecord(value, label);
	requireHistoricalReportCityId(movement.cityId, expectedCityKind, `${label} cityId`);
}

function validateSavedDailyCityInventorySummary(value: unknown, label: string): void {
	const summary = requireRecord(value, label);
	requireHistoricalReportCityId(summary.cityId, 'industry', `${label} cityId`);
	requireNonNegativeInteger(summary.capacity, `${label} capacity`);
	requireNonNegativeInteger(summary.used, `${label} used`);
	requireNonNegativeInteger(summary.overflowUnits, `${label} overflowUnits`);
	requireNonNegativeInteger(summary.overflowCost, `${label} overflowCost`);
}

function validateSavedRailShipment(value: unknown, label: string): void {
	const shipment = requireRecord(value, label);
	requireHistoricalReportCityId(shipment.cityId, 'industry', `${label} cityId`);
	requireKnownId(shipment.materialId, `${label} materialId`, MATERIAL_ID_SET, 'material');
	const quantity = requireNumber(shipment.quantity, `${label} quantity`);
	if (quantity < 0) {
		throw new SaveDataError(`${label} quantity must be non-negative`);
	}
	const shipmentValue = requireNumber(shipment.value, `${label} value`);
	if (shipmentValue < 0) {
		throw new SaveDataError(`${label} value must be non-negative`);
	}
	requireOneOf(shipment.kind, `${label} kind`, RAIL_SHIPMENT_KINDS);
	requireString(shipment.fromId, `${label} fromId`);
	requireString(shipment.toId, `${label} toId`);
}

function validateSavedStoreReport(value: unknown, label: string): string {
	const report = requireRecord(value, label);

	const storeId = requireString(report.storeId, `${label} storeId`);
	requireNumber(report.revenue, `${label} revenue`);
	requireNumber(report.costOfGoods, `${label} costOfGoods`);
	requireNumber(report.grossMargin, `${label} grossMargin`);
	requireNumber(report.operatingCosts, `${label} operatingCosts`);
	requireNumber(report.importSpend, `${label} importSpend`);
	requireNumber(report.netIncome, `${label} netIncome`);
	requireNumber(report.customersServed, `${label} customersServed`);
	requireNumber(report.demandMissed, `${label} demandMissed`);
	requireNumber(report.staffingCoverage, `${label} staffingCoverage`);
	validateSavedStaffingShortage(report.staffingShortage, `${label} staffingShortage`);
	requireNumber(report.stockHealth, `${label} stockHealth`);
	requireNumber(report.staffMorale, `${label} staffMorale`);
	requireNumber(report.reputation, `${label} reputation`);
	requireNumber(report.marketPosition, `${label} marketPosition`);
	const seenCategoryIds = new Set<string>();
	let attemptedReplenishment = false;
	requireArray(report.productReports, `${label} productReports`).forEach((productReport, index) => {
		const product = validateSavedProductReport(productReport, `${label} productReports[${index}]`);
		if (seenCategoryIds.has(product.categoryId)) {
			throw new SaveDataError(
				`${label} productReports[${index}] categoryId must be unique within its store report`
			);
		}
		seenCategoryIds.add(product.categoryId);
		attemptedReplenishment ||= product.warehouseUnits > 0 || product.importedUnits > 0;
	});
	validateSavedHistoricalReplenishment(
		report.replenishment,
		attemptedReplenishment,
		`${label} replenishment`
	);
	validateSavedWarningArray(report.warnings, `${label} warnings`, true);
	return storeId;
}

function validateSavedStoreProducts(store: Record<string, unknown>, label: string): StoreProduct[] {
	const archetypeId = requireOneOf(store.archetypeId, `${label} archetypeId`, ARCHETYPE_IDS);
	const storeLevel = requireNumber(store.level, `${label} level`);
	const unlockedCount = getUnlockedCategoryCount(storeLevel);
	const archetypeCategoryIds = getArchetype(archetypeId).startingCategories.map(
		(category) => category.id
	);
	const archetypeCategories = new Set(archetypeCategoryIds);
	const unlockedCategoryIds = getArchetype(archetypeId)
		.startingCategories.slice(0, unlockedCount)
		.map((category) => category.id);
	const unlockedCategories = new Set(unlockedCategoryIds);
	const seenCategories = new Set<string>();
	const products = requireArray(store.products, `${label} products`);
	const validatedProducts: StoreProduct[] = [];

	for (const [index, productValue] of products.entries()) {
		const product = validateSavedStoreProduct(productValue, `${label} products[${index}]`);

		if (!archetypeCategories.has(product.categoryId)) {
			throw new SaveDataError(
				`${label} products[${index}] categoryId must belong to archetype ${archetypeId}`,
				'invariant-products'
			);
		}

		if (seenCategories.has(product.categoryId)) {
			throw new SaveDataError(
				`${label} products[${index}] categoryId must be unique for archetype ${archetypeId}`,
				'invariant-products'
			);
		}

		seenCategories.add(product.categoryId);
		validatedProducts.push(product);
	}

	if (products.length === 0) {
		throw new SaveDataError(`${label} products must have at least one category`);
	}

	if (products.length !== unlockedCount) {
		throw new SaveDataError(
			`${label} products length (${products.length}) must equal unlocked category count (${unlockedCount}) for level ${storeLevel}`,
			'invariant-products'
		);
	}

	for (const [index, product] of validatedProducts.entries()) {
		if (!unlockedCategories.has(product.categoryId)) {
			throw new SaveDataError(
				`${label} products[${index}] categoryId must be unlocked at level ${storeLevel} for archetype ${archetypeId}`,
				'invariant-products'
			);
		}
	}

	return validatedProducts;
}

function validateSavedStoreProduct(value: unknown, label: string): StoreProduct {
	const product = requireRecord(value, label);

	const categoryId = requireString(product.categoryId, `${label} categoryId`);
	const stock = requireNumber(product.stock, `${label} stock`);
	const reorderThreshold = requireNumber(product.reorderThreshold, `${label} reorderThreshold`);
	const targetStock = requireNumber(product.targetStock, `${label} targetStock`);
	const sellingPrice = requireNumber(product.sellingPrice, `${label} sellingPrice`);

	if (stock < 0) {
		throw new SaveDataError(`${label} stock must be at least 0`);
	}

	if (reorderThreshold < 0) {
		throw new SaveDataError(`${label} reorderThreshold must be at least 0`);
	}

	if (targetStock < reorderThreshold) {
		throw new SaveDataError(
			`${label} targetStock must be greater than or equal to reorderThreshold`
		);
	}

	if (sellingPrice <= 0) {
		throw new SaveDataError(`${label} sellingPrice must be greater than 0`);
	}

	return { categoryId, stock, reorderThreshold, targetStock, sellingPrice };
}

function validateSavedProductReport(
	value: unknown,
	label: string
): { categoryId: string; warehouseUnits: number; importedUnits: number } {
	const report = requireRecord(value, label);

	const categoryId = requireString(report.categoryId, `${label} categoryId`);
	requireString(report.name, `${label} name`);
	requireNumber(report.unitsSold, `${label} unitsSold`);
	requireNumber(report.demandMissed, `${label} demandMissed`);
	requireNumber(report.revenue, `${label} revenue`);
	requireNumber(report.costOfGoods, `${label} costOfGoods`);
	requireNumber(report.grossMargin, `${label} grossMargin`);
	requireNumber(report.endingStock, `${label} endingStock`);
	const warehouseUnits = requireNonNegativeInteger(
		report.warehouseUnits,
		`${label} warehouseUnits`
	);
	const warehouseValue = requireNumber(report.warehouseValue, `${label} warehouseValue`);
	if (warehouseValue < 0) {
		throw new SaveDataError(`${label} warehouseValue must be non-negative`);
	}
	const importedUnits = requireNonNegativeInteger(report.importedUnits, `${label} importedUnits`);
	const importCost = requireNumber(report.importCost, `${label} importCost`);
	if (importCost < 0) {
		throw new SaveDataError(`${label} importCost must be non-negative`);
	}
	const importSpend = requireNumber(report.importSpend, `${label} importSpend`);
	if (importSpend < 0) {
		throw new SaveDataError(`${label} importSpend must be non-negative`);
	}
	return { categoryId, warehouseUnits, importedUnits };
}

function validateSavedHistoricalReplenishment(
	value: unknown,
	attemptedReplenishment: boolean,
	label: string
): void {
	if (value === null) {
		if (attemptedReplenishment) {
			throw new SaveDataError(`${label} must be present for a product refill`);
		}
		return;
	}

	const context = requireRecord(value, label);
	requireHistoricalReportCityId(context.retailCityId, 'retail', `${label} retailCityId`);
	if (context.configuredSupplyCityId !== null) {
		requireHistoricalReportCityId(
			context.configuredSupplyCityId,
			'industry',
			`${label} configuredSupplyCityId`
		);
	}
	if (context.resolvedSupplyCityId !== null) {
		requireHistoricalReportCityId(
			context.resolvedSupplyCityId,
			'industry',
			`${label} resolvedSupplyCityId`
		);
	}
}

function requireHistoricalReportCityId(
	value: unknown,
	expectedKind: 'retail' | 'industry',
	label: string
): WorldCityId {
	const cityId = requireString(value, label);
	const definition = getWorldCityDefinition(cityId);
	if (!definition || definition.kind !== expectedKind) {
		throw new SaveDataError(`${label} must reference a known ${expectedKind} city`);
	}
	return definition.id;
}

function validateSavedStaffingShortage(value: unknown, label: string): void {
	const shortage = requireRecord(value, label);

	requireNumber(shortage.manager, `${label} manager`);
	requireNumber(shortage.general, `${label} general`);
}

function validateSavedScorecard(value: unknown, label: string): void {
	const scorecard = requireRecord(value, label);

	requireNumber(scorecard.profit, `${label} profit`);
	requireNumber(scorecard.customerSatisfaction, `${label} customerSatisfaction`);
	requireNumber(scorecard.staffMorale, `${label} staffMorale`);
	requireNumber(scorecard.marketPosition, `${label} marketPosition`);
}

const STORE_WARNING_CODES = new Set([
	'stockPressure',
	'nearStaffCapacity',
	'shortManager',
	'shortGeneral',
	'missedProductDemand',
	'reputationSlipping'
]);

/**
 * Validates structured report warnings. When `storeOnly` is true, rejects
 * `cashReservesLow` (a daily-level warning); otherwise accepts it.
 */
function validateSavedWarningArray(value: unknown, label: string, storeOnly: boolean): void {
	const warnings = requireArray(value, label);
	warnings.forEach((item, index) => {
		const warning = requireRecord(item, `${label}[${index}]`);
		const code = requireString(warning.code, `${label}[${index}] code`);
		if (storeOnly) {
			if (!STORE_WARNING_CODES.has(code)) {
				throw new SaveDataError(`${label}[${index}] code must be a store warning code`);
			}
		} else if (!STORE_WARNING_CODES.has(code) && code !== 'cashReservesLow') {
			throw new SaveDataError(`${label}[${index}] code must be a valid warning code`);
		}
		if (code !== 'cashReservesLow') {
			requireString(warning.storeId, `${label}[${index}] storeId`);
		}
		if (code === 'shortManager' || code === 'shortGeneral') {
			const count = requireNumber(warning.count, `${label}[${index}] count`);
			if (!Number.isInteger(count) || count < 1) {
				throw new SaveDataError(`${label}[${index}] count must be a positive integer`);
			}
		}
	});
}

const ARRAY_INDEX_KEY = /^(0|[1-9]\d*)$/;

function ownDataFailure(label: string): SaveDataError {
	return new SaveDataError(
		`${label} must contain only own enumerable string-keyed data properties`
	);
}

function isArrayWithoutTraps(value: unknown, label: string): value is unknown[] {
	try {
		return Array.isArray(value);
	} catch {
		throw ownDataFailure(label);
	}
}

function assertOwnDataContainer(value: object, label: string): PropertyDescriptorMap {
	let prototype: object | null;
	let keys: PropertyKey[];
	let descriptors: PropertyDescriptorMap;
	try {
		prototype = Object.getPrototypeOf(value);
		keys = Reflect.ownKeys(value);
		descriptors = Object.getOwnPropertyDescriptors(value);
	} catch {
		throw ownDataFailure(label);
	}

	if (isArrayWithoutTraps(value, label)) {
		if (prototype !== Array.prototype) {
			throw new SaveDataError(`${label} must be an array with own data properties`);
		}
		const arrayLength = descriptors.length?.value;
		if (typeof arrayLength !== 'number') throw ownDataFailure(label);
		let ownIndexCount = 0;
		for (const key of keys) {
			if (typeof key !== 'string') throw ownDataFailure(label);
			const descriptor = descriptors[key];
			if (!descriptor || !('value' in descriptor)) throw ownDataFailure(label);
			if (key === 'length') continue;
			if (!descriptor.enumerable || !ARRAY_INDEX_KEY.test(key) || Number(key) >= arrayLength) {
				throw ownDataFailure(label);
			}
			ownIndexCount += 1;
		}
		if (ownIndexCount !== arrayLength) {
			throw new SaveDataError(`${label} must be a dense array of own enumerable data properties`);
		}
		return descriptors;
	}

	if (prototype !== Object.prototype && prototype !== null) {
		throw new SaveDataError(`${label} must be a plain record with own data properties`);
	}
	for (const key of keys) {
		if (typeof key !== 'string') throw ownDataFailure(label);
		const descriptor = descriptors[key];
		if (!descriptor?.enumerable || !('value' in descriptor)) throw ownDataFailure(label);
	}
	return descriptors;
}

const MAX_OWN_DATA_DEPTH = 512;
const MAX_OWN_DATA_NODES = 250_000;

export interface PlainSnapshotOptions {
	rejectCycles?: boolean;
}

function assertOwnDataGraph(
	value: unknown,
	label: string,
	options: PlainSnapshotOptions = {}
): void {
	const seen = new WeakSet<object>();
	const visiting = new WeakSet<object>();
	const worklist: Array<{ value: unknown; label: string; depth: number; exit?: boolean }> = [
		{ value, label, depth: 0 }
	];
	let nodeCount = 0;

	while (worklist.length > 0) {
		const current = worklist.pop()!;
		if (typeof current.value !== 'object' || current.value === null) {
			continue;
		}
		if (current.exit) {
			visiting.delete(current.value);
			seen.add(current.value);
			continue;
		}
		if (visiting.has(current.value)) {
			if (options.rejectCycles) {
				throw new SaveDataError(`${current.label} contains a cyclic reference`);
			}
			continue;
		}
		if (seen.has(current.value)) {
			continue;
		}
		if (current.depth > MAX_OWN_DATA_DEPTH) {
			throw new SaveDataError(`${current.label} exceeds the maximum save-data depth`);
		}
		visiting.add(current.value);
		nodeCount += 1;
		if (nodeCount > MAX_OWN_DATA_NODES) {
			throw new SaveDataError(`${label} exceeds the maximum save-data node budget`);
		}

		const descriptors = assertOwnDataContainer(current.value, current.label);
		const array = isArrayWithoutTraps(current.value, current.label);
		worklist.push({ ...current, exit: true });
		for (const [key, descriptor] of Object.entries(descriptors)) {
			if (array && key === 'length') continue;
			if ('value' in descriptor) {
				worklist.push({
					value: descriptor.value,
					label: `${current.label}.${key}`,
					depth: current.depth + 1
				});
			}
		}
	}
}

export function createPlainSnapshot(
	value: unknown,
	label: string,
	options: PlainSnapshotOptions = {}
): unknown {
	assertOwnDataGraph(value, label, options);
	try {
		return structuredClone(value);
	} catch {
		throw new SaveDataError(`${label} must contain only structured-cloneable own data properties`);
	}
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || isArrayWithoutTraps(value, label)) {
		throw new SaveDataError(`${label} must be an object`);
	}
	assertOwnDataContainer(value, label);

	return value as Record<string, unknown>;
}

function requireExactKeys(
	value: Record<string, unknown>,
	allowedKeys: readonly string[],
	label: string
): void {
	const allowed = new Set(allowedKeys);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) throw new SaveDataError(`${label} contains an unknown field: ${key}`);
	}
}

function validateUniqueArrayIds(
	values: unknown[],
	label: string,
	validate: (value: unknown, label: string) => string
): void {
	const ids = new Set<string>();
	for (const [index, value] of values.entries()) {
		const id = validate(value, `${label}[${index}]`);
		if (ids.has(id)) throw new SaveDataError(`${label}[${index}] id must be unique: ${id}`);
		ids.add(id);
	}
}

function requireGeneratedId(value: unknown, prefix: string, label: string): number {
	const id = requireString(value, label);
	const sequence = generatedIdSequence(id, prefix);
	if (sequence === 0) {
		throw new SaveDataError(`${label} must use ${prefix}<positive-safe-integer>`);
	}
	return sequence;
}

function requirePositiveInteger(value: unknown, label: string): number {
	const number = requireNumber(value, label);
	if (!Number.isInteger(number) || number <= 0) {
		throw new SaveDataError(`${label} must be a positive integer`);
	}
	return number;
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
	const number = requireNumber(value, label);
	if (!Number.isSafeInteger(number) || number <= 0 || number >= Number.MAX_SAFE_INTEGER) {
		throw new SaveDataError(`${label} must be a positive safe integer that can advance safely`);
	}
	return number;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
	const number = requireNumber(value, label);
	if (!Number.isInteger(number) || number < 0) {
		throw new SaveDataError(`${label} must be a non-negative integer`);
	}
	return number;
}

function requireInteger(value: unknown, label: string): number {
	const number = requireNumber(value, label);
	if (!Number.isInteger(number)) {
		throw new SaveDataError(`${label} must be an integer`);
	}
	return number;
}

function generatedIdSequence(id: string, prefix: string): number {
	if (!id.startsWith(prefix)) return 0;
	const text = id.slice(prefix.length);
	if (!/^[1-9]\d*$/.test(text)) return 0;
	const sequence = Number(text);
	return Number.isSafeInteger(sequence) ? sequence : 0;
}

function validateTileCoordinates(
	x: number,
	y: number,
	label: string,
	cityWidth: number,
	cityHeight: number
): void {
	if (!Number.isInteger(x)) throw new SaveDataError(`${label} x must be an integer`);
	if (!Number.isInteger(y)) throw new SaveDataError(`${label} y must be an integer`);
	if (x < 0 || y < 0 || x >= cityWidth || y >= cityHeight) {
		throw new SaveDataError(`${label} coordinates (${x},${y}) must be within city bounds`);
	}
}

function requireArray(value: unknown, label: string): unknown[] {
	if (!isArrayWithoutTraps(value, label)) {
		throw new SaveDataError(`${label} must be an array`);
	}
	assertOwnDataContainer(value, label);

	return value;
}

function requireString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new SaveDataError(`${label} must be a non-empty string`);
	}

	return value;
}

function requireStringAllowEmpty(value: unknown, label: string): string {
	if (typeof value !== 'string') {
		throw new SaveDataError(`${label} must be a string`);
	}

	return value;
}

function requireOneOf<T extends readonly string[]>(
	value: unknown,
	label: string,
	allowed: T
): T[number] {
	const text = requireString(value, label);
	if (!(allowed as readonly string[]).includes(text)) {
		throw new SaveDataError(`${label} must be one of: ${allowed.join(', ')}`);
	}

	return text;
}

function requireKnownId(
	value: unknown,
	label: string,
	knownIds: ReadonlySet<string>,
	kind: string
): string {
	const id = requireString(value, label);

	if (!knownIds.has(id)) {
		throw new SaveDataError(`${label} ${id} must be a known ${kind}`);
	}

	return id;
}

function requireBoolean(value: unknown, label: string): boolean {
	if (typeof value !== 'boolean') {
		throw new SaveDataError(`${label} must be a boolean`);
	}

	return value;
}

function requireNumber(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new SaveDataError(`${label} must be a finite number`);
	}

	return value;
}

function validateStoreLocation(value: unknown, label: string): void {
	const location = requireRecord(value, label);
	requireOneOf(location.neighborhoodId, `${label} neighborhoodId`, NEIGHBORHOOD_IDS);
	requireNumber(location.x, `${label} x`);
	requireNumber(location.y, `${label} y`);
}
