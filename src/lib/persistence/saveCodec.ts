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
import { clampInventoryToRecipe } from '$lib/game/buildingInventory';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS } from '$lib/game/industry';
import {
	getStoreStaffCapacityBonus,
	getUnlockedCategoryCount,
	MAX_STORE_LEVEL,
	MAX_BUILDING_LEVEL
} from '$lib/game/leveling';
import { formatLocation } from '$lib/game/placement';
import { RAIL_MAX_LEVEL } from '$lib/game/rail';
import {
	createCityTileLookup,
	getRetailStoreFootprint,
	type CityTileLookup
} from '$lib/game/storeFootprint';
import { MAX_STAFF_LEVEL } from '$lib/game/staffLeveling';
import { clampScore } from '$lib/game/reports';
import type {
	City,
	CityTile,
	GameState,
	IndustrialBuildingTypeId,
	WorldCityId
} from '$lib/game/types';
import {
	STARTER_STORE_CAP,
	createInitialWorldProgress,
	getWorldCityDefinition,
	isWorldCityId,
	refreshWorldProgress
} from '$lib/game/world';
import {
	AUTO_SAVE_SLOT_ID,
	SAVE_SCHEMA_VERSION,
	type SaveRecord,
	type SaveSlotKind,
	type SaveStoreSnapshot,
	type SaveSummary
} from './saveTypes';

export type SaveDataErrorCode = 'corrupt' | 'storage-unavailable' | 'slot-not-found';

export class SaveDataError extends Error {
	readonly code: SaveDataErrorCode;

	constructor(message: string, code: SaveDataErrorCode = 'corrupt') {
		super(message);
		this.name = 'SaveDataError';
		this.code = code;
	}
}

/**
 * Schema versions that we accept on read and migrate forward to the current
 * {@link SAVE_SCHEMA_VERSION}. Keep this in sync with the migration table in
 * {@link migrateSaveStoreSnapshot} and {@link migrateSaveRecord}.
 */
const MIGRATABLE_SCHEMA_VERSIONS = new Set<number>([4, 5, 6, 7, 8, 9]);

function isMigratableSchemaVersion(version: unknown): version is number {
	return typeof version === 'number' && MIGRATABLE_SCHEMA_VERSIONS.has(version);
}

/**
 * v4 → v5: boutique's `accessories` category was renamed to
 * `fashion-accessories` to disambiguate it from the electronics archetype's
 * own `accessories` category. Electronics keeps `accessories` as-is.
 */
const BOUTIQUE_LEGACY_CATEGORY_RENAMES: Record<string, string> = {
	accessories: 'fashion-accessories'
};

function migrateV4Store(store: unknown): unknown {
	if (typeof store !== 'object' || store === null) return store;
	const storeRecord = store as Record<string, unknown>;
	if (storeRecord.archetypeId !== 'boutique' || !Array.isArray(storeRecord.products)) {
		return store;
	}

	let changed = false;
	const migratedProducts = storeRecord.products.map((product) => {
		if (typeof product !== 'object' || product === null) return product;
		const productRecord = product as Record<string, unknown>;
		const rename = BOUTIQUE_LEGACY_CATEGORY_RENAMES[productRecord.categoryId as string];
		if (rename === undefined) return product;
		changed = true;
		return { ...productRecord, categoryId: rename };
	});

	return changed ? { ...storeRecord, products: migratedProducts } : store;
}

function migrateV4Game(game: unknown): unknown {
	if (typeof game !== 'object' || game === null) return game;
	const gameRecord = game as Record<string, unknown>;
	if (!Array.isArray(gameRecord.stores)) return game;

	let changed = false;
	const migratedStores = gameRecord.stores.map((store) => {
		const migrated = migrateV4Store(store);
		if (migrated !== store) changed = true;
		return migrated;
	});

	return changed ? { ...gameRecord, stores: migratedStores } : game;
}

function migrateV4SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	const recordObject = record as Record<string, unknown>;
	const migratedGame = migrateV4Game(recordObject.game);
	// Advance by one version so migrateSaveRecord's chain runs the next step.
	return {
		...recordObject,
		schemaVersion: 5,
		game: migratedGame
	};
}

/**
 * v5 → v6: report warnings changed from free-form English strings to
 * structured `{ code, ... }` objects. Per the legacy save policy (game is
 * unreleased), old string warnings are dropped rather than reverse-parsed.
 */
function migrateV5StoreReport(report: unknown): unknown {
	if (typeof report !== 'object' || report === null) return report;
	const reportRecord = report as Record<string, unknown>;
	if (!Array.isArray(reportRecord.warnings)) return report;
	return { ...reportRecord, warnings: [] };
}

