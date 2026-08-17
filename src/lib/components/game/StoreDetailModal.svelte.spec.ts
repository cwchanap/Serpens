import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { GameState, Store } from '$lib/game/types';
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
			{ productId: 'snacks', stock: 40, reorderThreshold: 10, targetStock: 50, sellingPrice: 5 }
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
});
