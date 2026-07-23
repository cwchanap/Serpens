import { ARCHETYPES } from '$lib/game/archetypes';
import {
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity
} from '$lib/game/city';
import {
	DEFAULT_INDUSTRY_CITY_HEIGHT,
	DEFAULT_INDUSTRY_CITY_WIDTH,
	INDUSTRIAL_BUILDING_TYPES,
	MATERIALS,
	generateIndustryCity,
	getIndustrialBuildingTypesForProductChain
} from '$lib/game/industry';
import {
	INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
	INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
	createIndustryTileLookup,
	getIndustryBuildingFootprint
} from '$lib/game/industryFootprint';
import { MAX_STORE_LEVEL, getUnlockedCategoryCount } from '$lib/game/leveling';
import { RAIL_MAX_LEVEL, railCellKey } from '$lib/game/rail';
import { buildRail, buildRailPreview } from '$lib/game/railPlacement';
import {
	RETAIL_STORE_FOOTPRINT_HEIGHT,
	RETAIL_STORE_FOOTPRINT_WIDTH,
	createCityTileLookup,
	getStoreFootprintPlacementBlockReason
} from '$lib/game/storeFootprint';
import type {
	City,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	IndustryCity,
	MaterialId,
	RailCell
} from '$lib/game/types';
import {
	STARTER_STORE_CAP,
	WORLD_CITY_CATALOG,
	createInitialWorldProgress,
	getWorldCityDefinition
} from '$lib/game/world';
import {
	MAX_SCENARIO_SEED,
	SCENARIO_COMMAND_KINDS,
	type ScenarioDefinition,
	type ScenarioDiagnostic
} from './types';

const SUPPORTED_DEFINITION_VERSION = 1;
const BRONZE_SCORE = 500;
const MAX_SCORE = 1_000;

const DEFINITION_KEYS = [
	'id',
	'version',
	'titleKey',
	'summaryKey',
	'briefingKey',
	'strategyHintKey',
	'officialSeed',
	'dayLimit',
	'start',
	'content',
	'allowedCommands',
	'modifiers',
	'requiredObjectives',
	'optionalObjectives',
	'failures',
	'scoreComponents',
	'medalThresholds'
] as const;
const START_KEYS = ['foundingStore', 'industrialBuildings', 'rails', 'overrides'] as const;
const FOUNDING_STORE_KEYS = ['ref', 'archetypeId', 'cityId', 'tileId'] as const;
const INDUSTRIAL_BUILDING_KEYS = ['ref', 'typeId', 'cityId', 'tileId'] as const;
const RAIL_KEYS = ['cityId', 'x', 'y', 'level'] as const;
const OVERRIDE_KEYS = [
	'cash',
	'debt',
	'policy',
	'storeCap',
	'stores',
	'buildingInventories',
	'warehouseMaterials',
	'world'
] as const;
const POLICY_KEYS = ['pricing', 'inventory', 'staffing', 'marketing', 'service'] as const;
const STORE_OVERRIDE_KEYS = ['storeRef', 'targetLevel', 'products'] as const;
const PRODUCT_OVERRIDE_KEYS = [
	'categoryId',
	'stock',
	'reorderThreshold',
	'targetStock',
	'sellingPrice'
] as const;
const BUILDING_INVENTORY_KEYS = ['buildingRef', 'materials'] as const;
const WORLD_OVERRIDE_KEYS = [
	'revealedCityIds',
	'openedCityIds',
	'activeRetailCityId',
	'activeIndustryCityId'
] as const;
const CONTENT_KEYS = [
	'cityIds',
	'archetypeIds',
	'productCategoryIds',
	'materialIds',
	'buildingTypeIds',
	'retailPlacements',
	'industrialPlacements'
] as const;
const RETAIL_PLACEMENT_KEYS = ['cityId', 'tileId', 'archetypeId'] as const;
const INDUSTRIAL_PLACEMENT_KEYS = ['cityId', 'tileId', 'buildingTypeId'] as const;
const CONDITION_KEYS = [
	'id',
	'labelKey',
	'query',
	'comparator',
	'target',
	'window',
	'requiresCompleteWindow'
] as const;
const MEDAL_THRESHOLD_KEYS = ['silver', 'gold'] as const;

const KNOWN_ARCHETYPE_IDS = new Set<string>(ARCHETYPES.map((archetype) => archetype.id));
const KNOWN_CITY_IDS = new Set<string>(WORLD_CITY_CATALOG.map((city) => city.id));
const KNOWN_MATERIAL_IDS = new Set<string>(Object.keys(MATERIALS));
const KNOWN_BUILDING_TYPE_IDS = new Set<string>(Object.keys(INDUSTRIAL_BUILDING_TYPES));
const KNOWN_PRODUCT_IDS = new Set<string>(
	ARCHETYPES.flatMap((archetype) => archetype.startingCategories.map((category) => category.id))
);
const KNOWN_COMMANDS = new Set<string>(SCENARIO_COMMAND_KINDS);
const COMPARATORS = new Set(['lt', 'lte', 'eq', 'gte', 'gt']);
const SCORE_KEYS = new Set(['profit', 'customerSatisfaction', 'staffMorale', 'marketPosition']);

const POLICY_VALUES: Readonly<Record<(typeof POLICY_KEYS)[number], ReadonlySet<string>>> = {
	pricing: new Set(['discount', 'competitive', 'standard', 'premium']),
	inventory: new Set(['lean', 'balanced', 'generous']),
	staffing: new Set(['minimal', 'efficient', 'service']),
	marketing: new Set(['none', 'awareness', 'promotions', 'loyalty']),
	service: new Set(['speed', 'balanced', 'highTouch'])
};

type WindowKind = 'current' | 'run-to-date' | 'trailing-reports' | 'fixed-report-days';

const METRIC_WINDOWS: Readonly<Record<string, ReadonlySet<WindowKind>>> = {
	cash: new Set(['current']),
	'daily-net-income': new Set(['current', 'run-to-date', 'trailing-reports', 'fixed-report-days']),
	'cumulative-net-income': new Set(['run-to-date']),
	'consecutive-positive-net-income-reports': new Set(['current', 'trailing-reports']),
	'completed-retail-import-cycles': new Set(['run-to-date']),
	'retail-import-spend': new Set(['run-to-date', 'trailing-reports', 'fixed-report-days']),
	'retail-imported-units': new Set(['run-to-date', 'trailing-reports', 'fixed-report-days']),
	'retail-local-units': new Set(['run-to-date', 'trailing-reports', 'fixed-report-days']),
	'retail-local-share': new Set(['run-to-date', 'trailing-reports', 'fixed-report-days']),
	'units-sold': new Set(['run-to-date', 'trailing-reports', 'fixed-report-days']),
	'demand-missed': new Set(['run-to-date', 'trailing-reports', 'fixed-report-days']),
	scorecard: new Set(['current']),
	'store-count': new Set(['current']),
	'industrial-building-count': new Set(['current']),
	'warehouse-quantity': new Set(['current'])
};

const CATEGORY_METRICS = new Set([
	'retail-import-spend',
	'retail-imported-units',
	'retail-local-units',
	'retail-local-share',
	'units-sold',
	'demand-missed'
]);
const LOCAL_PRODUCTION_METRICS = new Set(['retail-local-units', 'retail-local-share']);

type JsonObject = Record<string, unknown>;

interface ValidationContext {
	diagnostics: ScenarioDiagnostic[];
	definition?: JsonObject;
	dayLimit?: number;
	officialSeed?: number;
	content: {
		cities: Set<string>;
		archetypes: Set<string>;
		products: Set<string>;
		materials: Set<string>;
		buildingTypes: Set<string>;
	};
	allowedCommands: Set<string>;
	optionalObjectiveIds: Set<string>;
	permittedRetailPlacements: PermittedRetailPlacement[];
	storeCap: number;
	startBuildingPlacements: AuthoredBuilding[];
	permittedBuildingPlacements: AuthoredBuilding[];
	railBuildingGraph: Map<string, Set<string>>;
	authoredRailsByCity: Map<string, RailCell[]>;
	revealedCityIds: Set<string>;
	openedCityIds: Set<string>;
	activeRetailCityId?: string;
	cities: Map<string, City | IndustryCity>;
}

interface PermittedRetailPlacement {
	archetypeId: string;
	cityId: string;
	x: number;
	y: number;
}

interface AuthoredBuilding {
	path: string;
	ref?: string;
	typeId: string;
	cityId: string;
	tileId: string;
	x?: number;
	y?: number;
	validPlacement: boolean;
}

function compareCodeUnits(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}

export function sortScenarioDiagnostics(
	diagnostics: readonly ScenarioDiagnostic[]
): ScenarioDiagnostic[] {
	return [...diagnostics].sort(
		(first, second) =>
			compareCodeUnits(first.path, second.path) || compareCodeUnits(first.code, second.code)
	);
}

export function validateScenarioSetupReserve(reserve: number): ScenarioDiagnostic[] {
	if (Number.isFinite(reserve) && reserve >= 0) return [];

	return [
		{
			path: 'start',
			code: 'invalid-setup-reserve',
			value: reserve,
			detail: 'The calculated transient setup reserve must be finite and non-negative.'
		}
	];
}

