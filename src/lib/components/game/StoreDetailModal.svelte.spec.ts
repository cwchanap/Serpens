import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getProductDefinition } from '$lib/game/products';
import type { DailyProductReport, DailyStoreReport, GameState, Store } from '$lib/game/types';
import { createEmptyFinanceState } from '$lib/game/finance';
import { createNewGame } from '$lib/game/state';
import { createI18n } from '$lib/i18n';
import StoreDetailModal from './StoreDetailModal.svelte';

function store(): Store {
	return {
		id: 'store-1',
		level: 3,
		name: 'Corner Market',
		archetypeId: 'convenience',
		location: { neighborhoodId: 'downtown', x: 0, y: 0 },
		cityId: 'harbor-city',
		tileId: 'tile-1',
		mapX: 1,
		mapY: 1,
		daysOpen: 5,
		reputation: 60,
		stockHealth: 80,
		products: [
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 40 }],
				reorderThreshold: 10,
				targetStock: 50,
				sellingPrice: 5
			}
		],
		staffMorale: 70,
		staffCapacity: 2,
		localDemand: 50,
		competition: 20,
		managerQuality: 40
	};
}

function game(): GameState {
	const base = createNewGame('convenience', 1);

	return {
		...base,
		day: 5,
		cash: 5000,
		finance: createEmptyFinanceState(5),
		stores: [store()],
		staff: [],
		hiringCandidates: []
	};
}

function props() {
	return {
		game: game(),
		i18n: createI18n('en'),
		store: store(),
		staff: [],
		hiringCandidates: [],
		latestStoreReport: null,
		onUpdateStoreProduct: vi.fn(),
		onHireStaff: vi.fn(),
		onAssignStaff: vi.fn(),
		onUnassignStaff: vi.fn(),
		onClose: vi.fn(),
		onClickFeedback: vi.fn()
	};
}

function pressureReport(): DailyStoreReport {
	const definition = getProductDefinition('devices');
	const productReport: DailyProductReport = {
		productId: 'devices',
		name: definition.name,
		unitsSold: 2,
		demandMissed: 1,
		revenue: 408,
		costOfGoods: 360,
		grossMargin: 48,
		endingStock: 8,
		warehouseUnits: 0,
		warehouseValue: 0,
		importedUnits: 0,
		importCost: definition.importCost,
		importSpend: 0,
		oldestSellableAgeDays: 30,
		obsolescenceMultiplier: 0.55,
		baseSellingPrice: 240,
		effectiveSellingPrice: 204,
		markdownAmount: 72
	};

	return {
		storeId: 'store-1',
		revenue: 408,
		costOfGoods: 360,
		grossMargin: 48,
		operatingCosts: 120,
		importSpend: 0,
		netIncome: -72,
		customersServed: 2,
		demandMissed: 1,
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 50,
		staffMorale: 70,
		reputation: 60,
		marketPosition: 50,
		productReports: [productReport],
		inventoryLossExpense: 0,
		warnings: [],
		replenishment: null
	};
}

