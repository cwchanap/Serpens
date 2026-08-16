import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getIndustryTilesByResource } from '$lib/game/industry';
import { resolveEffectiveRecurringRoute } from '$lib/game/logisticsRouteModifiers';
import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
import type { RailSegment } from '$lib/game/rail';
import { createNewGame } from '$lib/game/state';
import type {
	CityTile,
	DailyStoreReport,
	GameState,
	IndustrialBuilding,
	IndustryTile,
	Store
} from '$lib/game/types';
import { createI18n, type I18nBundle } from '$lib/i18n';
import MapInspectorHost from './MapInspectorHost.svelte';

interface InspectorProps {
	game: GameState;
	i18n: I18nBundle;
	disabledReason: string | null;

	showRetailInspector: boolean;
	selectedRetailTile: CityTile | null;
	selectedStore: Store | null;
	latestStoreReport: DailyStoreReport | null;
	canUpgradeStore: boolean;
	onUpgradeStore: (storeId: string) => void;
	onOpenStoreDetails: () => void;
	onRetailClickFeedback: () => void;
	onCloseRetailInspector: () => void;

	showIndustryInspector: boolean;
	selectedIndustryTile: IndustryTile | null;
	selectedIndustryBuilding: IndustrialBuilding | null;
	selectedRailSegments: RailSegment[] | null;
	allIndustryRailSegments: RailSegment[];
	industryCityId: string;
	canUpgradeIndustryBuilding: boolean;
	canUpgradeRail: boolean;
	canDemolishRail: boolean;
	onUpgradeIndustryBuilding: (buildingId: string) => void;
	onUpgradeRailSegment: (segmentId: string) => void;
	onDemolishRailSegment: (segmentId: string) => void;
	onCloseIndustryInspector: () => void;

	showLogisticsRouteInspector: boolean;
	selectedLogisticsRoute: RouteOperationalSummary | null;
	onManageLogisticsRoute: (routeId: string) => void;
	onCloseLogisticsRouteInspector: () => void;
}

