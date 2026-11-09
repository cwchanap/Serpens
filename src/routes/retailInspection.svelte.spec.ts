import { expect, it, vi } from 'vitest';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import type { City, GameState, ProductId, StoreProductPatch } from '$lib/game/types';
import type { GameRouteCommitResult, MutationAvailability } from './gameRouteController';
import { createRetailInspection, type RetailInspectionCommands } from './retailInspection.svelte';

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

function spyCommands() {
	// Loose result type: tests deliberately resolve other statuses through.
	const committed = async () => ({ status: 'committed' }) as GameRouteCommitResult;
	return {
		upgradeStore: vi.fn(committed),
		updateStoreSellingPrice: vi.fn(committed),
		updateStoreInventoryTargets: vi.fn(committed),
		updateStoreProductBrand: vi.fn(committed)
	};
}

interface Holder {
	game: GameState | null;
	city: City;
	selectedTileId: string | null;
	availability: MutationAvailability;
}

function baseHolder(): Holder {
	const game = simulateDay(createNewGame('convenience', 20260820));
	const store = game.stores[0]!;
	const city = game.cities.find((candidate) => candidate.id === store.cityId)!;
	return { game, city, selectedTileId: store.tileId, availability: allAvailability() };
}

interface Mounted {
	ui: ReturnType<typeof createRetailInspection>;
	commands: ReturnType<typeof spyCommands>;
	holder: Holder;
	/** Live counter object: callbacks mutate it after the mount returns. */
	counters: { clearedSelections: number };
	managedSupply: string[];
	plannedProducts: ProductId[];
}

function mountRetail(holder: Holder = baseHolder()): Mounted {
	const live = $state(holder);
	const commands = spyCommands();
	const counters = { clearedSelections: 0 };
	const managedSupply: string[] = [];
	const plannedProducts: ProductId[] = [];
	const ui = createRetailInspection({
		getGame: () => live.game,
		getCity: () => live.city,
		getSelectedTileId: () => live.selectedTileId,
		getAvailability: () => live.availability,
		commands: commands as unknown as RetailInspectionCommands,
		onClearRetailSelection: () => {
			counters.clearedSelections += 1;
		},
		onManageSupply: (cityId) => {
			managedSupply.push(cityId);
		},
		onPlanProduct: (productId) => {
			plannedProducts.push(productId);
		}
	});
	return { ui, commands, holder: live, counters, managedSupply, plannedProducts };
}

function storeProduct(mounted: Mounted, productId: ProductId) {
	const store = mounted.holder.game!.stores[0]!;
	return store.products.find((product) => product.productId === productId)!;
}

it('re-derives the selected tile, store and latest report from live inputs', () => {
	const mounted = mountRetail();
	const { ui, holder } = mounted;
	const store = holder.game!.stores[0]!;
	expect(ui.selectedTile?.id).toBe(store.tileId);
	expect(ui.selectedStore?.id).toBe(store.id);
	expect(ui.latestReport?.storeId).toBe(store.id);

	// A day-2 game replaces the report; a cleared selection hides everything.
	const dayTwo = simulateDay(holder.game!);
	holder.game = dayTwo;
	expect(ui.latestReport?.storeId).toBe(store.id);

	holder.selectedTileId = null;
	expect(ui.selectedTile).toBeNull();
	expect(ui.selectedStore).toBeNull();
	expect(ui.latestReport).toBeNull();

	holder.selectedTileId = store.tileId;
	holder.game = null;
	expect(ui.selectedStore).toBeNull();
});

