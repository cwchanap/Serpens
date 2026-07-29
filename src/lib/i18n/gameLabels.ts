import type {
	ArchetypeId,
	CityTileFeature,
	IndustryResourceId,
	IndustryTerrainId,
	IndustrialBuildingTypeId,
	NeighborhoodId,
	ScoreKey,
	ServicePriority,
	TerrainId,
	LoanPurpose,
	LoanStatus,
	LoanTermDays,
	WorldCityId
} from '$lib/game/types';
import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
import type { MapViewId } from '$lib/game/mapViewKeepAlive';
import type {
	InventoryBuffer,
	MarketingFocus,
	PricingPosture,
	StaffingPosture
} from '$lib/game/types';
import type { Translator } from './translate';

export interface NamedLabel {
	name: string;
	description?: string;
}

export interface GameLabelLookup {
	archetype(id: ArchetypeId | string): NamedLabel;
	archetypeRisk(id: ArchetypeId | string, index: number): string;
	productCategory(id: string): string;
	material(id: string): string;
	industrialBuilding(id: IndustrialBuildingTypeId | string): string;
	industryResource(id: IndustryResourceId | string): string;
	neighborhood(id: NeighborhoodId | string): string;
	terrain(id: TerrainId | string): string;
	tileFeature(id: NonNullable<CityTileFeature> | string): string;
	industryTerrain(id: IndustryTerrainId | string): string;
	policyField(
		field: 'pricing' | 'inventory' | 'staffing' | 'marketing' | 'service' | string
	): string;
	policyValue(
		field: 'pricing' | 'inventory' | 'staffing' | 'marketing' | 'service' | string,
		value:
			| PricingPosture
			| InventoryBuffer
			| StaffingPosture
			| MarketingFocus
			| ServicePriority
			| string
	): string;
	scoreKey(key: ScoreKey | string): string;
	worldCity(id: WorldCityId | string): NamedLabel;
	mapView(id: MapViewId | string): string;
	managementPanel(id: ManagementPanelId | string): string;
	loanPurpose(id: LoanPurpose | string): string;
	loanStatus(id: LoanStatus | string): string;
	loanTerm(days: LoanTermDays | number): string;
}

function readMessage(t: Translator, key: string): string | null {
	const value = t(key as never);
	return value === key ? null : value;
}

function humanizeId(id: string): string {
	return id
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[-_]+/g, ' ')
		.trim()
		.replace(/\b\w/g, (part) => part.toUpperCase());
}

function labelOrFallback(t: Translator, key: string, id: string): string {
	return readMessage(t, key) ?? humanizeId(id);
}

export function createGameLabelLookup(t: Translator): GameLabelLookup {
	return {
		archetype(id) {
			return {
				name: labelOrFallback(t, `game.archetypes.${id}.name`, id),
				description: readMessage(t, `game.archetypes.${id}.description`) ?? undefined
			};
		},
		archetypeRisk(id, index) {
			return labelOrFallback(t, `game.archetypes.${id}.risks.${index}`, `${id} risk ${index + 1}`);
		},
		productCategory(id) {
			return labelOrFallback(t, `game.products.${id}`, id);
		},
		material(id) {
			return labelOrFallback(t, `game.materials.${id}`, id);
		},
		industrialBuilding(id) {
			return labelOrFallback(t, `game.industrialBuildings.${id}`, id);
		},
		industryResource(id) {
			return labelOrFallback(t, `game.industryResources.${id}`, id);
		},
		neighborhood(id) {
			return labelOrFallback(t, `game.neighborhoods.${id}`, id);
		},
		terrain(id) {
			return labelOrFallback(t, `game.terrain.${id}`, id);
		},
		tileFeature(id) {
			return labelOrFallback(t, `game.tileFeatures.${id}`, id);
		},
		industryTerrain(id) {
			return labelOrFallback(t, `game.industryTerrain.${id}`, id);
		},
		policyField(field) {
			return labelOrFallback(t, `game.policyFields.${field}`, field);
		},
		policyValue(field, value) {
			return labelOrFallback(t, `game.policyValues.${field}.${value}`, value);
		},
		scoreKey(key) {
			return labelOrFallback(t, `game.scoreKeys.${key}`, key);
		},
		worldCity(id) {
			return {
				name: labelOrFallback(t, `game.worldCities.${id}.name`, id),
				description: readMessage(t, `game.worldCities.${id}.specialtySummary`) ?? undefined
			};
		},
		mapView(id) {
			return labelOrFallback(t, `game.mapViews.${id}`, id);
		},
		managementPanel(id) {
			return labelOrFallback(t, `game.managementPanels.${id}`, id);
		},
		loanPurpose(id) {
			return labelOrFallback(t, `game.loanPurposes.${id}`, id);
		},
		loanStatus(id) {
			return labelOrFallback(t, `game.loanStatuses.${id}`, id);
		},
		loanTerm(days) {
			return labelOrFallback(t, `game.loanTerms.${days}`, `${days} days`);
		}
	};
}
