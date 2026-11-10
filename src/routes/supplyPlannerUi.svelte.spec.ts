import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import { createNewGame } from '$lib/game/state';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	ProductId,
	RecurringRoute,
	WorldCityId
} from '$lib/game/types';
import type {
	SupplyPlannerAction,
	SupplyPlannerActionAvailability,
	SupplyPlannerResult
} from '$lib/game/supplyPlannerActions';
import type { SupplyPlannerSnapshot } from '$lib/game/supplyPlanner';
import type { MutationAvailability } from './gameRouteController';
import type { SupplyPlannerHandoffHost } from './supplyPlannerRoute';
import { buildSupplyPlan } from '$lib/game/supplyPlannerActions';
import { createSupplyPlannerUi } from './supplyPlannerUi.svelte';
import SupplyAdvisorHost from './SupplyAdvisorHost.svelte';

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

function building(
	typeId: IndustrialBuildingTypeId,
	id: string,
	cityId: WorldCityId = 'industry-city'
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId,
		tileId: `${id}-tile`,
		mapX: 2,
		mapY: 2,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

const basePlannerSnapshot: SupplyPlannerSnapshot = {
	retailCityId: 'harbor-city',
	supplyCityId: 'industry-city',
	finishedMaterialId: 'bottled-water',
	cash: 42_000,
	demandContributors: [],
	demandPerDay: 10,
	finishedImportCostPerUnit: 2,
	inventory: {},
	warehouseCapacity: 400,
	warehouseUsed: 0,
	buildings: [{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 }],
	usableBuildingIds: ['water-pump-1'],
	disconnectedBuildingIds: [],
	usableSinkBuildingIdsByMaterial: {},
	reachableDemandByMaterial: {},
	reachableDemandByBuildingAndMaterial: {},
	reachableBranchesByBuildingAndMaterial: {},
	reachableProcessorsByBuildingAndMaterial: {},
	railReachableProcessorIdsByBuildingAndMaterial: {},
	routableRailTargetIdsByOriginId: {},
	railReachableWarehouseIdsByOriginId: {},
	warehouseConnectedConsumerCapacityByMaterial: {},
	warehouseConnectedProcessorsByMaterial: {}
};

function plannerResult(
	action: SupplyPlannerAction,
	snapshotOverrides: Partial<SupplyPlannerSnapshot> = {}
): SupplyPlannerResult {
	// Empty projection/baseline bodies keep the advisor template renderable
	// (it maps `materials`/`limitations` arrays) while the handoff only reads
	// the recommendation action and snapshot supply-city fields.
	const emptyProjection = { materials: [] } as never;
	return {
		status: 'ready',
		plan: {
			snapshot: { ...basePlannerSnapshot, ...snapshotOverrides },
			baseline: {
				materials: [],
				warehouse: { used: 0, capacity: 0, freeCapacity: 0 },
				limitations: [],
				bottleneck: { kind: 'none' }
			} as never,
			recommendation: {
				action,
				baseline: emptyProjection,
				projection: emptyProjection,
				comparison: {} as never,
				affordable: true,
				feasible: true
			},
			alternatives: []
		}
	};
}

const buildProducerAction: SupplyPlannerAction = {
	kind: 'build-producer',
	materialId: 'bottled-water',
	buildingTypeId: 'water-pump',
	cost: 250
};

const createRouteAction: SupplyPlannerAction = {
	kind: 'create-route',
	input: {
		originCityId: 'breadbasket-basin',
		destinationCityId: 'industry-city',
		materialId: 'water',
		capacity: 8,
		frequencyDays: 1,
		leadTimeDays: 2,
		transportCostPerUnit: 1,
		priority: 0
	}
};

const changeSourceAction: SupplyPlannerAction = {
	kind: 'change-supply-source',
	retailCityId: 'harbor-city',
	fromSupplyCityId: 'industry-city',
	toSupplyCityId: 'breadbasket-basin'
};

const upgradeAction: SupplyPlannerAction = {
	kind: 'upgrade-building',
	materialId: 'bottled-water',
	buildingId: 'upgrade-target-1',
	buildingTypeId: 'water-pump',
	fromLevel: 1,
	toLevel: 2,
	cost: 500
};

const connectRailAction: SupplyPlannerAction = {
	kind: 'connect-rail',
	buildingId: 'rail-target-1',
	destinationBuildingId: 'water-pump-1',
	materialId: 'bottled-water'
};

/** Live recommendation once the recommended import route already exists. */
const editRouteAction: SupplyPlannerAction = {
	kind: 'edit-route',
	routeId: 'route-1',
	field: 'capacity',
	from: 2,
	to: 8
};

/** A route the player created after the advisor displayed its plan. */
const standingRoute: RecurringRoute = {
	id: 'route-1',
	originCityId: 'breadbasket-basin',
	destinationCityId: 'industry-city',
	materialId: 'water',
	capacity: 8,
	frequencyDays: 1,
	leadTimeDays: 2,
	transportCostPerUnit: 1,
	priority: 0,
	state: 'active',
	nextDispatchOnDay: 1
};

/** Live recommendation once the recommended producer already stands. */
const standingProducerUpgradeAction: SupplyPlannerAction = {
	...upgradeAction,
	buildingId: 'existing-pump-1'
};

interface PlannerHolder {
	game: GameState | null;
	retailCityId: WorldCityId;
	allowedProductIds: ProductId[];
	allowedIndustryBuildingTypeIds: IndustrialBuildingTypeId[];
	allowedIndustrialPlacements: ReadonlySet<string> | null;
	availability: MutationAvailability;
	permissions: {
		canBuildRail: boolean;
		canManageLogistics: boolean;
		canSetRetailSupplySource: boolean;
	};
	switchSucceeds: boolean;
	/** Runs after a successful deferred switch (models a state change mid-handoff). */
	onSwitched?: () => void;
	recommendation: SupplyPlannerAction;
	snapshotOverrides: Partial<SupplyPlannerSnapshot>;
}

function baseHolder(): PlannerHolder {
	return {
		game: { ...createNewGame('convenience', 20260810), cash: 1_000_000 },
		retailCityId: 'harbor-city',
		allowedProductIds: ['bottled-water', 'snacks'],
		allowedIndustryBuildingTypeIds: ['water-pump', 'water-bottler', 'warehouse'],
		allowedIndustrialPlacements: null,
		availability: allAvailability(),
		permissions: {
			canBuildRail: true,
			canManageLogistics: true,
			canSetRetailSupplySource: true
		},
		switchSucceeds: true,
		recommendation: buildProducerAction,
		snapshotOverrides: {}
	};
}

function createCalculation(
	impl: (game: GameState, availability: SupplyPlannerActionAvailability) => SupplyPlannerResult
) {
	return vi.fn(
		(
			game: GameState,
			_request: Parameters<typeof buildSupplyPlan>[1],
			availability: SupplyPlannerActionAvailability
		) => impl(game, availability)
	);
}

interface Mounted {
	ui: ReturnType<typeof createSupplyPlannerUi>;
	buildPlan: ReturnType<typeof createCalculation>;
	events: string[];
	calls: string[];
	hosts: SupplyPlannerHandoffHost[];
	holder: PlannerHolder;
}

/** Root-bridge stand-in: records the ordered handoff protocol into `calls`. */
function hostSpyFactory(live: PlannerHolder, calls: string[], hosts: SupplyPlannerHandoffHost[]) {
	return () => {
		const host: SupplyPlannerHandoffHost = {
			getGame: () => live.game,
			closeOverlays: vi.fn(() => calls.push('closeOverlays')),
			switchToSupplyCity: vi.fn(async (cityId: WorldCityId) => {
				calls.push(`switch:${cityId}`);
				if (!live.switchSucceeds) return false;
				live.onSwitched?.();
				return true;
			}),
			armIndustryPlacement: vi.fn((buildingTypeId: IndustrialBuildingTypeId) =>
				calls.push(`arm:${buildingTypeId}`)
			),
			selectIndustryTile: vi.fn((tileId: string) => calls.push(`inspect:${tileId}`)),
			openLogistics: vi.fn((routeId: string | null, preset: unknown) =>
				calls.push(
					routeId === null && preset !== null ? 'logistics:preset' : `logistics:${routeId}`
				)
			),
			openStores: vi.fn((cityId: WorldCityId) => calls.push(`stores:${cityId}`)),
			enterRailBuildMode: vi.fn((mode: { originBuildingId: string }) =>
				calls.push(`rail:${mode.originBuildingId}`)
			),
			get canBuildRail() {
				return live.permissions.canBuildRail;
			},
			get canManageLogistics() {
				return live.permissions.canManageLogistics;
			},
			get canSetRetailSupplySource() {
				return live.permissions.canSetRetailSupplySource;
			}
		};
		hosts.push(host);
		return host;
	};
}

function mountPlanner(
	holder: PlannerHolder = baseHolder(),
	buildPlanOverride?: ReturnType<typeof createCalculation>
): Mounted {
	const events: string[] = [];
	const calls: string[] = [];
	const hosts: SupplyPlannerHandoffHost[] = [];
	// Live-getter contract: the page feeds the owner from $state atoms, so the
	// fixture holder must be reactive for replacement assertions to re-run the
	// owner's deriveds.
	const live = $state(holder);
	const buildPlan =
		buildPlanOverride ??
		createCalculation(() => plannerResult(live.recommendation, live.snapshotOverrides));
	const ui = createSupplyPlannerUi({
		getGame: () => live.game,
		getRetailCityId: () => live.retailCityId,
		getAllowedProductIds: () => live.allowedProductIds,
		getAllowedIndustryBuildingTypeIds: () => live.allowedIndustryBuildingTypeIds,
		getAllowedIndustrialPlacements: () => live.allowedIndustrialPlacements,
		getAvailability: () => live.availability,
		createHost: hostSpyFactory(live, calls, hosts),
		onOpen: () => events.push('onOpen'),
		onPlanProduct: () => events.push('onPlanProduct'),
		buildPlan
	});
	render(SupplyAdvisorHost, { ui, i18n: createI18n('en') });
	return { ui, buildPlan, events, calls, hosts, holder: live };
}

afterEach(() => {
	vi.restoreAllMocks();
});

it('closed planner is lazy and durable', () => {
	const mounted = mountPlanner();
	const { ui, holder } = mounted;

	// Initial context keeps the authored 30-day horizon.
	expect(ui.isOpen).toBe(false);
	expect(ui.context).toEqual({ productId: null, horizonDays: 30 });

	// Closed: reading the projection never triggers the calculation.
	expect(ui.result).toBeNull();
	expect(mounted.buildPlan).not.toHaveBeenCalled();

	// Category/horizon edits while closed stay free of calculations.
	ui.selectProduct('snacks');
	ui.selectHorizon(7);
	expect(ui.result).toBeNull();
	expect(mounted.buildPlan).not.toHaveBeenCalled();

	// Pre-game and productless states stay lazy even while open.
	holder.game = null;
	ui.open();
	expect(ui.isOpen).toBe(true);
	expect(ui.result).toBeNull();
	expect(mounted.buildPlan).not.toHaveBeenCalled();

	holder.game = { ...createNewGame('convenience', 20260811), cash: 500_000 };
	holder.allowedProductIds = [];
	expect(ui.productIds).toEqual([]);
	expect(ui.effectiveProductId).toBeNull();
	expect(ui.result).toBeNull();
	expect(mounted.buildPlan).not.toHaveBeenCalled();

	// Restoring a product calculates through the snapshot boundary only.
	holder.allowedProductIds = ['bottled-water', 'snacks'];
	expect(ui.result).not.toBeNull();
	expect(mounted.buildPlan).toHaveBeenCalledTimes(1);
	const [receivedGame] = mounted.buildPlan.mock.calls[0]!;
	expect(receivedGame).not.toBe(holder.game);
	expect(receivedGame.cash).toBe(500_000);

	// Close/reopen preserves the durable context; nothing recalculates until
	// the reopened projection is actually read.
	ui.close();
	expect(ui.result).toBeNull();
	expect(mounted.buildPlan).toHaveBeenCalledTimes(1);
	ui.open();
	expect(ui.result).not.toBeNull();
	expect(ui.context).toEqual({ productId: 'snacks', horizonDays: 7 });
	expect(mounted.buildPlan).toHaveBeenCalledTimes(2);

	// Invalid product fallback must not destroy the chosen context.
	holder.allowedProductIds = ['bottled-water'];
	expect(ui.effectiveProductId).toBe('bottled-water');
	expect(ui.context.productId).toBe('snacks');
	holder.allowedProductIds = ['bottled-water', 'snacks'];
	expect(ui.effectiveProductId).toBe('snacks');

	// Reopening after a game replacement reads the latest game.
	ui.close();
	holder.game = { ...createNewGame('convenience', 20260812), cash: 900 };
	ui.open();
	expect(ui.result).not.toBeNull();
	expect(mounted.buildPlan.mock.lastCall?.[0]!.cash).toBe(900);
});

it('action revalidates the live recommendation before dispatching', async () => {
	// Unrendered owner: without the host's reactive re-reads the calculation
	// count is deterministic (one display read + one live re-derivation per
	// dispatched action attempt).
	const holder = baseHolder();
	const live = $state(holder);
	const calls: string[] = [];
	const hosts: SupplyPlannerHandoffHost[] = [];
	const buildPlan = createCalculation((game, availability) => {
		if (game.cash < buildProducerAction.cost || !availability.canBuildIndustry) {
			return plannerResult({ kind: 'none', reason: 'unaffordable' });
		}
		// Standing buildings/routes change what the planner recommends for the
		// same product, modeling live world edits after the plan was displayed.
		if (game.industrialBuildings.length > 0) {
			return plannerResult(standingProducerUpgradeAction);
		}
		if (game.logistics.recurringRoutes.length > 0) {
			return plannerResult(editRouteAction);
		}
		return plannerResult(buildProducerAction);
	});
	const ui = createSupplyPlannerUi({
		getGame: () => live.game,
		getRetailCityId: () => live.retailCityId,
		getAllowedProductIds: () => live.allowedProductIds,
		getAllowedIndustryBuildingTypeIds: () => live.allowedIndustryBuildingTypeIds,
		getAllowedIndustrialPlacements: () => live.allowedIndustrialPlacements,
		getAvailability: () => live.availability,
		createHost: hostSpyFactory(live, calls, hosts),
		onOpen: () => {},
		onPlanProduct: () => {},
		buildPlan
	});

	ui.open();
	const displayed = ui.result;
	if (displayed?.status !== 'ready') throw new Error('fixture must display a ready plan');
	expect(displayed.plan.recommendation.action).toEqual(buildProducerAction);
	const displayedCalls = buildPlan.mock.calls.length;

	// Cash drops below the action cost after the result was displayed: the
	// stale click must re-derive live and dispatch nothing.
	live.game = { ...live.game!, cash: 100 };
	await ui.handleAction(buildProducerAction);
	expect(buildPlan.mock.calls.length).toBe(displayedCalls + 1);
	expect(calls).toEqual([]);

	// Permission loss flips the recommendation even with plenty of cash, and
	// the planner projection stays cash-only despite a finance-enabled menu.
	live.game = { ...live.game!, cash: 1_000_000 };
	live.availability = allAvailability({
		buildIndustrialBuilding: false,
		financeIndustrialBuilding: true
	});
	expect(ui.availability.canBuildIndustry).toBe(false);
	await ui.handleAction(buildProducerAction);
	expect(buildPlan.mock.calls.length).toBe(displayedCalls + 2);
	expect(calls).toEqual([]);

	// Buildings changed after display: the recommended producer already
	// stands, so the live recommendation is an upgrade and the stale build
	// click dispatches nothing (no arm, no inspect, no navigation).
	live.availability = allAvailability();
	live.game = {
		...live.game!,
		industrialBuildings: [building('water-pump', 'existing-pump-1')]
	};
	const afterBuildingChange = ui.result;
	if (afterBuildingChange?.status !== 'ready') {
		throw new Error('fixture must re-derive a ready plan');
	}
	expect(afterBuildingChange.plan.recommendation.action).toEqual(standingProducerUpgradeAction);
	await ui.handleAction(buildProducerAction);
	expect(buildPlan.mock.calls.length).toBe(displayedCalls + 4);
	expect(calls).toEqual([]);

	// Routes changed after display: the recommended import route now exists,
	// so the live recommendation is an edit and the stale build click still
	// dispatches nothing.
	live.game = {
		...live.game!,
		industrialBuildings: [],
		logistics: { ...live.game!.logistics, recurringRoutes: [standingRoute] }
	};
	const afterRouteChange = ui.result;
	if (afterRouteChange?.status !== 'ready') {
		throw new Error('fixture must re-derive a ready plan');
	}
	expect(afterRouteChange.plan.recommendation.action).toEqual(editRouteAction);
	await ui.handleAction(buildProducerAction);
	expect(buildPlan.mock.calls.length).toBe(displayedCalls + 6);
	expect(calls).toEqual([]);

	// A closed planner ignores actions entirely — not even a host is built.
	ui.close();
	const hostsBeforeClose = hosts.length;
	await ui.handleAction(buildProducerAction);
	expect(buildPlan.mock.calls.length).toBe(displayedCalls + 6);
	expect(hosts).toHaveLength(hostsBeforeClose);
});

it('handoff keeps the original close order and makes no domain command before submit', async () => {
	const mounted = mountPlanner();
	const { ui, holder } = mounted;
	ui.open();
	const gameBefore = JSON.stringify(holder.game);

	await ui.handleAction(buildProducerAction);
	expect(mounted.calls).toEqual(['closeOverlays', 'switch:industry-city', 'arm:water-pump']);

	// Nothing mutated the game: arming only prepared navigation/placement.
	expect(JSON.stringify(holder.game)).toBe(gameBefore);

	// Route/source handoffs navigate to their panels without submitting.
	mounted.calls.length = 0;
	holder.recommendation = createRouteAction;
	await ui.handleAction(createRouteAction);
	expect(mounted.calls).toEqual(['closeOverlays', 'logistics:preset']);

	mounted.calls.length = 0;
	holder.recommendation = changeSourceAction;
	await ui.handleAction(changeSourceAction);
	expect(mounted.calls).toEqual(['closeOverlays', 'stores:harbor-city']);

	// Live permission loss keeps everything closed and submits nothing:
	// the recommendation still matches the submitted action, so only the
	// permission gate can explain the empty call log.
	mounted.calls.length = 0;
	holder.recommendation = createRouteAction;
	holder.permissions.canManageLogistics = false;
	await ui.handleAction(createRouteAction);
	expect(mounted.calls).toEqual([]);
	expect(JSON.stringify(holder.game)).toBe(gameBefore);
});

it('product handoff clears management focus before opening the advisor', () => {
	const mounted = mountPlanner();
	const { ui } = mounted;

	ui.planProduct('snacks');
	expect(mounted.events).toEqual(['onPlanProduct', 'onOpen']);
	expect(ui.isOpen).toBe(true);
	expect(ui.context.productId).toBe('snacks');

	// Unknown products never trigger the handoff.
	ui.close();
	mounted.events.length = 0;
	ui.planProduct('produce');
	expect(mounted.events).toEqual([]);
	expect(ui.isOpen).toBe(false);
});

it('deferred switch failures and stale buildings abort without arming or inspecting', async () => {
	const mounted = mountPlanner();
	const { ui, holder } = mounted;
	ui.open();

	// Cancelled/failed switch: overlays close but nothing arms.
	holder.switchSucceeds = false;
	await ui.handleAction(buildProducerAction);
	expect(mounted.calls).toEqual(['closeOverlays', 'switch:industry-city']);
	expect(mounted.hosts[0]!.armIndustryPlacement).not.toHaveBeenCalled();

	// Upgrade handoff: the building disappears during the awaited switch.
	holder.switchSucceeds = true;
	holder.game = {
		...holder.game!,
		industrialBuildings: [building('water-pump', 'upgrade-target-1')]
	};
	holder.onSwitched = () => {
		holder.game = { ...holder.game!, industrialBuildings: [] };
	};
	holder.recommendation = upgradeAction;
	await ui.handleAction(upgradeAction);
	expect(mounted.calls).toEqual([
		'closeOverlays',
		'switch:industry-city',
		'closeOverlays',
		'switch:industry-city'
	]);
	expect(mounted.hosts[1]!.selectIndustryTile).not.toHaveBeenCalled();

	// Wrong city: the building survives the awaited switch but lands outside
	// the snapshot's supply city, so neither arm nor inspect may fire.
	holder.game = {
		...holder.game!,
		industrialBuildings: [building('water-pump', 'upgrade-target-1')]
	};
	holder.onSwitched = () => {
		holder.game = {
			...holder.game!,
			industrialBuildings: [building('water-pump', 'upgrade-target-1', 'breadbasket-basin')]
		};
	};
	await ui.handleAction(upgradeAction);
	expect(mounted.calls).toEqual([
		'closeOverlays',
		'switch:industry-city',
		'closeOverlays',
		'switch:industry-city',
		'closeOverlays',
		'switch:industry-city'
	]);
	expect(mounted.hosts[2]!.selectIndustryTile).not.toHaveBeenCalled();
	expect(mounted.hosts[2]!.armIndustryPlacement).not.toHaveBeenCalled();

	// Rail handoff requires current permission and disconnected membership.
	holder.onSwitched = undefined;
	holder.game = {
		...holder.game!,
		industrialBuildings: [building('water-pump', 'rail-target-1')]
	};
	holder.recommendation = connectRailAction;
	holder.snapshotOverrides = { disconnectedBuildingIds: ['rail-target-1'] };
	await ui.handleAction(connectRailAction);
	expect(mounted.calls).toEqual([
		'closeOverlays',
		'switch:industry-city',
		'closeOverlays',
		'switch:industry-city',
		'closeOverlays',
		'switch:industry-city',
		'closeOverlays',
		'switch:industry-city',
		'rail:rail-target-1'
	]);

	mounted.calls.length = 0;
	holder.permissions.canBuildRail = false;
	await ui.handleAction(connectRailAction);
	expect(mounted.calls).toEqual([]);
	expect(mounted.hosts[4]!.enterRailBuildMode).not.toHaveBeenCalled();

	mounted.calls.length = 0;
	holder.permissions.canBuildRail = true;
	holder.snapshotOverrides = { disconnectedBuildingIds: [] };
	await ui.handleAction(connectRailAction);
	expect(mounted.calls).toEqual([]);
});

it('advisor host unmounts the dialog while the page-lived owner keeps context', async () => {
	const mounted = mountPlanner();
	const { ui } = mounted;
	const dialog = page.getByRole('dialog', { name: /supply advisor/i });
	await expect.element(dialog).not.toBeInTheDocument();

	ui.open();
	await expect.element(dialog).toBeVisible();
	await expect
		.element(page.getByRole('combobox', { name: 'Category' }))
		.toHaveValue('bottled-water');

	ui.close();
	await expect.element(dialog).not.toBeInTheDocument();

	// Context edits while the advisor is unmounted survive reopen.
	ui.selectProduct('snacks');
	ui.selectHorizon(7);
	ui.open();
	await expect.element(page.getByRole('combobox', { name: 'Category' })).toHaveValue('snacks');
	const horizonButton = page.getByRole('button', { name: '7 days', exact: true });
	await expect.element(horizonButton).toBeVisible();
	expect(horizonButton.element().getAttribute('aria-pressed')).toBe('true');
});

it('derives a real plan through the retained calculation', () => {
	// No buildPlan override: the owner must use the real buildSupplyPlan.
	const holder = baseHolder();
	const live = $state(holder);
	const ui = createSupplyPlannerUi({
		getGame: () => live.game,
		getRetailCityId: () => live.retailCityId,
		getAllowedProductIds: () => live.allowedProductIds,
		getAllowedIndustryBuildingTypeIds: () => live.allowedIndustryBuildingTypeIds,
		getAllowedIndustrialPlacements: () => live.allowedIndustrialPlacements,
		getAvailability: () => live.availability,
		createHost: () => {
			throw new Error('not used');
		},
		onOpen: () => {},
		onPlanProduct: () => {}
	});

	expect(ui.productIds).toEqual(['bottled-water', 'snacks']);
	ui.open('bottled-water');
	const result = ui.result;
	expect(result?.status).toBe('ready');
	if (result?.status === 'ready') {
		expect(result.plan.snapshot.retailCityId).toBe('harbor-city');
		expect(result.plan.recommendation.action.kind).toBe('build-producer');
	}
});

it('ignores disallowed product selections and dispatches nothing when the plan is empty', async () => {
	const mounted = mountPlanner();
	const { ui, holder } = mounted;

	ui.open();
	expect(ui.context.productId).toBeNull();
	ui.selectProduct('produce');
	expect(ui.context.productId).toBeNull();

	// An open advisor whose live derivation yields no result must not dispatch.
	holder.game = null;
	await ui.handleAction(buildProducerAction);
	expect(mounted.calls).toEqual([]);
});

it('advisor DOM interactions reach the session callbacks', async () => {
	const mounted = mountPlanner();
	const { ui } = mounted;
	ui.open();

	await page.getByRole('combobox', { name: 'Category' }).selectOptions(['snacks']);
	expect(ui.effectiveProductId).toBe('snacks');
	await page.getByRole('button', { name: '7 days', exact: true }).click();
	expect(ui.context.horizonDays).toBe(7);

	document.querySelector<HTMLButtonElement>('.build-next')!.click();
	await vi.waitFor(() => expect(mounted.calls.length).toBeGreaterThan(0));

	await page.getByRole('button', { name: 'Close supply advisor', exact: true }).click();
	expect(ui.isOpen).toBe(false);
});