it('keeps the guarded focus contract: ordinary open clears, milestone preserves', () => {
	const mounted = mountRetail();
	const { ui } = mounted;
	expect(ui.focus.isOpen).toBe(false);

	// Ordinary opening clears any focused product.
	ui.focus.openDirect('snacks');
	expect(ui.focus.focusedProductId).toBe('snacks');
	ui.open();
	expect(ui.focus.isOpen).toBe(true);
	expect(ui.focus.focusedProductId).toBeNull();

	// Milestone handoff opening preserves its requested product focus.
	ui.open('soft-drinks');
	expect(ui.focus.isOpen).toBe(true);
	expect(ui.focus.focusedProductId).toBe('soft-drinks');

	// The guard still refuses to open without a selected store.
	ui.close();
	mounted.holder.selectedTileId = null;
	ui.open('snacks');
	expect(ui.focus.isOpen).toBe(false);

	// A direct (stock-alert) open may precede the selection itself.
	ui.openDirect('bottled-water');
	expect(ui.focus.isOpen).toBe(true);
	expect(ui.focus.focusedProductId).toBe('bottled-water');
	expect(ui.selectedStore).toBeNull();

	// Close clears both focus atoms.
	mounted.holder.selectedTileId = mounted.holder.game!.stores[0]!.tileId;
	ui.close();
	expect(ui.focus.isOpen).toBe(false);
	expect(ui.focus.focusedProductId).toBeNull();
});

it('keeps a vanished selection hidden without resetting the focus overlay', () => {
	const mounted = mountRetail();
	const { ui, holder } = mounted;
	ui.openDirect('snacks');
	expect(ui.focus.isOpen).toBe(true);
	expect(ui.selectedStore).not.toBeNull();

	holder.game = null;
	expect(ui.selectedStore).toBeNull();
	// The focus overlay survives the vanished selection — no reset effect.
	expect(ui.focus.isOpen).toBe(true);
	expect(ui.focus.focusedProductId).toBe('snacks');
});

it('applies price patches first, then inventory defaults from the current product', async () => {
	const mounted = mountRetail();
	const { ui, commands, holder } = mounted;
	const store = holder.game!.stores[0]!;
	const productId = store.products[0]!.productId;
	const product = storeProduct(mounted, productId);

	// Price wins over inventory fields when both are present.
	const both: StoreProductPatch = {
		sellingPrice: 5,
		reorderThreshold: 10,
		targetStock: 40
	};
	expect(await ui.changeStoreProduct(store.id, productId, both)).toEqual({ status: 'committed' });
	expect(commands.updateStoreSellingPrice).toHaveBeenCalledWith(store.id, productId, 5);
	expect(commands.updateStoreInventoryTargets).not.toHaveBeenCalled();
	commands.updateStoreSellingPrice.mockClear();

	// A partial target defaults the missing field to the current product.
	expect(await ui.changeStoreProduct(store.id, productId, { reorderThreshold: 9 })).toEqual({
		status: 'committed'
	});
	expect(commands.updateStoreInventoryTargets).toHaveBeenCalledWith(
		store.id,
		productId,
		9,
		product.targetStock
	);
	expect(await ui.changeStoreProduct(store.id, productId, { targetStock: 33 })).toEqual({
		status: 'committed'
	});
	expect(commands.updateStoreInventoryTargets).toHaveBeenLastCalledWith(
		store.id,
		productId,
		product.reorderThreshold,
		33
	);
});

it('returns null for unknown products and unavailable commands without false acknowledgement', async () => {
	const mounted = mountRetail();
	const { ui, commands, holder } = mounted;
	const store = holder.game!.stores[0]!;
	const patch: StoreProductPatch = { sellingPrice: 5 };

	const unknownProductId = 'not-a-product' as ProductId;
	expect(await ui.changeStoreProduct(store.id, unknownProductId, patch)).toBeNull();
	expect(commands.updateStoreSellingPrice).not.toHaveBeenCalled();

	holder.availability = allAvailability({ updateStoreSellingPrice: false });
	expect(await ui.changeStoreProduct(store.id, store.products[0]!.productId, patch)).toBeNull();
	expect(commands.updateStoreSellingPrice).not.toHaveBeenCalled();

	holder.availability = allAvailability({ updateStoreSellingPrice: true });
	holder.game = null;
	expect(await ui.changeStoreProduct(store.id, store.products[0]!.productId, patch)).toBeNull();
	expect(commands.updateStoreSellingPrice).not.toHaveBeenCalled();
});