function diagnostic(
	context: ValidationContext,
	path: string,
	code: string,
	value: unknown,
	detail: string
): void {
	context.diagnostics.push({ path, code, value, detail });
}

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function closedObject(
	context: ValidationContext,
	value: unknown,
	path: string,
	allowedKeys: readonly string[],
	requiredKeys: readonly string[] = allowedKeys
): JsonObject | undefined {
	if (!isObject(value)) {
		diagnostic(
			context,
			path,
			'invalid-object',
			value,
			`${path || 'definition'} must be an object.`
		);
		return undefined;
	}

	const allowed = new Set(allowedKeys);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			diagnostic(
				context,
				joinPath(path, key),
				'unknown-key',
				value[key],
				`Unknown field ${joinPath(path, key)}.`
			);
		}
	}
	for (const key of requiredKeys) {
		if (!Object.hasOwn(value, key)) {
			diagnostic(
				context,
				joinPath(path, key),
				'missing-key',
				undefined,
				`Missing required field ${joinPath(path, key)}.`
			);
		}
	}
	return value;
}

function joinPath(base: string, key: string): string {
	return base ? `${base}.${key}` : key;
}

function arrayValue(
	context: ValidationContext,
	value: unknown,
	path: string
): readonly unknown[] | undefined {
	if (!Array.isArray(value)) {
		diagnostic(context, path, 'invalid-array', value, `${path} must be an array.`);
		return undefined;
	}
	return value;
}

function finiteNumber(context: ValidationContext, value: unknown, path: string): value is number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		diagnostic(context, path, 'invalid-finite-number', value, `${path} must be a finite number.`);
		return false;
	}
	return true;
}

function nonNegativeNumber(
	context: ValidationContext,
	value: unknown,
	path: string
): value is number {
	if (!finiteNumber(context, value, path)) return false;
	if (value < 0) {
		diagnostic(
			context,
			path,
			'invalid-non-negative-number',
			value,
			`${path} must not be negative.`
		);
		return false;
	}
	return true;
}

function positiveNumber(context: ValidationContext, value: unknown, path: string): value is number {
	if (!finiteNumber(context, value, path)) return false;
	if (value <= 0) {
		diagnostic(
			context,
			path,
			'invalid-positive-number',
			value,
			`${path} must be greater than zero.`
		);
		return false;
	}
	return true;
}

function nonEmptyString(context: ValidationContext, value: unknown, path: string): value is string {
	if (typeof value !== 'string' || value.length === 0) {
		diagnostic(context, path, 'invalid-string', value, `${path} must be a non-empty string.`);
		return false;
	}
	return true;
}

function validateKnownReference(
	context: ValidationContext,
	value: unknown,
	path: string,
	registry: ReadonlySet<string>,
	kind: string
): value is string {
	if (!nonEmptyString(context, value, path)) return false;
	if (!registry.has(value)) {
		diagnostic(context, path, 'invalid-reference', value, `Unknown ${kind} reference: ${value}.`);
		return false;
	}
	return true;
}

function validateReferenceArray(
	context: ValidationContext,
	value: unknown,
	path: string,
	registry: ReadonlySet<string>,
	kind: string
): Set<string> {
	const result = new Set<string>();
	const values = arrayValue(context, value, path);
	if (!values) return result;
	for (const [index, candidate] of values.entries()) {
		const itemPath = `${path}[${index}]`;
		if (!validateKnownReference(context, candidate, itemPath, registry, kind)) continue;
		if (result.has(candidate)) {
			diagnostic(
				context,
				itemPath,
				'duplicate-reference',
				candidate,
				`Duplicate ${kind} reference: ${candidate}.`
			);
		}
		result.add(candidate);
	}
	return result;
}

function validateDefinitionIdentity(context: ValidationContext, definition: JsonObject): void {
	if (
		typeof definition.id !== 'string' ||
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id) ||
		definition.id.includes('.')
	) {
		diagnostic(
			context,
			'id',
			'invalid-scenario-id',
			definition.id,
			'Scenario IDs must use lowercase kebab case without dots.'
		);
	}
	if (definition.version !== SUPPORTED_DEFINITION_VERSION) {
		diagnostic(
			context,
			'version',
			'unsupported-version',
			definition.version,
			`Only scenario definition version ${SUPPORTED_DEFINITION_VERSION} is supported.`
		);
	}
	if (
		!Number.isInteger(definition.officialSeed) ||
		typeof definition.officialSeed !== 'number' ||
		definition.officialSeed < 1 ||
		definition.officialSeed > MAX_SCENARIO_SEED
	) {
		diagnostic(
			context,
			'officialSeed',
			'invalid-seed',
			definition.officialSeed,
			`Scenario seeds must be integers from 1 through ${MAX_SCENARIO_SEED}.`
		);
	} else {
		context.officialSeed = definition.officialSeed;
	}
	if (
		typeof definition.dayLimit !== 'number' ||
		!Number.isInteger(definition.dayLimit) ||
		definition.dayLimit <= 0
	) {
		diagnostic(
			context,
			'dayLimit',
			'invalid-positive-integer',
			definition.dayLimit,
			'The day limit must be a positive integer.'
		);
	} else {
		context.dayLimit = definition.dayLimit;
	}
	for (const key of ['titleKey', 'summaryKey', 'briefingKey', 'strategyHintKey']) {
		nonEmptyString(context, definition[key], key);
	}
}

function validateContent(context: ValidationContext, value: unknown): void {
	const content = closedObject(context, value, 'content', CONTENT_KEYS);
	if (!content) return;
	context.content.cities = validateReferenceArray(
		context,
		content.cityIds,
		'content.cityIds',
		KNOWN_CITY_IDS,
		'city'
	);
	context.content.archetypes = validateReferenceArray(
		context,
		content.archetypeIds,
		'content.archetypeIds',
		KNOWN_ARCHETYPE_IDS,
		'archetype'
	);
	context.content.products = validateReferenceArray(
		context,
		content.productCategoryIds,
		'content.productCategoryIds',
		KNOWN_PRODUCT_IDS,
		'product category'
	);
	context.content.materials = validateReferenceArray(
		context,
		content.materialIds,
		'content.materialIds',
		KNOWN_MATERIAL_IDS,
		'material'
	);
	context.content.buildingTypes = validateReferenceArray(
		context,
		content.buildingTypeIds,
		'content.buildingTypeIds',
		KNOWN_BUILDING_TYPE_IDS,
		'building type'
	);

	validateRetailPlacements(context, content.retailPlacements);
	validateIndustrialPlacements(context, content.industrialPlacements);
}

function getValidationCity(
	context: ValidationContext,
	cityId: string
): City | IndustryCity | undefined {
	const cached = context.cities.get(cityId);
	if (cached) return cached;
	const definition = getWorldCityDefinition(cityId);
	if (!definition || context.officialSeed === undefined) return undefined;
	const seed =
		definition.id === 'harbor-city' || definition.id === 'industry-city'
			? context.officialSeed + (definition.kind === 'industry' ? 101 : 0)
			: definition.seed;
	const city =
		definition.kind === 'retail'
			? generateCity({
					id: definition.id,
					name: definition.name,
					width: DEFAULT_RETAIL_CITY_WIDTH,
					height: DEFAULT_RETAIL_CITY_HEIGHT,
					seed
				})
			: generateIndustryCity({
					id: definition.id,
					name: definition.name,
					width: DEFAULT_INDUSTRY_CITY_WIDTH,
					height: DEFAULT_INDUSTRY_CITY_HEIGHT,
					seed,
					resourceProfile: definition.industryResourceProfile
				});
	context.cities.set(cityId, city);
	return city;
}

function validateRetailPlacement(
	context: ValidationContext,
	placement: JsonObject,
	path: string
): boolean {
	const validCity = validateKnownReference(
		context,
		placement.cityId,
		`${path}.cityId`,
		KNOWN_CITY_IDS,
		'city'
	);
	const validArchetype = validateKnownReference(
		context,
		placement.archetypeId,
		`${path}.archetypeId`,
		KNOWN_ARCHETYPE_IDS,
		'archetype'
	);
	if (path.startsWith('content.')) {
		if (validCity)
			validateIncluded(context, placement.cityId, `${path}.cityId`, context.content.cities);
		if (validArchetype)
			validateIncluded(
				context,
				placement.archetypeId,
				`${path}.archetypeId`,
				context.content.archetypes
			);
	}
	if (!nonEmptyString(context, placement.tileId, `${path}.tileId`) || !validCity) return false;
	const cityDefinition = getWorldCityDefinition(placement.cityId as string);
	const city = getValidationCity(context, placement.cityId as string);
	if (!cityDefinition || cityDefinition.kind !== 'retail') {
		diagnostic(
			context,
			`${path}.cityId`,
			'invalid-placement',
			placement.cityId,
			'Retail placements require a retail city.'
		);
		return false;
	}
	// Placement generation depends on a valid seed. Avoid derivative placement
	// noise when the seed itself has already failed validation.
	if (!city) return false;
	const retailCity = city as City;
	const lookup = createCityTileLookup(retailCity);
	const tile = lookup.byId.get(placement.tileId as string);
	if (!tile || getStoreFootprintPlacementBlockReason(lookup, tile) !== null) {
		diagnostic(
			context,
			`${path}.tileId`,
			'invalid-placement',
			placement.tileId,
			'The retail placement is not buildable.'
		);
		return false;
	}
	return validArchetype;
}

