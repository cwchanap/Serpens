import { getCityInventoryStats, supportsCityInventory } from '$lib/game/cityInventory';
import { WORLD_CITY_CATALOG } from '$lib/game/world';
import type { GameState, WorldCityId } from '$lib/game/types';
import type { I18nBundle } from '$lib/i18n';

export const RETAIL_SUPPLY_IMPORTS_ONLY_VALUE = '__retail_supply_imports_only__';

export type RetailSupplySelection = WorldCityId | null;

export interface RetailSupplySourceOption {
	supplyCityId: WorldCityId;
	label: string;
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
	sourceOptions: readonly RetailSupplySourceOption[];
}

/**
 * Produces the render-only retail-source model in world-catalog order from a
 * validated current game state.
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
		if (!assignment) {
			throw new Error(`Retail supply invariant: missing assignment for ${retailCity.id}`);
		}

		const currentSelection = assignment.supplyCityId;
		if (currentSelection !== null) {
			getCityInventoryStats(game, currentSelection);
		}

		const sourceOptions = validSourceOptions.map((option) => ({ ...option }));
		const selectedSource =
			currentSelection !== null
				? sourceOptions.find((option) => option.supplyCityId === currentSelection)
				: undefined;

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
			sourceOptions
		};
	});
}

function buildValidSourceOptions(game: GameState, i18n: I18nBundle): RetailSupplySourceOption[] {
	return WORLD_CITY_CATALOG.flatMap((city) => {
		if (city.kind !== 'industry' || !supportsCityInventory(game, city.id)) {
			return [];
		}

		const stats = getCityInventoryStats(game, city.id);
		const inventorySummary = i18n.t('retailSupplySources.inventorySummary', {
			used: i18n.format.integer(stats.used),
			capacity: i18n.format.integer(stats.capacity)
		});
		const overflowSummary =
			stats.overflowUnits > 0
				? i18n.t(
						stats.overflowUnits === 1
							? 'retailSupplySources.overflowSingular'
							: 'retailSupplySources.overflow',
						{
							units: i18n.format.integer(stats.overflowUnits),
							cost: i18n.format.currency(stats.overflowCost)
						}
					)
				: i18n.t('retailSupplySources.noOverflow');

		return [
			{
				supplyCityId: city.id,
				label: i18n.labels.worldCity(city.id).name,
				inventorySummary,
				overflowSummary
			}
		];
	});
}

function currentSourceSummary(
	selection: RetailSupplySelection,
	selectedSource: RetailSupplySourceOption | undefined,
	i18n: I18nBundle
): string {
	if (selection === null) {
		return i18n.t('retailSupplySources.importsOnlySummary');
	}

	if (!selectedSource) {
		throw new Error(`Retail supply invariant: unavailable source ${selection}`);
	}

	return [selectedSource.label, selectedSource.inventorySummary, selectedSource.overflowSummary]
		.filter(Boolean)
		.join(' ');
}
