import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildIndustrialBuilding } from '$lib/game/industryPlacement';
import { createIndustryPlacementPreview } from '$lib/game/placementPreview';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import type {
	City,
	GameState,
	HiringCandidate,
	ProductId,
	StaffMember,
	WorldCityId
} from '$lib/game/types';
import { buildRailNetwork } from '$lib/game/rail';
import { createI18n } from '$lib/i18n';
import type { MutationAvailability } from './gameRouteController';
import { createRoutePreviewGame } from './routePreviewGame';
import { createMapSession, type MapSessionCommands } from './mapSession.svelte';
import { createRetailInspection, type RetailInspectionCommands } from './retailInspection.svelte';
import MapInspectorHost from './MapInspectorHost.svelte';

vi.mock('$lib/game/rail', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/game/rail')>();
	return { ...actual, buildRailNetwork: vi.fn(actual.buildRailNetwork) };
});
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

const staffMember: StaffMember = {
	id: 'staff-1',
	name: 'Ada Lopez',
	role: 'general',
	monthlySalary: 100,
	skill: 3,
	morale: 3,
	assignedStoreId: null,
	hiredOnDay: 1,
	level: 1,
	xp: 0
};

const candidate: HiringCandidate = {
	id: 'cand-1',
	name: 'Grace Chen',
	role: 'general',
	monthlySalary: 90,
	skill: 2,
	morale: 3
};

function inspectorGame(): GameState {
	const base = simulateDay(createNewGame('convenience', 20_260_840));
	const industryCity = {
		...base.industryCities[0]!,
		rails: [
			{ x: 1, y: 1, level: 1 },
			{ x: 2, y: 1, level: 1 }
		]
	};
	return {
		...base,
		cash: 2_000_000,
		industryCities: [industryCity],
		staff: [staffMember],
		hiringCandidates: [candidate]
	};
}

interface Holder {
	game: GameState | null;
	city: City;
	availability: MutationAvailability;
}

interface Mounted {
	session: ReturnType<typeof createMapSession>;
	retail: ReturnType<typeof createRetailInspection>;
	commands: {
		upgradeIndustrialBuilding: ReturnType<typeof vi.fn>;
		demolishIndustrialBuilding: ReturnType<typeof vi.fn>;
		upgradeRail: ReturnType<typeof vi.fn>;
		demolishRail: ReturnType<typeof vi.fn>;
		hireStaff: ReturnType<typeof vi.fn>;
		assignStaff: ReturnType<typeof vi.fn>;
		unassignStaff: ReturnType<typeof vi.fn>;
	};
	holder: Holder;
	rerender(overrides?: Record<string, unknown>): Promise<void>;
	props: Record<string, unknown>;
}