function validateRetailPlacements(context: ValidationContext, value: unknown): void {
	const placements = arrayValue(context, value, 'content.retailPlacements');
	if (!placements) return;
	for (const [index, candidate] of placements.entries()) {
		const path = `content.retailPlacements[${index}]`;
		const placement = closedObject(context, candidate, path, RETAIL_PLACEMENT_KEYS);
		if (!placement) continue;
		if (validateRetailPlacement(context, placement, path)) {
			const city = getValidationCity(context, placement.cityId as string) as City | undefined;
			const tile = city?.tiles.find((candidate) => candidate.id === placement.tileId);
			if (tile) {
				context.permittedRetailPlacements.push({
					archetypeId: placement.archetypeId as string,
					cityId: placement.cityId as string,
					x: tile.x,
					y: tile.y
				});
			}
		}
	}
}

function validateIndustrialPlacementShape(
	context: ValidationContext,
	placement: JsonObject,
	path: string,
	typeKey: 'typeId' | 'buildingTypeId'
): AuthoredBuilding | undefined {
	const validCity = validateKnownReference(
		context,
		placement.cityId,
		`${path}.cityId`,
		KNOWN_CITY_IDS,
		'city'
	);
	const validType = validateKnownReference(
		context,
		placement[typeKey],
		`${path}.${typeKey}`,
		KNOWN_BUILDING_TYPE_IDS,
		'building type'
	);
	const validTile = nonEmptyString(context, placement.tileId, `${path}.tileId`);
	if (!validCity || !validType || !validTile) return undefined;
	return {
		path,
		typeId: placement[typeKey] as string,
		cityId: placement.cityId as string,
		tileId: placement.tileId as string,
		validPlacement: false
	};
}

function validateIndustrialPlacements(context: ValidationContext, value: unknown): void {
	const placements = arrayValue(context, value, 'content.industrialPlacements');
	if (!placements) return;
	for (const [index, candidate] of placements.entries()) {
		const path = `content.industrialPlacements[${index}]`;
		const placement = closedObject(context, candidate, path, INDUSTRIAL_PLACEMENT_KEYS);
		if (!placement) continue;
		const authored = validateIndustrialPlacementShape(context, placement, path, 'buildingTypeId');
		if (!authored) continue;
		validateIncluded(context, authored.cityId, `${path}.cityId`, context.content.cities);
		validateIncluded(
			context,
			authored.typeId,
			`${path}.buildingTypeId`,
			context.content.buildingTypes
		);
		context.permittedBuildingPlacements.push(authored);
		authored.validPlacement = validateIndustrialBuildingPlacement(context, authored, new Map());
	}
}

function validateIndustrialBuildingPlacement(
	context: ValidationContext,
	building: AuthoredBuilding,
	occupiedByCity: Map<string, Set<string>>
): boolean {
	const definition = getWorldCityDefinition(building.cityId);
	const city = getValidationCity(context, building.cityId);
	if (!definition || definition.kind !== 'industry' || !city) {
		diagnostic(
			context,
			`${building.path}.cityId`,
			'invalid-placement',
			building.cityId,
			'Industrial buildings require an industry city.'
		);
		return false;
	}
	const industryCity = city as IndustryCity;
	const lookup = createIndustryTileLookup(industryCity);
	const tile = lookup.byId.get(building.tileId);
	const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId as IndustrialBuildingTypeId];
	if (!tile || !buildingType) {
		diagnostic(
			context,
			`${building.path}.tileId`,
			'invalid-placement',
			building.tileId,
			'The industrial placement tile does not exist.'
		);
		return false;
	}
	building.x = tile.x;
	building.y = tile.y;
	const footprint = getIndustryBuildingFootprint(lookup, tile);
	const occupied = occupiedByCity.get(building.cityId) ?? new Set<string>();
	occupiedByCity.set(building.cityId, occupied);
	const invalid =
		tile.locked ||
		footprint.missingCoordinates.length > 0 ||
		footprint.tiles.some((candidate) => candidate.locked) ||
		(buildingType.requiredResource !== null && tile.resource !== buildingType.requiredResource) ||
		(buildingType.requiresIndustrialTile &&
			footprint.tiles.some((candidate) => candidate.terrain !== 'industrial'));
	if (invalid) {
		diagnostic(
			context,
			`${building.path}.tileId`,
			'invalid-placement',
			building.tileId,
			'The industrial placement violates its footprint, terrain, or resource requirement.'
		);
		return false;
	}
	if (footprint.tiles.some((candidate) => occupied.has(candidate.id))) {
		diagnostic(
			context,
			`${building.path}.tileId`,
			'overlapping-placement',
			building.tileId,
			'The industrial building overlaps an earlier authored building.'
		);
		return false;
	}
	for (const footprintTile of footprint.tiles) occupied.add(footprintTile.id);
	return true;
}

function validateStart(context: ValidationContext, value: unknown): void {
	const start = closedObject(context, value, 'start', START_KEYS);
	if (!start) return;
	const foundingStore = closedObject(
		context,
		start.foundingStore,
		'start.foundingStore',
		FOUNDING_STORE_KEYS
	);
	const setupRefs = new Set<string>();
	if (foundingStore) {
		if (nonEmptyString(context, foundingStore.ref, 'start.foundingStore.ref'))
			setupRefs.add(foundingStore.ref);
		if (validateRetailPlacement(context, foundingStore, 'start.foundingStore')) {
			context.activeRetailCityId = foundingStore.cityId as string;
		}
		validateIncluded(
			context,
			foundingStore.cityId,
			'start.foundingStore.cityId',
			context.content.cities
		);
		validateIncluded(
			context,
			foundingStore.archetypeId,
			'start.foundingStore.archetypeId',
			context.content.archetypes
		);
	}

	const occupiedByCity = new Map<string, Set<string>>();
	const buildings = arrayValue(context, start.industrialBuildings, 'start.industrialBuildings');
	if (buildings) {
		for (const [index, candidate] of buildings.entries()) {
			const path = `start.industrialBuildings[${index}]`;
			const building = closedObject(context, candidate, path, INDUSTRIAL_BUILDING_KEYS);
			if (!building) continue;
			if (nonEmptyString(context, building.ref, `${path}.ref`)) {
				if (setupRefs.has(building.ref))
					diagnostic(
						context,
						`${path}.ref`,
						'duplicate-reference',
						building.ref,
						`Duplicate setup ref: ${building.ref}.`
					);
				setupRefs.add(building.ref);
			}
			const authored = validateIndustrialPlacementShape(context, building, path, 'typeId');
			if (!authored) continue;
			authored.ref = typeof building.ref === 'string' ? building.ref : undefined;
			context.startBuildingPlacements.push(authored);
			authored.validPlacement = validateIndustrialBuildingPlacement(
				context,
				authored,
				occupiedByCity
			);
			validateIncluded(context, authored.cityId, `${path}.cityId`, context.content.cities);
			validateIncluded(context, authored.typeId, `${path}.typeId`, context.content.buildingTypes);
		}
	}

	validateRails(context, start.rails, occupiedByCity);
	validateOverrides(context, start.overrides, foundingStore, context.startBuildingPlacements);
}

function validateIncluded(
	context: ValidationContext,
	value: unknown,
	path: string,
	allowed: ReadonlySet<string>
): void {
	if (typeof value === 'string' && !allowed.has(value)) {
		diagnostic(
			context,
			path,
			'excluded-content',
			value,
			`${value} is excluded by this definition's content rules.`
		);
	}
}

function contentObject(context: ValidationContext): JsonObject | undefined {
	const content = context.definition?.content;
	return isObject(content) ? content : undefined;
}

function validateOverrides(
	context: ValidationContext,
	value: unknown,
	foundingStore: JsonObject | undefined,
	buildings: readonly AuthoredBuilding[]
): void {
	const overrides = closedObject(context, value, 'start.overrides', OVERRIDE_KEYS, []);
	if (!overrides) return;
	for (const key of ['cash', 'debt'] as const) {
		if (Object.hasOwn(overrides, key))
			nonNegativeNumber(context, overrides[key], `start.overrides.${key}`);
	}
	if (Object.hasOwn(overrides, 'policy')) validatePolicy(context, overrides.policy);
	const targetLevels = validateStoreOverrides(context, overrides.stores, foundingStore);
	validateBuildingInventories(context, overrides.buildingInventories, buildings);
	validateMaterialRecord(
		context,
		overrides.warehouseMaterials,
		'start.overrides.warehouseMaterials',
		true
	);
	validateWarehouseCapacity(context, overrides.warehouseMaterials, buildings);
	if (Object.hasOwn(overrides, 'world')) validateWorldOverride(context, overrides.world);
	validateStoreCap(context, overrides.storeCap);
	validateAllowlistedProductUnlocks(context, foundingStore, targetLevels);
}

function validatePolicy(context: ValidationContext, value: unknown): void {
	const policy = closedObject(context, value, 'start.overrides.policy', POLICY_KEYS);
	if (!policy) return;
	for (const key of POLICY_KEYS) {
		if (!POLICY_VALUES[key].has(policy[key] as string)) {
			diagnostic(
				context,
				`start.overrides.policy.${key}`,
				'invalid-policy',
				policy[key],
				`Unsupported ${key} policy value.`
			);
		}
	}
}

