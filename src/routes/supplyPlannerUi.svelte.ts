import type { GameState, IndustrialBuildingTypeId, ProductId, WorldCityId } from '$lib/game/types';
import type { SupplyPlannerHorizonDays } from '$lib/game/supplyPlanner';
import {
	buildSupplyPlan,
	type SupplyPlannerAction,
	type SupplyPlannerActionAvailability,
	type SupplyPlannerResult
} from '$lib/game/supplyPlannerActions';
import {
	deriveSupplyPlannerResult,
	getSupplyPlannerProductIds,
	handoffSupplyPlannerAction,
	resolveSupplyPlannerProductId,
	type SupplyPlannerHandoffHost,
	type SupplyPlannerUiContext
} from './supplyPlannerRoute';
import type { MutationAvailability } from './gameRouteController';

/** Initial forecast horizon retained from the original route context. */
const INITIAL_HORIZON_DAYS: SupplyPlannerHorizonDays = 30;

interface SupplyPlannerUiOptions {
	getGame(): GameState | null;
	getRetailCityId(): WorldCityId;
	getAllowedProductIds(): readonly ProductId[];
	getAllowedIndustryBuildingTypeIds(): readonly IndustrialBuildingTypeId[];
	getAllowedIndustrialPlacements(): ReadonlySet<string> | null;
	getAvailability(): MutationAvailability;
	/** Root-owned bridge, built per action so permissions read live. */
	createHost(): SupplyPlannerHandoffHost;
	/** Hides competing shell surfaces (build menu) when the advisor opens. */
	onOpen(): void;
	/** Clears management-panel focus before a product deep-link opens the advisor. */
	onPlanProduct(): void;
	/** Calculation seam mirroring deriveSupplyPlannerResult's buildPlan parameter. */
	buildPlan?: typeof buildSupplyPlan;
}

/**
 * Page-lived supply advisor owner. The instance outlives the advisor dialog
 * (the host component unmounts it when closed), so the chosen category and
 * horizon stay durable across reopen. The plan calculation stays behind the
 * open gate and only ever sees a snapshot of the live game; actions
 * re-derive the recommendation from live getters before dispatching.
 */
export function createSupplyPlannerUi(options: SupplyPlannerUiOptions) {
	const buildPlan = options.buildPlan ?? buildSupplyPlan;
	let isOpen = $state(false);
	let context = $state<SupplyPlannerUiContext>({
		productId: null,
		horizonDays: INITIAL_HORIZON_DAYS
	});

	const productIds = $derived.by(() =>
		getSupplyPlannerProductIds(
			options.getGame(),
			options.getRetailCityId(),
			options.getAllowedProductIds()
		)
	);
	// The fallback never writes back: an invalid chosen category must not be
	// destroyed while its product list is temporarily unavailable.
	const effectiveProductId = $derived(resolveSupplyPlannerProductId(context, productIds));
	// Planner candidate affordability is cash-only (game.cash >= buildCost),
	// so the planner must not advertise build actions when only the finance
	// command is available. The build-menu UI still supports both paths.
	const availability = $derived.by<SupplyPlannerActionAvailability>(() => {
		const mutationAvailability = options.getAvailability();
		return {
			canBuildIndustry: mutationAvailability.buildIndustrialBuilding,
			canUpgradeIndustry: mutationAvailability.upgradeIndustrialBuilding,
			canBuildRail: mutationAvailability.buildRail,
			canManageLogistics: mutationAvailability.manageLogistics,
			canSetRetailSupplySource: mutationAvailability.setRetailSupplySource,
			allowedIndustryBuildingTypeIds: options.getAllowedIndustryBuildingTypeIds(),
			allowedIndustrialPlacements: options.getAllowedIndustrialPlacements()
		};
	});
	// Keep the calculation behind the advisor's open gate: no plan is built
	// for an unmounted modal, a pre-game route or a productless catalog.
	const result = $derived.by<SupplyPlannerResult | null>(() => {
		const game = options.getGame();
		if (!isOpen || !game || !effectiveProductId) return null;
		return deriveSupplyPlannerResult(
			{
				isOpen: true,
				game,
				retailCityId: options.getRetailCityId(),
				productId: effectiveProductId,
				availability,
				snapshotGame
			},
			buildPlan
		);
	});

	function snapshotGame(game: GameState): GameState {
		return $state.snapshot(game);
	}

	function open(productId?: ProductId): void {
		if (productId !== undefined && productIds.includes(productId)) {
			context = { ...context, productId };
		}
		options.onOpen();
		isOpen = true;
	}

	function close(): void {
		isOpen = false;
	}

	function planProduct(productId: ProductId): void {
		if (!productIds.includes(productId)) return;
		options.onPlanProduct();
		open(productId);
	}

	function selectProduct(productId: ProductId): void {
		if (!productIds.includes(productId)) return;
		context = { ...context, productId };
	}

	function selectHorizon(horizonDays: SupplyPlannerHorizonDays): void {
		context = { ...context, horizonDays };
	}

	function handleAction(action: SupplyPlannerAction): Promise<void> {
		// A closed advisor cannot dispatch, and the recommendation is always
		// re-derived from live getters so a stale displayed plan never hands
		// off (cash/routes/buildings/permissions may have changed).
		if (!isOpen) return Promise.resolve();
		const currentResult = deriveSupplyPlannerResult(
			{
				isOpen: true,
				game: options.getGame(),
				retailCityId: options.getRetailCityId(),
				productId: effectiveProductId,
				availability,
				snapshotGame
			},
			buildPlan
		);
		if (!currentResult) return Promise.resolve();
		return handoffSupplyPlannerAction(action, currentResult, options.createHost());
	}

	return {
		get isOpen() {
			return isOpen;
		},
		get context(): SupplyPlannerUiContext {
			return context;
		},
		get productIds() {
			return productIds;
		},
		get effectiveProductId() {
			return effectiveProductId;
		},
		get availability() {
			return availability;
		},
		get result() {
			return result;
		},
		open,
		close,
		planProduct,
		selectProduct,
		selectHorizon,
		handleAction
	};
}