function mountInspector(overrides: Partial<Record<string, unknown>> = {}): Mounted {
	const game = inspectorGame();
	const live = $state<Holder>({
		game,
		city: game.cities.find((city) => city.id === game.activeCityId)!,
		availability: allAvailability()
	});
	const sessionCommands = {
		selectReadOnlyTile: vi.fn(),
		selectWorldCity: vi.fn(async () => ({ status: 'sandbox-committed' as const })),
		openWorldCity: vi.fn(async () => ({ status: 'sandbox-committed' as const }))
	};
	const session = createMapSession({
		getGame: () => live.game,
		getFallback: () => fallbackGame,
		getI18n: () => i18n,
		getAvailability: () => live.availability,
		getAllowedWorldCityIds: () => ['harbor-city', 'industry-city'] as readonly WorldCityId[],
		getWorldSelectionAvailable: () => true,
		getFocusedLogisticsRouteId: () => null,
		tryConstructionClick: () => false,
		onCancelConstruction: () => {},
		onClearLogisticsFocus: () => {},
		onReviewPurchase: () => {},
		commands: sessionCommands as unknown as MapSessionCommands
	});
	sessionCommands.selectReadOnlyTile.mockImplementation(
		(kind: 'retail' | 'industry', tileId: string) => session.acceptReadOnlySelection(kind, tileId)
	);
	const retailCommands = {
		upgradeStore: vi.fn(async () => ({ status: 'committed' as const })),
		updateStoreSellingPrice: vi.fn(async () => ({ status: 'committed' as const })),
		updateStoreInventoryTargets: vi.fn(async () => ({ status: 'committed' as const })),
		updateStoreProductBrand: vi.fn(async () => ({ status: 'committed' as const }))
	};
	const retail = createRetailInspection({
		getGame: () => live.game,
		getCity: () => live.city,
		getSelectedTileId: () => session.selectedTileId,
		getAvailability: () => live.availability,
		commands: retailCommands as unknown as RetailInspectionCommands,
		onClearRetailSelection: () => session.clearSelection('retailTile'),
		onManageSupply: () => {},
		onPlanProduct: () => {}
	});
	const commands = {
		upgradeIndustrialBuilding: vi.fn(async () => ({ status: 'committed' as const })),
		demolishIndustrialBuilding: vi.fn(async () => ({ status: 'committed' as const })),
		upgradeRail: vi.fn(async () => ({ status: 'committed' as const })),
		demolishRail: vi.fn(async () => ({ status: 'committed' as const })),
		hireStaff: vi.fn(async () => ({ status: 'committed' as const })),
		assignStaff: vi.fn(async () => ({ status: 'committed' as const })),
		unassignStaff: vi.fn(async () => ({ status: 'committed' as const }))
	};
	const props: Record<string, unknown> = {
		session,
		retail,
		game: live.game,
		fallback: fallbackGame,
		i18n,
		availability: live.availability,
		disabledReason: null,
		mode: 'sandbox',
		isPlacementActive: false,
		placementFeedback: null,
		isRailActive: false,
		commands,
		plannerProductIds: [],
		allowedProductIds: [] as ProductId[],
		onAddIndustryRoute: vi.fn(),
		onManageLogisticsRoute: vi.fn(),
		onBuildWarehouse: undefined,
		onBuildRailFromBuilding: undefined,
		onPlayClickSfx: vi.fn(),
		...overrides
	};
	const result = render(MapInspectorHost, props as never);
	/** Re-renders with the holder's current live values, as the page would. */
	function rerender(extra: Record<string, unknown> = {}): Promise<void> {
		return result.rerender({
			...props,
			game: live.game,
			availability: live.availability,
			...extra
		});
	}
	return {
		session,
		retail,
		commands,
		holder: live,
		rerender,
		props: props as Record<string, unknown>
	};
}

const fallbackGame = createRoutePreviewGame();
const i18n = createI18n('en');