function validateStoreOverrides(
	context: ValidationContext,
	value: unknown,
	foundingStore: JsonObject | undefined
): Map<string, number> {
	const levels = new Map<string, number>();
	if (value === undefined) return levels;
	const overrides = arrayValue(context, value, 'start.overrides.stores');
	if (!overrides) return levels;
	const seen = new Set<string>();
	for (const [index, candidate] of overrides.entries()) {
		const path = `start.overrides.stores[${index}]`;
		const override = closedObject(context, candidate, path, STORE_OVERRIDE_KEYS, ['storeRef']);
		if (!override) continue;
		const storeRef = override.storeRef;
		const validRef = nonEmptyString(context, storeRef, `${path}.storeRef`);
		if (validRef) {
			if (seen.has(storeRef))
				diagnostic(
					context,
					`${path}.storeRef`,
					'duplicate-reference',
					storeRef,
					`Duplicate store override for ${storeRef}.`
				);
			seen.add(storeRef);
			if (!foundingStore || storeRef !== foundingStore.ref) {
				diagnostic(
					context,
					`${path}.storeRef`,
					'invalid-reference',
					storeRef,
					'Store overrides must reference a store created earlier in setup.'
				);
			}
		}
		let targetLevel = 1;
		if (Object.hasOwn(override, 'targetLevel')) {
			if (
				typeof override.targetLevel !== 'number' ||
				!Number.isInteger(override.targetLevel) ||
				override.targetLevel < 1 ||
				override.targetLevel > MAX_STORE_LEVEL
			) {
				diagnostic(
					context,
					`${path}.targetLevel`,
					'invalid-target-level',
					override.targetLevel,
					`Target level must be an integer from 1 through ${MAX_STORE_LEVEL}.`
				);
			} else targetLevel = override.targetLevel;
		}
		if (validRef) levels.set(storeRef, targetLevel);
		validateProductOverrides(context, override.products, path, foundingStore, targetLevel);
	}
	return levels;
}

function validateProductOverrides(
	context: ValidationContext,
	value: unknown,
	storePath: string,
	foundingStore: JsonObject | undefined,
	targetLevel: number
): void {
	if (value === undefined) return;
	const products = arrayValue(context, value, `${storePath}.products`);
	if (!products) return;
	const archetype = ARCHETYPES.find((candidate) => candidate.id === foundingStore?.archetypeId);
	const unlockedIds = new Set(
		archetype?.startingCategories
			.slice(0, getUnlockedCategoryCount(targetLevel))
			.map((category) => category.id) ?? []
	);
	const seen = new Set<string>();
	for (const [index, candidate] of products.entries()) {
		const path = `${storePath}.products[${index}]`;
		const product = closedObject(context, candidate, path, PRODUCT_OVERRIDE_KEYS);
		if (!product) continue;
		const categoryId = product.categoryId;
		const validCategory = validateKnownReference(
			context,
			categoryId,
			`${path}.categoryId`,
			KNOWN_PRODUCT_IDS,
			'product category'
		);
		if (validCategory) {
			if (seen.has(categoryId))
				diagnostic(
					context,
					`${path}.categoryId`,
					'duplicate-reference',
					categoryId,
					`Duplicate product override for ${categoryId}.`
				);
			seen.add(categoryId);
			if (!unlockedIds.has(categoryId))
				diagnostic(
					context,
					`${path}.categoryId`,
					'product-locked',
					categoryId,
					`Product ${categoryId} is not unlocked at target level ${targetLevel}.`
				);
			validateIncluded(context, categoryId, `${path}.categoryId`, context.content.products);
		}
		for (const key of ['stock', 'reorderThreshold', 'targetStock'] as const) {
			nonNegativeNumber(context, product[key], `${path}.${key}`);
		}
		positiveNumber(context, product.sellingPrice, `${path}.sellingPrice`);
		if (
			typeof product.reorderThreshold === 'number' &&
			typeof product.targetStock === 'number' &&
			product.reorderThreshold > product.targetStock
		) {
			diagnostic(
				context,
				`${path}.reorderThreshold`,
				'invalid-inventory-target',
				product.reorderThreshold,
				'Reorder threshold cannot exceed target stock.'
			);
		}
	}
}

function validateBuildingInventories(
	context: ValidationContext,
	value: unknown,
	buildings: readonly AuthoredBuilding[]
): void {
	if (value === undefined) return;
	const inventories = arrayValue(context, value, 'start.overrides.buildingInventories');
	if (!inventories) return;
	const byRef = new Map(buildings.map((building) => [building.ref, building]));
	const seen = new Set<string>();
	for (const [index, candidate] of inventories.entries()) {
		const path = `start.overrides.buildingInventories[${index}]`;
		const inventory = closedObject(context, candidate, path, BUILDING_INVENTORY_KEYS);
		if (!inventory) continue;
		const materials = validateMaterialRecord(
			context,
			inventory.materials,
			`${path}.materials`,
			true
		);
		if (nonEmptyString(context, inventory.buildingRef, `${path}.buildingRef`)) {
			if (seen.has(inventory.buildingRef))
				diagnostic(
					context,
					`${path}.buildingRef`,
					'duplicate-reference',
					inventory.buildingRef,
					`Duplicate building inventory for ${inventory.buildingRef}.`
				);
			seen.add(inventory.buildingRef);
			const building = byRef.get(inventory.buildingRef);
			if (!building)
				diagnostic(
					context,
					`${path}.buildingRef`,
					'invalid-reference',
					inventory.buildingRef,
					'Building inventories must reference a building created earlier in setup.'
				);
			else {
				const used = [...materials.values()].reduce((total, quantity) => total + quantity, 0);
				const capacity =
					INDUSTRIAL_BUILDING_TYPES[building.typeId as IndustrialBuildingTypeId]?.bufferCapacity ??
					0;
				if (used > capacity)
					diagnostic(
						context,
						`${path}.materials`,
						'building-inventory-capacity-exceeded',
						inventory.materials,
						`Building inventory uses ${used} units but capacity is ${capacity}.`
					);
			}
		}
	}
}

function validateMaterialRecord(
	context: ValidationContext,
	value: unknown,
	path: string,
	requireAllowed: boolean
): Map<string, number> {
	const result = new Map<string, number>();
	if (value === undefined) return result;
	if (!isObject(value)) {
		diagnostic(
			context,
			path,
			'invalid-object',
			value,
			`${path} must be a material quantity object.`
		);
		return result;
	}
	for (const [materialId, quantity] of Object.entries(value)) {
		const itemPath = `${path}.${materialId}`;
		if (!KNOWN_MATERIAL_IDS.has(materialId)) {
			diagnostic(
				context,
				itemPath,
				'invalid-reference',
				materialId,
				`Unknown material reference: ${materialId}.`
			);
			continue;
		}
		if (requireAllowed) validateIncluded(context, materialId, itemPath, context.content.materials);
		if (nonNegativeNumber(context, quantity, itemPath)) result.set(materialId, quantity);
	}
	return result;
}

function validateWarehouseCapacity(
	context: ValidationContext,
	value: unknown,
	buildings: readonly AuthoredBuilding[]
): void {
	if (value === undefined || !isObject(value)) return;
	const used = Object.values(value).reduce<number>(
		(total, quantity) =>
			total +
			(typeof quantity === 'number' && Number.isFinite(quantity) && quantity >= 0 ? quantity : 0),
		0
	);
	const capacity = buildings.reduce(
		(total, building) =>
			total +
			(INDUSTRIAL_BUILDING_TYPES[building.typeId as IndustrialBuildingTypeId]?.warehouseCapacity ??
				0),
		0
	);
	if (used > capacity) {
		diagnostic(
			context,
			'start.overrides.warehouseMaterials',
			'warehouse-capacity-exceeded',
			value,
			`Starting warehouse contents use ${used} units but authored capacity is ${capacity}.`
		);
	}
}

function validateWorldOverride(context: ValidationContext, value: unknown): void {
	const world = closedObject(context, value, 'start.overrides.world', WORLD_OVERRIDE_KEYS);
	if (!world) return;
	const revealed = validateReferenceArray(
		context,
		world.revealedCityIds,
		'start.overrides.world.revealedCityIds',
		KNOWN_CITY_IDS,
		'city'
	);
	const opened = validateReferenceArray(
		context,
		world.openedCityIds,
		'start.overrides.world.openedCityIds',
		KNOWN_CITY_IDS,
		'city'
	);
	context.revealedCityIds = revealed;
	context.openedCityIds = opened;
	for (const cityId of opened) {
		if (!revealed.has(cityId))
			diagnostic(
				context,
				'start.overrides.world.openedCityIds',
				'invalid-world-state',
				cityId,
				`Opened city ${cityId} must also be revealed.`
			);
	}
	validateWorldArrayInclusions(
		context,
		world.revealedCityIds,
		'start.overrides.world.revealedCityIds'
	);
	validateWorldArrayInclusions(context, world.openedCityIds, 'start.overrides.world.openedCityIds');
	for (const [key, kind] of [
		['activeRetailCityId', 'retail'],
		['activeIndustryCityId', 'industry']
	] as const) {
		const path = `start.overrides.world.${key}`;
		if (!validateKnownReference(context, world[key], path, KNOWN_CITY_IDS, 'city')) continue;
		const cityId = world[key] as string;
		if (key === 'activeRetailCityId') context.activeRetailCityId = cityId;
		if (getWorldCityDefinition(cityId)?.kind !== kind || !opened.has(cityId))
			diagnostic(
				context,
				path,
				'invalid-world-state',
				cityId,
				`Active ${kind} city must be an opened ${kind} city.`
			);
		validateIncluded(context, cityId, path, context.content.cities);
	}
}

