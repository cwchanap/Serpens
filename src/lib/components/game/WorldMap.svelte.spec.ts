import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
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
			i18n: createI18n('en'),
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

	it('renders the regional background and image markers for city states', async () => {
		expect.assertions(9);
		render(WorldMap, {
			statuses: [
				status('harbor-city', 'opened'),
				status('industry-city', 'opened'),
				status('garden-borough', 'locked')
			],
			i18n: createI18n('en'),
			selectedCityId: null,
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		const background = page.getByTestId('world-map-background');
		await expect.element(background).toBeVisible();
		await expect.element(background).toHaveAttribute('src', '/assets/game/world/regional-map.png');

		const retailMarker = page.getByTestId('world-city-marker-harbor-city');
		const industryMarker = page.getByTestId('world-city-marker-industry-city');
		const lockedMarker = page.getByTestId('world-city-marker-garden-borough');

		await expect.element(retailMarker).toHaveAttribute('src', '/assets/game/world/city-retail.png');
		await expect
			.element(industryMarker)
			.toHaveAttribute('src', '/assets/game/world/city-industry.png');
		await expect.element(lockedMarker).toHaveAttribute('src', '/assets/game/world/city-locked.png');
		await expect.element(retailMarker).toHaveAttribute('aria-hidden', 'true');
		await expect.element(industryMarker).toHaveAttribute('aria-hidden', 'true');
		await expect.element(lockedMarker).toHaveAttribute('aria-hidden', 'true');

		const map = page.getByRole('region', { name: /world map/i });
		const viewport = map.element().querySelector('.world-map-viewport');
		expect(viewport).toBeTruthy();
	});

	it('selects cities and opens a revealed city from the inspector', async () => {
		expect.assertions(4);
		const onSelectCity = vi.fn();
		const onOpenCity = vi.fn();
		const onCloseInspector = vi.fn();
		render(WorldMap, {
			statuses: [status('campus-junction', 'revealed')],
			i18n: createI18n('en'),
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
			i18n: createI18n('en'),
			selectedCityId: 'campus-junction',
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /open for/i })).toBeDisabled();
	});

	it('shows industrial city eyebrow and store/building counts for an opened industry city', async () => {
		expect.assertions(3);
		render(WorldMap, {
			statuses: [status('industry-city', 'opened')],
			i18n: createI18n('en'),
			selectedCityId: 'industry-city',
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect.element(page.getByText('Industrial city')).toBeVisible();
		await expect.element(page.getByText(/2 industrial buildings/i)).toBeVisible();
		await expect.element(page.getByRole('button', { name: /open for/i })).not.toBeInTheDocument();
	});

	it('shows a blocked reason for a revealed city that cannot be opened', async () => {
		expect.assertions(3);
		render(WorldMap, {
			statuses: [
				{
					...status('campus-junction', 'revealed'),
					canOpen: false,
					blockedReason: 'Opening this city requires 18,000 cash.'
				}
			],
			i18n: createI18n('en'),
			selectedCityId: 'campus-junction',
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		const openButton = page.getByRole('button', { name: /open for/i });
		await expect.element(openButton).toBeDisabled();
		await expect
			.element(openButton)
			.toHaveAttribute('aria-describedby', 'world-city-campus-junction-reason');
		await expect.element(page.getByText('Opening this city requires 18,000 cash.')).toBeVisible();
	});

	it('shows a blocked reason in the inspector for a locked city', async () => {
		expect.assertions(2);
		render(WorldMap, {
			statuses: [status('garden-borough', 'locked')],
			i18n: createI18n('en'),
			selectedCityId: 'garden-borough',
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		const inspector = page.getByRole('dialog', { name: /city details/i });
		await expect.element(inspector).toBeVisible();
		await expect.element(inspector.getByText(/reach 4 stores/i)).toBeVisible();
	});

	it('renders no inspector when the selected city id does not match any status', async () => {
		expect.assertions(1);
		render(WorldMap, {
			statuses: [status('harbor-city', 'opened')],
			i18n: createI18n('en'),
			selectedCityId: 'nonexistent-city',
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect
			.element(page.getByRole('dialog', { name: /city details/i }))
			.not.toBeInTheDocument();
	});

	it('reconciles city nodes and inspector when rerendered with changed statuses', async () => {
		expect.assertions(3);

		const result = render(WorldMap, {
			statuses: [status('harbor-city', 'opened')],
			i18n: createI18n('en'),
			selectedCityId: 'harbor-city',
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect.element(page.getByText(/1 stores/i)).toBeVisible();

		await result.rerender({
			statuses: [status('harbor-city', 'opened'), status('campus-junction', 'revealed')],
			i18n: createI18n('en'),
			selectedCityId: 'harbor-city',
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect.element(page.getByText(/1 stores/i)).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^Campus Junction$/i })).toBeVisible();
	});

	it('renders a localized fixed label outside English', async () => {
		expect.assertions(2);

		render(WorldMap, {
			statuses: [status('harbor-city', 'opened')],
			i18n: createI18n('ja'),
			selectedCityId: null,
			onSelectCity: vi.fn(),
			onOpenCity: vi.fn(),
			onCloseInspector: vi.fn()
		});

		await expect.element(page.getByRole('region', { name: 'ワールドマップ' })).toBeVisible();
		await expect.element(page.getByRole('region', { name: /world map/i })).not.toBeInTheDocument();
	});
});
