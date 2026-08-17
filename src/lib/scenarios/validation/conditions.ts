import { MATERIALS, getIndustrialBuildingTypesForProductChain } from '$lib/game/industry';
import { getProductDefinition } from '$lib/game/products';
import type { ProductId } from '$lib/game/types';
import { getWorldCityDefinition } from '$lib/game/world';
import type { AuthoredBuilding, JsonObject, ValidationContext, WindowKind } from './shared';
import {
	PRODUCT_METRICS,
	COMPARATORS,
	CONDITION_KEYS,
	KNOWN_BUILDING_TYPE_IDS,
	KNOWN_CITY_IDS,
	KNOWN_MATERIAL_IDS,
	KNOWN_PRODUCT_IDS,
	LOCAL_PRODUCTION_METRICS,
	METRIC_WINDOWS,
	SCORE_KEYS,
	arrayValue,
	closedObject,
	diagnostic,
	finiteNumber,
	isObject,
	nonEmptyString,
	validateIncluded,
	validateKnownReference,
	validateReferenceArray
} from './shared';
import { buildingsOverlap, dedupePhysicalBuildings } from './geometry';
import { areBuildingsRailConnected, canConnectBuildingsWithRail } from './rails';

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
	if (PRODUCT_METRICS.has(metric)) allowedKeys = ['metric', 'productIds'];
	else if (metric === 'scorecard') allowedKeys = ['metric', 'score'];
	else if (metric === 'industrial-building-count') allowedKeys = ['metric', 'buildingTypeIds'];
	else if (metric === 'city-inventory-quantity') allowedKeys = ['metric', 'cityId', 'materialId'];
	const query = closedObject(context, value, path, allowedKeys);
	if (!query) return metric;
	if (PRODUCT_METRICS.has(metric)) {
		const ids = validateReferenceArray(
			context,
			query.productIds,
			`${path}.productIds`,
			KNOWN_PRODUCT_IDS,
			'product'
		);
		if (Array.isArray(query.productIds) && query.productIds.length === 0)
			diagnostic(
				context,
				`${path}.productIds`,
				'missing-reference',
				query.productIds,
				'Product metric queries require at least one product.'
			);
		for (const id of ids)
			validateIncluded(
				context,
				id,
				`${path}.productIds[${(query.productIds as readonly unknown[]).indexOf(id)}]`,
				context.content.products
			);
		if (LOCAL_PRODUCTION_METRICS.has(metric) && !hasLocalProductionPath(context, ids))
			diagnostic(
				context,
				path,
				'unavailable-local-production-path',
				value,
				'The content allowlist does not permit a producer-to-warehouse path for every local-production product.'
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
	} else if (metric === 'city-inventory-quantity') {
		if (validateKnownReference(context, query.cityId, `${path}.cityId`, KNOWN_CITY_IDS, 'city')) {
			const city = getWorldCityDefinition(query.cityId);
			if (city?.kind !== 'industry') {
				diagnostic(
					context,
					`${path}.cityId`,
					'invalid-city-inventory-city',
					query.cityId,
					'City inventory metrics require an industry city.'
				);
			} else if (!context.openedCityIds.has(query.cityId)) {
				diagnostic(
					context,
					`${path}.cityId`,
					'city-inventory-city-closed',
					query.cityId,
					'City inventory metrics require an opened industry city.'
				);
			}
			validateIncluded(context, query.cityId, `${path}.cityId`, context.content.cities);
		}
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
	productIds: ReadonlySet<ProductId>
): boolean {
	for (const productId of productIds) {
		const materialId = getProductDefinition(productId).productionMaterialId;
		if (!materialId || MATERIALS[materialId].kind !== 'finished') return false;
		const requiredTypes = getIndustrialBuildingTypesForProductChain(materialId).map(
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

export { validateConditions, validateMetricQuery, validateWindow };