function migrateV5Game(game: unknown): unknown {
	if (typeof game !== 'object' || game === null) return game;
	const gameRecord = game as Record<string, unknown>;

	let changed = false;

	let migratedReports = gameRecord.reports;
	if (Array.isArray(migratedReports)) {
		migratedReports = migratedReports.map((report) => {
			if (typeof report !== 'object' || report === null) return report;
			const reportRecord = report as Record<string, unknown>;
			let migrated = reportRecord;
			if (Array.isArray(reportRecord.warnings)) {
				migrated = { ...reportRecord, warnings: [] };
				changed = true;
			}
			if (Array.isArray(reportRecord.storeReports)) {
				const migratedStoreReports = reportRecord.storeReports.map(migrateV5StoreReport);
				if (migratedStoreReports !== reportRecord.storeReports) {
					migrated = { ...migrated, storeReports: migratedStoreReports };
					changed = true;
				}
			}
			return migrated;
		});
	}

	return changed ? { ...gameRecord, reports: migratedReports } : game;
}

function migrateV5SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	const recordObject = record as Record<string, unknown>;
	const migratedGame = migrateV5Game(recordObject.game);
	// Advance by one version so migrateSaveRecord's chain runs the v6→v7 step.
	// Do NOT use SAVE_SCHEMA_VERSION here — that would skip intermediate migrations.
	return {
		...recordObject,
		schemaVersion: 6,
		game: migratedGame
	};
}

/**
 * v6 → v7: decision contexts changed from free-form English strings to
 * structured `{ code, ... }` objects. Per the legacy save policy (game is
 * unreleased), old string-valued contexts are DROPPED — not reverse-parsed
 * and not stubbed with a sentinel code that the DecisionContext union
 * doesn't define.
 */
function migrateV6Game(game: unknown): unknown {
	if (typeof game !== 'object' || game === null) return game;
	const gameRecord = game as Record<string, unknown>;
	const decisions = gameRecord.decisions;

	if (!Array.isArray(decisions)) return game;

	const migratedDecisions = decisions.filter((decision) => {
		if (typeof decision !== 'object' || decision === null) return true;
		const context = (decision as Record<string, unknown>).context;
		return typeof context !== 'string'; // keep structured/object contexts, drop string ones
	});

	if (migratedDecisions.length === decisions.length) return game;

	return { ...gameRecord, decisions: migratedDecisions };
}

function migrateV6SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	const recordObject = record as Record<string, unknown>;
	const migratedGame = migrateV6Game(recordObject.game);
	return {
		...recordObject,
		schemaVersion: 7,
		game: migratedGame
	};
}

/**
 * v7 → v8: save metadata replaced the English `activeCityName` string with a
 * stable `activeCityId` so the save panel can localize the city name at render
 * time. The ID is copied from the saved game state's `activeCityId` field.
 */
function migrateV7SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	const recordObject = record as Record<string, unknown>;
	const metadata = recordObject.metadata;
	const game = recordObject.game;

	if (
		typeof metadata !== 'object' ||
		metadata === null ||
		typeof game !== 'object' ||
		game === null
	) {
		return { ...recordObject, schemaVersion: 8 };
	}

	const metadataRecord = metadata as Record<string, unknown>;
	const gameRecord = game as Record<string, unknown>;
	const activeCityId =
		typeof gameRecord.activeCityId === 'string' ? gameRecord.activeCityId : 'harbor-city';

	return {
		...recordObject,
		schemaVersion: 8,
		metadata: { ...metadataRecord, activeCityId }
	};
}

/**
 * v8 → v9: `Store.location` changed from a free-form English string
 * (`"Downtown (12, 34)"`) to a structured `StoreLocation` object
 * (`{ neighborhoodId, x, y }`) so the UI can localize the neighborhood name
 * at render time. The neighborhood is looked up from the saved city/tile
 * data; coordinates are copied from the store's `mapX`/`mapY` fields.
 */
function migrateV8Store(store: unknown, cities: unknown[]): unknown {
	if (typeof store !== 'object' || store === null) return store;
	const storeRecord = store as Record<string, unknown>;

	// Already structured (not a string) — skip.
	if (typeof storeRecord.location !== 'string') return store;

	const cityId = storeRecord.cityId;
	const tileId = storeRecord.tileId;
	const mapX = typeof storeRecord.mapX === 'number' ? storeRecord.mapX : 0;
	const mapY = typeof storeRecord.mapY === 'number' ? storeRecord.mapY : 0;

	let neighborhoodId = 'downtown';
	for (const city of cities) {
		if (typeof city !== 'object' || city === null) continue;
		const cityRecord = city as Record<string, unknown>;
		if (cityRecord.id !== cityId) continue;
		const tiles = cityRecord.tiles;
		if (!Array.isArray(tiles)) break;
		const tile = tiles.find((t) => {
			if (typeof t !== 'object' || t === null) return false;
			return (t as Record<string, unknown>).id === tileId;
		});
		if (tile && typeof tile === 'object') {
			const tileNeighborhood = (tile as Record<string, unknown>).neighborhood;
			if (typeof tileNeighborhood === 'string') {
				neighborhoodId = tileNeighborhood;
			}
		}
		break;
	}

	return {
		...storeRecord,
		location: { neighborhoodId, x: mapX, y: mapY }
	};
}

