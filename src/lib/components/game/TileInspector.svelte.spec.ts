import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TileInspector from './TileInspector.svelte';
import { getStoreArt } from '$lib/assets/gameArt';
import type { ArchetypeId, CityTile, OpeningForecast, OpeningOption, Store } from '$lib/game/types';

const tile: CityTile = {
	id: 'harbor-city-1-1',
	cityId: 'harbor-city',
	x: 1,
	y: 1,
	neighborhood: 'downtown',
	terrain: 'commercial',
	demand: 72,
	rent: 190,
	footTraffic: 76,
	customerFit: 70,
	locked: false
};

const store: Store = {
	id: 'store-1',
	name: 'Founding Store',
	archetypeId: 'convenience',
	location: 'Downtown (1, 1)',
	cityId: 'harbor-city',
	tileId: tile.id,
	mapX: 1,
	mapY: 1,
	daysOpen: 0,
	reputation: 50,
	stockHealth: 80,
	staffMorale: 75,
	staffCapacity: 70,
	localDemand: 72,
	competition: 15,
	managerQuality: 60
};

function renderInspector(
	overrides: Partial<{
		tile: CityTile | null;
		store: Store | null;
		openingOptions: OpeningOption[];
		gameStarted: boolean;
		disabledReason: string | null;
		onFoundStore: (archetypeId: ArchetypeId, tileId: string) => void;
		onOpenStore: (archetypeId: ArchetypeId, tileId: string) => void;
		onClose: () => void;
	}> = {}
) {
	const props = {
		tile,
		store: null,
		openingOptions: [],
		gameStarted: true,
		disabledReason: null,
		onFoundStore: vi.fn(),
		onOpenStore: vi.fn(),
		onClose: vi.fn(),
		...overrides
	};

	render(TileInspector, props);

	return props;
}

function forecastFor(archetypeId: ArchetypeId): OpeningForecast {
	const offset = ['convenience', 'boutique', 'electronics', 'grocery'].indexOf(archetypeId) + 1;

	return {
		tileId: tile.id,
		setupCost: 10_000 + offset * 500,
		projectedDailyRevenue: 1_000 + offset * 100,
		projectedDailyRent: tile.rent,
		demandScore: 70,
		customerFit: 75,
		risks: []
	};
}

describe('TileInspector storefront art', () => {
	it('does not show convenience storefront art for an empty selected tile', async () => {
		const convenienceArt = getStoreArt('convenience');

		renderInspector({ store: null });

		await expect
			.element(page.getByRole('img', { name: convenienceArt.alt }))
			.not.toBeInTheDocument();
	});

	it('shows electronics storefront art for an electronics store tile', async () => {
		const electronicsArt = getStoreArt('electronics');

		renderInspector({ store: { ...store, archetypeId: 'electronics' } });

		const image = page.getByRole('img', { name: electronicsArt.alt });
		await expect.element(image).toBeVisible();
		await expect.element(image).toHaveAttribute('src', electronicsArt.path);
	});
});

describe('TileInspector opening choices', () => {
	it('shows a disabled store type message when no opening options are available', async () => {
		renderInspector({ openingOptions: [], gameStarted: true });

		await expect.element(page.getByRole('heading', { name: 'Store type' })).toBeVisible();
		await expect.element(page.getByText('No store types available')).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Open store here' }))
			.not.toBeInTheDocument();
	});

	it('opens the selected expansion type only after confirmation', async () => {
		const electronicsArt = getStoreArt('electronics');
		const boutiqueArt = getStoreArt('boutique');
		const openingOptions: OpeningOption[] = [
			{ archetypeId: 'electronics', forecast: forecastFor('electronics'), disabledReason: null },
			{ archetypeId: 'boutique', forecast: forecastFor('boutique'), disabledReason: null },
			{ archetypeId: 'convenience', forecast: forecastFor('convenience'), disabledReason: null },
			{
				archetypeId: 'grocery',
				forecast: forecastFor('grocery'),
				disabledReason: 'Store limit reached'
			}
		];
		const onOpenStore = vi.fn();
		const onClose = vi.fn();

		renderInspector({ openingOptions, onOpenStore, onClose });

		const electronicsButton = page.getByRole('button', { name: /Open Electronics & Games here/ });
		await expect.element(electronicsButton).toBeVisible();
		await expect
			.element(electronicsButton.getByRole('img', { name: electronicsArt.alt }))
			.toHaveAttribute('src', electronicsArt.path);
		await expect
			.element(
				page
					.getByRole('button', { name: /Open Boutique Goods here/ })
					.getByRole('img', { name: boutiqueArt.alt })
			)
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Open Grocery Market here/ }))
			.toBeDisabled();
		await expect.element(page.getByText('Store limit reached')).toBeVisible();

		await electronicsButton.click();

		expect(onOpenStore).not.toHaveBeenCalled();
		const dialog = page.getByRole('dialog', { name: 'Confirm store opening' });
		await expect.element(dialog).toBeVisible();
		await expect
			.element(dialog.getByRole('heading', { name: 'Open Electronics & Games?' }))
			.toBeVisible();
		await expect
			.element(dialog.getByRole('img', { name: electronicsArt.alt }))
			.toHaveAttribute('src', electronicsArt.path);

		await dialog.getByRole('button', { name: 'Confirm opening' }).click();

		expect(onOpenStore).toHaveBeenCalledWith('electronics', tile.id);
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('cancels a pending store type confirmation without opening a store', async () => {
		const openingOptions: OpeningOption[] = [
			{ archetypeId: 'boutique', forecast: forecastFor('boutique'), disabledReason: null }
		];
		const onOpenStore = vi.fn();
		const onClose = vi.fn();

		renderInspector({ openingOptions, onOpenStore, onClose });

		await page.getByRole('button', { name: /Open Boutique Goods here/ }).click();
		const dialog = page.getByRole('dialog', { name: 'Confirm store opening' });
		await expect.element(dialog).toBeVisible();

		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

		expect(onOpenStore).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		await expect.element(dialog).not.toBeInTheDocument();
	});

	it('opens the selected founding type only after confirmation', async () => {
		const openingOptions: OpeningOption[] = [
			{ archetypeId: 'grocery', forecast: forecastFor('grocery'), disabledReason: null }
		];
		const onFoundStore = vi.fn();
		const onClose = vi.fn();

		renderInspector({ openingOptions, gameStarted: false, onFoundStore, onClose });

		await page.getByRole('button', { name: /Open Grocery Market here/ }).click();
		expect(onFoundStore).not.toHaveBeenCalled();

		await page
			.getByRole('dialog', { name: 'Confirm store opening' })
			.getByRole('button', { name: 'Confirm opening' })
			.click();

		expect(onFoundStore).toHaveBeenCalledWith('grocery', tile.id);
		expect(onClose).toHaveBeenCalledOnce();
	});
});