function validateWorldArrayInclusions(
	context: ValidationContext,
	value: unknown,
	path: string
): void {
	if (!Array.isArray(value)) return;
	for (const [index, cityId] of value.entries()) {
		if (typeof cityId === 'string' && KNOWN_CITY_IDS.has(cityId)) {
			validateIncluded(context, cityId, `${path}[${index}]`, context.content.cities);
		}
	}
}

function validateStoreCap(context: ValidationContext, value: unknown): void {
	if (value === undefined) {
		context.storeCap = STARTER_STORE_CAP;
		if (!context.allowedCommands.has('openStore')) {
			diagnostic(
				context,
				'start.overrides.storeCap',
				'invalid-store-cap',
				STARTER_STORE_CAP,
				`When openStore is forbidden, the default store cap ${STARTER_STORE_CAP} must be overridden to the starting store count.`
			);
		}
		return;
	}
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		diagnostic(
			context,
			'start.overrides.storeCap',
			'invalid-store-cap',
			value,
			'Store cap must be an integer no lower than the starting store count.'
		);
		return;
	}
	context.storeCap = value;
	if (!context.allowedCommands.has('openStore') && value !== 1) {
		diagnostic(
			context,
			'start.overrides.storeCap',
			'invalid-store-cap',
			value,
			'When openStore is forbidden, store cap must equal the starting store count.'
		);
	}
}

function validateAllowlistedProductUnlocks(
	context: ValidationContext,
	foundingStore: JsonObject | undefined,
	targetLevels: ReadonlyMap<string, number>
): void {
	for (const productId of context.content.products) {
		let available = false;
		for (const archetype of ARCHETYPES) {
			if (!context.content.archetypes.has(archetype.id)) continue;
			const index = archetype.startingCategories.findIndex((category) => category.id === productId);
			if (index < 0) continue;
			const isFoundingArchetype = foundingStore?.archetypeId === archetype.id;
			const isOpenableArchetype =
				context.allowedCommands.has('openStore') &&
				context.storeCap > 1 &&
				context.permittedRetailPlacements.some(
					(placement) =>
						placement.archetypeId === archetype.id &&
						canActivateRetailCity(context, placement.cityId) &&
						!overlapsFoundingStore(context, placement, foundingStore)
				);
			if (!isFoundingArchetype && !isOpenableArchetype) continue;
			let reachableLevel =
				isFoundingArchetype && typeof foundingStore.ref === 'string'
					? (targetLevels.get(foundingStore.ref) ?? 1)
					: 1;
			if (context.allowedCommands.has('upgradeStore')) reachableLevel = MAX_STORE_LEVEL;
			if (index < getUnlockedCategoryCount(reachableLevel)) available = true;
		}
		if (!available) {
			const values = contentObject(context)?.productCategoryIds;
			const index = Array.isArray(values) ? values.indexOf(productId) : -1;
			diagnostic(
				context,
				`content.productCategoryIds[${Math.max(0, index)}]`,
				'product-locked',
				productId,
				`No allowed archetype can unlock ${productId} under the permitted commands.`
			);
		}
	}
}

function canActivateRetailCity(context: ValidationContext, cityId: string): boolean {
	if (context.activeRetailCityId === cityId) return true;
	if (context.openedCityIds.has(cityId)) {
		return (
			context.allowedCommands.has('selectWorldCity') || context.allowedCommands.has('openWorldCity')
		);
	}
	return context.revealedCityIds.has(cityId) && context.allowedCommands.has('openWorldCity');
}

function overlapsFoundingStore(
	context: ValidationContext,
	placement: PermittedRetailPlacement,
	foundingStore: JsonObject | undefined
): boolean {
	if (
		typeof foundingStore?.cityId !== 'string' ||
		typeof foundingStore.tileId !== 'string' ||
		foundingStore.cityId !== placement.cityId
	)
		return false;
	const city = getValidationCity(context, foundingStore.cityId) as City | undefined;
	const foundingTile = city?.tiles.find((tile) => tile.id === foundingStore.tileId);
	if (!foundingTile) return true;
	return rectanglesOverlap(
		placement.x,
		placement.y,
		RETAIL_STORE_FOOTPRINT_WIDTH,
		RETAIL_STORE_FOOTPRINT_HEIGHT,
		foundingTile.x,
		foundingTile.y,
		RETAIL_STORE_FOOTPRINT_WIDTH,
		RETAIL_STORE_FOOTPRINT_HEIGHT
	);
}

function rectanglesOverlap(
	firstX: number,
	firstY: number,
	firstWidth: number,
	firstHeight: number,
	secondX: number,
	secondY: number,
	secondWidth: number,
	secondHeight: number
): boolean {
	return (
		firstX < secondX + secondWidth &&
		firstX + firstWidth > secondX &&
		firstY < secondY + secondHeight &&
		firstY + firstHeight > secondY
	);
}

function physicalBuildingKey(building: AuthoredBuilding): string {
	return `${building.cityId}:${building.x},${building.y}`;
}

function dedupePhysicalBuildings(buildings: readonly AuthoredBuilding[]): AuthoredBuilding[] {
	const byFootprint = new Map<string, AuthoredBuilding>();
	for (const building of buildings) {
		if (!building.validPlacement || building.x === undefined || building.y === undefined) continue;
		const key = physicalBuildingKey(building);
		if (!byFootprint.has(key)) byFootprint.set(key, building);
	}
	return [...byFootprint.values()];
}

function isCoordinateInsideBuilding(x: number, y: number, building: AuthoredBuilding): boolean {
	return (
		building.x !== undefined &&
		building.y !== undefined &&
		x >= building.x &&
		x < building.x + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH &&
		y >= building.y &&
		y < building.y + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT
	);
}

function validateRails(
	context: ValidationContext,
	value: unknown,
	occupiedByCity: ReadonlyMap<string, Set<string>>
): void {
	const rails = arrayValue(context, value, 'start.rails');
	if (!rails) return;
	const byCity = new Map<string, Array<{ path: string; x: number; y: number; level: number }>>();
	const seen = new Set<string>();
	for (const [index, candidate] of rails.entries()) {
		const path = `start.rails[${index}]`;
		const rail = closedObject(context, candidate, path, RAIL_KEYS);
		if (!rail) continue;
		const validCity = validateKnownReference(
			context,
			rail.cityId,
			`${path}.cityId`,
			KNOWN_CITY_IDS,
			'city'
		);
		if (validCity) validateIncluded(context, rail.cityId, `${path}.cityId`, context.content.cities);
		const validX = typeof rail.x === 'number' && Number.isInteger(rail.x);
		const validY = typeof rail.y === 'number' && Number.isInteger(rail.y);
		if (!validX)
			diagnostic(
				context,
				`${path}.x`,
				'invalid-rail-coordinate',
				rail.x,
				'Rail x must be an integer coordinate.'
			);
		if (!validY)
			diagnostic(
				context,
				`${path}.y`,
				'invalid-rail-coordinate',
				rail.y,
				'Rail y must be an integer coordinate.'
			);
		if (
			typeof rail.level !== 'number' ||
			!Number.isInteger(rail.level) ||
			rail.level < 1 ||
			rail.level > RAIL_MAX_LEVEL
		) {
			diagnostic(
				context,
				`${path}.level`,
				'invalid-rail-level',
				rail.level,
				`Rail level must be an integer from 1 through ${RAIL_MAX_LEVEL}.`
			);
		}
		if (!validCity || !validX || !validY) continue;
		const cityId = rail.cityId as string;
		const key = `${cityId}:${railCellKey(rail.x as number, rail.y as number)}`;
		if (seen.has(key))
			diagnostic(
				context,
				path,
				'duplicate-rail-cell',
				candidate,
				`Duplicate authored rail cell ${key}.`
			);
		seen.add(key);
		const city = getValidationCity(context, cityId);
		const definition = getWorldCityDefinition(cityId);
		const tile =
			definition?.kind === 'industry' && city
				? createIndustryTileLookup(city as IndustryCity).byCoordinate.get(`${rail.x},${rail.y}`)
				: undefined;
		const overlapsPermittedBuilding = context.permittedBuildingPlacements.some(
			(building) =>
				building.validPlacement &&
				building.cityId === cityId &&
				isCoordinateInsideBuilding(rail.x as number, rail.y as number, building)
		);
		if (
			!tile ||
			tile.locked ||
			occupiedByCity.get(cityId)?.has(tile.id) ||
			overlapsPermittedBuilding
		) {
			diagnostic(
				context,
				path,
				'invalid-rail-coordinate',
				candidate,
				'Rail cells must be on unlocked, unoccupied industry tiles.'
			);
			continue;
		}
		const cityRails = byCity.get(cityId) ?? [];
		cityRails.push({ path, x: rail.x as number, y: rail.y as number, level: rail.level as number });
		byCity.set(cityId, cityRails);
		const authoredRails = context.authoredRailsByCity.get(cityId) ?? [];
		authoredRails.push({ x: rail.x as number, y: rail.y as number, level: rail.level as number });
		context.authoredRailsByCity.set(cityId, authoredRails);
	}
	if (rails.length > 0 && !hasValidRailTopology(context, byCity)) {
		diagnostic(
			context,
			'start.rails',
			'invalid-rail-topology',
			value,
			'Every authored rail component must connect at least two authored or permitted building footprints.'
		);
	}
}

