import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { WORLD_CITY_CATALOG } from '$lib/game/worldCatalog';
import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
import type { RecurringRoute } from '$lib/game/types';
import WorldLogisticsRoutes from './WorldLogisticsRoutes.svelte';

function route(overrides: Partial<RecurringRoute> = {}): RouteOperationalSummary {
	const definition: RecurringRoute = {
		id: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 30,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 7,
		...overrides
	};

	return {
		route: definition,
		inTransitQuantity: 8,
		latestAttempt: null,
		utilization: null,
		unusedCapacity: 0,
		unmetDestinationNeed: 0,
		deliveredUnits: 12,
		transportCost: 24,
		condition: 'normal'
	};
}

describe('WorldLogisticsRoutes', () => {
	it('renders active and paused connections with directional arrows and pause semantics', async () => {
		expect.assertions(10);
		render(WorldLogisticsRoutes, {
			routes: [
				route(),
				route({
					id: 'route-2',
					state: 'paused',
					originCityId: 'breadbasket-basin',
					destinationCityId: 'industry-city'
				})
			],
			cities: WORLD_CITY_CATALOG,
			selectedRouteId: null
		});

		const activeGroup = page.getByTestId('world-logistics-route-route-1');
		const pausedGroup = page.getByTestId('world-logistics-route-route-2');
		await expect.element(activeGroup).toBeVisible();
		await expect.element(pausedGroup).toBeVisible();
		await expect.element(activeGroup).toHaveAttribute('data-state', 'active');
		await expect.element(pausedGroup).toHaveAttribute('data-state', 'paused');
		await expect
			.element(activeGroup)
			.toHaveAttribute('data-direction', 'industry-city-to-breadbasket-basin');
		await expect
			.element(pausedGroup)
			.toHaveAttribute('data-direction', 'breadbasket-basin-to-industry-city');
		const activeLine = activeGroup.element().querySelector('line');
		const pausedLine = pausedGroup.element().querySelector('line');
		expect(activeLine?.getAttribute('marker-end')).toBe('url(#world-logistics-route-arrow)');
		expect(pausedLine?.getAttribute('marker-end')).toBe('url(#world-logistics-route-arrow)');
		expect(activeLine?.getAttribute('stroke-dasharray')).not.toBe('6 4');
		expect(pausedLine?.getAttribute('stroke-dasharray')).toBe('6 4');
	});

	it('marks the selected route and forwards optional pointer selection', async () => {
		expect.assertions(4);
		const onSelectRoute = vi.fn();
		render(WorldLogisticsRoutes, {
			routes: [route(), route({ id: 'route-2' })],
			cities: WORLD_CITY_CATALOG,
			selectedRouteId: 'route-2',
			onSelectRoute
		});

		await expect
			.element(page.getByTestId('world-logistics-route-route-2'))
			.toHaveAttribute('data-selected', 'true');
		await expect
			.element(page.getByTestId('world-logistics-route-route-1'))
			.toHaveAttribute('data-selected', 'false');
		page
			.getByTestId('world-logistics-route-route-2')
			.element()
			.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onSelectRoute).toHaveBeenCalledWith('route-2');
		expect(onSelectRoute).toHaveBeenCalledTimes(1);
	});

	it('forwards Enter and Space keydown events to the selection callback', () => {
		expect.assertions(2);
		const onSelectRoute = vi.fn();
		render(WorldLogisticsRoutes, {
			routes: [route()],
			cities: WORLD_CITY_CATALOG,
			selectedRouteId: null,
			onSelectRoute
		});

		const group = page.getByTestId('world-logistics-route-route-1').element();
		group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(onSelectRoute).toHaveBeenCalledWith('route-1');

		group.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		expect(onSelectRoute).toHaveBeenCalledTimes(2);
	});

	it('ignores keydown events for other keys', () => {
		expect.assertions(1);
		const onSelectRoute = vi.fn();
		render(WorldLogisticsRoutes, {
			routes: [route()],
			cities: WORLD_CITY_CATALOG,
			selectedRouteId: null,
			onSelectRoute
		});

		const group = page.getByTestId('world-logistics-route-route-1').element();
		group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		expect(onSelectRoute).not.toHaveBeenCalled();
	});

	it('does not invoke a missing onSelectRoute callback on pointer or keyboard events', () => {
		expect.assertions(1);
		render(WorldLogisticsRoutes, {
			routes: [route()],
			cities: WORLD_CITY_CATALOG,
			selectedRouteId: null
		});

		const group = page.getByTestId('world-logistics-route-route-1').element();
		expect(() => {
			group.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		}).not.toThrow();
	});

	it('skips routes whose origin or destination city is not in the catalog', () => {
		expect.assertions(1);
		render(WorldLogisticsRoutes, {
			routes: [route({ originCityId: 'harbor-city', destinationCityId: 'breadbasket-basin' })],
			cities: WORLD_CITY_CATALOG.filter((city) => city.id !== 'breadbasket-basin'),
			selectedRouteId: null
		});

		expect(document.querySelector('[data-testid="world-logistics-route-route-1"]')).toBeNull();
	});
});
