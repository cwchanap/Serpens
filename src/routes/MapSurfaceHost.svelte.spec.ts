import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CityMapSnapshot } from '$lib/game/mapRender';
import type { IndustryMapSnapshot } from '$lib/game/industryMapRender';
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
		Scale: { RESIZE: 0, CENTER_BOTH: 0 }
	}
}));

vi.mock('$lib/phaser/cityMapScene', () => ({
	CityMapScene: class {
		setEventHandler(): void {}
		updateSnapshot(): void {}
	}
}));

vi.mock('$lib/phaser/industryMapScene', () => ({
	IndustryMapScene: class {
		setEventHandler(): void {}
		setKeyboardEnabled(): void {}
		updateSnapshot(): void {}
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

	mapSnapshot: CityMapSnapshot;
	onSelectRetailTile: (tileId: string) => void;

	industryMapSnapshot: IndustryMapSnapshot;
	onSelectIndustryTile: (tileId: string) => void;
	onCancelRailBuild: () => void;
	railKeyboardEnabled: boolean;
}

function surfaceProps(overrides: Partial<SurfaceProps> = {}): SurfaceProps {
	const worldCity = WORLD_CITY_CATALOG.find((city) => city.id === 'harbor-city')!;

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
});