function hasValidRailTopology(
	context: ValidationContext,
	byCity: ReadonlyMap<string, Array<{ x: number; y: number }>>
): boolean {
	let hasComponent = false;
	for (const [cityId, rails] of byCity) {
		const coordinates = new Set(rails.map((rail) => railCellKey(rail.x, rail.y)));
		const visited = new Set<string>();
		const permittedBuildings = context.allowedCommands.has('buildIndustrialBuilding')
			? context.permittedBuildingPlacements
			: [];
		const buildings = dedupePhysicalBuildings([
			...context.startBuildingPlacements,
			...permittedBuildings
		]).filter(
			(building) =>
				building.cityId === cityId && building.x !== undefined && building.y !== undefined
		);
		for (const start of coordinates) {
			if (visited.has(start)) continue;
			hasComponent = true;
			const queue = [start];
			const component = new Set<string>();
			visited.add(start);
			while (queue.length > 0) {
				const current = queue.shift()!;
				component.add(current);
				const [x, y] = current.split(',').map(Number);
				for (const [dx, dy] of [
					[0, -1],
					[1, 0],
					[0, 1],
					[-1, 0]
				] as const) {
					const neighbor = railCellKey((x ?? 0) + dx, (y ?? 0) + dy);
					if (coordinates.has(neighbor) && !visited.has(neighbor)) {
						visited.add(neighbor);
						queue.push(neighbor);
					}
				}
			}
			const attached = buildings.filter((building) => {
				const x = building.x!;
				const y = building.y!;
				for (let cellX = x; cellX < x + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH; cellX++) {
					if (
						component.has(railCellKey(cellX, y - 1)) ||
						component.has(railCellKey(cellX, y + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT))
					)
						return true;
				}
				for (let cellY = y; cellY < y + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT; cellY++) {
					if (
						component.has(railCellKey(x - 1, cellY)) ||
						component.has(railCellKey(x + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH, cellY))
					)
						return true;
				}
				return false;
			});
			if (attached.length < 2) return false;
			for (const building of attached) {
				const neighbors = context.railBuildingGraph.get(building.path) ?? new Set<string>();
				for (const neighbor of attached) {
					if (neighbor.path !== building.path) neighbors.add(neighbor.path);
				}
				context.railBuildingGraph.set(building.path, neighbors);
			}
		}
	}
	return hasComponent;
}

function validateCommands(context: ValidationContext, value: unknown): void {
	const commands = arrayValue(context, value, 'allowedCommands');
	if (!commands) return;
	const seen = new Set<string>();
	for (const [index, command] of commands.entries()) {
		const path = `allowedCommands[${index}]`;
		if (typeof command !== 'string' || !KNOWN_COMMANDS.has(command)) {
			diagnostic(
				context,
				path,
				'unsupported-command',
				command,
				`Unsupported scenario command: ${String(command)}.`
			);
			continue;
		}
		if (seen.has(command))
			diagnostic(
				context,
				path,
				'duplicate-command',
				command,
				`Duplicate allowed command: ${command}.`
			);
		seen.add(command);
	}
	context.allowedCommands = seen;
}

function validateModifiers(context: ValidationContext, value: unknown): void {
	const modifiers = arrayValue(context, value, 'modifiers');
	if (!modifiers) return;
	const claimedByScope = new Map<string, { all: boolean; ids: Set<string> }>();
	for (const [index, candidate] of modifiers.entries()) {
		const path = `modifiers[${index}]`;
		if (!isObject(candidate)) {
			diagnostic(context, path, 'invalid-object', candidate, 'Scenario modifiers must be objects.');
			continue;
		}
		if (candidate.kind !== 'import-cost-multiplier') {
			closedObject(context, candidate, path, ['kind'], ['kind']);
			diagnostic(
				context,
				`${path}.kind`,
				'unsupported-modifier',
				candidate.kind,
				`Unsupported modifier kind: ${String(candidate.kind)}.`
			);
			continue;
		}
		const modifier = closedObject(context, candidate, path, [
			'kind',
			'scope',
			'target',
			'multiplier'
		]);
		if (!modifier) continue;
		if (modifier.scope !== 'retail-product' && modifier.scope !== 'industrial-material') {
			diagnostic(
				context,
				`${path}.scope`,
				'invalid-modifier',
				modifier.scope,
				'Unsupported import multiplier scope.'
			);
		}
		if (
			!finiteNumber(context, modifier.multiplier, `${path}.multiplier`) ||
			(typeof modifier.multiplier === 'number' && modifier.multiplier <= 0)
		) {
			if (typeof modifier.multiplier === 'number' && Number.isFinite(modifier.multiplier))
				diagnostic(
					context,
					`${path}.multiplier`,
					'invalid-modifier',
					modifier.multiplier,
					'Import multiplier must be greater than zero.'
				);
			else
				replaceDiagnosticCode(
					context,
					`${path}.multiplier`,
					'invalid-finite-number',
					'invalid-modifier'
				);
		}
		validateModifierTarget(context, modifier.target, `${path}.target`, modifier.scope);
		trackModifierTargetOverlap(
			context,
			{ scope: modifier.scope, target: modifier.target },
			`${path}.target`,
			claimedByScope
		);
	}
}

function trackModifierTargetOverlap(
	context: ValidationContext,
	modifier: { scope: unknown; target: unknown },
	path: string,
	claimedByScope: Map<string, { all: boolean; ids: Set<string> }>
): void {
	if (modifier.scope !== 'retail-product' && modifier.scope !== 'industrial-material') return;
	if (!isObject(modifier.target)) return;
	const scope = modifier.scope as string;
	let claimed = claimedByScope.get(scope);
	if (!claimed) {
		claimed = { all: false, ids: new Set() };
		claimedByScope.set(scope, claimed);
	}
	if (modifier.target.kind === 'all') {
		if (claimed.all || claimed.ids.size > 0)
			diagnostic(
				context,
				path,
				'invalid-modifier',
				modifier.target,
				'Import multiplier target overlaps a previous target in the same scope.'
			);
		claimed.all = true;
		return;
	}
	if (modifier.target.kind === 'ids' && Array.isArray(modifier.target.ids)) {
		const ids = (modifier.target.ids as readonly unknown[]).filter(
			(id): id is string => typeof id === 'string'
		);
		if (claimed.all || ids.some((id) => claimed!.ids.has(id)))
			diagnostic(
				context,
				path,
				'invalid-modifier',
				modifier.target,
				'Import multiplier target overlaps a previous target in the same scope.'
			);
		for (const id of ids) claimed.ids.add(id);
	}
}

function replaceDiagnosticCode(
	context: ValidationContext,
	path: string,
	oldCode: string,
	newCode: string
): void {
	const found = context.diagnostics.findLast((item) => item.path === path && item.code === oldCode);
	if (found) found.code = newCode;
}

function validateModifierTarget(
	context: ValidationContext,
	value: unknown,
	path: string,
	scope: unknown
): void {
	if (!isObject(value)) {
		diagnostic(context, path, 'invalid-object', value, 'Modifier target must be an object.');
		return;
	}
	if (value.kind === 'all') {
		closedObject(context, value, path, ['kind']);
		return;
	}
	if (value.kind !== 'ids') {
		closedObject(context, value, path, ['kind'], ['kind']);
		diagnostic(
			context,
			`${path}.kind`,
			'invalid-modifier',
			value.kind,
			'Modifier target kind must be all or ids.'
		);
		return;
	}
	const target = closedObject(context, value, path, ['kind', 'ids']);
	if (!target) return;
	const registry = scope === 'retail-product' ? KNOWN_PRODUCT_IDS : KNOWN_MATERIAL_IDS;
	const allowed = scope === 'retail-product' ? context.content.products : context.content.materials;
	const kind = scope === 'retail-product' ? 'product category' : 'material';
	const ids = validateReferenceArray(context, target.ids, `${path}.ids`, registry, kind);
	for (const id of ids) {
		const raw = target.ids as readonly unknown[];
		validateIncluded(context, id, `${path}.ids[${raw.indexOf(id)}]`, allowed);
	}
}