function migrateV8Game(game: unknown): unknown {
	if (typeof game !== 'object' || game === null) return game;
	const gameRecord = game as Record<string, unknown>;
	if (!Array.isArray(gameRecord.stores)) return game;

	const cities = Array.isArray(gameRecord.cities) ? gameRecord.cities : [];

	let changed = false;
	const migratedStores = gameRecord.stores.map((store) => {
		const migrated = migrateV8Store(store, cities);
		if (migrated !== store) changed = true;
		return migrated;
	});

	return changed ? { ...gameRecord, stores: migratedStores } : game;
}

function migrateV8SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	const recordObject = record as Record<string, unknown>;
	const migratedGame = migrateV8Game(recordObject.game);
	// Advance by one version so migrateSaveRecord's chain can run the next step.
	// Do NOT use SAVE_SCHEMA_VERSION here — that would skip intermediate migrations.
	return {
		...recordObject,
		schemaVersion: 9,
		game: migratedGame
	};
}

/**
 * v9 → v10: rail transport. Industry cities gain `rails: []`, industrial
 * buildings gain `inventory: {}`, and every persisted production report
 * gains `railShipments` / `railUsage` (strict report validation would
 * reject historical reports otherwise). Pre-rail, every `produced`
 * movement flowed directly into the warehouse; the post-rail
 * product-chain graph derives the warehouse in-edge from
 * `push-warehouse` rail shipments, so the migration synthesizes one
 * such shipment per produced movement to preserve that delivery signal
 * for historical reports.
 */
function migrateV9Game(game: unknown): unknown {
	if (typeof game !== 'object' || game === null) return game;
	const gameRecord = game as Record<string, unknown>;

	const industryCities = Array.isArray(gameRecord.industryCities)
		? gameRecord.industryCities.map((city) =>
				typeof city === 'object' && city !== null
					? { ...(city as Record<string, unknown>), rails: [] }
					: city
			)
		: gameRecord.industryCities;
	const industrialBuildings = Array.isArray(gameRecord.industrialBuildings)
		? gameRecord.industrialBuildings.map((building) =>
				typeof building === 'object' && building !== null
					? { ...(building as Record<string, unknown>), inventory: {} }
					: building
			)
		: gameRecord.industrialBuildings;
	const reports = Array.isArray(gameRecord.reports)
		? gameRecord.reports.map((report) => {
				if (typeof report !== 'object' || report === null) return report;
				const reportRecord = report as Record<string, unknown>;
				const production = reportRecord.productionReport;
				if (typeof production !== 'object' || production === null) return report;
				const productionRecord = production as Record<string, unknown>;
				const producedMovements = Array.isArray(productionRecord.produced)
					? (productionRecord.produced as Array<Record<string, unknown>>)
					: [];
				const railShipments = producedMovements
					.filter((movement) => movement.source === 'local')
					.map((movement) => ({
						materialId: movement.materialId,
						quantity: movement.quantity,
						value: movement.value,
						kind: 'push-warehouse',
						fromId: 'legacy',
						toId: 'warehouse'
					}));
				return {
					...reportRecord,
					productionReport: {
						...productionRecord,
						railShipments,
						railUsage: {}
					}
				};
			})
		: gameRecord.reports;

	return { ...gameRecord, industryCities, industrialBuildings, reports };
}

function migrateV9SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	const recordObject = record as Record<string, unknown>;
	return { ...recordObject, schemaVersion: 10, game: migrateV9Game(recordObject.game) };
}

/**
 * Bring a serialized save store snapshot forward to the current
 * {@link SAVE_SCHEMA_VERSION}. Returns the value untouched when it is already
 * current or when we cannot recognise the schema version (so the caller's
 * subsequent strict validation can throw a precise error).
 */
function migrateSaveStoreSnapshot(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return value;
	const snapshot = value as Record<string, unknown>;

	if (!isMigratableSchemaVersion(snapshot.schemaVersion)) return value;
	if (snapshot.schemaVersion === SAVE_SCHEMA_VERSION) return value;

	let migratedAutoSave = snapshot.autoSave;
	if (migratedAutoSave !== null && migratedAutoSave !== undefined) {
		migratedAutoSave = migrateSaveRecord(migratedAutoSave);
	}

	let migratedManualSlots = snapshot.manualSlots;
	if (Array.isArray(migratedManualSlots)) {
		migratedManualSlots = migratedManualSlots.map(migrateSaveRecord);
	}

	return {
		...snapshot,
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: migratedAutoSave,
		manualSlots: migratedManualSlots
	};
}

/**
 * Record-level mirror of {@link migrateSaveStoreSnapshot} for callers that
 * validate a single {@link SaveRecord} without going through the snapshot
 * validator first. Applies version-specific migrations in order.
 */
