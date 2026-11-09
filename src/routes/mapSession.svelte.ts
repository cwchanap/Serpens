import {
	selectMapHeading,
	selectMapViewSelections,
	selectWorldCityStatuses,
	resolveWorldCityFinancing,
	resolveWorldCityOpening,
	resolveWorldCitySelection
} from './mapNavigationRoute';
import {
	selectRecentDeliveredTransfers,
	selectRouteOperations,
	type RouteOperationalSummary
} from '$lib/game/logisticsReadModels';
import {
	createInitialVisitedMapViews,
	markMapViewVisited,
	type MapViewId,
	type VisitedMapViews
} from '$lib/game/mapViewKeepAlive';
import {
	resolveIndustrySelectionAnchorTileId,
	resolveSelectionAnchorTileId
} from '$lib/game/placementPreview';
import { isWorldCityId, type WorldCityStatus } from '$lib/game/world';
import type { City, GameState, IndustryCity, TransferOrder, WorldCityId } from '$lib/game/types';
import type { I18nBundle } from '$lib/i18n';
import type { PendingFinancedPurchase } from './financePurchaseReview';
import type { GameRouteController, MutationAvailability } from './gameRouteController';

/** Navigation-only command port: read-only selection and world-city writes. */
export type MapSessionCommands = Pick<
	GameRouteController,
	'selectReadOnlyTile' | 'selectWorldCity' | 'openWorldCity'
>;

export type MapSelectionKind = 'worldCity' | 'retailTile' | 'industryTile' | 'logisticsRoute';

interface MapSessionOptions {
	getGame(): GameState | null;
	/** Presentation fallback before founding; the single per-instance preview game. */
	getFallback(): GameState;
	getI18n(): I18nBundle;
	getAvailability(): MutationAvailability;
	getAllowedWorldCityIds(): readonly WorldCityId[];
	/** Scenario gate: may selecting an opened city switch the active map? */
	getWorldSelectionAvailable(): boolean;
	/** Management owner's focused logistics route, for view-switch focus policy. */
	getFocusedLogisticsRouteId(): string | null;
	/** Task 3 construction click; returns true when the click was consumed. */
	tryConstructionClick(kind: 'retail' | 'industry', tileId: string): boolean;
	/** Cancels armed placement/rail after a navigation commits. */
	onCancelConstruction(): void;
	/** Clears the management owner's focused logistics route. */
	onClearLogisticsFocus(): void;
	/** Opens the financed-purchase review (construction owner) for a world city. */
	onReviewPurchase(purchase: PendingFinancedPurchase): void;
	commands: MapSessionCommands;
}

/**
 * Page-lived map navigation owner: the active/visited map views, the four
 * selection ids (retail tile, industry tile, world city, logistics route),
 * the active retail/industry cities with their headings, and the world map's
 * read models (city statuses, route summaries, selected route, latest
 * delivered transfer). All inputs are live getters, so a replaced
 * game/locale/availability re-derives without losing visited renderer state.
 *
 * Root keeps alert/guidance orchestration and the reset protocols; those call
 * the named clear operations here instead of writing selection atoms.
 */
