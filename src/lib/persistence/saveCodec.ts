import type { GameState } from '$lib/game/types';
import {
	AUTO_SAVE_SLOT_ID,
	SAVE_SCHEMA_VERSION,
	type SaveRecord,
	type SaveSlotKind,
	type SaveStoreSnapshot,
	type SaveSummary
} from './saveTypes';

export class SaveDataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SaveDataError';
	}
}

const PRICING_POSTURES = ['discount', 'competitive', 'standard', 'premium'] as const;
const INVENTORY_BUFFERS = ['lean', 'balanced', 'generous'] as const;
const STAFFING_POSTURES = ['minimal', 'efficient', 'service'] as const;
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
	const activeCity = game.cities.find((city) => city.id === game.activeCityId);

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
			activeCityName: activeCity?.name ?? 'No active city'
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
	const record = requireRecord(value, 'Save store');
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
	const record = requireRecord(value, 'Save record');
	const schemaVersion = requireNumber(record.schemaVersion, 'Save record schemaVersion');

	if (schemaVersion !== SAVE_SCHEMA_VERSION) {
		throw new SaveDataError(`Unsupported save schema version: ${schemaVersion}`);
	}

	const metadata = requireRecord(record.metadata, 'Save metadata');
	validateSavedGame(record.game);
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
	requireString(metadata.activeCityName, 'Save metadata activeCityName');

	return value as SaveRecord;
}

function validateSavedGame(value: unknown): Record<string, unknown> {
	const game = requireRecord(value, 'Saved game');
	const policy = requireRecord(game.policy, 'Saved game policy');
	const scorecard = requireRecord(game.scorecard, 'Saved game scorecard');
	const cities = requireArray(game.cities, 'Saved game cities');
	const stores = requireArray(game.stores, 'Saved game stores');
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
	stores.forEach((store, index) => validateSavedStore(store, `Saved game stores[${index}]`));
	decisions.forEach((decision, index) =>
		validateSavedDecision(decision, `Saved game decisions[${index}]`)
	);
	reports.forEach((report, index) => validateSavedReport(report, `Saved game reports[${index}]`));

	return game;
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
	requireNumber(tile.demand, `${label} demand`);
	requireNumber(tile.rent, `${label} rent`);
	requireNumber(tile.footTraffic, `${label} footTraffic`);
	requireNumber(tile.customerFit, `${label} customerFit`);
	requireBoolean(tile.locked, `${label} locked`);
}

function validateSavedStore(value: unknown, label: string): void {
	const store = requireRecord(value, label);

	requireString(store.id, `${label} id`);
	requireString(store.name, `${label} name`);
	requireOneOf(store.archetypeId, `${label} archetypeId`, ARCHETYPE_IDS);
	requireString(store.location, `${label} location`);
	requireString(store.cityId, `${label} cityId`);
	requireString(store.tileId, `${label} tileId`);
	requireNumber(store.mapX, `${label} mapX`);
	requireNumber(store.mapY, `${label} mapY`);
	requireNumber(store.daysOpen, `${label} daysOpen`);
	requireNumber(store.reputation, `${label} reputation`);
	requireNumber(store.stockHealth, `${label} stockHealth`);
	requireNumber(store.staffMorale, `${label} staffMorale`);
	requireNumber(store.staffCapacity, `${label} staffCapacity`);
	requireNumber(store.localDemand, `${label} localDemand`);
	requireNumber(store.competition, `${label} competition`);
	requireNumber(store.managerQuality, `${label} managerQuality`);
}

function validateSavedDecision(value: unknown, label: string): void {
	const decision = requireRecord(value, label);

	requireString(decision.id, `${label} id`);
	requireString(decision.title, `${label} title`);
	requireString(decision.context, `${label} context`);
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
	requireNumber(report.netIncome, `${label} netIncome`);
	requireNumber(report.cashAfter, `${label} cashAfter`);
	validateSavedScorecard(report.scorecard, `${label} scorecard`);
	requireArray(report.storeReports, `${label} storeReports`).forEach((storeReport, index) =>
		validateSavedStoreReport(storeReport, `${label} storeReports[${index}]`)
	);
	validateStringArray(report.warnings, `${label} warnings`);
}

function validateSavedStoreReport(value: unknown, label: string): void {
	const report = requireRecord(value, label);

	requireString(report.storeId, `${label} storeId`);
	requireNumber(report.revenue, `${label} revenue`);
	requireNumber(report.costOfGoods, `${label} costOfGoods`);
	requireNumber(report.grossMargin, `${label} grossMargin`);
	requireNumber(report.operatingCosts, `${label} operatingCosts`);
	requireNumber(report.netIncome, `${label} netIncome`);
	requireNumber(report.customersServed, `${label} customersServed`);
	requireNumber(report.demandMissed, `${label} demandMissed`);
	requireNumber(report.stockHealth, `${label} stockHealth`);
	requireNumber(report.staffMorale, `${label} staffMorale`);
	requireNumber(report.reputation, `${label} reputation`);
	requireNumber(report.marketPosition, `${label} marketPosition`);
	validateStringArray(report.warnings, `${label} warnings`);
}

function validateSavedScorecard(value: unknown, label: string): void {
	const scorecard = requireRecord(value, label);

	requireNumber(scorecard.profit, `${label} profit`);
	requireNumber(scorecard.customerSatisfaction, `${label} customerSatisfaction`);
	requireNumber(scorecard.staffMorale, `${label} staffMorale`);
	requireNumber(scorecard.marketPosition, `${label} marketPosition`);
}

function validateStringArray(value: unknown, label: string): void {
	requireArray(value, label).forEach((item, index) => requireString(item, `${label}[${index}]`));
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

function requireOneOf<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
	if (typeof value !== 'string' || !allowed.includes(value as T)) {
		throw new SaveDataError(`${label} must be one of: ${allowed.join(', ')}`);
	}

	return value as T;
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