function migrateSaveRecord(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return value;
	const record = value as Record<string, unknown>;
	if (!isMigratableSchemaVersion(record.schemaVersion)) return value;
	if (record.schemaVersion === SAVE_SCHEMA_VERSION) return value;

	let migrated = record;
	if (migrated.schemaVersion === 4) {
		migrated = migrateV4SaveRecord(migrated) as Record<string, unknown>;
	}
	if (migrated.schemaVersion === 5) {
		migrated = migrateV5SaveRecord(migrated) as Record<string, unknown>;
	}
	if (migrated.schemaVersion === 6) {
		migrated = migrateV6SaveRecord(migrated) as Record<string, unknown>;
	}
	if (migrated.schemaVersion === 7) {
		migrated = migrateV7SaveRecord(migrated) as Record<string, unknown>;
	}
	if (migrated.schemaVersion === 8) {
		migrated = migrateV8SaveRecord(migrated) as Record<string, unknown>;
	}
	if (migrated.schemaVersion === 9) {
		migrated = migrateV9SaveRecord(migrated) as Record<string, unknown>;
	}

	return migrated;
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
const DECISION_EFFECT_NUMBER_FIELDS = [
	'profit',
	'customerSatisfaction',
	'staffMorale',
	'marketPosition',
	'cash',
	'stockHealth',
	'reputation'
] as const;

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
	return validateSaveStoreSnapshot(cloneJson(snapshot));
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
	const migrated = migrateSaveStoreSnapshot(value);
	const record = requireRecord(migrated, 'Save store');
	const schemaVersion = requireNumber(record.schemaVersion, 'Save store schemaVersion');

	if (schemaVersion !== SAVE_SCHEMA_VERSION) {
		throw new SaveDataError(`Unsupported save schema version: ${schemaVersion}`);
	}

	const autoSave = record.autoSave === null ? null : validateSaveRecord(record.autoSave);
	const manualSlots = requireArray(record.manualSlots, 'manualSlots').map(validateSaveRecord);
	validateSlotInvariants(autoSave, manualSlots);

	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave,
		manualSlots
	};
}

export function validateSaveRecord(value: unknown): SaveRecord {
	const migrated = migrateSaveRecord(value);
	const record = requireRecord(migrated, 'Save record');
	const schemaVersion = requireNumber(record.schemaVersion, 'Save record schemaVersion');

	if (schemaVersion !== SAVE_SCHEMA_VERSION) {
		throw new SaveDataError(`Unsupported save schema version: ${schemaVersion}`);
	}

	const metadata = requireRecord(record.metadata, 'Save metadata');
	const game = validateSavedGame(record.game);
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
		...(migrated as SaveRecord),
		schemaVersion: SAVE_SCHEMA_VERSION,
		game
	};
}

function validateSavedGame(value: unknown): GameState {
	const game = normalizeSavedGame(requireRecord(value, 'Saved game'));
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
	requireNumber(game.day, 'Saved game day');
	requireNumber(game.cash, 'Saved game cash');
	requireNumber(game.debt, 'Saved game debt');
	requireOneOf(policy.pricing, 'Saved game policy pricing', PRICING_POSTURES);
	requireOneOf(policy.inventory, 'Saved game policy inventory', INVENTORY_BUFFERS);
	requireOneOf(policy.staffing, 'Saved game policy staffing', STAFFING_POSTURES);
	requireOneOf(policy.marketing, 'Saved game policy marketing', MARKETING_FOCUSES);
	requireOneOf(policy.service, 'Saved game policy service', SERVICE_PRIORITIES);
	requireNumber(scorecard.profit, 'Saved game scorecard profit');
	requireNumber(scorecard.customerSatisfaction, 'Saved game scorecard customerSatisfaction');
	requireNumber(scorecard.staffMorale, 'Saved game scorecard staffMorale');
	requireNumber(scorecard.marketPosition, 'Saved game scorecard marketPosition');
	cities.forEach((city, index) => validateSavedCity(city, `Saved game cities[${index}]`));
	requireString(game.activeCityId, 'Saved game activeCityId');
	industryCities.forEach((city, index) =>
		validateSavedIndustryCity(city, `Saved game industryCities[${index}]`)
	);
	requireString(game.activeIndustryCityId, 'Saved game activeIndustryCityId');
	industrialBuildings.forEach((building, index) =>
		validateSavedIndustrialBuilding(building, `Saved game industrialBuildings[${index}]`)
	);
	validateSavedWarehouse(game.warehouse, 'Saved game warehouse');
	stores.forEach((store, index) => validateSavedStore(store, `Saved game stores[${index}]`));
	staff.forEach((member, index) => validateSavedStaffMember(member, `Saved game staff[${index}]`));
	hiringCandidates.forEach((candidate, index) =>
		validateSavedHiringCandidate(candidate, `Saved game hiringCandidates[${index}]`)
	);
	decisions.forEach((decision, index) =>
		validateSavedDecision(decision, `Saved game decisions[${index}]`)
	);
	reports.forEach((report, index) => validateSavedReport(report, `Saved game reports[${index}]`));
	requireNumber(game.storeCap, 'Saved game storeCap');
	if (game.storeCap < game.stores.length) {
		throw new SaveDataError('Saved game storeCap must be at least the current store count');
	}

	const refreshedGame = refreshWorldProgress(game);
	return {
		...refreshedGame,
		industrialBuildings: refreshedGame.industrialBuildings.map((building) => ({
			...building,
			inventory: clampInventoryToRecipe(
				building.inventory,
				INDUSTRIAL_BUILDING_TYPES[building.typeId]
			)
		}))
	};
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

const LEGACY_LEVEL_BY_PRODUCT_COUNT: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 };

