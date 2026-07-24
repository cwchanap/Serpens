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
	generateIndustryCity
} from '$lib/game/industry';
import type { City, IndustryCity, RailCell } from '$lib/game/types';
import { WORLD_CITY_CATALOG, getWorldCityDefinition } from '$lib/game/world';
import { SCENARIO_COMMAND_KINDS, type ScenarioDiagnostic } from '../types';

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

export function diagnostic(
	context: ValidationContext,
	path: string,
	code: string,
	value: unknown,
	detail: string
): void {
	context.diagnostics.push({ path, code, value, detail });
}

export function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function closedObject(
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

export function joinPath(base: string, key: string): string {
	return base ? `${base}.${key}` : key;
}

export function arrayValue(
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

export function finiteNumber(
	context: ValidationContext,
	value: unknown,
	path: string
): value is number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		diagnostic(context, path, 'invalid-finite-number', value, `${path} must be a finite number.`);
		return false;
	}
	return true;
}

export function nonNegativeNumber(
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

export function positiveNumber(
	context: ValidationContext,
	value: unknown,
	path: string
): value is number {
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

export function nonEmptyString(
	context: ValidationContext,
	value: unknown,
	path: string
): value is string {
	if (typeof value !== 'string' || value.length === 0) {
		diagnostic(context, path, 'invalid-string', value, `${path} must be a non-empty string.`);
		return false;
	}
	return true;
}

export function validateKnownReference(
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

export function validateReferenceArray(
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

export function getValidationCity(
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

export function validateIncluded(
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

export {
	SUPPORTED_DEFINITION_VERSION,
	BRONZE_SCORE,
	MAX_SCORE,
	DEFINITION_KEYS,
	START_KEYS,
	FOUNDING_STORE_KEYS,
	INDUSTRIAL_BUILDING_KEYS,
	RAIL_KEYS,
	OVERRIDE_KEYS,
	POLICY_KEYS,
	STORE_OVERRIDE_KEYS,
	PRODUCT_OVERRIDE_KEYS,
	BUILDING_INVENTORY_KEYS,
	WORLD_OVERRIDE_KEYS,
	CONTENT_KEYS,
	RETAIL_PLACEMENT_KEYS,
	INDUSTRIAL_PLACEMENT_KEYS,
	CONDITION_KEYS,
	MEDAL_THRESHOLD_KEYS,
	KNOWN_ARCHETYPE_IDS,
	KNOWN_CITY_IDS,
	KNOWN_MATERIAL_IDS,
	KNOWN_BUILDING_TYPE_IDS,
	KNOWN_PRODUCT_IDS,
	KNOWN_COMMANDS,
	COMPARATORS,
	SCORE_KEYS,
	POLICY_VALUES,
	METRIC_WINDOWS,
	CATEGORY_METRICS,
	LOCAL_PRODUCTION_METRICS
};

export type {
	WindowKind,
	JsonObject,
	ValidationContext,
	PermittedRetailPlacement,
	AuthoredBuilding
};