function inspectorProps(overrides: Partial<InspectorProps> = {}): InspectorProps {
	const baseGame = { ...createNewGame('convenience', 20_260_808), cash: 999_999 };
	const industryCity = {
		...baseGame.industryCities[0]!,
		rails: [
			{ x: 1, y: 1, level: 1 },
			{ x: 2, y: 1, level: 1 }
		]
	};
	const game: GameState = { ...baseGame, industryCities: [industryCity] };
	const store = game.stores[0]!;
	const retailTile = game.cities[0]!.tiles.find((tile) => tile.id === store.tileId)!;
	const industryTile = getIndustryTilesByResource(industryCity, 'grain-field')[0]!;
	const industryBuilding: IndustrialBuilding = {
		id: 'grain-farm-inspector-test',
		level: 1,
		typeId: 'grain-farm',
		cityId: industryTile.cityId,
		tileId: industryTile.id,
		mapX: industryTile.x,
		mapY: industryTile.y,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
	const railSegment: RailSegment = {
		id: 'seg:1,1|2,1',
		cellKeys: ['1,1', '2,1'],
		minLevel: 1
	};
	const selectedLogisticsRoute: RouteOperationalSummary = {
		route: {
			id: 'route-1',
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			capacity: 30,
			frequencyDays: 3,
			leadTimeDays: 2,
			transportCostPerUnit: 2,
			priority: 1,
			state: 'active',
			nextDispatchOnDay: 11
		},
		effective: resolveEffectiveRecurringRoute(
			{
				id: 'route-1',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				capacity: 30,
				frequencyDays: 3,
				leadTimeDays: 2,
				transportCostPerUnit: 2,
				priority: 1,
				state: 'active',
				nextDispatchOnDay: 11
			},
			[],
			11
		),
		inTransitQuantity: 8,
		latestAttempt: null,
		utilization: null,
		unusedCapacity: 0,
		unmetDestinationNeed: 0,
		deliveredUnits: 42,
		transportCost: 84,
		condition: 'awaiting-dispatch'
	};

	return {
		game,
		i18n: createI18n('en'),
		disabledReason: null,
		showRetailInspector: false,
		selectedRetailTile: retailTile,
		selectedStore: store,
		latestStoreReport: null,
		canUpgradeStore: true,
		onUpgradeStore: vi.fn(),
		onOpenStoreDetails: vi.fn(),
		onRetailClickFeedback: vi.fn(),
		onCloseRetailInspector: vi.fn(),
		showIndustryInspector: false,
		selectedIndustryTile: industryTile,
		selectedIndustryBuilding: industryBuilding,
		selectedRailSegments: null,
		allIndustryRailSegments: [railSegment],
		industryCityId: industryCity.id,
		canUpgradeIndustryBuilding: true,
		canUpgradeRail: true,
		canDemolishRail: true,
		onUpgradeIndustryBuilding: vi.fn(),
		onUpgradeRailSegment: vi.fn(),
		onDemolishRailSegment: vi.fn(),
		onCloseIndustryInspector: vi.fn(),
		showLogisticsRouteInspector: false,
		selectedLogisticsRoute,
		onManageLogisticsRoute: vi.fn(),
		onCloseLogisticsRouteInspector: vi.fn(),
		...overrides
	};
}

describe('MapInspectorHost', () => {
	it('renders the selected retail tile inspector when visible', async () => {
		expect.assertions(1);
		render(MapInspectorHost, inspectorProps({ showRetailInspector: true }));

		await expect.element(page.getByRole('button', { name: /open details/i })).toBeVisible();
	});

	it('forwards Open Details once from the retail inspector', async () => {
		expect.assertions(1);
		const onOpenStoreDetails = vi.fn();
		render(MapInspectorHost, inspectorProps({ showRetailInspector: true, onOpenStoreDetails }));

		await page.getByRole('button', { name: /open details/i }).click();
		expect(onOpenStoreDetails).toHaveBeenCalledTimes(1);
	});

	it('forwards Close once from the retail inspector', async () => {
		expect.assertions(1);
		const onCloseRetailInspector = vi.fn();
		render(MapInspectorHost, inspectorProps({ showRetailInspector: true, onCloseRetailInspector }));

		await page.getByRole('button', { name: /close/i }).click();
		expect(onCloseRetailInspector).toHaveBeenCalledTimes(1);
	});

	it('prefers rail details over industry building details', async () => {
		expect.assertions(2);
		const props = inspectorProps();
		render(
			MapInspectorHost,
			inspectorProps({
				showIndustryInspector: true,
				selectedIndustryTile: props.selectedIndustryTile,
				selectedIndustryBuilding: props.selectedIndustryBuilding,
				selectedRailSegments: props.allIndustryRailSegments
			})
		);

		await expect.element(page.getByRole('dialog', { name: /rail segment/i })).toBeVisible();
		await expect
			.element(page.getByRole('dialog', { name: /industry tile details/i }))
			.not.toBeInTheDocument();
	});

	it('renders industry tile details when no rail selection exists', async () => {
		expect.assertions(2);
		render(MapInspectorHost, inspectorProps({ showIndustryInspector: true }));

		await expect
			.element(page.getByRole('dialog', { name: /industry tile details/i }))
			.toBeVisible();
		await expect
			.element(page.getByRole('dialog', { name: /rail segment/i }))
			.not.toBeInTheDocument();
	});

	it('keeps the child upgrade control disabled when store upgrades are unavailable', async () => {
		expect.assertions(1);
		render(MapInspectorHost, inspectorProps({ showRetailInspector: true, canUpgradeStore: false }));

		await expect.element(page.getByRole('button', { name: /upgrade/i })).toBeDisabled();
	});

	it('renders the route inspector only when the explicit boolean-and-summary gate passes', async () => {
		expect.assertions(2);
		const props = inspectorProps({ showLogisticsRouteInspector: true });
		render(MapInspectorHost, props);

		await expect
			.element(page.getByRole('dialog', { name: /logistics route inspector/i }))
			.toBeVisible();
		await expect.element(page.getByRole('heading', { name: /industry city/i })).toBeVisible();
	});

	it('does not render the route inspector when the explicit boolean gate is false', async () => {
		expect.assertions(1);
		render(MapInspectorHost, inspectorProps({ showLogisticsRouteInspector: false }));
		await expect
			.element(page.getByRole('dialog', { name: /logistics route inspector/i }))
			.not.toBeInTheDocument();
	});

	it('does not render a route inspector when the current summary is null', async () => {
		expect.assertions(1);
		render(
			MapInspectorHost,
			inspectorProps({ showLogisticsRouteInspector: true, selectedLogisticsRoute: null })
		);

		await expect
			.element(page.getByRole('dialog', { name: /logistics route inspector/i }))
			.not.toBeInTheDocument();
	});

	it('forwards route Manage and Close callbacks through the host', async () => {
		expect.assertions(2);
		const onManageLogisticsRoute = vi.fn();
		const onCloseLogisticsRouteInspector = vi.fn();
		render(
			MapInspectorHost,
			inspectorProps({
				showLogisticsRouteInspector: true,
				onManageLogisticsRoute,
				onCloseLogisticsRouteInspector
			})
		);

		await page.getByRole('button', { name: 'Manage route' }).click();
		expect(onManageLogisticsRoute).toHaveBeenCalledWith('route-1');
		await page.getByRole('button', { name: /close logistics route inspector/i }).click();
		expect(onCloseLogisticsRouteInspector).toHaveBeenCalledTimes(1);
	});
});