function normalizeSavedStoreLevel(store: unknown): unknown {
	if (typeof store !== 'object' || store === null) {
		return store;
	}

	const record = store as Record<string, unknown>;
	if (record.level !== undefined) {
		return record;
	}

	const productCount = Array.isArray(record.products) ? record.products.length : 1;
	const level = LEGACY_LEVEL_BY_PRODUCT_COUNT[productCount] ?? 1;
	const staffCapacity =
		typeof record.staffCapacity === 'number'
			? clampScore(record.staffCapacity + getStoreStaffCapacityBonus(level))
			: record.staffCapacity;
	return { ...record, level, staffCapacity };
}

function normalizeSavedBuildingLevel(building: unknown): unknown {
	if (typeof building !== 'object' || building === null) {
		return building;
	}

	const record = building as Record<string, unknown>;
	return record.level === undefined ? { ...record, level: 1 } : record;
}

function normalizeSavedStaffLevel(member: unknown): unknown {
	if (typeof member !== 'object' || member === null) {
		return member;
	}

	const record = member as Record<string, unknown>;
	const level = record.level === undefined ? 1 : record.level;
	const xp = record.xp === undefined ? 0 : record.xp;
	return { ...record, level, xp };
}

function normalizeSavedGame(game: Record<string, unknown>): GameState {
	const normalizedWorld =
		game.world === undefined
			? inferWorldProgress(game)
			: validateSavedWorld(game.world, 'Saved game world');
	const normalizedStoreCap =
		game.storeCap === undefined
			? inferStoreCap(normalizedWorld, Array.isArray(game.stores) ? game.stores.length : 0)
			: game.storeCap;

	const normalizedStores = Array.isArray(game.stores)
		? game.stores.map((store) => normalizeSavedStoreLevel(store))
		: game.stores;
	const normalizedBuildings = Array.isArray(game.industrialBuildings)
		? game.industrialBuildings.map((building) => normalizeSavedBuildingLevel(building))
		: game.industrialBuildings;
	const normalizedStaff = Array.isArray(game.staff)
		? game.staff.map((member) => normalizeSavedStaffLevel(member))
		: game.staff;
	const normalizedCities = normalizeSavedRetailCities(game);
	const normalizedRetailStores = normalizeSavedRetailStorePlacements(
		normalizedStores,
		normalizedCities.cities,
		normalizedCities.regeneratedCityIds
	);

	return {
		...game,
		cities: normalizedCities.cities,
		stores: normalizedRetailStores,
		staff: normalizedStaff,
		industrialBuildings: normalizedBuildings,
		world: normalizedWorld,
		storeCap: normalizedStoreCap
	} as GameState;
}

function normalizeSavedRetailCities(game: Record<string, unknown>): {
	cities: unknown;
	regeneratedCityIds: Set<string>;
} {
	if (!Array.isArray(game.cities)) {
		return { cities: game.cities, regeneratedCityIds: new Set() };
	}

	const regeneratedCityIds = new Set<string>();
	const cities = game.cities.map((city) => {
		const normalized = normalizeSavedRetailCity(game, city);
		if (
			typeof city === 'object' &&
			city !== null &&
			typeof (city as Record<string, unknown>).id === 'string' &&
			normalized !== city
		) {
			regeneratedCityIds.add((city as Record<string, unknown>).id as string);
		}
		return normalized;
	});
	return { cities, regeneratedCityIds };
}

