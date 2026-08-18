import type { ComponentProps } from 'svelte';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
	DailyProductReport,
	DailyReport,
	DailyStoreReport,
	ProductId,
	StoreProductPatch
} from '$lib/game/types';
import StoreStockTable from './StoreStockTable.svelte';
import SupplyAdvisor from './SupplyAdvisor.svelte';

describe('current product/report boundary contracts', () => {
	it('uses ProductId for retail stock and planner props', () => {
		expect(true).toBe(true);
		type StockProps = ComponentProps<typeof StoreStockTable>;
		type PlannerProps = ComponentProps<typeof SupplyAdvisor>;

		expectTypeOf<StockProps['onUpdate']>().toEqualTypeOf<
			(storeId: string, productId: ProductId, patch: StoreProductPatch) => void
		>();
		expectTypeOf<StockProps['allowedProductIds']>().toEqualTypeOf<
			readonly ProductId[] | undefined
		>();
		expectTypeOf<PlannerProps['productIds']>().toEqualTypeOf<readonly ProductId[]>();
		expectTypeOf<PlannerProps['selectedProductId']>().toEqualTypeOf<ProductId | null>();
		expectTypeOf<PlannerProps['onSelectProduct']>().toEqualTypeOf<(productId: ProductId) => void>();
	});

	it('requires every schema-17 product and inventory-loss report field', () => {
		expect(true).toBe(true);
		expectTypeOf<DailyProductReport['wasteUnits']>().toEqualTypeOf<number>();
		expectTypeOf<DailyProductReport['wasteValue']>().toEqualTypeOf<number>();
		expectTypeOf<DailyProductReport['shrinkUnits']>().toEqualTypeOf<number>();
		expectTypeOf<DailyProductReport['shrinkValue']>().toEqualTypeOf<number>();
		expectTypeOf<DailyProductReport['stockoutLostDemand']>().toEqualTypeOf<number>();
		expectTypeOf<DailyProductReport['averageAgeDays']>().toEqualTypeOf<number | null>();
		expectTypeOf<DailyProductReport['oldestSellableAgeDays']>().toEqualTypeOf<number | null>();
		expectTypeOf<DailyProductReport['trendMultiplier']>().toEqualTypeOf<number>();
		expectTypeOf<DailyProductReport['obsolescenceMultiplier']>().toEqualTypeOf<number>();
		expectTypeOf<DailyProductReport['baseSellingPrice']>().toEqualTypeOf<number>();
		expectTypeOf<DailyProductReport['effectiveSellingPrice']>().toEqualTypeOf<number>();
		expectTypeOf<DailyProductReport['markdownAmount']>().toEqualTypeOf<number>();
		expectTypeOf<DailyStoreReport['inventoryLossExpense']>().toEqualTypeOf<number>();
		expectTypeOf<DailyReport['inventoryLossExpense']>().toEqualTypeOf<number>();
	});
});
