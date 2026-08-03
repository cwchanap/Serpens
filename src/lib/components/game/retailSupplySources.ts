import {
	getCityInventory,
	getCityInventoryUsed,
	supportsCityInventory
} from '$lib/game/cityInventory';
import { WORLD_CITY_CATALOG } from '$lib/game/world';
import type { GameState } from '$lib/game/types';
import type { I18nBundle } from '$lib/i18n';

export const RETAIL_SUPPLY_IMPORTS_ONLY_VALUE = '__retail_supply_imports_only__';
export const RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE = '__retail_supply_configuration_missing__';

export type RetailSupplySelection = string | null | 'missing';

export interface RetailSupplySourceOption {
	supplyCityId: string;
	label: string;
	available: boolean;
	disabled: boolean;
	inventorySummary: string;
	overflowSummary: string;
}

export interface RetailCitySupplyView {
	panelTitle: string;
	retailCityId: string;
	sectionHeading: string;
	selectId: string;
	selectLabel: string;
	descriptionId: string;
	controlDescription: string;
	currentSelection: RetailSupplySelection;
	currentSummary: string;
	importsOnlyLabel: string;
	missingConfigurationLabel: string;
	sourceOptions: readonly RetailSupplySourceOption[];
}

/**
 * Produces the render-only retail-source model in world-catalog order. It does
 * not repair malformed state: a missing assignment remains distinct from a
 * deliberate Imports-only (`null`) configuration, while a stale non-null
 * source is preserved as a disabled recovery option.
 */
export function buildRetailCitySupplyViews(
	game: GameState,
	i18n: I18nBundle
): RetailCitySupplyView[] {
	const validSourceOptions = buildValidSourceOptions(game, i18n);

	return WORLD_CITY_CATALOG.filter(
		(city) =>
			city.kind === 'retail' &&
			game.world.openedCityIds.includes(city.id) &&
			game.cities.some((retailCity) => retailCity.id === city.id)
	).map((retailCity) => {
		const assignment = game.retailSupplyAssignments.find(
			(candidate) => candidate.retailCityId === retailCity.id
		);
		const currentSelection: RetailSupplySelection = assignment
			? assignment.supplyCityId
			: 'missing';
		const sourceOptions = validSourceOptions.map((option) => ({ ...option }));
		const selectedSource =
			typeof currentSelection === 'string'
				? sourceOptions.find((option) => option.supplyCityId === currentSelection)
				: undefined;

		if (typeof currentSelection === 'string' && !selectedSource) {
			sourceOptions.push(createUnavailableSourceOption(currentSelection, i18n));
		}

		return {
			panelTitle: i18n.t('retailSupplySources.title'),
			retailCityId: retailCity.id,
			sectionHeading: i18n.t('retailSupplySources.citySection', {
				cityName: i18n.labels.worldCity(retailCity.id).name
			}),
			selectId: `retail-supply-source-${retailCity.id}`,
			selectLabel: i18n.t('retailSupplySources.controlLabel', {
				cityName: i18n.labels.worldCity(retailCity.id).name
			}),
			descriptionId: `retail-supply-source-${retailCity.id}-description`,
			controlDescription: i18n.t('retailSupplySources.controlDescription', {
				cityName: i18n.labels.worldCity(retailCity.id).name
			}),
			currentSelection,
			currentSummary: currentSourceSummary(currentSelection, selectedSource, i18n),
			importsOnlyLabel: i18n.t('retailSupplySources.importsOnly'),
			missingConfigurationLabel: i18n.t('retailSupplySources.missingConfiguration'),
			sourceOptions
		};
	});
}

function buildValidSourceOptions(game: GameState, i18n: I18nBundle): RetailSupplySourceOption[] {
	return WORLD_CITY_CATALOG.flatMap((city) => {
		if (city.kind !== 'industry' || !supportsCityInventory(game, city.id)) {
			return [];
		}

		const access = getCityInventory(game, city.id);
		if (!access.ok) {
			return [];
		}

		const used = getCityInventoryUsed(access.inventory);
		const inventorySummary = i18n.t('retailSupplySources.inventorySummary', {
			used: i18n.format.integer(used),
			capacity: i18n.format.integer(access.inventory.capacity)
		});
		const overflowSummary =
			access.inventory.overflowUnits > 0
				? i18n.t('retailSupplySources.overflow', {
						units: i18n.format.integer(access.inventory.overflowUnits),
						cost: i18n.format.currency(access.inventory.overflowCost)
					})
				: i18n.t('retailSupplySources.noOverflow');

		return [
			{
				supplyCityId: city.id,
				label: i18n.labels.worldCity(city.id).name,
				available: true,
				disabled: false,
				inventorySummary,
				overflowSummary
			}
		];
	});
}

function createUnavailableSourceOption(
	supplyCityId: string,
	i18n: I18nBundle
): RetailSupplySourceOption {
	const cityName = i18n.labels.worldCity(supplyCityId).name;
	return {
		supplyCityId,
		label: cityName,
		available: false,
		disabled: true,
		inventorySummary: i18n.t('retailSupplySources.unavailableSource', { cityName }),
		overflowSummary: ''
	};
}

function currentSourceSummary(
	selection: RetailSupplySelection,
	selectedSource: RetailSupplySourceOption | undefined,
	i18n: I18nBundle
): string {
	if (selection === null) {
		return i18n.t('retailSupplySources.importsOnlySummary');
	}

	if (selection === 'missing') {
		return i18n.t('retailSupplySources.missingConfiguration');
	}

	if (!selectedSource) {
		return createUnavailableSourceOption(selection, i18n).inventorySummary;
	}

	return [selectedSource.label, selectedSource.inventorySummary, selectedSource.overflowSummary]
		.filter(Boolean)
		.join(' ');
}
