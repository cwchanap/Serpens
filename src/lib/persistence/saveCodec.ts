import { getArchetype } from '$lib/game/archetypes';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS } from '$lib/game/industry';
import type { GameState } from '$lib/game/types';
import { STARTER_STORE_CAP, createInitialWorldProgress } from '$lib/game/world';
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
const INDUSTRIAL_BUILDING_STATUSES = ['idle', 'produced', 'imported-inputs', 'blocked'] as const;
const MATERIAL_MOVEMENT_SOURCES = ['local', 'import', 'warehouse', 'overflow'] as const;
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
	requireString(metadata.activeCityName, 'Save metadata activeCityName');

	return {
		...(value as SaveRecord),
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

function normalizeSavedGame(game: Record<string, unknown>): GameState {
	const normalizedWorld =
		game.world === undefined
			? createInitialWorldProgress()
			: validateSavedWorld(game.world, 'Saved game world');
	const normalizedStoreCap =
		game.storeCap === undefined
			? Math.max(
					STARTER_STORE_CAP,
					Array.isArray(game.stores) ? game.stores.length : STARTER_STORE_CAP
				)
			: game.storeCap;

	return {
		...game,
		world: normalizedWorld,
		storeCap: normalizedStoreCap
	} as GameState;
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
	requireNumber(city.width, `${label} width`);
	requireNumber(city.height, `${label} height`);
	requireArray(city.tiles, `${label} tiles`).forEach((tile, index) =>
		validateSavedIndustryTile(tile, `${label} tiles[${index}]`)
	);
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
	requireNumber(report.payrollCost, `${label} payrollCost`);
	requireNumber(report.importSpend, `${label} importSpend`);
	requireNumber(report.netIncome, `${label} netIncome`);
	requireNumber(report.cashAfter, `${label} cashAfter`);
	validateSavedScorecard(report.scorecard, `${label} scorecard`);
	validateSavedProductionReport(report.productionReport, `${label} productionReport`);
	requireArray(report.storeReports, `${label} storeReports`).forEach((storeReport, index) =>
		validateSavedStoreReport(storeReport, `${label} storeReports[${index}]`)
	);
	validateStringArray(report.warnings, `${label} warnings`);
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
	validateStringArray(report.warnings, `${label} warnings`);
}

function validateSavedStoreProducts(store: Record<string, unknown>, label: string): void {
	const archetypeId = requireOneOf(store.archetypeId, `${label} archetypeId`, ARCHETYPE_IDS);
	const expectedCategoryIds = getArchetype(archetypeId).startingCategories.map(
		(category) => category.id
	);
	const expectedCategories = new Set(expectedCategoryIds);
	const seenCategories = new Set<string>();
	const products = requireArray(store.products, `${label} products`);

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

	if (
		products.length !== expectedCategoryIds.length ||
		expectedCategoryIds.some((categoryId) => !seenCategories.has(categoryId))
	) {
		throw new SaveDataError(
			`${label} products must include categories: ${expectedCategoryIds.join(', ')}`
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
