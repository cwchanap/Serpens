import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CityMapSnapshot } from '$lib/game/mapRender';
import type { IndustryMapSnapshot } from '$lib/game/industryMapRender';
import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
import type { RecurringRoute } from '$lib/game/types';
import type { MapViewId, VisitedMapViews } from '$lib/game/mapViewKeepAlive';
import { WORLD_CITY_CATALOG, type WorldCityStatus } from '$lib/game/world';
import { createI18n, type I18nBundle } from '$lib/i18n';
import MapSurfaceHost from './MapSurfaceHost.svelte';

vi.mock('phaser', () => ({
	default: {
		AUTO: 0,
		Game: class {
			destroy(): void {}
		},
		Scene: class {},
		Scale: { RESIZE: 0, CENTER_BOTH: 0 }
	}
}));

interface SurfaceProps {
	activeMapView: MapViewId;
	visitedMapViews: VisitedMapViews;
	isMapPaused: boolean;
	i18n: I18nBundle;

	worldCityStatuses: WorldCityStatus[];
	selectedWorldCityId: string | null;
	onSelectWorldCity: (cityId: string) => void;
	onOpenWorldCity: (cityId: string) => void;
	onFinanceWorldCity: (cityId: string) => void;
	onCloseWorldInspector: () => void;
	canOpenWorldCity: boolean;
	canFinanceWorldCity: boolean;
	allowedWorldCityIds: string[];
	mutationDisabledReason: string | null;
	logisticsRouteSummaries: readonly RouteOperationalSummary[];
	selectedLogisticsRouteId: string | null;
	onSelectLogisticsRoute: (routeId: string) => void;

	mapSnapshot: CityMapSnapshot;
	onSelectRetailTile: (tileId: string) => void;

	industryMapSnapshot: IndustryMapSnapshot;
	onSelectIndustryTile: (tileId: string) => void;
	onCancelRailBuild: () => void;
	railKeyboardEnabled: boolean;
}

function surfaceProps(overrides: Partial<SurfaceProps> = {}): SurfaceProps {
	const worldCity = WORLD_CITY_CATALOG.find((city) => city.id === 'harbor-city')!;
	const industryCity = WORLD_CITY_CATALOG.find((city) => city.id === 'industry-city')!;
	const destinationCity = WORLD_CITY_CATALOG.find((city) => city.id === 'breadbasket-basin')!;
	const route: RecurringRoute = {
		id: 'route-1',
		originCityId: industryCity.id,
		destinationCityId: destinationCity.id,
		materialId: 'water',
		capacity: 30,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 7
	};

	return {
		activeMapView: 'world',
		visitedMapViews: { world: true, retail: false, industry: false },
		isMapPaused: false,
		i18n: createI18n('en'),
		worldCityStatuses: [
			{
				city: worldCity,
				state: 'opened',
				canOpen: false,
				blockedReason: null,
				storeCount: 0,
				buildingCount: 0,
				financeOffer: null
			},
			{
				city: industryCity,
				state: 'opened',
				canOpen: false,
				blockedReason: null,
				storeCount: 0,
				buildingCount: 0,
				financeOffer: null
			},
			{
				city: destinationCity,
				state: 'opened',
				canOpen: false,
				blockedReason: null,
				storeCount: 0,
				buildingCount: 0,
				financeOffer: null
			}
		],
		selectedWorldCityId: null,
		onSelectWorldCity: vi.fn(),
		onOpenWorldCity: vi.fn(),
		onFinanceWorldCity: vi.fn(),
		onCloseWorldInspector: vi.fn(),
		canOpenWorldCity: true,
		canFinanceWorldCity: true,
		allowedWorldCityIds: [worldCity.id],
		mutationDisabledReason: null,
		logisticsRouteSummaries: [
			{
				route,
				inTransitQuantity: 0,
				latestAttempt: null,
				utilization: null,
				unusedCapacity: 0,
				unmetDestinationNeed: 0,
				deliveredUnits: 0,
				transportCost: 0,
				condition: 'awaiting-dispatch'
			}
		],
		selectedLogisticsRouteId: null,
		onSelectLogisticsRoute: vi.fn(),
		mapSnapshot: {
			cityId: 'retail-city',
			width: 1,
			height: 1,
			selectedTileId: null,
			placementPreview: null,
			tiles: [],
			stores: []
		},
		onSelectRetailTile: vi.fn(),
		industryMapSnapshot: {
			cityId: 'industry-city',
			width: 1,
			height: 1,
			selectedTileId: null,
			placementPreview: null,
			tiles: [],
			buildings: [],
			rails: [],
			railPreview: null
		},
		onSelectIndustryTile: vi.fn(),
		onCancelRailBuild: vi.fn(),
		railKeyboardEnabled: true,
		...overrides
	};
}

describe('MapSurfaceHost', () => {
	it('keeps visited surfaces mounted and exposes only the active surface', async () => {
		expect.assertions(7);
		const onSelectWorldCity = vi.fn();
		const result = render(
			MapSurfaceHost,
			surfaceProps({
				activeMapView: 'world',
				visitedMapViews: { world: true, retail: true, industry: false },
				onSelectWorldCity
			})
		);

		expect(document.querySelectorAll('.map-surface')).toHaveLength(2);
		expect(document.querySelectorAll('.active-map-surface')).toHaveLength(1);
		await expect.element(page.getByRole('region', { name: /world map/i })).toBeVisible();
		await expect
			.element(page.getByRole('region', { name: /industry map/i }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: /^Harbor City$/i }).click();
		expect(onSelectWorldCity).toHaveBeenCalledWith('harbor-city');

		await result.rerender(
			surfaceProps({
				activeMapView: 'retail',
				visitedMapViews: { world: true, retail: true, industry: true }
			})
		);

		expect(document.querySelectorAll('.map-surface')).toHaveLength(3);
		expect(document.querySelectorAll('.active-map-surface')).toHaveLength(1);
	});

	it('forwards world logistics route summaries and selection through the active surface', async () => {
		expect.assertions(4);
		const onSelectLogisticsRoute = vi.fn();
		render(
			MapSurfaceHost,
			surfaceProps({ selectedLogisticsRouteId: 'route-1', onSelectLogisticsRoute })
		);

		await expect.element(page.getByTestId('world-logistics-routes')).toBeVisible();
		await expect
			.element(page.getByTestId('world-logistics-route-route-1'))
			.toHaveAttribute('data-selected', 'true');
		const routeButton = page.getByRole('button', {
			name: /Industry City to Breadbasket Basin.*Water/i
		});
		await expect.element(routeButton).toBeVisible();
		await routeButton.click();
		expect(onSelectLogisticsRoute).toHaveBeenCalledWith('route-1');
	});
});
