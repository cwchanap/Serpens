import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TileInspector from './TileInspector.svelte';
import { SHOP_STOREFRONT_ALT, SHOP_STOREFRONT_PATH } from '$lib/assets/gameArt';
import type { ArchetypeId, CityTile, OpeningForecast, Store } from '$lib/game/types';

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
		forecast: OpeningForecast | null;
		recommendations: ArchetypeId[];
		gameStarted: boolean;
		canOpenStore: boolean;
		disabledReason: string | null;
	}> = {}
) {
	render(TileInspector, {
		tile,
		store: null,
		forecast: null,
		recommendations: [],
		gameStarted: true,
		canOpenStore: true,
		disabledReason: null,
		onFoundStore: vi.fn(),
		onOpenStore: vi.fn(),
		onClose: vi.fn(),
		...overrides
	});
}

describe('TileInspector storefront art', () => {
	it('does not show storefront art for an empty selected tile', async () => {
		renderInspector({ store: null });

		await expect
			.element(page.getByRole('img', { name: SHOP_STOREFRONT_ALT }))
			.not.toBeInTheDocument();
	});

	it('shows storefront art for an owned store tile', async () => {
		renderInspector({ store });

		const image = page.getByRole('img', { name: SHOP_STOREFRONT_ALT });
		await expect.element(image).toBeVisible();
		await expect.element(image).toHaveAttribute('src', SHOP_STOREFRONT_PATH);
	});
});
