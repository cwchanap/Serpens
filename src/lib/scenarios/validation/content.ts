import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import {
	createIndustryTileLookup,
	getIndustryBuildingFootprint
} from '$lib/game/industryFootprint';
import {
	createCityTileLookup,
	getStoreFootprintPlacementBlockReason
} from '$lib/game/storeFootprint';
import type { City, IndustrialBuildingTypeId, IndustryCity } from '$lib/game/types';
import { getWorldCityDefinition } from '$lib/game/world';
import type { AuthoredBuilding, JsonObject, ValidationContext } from './shared';
import {
	CONTENT_KEYS,
	INDUSTRIAL_PLACEMENT_KEYS,
	KNOWN_ARCHETYPE_IDS,
	KNOWN_BUILDING_TYPE_IDS,
	KNOWN_CITY_IDS,
	KNOWN_MATERIAL_IDS,
	KNOWN_PRODUCT_IDS,
	RETAIL_PLACEMENT_KEYS,
	arrayValue,
	closedObject,
	diagnostic,
	getValidationCity,
	nonEmptyString,
	validateIncluded,
	validateKnownReference,
	validateReferenceArray
} from './shared';

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
					y: tile.y,
					path
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

export {
	validateContent,
	validateRetailPlacement,
	validateIndustrialPlacementShape,
	validateIndustrialBuildingPlacement
};
