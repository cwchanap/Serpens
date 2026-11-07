import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { generateCity } from '$lib/game/city';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview
} from '$lib/game/placementPreview';
import { buildIndustrialBuilding } from '$lib/game/industryPlacement';
import { createNewGame } from '$lib/game/state';
import { refreshWorldProgress } from '$lib/game/world';
import type { GameState, RecurringRoute, TransferOrder, WorldCityId } from '$lib/game/types';
import { createBrowserSaveRepository } from '$lib/persistence/browserSaveRepository';
import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
import { calculateStockHealth } from '$lib/game/stock';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import { createI18n, type I18nBundle } from '$lib/i18n';
import { createRoutePreviewGame } from './routePreviewGame';
import { GameRouteController, type MutationAvailability } from './gameRouteController';
import type { PendingFinancedPurchase } from './financePurchaseReview';
import MapInspectorHost from './MapInspectorHost.svelte';
import RetailSimulationPage from './+page.svelte';
import { createMapSession, type MapSessionCommands } from './mapSession.svelte';

vi.mock('$lib/persistence/saveRepositoryFactory', () => ({ createSaveRepository: vi.fn() }));
vi.mock('./MapInspectorHost.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('./MapInspectorHost.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('./ManagementPanelHost.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('./ManagementPanelHost.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('$lib/audio/audioController', () => ({
	createGameAudioController: () => ({
		unlock: async () => {},
		setActiveBgm: () => {},
		playSfx: async () => {},
		getPreferences: () => DEFAULT_AUDIO_PREFERENCES,
		updatePreferences: () => {},
		destroy: async () => {}
	})
}));
afterEach(() => vi.restoreAllMocks());

function allAvailability(overrides: Partial<MutationAvailability> = {}): MutationAvailability {
	return {
		pending: false,
		advanceDay: true,
		resolveDecision: true,
		updatePolicy: true,
		scopedPolicy: true,
		delegation: true,
		openWorldCity: true,
		setRetailSupplySource: true,
		manageLogistics: true,
		createRecurringRoute: true,
		updateRecurringRoute: true,
		pauseRecurringRoute: true,
		resumeRecurringRoute: true,
		openStore: true,
		upgradeStore: true,
		hireStaff: true,
		assignStaff: true,
		unassignStaff: true,
		releaseStaff: true,
		promoteStaff: true,
		updateStoreSellingPrice: true,
		updateStoreInventoryTargets: true,
		updateStoreProductBrand: true,
		buildIndustrialBuilding: true,
		upgradeIndustrialBuilding: true,
		buildRail: true,
		upgradeRail: true,
		demolishRail: true,
		borrow: true,
		repayLoan: true,
		payOffLoan: true,
		refinanceLoan: true,
		financeWorldCity: true,
		financeRetailStore: true,
		financeIndustrialBuilding: true,
		...overrides
	};
}

function recurringRoute(): RecurringRoute {
	return {
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
		nextDispatchOnDay: 7
	};
}

function deliveredTransfer(): TransferOrder {
	return {
		id: 'transfer-7',
		source: { kind: 'manual' },
		originCityId: 'industry-city',
		destinationCityId: 'industry-city',
		materialId: 'water',
		quantity: 12,
		createdOnDay: 5,
		dispatchedOnDay: 6,
		arrivalOnDay: 9,
		transportCost: 24,
		status: 'delivered'
	};
}

/** Sandbox game with campus-junction opened and an out-of-stock store there.
 * Save-valid: no logistics enrichments (a second materialized industry city
 * would be needed for legal route/transfer endpoints). */
function sandboxGameBase(seed = 20260810): GameState {
	const base = createNewGame('convenience', seed);
	const firstCity = base.cities[0]!;
	const campus = generateCity({
		id: 'campus-junction',
		name: 'Campus Junction',
		width: firstCity.tiles.reduce((max, tile) => Math.max(max, tile.x), 0) + 1,
		height: firstCity.tiles.reduce((max, tile) => Math.max(max, tile.y), 0) + 1,
		seed: 20260811
	});
	const campusProducts = base.stores[0]!.products.map((product) => ({ ...product, lots: [] }));
	const withCampusCity = {
		...base,
		cash: 500_000,
		cities: [...base.cities, campus]
	};
	const campusAnchor = createRetailPlacementPreview({
		game: withCampusCity,
		city: campus,
		archetypeId: 'convenience',
		cashCommandAvailable: true,
		financeCommandAvailable: true
	}).validTileIds[0]!;
	const campusStore = {
		...base.stores[0]!,
		id: 'store-campus',
		cityId: 'campus-junction',
		tileId: campusAnchor,
		products: campusProducts,
		// Empty lots change the health; keep the save-codec invariant honest.
		stockHealth: calculateStockHealth(campusProducts)
	};
	const candidate = {
		...withCampusCity,
		stores: [...base.stores, campusStore],
		world: {
			...base.world,
			revealedCityIds: [...base.world.revealedCityIds, 'campus-junction' as WorldCityId],
			openedCityIds: [...base.world.openedCityIds, 'campus-junction' as WorldCityId]
		},
		// The save codec requires one supply record per opened retail city.
		retailSupplyAssignments: [
			...base.retailSupplyAssignments,
			{ retailCityId: 'campus-junction' as WorldCityId, supplyCityId: null }
		]
	} as GameState;
	// The save codec requires world progress to be current (idempotent).
	return refreshWorldProgress(candidate);
}

/** Owner-level fixture: adds one recurring route. Never passed to a save
 * repository — save validation requires distinct materialized industry
 * endpoints, which this fixture does not materialize. */
function sandboxGame(seed = 20260810): GameState {
	const base = sandboxGameBase(seed);
	return {
		...base,
		logistics: {
			...base.logistics,
			recurringRoutes: [recurringRoute()],
			nextRouteSequence: 2
		}
	} as GameState;
}

interface Holder {
	game: GameState | null;
	fallback: GameState;
	i18n: I18nBundle;
	availability: MutationAvailability;
	allowedWorldCityIds: WorldCityId[];
	worldSelectionAvailable: boolean;
	focusedLogisticsRouteId: string | null;
	constructionClicks: Array<['retail' | 'industry', string]>;
}

function baseHolder(): Holder {
	return {
		game: sandboxGame(),
		fallback: createRoutePreviewGame(),
		i18n: createI18n('en'),
		availability: allAvailability(),
		allowedWorldCityIds: [
			'harbor-city',
			'industry-city',
			'campus-junction',
			'breadbasket-basin',
			'garden-borough'
		],
		worldSelectionAvailable: true,
		focusedLogisticsRouteId: null,
		constructionClicks: []
	};
}

function spyCommands() {
	return {
		selectReadOnlyTile: vi.fn(),
		// Loose result type: tests deliberately resolve rejected/unchanged too.
		selectWorldCity: vi.fn(
			async (): Promise<{ status: string }> => ({
				status: 'sandbox-committed'
			})
		),
		openWorldCity: vi.fn(
			async (): Promise<{ status: string }> => ({
				status: 'sandbox-committed'
			})
		)
	};
}

interface Mounted {
	session: ReturnType<typeof createMapSession>;
	commands: ReturnType<typeof spyCommands>;
	holder: Holder;
	/** Live counter object: callbacks mutate it after the mount returns. */
	counters: { constructionCancels: number; focusClears: number };
	reviewedPurchases: PendingFinancedPurchase[];
}

function mountSession(holder: Holder = baseHolder(), consumeConstruction = true): Mounted {
	const live = $state(holder);
	const commands = spyCommands();
	const counters = { constructionCancels: 0, focusClears: 0 };
	const reviewedPurchases: PendingFinancedPurchase[] = [];
	const session = createMapSession({
		getGame: () => live.game,
		getFallback: () => live.fallback,
		getI18n: () => live.i18n,
		getAvailability: () => live.availability,
		getAllowedWorldCityIds: () => live.allowedWorldCityIds,
		getWorldSelectionAvailable: () => live.worldSelectionAvailable,
		getFocusedLogisticsRouteId: () => live.focusedLogisticsRouteId,
		tryConstructionClick: (kind, tileId) => {
			live.constructionClicks.push([kind, tileId]);
			return consumeConstruction;
		},
		onCancelConstruction: () => {
			counters.constructionCancels += 1;
		},
		onClearLogisticsFocus: () => {
			counters.focusClears += 1;
		},
		onReviewPurchase: (purchase) => {
			reviewedPurchases.push(purchase);
		},
		commands: commands as unknown as MapSessionCommands
	});
	// Mirrors the page: the read-only receiver updates only the named atom.
	commands.selectReadOnlyTile.mockImplementation((kind: 'retail' | 'industry', tileId: string) =>
		session.acceptReadOnlySelection(kind, tileId)
	);
	return { session, commands, holder: live, counters, reviewedPurchases };
}

it('replaces game, locale, availability and allowed cities live without losing visited views', () => {
	const mounted = mountSession();
	const { session, holder } = mounted;
	expect(session.mapTitle).toBe('Harbor City');
	// The active cities are live reads of the current game (or fallback),
	// not snapshots captured at creation.
	const initialGame = holder.game!;
	expect(session.activeRetailCity).toBe(
		initialGame.cities.find((city) => city.id === initialGame.activeCityId)
	);
	expect(session.activeIndustryCity).toBe(
		initialGame.industryCities.find((city) => city.id === initialGame.activeIndustryCityId)
	);
	expect(session.worldCityStatuses.find((s) => s.city.id === 'campus-junction')?.state).toBe(
		'opened'
	);
	expect(session.logisticsRouteSummaries).toHaveLength(1);

	session.setView('world');
	expect(session.visitedMapViews).toEqual({ world: true, retail: true, industry: false });

	holder.i18n = createI18n('ja');
	holder.game = null;
	holder.availability = allAvailability({ openWorldCity: false });
	holder.allowedWorldCityIds = ['harbor-city'];

	expect(session.mapEyebrow).toBe(createI18n('ja').t('route.mapEyebrow.world'));
	// A vanished game falls back to the live preview city instance.
	expect(session.activeRetailCity).toBe(holder.fallback.cities[0]);
	expect(session.worldCityStatuses.find((s) => s.city.id === 'campus-junction')?.state).toBe(
		'locked'
	);
	expect(session.logisticsRouteSummaries).toEqual([]);
	expect(session.allowedWorldCityIds).toEqual(['harbor-city']);
	// Visited renderer instances survive every live replacement.
	expect(session.visitedMapViews).toEqual({ world: true, retail: true, industry: false });
});

it('delivers the latest transfer and selected route views live', () => {
	const mounted = mountSession();
	const { session, holder } = mounted;
	expect(session.selectedLogisticsRoute).toBeNull();
	expect(session.latestDeliveredTransfer).toBeNull();

	session.selectLogisticsRoute('route-1');
	expect(session.selectedLogisticsRoute?.route.id).toBe('route-1');

	// A locked city stays selected without a command, so the delivered
	// transfer read stays observable for its inspector. (Pure owner read; the
	// save codec requires industry endpoints, so this override never saves.)
	const routeGame = sandboxGame();
	holder.game = {
		...routeGame,
		logistics: {
			...routeGame.logistics,
			transferOrders: [{ ...deliveredTransfer(), destinationCityId: 'garden-borough' }]
		}
	};
	session.clearSelection('logisticsRoute');
	session.selectWorldCity('garden-borough');
	expect(session.latestDeliveredTransfer?.id).toBe('transfer-7');
});

it('selects valid routes with full clearing but ignores unknown route ids', () => {
	const mounted = mountSession();
	const { session } = mounted;
	session.acceptReadOnlySelection('retail', 'some-tile');
	session.acceptReadOnlySelection('industry', 'some-industry-tile');

	session.selectLogisticsRoute('missing-route');
	expect(session.selectedLogisticsRouteId).toBeNull();
	expect(session.activeMapView).toBe('retail');

	session.selectLogisticsRoute('route-1');
	expect(session.activeMapView).toBe('world');
	expect(session.selectedLogisticsRouteId).toBe('route-1');
	expect(session.selectedTileId).toBeNull();
	expect(session.selectedIndustryTileId).toBeNull();
	expect(session.selectedWorldCityId).toBeNull();
	expect(mounted.counters.constructionCancels).toBe(1);
	expect(mounted.counters.focusClears).toBe(1);
});

it('inspects world cities pre-game, locked, pending and forbidden without switching maps', async () => {
	const mounted = mountSession();
	const { session, commands, holder } = mounted;

	// Pre-game: the city is selected but no command runs and the view stays.
	holder.game = null;
	await session.selectWorldCity('campus-junction');
	expect(session.selectedWorldCityId).toBe('campus-junction');
	expect(session.activeMapView).toBe('retail');
	expect(commands.selectWorldCity).not.toHaveBeenCalled();

	// Locked city: inspection survives, no map switch.
	holder.game = sandboxGame();
	await session.selectWorldCity('garden-borough');
	expect(commands.selectWorldCity).not.toHaveBeenCalled();
	expect(session.selectedWorldCityId).toBe('garden-borough');

	// Pending scenario write: an opened city stays selectable but never switches.
	holder.worldSelectionAvailable = false;
	await session.selectWorldCity('campus-junction');
	expect(commands.selectWorldCity).not.toHaveBeenCalled();
	expect(session.activeMapView).toBe('retail');

	// Scenario-forbidden city: no selection happens at all.
	session.clearSelection('worldCity');
	holder.allowedWorldCityIds = ['harbor-city'];
	await session.selectWorldCity('campus-junction');
	expect(session.selectedWorldCityId).toBeNull();
});

it('switching to a playable view clears the management route focus while world retains it', () => {
	const mounted = mountSession();
	const { session, holder } = mounted;
	holder.focusedLogisticsRouteId = 'route-1';
	session.selectLogisticsRoute('route-1');
	mounted.counters.focusClears = 0;

	session.setView('retail');
	expect(mounted.counters.focusClears).toBe(1);
	expect(session.activeMapView).toBe('retail');
	expect(mounted.counters.constructionCancels).toBeGreaterThan(0);

	mounted.counters.focusClears = 0;
	holder.focusedLogisticsRouteId = 'route-9';
	session.setView('world');
	expect(mounted.counters.focusClears).toBe(0);
	expect(session.activeMapView).toBe('world');
});

it('setView keeps only the view-matching selections', () => {
	const mounted = mountSession();
	const { session } = mounted;
	session.selectLogisticsRoute('route-1');
	session.acceptReadOnlySelection('retail', 'tile-a');
	session.setView('industry');
	expect(session.selectedLogisticsRouteId).toBeNull();
	expect(session.selectedTileId).toBeNull();

	session.selectLogisticsRoute('route-1');
	session.setView('world');
	expect(session.selectedLogisticsRouteId).toBe('route-1');
});

it('a deferred opened-city selection allows unchanged without eager map switching', async () => {
	const mounted = mountSession();
	const { session, commands } = mounted;
	// Start on a view other than Campus Junction's retail destination so an
	// eager or missing switch is observable.
	session.setView('world');
	mounted.counters.constructionCancels = 0;
	let resolveSelection!: (result: { status: string }) => void;
	const gate = new Promise<{ status: string }>((resolve) => {
		resolveSelection = resolve;
	});
	commands.selectWorldCity.mockReturnValueOnce(gate as never);

	const selection = session.selectWorldCity('campus-junction');
	expect(session.selectedWorldCityId).toBe('campus-junction');
	// No eager switch while the command is deferred.
	expect(session.activeMapView).toBe('world');
	expect(session.selectedTileId).toBeNull();

	resolveSelection({ status: 'unchanged' });
	await selection;
	// `unchanged` means the city was already active — navigation still proceeds.
	expect(session.activeMapView).toBe('retail');
	expect(session.selectedWorldCityId).toBeNull();
	expect(session.selectedTileId).toBeNull();
	expect(mounted.counters.constructionCancels).toBe(1);

	// A rejected result keeps the current view and selections.
	session.setView('world');
	session.acceptReadOnlySelection('retail', 'kept-tile');
	commands.selectWorldCity.mockResolvedValueOnce({ status: 'rejected' });
	await session.selectWorldCity('campus-junction');
	expect(session.activeMapView).toBe('world');
	expect(session.selectedWorldCityId).toBe('campus-junction');
	expect(session.selectedTileId).toBe('kept-tile');
});

it('consumed construction clicks never also command read-only selection', () => {
	const mounted = mountSession();
	const { session, commands } = mounted;
	session.selectRetailTile('tile-1');
	expect(mounted.holder.constructionClicks).toEqual([['retail', 'tile-1']]);
	expect(commands.selectReadOnlyTile).not.toHaveBeenCalled();
	expect(session.selectedLogisticsRouteId).toBeNull();

	session.selectIndustryTile('tile-2');
	expect(mounted.holder.constructionClicks).toEqual([
		['retail', 'tile-1'],
		['industry', 'tile-2']
	]);
	expect(commands.selectReadOnlyTile).not.toHaveBeenCalled();
});

it('resolves store and building footprints to anchors while rail cells stay cells', () => {
	const mounted = mountSession(baseHolder(), false);
	const { session, commands, holder } = mounted;
	const game = holder.game!;
	const store = game.stores[0]!;
	const anchorTile = game.cities[0]!.tiles.find((tile) => tile.id === store.tileId)!;
	const nonAnchor =
		game.cities[0]!.tiles.find((tile) => tile.x === anchorTile.x + 1 && tile.y === anchorTile.y) ??
		anchorTile;

	session.selectRetailTile(nonAnchor.id);
	expect(commands.selectReadOnlyTile).toHaveBeenCalledWith('retail', store.tileId);
	expect(session.selectedTileId).toBe(store.tileId);
	expect(session.selectedIndustryTileId).toBeNull();

	const pumpTile = createIndustryPlacementPreview({
		game,
		buildingTypeId: 'water-pump',
		financeCommandAvailable: true
	}).validTileIds[0]!;
	const withPump = buildIndustrialBuilding(game, {
		tileId: pumpTile,
		buildingTypeId: 'water-pump'
	});
	holder.game = withPump;
	const building = withPump.industrialBuildings[0]!;
	const industryCity = withPump.industryCities.find((city) => city.id === building.cityId)!;
	const nonAnchorIndustry = industryCity.tiles.find(
		(tile) => tile.x === building.mapX + 1 && tile.y === building.mapY
	)!;

	session.selectIndustryTile(nonAnchorIndustry.id);
	expect(commands.selectReadOnlyTile).toHaveBeenLastCalledWith('industry', building.tileId);

	// A rail cell has no footprint to resolve: the clicked cell stays itself.
	const railCell = industryCity.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
	holder.game = {
		...withPump,
		industryCities: withPump.industryCities.map((city) =>
			city.id === industryCity.id
				? {
						...city,
						rails: [
							{ x: 1, y: 1, level: 1 },
							{ x: 2, y: 1, level: 1 }
						]
					}
				: city
		)
	};
	session.selectIndustryTile(railCell.id);
	expect(commands.selectReadOnlyTile).toHaveBeenLastCalledWith('industry', railCell.id);
});

it('the read-only receiver updates only the named atom without recursion', () => {
	const mounted = mountSession();
	const { session, commands } = mounted;
	session.acceptReadOnlySelection('retail', 'tile-a');
	session.acceptReadOnlySelection('retail', 'tile-b');
	session.acceptReadOnlySelection('industry', 'industry-tile');

	expect(session.selectedTileId).toBe('tile-b');
	expect(session.selectedIndustryTileId).toBe('industry-tile');
	expect(commands.selectReadOnlyTile).not.toHaveBeenCalled();
});

it('world-city financing forwards the current purchase without a domain command', () => {
	const mounted = mountSession();
	const { session, commands, holder, reviewedPurchases } = mounted;
	// Breadbasket Basin revealed but unopened with cash short of the 15,000
	// opening cost: the finance-eligible state must carry a credit offer.
	const financeGame = {
		...sandboxGame(),
		cash: 10_000,
		world: {
			...sandboxGame().world,
			revealedCityIds: [...sandboxGame().world.revealedCityIds, 'breadbasket-basin' as WorldCityId]
		}
	};
	holder.game = financeGame;
	const status = session.worldCityStatuses.find(
		(candidate) => candidate.city.id === 'breadbasket-basin'
	)!;
	expect(status.state).toBe('revealed');
	expect(status.financeOffer).not.toBeNull();

	session.reviewWorldCityFinancing('breadbasket-basin');
	expect(reviewedPurchases).toEqual([
		{
			kind: 'world',
			cityId: 'breadbasket-basin',
			expectedCost: status.city.openingCost,
			offer: status.financeOffer
		}
	]);
	expect(commands.openWorldCity).not.toHaveBeenCalled();
	expect(commands.selectWorldCity).not.toHaveBeenCalled();

	// Cash-covered companies never raise the finance review.
	holder.game = { ...financeGame, cash: 10_000_000 };
	reviewedPurchases.length = 0;
	session.reviewWorldCityFinancing('breadbasket-basin');
	expect(reviewedPurchases).toEqual([]);
});

it('openWorldCity guards legality and keeps the city selected', async () => {
	const mounted = mountSession();
	const { session, commands, holder } = mounted;

	// quarry-works is outside the allowed list entirely.
	await session.openWorldCity('quarry-works');
	expect(commands.openWorldCity).not.toHaveBeenCalled();
	expect(session.selectedWorldCityId).toBeNull();

	holder.allowedWorldCityIds = ['harbor-city'];
	await session.openWorldCity('garden-borough');
	expect(commands.openWorldCity).not.toHaveBeenCalled();

	holder.allowedWorldCityIds = ['garden-borough'];
	await session.openWorldCity('garden-borough');
	expect(commands.openWorldCity).toHaveBeenCalledWith('garden-borough');
	expect(session.selectedWorldCityId).toBe('garden-borough');
});

it('switchToSupplyCity reports failures and clears on a committed switch', async () => {
	const mounted = mountSession();
	const { session } = mounted;
	session.acceptReadOnlySelection('retail', 'kept-no-more');
	session.selectLogisticsRoute('route-1');

	// breadbasket-basin is not an opened industry city in this fixture.
	expect(await session.switchToSupplyCity('breadbasket-basin')).toBe(false);
	expect(session.activeMapView).toBe('world');

	// Committed switch to the opened industry city navigates and clears.
	expect(await session.switchToSupplyCity('industry-city')).toBe(true);
	expect(session.activeMapView).toBe('industry');
	expect(session.selectedTileId).toBeNull();
	expect(session.selectedWorldCityId).toBeNull();
	expect(session.selectedLogisticsRouteId).toBeNull();
});

it('clearPlacementSelections clears only the three placement ids', () => {
	const mounted = mountSession();
	const { session } = mounted;
	session.acceptReadOnlySelection('retail', 'tile-a');
	session.acceptReadOnlySelection('industry', 'industry-tile');
	session.selectLogisticsRoute('route-1');

	session.clearPlacementSelections();
	expect(session.selectedTileId).toBeNull();
	expect(session.selectedIndustryTileId).toBeNull();
	expect(session.selectedWorldCityId).toBeNull();
	expect(session.selectedLogisticsRouteId).toBe('route-1');
});

it('selectPlacementTile preserves the root other-id clearing', () => {
	const mounted = mountSession();
	const { session } = mounted;
	session.selectPlacementTile('retail', 'retail-target');
	expect(session.selectedTileId).toBe('retail-target');
	expect(session.selectedIndustryTileId).toBeNull();
	expect(session.selectedWorldCityId).toBeNull();

	session.selectPlacementTile('industry', 'industry-target');
	expect(session.selectedIndustryTileId).toBe('industry-target');
	expect(session.selectedTileId).toBeNull();
});

it('acceptRouteRemoved clears only the matching selected route', () => {
	const mounted = mountSession();
	const { session } = mounted;
	session.selectLogisticsRoute('route-1');

	session.acceptRouteRemoved('other-route');
	expect(session.selectedLogisticsRouteId).toBe('route-1');
	session.acceptRouteRemoved('route-1');
	expect(session.selectedLogisticsRouteId).toBeNull();
});

it('clearSelection clears only its atom, and the logistics kind clears focus too', async () => {
	const mounted = mountSession();
	const { session } = mounted;
	session.acceptReadOnlySelection('retail', 'tile-a');
	session.acceptReadOnlySelection('industry', 'industry-tile');
	await session.selectWorldCity('campus-junction');
	session.selectLogisticsRoute('route-1');
	// The route selection cleared the other atoms; repopulate them through
	// the read-only receiver so each clear proves it touches only its atom.
	session.acceptReadOnlySelection('retail', 'tile-a');
	session.acceptReadOnlySelection('industry', 'industry-tile');
	mounted.counters.focusClears = 0;

	session.clearSelection('retailTile');
	expect(session.selectedTileId).toBeNull();
	expect(session.selectedIndustryTileId).toBe('industry-tile');

	session.clearSelection('worldCity');
	expect(session.selectedWorldCityId).toBeNull();

	session.clearSelection('industryTile');
	expect(session.selectedIndustryTileId).toBeNull();
	expect(mounted.counters.focusClears).toBe(0);

	session.clearSelection('logisticsRoute');
	expect(session.selectedLogisticsRouteId).toBeNull();
	expect(mounted.counters.focusClears).toBe(1);
});

function isolatedRepository(game: GameState) {
	const storage = new Map<string, string>();
	const repository = createBrowserSaveRepository({
		getItem: (key) => storage.get(key) ?? null,
		setItem: (key, value) => void storage.set(key, value),
		removeItem: (key) => void storage.delete(key)
	});
	return { repository, ready: repository.saveAuto(game) };
}

function inspectorProps() {
	return vi.mocked(MapInspectorHost).mock.calls.at(-1)![1];
}

/** Loads the autosave through the real page, then closes the saves panel. */
async function loadAutosaveThroughPage(): Promise<void> {
	await page.getByRole('button', { name: /^menu$/i }).click();
	await page.getByRole('button', { name: /^saves$/i }).click();
	const panel = page.getByRole('dialog', { name: /saves/i });
	await panel.getByRole('button', { name: /^resume$/i }).click();
	await expect.element(page.getByText('Loaded auto-save')).toBeVisible();
	await userEvent.keyboard('{Escape}');
	await expect.element(panel).not.toBeInTheDocument();
}

it('the root alert path still rejects unchanged city selection', async () => {
	const game = sandboxGameBase(20260812);
	const campusTile = game.stores.find((store) => store.id === 'store-campus')!.tileId;
	const { repository, ready } = isolatedRepository(game);
	await ready;
	vi.mocked(createSaveRepository).mockResolvedValue(repository);
	const selectAlertCity = vi
		.spyOn(GameRouteController.prototype, 'selectAlertCity')
		.mockResolvedValue({ status: 'unchanged' });
	const view = render(RetailSimulationPage);
	try {
		await loadAutosaveThroughPage();
		const session = inspectorProps().session;

		await page.getByRole('button', { name: /alert/i }).click();
		await page.getByRole('button', { name: /Store #2: Bottled Water/i }).click();

		// `unchanged` must abort the deep-link: no view switch, no tile, no focus.
		expect(selectAlertCity).toHaveBeenCalledWith('campus-junction');
		expect(session.activeMapView).toBe('retail');
		expect(session.selectedTileId).toBeNull();
		expect(inspectorProps().retail.focus.isOpen).toBe(false);

		// A committed selection deep-links as before.
		selectAlertCity.mockResolvedValue({ status: 'sandbox-committed', changed: true });
		await page.getByRole('button', { name: /alert/i }).click();
		await page.getByRole('button', { name: /Store #2: Bottled Water/i }).click();
		expect(session.activeMapView).toBe('retail');
		expect(session.selectedTileId).toBe(campusTile);
		expect(inspectorProps().retail.focus.isOpen).toBe(true);
	} finally {
		await view.unmount();
	}
});

it('an unavailable warehouse fix falls back to inspection', async () => {
	const base = createNewGame('convenience', 20260813);
	const pumpTile = createIndustryPlacementPreview({
		game: base,
		buildingTypeId: 'water-pump',
		financeCommandAvailable: true
	}).validTileIds[0]!;
	const withPump = buildIndustrialBuilding(base, {
		tileId: pumpTile,
		buildingTypeId: 'water-pump'
	});
	// Cash deep in the red: no cash path and no credit offer, so the warehouse
	// build option is unavailable and the alert must fall back to inspection.
	const game = { ...withPump, cash: -5_000_000 };
	const { repository, ready } = isolatedRepository(game);
	await ready;
	vi.mocked(createSaveRepository).mockResolvedValue(repository);
	const view = render(RetailSimulationPage);
	try {
		await loadAutosaveThroughPage();
		const session = inspectorProps().session;

		await page.getByRole('button', { name: /alert/i }).click();
		await page.getByRole('button', { name: /no warehouse/i }).click();

		expect(session.activeMapView).toBe('industry');
		expect(session.selectedIndustryTileId).toBe(withPump.industrialBuildings[0]!.tileId);
	} finally {
		await view.unmount();
	}
});