function validateConditions(context: ValidationContext, definition: JsonObject): void {
	const groups = [
		['requiredObjectives', definition.requiredObjectives],
		['optionalObjectives', definition.optionalObjectives],
		['failures', definition.failures]
	] as const;
	const seenIds = new Set<string>();
	const required = Array.isArray(definition.requiredObjectives)
		? definition.requiredObjectives
		: undefined;
	if (required && required.length === 0)
		diagnostic(
			context,
			'requiredObjectives',
			'missing-required-objective',
			required,
			'A scenario must define at least one required objective.'
		);
	for (const [groupPath, value] of groups) {
		const conditions = arrayValue(context, value, groupPath);
		if (!conditions) continue;
		for (const [index, candidate] of conditions.entries()) {
			const path = `${groupPath}[${index}]`;
			const condition = closedObject(context, candidate, path, CONDITION_KEYS, [
				'id',
				'labelKey',
				'query',
				'comparator',
				'target',
				'window'
			]);
			if (!condition) continue;
			if (nonEmptyString(context, condition.id, `${path}.id`)) {
				if (seenIds.has(condition.id))
					diagnostic(
						context,
						`${path}.id`,
						'duplicate-objective-id',
						condition.id,
						`Duplicate objective/failure ID: ${condition.id}.`
					);
				seenIds.add(condition.id);
				if (groupPath === 'optionalObjectives') context.optionalObjectiveIds.add(condition.id);
			}
			nonEmptyString(context, condition.labelKey, `${path}.labelKey`);
			if (!COMPARATORS.has(condition.comparator as string))
				diagnostic(
					context,
					`${path}.comparator`,
					'unsupported-comparator',
					condition.comparator,
					'Unsupported objective comparator.'
				);
			finiteNumber(context, condition.target, `${path}.target`);
			if (
				Object.hasOwn(condition, 'requiresCompleteWindow') &&
				typeof condition.requiresCompleteWindow !== 'boolean'
			)
				diagnostic(
					context,
					`${path}.requiresCompleteWindow`,
					'invalid-boolean',
					condition.requiresCompleteWindow,
					'requiresCompleteWindow must be boolean when present.'
				);
			const metric = validateMetricQuery(context, condition.query, `${path}.query`);
			const windowKind = validateWindow(context, condition.window, `${path}.window`);
			validateMetricWindowPair(context, metric, windowKind, condition, path);
		}
	}
}

function validateMetricQuery(
	context: ValidationContext,
	value: unknown,
	path: string
): string | undefined {
	if (!isObject(value)) {
		diagnostic(context, path, 'invalid-object', value, 'Metric query must be an object.');
		return undefined;
	}
	const metric = value.metric;
	if (typeof metric !== 'string' || !Object.hasOwn(METRIC_WINDOWS, metric)) {
		closedObject(context, value, path, ['metric'], ['metric']);
		diagnostic(
			context,
			`${path}.metric`,
			'unsupported-metric',
			metric,
			`Unsupported scenario metric: ${String(metric)}.`
		);
		return undefined;
	}
	let allowedKeys: readonly string[] = ['metric'];
	if (CATEGORY_METRICS.has(metric)) allowedKeys = ['metric', 'categoryIds'];
	else if (metric === 'scorecard') allowedKeys = ['metric', 'score'];
	else if (metric === 'industrial-building-count') allowedKeys = ['metric', 'buildingTypeIds'];
	else if (metric === 'warehouse-quantity') allowedKeys = ['metric', 'materialId'];
	const query = closedObject(context, value, path, allowedKeys);
	if (!query) return metric;
	if (CATEGORY_METRICS.has(metric)) {
		const ids = validateReferenceArray(
			context,
			query.categoryIds,
			`${path}.categoryIds`,
			KNOWN_PRODUCT_IDS,
			'product category'
		);
		if (Array.isArray(query.categoryIds) && query.categoryIds.length === 0)
			diagnostic(
				context,
				`${path}.categoryIds`,
				'missing-reference',
				query.categoryIds,
				'Category metric queries require at least one category.'
			);
		for (const id of ids)
			validateIncluded(
				context,
				id,
				`${path}.categoryIds[${(query.categoryIds as readonly unknown[]).indexOf(id)}]`,
				context.content.products
			);
		if (LOCAL_PRODUCTION_METRICS.has(metric) && !hasLocalProductionPath(context, ids))
			diagnostic(
				context,
				path,
				'unavailable-local-production-path',
				value,
				'The content allowlist does not permit a producer-to-warehouse path for every local-production category.'
			);
	} else if (metric === 'scorecard') {
		if (!SCORE_KEYS.has(query.score as string))
			diagnostic(
				context,
				`${path}.score`,
				'invalid-reference',
				query.score,
				'Unknown scorecard key.'
			);
	} else if (metric === 'industrial-building-count') {
		const ids = validateReferenceArray(
			context,
			query.buildingTypeIds,
			`${path}.buildingTypeIds`,
			KNOWN_BUILDING_TYPE_IDS,
			'building type'
		);
		for (const id of ids)
			validateIncluded(
				context,
				id,
				`${path}.buildingTypeIds[${(query.buildingTypeIds as readonly unknown[]).indexOf(id)}]`,
				context.content.buildingTypes
			);
	} else if (metric === 'warehouse-quantity') {
		if (
			validateKnownReference(
				context,
				query.materialId,
				`${path}.materialId`,
				KNOWN_MATERIAL_IDS,
				'material'
			)
		)
			validateIncluded(context, query.materialId, `${path}.materialId`, context.content.materials);
	}
	return metric;
}

function validateWindow(
	context: ValidationContext,
	value: unknown,
	path: string
): WindowKind | undefined {
	if (!isObject(value)) {
		diagnostic(context, path, 'invalid-object', value, 'Metric window must be an object.');
		return undefined;
	}
	const kind = value.kind;
	if (kind === 'current' || kind === 'run-to-date') {
		closedObject(context, value, path, ['kind']);
		return kind;
	}
	if (kind === 'trailing-reports') {
		const window = closedObject(context, value, path, ['kind', 'count']);
		if (
			window &&
			(typeof window.count !== 'number' || !Number.isInteger(window.count) || window.count <= 0)
		)
			diagnostic(
				context,
				path,
				'invalid-window',
				value,
				'Trailing report count must be a positive integer.'
			);
		return kind;
	}
	if (kind === 'fixed-report-days') {
		const window = closedObject(context, value, path, ['kind', 'startDay', 'endDay']);
		if (
			window &&
			(typeof window.startDay !== 'number' ||
				!Number.isInteger(window.startDay) ||
				window.startDay < 1 ||
				typeof window.endDay !== 'number' ||
				!Number.isInteger(window.endDay) ||
				window.endDay < window.startDay ||
				(context.dayLimit !== undefined && window.endDay > context.dayLimit))
		)
			diagnostic(
				context,
				path,
				'invalid-window',
				value,
				'Fixed report days must be positive, inclusive, ordered, and within the day limit.'
			);
		return kind;
	}
	closedObject(context, value, path, ['kind'], ['kind']);
	if (Object.hasOwn(value, 'kind'))
		diagnostic(
			context,
			`${path}.kind`,
			'unsupported-window',
			kind,
			`Unsupported metric window: ${String(kind)}.`
		);
	return undefined;
}

function validateMetricWindowPair(
	context: ValidationContext,
	metric: string | undefined,
	windowKind: WindowKind | undefined,
	condition: JsonObject,
	path: string
): void {
	if (metric && windowKind && !METRIC_WINDOWS[metric]?.has(windowKind))
		diagnostic(
			context,
			`${path}.window.kind`,
			'unsupported-window',
			windowKind,
			`Metric ${metric} does not support ${windowKind}.`
		);
	if (condition.requiresCompleteWindow === true && windowKind !== 'trailing-reports')
		diagnostic(
			context,
			`${path}.requiresCompleteWindow`,
			'invalid-complete-window',
			true,
			'Complete-window gating is supported only for trailing report windows.'
		);
}

function hasLocalProductionPath(
	context: ValidationContext,
	categoryIds: ReadonlySet<string>
): boolean {
	for (const categoryId of categoryIds) {
		if (
			!KNOWN_MATERIAL_IDS.has(categoryId) ||
			MATERIALS[categoryId as MaterialId].kind !== 'finished'
		)
			return false;
		const requiredTypes = getIndustrialBuildingTypesForProductChain(categoryId).map(
			(type) => type.id
		);
		if (
			requiredTypes.length === 0 ||
			!requiredTypes.every((typeId) => context.content.buildingTypes.has(typeId))
		)
			return false;
		if (!context.content.buildingTypes.has('warehouse')) return false;
		const futurePlacements = context.allowedCommands.has('buildIndustrialBuilding')
			? context.permittedBuildingPlacements
			: [];
		const availablePlacements = dedupePhysicalBuildings([
			...context.startBuildingPlacements,
			...futurePlacements
		]);
		const requiredTypeIds = [...requiredTypes, 'warehouse'];
		const feasibleCityIds = new Set(availablePlacements.map((placement) => placement.cityId));
		const hasFeasibleCity = [...feasibleCityIds].some((cityId) => {
			const cityPlacements = availablePlacements.filter((placement) => placement.cityId === cityId);
			return hasFeasibleBuildingPath(
				context,
				cityPlacements,
				requiredTypeIds,
				context.allowedCommands.has('buildRail')
			);
		});
		if (!hasFeasibleCity) return false;
	}
	return true;
}

function hasFeasibleBuildingPath(
	context: ValidationContext,
	placements: readonly AuthoredBuilding[],
	requiredTypeIds: readonly string[],
	canBuildRail: boolean
): boolean {
	const required = [...new Set(requiredTypeIds)];
	const startingBuildings = placements.filter((placement) => placement.path.startsWith('start.'));

	function choose(index: number, selected: AuthoredBuilding[]): boolean {
		if (index === required.length) {
			return canBuildRail
				? canConnectBuildingsWithRail(context, selected)
				: areBuildingsRailConnected(context, selected);
		}
		const candidates = placements.filter((placement) => placement.typeId === required[index]);
		for (const candidate of candidates) {
			if (selected.some((existing) => buildingsOverlap(existing, candidate))) continue;
			if (
				candidate.path.startsWith('content.') &&
				startingBuildings.some((existing) => buildingsOverlap(existing, candidate))
			)
				continue;
			if (choose(index + 1, [...selected, candidate])) return true;
		}
		return false;
	}

	return choose(0, []);
}