it('forwards the original command results for price and upgrade edits', async () => {
	const mounted = mountRetail();
	const { ui, commands, holder } = mounted;
	const store = holder.game!.stores[0]!;
	const productId = store.products[0]!.productId;

	commands.updateStoreSellingPrice.mockResolvedValueOnce({
		status: 'sandbox-committed',
		changed: true
	});
	expect(await ui.changeStoreProduct(store.id, productId, { sellingPrice: 7 })).toEqual({
		status: 'sandbox-committed',
		changed: true
	});
	expect(await ui.upgradeStore(store.id)).toEqual({ status: 'committed' });

	commands.upgradeStore.mockResolvedValueOnce({ status: 'busy' });
	expect(await ui.upgradeStore(store.id)).toEqual({ status: 'busy' });

	holder.availability = allAvailability({ upgradeStore: false });
	expect(await ui.upgradeStore(store.id)).toBeNull();
	expect(commands.upgradeStore).toHaveBeenCalledTimes(2);

	holder.game = null;
	expect(await ui.upgradeStore(store.id)).toBeNull();
});

it('hands off supply and planner actions through the root callbacks after closing focus', () => {
	const mounted = mountRetail();
	const { ui, holder } = mounted;
	ui.open('snacks');

	ui.manageSupplySource('campus-junction');
	expect(ui.focus.isOpen).toBe(false);
	expect(mounted.managedSupply).toEqual(['campus-junction']);

	// Unknown city ids never reach the management handoff.
	ui.open('snacks');
	ui.manageSupplySource('not-a-city');
	expect(mounted.managedSupply).toEqual(['campus-junction']);
	expect(ui.focus.isOpen).toBe(true);

	ui.planSupplyProduct('snacks');
	expect(ui.focus.isOpen).toBe(false);
	expect(mounted.plannedProducts).toEqual(['snacks']);
	expect(mounted.counters.clearedSelections).toBe(0);
	void holder;
});

it('closes the inspector by clearing the selection and the focus overlay', () => {
	const mounted = mountRetail();
	const { ui } = mounted;
	ui.open('snacks');
	ui.closeInspector();
	expect(ui.focus.isOpen).toBe(false);
	expect(mounted.counters.clearedSelections).toBe(1);
});

it('keeps the price, target, brand and upgrade permission flags separate', () => {
	const mounted = mountRetail();
	const { ui, holder } = mounted;
	expect(ui.canUpdateSellingPrice).toBe(true);
	expect(ui.canUpdateInventoryTargets).toBe(true);
	expect(ui.canUpdateBrand).toBe(true);
	expect(ui.canUpgradeStore).toBe(true);

	holder.availability = allAvailability({
		updateStoreSellingPrice: false,
		upgradeStore: false
	});
	expect(ui.canUpdateSellingPrice).toBe(false);
	expect(ui.canUpdateInventoryTargets).toBe(true);
	expect(ui.canUpdateBrand).toBe(true);
	expect(ui.canUpgradeStore).toBe(false);
});

it('guards inventory-target edits on permission and forwards brand changes', async () => {
	const mounted = mountRetail();
	const { ui, commands, holder } = mounted;
	const store = holder.game!.stores[0]!;
	const product = store.products[0]!;

	holder.availability = allAvailability({ updateStoreInventoryTargets: false });
	expect(await ui.changeStoreProduct(store.id, product.productId, { targetStock: 10 })).toBeNull();
	expect(commands.updateStoreInventoryTargets).not.toHaveBeenCalled();

	ui.changeStoreProductBrand(store.id, product.productId, product.brandId);
	expect(commands.updateStoreProductBrand).toHaveBeenCalledWith(
		store.id,
		product.productId,
		product.brandId
	);
});
