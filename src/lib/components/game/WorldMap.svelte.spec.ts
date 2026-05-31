import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { WORLD_CITY_CATALOG, type WorldCityStatus } from '$lib/game/world';
import WorldMap from './WorldMap.svelte';

function status(cityId: string, state: WorldCityStatus['state']): WorldCityStatus {
	const city = WORLD_CITY_CATALOG.find((candidate) => candidate.id === cityId)!;
	return {
		city,
		state,
		canOpen: state === 'revealed',
		blockedReason: state === 'locked' ? city.unlockRequirement : null,
		storeCount: city.kind === 'retail' && state === 'opened' ? 1 : 0,
		buildingCount: city.kind === 'industry' && state === 'opened' ? 2 : 0
	};
}

describe('WorldMap', () => {
	it('renders opened, revealed, and locked city nodes', async () => {
		expect.assertions(4);
		render(WorldMap, {
			statuses: [
				status('harbor-city', 'opened'),
				status('campus-junction', 'revealed'),
				status('garden-borough', 'locked')
			],
			selectedCityId: null,
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect.element(page.getByRole('region', { name: /world map/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^Harbor City$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^Campus Junction$/i })).toBeVisible();
		await expect.element(page.getByText(/reach 4 stores/i)).toBeVisible();
	});

	it('selects cities and opens a revealed city from the inspector', async () => {
		expect.assertions(4);
		const onSelectCity = vi.fn();
		const onOpenCity = vi.fn();
		const onCloseInspector = vi.fn();
		render(WorldMap, {
			statuses: [status('campus-junction', 'revealed')],
			selectedCityId: 'campus-junction',
			onSelectCity,
			onOpenCity,
			onCloseInspector
		});

		await page.getByRole('button', { name: /^Campus Junction$/i }).click();
		expect(onSelectCity).toHaveBeenCalledWith('campus-junction');
		await expect.element(page.getByRole('dialog', { name: /city details/i })).toBeVisible();
		await page.getByRole('button', { name: /open for/i }).click();
		expect(onOpenCity).toHaveBeenCalledWith('campus-junction');
		await page.getByRole('button', { name: /close city details/i }).click();
		expect(onCloseInspector).toHaveBeenCalledTimes(1);
	});

	it('disables opening when a revealed city is unaffordable', async () => {
		expect.assertions(1);
		render(WorldMap, {
			statuses: [{ ...status('campus-junction', 'revealed'), canOpen: false }],
			selectedCityId: 'campus-junction',
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /open for/i })).toBeDisabled();
	});
});