describe('MapInspectorHost', () => {
	it('renders the selected retail tile inspector and forwards Open Details once', async () => {
		expect.assertions(4);
		const mounted = mountInspector();
		const store = mounted.holder.game!.stores[0]!;
		mounted.session.acceptReadOnlySelection('retail', store.tileId);

		await expect.element(page.getByRole('button', { name: /open details/i })).toBeVisible();
		await page.getByRole('button', { name: /open details/i }).click();
		// Normal Details forwards a null focus request through the owner.
		expect(mounted.retail.focus.isOpen).toBe(true);
		expect(mounted.retail.focus.focusedProductId).toBeNull();
		await expect.element(page.getByRole('dialog', { name: /Store #\d/i })).toBeVisible();
	});

	it('forwards the milestone product from the review-stock handoff', async () => {
		const mounted = mountInspector();
		const milestoneStore = { ...mounted.holder.game!.stores[0]!, level: 3 };
		mounted.holder.game = {
			...mounted.holder.game!,
			cash: 100_000,
			stores: [milestoneStore]
		} as GameState;
		mounted.session.acceptReadOnlySelection('retail', milestoneStore.tileId);
		mounted.rerender();

		await page.getByRole('button', { name: /upgrade/i }).click();
		await expect.element(page.getByTestId('upgrade-review-stock-supply')).toBeVisible();
		await page.getByRole('button', { name: /review soft drinks stock & supply/i }).click();
		expect(mounted.retail.focus.focusedProductId).toBe('soft-drinks');
		expect(mounted.retail.focus.isOpen).toBe(true);
	});

	it('closes the retail inspector and its focus overlay together', async () => {
		const mounted = mountInspector();
		const store = mounted.holder.game!.stores[0]!;
		mounted.session.acceptReadOnlySelection('retail', store.tileId);

		// The × forwards closeInspector: selection and focus clear together.
		// (The modal's own backdrop covers × while it is open, as in the page.)
		await page.getByRole('button', { name: /close/i }).first().click();
		expect(mounted.session.selectedTileId).toBeNull();
		expect(mounted.retail.focus.isOpen).toBe(false);
	});

	it('keeps the child upgrade control disabled when store upgrades are unavailable', async () => {
		expect.assertions(1);
		const mounted = mountInspector();
		const store = mounted.holder.game!.stores[0]!;
		mounted.holder.availability = allAvailability({ upgradeStore: false });
		mounted.session.acceptReadOnlySelection('retail', store.tileId);
		mounted.rerender();

		await expect.element(page.getByRole('button', { name: /upgrade/i })).toBeDisabled();
	});

	it('hides both inspectors while a placement is active without feedback', async () => {
		expect.assertions(3);
		const mounted = mountInspector();
		const store = mounted.holder.game!.stores[0]!;
		mounted.session.acceptReadOnlySelection('retail', store.tileId);
		await expect.element(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();

		mounted.rerender({ isPlacementActive: true });
		await expect
			.element(page.getByRole('dialog', { name: /tile details/i }))
			.not.toBeInTheDocument();

		// Placement feedback keeps the inspectors readable for the rejection.
		mounted.rerender({
			isPlacementActive: true,
			placementFeedback: { code: 'retail.occupied' }
		});
		await expect.element(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
	});

	it('renders industry tile details when no rail selection exists', async () => {
		expect.assertions(2);
		const mounted = mountInspector();
		const game = mounted.holder.game!;
		const pumpTile = createIndustryPlacementPreview({
			game,
			buildingTypeId: 'water-pump',
			financeCommandAvailable: true
		}).validTileIds[0]!;
		const withPump = buildIndustrialBuilding(game, {
			tileId: pumpTile,
			buildingTypeId: 'water-pump'
		});
		mounted.holder.game = withPump;
		mounted.session.acceptReadOnlySelection('industry', withPump.industrialBuildings[0]!.tileId);
		mounted.rerender();

		await expect
			.element(page.getByRole('dialog', { name: /industry tile details/i }))
			.toBeVisible();
		await expect
			.element(page.getByRole('dialog', { name: /rail segment/i }))
			.not.toBeInTheDocument();
	});

	it('prefers rail details over industry building details', async () => {
		expect.assertions(2);
		const mounted = mountInspector();
		const game = mounted.holder.game!;
		const industryCity = game.industryCities[0]!;
		const railCell = industryCity.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		mounted.session.acceptReadOnlySelection('industry', railCell.id);

		await expect.element(page.getByRole('dialog', { name: /rail segment/i })).toBeVisible();
		await expect
			.element(page.getByRole('dialog', { name: /industry tile details/i }))
			.not.toBeInTheDocument();
	});

	it('reuses the cached rail network across tile changes and invalidates on game changes', async () => {
		const mounted = mountInspector();
		const game = mounted.holder.game!;
		const industryCity = game.industryCities[0]!;
		const first = industryCity.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		const second = industryCity.tiles.find((tile) => tile.x === 2 && tile.y === 1)!;

		vi.mocked(buildRailNetwork).mockClear();
		mounted.session.acceptReadOnlySelection('industry', first.id);
		await expect.element(page.getByRole('dialog', { name: /rail segment/i })).toBeVisible();
		// Baseline: the host builds its cached network once for this game;
		// RailSegmentInspector additionally derives its own utilization view.
		const baseline = vi.mocked(buildRailNetwork).mock.calls.length;
		expect(baseline).toBeGreaterThan(0);

		// A different rail cell on the same game reuses the cached network.
		mounted.session.acceptReadOnlySelection('industry', second.id);
		await vi.waitFor(() => {
			expect(mounted.session.selectedIndustryTileId).toBe(second.id);
		});
		expect(vi.mocked(buildRailNetwork).mock.calls.length).toBe(baseline);

		// A changed game/rails invalidates the network.
		mounted.holder.game = {
			...game,
			industryCities: [
				{
					...industryCity,
					rails: [...industryCity.rails, { x: 3, y: 1, level: 1 }]
				}
			]
		} as GameState;
		await mounted.rerender();
		await expect.element(page.getByRole('dialog', { name: /rail segment/i })).toBeVisible();
		expect(vi.mocked(buildRailNetwork).mock.calls.length).toBeGreaterThan(baseline);
	});

	it('never reads the lazy rail network while hidden, build-active or invalid', async () => {
		const mounted = mountInspector();
		vi.mocked(buildRailNetwork).mockClear();

		// No selection at all.
		await mounted.rerender();
		await expect
			.element(page.getByRole('dialog', { name: /rail segment/i }))
			.not.toBeInTheDocument();
		expect(vi.mocked(buildRailNetwork)).not.toHaveBeenCalled();

		// Invalid tile id: the segment selector returns null before reading.
		mounted.session.acceptReadOnlySelection('industry', 'not-a-tile');
		await expect
			.element(page.getByRole('dialog', { name: /industry tile details/i }))
			.not.toBeInTheDocument();
		expect(vi.mocked(buildRailNetwork)).not.toHaveBeenCalled();

		// Build mode arms first; selecting a valid rail cell still never reads.
		await mounted.rerender({ isRailActive: true });
		const industryCity = mounted.holder.game!.industryCities[0]!;
		const railCell = industryCity.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		mounted.session.acceptReadOnlySelection('industry', railCell.id);
		await expect
			.element(page.getByRole('dialog', { name: /rail segment/i }))
			.not.toBeInTheDocument();
		expect(vi.mocked(buildRailNetwork)).not.toHaveBeenCalled();

		// Leaving build mode reads the network for the first time.
		await mounted.rerender({ isRailActive: false });
		await expect.element(page.getByRole('dialog', { name: /rail segment/i })).toBeVisible();
		expect(vi.mocked(buildRailNetwork)).toHaveBeenCalled();
	});

	it('guards rail upgrade and demolition through the capability flags', async () => {
		const mounted = mountInspector();
		const industryCity = mounted.holder.game!.industryCities[0]!;
		const railCell = industryCity.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		mounted.session.acceptReadOnlySelection('industry', railCell.id);

		mounted.holder.availability = allAvailability({ upgradeRail: false, demolishRail: false });
		mounted.rerender();
		await expect.element(page.getByRole('button', { name: /^upgrade/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /^demolish/i })).toBeDisabled();
		expect(mounted.commands.upgradeRail).not.toHaveBeenCalled();
		expect(mounted.commands.demolishRail).not.toHaveBeenCalled();

		mounted.holder.availability = allAvailability({ upgradeRail: true, demolishRail: true });
		mounted.rerender();
		await page.getByRole('button', { name: /^upgrade/i }).click();
		expect(mounted.commands.upgradeRail).toHaveBeenCalledWith(
			industryCity.id,
			expect.stringContaining('1,1')
		);
		await page.getByRole('button', { name: /^demolish/i }).click();
		expect(mounted.commands.demolishRail).toHaveBeenCalledTimes(1);
	});

	it('keeps industrial demolition sandbox-only', async () => {
		// The demolish button confirms through window.confirm first.
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		const mounted = mountInspector({ mode: 'scenario' });
		const game = mounted.holder.game!;
		const pumpTile = createIndustryPlacementPreview({
			game,
			buildingTypeId: 'water-pump',
			financeCommandAvailable: true
		}).validTileIds[0]!;
		const withPump = buildIndustrialBuilding(game, {
			tileId: pumpTile,
			buildingTypeId: 'water-pump'
		});
		mounted.holder.game = withPump;
		mounted.session.acceptReadOnlySelection('industry', withPump.industrialBuildings[0]!.tileId);
		mounted.rerender();

		await expect.element(page.getByRole('button', { name: /demolish building/i })).toBeDisabled();
		expect(mounted.commands.demolishIndustrialBuilding).not.toHaveBeenCalled();

		mounted.rerender({ mode: 'sandbox' });
		await page.getByRole('button', { name: /demolish building/i }).click();
		expect(mounted.commands.demolishIndustrialBuilding).toHaveBeenCalledWith(
			withPump.industrialBuildings[0]!.id
		);
	});

	it('renders the route inspector only on the world view with a live summary', async () => {
		const mounted = mountInspector();
		mounted.session.selectLogisticsRoute('route-1');

		await expect
			.element(page.getByRole('dialog', { name: /logistics route inspector/i }))
			.not.toBeInTheDocument();

		const game = mounted.holder.game!;
		const route = {
			id: 'route-1',
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water' as const,
			capacity: 30,
			frequencyDays: 3,
			leadTimeDays: 2,
			transportCostPerUnit: 2,
			priority: 1,
			state: 'active' as const,
			nextDispatchOnDay: 11
		};
		mounted.holder.game = {
			...game,
			logistics: { ...game.logistics, recurringRoutes: [route] }
		} as GameState;
		mounted.rerender();
		mounted.session.selectLogisticsRoute('route-1');
		await expect
			.element(page.getByRole('dialog', { name: /logistics route inspector/i }))
			.toBeVisible();
		await expect.element(page.getByRole('heading', { name: /industry city/i })).toBeVisible();

		// Manage/Close forward through the session and the root handoff.
		await page.getByRole('button', { name: 'Manage route' }).click();
		expect(mounted.props.onManageLogisticsRoute).toHaveBeenCalledWith('route-1');
		await page.getByRole('button', { name: /close logistics route inspector/i }).click();
		expect(mounted.session.selectedLogisticsRouteId).toBeNull();
	});

	it('drives hire, assign and unassign through the moved store-detail modal flags', async () => {
		const mounted = mountInspector();
		const store = mounted.holder.game!.stores[0]!;
		mounted.session.acceptReadOnlySelection('retail', store.tileId);
		mounted.retail.open();

		await expect.element(page.getByRole('dialog', { name: /Store #\d/i })).toBeVisible();
		await page.getByRole('tab', { name: 'Staff' }).click();

		// Independent permission flags: hire disabled, assign/unassign enabled.
		mounted.holder.availability = allAvailability({ hireStaff: false });
		mounted.rerender();
		await expect.element(page.getByRole('button', { name: /hire grace chen/i })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /assign ada lopez/i })).toBeEnabled();

		mounted.holder.availability = allAvailability();
		mounted.rerender();
		await page.getByRole('button', { name: /hire grace chen/i }).click();
		expect(mounted.commands.hireStaff).toHaveBeenCalledWith('cand-1');
		await page.getByRole('button', { name: /assign ada lopez/i }).click();
		expect(mounted.commands.assignStaff).toHaveBeenCalledWith('staff-1', store.id);

		mounted.holder.game = {
			...mounted.holder.game!,
			staff: [{ ...staffMember, assignedStoreId: store.id }]
		} as GameState;
		mounted.rerender();
		await page.getByRole('button', { name: /unassign ada lopez/i }).click();
		expect(mounted.commands.unassignStaff).toHaveBeenCalledWith('staff-1');
	});

	it('hides the store-detail modal when the selection vanishes without resetting focus', async () => {
		const mounted = mountInspector();
		const store = mounted.holder.game!.stores[0]!;
		mounted.session.acceptReadOnlySelection('retail', store.tileId);
		mounted.retail.open('snacks');
		await expect.element(page.getByRole('dialog', { name: /Store #\d/i })).toBeVisible();

		mounted.holder.game = null;
		mounted.rerender();
		await expect.element(page.getByRole('dialog', { name: /Store #\d/i })).not.toBeInTheDocument();
		expect(mounted.retail.focus.isOpen).toBe(true);
		expect(mounted.retail.focus.focusedProductId).toBe('snacks');
	});
});
