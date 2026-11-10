import { selectRetailInspector } from './mapInspectorRoute';
import { createStoreDetailFocus, type StoreDetailFocus } from './storeDetailFocus.svelte';
import { summarizeReports } from '$lib/game/reports';
import { resolveWorldCityId } from '$lib/game/cityInventory';
import type {
	BrandId,
	City,
	CityTile,
	DailyStoreReport,
	GameState,
	ProductId,
	Store,
	StoreProductPatch,
	WorldCityId
} from '$lib/game/types';
import type {
	GameRouteCommitResult,
	GameRouteController,
	MutationAvailability
} from './gameRouteController';

/** Store-detail command port: the retail mutations the inspection drives. */
export type RetailInspectionCommands = Pick<
	GameRouteController,
	| 'upgradeStore'
	| 'updateStoreSellingPrice'
	| 'updateStoreInventoryTargets'
	| 'updateStoreProductBrand'
>;

interface RetailInspectionOptions {
	getGame(): GameState | null;
	getCity(): City;
	getSelectedTileId(): string | null;
	getAvailability(): MutationAvailability;
	commands: RetailInspectionCommands;
	/** Clears the map session's retail-tile selection (inspector dismissal). */
	onClearRetailSelection(): void;
	/** Opens the management Stores panel focused on a retail city. */
	onManageSupply(retailCityId: WorldCityId): void;
	/** Opens the supply planner for one product. */
	onPlanProduct(productId: ProductId): void;
}

/**
 * Retail inspection owner: the selected retail tile/store with its latest
 * report, the focused store-detail overlay (reusing the existing focus
 * factory — there is no second open/product atom), the individual edit
 * permission flags and the guarded store-product mutations. Handing off to
 * management/planner closes the focus overlay first; dismissing the inspector
 * also clears the map selection through the root callback.
 */
export function createRetailInspection(options: RetailInspectionOptions) {
	const selected = $derived(
		selectRetailInspector(options.getGame(), options.getCity(), options.getSelectedTileId())
	);
	const focus: StoreDetailFocus = createStoreDetailFocus(() => selected.selectedStore !== null);
	const summary = $derived.by(() => {
		const game = options.getGame();
		return game ? summarizeReports(game.reports) : summarizeReports([]);
	});
	const latestReport = $derived.by<DailyStoreReport | null>(() => {
		const store = selected.selectedStore;
		return store
			? (summary.latest?.storeReports.find((report) => report.storeId === store.id) ?? null)
			: null;
	});
	const canUpgradeStore = $derived(options.getAvailability().upgradeStore);
	const canUpdateSellingPrice = $derived(options.getAvailability().updateStoreSellingPrice);
	const canUpdateInventoryTargets = $derived(options.getAvailability().updateStoreInventoryTargets);
	const canUpdateBrand = $derived(options.getAvailability().updateStoreProductBrand);

	function manageSupplySource(retailCityId: string): void {
		const cityId = resolveWorldCityId(retailCityId);
		if (!cityId) return;
		focus.close();
		options.onManageSupply(cityId);
	}

	function planSupplyProduct(productId: ProductId): void {
		focus.close();
		options.onPlanProduct(productId);
	}

	async function changeStoreProduct(
		storeId: string,
		productId: ProductId,
		patch: StoreProductPatch
	): Promise<GameRouteCommitResult | null> {
		// null = pre-command: no game, unknown product, or the mutation command
		// is unavailable in this run. Otherwise the controller result is passed
		// through unchanged so callers can acknowledge truthfully.
		const game = options.getGame();
		if (!game) {
			return null;
		}
		const product = game.stores
			.find((store) => store.id === storeId)
			?.products.find((candidate) => candidate.productId === productId);
		if (!product) {
			return null;
		}

		if (patch.sellingPrice !== undefined) {
			if (!options.getAvailability().updateStoreSellingPrice) return null;
			return options.commands.updateStoreSellingPrice(storeId, productId, patch.sellingPrice);
		}
		if (!options.getAvailability().updateStoreInventoryTargets) return null;
		return options.commands.updateStoreInventoryTargets(
			storeId,
			productId,
			patch.reorderThreshold ?? product.reorderThreshold,
			patch.targetStock ?? product.targetStock
		);
	}

	async function upgradeStore(storeId: string): Promise<GameRouteCommitResult | null> {
		if (!options.getGame() || !options.getAvailability().upgradeStore) return null;
		return options.commands.upgradeStore(storeId);
	}

	function changeStoreProductBrand(storeId: string, productId: ProductId, brandId: BrandId): void {
		if (!options.getGame() || !options.getAvailability().updateStoreProductBrand) return;
		void options.commands.updateStoreProductBrand(storeId, productId, brandId);
	}

	function closeInspector(): void {
		options.onClearRetailSelection();
		focus.close();
	}

	return {
		get selectedTile(): CityTile | null {
			return selected.selectedTile;
		},
		get selectedStore(): Store | null {
			return selected.selectedStore;
		},
		get latestReport(): DailyStoreReport | null {
			return latestReport;
		},
		get focus(): StoreDetailFocus {
			return focus;
		},
		get canUpgradeStore(): boolean {
			return canUpgradeStore;
		},
		get canUpdateSellingPrice(): boolean {
			return canUpdateSellingPrice;
		},
		get canUpdateInventoryTargets(): boolean {
			return canUpdateInventoryTargets;
		},
		get canUpdateBrand(): boolean {
			return canUpdateBrand;
		},
		/** Guarded overlay open: ordinary opening clears the product focus. */
		open(productId: ProductId | null = null): void {
			focus.open(productId);
		},
		/** Stock-alert deep-link: opens focused, possibly before any selection. */
		openDirect(productId: ProductId | null): void {
			focus.openDirect(productId);
		},
		close(): void {
			focus.close();
		},
		closeInspector,
		manageSupplySource,
		planSupplyProduct,
		changeStoreProduct,
		upgradeStore,
		changeStoreProductBrand
	};
}

export type RetailInspection = ReturnType<typeof createRetailInspection>;
