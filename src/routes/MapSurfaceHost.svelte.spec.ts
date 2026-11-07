import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createNewGame } from '$lib/game/state';
import type { GameState, RecurringRoute, TransferOrder, WorldCityId } from '$lib/game/types';
import { createCityMapSnapshot } from '$lib/game/mapRender';
import { createIndustryMapSnapshot } from '$lib/game/industryMapRender';
import type { MapActivityBatch } from '$lib/game/mapActivityFeedback';
import type { MutationAvailability } from './gameRouteController';
import { createI18n, type I18nBundle } from '$lib/i18n';
import { createRoutePreviewGame } from './routePreviewGame';
import { createMapSession, type MapSessionCommands } from './mapSession.svelte';
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
vi.mock('$lib/game/mapRender', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/game/mapRender')>();
	return { ...actual, createCityMapSnapshot: vi.fn(actual.createCityMapSnapshot) };
});
vi.mock('$lib/game/industryMapRender', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/game/industryMapRender')>();
	return { ...actual, createIndustryMapSnapshot: vi.fn(actual.createIndustryMapSnapshot) };
});

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

function worldGame(): GameState {
	const base = createNewGame('convenience', 20260830);
	const route: RecurringRoute = {
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
	return { ...base, logistics: { ...base.logistics, recurringRoutes: [route] } };
}

const delivered: TransferOrder = {
	id: 'transfer-7',
	source: { kind: 'manual' },
	originCityId: 'industry-city',
	destinationCityId: 'breadbasket-basin',
	materialId: 'water',
	quantity: 12,
	createdOnDay: 5,
	dispatchedOnDay: 6,
	arrivalOnDay: 9,
	transportCost: 24,
	status: 'delivered'
};

interface Holder {
	game: GameState | null;
	fallback: GameState;
	availability: MutationAvailability;
	allowedWorldCityIds: WorldCityId[];
}

function baseHolder(): Holder {
	return {
		game: worldGame(),
		fallback: createRoutePreviewGame(),
		availability: allAvailability(),
		allowedWorldCityIds: ['harbor-city', 'industry-city', 'breadbasket-basin', 'garden-borough']
	};
}

interface SurfaceProps {
	session: ReturnType<typeof createMapSession>;
	game: GameState | null;
	fallback: GameState;
	i18n: I18nBundle;
	retailPlacementPreview: null;
	industryPlacementPreview: null;
	railPreviewRender: null;
	activity: MapActivityBatch;
	isMapPaused: boolean;
	railKeyboardEnabled: boolean;
	availability: MutationAvailability;
	disabledReason: string | null;
	onCancelRailBuild: () => void;
}

function mountSurface(holder: Holder = baseHolder(), overrides: Partial<SurfaceProps> = {}) {
	const live = $state(holder);
	const commands = {
		selectReadOnlyTile: vi.fn(),
		selectWorldCity: vi.fn(async () => ({ status: 'sandbox-committed' as const })),
		openWorldCity: vi.fn(async () => ({ status: 'sandbox-committed' as const }))
	};
	const session = createMapSession({
		getGame: () => live.game,
		getFallback: () => live.fallback,
		getI18n: () => createI18n('en'),
		getAvailability: () => live.availability,
		getAllowedWorldCityIds: () => live.allowedWorldCityIds,
		getWorldSelectionAvailable: () => true,
		getFocusedLogisticsRouteId: () => null,
		tryConstructionClick: () => false,
		onCancelConstruction: () => {},
		onClearLogisticsFocus: () => {},
		onReviewPurchase: () => {},
		commands: commands as unknown as MapSessionCommands
	});
	commands.selectReadOnlyTile.mockImplementation((kind: 'retail' | 'industry', tileId: string) =>
		session.acceptReadOnlySelection(kind, tileId)
	);
	const props: SurfaceProps = {
		session,
		game: live.game,
		fallback: live.fallback,
		i18n: createI18n('en'),
		retailPlacementPreview: null,
		industryPlacementPreview: null,
		railPreviewRender: null,
		activity: { seq: 0, activities: [] },
		isMapPaused: false,
		railKeyboardEnabled: true,
		availability: live.availability,
		disabledReason: null,
		onCancelRailBuild: vi.fn(),
		...overrides
	};
	const result = render(MapSurfaceHost, props);
	/** Re-renders with the holder's current live values, as the page would. */
	function sync(): void {
		void result.rerender({
			...props,
			game: live.game,
			fallback: live.fallback,
			availability: live.availability
		});
	}
	return { result, session, commands, holder: live, props, sync };
}

describe('MapSurfaceHost', () => {
	it('keeps visited surfaces mounted and exposes only the active surface', async () => {
		const mounted = mountSurface({ ...baseHolder(), game: null });
		mounted.session.setView('world');

		// Await each view's surface before counting: template updates flush
		// asynchronously after the session write.
		await expect.element(page.getByRole('region', { name: /world map/i })).toBeVisible();
		expect(document.querySelectorAll('.map-surface')).toHaveLength(2);
		expect(document.querySelectorAll('.active-map-surface')).toHaveLength(1);
		await expect
			.element(page.getByRole('region', { name: /industry map/i }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: /^Harbor City$/i }).click();
		// The pre-game world node forwards through the session's selection.
		expect(mounted.session.selectedWorldCityId).toBe('harbor-city');

		mounted.session.setView('retail');
		await expect.element(page.getByRole('region', { name: /city map/i })).toBeVisible();
		mounted.session.setView('industry');
		await expect.element(page.getByRole('region', { name: /industry map/i })).toBeVisible();

		expect(document.querySelectorAll('.map-surface')).toHaveLength(3);
		expect(document.querySelectorAll('.active-map-surface')).toHaveLength(1);
	});

	it('forwards world logistics route summaries and selection through the active surface', async () => {
		const mounted = mountSurface();
		mounted.session.setView('world');

		await expect.element(page.getByTestId('world-logistics-routes')).toBeVisible();
		await expect
			.element(page.getByTestId('world-logistics-route-route-1'))
			.toHaveAttribute('data-selected', 'false');
		const routeButton = page.getByRole('button', {
			name: /Industry City to Breadbasket Basin.*Water/i
		});
		await expect.element(routeButton).toBeVisible();
		await routeButton.click();
		expect(mounted.session.selectedLogisticsRouteId).toBe('route-1');
		await expect
			.element(page.getByTestId('world-logistics-route-route-1'))
			.toHaveAttribute('data-selected', 'true');
	});

	it('forwards the latest delivered transfer to the selected world inspector', async () => {
		const mounted = mountSurface({
			...baseHolder(),
			game: {
				...worldGame(),
				logistics: { ...worldGame().logistics, transferOrders: [delivered] }
			}
		});
		mounted.session.setView('world');
		await expect.element(page.getByRole('region', { name: /world map/i })).toBeVisible();
		// Breadbasket Basin is a locked industry city: inspecting it keeps the
		// world view while the delivered transfer surfaces for it.
		await mounted.session.selectWorldCity('breadbasket-basin');

		await expect
			.element(page.getByRole('region', { name: 'Latest industry-to-industry transfer' }))
			.toBeVisible();
		await expect
			.element(
				page.getByText('Arrived day 9 · 12 units of Water · Industry City → Breadbasket Basin')
			)
			.toBeVisible();
	});

	it('derives both map snapshots itself from the live game or fallback', async () => {
		const mounted = mountSurface();
		const store = mounted.holder.game!.stores[0]!;
		// Settle the mount and visit both surfaces (an unvisited surface never
		// derives its snapshot), then observe only selection-driven recomputes.
		await expect.element(page.getByRole('region', { name: /city map/i })).toBeVisible();
		mounted.session.setView('industry');
		await expect.element(page.getByRole('region', { name: /industry map/i })).toBeVisible();
		vi.mocked(createCityMapSnapshot).mockClear();
		vi.mocked(createIndustryMapSnapshot).mockClear();

		mounted.session.acceptReadOnlySelection('retail', store.tileId);
		await vi.waitFor(() => {
			expect(vi.mocked(createCityMapSnapshot).mock.lastCall?.[1]).toBe(store.tileId);
		});
		expect(vi.mocked(createCityMapSnapshot).mock.lastCall?.[0]).toBe(mounted.holder.game);

		mounted.session.acceptReadOnlySelection('industry', '3,3');
		await vi.waitFor(() => {
			expect(vi.mocked(createIndustryMapSnapshot).mock.lastCall?.[1]).toBe('3,3');
		});
		expect(vi.mocked(createIndustryMapSnapshot).mock.lastCall?.[0]).toBe(mounted.holder.game);

		// A missing game falls back to the single per-instance preview game.
		mounted.holder.game = null;
		mounted.sync();
		await vi.waitFor(() => {
			expect(vi.mocked(createCityMapSnapshot).mock.lastCall?.[0]).toBe(mounted.holder.fallback);
		});
		expect(vi.mocked(createIndustryMapSnapshot).mock.lastCall?.[0]).toBe(mounted.holder.fallback);
		// Placement previews thread straight through to the render inputs.
		expect(vi.mocked(createIndustryMapSnapshot).mock.lastCall?.[3]).toBeNull();
	});
});