describe('StoreDetailModal', () => {
	it('opens on the Stock tab and switches to Staff', async () => {
		expect.assertions(3);
		render(StoreDetailModal, props());
		await expect.element(page.getByRole('dialog', { name: /corner market/i })).toBeVisible();
		await expect
			.element(page.getByRole('tab', { name: /stock/i }))
			.toHaveAttribute('aria-selected', 'true');
		await page.getByRole('tab', { name: /staff/i }).click();
		await expect
			.element(page.getByRole('tab', { name: /staff/i }))
			.toHaveAttribute('aria-selected', 'true');
	});

	it('closes via the close button', async () => {
		expect.assertions(1);
		const p = props();
		render(StoreDetailModal, p);
		await page.getByRole('button', { name: /close store details/i }).click();
		expect(p.onClose).toHaveBeenCalledTimes(1);
	});

	it('closes via the backdrop', async () => {
		expect.assertions(1);
		const p = props();
		render(StoreDetailModal, p);
		const backdrop = document.querySelector<HTMLButtonElement>('.backdrop-button')!;
		backdrop.click();
		expect(p.onClose).toHaveBeenCalledTimes(1);
	});

	it('moves to the next tab on ArrowRight and fires click feedback', async () => {
		expect.assertions(3);
		const p = props();
		render(StoreDetailModal, p);
		const stockTab = page.getByRole('tab', { name: /stock/i });
		await stockTab.click();
		p.onClickFeedback.mockClear();

		(document.activeElement ?? document.body).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
		);

		const productChainTab = page.getByRole('tab', { name: /product chain/i });
		await expect.element(productChainTab).toHaveAttribute('aria-selected', 'true');
		expect(p.onClickFeedback).toHaveBeenCalledTimes(1);
		expect(document.activeElement).toBe(productChainTab.element());
	});

	it('wraps to the last tab on ArrowLeft from the first tab', async () => {
		expect.assertions(1);
		const p = props();
		render(StoreDetailModal, p);
		const stockTab = page.getByRole('tab', { name: /stock/i });
		await stockTab.click();

		(document.activeElement ?? document.body).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
		);

		await expect
			.element(page.getByRole('tab', { name: /staff/i }))
			.toHaveAttribute('aria-selected', 'true');
	});

	it('wraps to the first tab on ArrowDown from the last tab', async () => {
		expect.assertions(1);
		const p = props();
		render(StoreDetailModal, p);
		await page.getByRole('tab', { name: /staff/i }).click();

		(document.activeElement ?? document.body).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
		);

		await expect
			.element(page.getByRole('tab', { name: /stock/i }))
			.toHaveAttribute('aria-selected', 'true');
	});

	it('wraps to the last tab on ArrowUp from the first tab', async () => {
		expect.assertions(1);
		const p = props();
		render(StoreDetailModal, p);
		await page.getByRole('tab', { name: /stock/i }).click();

		(document.activeElement ?? document.body).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
		);

		await expect
			.element(page.getByRole('tab', { name: /staff/i }))
			.toHaveAttribute('aria-selected', 'true');
	});

	it('ignores non-arrow keys on the tablist', async () => {
		expect.assertions(2);
		const p = props();
		render(StoreDetailModal, p);
		await page.getByRole('tab', { name: /stock/i }).click();
		p.onClickFeedback.mockClear();

		(document.activeElement ?? document.body).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
		);

		await expect
			.element(page.getByRole('tab', { name: /stock/i }))
			.toHaveAttribute('aria-selected', 'true');
		expect(p.onClickFeedback).not.toHaveBeenCalled();
	});

	it('threads independent stock and staff capabilities to both tabs', async () => {
		expect.assertions(4);
		render(StoreDetailModal, {
			...props(),
			canUpdateSellingPrice: false,
			canUpdateInventoryTargets: false,
			canHireStaff: false,
			canAssignStaff: false,
			canUnassignStaff: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByRole('spinbutton', { name: /selling price/i })).toBeDisabled();
		await expect
			.element(page.getByRole('spinbutton', { name: /reorder threshold/i }))
			.toBeDisabled();
		await page.getByRole('tab', { name: /staff/i }).click();
		expect(document.querySelector('.detail-panel.active [role="status"]')?.textContent).toBe(
			'Unavailable in this challenge.'
		);
		await expect.element(page.getByRole('tab', { name: /stock/i })).toBeVisible();
	});

	it('summarizes markdown and obsolescence pressure in the detail warning area', async () => {
		expect.assertions(4);
		const pressureStore: Store = {
			...store(),
			products: [
				{
					productId: 'devices',
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 3,
					targetStock: 12,
					sellingPrice: 240
				}
			]
		};
		const p = props();
		render(StoreDetailModal, {
			...p,
			store: pressureStore,
			game: { ...p.game, stores: [pressureStore] },
			latestStoreReport: pressureReport()
		});

		const summary = page.getByTestId('product-pressure-summary');
		await expect.element(summary).toBeVisible();
		await expect.element(summary).toHaveTextContent(/Devices.*obsolescence.*55%/i);
		await expect.element(summary).toHaveTextContent(/Devices.*markdown.*\$72/i);
		await expect.element(summary).toHaveAttribute('role', 'status');
	});
});