export function createMapSession(options: MapSessionOptions) {
	let activeMapView = $state<MapViewId>('retail');
	let visitedMapViews = $state<VisitedMapViews>(createInitialVisitedMapViews('retail'));
	let selectedTileId = $state<string | null>(null);
	let selectedIndustryTileId = $state<string | null>(null);
	let selectedWorldCityId = $state<string | null>(null);
	let selectedLogisticsRouteId = $state<string | null>(null);

	const activeRetailCity = $derived.by(() => {
		const game = options.getGame();
		return (
			game?.cities.find((city) => city.id === game.activeCityId) ?? options.getFallback().cities[0]!
		);
	});
	const activeIndustryCity = $derived.by(() => {
		const game = options.getGame();
		return (
			game?.industryCities.find((city) => city.id === game.activeIndustryCityId) ??
			options.getFallback().industryCities[0]!
		);
	});
	const heading = $derived(
		selectMapHeading(activeMapView, activeRetailCity.id, activeIndustryCity.id, options.getI18n())
	);
	const worldCityStatuses = $derived(selectWorldCityStatuses(options.getGame()));
	const allowedWorldCityIds = $derived(options.getAllowedWorldCityIds());
	const logisticsRouteSummaries = $derived.by<RouteOperationalSummary[]>(() => {
		const game = options.getGame();
		return game ? selectRouteOperations(game) : [];
	});
	const latestDeliveredTransfer = $derived.by<TransferOrder | null>(() => {
		const game = options.getGame();
		const cityId = selectedWorldCityId;
		if (!game || !cityId || !isWorldCityId(cityId)) return null;
		return selectRecentDeliveredTransfers(game, cityId)[0] ?? null;
	});
	const selectedLogisticsRoute = $derived.by<RouteOperationalSummary | null>(() =>
		selectedLogisticsRouteId
			? (logisticsRouteSummaries.find((summary) => summary.route.id === selectedLogisticsRouteId) ??
				null)
			: null
	);

	function activateView(view: MapViewId): void {
		activeMapView = view;
		visitedMapViews = markMapViewVisited(visitedMapViews, view);
	}

	function clearLogisticsSelection(): void {
		selectedLogisticsRouteId = null;
		options.onClearLogisticsFocus();
	}

	function setView(view: MapViewId): void {
		const next = selectMapViewSelections(view, {
			selectedTileId,
			selectedIndustryTileId,
			selectedWorldCityId,
			selectedLogisticsRouteId,
			focusedLogisticsRouteId: options.getFocusedLogisticsRouteId()
		});
		activateView(view);
		selectedTileId = next.selectedTileId;
		selectedIndustryTileId = next.selectedIndustryTileId;
		selectedWorldCityId = next.selectedWorldCityId;
		selectedLogisticsRouteId = next.selectedLogisticsRouteId;
		// Leaving the world view clears the focused route; the owner atom is
		// only ever cleared through its named callback.
		if (options.getFocusedLogisticsRouteId() !== next.focusedLogisticsRouteId) {
			options.onClearLogisticsFocus();
		}
		options.onCancelConstruction();
	}

	function selectRetailTile(tileId: string): void {
		clearLogisticsSelection();
		if (options.tryConstructionClick('retail', tileId)) return;

		// Resolve a click inside a placed 2x2 store footprint to that store's
		// anchor so the inspector shows the anchor's tile-derived stats
		// (neighborhood/demand/rent) instead of the clicked cell's.
		const game = options.getGame();
		options.commands.selectReadOnlyTile(
			'retail',
			game ? resolveSelectionAnchorTileId(activeRetailCity, game.stores, tileId) : tileId
		);
		selectedIndustryTileId = null;
		selectedWorldCityId = null;
	}

	function selectIndustryTile(tileId: string): void {
		clearLogisticsSelection();
		if (options.tryConstructionClick('industry', tileId)) return;

		// Resolve a click inside a placed 2x2 industrial building footprint to
		// that building's anchor for the same reason as selectRetailTile above.
		// A rail-cell tile has no footprint to resolve, so it is left as-is —
		// the segment selection then derives the rail inspector for it.
		const game = options.getGame();
		options.commands.selectReadOnlyTile(
			'industry',
			game
				? resolveIndustrySelectionAnchorTileId(activeIndustryCity, game.industrialBuildings, tileId)
				: tileId
		);
		selectedTileId = null;
		selectedWorldCityId = null;
	}

	async function selectWorldCity(cityId: WorldCityId): Promise<void> {
		clearLogisticsSelection();
		const selection = resolveWorldCitySelection(
			options.getGame(),
			cityId,
			options.getAllowedWorldCityIds(),
			options.getWorldSelectionAvailable()
		);
		if (!selection) return;
		selectedWorldCityId = selection.cityId;
		if (!selection.mapView) return;

		const result = await options.commands.selectWorldCity(selection.cityId);
		// `unchanged` means the city is already the active one — the controller
		// skipped the write, but navigation to its map should still proceed.
		if (
			result.status !== 'committed' &&
			result.status !== 'sandbox-committed' &&
			result.status !== 'unchanged'
		) {
			return;
		}
		activateView(selection.mapView);
		selectedWorldCityId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		options.onCancelConstruction();
	}

	async function openWorldCity(cityId: WorldCityId): Promise<void> {
		const legalCityId = resolveWorldCityOpening(
			options.getGame(),
			cityId,
			options.getAllowedWorldCityIds(),
			options.getAvailability().openWorldCity
		);
		if (!legalCityId) return;
		void options.commands.openWorldCity(legalCityId);
		selectedWorldCityId = legalCityId;
	}

	function reviewWorldCityFinancing(cityId: WorldCityId): void {
		const purchase = resolveWorldCityFinancing(
			options.getGame(),
			cityId,
			options.getAllowedWorldCityIds(),
			options.getAvailability().financeWorldCity
		);
		if (purchase) options.onReviewPurchase(purchase);
	}

	async function switchToSupplyCity(cityId: WorldCityId): Promise<boolean> {
		if (!options.getGame()) return false;
		await selectWorldCity(cityId);
		const currentGame = options.getGame();
		if (!currentGame || currentGame.activeIndustryCityId !== cityId) return false;
		activateView('industry');
		selectedTileId = null;
		selectedWorldCityId = null;
		clearLogisticsSelection();
		return true;
	}

	function selectLogisticsRoute(routeId: string): void {
		if (!logisticsRouteSummaries.some((summary) => summary.route.id === routeId)) return;
		activateView('world');
		selectedWorldCityId = null;
		selectedTileId = null;
		selectedIndustryTileId = null;
		options.onCancelConstruction();
		options.onClearLogisticsFocus();
		selectedLogisticsRouteId = routeId;
	}

	function clearSelection(kind: MapSelectionKind): void {
		if (kind === 'worldCity') selectedWorldCityId = null;
		else if (kind === 'retailTile') selectedTileId = null;
		else if (kind === 'industryTile') selectedIndustryTileId = null;
		else clearLogisticsSelection();
	}

	return {
		get activeMapView(): MapViewId {
			return activeMapView;
		},
		get visitedMapViews(): VisitedMapViews {
			return visitedMapViews;
		},
		get selectedTileId(): string | null {
			return selectedTileId;
		},
		get selectedIndustryTileId(): string | null {
			return selectedIndustryTileId;
		},
		get selectedWorldCityId(): string | null {
			return selectedWorldCityId;
		},
		get selectedLogisticsRouteId(): string | null {
			return selectedLogisticsRouteId;
		},
		get activeRetailCity(): City {
			return activeRetailCity;
		},
		get activeIndustryCity(): IndustryCity {
			return activeIndustryCity;
		},
		get mapEyebrow(): string {
			return heading.mapEyebrow;
		},
		get mapTitle(): string {
			return heading.mapTitle;
		},
		get worldCityStatuses(): WorldCityStatus[] {
			return worldCityStatuses;
		},
		get allowedWorldCityIds(): readonly WorldCityId[] {
			return allowedWorldCityIds;
		},
		get logisticsRouteSummaries(): RouteOperationalSummary[] {
			return logisticsRouteSummaries;
		},
		get selectedLogisticsRoute(): RouteOperationalSummary | null {
			return selectedLogisticsRoute;
		},
		get latestDeliveredTransfer(): TransferOrder | null {
			return latestDeliveredTransfer;
		},
		setView,
		selectRetailTile,
		selectIndustryTile,
		selectWorldCity,
		openWorldCity,
		reviewWorldCityFinancing,
		switchToSupplyCity,
		selectLogisticsRoute,
		clearSelection,
		clearPlacementSelections(): void {
			selectedTileId = null;
			selectedIndustryTileId = null;
			selectedWorldCityId = null;
		},
		acceptRouteRemoved(routeId: string): void {
			if (selectedLogisticsRouteId === routeId) selectedLogisticsRouteId = null;
		},
		/** Read-only receiver: updates only the named atom, never a command. */
		acceptReadOnlySelection(kind: 'retail' | 'industry', tileId: string): void {
			if (kind === 'retail') selectedTileId = tileId;
			else selectedIndustryTileId = tileId;
		},
		selectPlacementTile(kind: 'retail' | 'industry', tileId: string): void {
			selectedWorldCityId = null;
			if (kind === 'retail') {
				selectedTileId = tileId;
				selectedIndustryTileId = null;
			} else {
				selectedIndustryTileId = tileId;
				selectedTileId = null;
			}
		}
	};
}

export type MapSession = ReturnType<typeof createMapSession>;