function normalizeSavedRetailCity(game: Record<string, unknown>, city: unknown): unknown {
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

function normalizeSavedRetailStorePlacements(
	stores: unknown,
	cities: unknown,
	regeneratedCityIds: Set<string>
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
			return store;
		}

		const record = store as Record<string, unknown>;
		if (typeof record.cityId !== 'string') {
			return store;
		}

		const city = cityById.get(record.cityId);
		if (!city) {
			return store;
		}

		const occupiedTileIds = getOccupiedTileIds(occupiedTileIdsByCity, city.id);
		const lookup = cityLookupById.get(city.id);
		const targetTile = findSavedStoreTile(city, record, occupiedTileIds, lookup);
		if (!targetTile) {
			const storeId = typeof record.id === 'string' ? record.id : '<unknown>';
			console.warn(
				`saveCodec: store "${storeId}" in city "${city.id}" has no buildable tile (saved tileId "${record.tileId ?? '?'}"); left on stale tile.`
			);
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
		console.warn(
			`saveCodec: relocated store "${storeId}" in city "${city.id}" from tile "${record.tileId ?? '?'}" (${record.mapX ?? '?'}, ${record.mapY ?? '?'}) to tile "${targetTile.id}" (${targetTile.x}, ${targetTile.y}).`
		);

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

function isSavedCityLike(value: unknown): value is City {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { id?: unknown }).id === 'string' &&
		Array.isArray((value as { tiles?: unknown }).tiles)
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

function inferStoreCap(world: GameState['world'], storeCount: number): number {
	const starterIds = new Set<string>(createInitialWorldProgress().openedCityIds);
	let cap = STARTER_STORE_CAP;

	for (const cityId of world.openedCityIds) {
		if (starterIds.has(cityId)) continue;
		const city = getWorldCityDefinition(cityId);
		if (city) {
			cap += city.storeCapBonus;
		}
	}

	if (world.claimedMilestoneIds.includes('positive-income-store-cap')) {
		cap += 1;
	}

	if (storeCount > cap) {
		throw new SaveDataError(
			`Legacy save has ${storeCount} stores but inferred store cap is ${cap}`
		);
	}

	return cap;
}

/**
 * When loading a save that predates the `world` field, infer which cities
 * were already opened by inspecting the saved `cities` and `industryCities`
 * arrays. Cities present in those arrays but not in the starter set are
 * marked as both revealed and opened so the world map reflects reality.
 */
function inferWorldProgress(game: Record<string, unknown>): GameState['world'] {
	const progress = createInitialWorldProgress();
	const starterSet = new Set<string>(progress.openedCityIds);
	const worldCityIdSet = new Set<string>(WORLD_CITY_IDS);

	const savedCityIds = extractCityIds(game.cities);
	const savedIndustryCityIds = extractCityIds(game.industryCities);
	const allSavedCityIds = [...savedCityIds, ...savedIndustryCityIds];

	for (const cityId of allSavedCityIds) {
		if (starterSet.has(cityId)) continue;

		if (!worldCityIdSet.has(cityId)) {
			console.warn(`inferWorldProgress: skipping unknown city id "${cityId}" not in catalog`);
			continue;
		}

		progress.revealedCityIds.push(cityId as WorldCityId);
		progress.openedCityIds.push(cityId as WorldCityId);
	}

	return progress;
}

function extractCityIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(
			(item): item is Record<string, unknown> =>
				typeof item === 'object' && item !== null && 'id' in item
		)
		.map((item) => item.id)
		.filter((id): id is string => typeof id === 'string');
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

function validateSavedCity(value: unknown, label: string): void {
	const city = requireRecord(value, label);

	requireString(city.id, `${label} id`);
	requireString(city.name, `${label} name`);
	requireNumber(city.width, `${label} width`);
	requireNumber(city.height, `${label} height`);
	requireArray(city.tiles, `${label} tiles`).forEach((tile, index) =>
		validateSavedCityTile(tile, `${label} tiles[${index}]`)
	);
}

function validateSavedCityTile(value: unknown, label: string): void {
	const tile = requireRecord(value, label);

	requireString(tile.id, `${label} id`);
	requireString(tile.cityId, `${label} cityId`);
	requireNumber(tile.x, `${label} x`);
	requireNumber(tile.y, `${label} y`);
	requireOneOf(tile.neighborhood, `${label} neighborhood`, NEIGHBORHOOD_IDS);
	requireOneOf(tile.terrain, `${label} terrain`, TERRAIN_IDS);
	validateSavedCityTileFeature(tile, `${label} feature`);
	requireNumber(tile.demand, `${label} demand`);
	requireNumber(tile.rent, `${label} rent`);
	requireNumber(tile.footTraffic, `${label} footTraffic`);
	requireNumber(tile.customerFit, `${label} customerFit`);
	requireBoolean(tile.locked, `${label} locked`);
}

function validateSavedCityTileFeature(tile: Record<string, unknown>, label: string): void {
	if (tile.feature === undefined || tile.feature === null) {
		tile.feature = null;
		return;
	}

	if (
		typeof tile.feature !== 'string' ||
		!CITY_TILE_FEATURES.includes(tile.feature as (typeof CITY_TILE_FEATURES)[number])
	) {
		throw new SaveDataError(`${label} must be null, road, or river`);
	}
}

function validateSavedIndustryCity(value: unknown, label: string): void {
	const city = requireRecord(value, label);

	requireString(city.id, `${label} id`);
	requireString(city.name, `${label} name`);
	const width = requireNumber(city.width, `${label} width`);
	const height = requireNumber(city.height, `${label} height`);
	requireArray(city.tiles, `${label} tiles`).forEach((tile, index) =>
		validateSavedIndustryTile(tile, `${label} tiles[${index}]`)
	);
	const seenRailKeys = new Set<string>();
	requireArray(city.rails, `${label} rails`).forEach((cell, index) =>
		validateSavedRailCell(cell, `${label} rails[${index}]`, width, height, seenRailKeys)
	);
}

function validateSavedRailCell(
	value: unknown,
	label: string,
	cityWidth: number,
	cityHeight: number,
	seenKeys: Set<string>
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
	if (seenKeys.has(key)) {
		throw new SaveDataError(`${label} duplicates rail coordinate ${key}`);
	}
	seenKeys.add(key);
	const level = requireNumber(cell.level, `${label} level`);
	if (!Number.isInteger(level) || level < 1 || level > RAIL_MAX_LEVEL) {
		throw new SaveDataError(`${label} level must be an integer between 1 and ${RAIL_MAX_LEVEL}`);
	}
}

function validateSavedIndustryTile(value: unknown, label: string): void {
	const tile = requireRecord(value, label);

	requireString(tile.id, `${label} id`);
	requireString(tile.cityId, `${label} cityId`);
	requireNumber(tile.x, `${label} x`);
	requireNumber(tile.y, `${label} y`);
	requireOneOf(tile.terrain, `${label} terrain`, INDUSTRY_TERRAIN_IDS);
	validateSavedIndustryResource(tile.resource, `${label} resource`);
	requireBoolean(tile.locked, `${label} locked`);
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
		validateSavedDailyMaterialMovement(movement, `${label} lastProduction[${index}]`)
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

function validateSavedDailyMaterialMovement(value: unknown, label: string): void {
	const movement = requireRecord(value, label);

	requireKnownId(movement.materialId, `${label} materialId`, MATERIAL_ID_SET, 'material');
	requireNumber(movement.quantity, `${label} quantity`);
	requireNumber(movement.value, `${label} value`);
	requireOneOf(movement.source, `${label} source`, MATERIAL_MOVEMENT_SOURCES);
}

function validateSavedWarehouse(value: unknown, label: string): void {
	const warehouse = requireRecord(value, label);
	const materials = requireRecord(warehouse.materials, `${label} materials`);

	requireNumber(warehouse.capacity, `${label} capacity`);
	for (const [materialId, quantity] of Object.entries(materials)) {
		if (!MATERIAL_ID_SET.has(materialId)) {
			throw new SaveDataError(`${label} materials ${materialId} must be a known material`);
		}

		const materialQuantity = requireNumber(quantity, `${label} materials ${materialId}`);
		if (materialQuantity < 0) {
			throw new SaveDataError(`${label} materials ${materialId} must be at least 0`);
		}
	}
	requireNumber(warehouse.overflowUnits, `${label} overflowUnits`);
	requireNumber(warehouse.overflowCost, `${label} overflowCost`);
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
	requireNumber(store.stockHealth, `${label} stockHealth`);
	validateSavedStoreProducts(store, label);
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

function validateSavedDecision(value: unknown, label: string): void {
	const decision = requireRecord(value, label);

	requireString(decision.id, `${label} id`);
	requireString(decision.title, `${label} title`);
	validateSavedDecisionContext(decision.context, `${label}`);
	requireNumber(decision.expiresOnDay, `${label} expiresOnDay`);
	requireArray(decision.options, `${label} options`).forEach((option, index) =>
		validateSavedDecisionOption(option, `${label} options[${index}]`)
	);
}

function validateSavedDecisionOption(value: unknown, label: string): void {
	const option = requireRecord(value, label);
	const effects = requireRecord(option.effects, `${label} effects`);

	requireString(option.id, `${label} id`);
	requireString(option.label, `${label} label`);
	requireString(option.description, `${label} description`);

	for (const field of DECISION_EFFECT_NUMBER_FIELDS) {
		if (field in effects) {
			requireNumber(effects[field], `${label} effects ${field}`);
		}
	}
}

function validateSavedReport(value: unknown, label: string): void {
	const report = requireRecord(value, label);

	requireNumber(report.day, `${label} day`);
	requireNumber(report.revenue, `${label} revenue`);
	requireNumber(report.costOfGoods, `${label} costOfGoods`);
	requireNumber(report.grossMargin, `${label} grossMargin`);
	requireNumber(report.operatingCosts, `${label} operatingCosts`);
	requireNumber(report.payrollCost, `${label} payrollCost`);
	requireNumber(report.importSpend, `${label} importSpend`);
	requireNumber(report.netIncome, `${label} netIncome`);
	requireNumber(report.cashAfter, `${label} cashAfter`);
	validateSavedScorecard(report.scorecard, `${label} scorecard`);
	validateSavedProductionReport(report.productionReport, `${label} productionReport`);
	requireArray(report.storeReports, `${label} storeReports`).forEach((storeReport, index) =>
		validateSavedStoreReport(storeReport, `${label} storeReports[${index}]`)
	);
	validateSavedWarningArray(report.warnings, `${label} warnings`, false);
}

function validateSavedProductionReport(value: unknown, label: string): void {
	const report = requireRecord(value, label);

	requireArray(report.produced, `${label} produced`).forEach((movement, index) =>
		validateSavedDailyMaterialMovement(movement, `${label} produced[${index}]`)
	);
	requireArray(report.consumed, `${label} consumed`).forEach((movement, index) =>
		validateSavedDailyMaterialMovement(movement, `${label} consumed[${index}]`)
	);
	requireArray(report.importedInputs, `${label} importedInputs`).forEach((movement, index) =>
		validateSavedDailyMaterialMovement(movement, `${label} importedInputs[${index}]`)
	);
	requireArray(report.warehousePulls, `${label} warehousePulls`).forEach((movement, index) =>
		validateSavedDailyMaterialMovement(movement, `${label} warehousePulls[${index}]`)
	);
	requireArray(report.shopImports, `${label} shopImports`).forEach((movement, index) =>
		validateSavedDailyMaterialMovement(movement, `${label} shopImports[${index}]`)
	);
	requireNumber(report.importSpend, `${label} importSpend`);
	requireNumber(report.operatingCost, `${label} operatingCost`);
	requireNumber(report.overflowUnits, `${label} overflowUnits`);
	requireNumber(report.overflowCost, `${label} overflowCost`);
	requireNumber(report.warehouseCapacity, `${label} warehouseCapacity`);
	requireNumber(report.warehouseUsed, `${label} warehouseUsed`);
	requireArray(report.railShipments, `${label} railShipments`).forEach((shipment, index) =>
		validateSavedRailShipment(shipment, `${label} railShipments[${index}]`)
	);
	const railUsage = requireRecord(report.railUsage, `${label} railUsage`);
	for (const [key, units] of Object.entries(railUsage)) {
		const usageUnits = requireNumber(units, `${label} railUsage ${key}`);
		if (usageUnits < 0) throw new SaveDataError(`${label} railUsage ${key} must be at least 0`);
	}
}

function validateSavedRailShipment(value: unknown, label: string): void {
	const shipment = requireRecord(value, label);
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

function validateSavedStoreReport(value: unknown, label: string): void {
	const report = requireRecord(value, label);

	requireString(report.storeId, `${label} storeId`);
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
	requireArray(report.productReports, `${label} productReports`).forEach((productReport, index) =>
		validateSavedProductReport(productReport, `${label} productReports[${index}]`)
	);
	validateSavedWarningArray(report.warnings, `${label} warnings`, true);
}

function validateSavedStoreProducts(store: Record<string, unknown>, label: string): void {
	const archetypeId = requireOneOf(store.archetypeId, `${label} archetypeId`, ARCHETYPE_IDS);
	const expectedCategoryIds = getArchetype(archetypeId).startingCategories.map(
		(category) => category.id
	);
	const expectedCategories = new Set(expectedCategoryIds);
	const seenCategories = new Set<string>();
	const products = requireArray(store.products, `${label} products`);
	const storeLevel = requireNumber(store.level, `${label} level`);

	for (const [index, productValue] of products.entries()) {
		const product = validateSavedStoreProduct(productValue, `${label} products[${index}]`);

		if (!expectedCategories.has(product.categoryId)) {
			throw new SaveDataError(
				`${label} products[${index}] categoryId must belong to archetype ${archetypeId}`
			);
		}

		if (seenCategories.has(product.categoryId)) {
			throw new SaveDataError(
				`${label} products[${index}] categoryId must be unique for archetype ${archetypeId}`
			);
		}

		seenCategories.add(product.categoryId);
	}

	if (products.length === 0) {
		throw new SaveDataError(`${label} products must have at least one category`);
	}

	const unlockedCount = getUnlockedCategoryCount(storeLevel);
	if (products.length !== unlockedCount) {
		throw new SaveDataError(
			`${label} products length (${products.length}) must equal unlocked category count (${unlockedCount}) for level ${storeLevel}`
		);
	}
}

function validateSavedStoreProduct(value: unknown, label: string): { categoryId: string } {
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

	return { categoryId };
}

function validateSavedProductReport(value: unknown, label: string): void {
	const report = requireRecord(value, label);

	requireString(report.categoryId, `${label} categoryId`);
	requireString(report.name, `${label} name`);
	requireNumber(report.unitsSold, `${label} unitsSold`);
	requireNumber(report.demandMissed, `${label} demandMissed`);
	requireNumber(report.revenue, `${label} revenue`);
	requireNumber(report.costOfGoods, `${label} costOfGoods`);
	requireNumber(report.grossMargin, `${label} grossMargin`);
	requireNumber(report.endingStock, `${label} endingStock`);
	requireNumber(report.warehouseUnits, `${label} warehouseUnits`);
	requireNumber(report.warehouseValue, `${label} warehouseValue`);
	requireNumber(report.importedUnits, `${label} importedUnits`);
	requireNumber(report.importCost, `${label} importCost`);
	requireNumber(report.importSpend, `${label} importSpend`);
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

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new SaveDataError(`${label} must be an object`);
	}

	return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) {
		throw new SaveDataError(`${label} must be an array`);
	}

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
