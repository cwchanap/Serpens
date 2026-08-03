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
import {
	clampInventoryToRecipe,
	getRecipeMaterialIds,
	inventoryUsed
} from '$lib/game/buildingInventory';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS } from '$lib/game/industry';
import {
	getWarehouseCapacity,
	projectCityInventoriesToLegacyWarehouse,
	recalculateWarehousePressure
} from '$lib/game/legacyWarehouse';
import {
	createIndustryTileLookup,
	getIndustryBuildingFootprint
} from '$lib/game/industryFootprint';
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
import {
	allocateLegacyWarehouseMaterials,
	compareWorldCityIds,
	createEmptyCityInventory,
	findEntityCityOwnershipIssues,
	getCityInventory,
	normalizeCityInventoryDerivedState,
	supportsCityInventory,
	WAREHOUSE_OVERFLOW_COST_PER_UNIT
} from '$lib/game/cityInventory';
import { MAX_STAFF_LEVEL } from '$lib/game/staffLeveling';
import {
	createFoundingFinanceState,
	FINANCE_TRANSACTION_LIMIT,
	getInstallmentCount
} from '$lib/game/finance';
import {
	createInitialEventRuntime,
	EVENT_SELECTION_SCHEMA_VERSION
} from '$lib/game/eventSelection';
import { EVENT_HISTORY_LIMIT } from '$lib/game/eventHistory';
import { clampScore } from '$lib/game/reports';
import { calculateStockHealth, getFinishedMaterialIdForCategory } from '$lib/game/stock';
import type {
	City,
	CityTile,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	IndustryCity,
	MaterialId,
	StoreProduct,
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

export type SaveDataErrorCode =
	| 'corrupt'
	| 'storage-unavailable'
	| 'slot-not-found'
	| 'invariant-store-cap'
	| 'invariant-products'
	| 'invariant-stock-health'
	| 'invariant-warehouse'
	| 'invariant-inventory'
	| 'invariant-entity-city-opened'
	| 'invariant-entity-city-ownership'
	| 'invariant-city-inventory'
	| 'invariant-retail-supply'
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

/**
 * Schema versions that we accept on read and migrate forward to the current
 * {@link SAVE_SCHEMA_VERSION}. Keep this in sync with the migration table in
 * {@link migrateSaveStoreSnapshot} and {@link migrateSaveRecord}.
 */
const MIGRATABLE_SCHEMA_VERSIONS = new Set<number>([4, 5, 6, 7, 8, 9, 10, 11, 12]);

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
		if (typeof productRecord.categoryId !== 'string') {
			throw new SaveDataError('Saved v4 product categoryId must be a string');
		}
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
	// Advance by one version so migrateSaveRecord's chain runs the next step.
	return {
		...recordObject,
		schemaVersion: 5
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
	// Advance by one version so migrateSaveRecord's chain runs the v6→v7 step.
	// Do NOT use SAVE_SCHEMA_VERSION here — that would skip intermediate migrations.
	return {
		...recordObject,
		schemaVersion: 6
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
	return {
		...recordObject,
		schemaVersion: 7
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
	// Advance by one version so migrateSaveRecord's chain can run the next step.
	// Do NOT use SAVE_SCHEMA_VERSION here — that would skip intermediate migrations.
	return {
		...recordObject,
		schemaVersion: 9
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
					? productionRecord.produced
					: [];
				const railShipments = producedMovements
					.filter(
						(movement): movement is Record<string, unknown> =>
							typeof movement === 'object' && movement !== null && movement.source === 'local'
					)
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
	return { ...recordObject, schemaVersion: 10 };
}

/**
 * v10 → v11: scalar debt became an explicit finance ledger. Historical debt
 * has no payment or accrual history, so it becomes one neutral founding loan
 * opened on the loaded day. Historical reports retain their original cash and
 * income values and gain zero financing activity.
 */
export function migrateV10Game(game: unknown): unknown {
	if (typeof game !== 'object' || game === null) return game;
	const gameRecord = game as Record<string, unknown>;
	const day = gameRecord.day;
	const debt = gameRecord.debt;
	if (
		typeof day !== 'number' ||
		!Number.isFinite(day) ||
		!Number.isInteger(day) ||
		day < 0 ||
		typeof debt !== 'number' ||
		!Number.isFinite(debt) ||
		!Number.isInteger(debt) ||
		debt < 0
	) {
		return game;
	}
	const { debt: _debt, ...withoutDebt } = gameRecord;
	void _debt;
	const reports = Array.isArray(gameRecord.reports)
		? gameRecord.reports.map((report) => migrateV10Report(report, debt))
		: gameRecord.reports;
	const decisions = Array.isArray(gameRecord.decisions)
		? gameRecord.decisions.map(migrateV10StrategicDecisionFinanceEffects)
		: gameRecord.decisions;
	return {
		...withoutDebt,
		finance: createFoundingFinanceState(day, debt),
		decisions,
		reports
	};
}

/**
 * Genuine v10 strategic borrowing options credited cash directly. The v11
 * finance model materialized those same actions as typed borrow requests, so
 * perform that historical shape change before the exact v11 event migration.
 * Any non-canonical value is left untouched for v11 validation to reject.
 */
function migrateV10StrategicDecisionFinanceEffects(decision: unknown): unknown {
	if (typeof decision !== 'object' || decision === null) return decision;
	const value = decision as Record<string, unknown>;
	if (!Array.isArray(value.options)) return decision;

	if (value.id === 'cash-pressure') {
		return {
			...value,
			options: value.options.map((option) =>
				migrateV10CashBorrowOption(option, 'short-loan', 12_000, 'emergency', 56)
			)
		};
	}
	if (value.id === 'supplier-terms') {
		return {
			...value,
			options: value.options.map((option) =>
				migrateV10CashBorrowOption(option, 'negotiate-credit', 4_000, 'supplierCredit', 28)
			)
		};
	}
	return decision;
}

function migrateV10CashBorrowOption(
	option: unknown,
	optionId: string,
	legacyCash: number,
	purpose: 'emergency' | 'supplierCredit',
	termDays: 28 | 56
): unknown {
	if (typeof option !== 'object' || option === null) return option;
	const value = option as Record<string, unknown>;
	if (value.id !== optionId || typeof value.effects !== 'object' || value.effects === null) {
		return option;
	}
	const effects = value.effects as Record<string, unknown>;
	if (effects.cash !== legacyCash || Object.hasOwn(effects, 'finance')) return option;
	const { cash: _cash, ...remainingEffects } = effects;
	void _cash;
	return {
		...value,
		effects: {
			finance: { kind: 'borrow', purpose, amount: legacyCash, termDays },
			...remainingEffects
		}
	};
}

function migrateV10Report(report: unknown, outstandingPrincipalAfter: number): unknown {
	if (typeof report !== 'object' || report === null) return report;
	const value = report as Record<string, unknown>;
	const cashAfter = value.cashAfter;
	const netIncome = value.netIncome;
	const grossMargin = value.grossMargin;
	const operatingCosts = value.operatingCosts;
	if (
		typeof cashAfter !== 'number' ||
		typeof netIncome !== 'number' ||
		typeof grossMargin !== 'number' ||
		typeof operatingCosts !== 'number'
	) {
		return report;
	}
	return {
		...value,
		cashBefore: cashAfter - netIncome,
		operatingIncome: grossMargin - operatingCosts,
		operatingCashFlow: netIncome,
		interestAccrued: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0,
		netCashChange: netIncome,
		outstandingPrincipalAfter,
		nextLoanPayment: null
	};
}

function migrateV10SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	return { ...(record as Record<string, unknown>), schemaVersion: 11 };
}

const LEGACY_STRATEGIC_EVENT_SPECS = {
	'cash-pressure': {
		expiresAfterDays: 2,
		copyKey: 'events.cashPressure',
		contextCode: 'cashPressure',
		optionIds: ['short-loan', 'cut-costs', 'hold-course']
	},
	'expansion-opportunity': {
		expiresAfterDays: 3,
		copyKey: 'events.expansionOpportunity',
		contextCode: 'expansionOpportunity',
		optionIds: ['prepare', 'pass']
	},
	'supplier-terms': {
		expiresAfterDays: 2,
		copyKey: 'events.supplierTerms',
		contextCode: 'supplierTerms',
		optionIds: ['negotiate-credit', 'bulk-discount']
	}
} as const;

type LegacyStrategicEventId = keyof typeof LEGACY_STRATEGIC_EVENT_SPECS;

/**
 * v11 → v12: broad strategic decisions become materialized event instances,
 * while command-owned notices become the system arm of the decision union.
 * The game is unreleased, so unknown non-empty effects are rejected instead
 * of being guessed into the typed event effect union.
 */
function migrateV11Game(game: unknown): unknown {
	if (typeof game !== 'object' || game === null) return game;
	return withEventInvariant(() => migrateV11GameInternal(game));
}

function migrateV11GameInternal(game: object): unknown {
	const value = requireRecord(game, 'Saved v11 game');
	const seed = requireNumber(value.seed, 'Saved v11 game seed');
	const decisions = requireArray(value.decisions, 'Saved v11 decisions');
	const reports = requireArray(value.reports, 'Saved v11 reports');
	const initialEvents = createInitialEventRuntime(seed);
	let nextInstanceSequence = 1;
	const cooldowns = new Map<string, Record<string, unknown>>();
	const history: Array<Record<string, unknown>> = [];

	const migratedDecisions = decisions.map((decision, index) => {
		const label = `Saved v11 decisions[${index}]`;
		const legacy = requireRecord(decision, label);
		const id = requireString(legacy.id, `${label} id`);
		if (!isLegacyStrategicEventId(id)) return migrateV11SystemDecision(legacy, label);

		const instanceId = `event-instance-${nextInstanceSequence}`;
		nextInstanceSequence += 1;
		const migrated = migrateV11StrategicDecision(legacy, id, instanceId, label);
		cooldowns.set(`${id}:company`, {
			eventId: id,
			target: { kind: 'company' },
			generatedOnDay: migrated.generatedOnDay,
			eligibleOnDay: migrated.generatedOnDay + 1
		});
		history.push({
			kind: 'event-generated',
			day: migrated.generatedOnDay,
			eventId: id,
			instanceId,
			target: { kind: 'company' }
		});
		return migrated.decision;
	});

	const migratedReports = reports.map((report, index) => ({
		...requireRecord(report, `Saved v11 reports[${index}]`),
		modifierImpacts: [],
		modifierLifecycle: []
	}));

	return {
		...value,
		events: {
			...initialEvents,
			nextInstanceSequence,
			cooldowns: [...cooldowns.values()],
			history: history.sort((a, b) => (a.day as number) - (b.day as number))
		},
		decisions: migratedDecisions,
		reports: migratedReports
	};
}

function isLegacyStrategicEventId(id: string): id is LegacyStrategicEventId {
	return Object.hasOwn(LEGACY_STRATEGIC_EVENT_SPECS, id);
}

function migrateV11StrategicDecision(
	legacy: Record<string, unknown>,
	eventId: LegacyStrategicEventId,
	instanceId: string,
	label: string
): { generatedOnDay: number; decision: Record<string, unknown> } {
	requireExactKeys(legacy, ['id', 'title', 'context', 'expiresOnDay', 'options'], label);
	requireString(legacy.title, `${label} title`);
	const spec = LEGACY_STRATEGIC_EVENT_SPECS[eventId];
	const context = requireRecord(legacy.context, `${label} context`);
	requireExactKeys(context, ['code'], `${label} context`);
	if (context.code !== spec.contextCode) {
		throw new SaveDataError(`${label} context code must be ${spec.contextCode}`);
	}
	const expiresOnDay = requireNonNegativeInteger(legacy.expiresOnDay, `${label} expiresOnDay`);
	const generatedOnDay = expiresOnDay - spec.expiresAfterDays;
	if (generatedOnDay < 0) {
		throw new SaveDataError(`${label} expiry does not permit a non-negative generated day`);
	}
	const options = requireArray(legacy.options, `${label} options`);
	if (options.length !== spec.optionIds.length) {
		throw new SaveDataError(`${label} options must contain exactly: ${spec.optionIds.join(', ')}`);
	}
	const migratedOptions = options.map((optionValue, optionIndex) => {
		const optionLabel = `${label} options[${optionIndex}]`;
		const option = requireRecord(optionValue, optionLabel);
		requireExactKeys(option, ['id', 'label', 'description', 'effects'], optionLabel);
		const expectedId = spec.optionIds[optionIndex];
		if (option.id !== expectedId) {
			throw new SaveDataError(`${optionLabel} id must be ${expectedId}`);
		}
		requireString(option.label, `${optionLabel} label`);
		requireString(option.description, `${optionLabel} description`);
		return {
			id: expectedId,
			effects: migrateV11StrategicEffects(
				eventId,
				expectedId,
				requireRecord(option.effects, `${optionLabel} effects`),
				`${optionLabel} effects`
			),
			modifiers: []
		};
	});

	return {
		generatedOnDay,
		decision: {
			kind: 'event',
			id: instanceId,
			eventId,
			definitionVersion: 1,
			generatedOnDay,
			expiresOnDay,
			target: { kind: 'company' },
			copy: { key: spec.copyKey, params: {} },
			options: migratedOptions
		}
	};
}

function migrateV11SystemDecision(
	legacy: Record<string, unknown>,
	label: string
): Record<string, unknown> {
	requireExactKeys(legacy, ['id', 'title', 'context', 'expiresOnDay', 'options'], label);
	const id = requireString(legacy.id, `${label} id`);
	const title = requireString(legacy.title, `${label} title`);
	const context = validateSavedDecisionContext(legacy.context, label);
	const expiresOnDay = requireNonNegativeInteger(legacy.expiresOnDay, `${label} expiresOnDay`);
	const options = requireArray(legacy.options, `${label} options`).map(
		(optionValue, optionIndex) => {
			const optionLabel = `${label} options[${optionIndex}]`;
			const option = requireRecord(optionValue, optionLabel);
			requireExactKeys(option, ['id', 'label', 'description', 'effects'], optionLabel);
			const effects = requireRecord(option.effects, `${optionLabel} effects`);
			if (Object.keys(effects).length > 0) {
				throw new SaveDataError(`${optionLabel} effects must be empty for a system decision`);
			}
			return {
				id: requireString(option.id, `${optionLabel} id`),
				label: requireString(option.label, `${optionLabel} label`),
				description: requireString(option.description, `${optionLabel} description`)
			};
		}
	);
	return { kind: 'system', id, title, context, expiresOnDay, options };
}

function migrateV11StrategicEffects(
	eventId: LegacyStrategicEventId,
	optionId: string,
	effects: Record<string, unknown>,
	label: string
): Array<Record<string, unknown>> {
	if (eventId === 'cash-pressure' && optionId === 'short-loan') {
		requireExactKeys(effects, ['finance', 'profit', 'marketPosition'], label);
		const finance = requireRecord(effects.finance, `${label} finance`);
		requireExactKeys(finance, DECISION_FINANCE_EFFECT_FIELDS, `${label} finance`);
		if (finance.kind !== 'borrow' || finance.purpose !== 'emergency' || finance.termDays !== 56) {
			throw new SaveDataError(`${label} finance must be a 56-day emergency borrow`);
		}
		const amount = requireNumber(finance.amount, `${label} finance amount`);
		if (!Number.isInteger(amount) || amount < 4_000 || amount > 12_000 || amount % 1_000 !== 0) {
			throw new SaveDataError(`${label} finance amount must be a generated emergency principal`);
		}
		requireLegacyExactNumber(effects, 'profit', -4, label);
		requireLegacyExactNumber(effects, 'marketPosition', -1, label);
		return [
			{ kind: 'finance-borrow', purpose: 'emergency', amount, termDays: 56 },
			{ kind: 'score-adjust', score: 'profit', amount: -4 },
			{ kind: 'score-adjust', score: 'marketPosition', amount: -1 }
		];
	}
	if (eventId === 'cash-pressure' && optionId === 'cut-costs') {
		requireExactKeys(
			effects,
			['cash', 'customerSatisfaction', 'staffMorale', 'stockHealth'],
			label
		);
		requireLegacyExactNumber(effects, 'cash', 5_500, label);
		requireLegacyExactNumber(effects, 'customerSatisfaction', -4, label);
		requireLegacyExactNumber(effects, 'staffMorale', -5, label);
		requireLegacyExactNumber(effects, 'stockHealth', -8, label);
		return [
			{ kind: 'cash-adjust', amount: 5_500 },
			{ kind: 'score-adjust', score: 'customerSatisfaction', amount: -4 },
			{ kind: 'score-adjust', score: 'staffMorale', amount: -5 },
			{ kind: 'store-morale-adjust', scope: 'all-stores', amount: -5 },
			{
				kind: 'store-stock-adjust-by-target-percent',
				scope: 'all-stores',
				percent: -8
			}
		];
	}
	if (eventId === 'cash-pressure' && optionId === 'hold-course') {
		requireExactKeys(effects, ['profit', 'staffMorale'], label);
		requireLegacyExactNumber(effects, 'profit', 1, label);
		requireLegacyExactNumber(effects, 'staffMorale', -2, label);
		return [
			{ kind: 'score-adjust', score: 'profit', amount: 1 },
			{ kind: 'score-adjust', score: 'staffMorale', amount: -2 },
			{ kind: 'store-morale-adjust', scope: 'all-stores', amount: -2 }
		];
	}
	if (eventId === 'expansion-opportunity' && optionId === 'prepare') {
		requireExactKeys(effects, ['cash', 'marketPosition', 'profit'], label);
		requireLegacyExactNumber(effects, 'cash', -3_500, label);
		requireLegacyExactNumber(effects, 'marketPosition', 5, label);
		requireLegacyExactNumber(effects, 'profit', -1, label);
		return [
			{ kind: 'cash-adjust', amount: -3_500 },
			{ kind: 'score-adjust', score: 'marketPosition', amount: 5 },
			{ kind: 'score-adjust', score: 'profit', amount: -1 }
		];
	}
	if (eventId === 'expansion-opportunity' && optionId === 'pass') {
		requireExactKeys(effects, ['profit', 'staffMorale'], label);
		requireLegacyExactNumber(effects, 'profit', 1, label);
		requireLegacyExactNumber(effects, 'staffMorale', 1, label);
		return [
			{ kind: 'score-adjust', score: 'profit', amount: 1 },
			{ kind: 'score-adjust', score: 'staffMorale', amount: 1 },
			{ kind: 'store-morale-adjust', scope: 'all-stores', amount: 1 }
		];
	}
	if (eventId === 'supplier-terms' && optionId === 'negotiate-credit') {
		requireExactKeys(effects, ['finance', 'profit'], label);
		const finance = requireRecord(effects.finance, `${label} finance`);
		requireExactKeys(finance, DECISION_FINANCE_EFFECT_FIELDS, `${label} finance`);
		if (
			finance.kind !== 'borrow' ||
			finance.purpose !== 'supplierCredit' ||
			finance.amount !== 4_000 ||
			finance.termDays !== 28
		) {
			throw new SaveDataError(`${label} finance must be the fixed 28-day supplier credit`);
		}
		requireLegacyExactNumber(effects, 'profit', -2, label);
		return [
			{ kind: 'finance-borrow', purpose: 'supplierCredit', amount: 4_000, termDays: 28 },
			{ kind: 'score-adjust', score: 'profit', amount: -2 }
		];
	}
	if (eventId === 'supplier-terms' && optionId === 'bulk-discount') {
		requireExactKeys(effects, ['cash', 'profit', 'stockHealth'], label);
		requireLegacyExactNumber(effects, 'cash', -2_500, label);
		requireLegacyExactNumber(effects, 'profit', 3, label);
		requireLegacyExactNumber(effects, 'stockHealth', 6, label);
		return [
			{ kind: 'cash-adjust', amount: -2_500 },
			{ kind: 'score-adjust', score: 'profit', amount: 3 },
			{
				kind: 'store-stock-adjust-by-target-percent',
				scope: 'all-stores',
				percent: 6
			}
		];
	}
	throw new SaveDataError(`${label} is not a supported v11 strategic option`);
}

function requireLegacyExactNumber(
	value: Record<string, unknown>,
	key: string,
	expected: number,
	label: string
): void {
	const actual = requireNumber(value[key], `${label} ${key}`);
	if (actual !== expected) {
		throw new SaveDataError(`${label} ${key} must be ${expected}`);
	}
}

function migrateV11SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	return { ...(record as Record<string, unknown>), schemaVersion: 12 };
}

function migrateV12Game(value: unknown): unknown {
	if (!isV12MigrationGameShape(value)) return value;

	const game = value as GameState;
	assertV12EntityCityOwnership(game);
	const legacyMaterials = readV12WarehouseMaterials(game.warehouse);
	const eligible = getV12EligibleCityInventories(game);
	const cityInventories = allocateLegacyWarehouseMaterials(game, eligible, legacyMaterials);
	const primaryCityId = selectV12PrimaryCity(game, cityInventories);
	const retailSupplyAssignments = getV12DefaultRetailSupplyAssignments(game, primaryCityId);

	assertV12MaterialConservation(legacyMaterials, cityInventories);
	const migratedGame = {
		...game,
		cityInventories,
		retailSupplyAssignments,
		// The staged global field is a projection after this point, never a
		// second source of stock truth.
		warehouse: projectCityInventoriesToLegacyWarehouse(cityInventories)
	};
	return {
		...migratedGame,
		reports: migrateV12Reports(game.reports, migratedGame, primaryCityId)
	};
}

function migrateV12SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	return { ...(record as Record<string, unknown>), schemaVersion: 13 };
}

function isV12MigrationGameShape(value: unknown): value is GameState {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const game = value as Record<string, unknown>;
	if (
		typeof game.world !== 'object' ||
		game.world === null ||
		Array.isArray(game.world) ||
		!Array.isArray((game.world as Record<string, unknown>).openedCityIds) ||
		!Array.isArray(game.cities) ||
		!Array.isArray(game.industryCities) ||
		!Array.isArray(game.stores) ||
		!Array.isArray(game.industrialBuildings)
	) {
		return false;
	}

	return [game.cities, game.industryCities, game.stores, game.industrialBuildings].every(
		(entries) =>
			entries.every((entry) => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
	);
}

function assertV12EntityCityOwnership(game: GameState): void {
	const issue = findEntityCityOwnershipIssues(game)[0];
	if (!issue) return;

	const collection = issue.kind === 'store' ? 'stores' : 'industrialBuildings';
	const entities = issue.kind === 'store' ? game.stores : game.industrialBuildings;
	const index = entities.findIndex((entity) => entity.id === issue.entityId);
	throw new SaveDataError(
		`Saved v12 game ${collection}[${Math.max(index, 0)}] must belong to an opened city (found ${issue.cityId})`,
		'invariant-entity-city-ownership'
	);
}

function readV12WarehouseMaterials(
	warehouse: GameState['warehouse']
): Partial<Record<MaterialId, number>> {
	if (
		typeof warehouse !== 'object' ||
		warehouse === null ||
		Array.isArray(warehouse) ||
		typeof warehouse.materials !== 'object' ||
		warehouse.materials === null ||
		Array.isArray(warehouse.materials)
	) {
		cityInventoryInvariant('Saved v12 game warehouse materials must be an object');
	}

	return { ...(warehouse.materials as Partial<Record<MaterialId, number>>) };
}

function getV12EligibleCityInventories(game: GameState) {
	const openedCityIds = new Set(
		game.world.openedCityIds.filter(
			(cityId): cityId is WorldCityId =>
				typeof cityId === 'string' && getWorldCityDefinition(cityId)?.kind === 'industry'
		)
	);
	const materializedIndustryCityIds = new Set(
		game.industryCities
			.filter((city) => typeof city.id === 'string')
			.map((city) => city.id as WorldCityId)
	);
	const eligibleCityIds = [...openedCityIds]
		.filter(
			(cityId) => materializedIndustryCityIds.has(cityId) && supportsCityInventory(game, cityId)
		)
		.sort(compareWorldCityIds);

	return eligibleCityIds.map((cityId) => ({
		...createEmptyCityInventory(cityId),
		capacity: getV12CityWarehouseCapacity(game, cityId)
	}));
}

function getV12CityWarehouseCapacity(game: GameState, cityId: WorldCityId): number {
	return game.industrialBuildings.reduce((capacity, building) => {
		if (building.cityId !== cityId) return capacity;
		const buildingCapacity = INDUSTRIAL_BUILDING_TYPES[building.typeId]?.warehouseCapacity ?? 0;
		if (!Number.isSafeInteger(buildingCapacity) || buildingCapacity < 0) {
			cityInventoryInvariant(`Saved v12 game ${building.id} warehouse capacity must be safe`);
		}
		return addCityInventorySafeInteger(
			capacity,
			buildingCapacity,
			`Saved v12 game ${cityId} warehouse capacity`
		);
	}, 0);
}

function selectV12PrimaryCity(
	game: GameState,
	eligible: readonly { cityId: WorldCityId; capacity: number }[]
): WorldCityId | null {
	if (eligible.length === 0) return null;

	return [...eligible].sort((left, right) => {
		if (left.capacity !== right.capacity) return left.capacity > right.capacity ? -1 : 1;
		const leftIsActive = left.cityId === game.activeIndustryCityId;
		const rightIsActive = right.cityId === game.activeIndustryCityId;
		if (leftIsActive !== rightIsActive) return leftIsActive ? -1 : 1;
		return compareWorldCityIds(left.cityId, right.cityId);
	})[0]!.cityId;
}

function getV12DefaultRetailSupplyAssignments(game: GameState, primaryCityId: WorldCityId | null) {
	const materializedRetailCityIds = new Set(
		game.cities.filter((city) => typeof city.id === 'string').map((city) => city.id as WorldCityId)
	);

	return game.world.openedCityIds
		.filter(
			(cityId): cityId is WorldCityId =>
				typeof cityId === 'string' &&
				getWorldCityDefinition(cityId)?.kind === 'retail' &&
				materializedRetailCityIds.has(cityId)
		)
		.sort(compareWorldCityIds)
		.map((retailCityId) => ({ retailCityId, supplyCityId: primaryCityId }));
}

function assertV12MaterialConservation(
	legacyMaterials: Partial<Record<MaterialId, number>>,
	cityInventories: readonly { materials: Partial<Record<MaterialId, number>> }[]
): void {
	for (const [materialId, quantity] of Object.entries(legacyMaterials)) {
		if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 0) {
			cityInventoryInvariant(`Saved v12 game warehouse materials ${materialId} must be safe`);
		}
		const allocated = cityInventories.reduce(
			(total, inventory) =>
				addCityInventorySafeInteger(
					total,
					inventory.materials[materialId as MaterialId] ?? 0,
					`Saved v12 game warehouse materials ${materialId} allocation`
				),
			0
		);
		if (allocated !== quantity) {
			cityInventoryInvariant(
				`Saved v12 game warehouse materials ${materialId} must be conserved during migration`
			);
		}
	}
}

function migrateV12Reports(
	reports: unknown,
	game: GameState,
	primaryCityId: WorldCityId | null
): unknown {
	if (!Array.isArray(reports)) return reports;
	return reports.map((report) => migrateV12Report(report, game, primaryCityId));
}

function migrateV12Report(
	value: unknown,
	game: GameState,
	primaryCityId: WorldCityId | null
): unknown {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
	const report = value as Record<string, unknown>;
	const storeReports = migrateV12StoreReports(report.storeReports);

	return {
		...report,
		storeReports,
		productionReport: migrateV12ProductionReport(
			report.productionReport,
			storeReports,
			game,
			primaryCityId
		)
	};
}

function migrateV12StoreReports(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	return value.map((storeReport) => {
		if (typeof storeReport !== 'object' || storeReport === null || Array.isArray(storeReport)) {
			return storeReport;
		}
		const report = storeReport as Record<string, unknown>;
		const productReports = Array.isArray(report.productReports)
			? report.productReports.map((productReport) => {
					if (
						typeof productReport !== 'object' ||
						productReport === null ||
						Array.isArray(productReport)
					) {
						return productReport;
					}
					return {
						...(productReport as Record<string, unknown>),
						replenishmentOutcome: null
					};
				})
			: report.productReports;

		return {
			...report,
			productReports,
			// A v12 report has no supply-assignment history. The migration must
			// preserve that absence even when its legacy numeric refill fields are
			// nonzero.
			replenishment: null
		};
	});
}

function migrateV12ProductionReport(
	value: unknown,
	storeReports: unknown,
	game: GameState,
	primaryCityId: WorldCityId | null
): unknown {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
	const productionReport = value as Record<string, unknown>;
	const buildingCityIds = new Map(
		game.industrialBuildings.map((building) => [building.id, building.cityId as WorldCityId])
	);

	return {
		...productionReport,
		produced: migrateV12IndustryMovements(productionReport.produced, primaryCityId),
		consumed: migrateV12IndustryMovements(productionReport.consumed, primaryCityId),
		importedInputs: migrateV12IndustryMovements(productionReport.importedInputs, primaryCityId),
		warehousePulls: migrateV12IndustryMovements(productionReport.warehousePulls, primaryCityId),
		shopImports: migrateV12ShopImports(productionReport.shopImports, storeReports, game),
		railShipments: migrateV12RailShipments(
			productionReport.railShipments,
			buildingCityIds,
			primaryCityId
		),
		cityInventories: createV12ProductionCloseSummaries(productionReport, game, primaryCityId)
	};
}

function migrateV12IndustryMovements(value: unknown, primaryCityId: WorldCityId | null): unknown {
	if (!Array.isArray(value) || primaryCityId === null) return value;
	return value.map((movement) => {
		if (typeof movement !== 'object' || movement === null || Array.isArray(movement)) {
			return movement;
		}
		const record = movement as Record<string, unknown>;
		return Object.hasOwn(record, 'cityId') ? record : { ...record, cityId: primaryCityId };
	});
}

function migrateV12RailShipments(
	value: unknown,
	buildingCityIds: ReadonlyMap<string, WorldCityId>,
	primaryCityId: WorldCityId | null
): unknown {
	if (!Array.isArray(value)) return value;
	return value.map((shipment) => {
		if (typeof shipment !== 'object' || shipment === null || Array.isArray(shipment)) {
			return shipment;
		}
		const record = shipment as Record<string, unknown>;
		const fromCityId =
			typeof record.fromId === 'string' ? buildingCityIds.get(record.fromId) : undefined;
		const toCityId = typeof record.toId === 'string' ? buildingCityIds.get(record.toId) : undefined;
		if (fromCityId && toCityId && fromCityId !== toCityId) {
			reportAttributionInvariant(
				'Saved v12 rail shipment has conflicting recoverable industrial-city references'
			);
		}
		const recoveredCityId = fromCityId ?? toCityId;
		if (recoveredCityId) return { ...record, cityId: recoveredCityId };
		if (Object.hasOwn(record, 'cityId') || primaryCityId === null) return record;
		return { ...record, cityId: primaryCityId };
	});
}

interface V12RetailImportEvidence {
	cityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	value: number;
}

function migrateV12ShopImports(value: unknown, storeReports: unknown, game: GameState): unknown {
	if (!Array.isArray(value)) return value;
	const evidence = getV12RetailImportEvidence(storeReports, game);
	if (evidence === null) {
		if (value.length > 0) {
			reportAttributionInvariant(
				'Saved v12 shop imports cannot be attributed without recoverable store report evidence'
			);
		}
		return value;
	}
	const canonicalEvidence = [...evidence].sort(compareV12RetailImportEvidence);

	if (value.length === 0) {
		return canonicalEvidence.map((entry) => {
			return {
				cityId: entry.cityId,
				materialId: entry.materialId,
				quantity: entry.quantity,
				value: entry.value,
				source: 'import'
			};
		});
	}

	const evidenceByMovementKey = new Map<string, V12RetailImportEvidence[]>();
	for (const entry of canonicalEvidence) {
		const key = getV12ShopImportEvidenceKey(entry.materialId, entry.quantity, entry.value)!;
		const bucket = evidenceByMovementKey.get(key) ?? [];
		bucket.push(entry);
		evidenceByMovementKey.set(key, bucket);
	}

	const migrated = value.map((movement, index) => {
		if (typeof movement !== 'object' || movement === null || Array.isArray(movement)) {
			reportAttributionInvariant(`Saved v12 shop imports[${index}] must be an object`);
		}
		const record = movement as Record<string, unknown>;
		const key = getV12ShopImportEvidenceKey(record.materialId, record.quantity, record.value);
		if (key === null) {
			reportAttributionInvariant(
				`Saved v12 shop imports[${index}] cannot be reconciled with recoverable material, quantity, and value evidence`
			);
		}
		const entry = evidenceByMovementKey.get(key)?.shift();
		if (!entry) {
			reportAttributionInvariant(
				`Saved v12 shop imports[${index}] cannot be reconciled with recoverable material, quantity, and value evidence`
			);
		}
		return { ...record, cityId: entry.cityId };
	});
	if ([...evidenceByMovementKey.values()].some((entries) => entries.length > 0)) {
		reportAttributionInvariant(
			'Saved v12 shop imports cannot be reconciled with recoverable store report evidence counts'
		);
	}
	return migrated;
}

function getV12RetailImportEvidence(
	storeReports: unknown,
	game: GameState
): V12RetailImportEvidence[] | null {
	if (!Array.isArray(storeReports)) return null;
	const evidence: V12RetailImportEvidence[] = [];
	for (const storeReport of storeReports) {
		if (typeof storeReport !== 'object' || storeReport === null || Array.isArray(storeReport)) {
			return null;
		}
		const report = storeReport as Record<string, unknown>;
		const storeId = typeof report.storeId === 'string' ? report.storeId : null;
		const store =
			storeId === null ? undefined : game.stores.find((candidate) => candidate.id === storeId);
		if (!store || !Array.isArray(report.productReports)) return null;
		for (const productReport of report.productReports) {
			if (
				typeof productReport !== 'object' ||
				productReport === null ||
				Array.isArray(productReport)
			) {
				return null;
			}
			const product = productReport as Record<string, unknown>;
			if (!isV12SafeNonnegativeInteger(product.importedUnits)) return null;
			if (product.importedUnits === 0) continue;
			if (
				typeof product.categoryId !== 'string' ||
				!isV12SafeNonnegativeInteger(product.importSpend)
			) {
				return null;
			}
			const materialId = getFinishedMaterialIdForCategory(product.categoryId);
			if (materialId === null) {
				reportAttributionInvariant(
					`Saved v12 shop import category ${product.categoryId} cannot be attributed to a finished material`
				);
			}
			evidence.push({
				cityId: store.cityId as WorldCityId,
				materialId,
				quantity: product.importedUnits,
				value: product.importSpend
			});
		}
	}
	return evidence;
}

function compareV12RetailImportEvidence(
	left: V12RetailImportEvidence,
	right: V12RetailImportEvidence
): number {
	const cityOrder = compareWorldCityIds(left.cityId, right.cityId);
	if (cityOrder !== 0) return cityOrder;
	if (left.materialId < right.materialId) return -1;
	if (left.materialId > right.materialId) return 1;
	if (left.quantity !== right.quantity) return left.quantity - right.quantity;
	return left.value - right.value;
}

function getV12ShopImportEvidenceKey(
	materialId: unknown,
	quantity: unknown,
	value: unknown
): string | null {
	if (
		typeof materialId !== 'string' ||
		!Object.hasOwn(MATERIALS, materialId) ||
		!isV12SafeNonnegativeInteger(quantity) ||
		!isV12SafeNonnegativeInteger(value)
	) {
		return null;
	}
	return `${materialId}\u0000${quantity}\u0000${value}`;
}

function createV12ProductionCloseSummaries(
	productionReport: Record<string, unknown>,
	game: GameState,
	primaryCityId: WorldCityId | null
): unknown {
	if (primaryCityId === null) return productionReport.cityInventories;
	const fields = ['warehouseCapacity', 'warehouseUsed', 'overflowUnits', 'overflowCost'] as const;
	if (!fields.every((field) => isV12SafeNonnegativeInteger(productionReport[field]))) {
		return productionReport.cityInventories;
	}
	const primarySummary = {
		cityId: primaryCityId,
		capacity: productionReport.warehouseCapacity,
		used: productionReport.warehouseUsed,
		overflowUnits: productionReport.overflowUnits,
		overflowCost: productionReport.overflowCost
	};
	if (primaryCityId === 'industry-city') return [primarySummary];
	if (!supportsCityInventory(game, 'industry-city')) {
		reportAttributionInvariant(
			'Saved v12 production close cannot reconcile a nonstarter primary without the starter industry city'
		);
	}
	return [
		{ cityId: 'industry-city', capacity: 0, used: 0, overflowUnits: 0, overflowCost: 0 },
		primarySummary
	];
}

function isV12SafeNonnegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Migrates a bare serialized game through every historical game-schema step.
 * Record metadata is deliberately excluded; it remains owned by the sandbox
 * save-record migration pipeline below.
 */
export function migrateSavedGame(value: unknown, sourceGameSchemaVersion: number): unknown {
	return withSaveDataBoundary('Game migration', () =>
		migrateSavedGameInternal(value, sourceGameSchemaVersion)
	);
}

function migrateSavedGameInternal(value: unknown, sourceGameSchemaVersion: number): unknown {
	const sourceGame = createPlainSnapshot(value, 'Saved game');
	if (
		sourceGameSchemaVersion !== SAVE_SCHEMA_VERSION &&
		!isMigratableSchemaVersion(sourceGameSchemaVersion)
	) {
		throw new SaveDataError(`Unsupported save schema version: ${sourceGameSchemaVersion}`);
	}

	let migrated = sourceGame;
	if (sourceGameSchemaVersion <= 4) migrated = migrateV4Game(migrated);
	if (sourceGameSchemaVersion <= 5) migrated = migrateV5Game(migrated);
	if (sourceGameSchemaVersion <= 6) migrated = migrateV6Game(migrated);
	// v7→v8 changed save-record metadata only.
	if (sourceGameSchemaVersion <= 8) migrated = migrateV8Game(migrated);
	if (sourceGameSchemaVersion <= 9) migrated = migrateV9Game(migrated);
	if (sourceGameSchemaVersion <= 10) migrated = migrateV10Game(migrated);
	if (sourceGameSchemaVersion <= 11) migrated = migrateV11Game(migrated);
	if (sourceGameSchemaVersion <= 12) migrated = migrateV12Game(migrated);

	return migrated;
}

/**
 * Bring the save-store envelope forward to the current schema. Nested records
 * retain their source versions so validateSaveRecord can migrate each bare
 * game and its record metadata exactly once.
 */
function migrateSaveStoreSnapshot(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return value;
	const snapshot = value as Record<string, unknown>;

	if (!isMigratableSchemaVersion(snapshot.schemaVersion)) return value;
	if (snapshot.schemaVersion === SAVE_SCHEMA_VERSION) return value;

	return {
		...snapshot,
		schemaVersion: SAVE_SCHEMA_VERSION
	};
}

/**
 * Migrate save-record metadata in historical order. Bare game migration is
 * deliberately handled by migrateSavedGame before sandbox normalization.
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
	if (migrated.schemaVersion === 10) {
		migrated = migrateV10SaveRecord(migrated) as Record<string, unknown>;
	}
	if (migrated.schemaVersion === 11) {
		migrated = migrateV11SaveRecord(migrated) as Record<string, unknown>;
	}
	if (migrated.schemaVersion === 12) {
		migrated = migrateV12SaveRecord(migrated) as Record<string, unknown>;
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
const DECISION_FINANCE_EFFECT_FIELDS = ['kind', 'purpose', 'amount', 'termDays'] as const;
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
	const migrated = migrateSaveStoreSnapshot(sourceStore);
	const record = requireRecord(migrated, 'Save store');
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
	const sourceRecord = requireRecord(sourceValue, 'Save record');
	const sourceSchemaVersion = requireNumber(
		sourceRecord.schemaVersion,
		'Save record schemaVersion'
	);
	const migratedGame = migrateSavedGame(sourceRecord.game, sourceSchemaVersion);
	const migrated = migrateSaveRecord(sourceRecord);
	const record = requireRecord(migrated, 'Save record');
	const schemaVersion = requireNumber(record.schemaVersion, 'Save record schemaVersion');

	if (schemaVersion !== SAVE_SCHEMA_VERSION) {
		throw new SaveDataError(`Unsupported save schema version: ${schemaVersion}`);
	}

	const metadata = requireRecord(record.metadata, 'Save metadata');
	const normalizedSandboxGame = normalizeSandboxSavedGame(migratedGame);
	const structurallyValidatedGame = validateCurrentGameStateInternal(normalizedSandboxGame, false);
	const normalizedCityInventoryGame = normalizeCityInventoryDerivedState(structurallyValidatedGame);
	const projectedWarehouseGame = projectCanonicalCityInventoriesToLegacyWarehouse(
		normalizedCityInventoryGame
	);
	const game = validateCurrentGameStateInternal(projectedWarehouseGame, true);
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

function projectCanonicalCityInventoriesToLegacyWarehouse(game: GameState): GameState {
	if (!game.cityInventories) return game;

	return {
		...game,
		warehouse: projectCityInventoriesToLegacyWarehouse(game.cityInventories)
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

function validateCurrentGameStateInternal(
	value: unknown,
	requireCurrentCityInventoryDerivedState = true
): GameState {
	const sourceGame = createPlainSnapshot(value, 'Saved game');
	const game = requireRecord(sourceGame, 'Saved game');
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
	validateCurrentCityInventories(currentGame, false);
	validateCurrentRetailSupplyAssignments(currentGame);
	validateCurrentIndustrialBuildingPlacements(industrialBuildings, industryCities);
	validateSavedWarehouse(game.warehouse, 'Saved game warehouse');
	validateCurrentRetailStorePlacements(stores, cities);
	if (requireCurrentCityInventoryDerivedState) {
		validateCurrentCityInventories(currentGame, true);
	}
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
	let previousReportDay: number | undefined;
	reports.forEach((report, index) => {
		const label = `Saved game reports[${index}]`;
		const reportDay = validateSavedReport(report, gameDay, label);
		validateCurrentReportCityAttribution(report, currentGame, label);
		if (previousReportDay !== undefined && reportDay <= previousReportDay) {
			throw new SaveDataError('Saved game report days must be strictly increasing and unique');
		}
		previousReportDay = reportDay;
	});
	validateSavedEventRuntime(game.events, gameDay, decisions, reports, 'Saved game events');
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

	if (requireCurrentCityInventoryDerivedState) {
		const expectedWarehouse = projectCityInventoriesToLegacyWarehouse(currentGame.cityInventories!);
		const expectedMaterials = expectedWarehouse.materials as Record<string, number | undefined>;
		const warehouseMaterialsMatch =
			Object.keys(currentGame.warehouse.materials).length ===
				Object.keys(expectedMaterials).length &&
			Object.entries(currentGame.warehouse.materials).every(
				([materialId, quantity]) => expectedMaterials[materialId] === quantity
			);
		if (
			currentGame.warehouse.capacity !== expectedWarehouse.capacity ||
			currentGame.warehouse.overflowUnits !== expectedWarehouse.overflowUnits ||
			currentGame.warehouse.overflowCost !== expectedWarehouse.overflowCost ||
			!warehouseMaterialsMatch
		) {
			throw new SaveDataError(
				'Saved game warehouse must be the one-way projection of authoritative city inventories',
				'invariant-warehouse'
			);
		}
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

function normalizeSandboxStoreStockHealth(store: unknown): unknown {
	if (typeof store !== 'object' || store === null) return store;
	const record = store as Record<string, unknown>;
	if (
		!Array.isArray(record.products) ||
		typeof record.stockHealth !== 'number' ||
		!Number.isFinite(record.stockHealth)
	) {
		return store;
	}

	const products: StoreProduct[] = [];
	for (const value of record.products) {
		if (typeof value !== 'object' || value === null) return store;
		const product = value as Record<string, unknown>;
		if (
			typeof product.categoryId !== 'string' ||
			typeof product.stock !== 'number' ||
			!Number.isFinite(product.stock) ||
			typeof product.reorderThreshold !== 'number' ||
			!Number.isFinite(product.reorderThreshold) ||
			typeof product.targetStock !== 'number' ||
			!Number.isFinite(product.targetStock) ||
			typeof product.sellingPrice !== 'number' ||
			!Number.isFinite(product.sellingPrice)
		) {
			return store;
		}
		products.push({
			categoryId: product.categoryId,
			stock: product.stock,
			reorderThreshold: product.reorderThreshold,
			targetStock: product.targetStock,
			sellingPrice: product.sellingPrice
		});
	}

	const stockHealth = calculateStockHealth(products);
	return record.stockHealth === stockHealth ? store : { ...record, stockHealth };
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

export function normalizeSandboxSavedGame(value: unknown): unknown {
	return withSaveDataBoundary('Sandbox save normalization', () =>
		normalizeSandboxSavedGameInternal(value)
	);
}

function normalizeSandboxSavedGameInternal(value: unknown): unknown {
	const sourceGame = createPlainSnapshot(value, 'Saved game');
	const game = requireRecord(sourceGame, 'Saved game');
	requireNumber(game.cash, 'Saved game cash');
	const normalizedWorld =
		game.world === undefined
			? inferWorldProgress(game)
			: validateSavedWorld(game.world, 'Saved game world');
	const normalizedStoreCap =
		game.storeCap === undefined
			? inferStoreCap(normalizedWorld, Array.isArray(game.stores) ? game.stores.length : 0)
			: game.storeCap;

	const normalizedStores = Array.isArray(game.stores)
		? game.stores
				.map((store) => normalizeSavedStoreLevel(store))
				.map((store) => normalizeSandboxStoreStockHealth(store))
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

	let normalizedGame = {
		...game,
		cities: normalizeSavedCityTileFeatures(normalizedCities.cities),
		stores: normalizedRetailStores,
		staff: normalizedStaff,
		industrialBuildings: normalizedBuildings,
		world: normalizedWorld,
		storeCap: normalizedStoreCap
	} as GameState;
	normalizedGame = normalizeSandboxWarehouseState(normalizedGame);

	if (canRefreshSandboxWorldProgress(normalizedGame)) {
		normalizedGame = refreshWorldProgress(normalizedGame);
	}

	return {
		...normalizedGame,
		industrialBuildings: Array.isArray(normalizedGame.industrialBuildings)
			? normalizedGame.industrialBuildings.map(normalizeSandboxBuildingInventory)
			: normalizedGame.industrialBuildings
	};
}

function normalizeSandboxWarehouseState(game: GameState): GameState {
	if (
		typeof game.warehouse !== 'object' ||
		game.warehouse === null ||
		Array.isArray(game.warehouse) ||
		!Array.isArray(game.industrialBuildings) ||
		!game.industrialBuildings.every(
			(building) =>
				typeof building === 'object' && building !== null && typeof building.typeId === 'string'
		)
	) {
		return game;
	}

	const warehouse = game.warehouse as unknown as Record<string, unknown>;
	if (
		typeof warehouse.capacity !== 'number' ||
		!Number.isFinite(warehouse.capacity) ||
		typeof warehouse.overflowUnits !== 'number' ||
		!Number.isFinite(warehouse.overflowUnits) ||
		typeof warehouse.overflowCost !== 'number' ||
		!Number.isFinite(warehouse.overflowCost) ||
		typeof warehouse.materials !== 'object' ||
		warehouse.materials === null ||
		Array.isArray(warehouse.materials)
	) {
		return game;
	}
	const materials = warehouse.materials as Record<string, unknown>;
	if (
		Object.values(materials).some(
			(quantity) => typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0
		)
	) {
		return game;
	}

	const normalizedWarehouse = recalculateWarehousePressure({
		...(game.warehouse as GameState['warehouse']),
		capacity: getWarehouseCapacity(game),
		materials: { ...game.warehouse.materials }
	});
	if (
		game.warehouse.capacity === normalizedWarehouse.capacity &&
		game.warehouse.overflowUnits === normalizedWarehouse.overflowUnits &&
		game.warehouse.overflowCost === normalizedWarehouse.overflowCost
	) {
		return game;
	}

	return { ...game, warehouse: normalizedWarehouse };
}

function normalizeSavedCityTileFeatures(cities: unknown): unknown {
	if (!Array.isArray(cities)) return cities;

	return cities.map((city) => {
		if (typeof city !== 'object' || city === null) return city;
		const cityRecord = city as Record<string, unknown>;
		if (!Array.isArray(cityRecord.tiles)) return city;
		let changed = false;
		const tiles = cityRecord.tiles.map((tile) => {
			if (typeof tile !== 'object' || tile === null) return tile;
			const tileRecord = tile as Record<string, unknown>;
			if (tileRecord.feature !== undefined) return tile;
			changed = true;
			return { ...tileRecord, feature: null };
		});
		return changed ? { ...cityRecord, tiles } : city;
	});
}

function canRefreshSandboxWorldProgress(game: GameState): boolean {
	if (
		typeof game.cash !== 'number' ||
		!Number.isFinite(game.cash) ||
		typeof game.day !== 'number' ||
		!Number.isFinite(game.day) ||
		!Array.isArray(game.stores) ||
		!Array.isArray(game.industrialBuildings) ||
		!game.industrialBuildings.every(
			(building) => typeof building === 'object' && building !== null
		) ||
		!Array.isArray(game.reports) ||
		!game.reports.every((report) => typeof report === 'object' && report !== null) ||
		(game.cityInventories !== undefined &&
			(!Array.isArray(game.cityInventories) ||
				!game.cityInventories.every(
					(inventory) => typeof inventory === 'object' && inventory !== null
				))) ||
		(game.retailSupplyAssignments !== undefined &&
			(!Array.isArray(game.retailSupplyAssignments) ||
				!game.retailSupplyAssignments.every(
					(assignment) => typeof assignment === 'object' && assignment !== null
				))) ||
		typeof game.warehouse !== 'object' ||
		game.warehouse === null ||
		typeof game.warehouse.materials !== 'object' ||
		game.warehouse.materials === null ||
		Object.values(game.warehouse.materials).some(
			(quantity) => typeof quantity !== 'number' || !Number.isFinite(quantity)
		) ||
		game.reports.some(
			(report) => typeof report.netIncome !== 'number' || !Number.isFinite(report.netIncome)
		)
	) {
		return false;
	}

	const latestReport = game.reports.at(-1);
	return (
		latestReport === undefined ||
		(typeof latestReport.productionReport === 'object' &&
			latestReport.productionReport !== null &&
			Array.isArray(latestReport.productionReport.produced) &&
			latestReport.productionReport.produced.every(
				(movement) => typeof movement === 'object' && movement !== null
			))
	);
}

function normalizeSandboxBuildingInventory(building: unknown): unknown {
	if (typeof building !== 'object' || building === null) return building;
	const record = building as Record<string, unknown>;
	const buildingType =
		typeof record.typeId === 'string'
			? INDUSTRIAL_BUILDING_TYPES[record.typeId as IndustrialBuildingTypeId]
			: undefined;
	if (
		!buildingType ||
		typeof record.inventory !== 'object' ||
		record.inventory === null ||
		Array.isArray(record.inventory)
	) {
		return building;
	}
	const inventory = record.inventory as Record<string, unknown>;
	if (
		Object.entries(inventory).some(
			([materialId, quantity]) =>
				!MATERIAL_ID_SET.has(materialId) ||
				typeof quantity !== 'number' ||
				!Number.isFinite(quantity) ||
				quantity < 0
		)
	) {
		return building;
	}

	return {
		...record,
		inventory: clampInventoryToRecipe(
			inventory as GameState['industrialBuildings'][number]['inventory'],
			buildingType
		)
	};
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
	normalizeSavedRetailStorePlacements(stores, cities, new Set(), false, (index) => {
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

function reportAttributionInvariant(message: string): never {
	throw new SaveDataError(message, 'invariant-report-attribution');
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

function validateCurrentCityInventories(game: GameState, requireDerivedState: boolean): void {
	if (!Array.isArray(game.cityInventories)) {
		cityInventoryInvariant('Saved game cityInventories must be an array');
	}

	const inventories = game.cityInventories;
	const seenCityIds = new Set<WorldCityId>();
	const projectedMaterialTotals = new Map<string, number>();
	let previousCityId: WorldCityId | undefined;
	for (const [index, value] of inventories.entries()) {
		const label = `Saved game cityInventories[${index}]`;
		const inventory = requireCityInventoryRecord(value, label);
		const cityId = resolveCurrentInventoryCityId(game, inventory.cityId, `${label} cityId`);
		if (seenCityIds.has(cityId)) {
			cityInventoryInvariant(`${label} cityId must be unique: ${cityId}`);
		}
		if (previousCityId !== undefined && compareWorldCityIds(previousCityId, cityId) >= 0) {
			cityInventoryInvariant(`${label} cityId must be in canonical world-city order`);
		}
		seenCityIds.add(cityId);
		previousCityId = cityId;

		requireCityInventorySafeInteger(inventory.capacity, `${label} capacity`);
		requireCityInventorySafeInteger(inventory.overflowUnits, `${label} overflowUnits`);
		requireCityInventorySafeInteger(inventory.overflowCost, `${label} overflowCost`);
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
			projectedMaterialTotals.set(
				materialId,
				addCityInventorySafeInteger(
					projectedMaterialTotals.get(materialId) ?? 0,
					materialQuantity,
					`Saved game cityInventories projected materials ${materialId}`
				)
			);
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

	if (!requireDerivedState) return;
	const normalized = normalizeCityInventoryDerivedState(game).cityInventories!;
	for (const [index, inventory] of inventories.entries()) {
		const expected = normalized[index]!;
		if (
			inventory.capacity !== expected.capacity ||
			inventory.overflowUnits !== expected.overflowUnits ||
			inventory.overflowCost !== expected.overflowCost
		) {
			cityInventoryInvariant(
				`Saved game cityInventories[${index}] derived capacity and pressure must match current buildings and materials`
			);
		}
	}
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
	let previousRetailCityId: WorldCityId | undefined;
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
		if (
			previousRetailCityId !== undefined &&
			compareWorldCityIds(previousRetailCityId, retailCityId) >= 0
		) {
			retailSupplyInvariant(`${label} retailCityId must be in canonical world-city order`);
		}
		seenRetailCityIds.add(retailCityId);
		previousRetailCityId = retailCityId;

		if (assignment.supplyCityId !== null) {
			if (typeof assignment.supplyCityId !== 'string' || assignment.supplyCityId.length === 0) {
				retailSupplyInvariant(`${label} supplyCityId must be a city ID or null`);
			}
			const supply = getWorldCityDefinition(assignment.supplyCityId);
			if (!supply || supply.kind !== 'industry') {
				retailSupplyInvariant(`${label} supplyCityId must reference a known industry city`);
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
	if (definition?.kind === 'retail' && city.width === 28 && city.height === 24) {
		throw new SaveDataError(`${label} uses the legacy 28x24 sandbox city size`);
	}
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

function validateSavedReport(value: unknown, gameDay: number, label: string): number {
	const report = requireRecord(value, label);

	const day = requireNonNegativeInteger(report.day, `${label} day`);
	if (day > gameDay) throw new SaveDataError(`${label} day must not be after the game day`);
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
	return day;
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

function resolveCurrentReportCityId(
	game: GameState,
	value: unknown,
	expectedKind: 'retail' | 'industry',
	label: string
): WorldCityId {
	if (typeof value !== 'string' || value.length === 0) {
		return reportAttributionInvariant(`${label} must reference a ${expectedKind} city`);
	}
	const definition = getWorldCityDefinition(value);
	if (!definition || definition.kind !== expectedKind) {
		return reportAttributionInvariant(`${label} must reference a known ${expectedKind} city`);
	}
	if (!game.world.openedCityIds.includes(definition.id)) {
		return reportAttributionInvariant(`${label} must reference an opened ${expectedKind} city`);
	}
	const materialized =
		expectedKind === 'retail'
			? game.cities.some((city) => city.id === definition.id)
			: game.industryCities.some((city) => city.id === definition.id);
	if (!materialized) {
		return reportAttributionInvariant(
			`${label} must reference a materialized ${expectedKind} city`
		);
	}
	return definition.id;
}

function requireCurrentReportSafeInteger(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return reportAttributionInvariant(`${label} must be a finite number`);
	}
	if (!Number.isSafeInteger(value) || value < 0) {
		return reportAttributionInvariant(`${label} must be a non-negative safe integer`);
	}
	return value;
}

function addCurrentReportSafeInteger(total: number, value: number, label: string): number {
	if (value > Number.MAX_SAFE_INTEGER - total) {
		return reportAttributionInvariant(`${label} must not exceed the safe-integer range`);
	}
	return total + value;
}

function multiplyCurrentReportSafeInteger(left: number, right: number, label: string): number {
	if (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left)) {
		return reportAttributionInvariant(`${label} must not exceed the safe-integer range`);
	}
	return left * right;
}

function validateCurrentAttributedMovementArray(
	value: unknown,
	game: GameState,
	expectedKind: 'retail' | 'industry',
	label: string
): void {
	const movements = requireArray(value, label);
	for (const [index, movementValue] of movements.entries()) {
		const movement = requireRecord(movementValue, `${label}[${index}]`);
		resolveCurrentReportCityId(game, movement.cityId, expectedKind, `${label}[${index}] cityId`);
	}
}

function validateCurrentProductionCloseInventories(
	value: unknown,
	game: GameState,
	label: string
): { capacity: number; used: number; overflowUnits: number; overflowCost: number } {
	if (!Array.isArray(value)) {
		reportAttributionInvariant(`${label} must be an array`);
	}
	const summaries = value;
	if (summaries.length === 0) {
		reportAttributionInvariant(`${label} must contain at least the starter-city summary`);
	}
	const seenCityIds = new Set<WorldCityId>();
	const totals = { capacity: 0, used: 0, overflowUnits: 0, overflowCost: 0 };
	let previousCityId: WorldCityId | undefined;
	for (const [index, summaryValue] of summaries.entries()) {
		const summaryLabel = `${label}[${index}]`;
		const summary = requireRecord(summaryValue, summaryLabel);
		const cityId = resolveCurrentReportCityId(
			game,
			summary.cityId,
			'industry',
			`${summaryLabel} cityId`
		);
		if (seenCityIds.has(cityId)) {
			reportAttributionInvariant(`${summaryLabel} cityId must be unique: ${cityId}`);
		}
		if (previousCityId !== undefined && compareWorldCityIds(previousCityId, cityId) >= 0) {
			reportAttributionInvariant(`${summaryLabel} cityId must be in canonical world-city order`);
		}
		seenCityIds.add(cityId);
		previousCityId = cityId;
		const capacity = requireCurrentReportSafeInteger(summary.capacity, `${summaryLabel} capacity`);
		const used = requireCurrentReportSafeInteger(summary.used, `${summaryLabel} used`);
		const overflowUnits = requireCurrentReportSafeInteger(
			summary.overflowUnits,
			`${summaryLabel} overflowUnits`
		);
		const overflowCost = requireCurrentReportSafeInteger(
			summary.overflowCost,
			`${summaryLabel} overflowCost`
		);
		const expectedOverflowUnits = Math.max(0, used - capacity);
		if (overflowUnits !== expectedOverflowUnits) {
			reportAttributionInvariant(`${summaryLabel} overflowUnits must reconcile with used capacity`);
		}
		const expectedOverflowCost = multiplyCurrentReportSafeInteger(
			expectedOverflowUnits,
			WAREHOUSE_OVERFLOW_COST_PER_UNIT,
			`${summaryLabel} overflowCost`
		);
		if (overflowCost !== expectedOverflowCost) {
			reportAttributionInvariant(`${summaryLabel} overflowCost must reconcile with overflow units`);
		}
		totals.capacity = addCurrentReportSafeInteger(
			totals.capacity,
			capacity,
			`${label} capacity aggregate`
		);
		totals.used = addCurrentReportSafeInteger(totals.used, used, `${label} used aggregate`);
		totals.overflowUnits = addCurrentReportSafeInteger(
			totals.overflowUnits,
			overflowUnits,
			`${label} overflowUnits aggregate`
		);
		totals.overflowCost = addCurrentReportSafeInteger(
			totals.overflowCost,
			overflowCost,
			`${label} overflowCost aggregate`
		);
	}
	if (!seenCityIds.has('industry-city')) {
		reportAttributionInvariant(`${label} must include the starter industry-city summary`);
	}

	return totals;
}

function validateCurrentProductionCloseAggregate(
	productionReport: Record<string, unknown>,
	totals: { capacity: number; used: number; overflowUnits: number; overflowCost: number },
	label: string
): void {
	const aggregateFields = [
		['warehouseCapacity', totals.capacity],
		['warehouseUsed', totals.used],
		['overflowUnits', totals.overflowUnits],
		['overflowCost', totals.overflowCost]
	] as const;
	for (const [field, expected] of aggregateFields) {
		const actual = requireCurrentReportSafeInteger(productionReport[field], `${label} ${field}`);
		if (actual !== expected) {
			reportAttributionInvariant(`${label} ${field} must reconcile with city-inventory summaries`);
		}
	}
}

function validateCurrentReplenishmentCityId(
	value: unknown,
	expectedKind: 'retail' | 'industry',
	label: string
): WorldCityId {
	if (typeof value !== 'string' || value.length === 0) {
		return retailSupplyInvariant(`${label} must reference a ${expectedKind} city`);
	}
	const definition = getWorldCityDefinition(value);
	if (!definition || definition.kind !== expectedKind) {
		return retailSupplyInvariant(`${label} must reference a known ${expectedKind} city`);
	}
	return definition.id;
}

function expectedReplenishmentOutcome(
	configuredSupplyCityId: WorldCityId | null,
	resolvedSupplyCityId: WorldCityId | null,
	warehouseUnits: number,
	importedUnits: number,
	label: string
): string | null {
	if (warehouseUnits <= 0 && importedUnits <= 0) return null;
	if (warehouseUnits > 0) {
		if (resolvedSupplyCityId === null) {
			retailSupplyInvariant(`${label} local replenishment requires a resolved supply city`);
		}
		return importedUnits > 0 ? 'mixed' : 'city-inventory';
	}
	if (configuredSupplyCityId === null) return 'unassigned-import';
	return resolvedSupplyCityId === null ? 'source-unavailable-import' : 'import-only';
}

function requireCurrentReplenishmentUnits(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return retailSupplyInvariant(`${label} must be a finite number`);
	}
	if (!Number.isSafeInteger(value) || value < 0) {
		return retailSupplyInvariant(`${label} must be a non-negative safe integer`);
	}
	return value;
}

function requireCurrentReplenishmentAmount(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return retailSupplyInvariant(`${label} must be a finite number`);
	}
	if (value < 0) {
		return retailSupplyInvariant(`${label} must be non-negative`);
	}
	return value;
}

function expectedCurrentLocalReplenishmentValue(
	categoryId: unknown,
	warehouseUnits: number,
	label: string
): number {
	if (warehouseUnits === 0) return 0;
	if (typeof categoryId !== 'string') {
		return retailSupplyInvariant(`${label} categoryId must map to a finished material`);
	}
	const materialId = getFinishedMaterialIdForCategory(categoryId);
	if (materialId === null) {
		return retailSupplyInvariant(`${label} categoryId must map to a finished material`);
	}
	const localValue = MATERIALS[materialId].localValue;
	if (!Number.isSafeInteger(localValue) || localValue <= 0) {
		return retailSupplyInvariant(`${label} local material value must be a positive safe integer`);
	}
	if (warehouseUnits > Math.floor(Number.MAX_SAFE_INTEGER / localValue)) {
		return retailSupplyInvariant(`${label} warehouseValue must not exceed the safe-integer range`);
	}
	return warehouseUnits * localValue;
}

function validateCurrentStoreReplenishment(value: unknown, game: GameState, label: string): void {
	const storeReport = requireRecord(value, label);
	const storeId = requireString(storeReport.storeId, `${label} storeId`);
	const store = game.stores.find((candidate) => candidate.id === storeId);
	if (!store) {
		retailSupplyInvariant(`${label} storeId must reference a current store`);
	}
	if (!Object.hasOwn(storeReport, 'replenishment')) {
		retailSupplyInvariant(`${label} replenishment must be present`);
	}

	const products = requireArray(storeReport.productReports, `${label} productReports`).map(
		(productValue, index) => {
			const productLabel = `${label} productReports[${index}]`;
			const product = requireRecord(productValue, productLabel);
			const duplicatedCityContextKey = [
				'cityId',
				'retailCityId',
				'supplyCityId',
				'configuredSupplyCityId',
				'resolvedSupplyCityId'
			].find((key) => Object.hasOwn(product, key));
			if (duplicatedCityContextKey) {
				retailSupplyInvariant(
					`${productLabel} must not duplicate the store-level replenishment ${duplicatedCityContextKey}`
				);
			}
			if (!Object.hasOwn(product, 'replenishmentOutcome')) {
				retailSupplyInvariant(`${productLabel} replenishmentOutcome must be present`);
			}
			const outcome = product.replenishmentOutcome;
			if (
				outcome !== null &&
				outcome !== 'city-inventory' &&
				outcome !== 'mixed' &&
				outcome !== 'import-only' &&
				outcome !== 'unassigned-import' &&
				outcome !== 'source-unavailable-import'
			) {
				retailSupplyInvariant(
					`${productLabel} replenishmentOutcome must be a supported outcome or null`
				);
			}
			const warehouseUnits = requireCurrentReplenishmentUnits(
				product.warehouseUnits,
				`${productLabel} warehouseUnits`
			);
			const warehouseValue = requireCurrentReplenishmentAmount(
				product.warehouseValue,
				`${productLabel} warehouseValue`
			);
			const importedUnits = requireCurrentReplenishmentUnits(
				product.importedUnits,
				`${productLabel} importedUnits`
			);
			const importSpend = requireCurrentReplenishmentAmount(
				product.importSpend,
				`${productLabel} importSpend`
			);
			const expectedWarehouseValue = expectedCurrentLocalReplenishmentValue(
				product.categoryId,
				warehouseUnits,
				productLabel
			);
			if (warehouseValue !== expectedWarehouseValue) {
				retailSupplyInvariant(
					`${productLabel} warehouseValue must exactly reconcile with local replenishment units`
				);
			}
			return {
				outcome,
				warehouseUnits,
				importedUnits,
				importSpend
			};
		}
	);
	const attemptedReplenishment = products.some(
		(product) => product.warehouseUnits > 0 || product.importedUnits > 0
	);

	if (storeReport.replenishment === null) {
		if (products.some((product) => product.outcome !== null)) {
			retailSupplyInvariant(
				`${label} null replenishment requires every product outcome to be null`
			);
		}
		return;
	}
	if (
		typeof storeReport.replenishment !== 'object' ||
		storeReport.replenishment === null ||
		Array.isArray(storeReport.replenishment)
	) {
		retailSupplyInvariant(`${label} replenishment must be an object or null`);
	}

	const context = storeReport.replenishment as Record<string, unknown>;
	const retailCityId = validateCurrentReplenishmentCityId(
		context.retailCityId,
		'retail',
		`${label} replenishment retailCityId`
	);
	if (retailCityId !== store.cityId) {
		retailSupplyInvariant(`${label} replenishment retailCityId must match its store city`);
	}

	const configuredSupplyCityId =
		context.configuredSupplyCityId === null
			? null
			: validateCurrentReplenishmentCityId(
					context.configuredSupplyCityId,
					'industry',
					`${label} replenishment configuredSupplyCityId`
				);
	const resolvedSupplyCityId =
		context.resolvedSupplyCityId === null
			? null
			: validateCurrentReplenishmentCityId(
					context.resolvedSupplyCityId,
					'industry',
					`${label} replenishment resolvedSupplyCityId`
				);
	const assignment = game.retailSupplyAssignments!.find(
		(candidate) => candidate.retailCityId === retailCityId
	);
	if (!assignment || assignment.supplyCityId !== configuredSupplyCityId) {
		retailSupplyInvariant(
			`${label} replenishment configuredSupplyCityId must match its city assignment`
		);
	}
	if (configuredSupplyCityId === null && resolvedSupplyCityId !== null) {
		retailSupplyInvariant(
			`${label} Imports-only replenishment cannot resolve a city supply source`
		);
	}
	if (
		configuredSupplyCityId !== null &&
		resolvedSupplyCityId !== null &&
		configuredSupplyCityId !== resolvedSupplyCityId
	) {
		retailSupplyInvariant(
			`${label} replenishment resolvedSupplyCityId must match its configured source`
		);
	}
	const configuredSupplyAccess =
		configuredSupplyCityId === null ? null : getCityInventory(game, configuredSupplyCityId);
	if (
		configuredSupplyCityId !== null &&
		configuredSupplyAccess?.ok &&
		resolvedSupplyCityId !== configuredSupplyCityId
	) {
		retailSupplyInvariant(
			`${label} replenishment must resolve an accessible configured supply city`
		);
	}
	if (resolvedSupplyCityId !== null && !getCityInventory(game, resolvedSupplyCityId).ok) {
		retailSupplyInvariant(
			`${label} replenishment resolvedSupplyCityId must have a current city inventory`
		);
	}
	if (!attemptedReplenishment) {
		retailSupplyInvariant(
			`${label} replenishment context requires at least one attempted product refill`
		);
	}

	for (const [index, product] of products.entries()) {
		const expected = expectedReplenishmentOutcome(
			configuredSupplyCityId,
			resolvedSupplyCityId,
			product.warehouseUnits,
			product.importedUnits,
			`${label} productReports[${index}]`
		);
		if (product.outcome !== expected) {
			retailSupplyInvariant(
				`${label} productReports[${index}] replenishmentOutcome must reconcile with refill quantities and source context`
			);
		}
	}
}

function validateCurrentReportCityAttribution(
	value: unknown,
	game: GameState,
	label: string
): void {
	const report = requireRecord(value, label);
	const productionReport = requireRecord(report.productionReport, `${label} productionReport`);
	const productionCloseTotals = validateCurrentProductionCloseInventories(
		productionReport.cityInventories,
		game,
		`${label} productionReport cityInventories`
	);
	validateCurrentProductionCloseAggregate(
		productionReport,
		productionCloseTotals,
		`${label} productionReport`
	);
	validateCurrentAttributedMovementArray(
		productionReport.produced,
		game,
		'industry',
		`${label} productionReport produced`
	);
	validateCurrentAttributedMovementArray(
		productionReport.consumed,
		game,
		'industry',
		`${label} productionReport consumed`
	);
	validateCurrentAttributedMovementArray(
		productionReport.importedInputs,
		game,
		'industry',
		`${label} productionReport importedInputs`
	);
	validateCurrentAttributedMovementArray(
		productionReport.warehousePulls,
		game,
		'industry',
		`${label} productionReport warehousePulls`
	);
	validateCurrentAttributedMovementArray(
		productionReport.shopImports,
		game,
		'retail',
		`${label} productionReport shopImports`
	);
	const railShipments = requireArray(
		productionReport.railShipments,
		`${label} productionReport railShipments`
	);
	for (const [index, shipmentValue] of railShipments.entries()) {
		const shipment = requireRecord(
			shipmentValue,
			`${label} productionReport railShipments[${index}]`
		);
		resolveCurrentReportCityId(
			game,
			shipment.cityId,
			'industry',
			`${label} productionReport railShipments[${index}] cityId`
		);
	}
	requireArray(report.storeReports, `${label} storeReports`).forEach((storeReport, index) =>
		validateCurrentStoreReplenishment(storeReport, game, `${label} storeReports[${index}]`)
	);
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
	requireArray(report.productReports, `${label} productReports`).forEach((productReport, index) => {
		const categoryId = validateSavedProductReport(
			productReport,
			`${label} productReports[${index}]`
		);
		if (seenCategoryIds.has(categoryId)) {
			throw new SaveDataError(
				`${label} productReports[${index}] categoryId must be unique within its store report`
			);
		}
		seenCategoryIds.add(categoryId);
	});
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

function validateSavedProductReport(value: unknown, label: string): string {
	const report = requireRecord(value, label);

	const categoryId = requireString(report.categoryId, `${label} categoryId`);
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
	return categoryId;
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