function canConnectBuildingsWithRail(
	context: ValidationContext,
	selected: readonly AuthoredBuilding[]
): boolean {
	const first = selected[0];
	if (!first || selected.some((building) => building.cityId !== first.cityId)) return false;
	const city = getValidationCity(context, first.cityId);
	if (!city || getWorldCityDefinition(first.cityId)?.kind !== 'industry') return false;

	const physicalBuildings = dedupePhysicalBuildings([
		...context.startBuildingPlacements.filter((building) => building.cityId === first.cityId),
		...selected
	]);
	const buildingIds = new Map<string, string>();
	const industrialBuildings: IndustrialBuilding[] = physicalBuildings.map((building, index) => {
		const id = `scenario-validation-building-${index}`;
		buildingIds.set(physicalBuildingKey(building), id);
		return {
			id,
			level: 1,
			typeId: building.typeId as IndustrialBuildingTypeId,
			cityId: building.cityId,
			tileId: building.tileId,
			mapX: building.x!,
			mapY: building.y!,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0,
			inventory: {}
		};
	});
	let game = {
		cash: Number.MAX_SAFE_INTEGER,
		industryCities: [
			{
				...(city as IndustryCity),
				rails: [...(context.authoredRailsByCity.get(first.cityId) ?? [])]
			}
		],
		industrialBuildings
	} as GameState;
	const connected = new Set<AuthoredBuilding>([first]);

	while (connected.size < selected.length) {
		let connectedOne = false;
		for (const origin of connected) {
			for (const destination of selected) {
				if (connected.has(destination)) continue;
				const originBuildingId = buildingIds.get(physicalBuildingKey(origin));
				const destinationBuildingId = buildingIds.get(physicalBuildingKey(destination));
				if (!originBuildingId || !destinationBuildingId) continue;
				const input = { originBuildingId, waypoints: [], destinationBuildingId };
				const preview = buildRailPreview(game, input);
				if (preview.blockReason && preview.blockReason.code !== 'railAlreadyConnected') continue;
				if (preview.blockReason === null) game = buildRail(game, input);
				connected.add(destination);
				connectedOne = true;
				break;
			}
			if (connectedOne) break;
		}
		if (!connectedOne) return false;
	}
	return true;
}

function buildingsOverlap(first: AuthoredBuilding, second: AuthoredBuilding): boolean {
	if (
		first.path === second.path ||
		first.cityId !== second.cityId ||
		first.x === undefined ||
		first.y === undefined ||
		second.x === undefined ||
		second.y === undefined
	)
		return first.path === second.path;
	return rectanglesOverlap(
		first.x,
		first.y,
		INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
		INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
		second.x,
		second.y,
		INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
		INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT
	);
}

function areBuildingsRailConnected(
	context: ValidationContext,
	buildings: readonly AuthoredBuilding[]
): boolean {
	const first = buildings[0];
	if (!first || !context.railBuildingGraph.has(first.path)) return false;
	const visited = new Set<string>([first.path]);
	const queue = [first.path];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const neighbor of context.railBuildingGraph.get(current) ?? []) {
			if (!visited.has(neighbor)) {
				visited.add(neighbor);
				queue.push(neighbor);
			}
		}
	}
	return buildings.every((building) => visited.has(building.path));
}

function validateScores(context: ValidationContext, definition: JsonObject): void {
	const components = arrayValue(context, definition.scoreComponents, 'scoreComponents');
	let total = 0;
	if (components) {
		for (const [index, candidate] of components.entries()) {
			const path = `scoreComponents[${index}]`;
			if (!isObject(candidate)) {
				diagnostic(context, path, 'invalid-object', candidate, 'Score components must be objects.');
				continue;
			}
			const kind = candidate.kind;
			let component: JsonObject | undefined;
			if (kind === 'optional-objective') {
				component = closedObject(context, candidate, path, ['kind', 'objectiveId', 'points']);
				if (
					component &&
					(!nonEmptyString(context, component.objectiveId, `${path}.objectiveId`) ||
						!context.optionalObjectiveIds.has(component.objectiveId as string))
				)
					diagnostic(
						context,
						`${path}.objectiveId`,
						'invalid-reference',
						component?.objectiveId,
						'Optional-objective score components must reference an optional objective.'
					);
			} else if (kind === 'metric') {
				component = closedObject(context, candidate, path, [
					'kind',
					'query',
					'window',
					'zeroBonusAt',
					'fullBonusAt',
					'points'
				]);
				if (component) {
					const metric = validateMetricQuery(context, component.query, `${path}.query`);
					const window = validateWindow(context, component.window, `${path}.window`);
					if (metric && window && !METRIC_WINDOWS[metric]?.has(window))
						diagnostic(
							context,
							`${path}.window.kind`,
							'unsupported-window',
							window,
							`Metric ${metric} does not support ${window}.`
						);
					validateScoreAnchors(context, component, path);
				}
			} else if (kind === 'remaining-days') {
				component = closedObject(context, candidate, path, [
					'kind',
					'zeroBonusAt',
					'fullBonusAt',
					'points'
				]);
				if (component) validateScoreAnchors(context, component, path);
			} else {
				closedObject(context, candidate, path, ['kind'], ['kind']);
				diagnostic(
					context,
					`${path}.kind`,
					'unsupported-score-component',
					kind,
					`Unsupported score component: ${String(kind)}.`
				);
			}
			if (
				component &&
				(typeof component.points !== 'number' ||
					!Number.isInteger(component.points) ||
					component.points < 0)
			)
				diagnostic(
					context,
					`${path}.points`,
					'invalid-score-points',
					component.points,
					'Score component points must be a non-negative integer.'
				);
			else if (component && typeof component.points === 'number') total += component.points;
		}
	}
	if (total !== BRONZE_SCORE)
		diagnostic(
			context,
			'scoreComponents',
			'invalid-score-total',
			total,
			`Score components must allocate exactly ${BRONZE_SCORE} bonus points.`
		);

	const medals = closedObject(
		context,
		definition.medalThresholds,
		'medalThresholds',
		MEDAL_THRESHOLD_KEYS
	);
	if (
		medals &&
		(typeof medals.silver !== 'number' ||
			!Number.isInteger(medals.silver) ||
			typeof medals.gold !== 'number' ||
			!Number.isInteger(medals.gold) ||
			medals.silver <= BRONZE_SCORE ||
			medals.gold <= medals.silver ||
			medals.gold > MAX_SCORE)
	)
		diagnostic(
			context,
			'medalThresholds',
			'invalid-medal-thresholds',
			definition.medalThresholds,
			`Medal thresholds must satisfy ${BRONZE_SCORE} < silver < gold <= ${MAX_SCORE}.`
		);
}

function validateScoreAnchors(
	context: ValidationContext,
	component: JsonObject,
	path: string
): void {
	const zeroValid = finiteNumber(context, component.zeroBonusAt, `${path}.zeroBonusAt`);
	const fullValid = finiteNumber(context, component.fullBonusAt, `${path}.fullBonusAt`);
	if (zeroValid && fullValid && component.zeroBonusAt === component.fullBonusAt)
		diagnostic(
			context,
			path,
			'invalid-score-anchors',
			component,
			'Score anchors must define a non-zero range.'
		);
}

export function validateScenarioDefinition(definition: unknown): ScenarioDiagnostic[] {
	const initialWorld = createInitialWorldProgress();
	const context: ValidationContext = {
		diagnostics: [],
		content: {
			cities: new Set(),
			archetypes: new Set(),
			products: new Set(),
			materials: new Set(),
			buildingTypes: new Set()
		},
		allowedCommands: new Set(),
		optionalObjectiveIds: new Set(),
		permittedRetailPlacements: [],
		storeCap: STARTER_STORE_CAP,
		startBuildingPlacements: [],
		permittedBuildingPlacements: [],
		railBuildingGraph: new Map(),
		authoredRailsByCity: new Map(),
		revealedCityIds: new Set(initialWorld.revealedCityIds),
		openedCityIds: new Set(initialWorld.openedCityIds),
		cities: new Map()
	};
	const root = closedObject(context, definition, '', DEFINITION_KEYS);
	if (!root) return sortScenarioDiagnostics(context.diagnostics);
	context.definition = root;
	validateDefinitionIdentity(context, root);
	validateContent(context, root.content);
	validateCommands(context, root.allowedCommands);
	validateStart(context, root.start);
	validateModifiers(context, root.modifiers);
	validateConditions(context, root);
	validateScores(context, root);
	return sortScenarioDiagnostics(context.diagnostics);
}

export function assertValidScenarioDefinition(
	definition: unknown
): asserts definition is ScenarioDefinition {
	const diagnostics = validateScenarioDefinition(definition);
	if (diagnostics.length === 0) return;
	const error = new Error(
		`Invalid scenario definition (${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}).`
	) as Error & {
		diagnostics: ScenarioDiagnostic[];
	};
	error.name = 'ScenarioDefinitionValidationError';
	error.diagnostics = diagnostics;
	throw error;
}
