import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import type { DailyRouteDispatchAttempt, RecurringRoute } from '$lib/game/types';
import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
import LogisticsRouteInspector from './LogisticsRouteInspector.svelte';

function summary(overrides: Partial<RouteOperationalSummary> = {}): RouteOperationalSummary {
	const route: RecurringRoute = {
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
		nextDispatchOnDay: 11
	};
	const latestAttempt: DailyRouteDispatchAttempt = {
		routeId: route.id,
		originCityId: route.originCityId,
		destinationCityId: route.destinationCityId,
		materialId: route.materialId,
		destinationNeed: 20,
		capacity: 16,
		availableOriginStock: 30,
		dispatchedQuantity: 16,
		unusedCapacity: 0,
		unmetDestinationNeed: 4,
		transportCost: 32,
		transferOrderId: 'transfer-1'
	};

	return {
		route,
		inTransitQuantity: 8,
		latestAttempt,
		utilization: 1,
		unusedCapacity: 0,
		unmetDestinationNeed: 4,
		deliveredUnits: 42,
		transportCost: 84,
		condition: 'route-capacity-constrained',
		...overrides
	};
}

describe('LogisticsRouteInspector', () => {
	it('renders route identity, schedule, latest attempt, totals, utilization, and condition', async () => {
		expect.assertions(17);
		const routeSummary = summary();
		render(LogisticsRouteInspector, {
			route: routeSummary,
			i18n: createI18n('en'),
			onManageRoute: vi.fn(),
			onClose: vi.fn()
		});

		await expect
			.element(page.getByRole('heading', { name: 'Industry City → Breadbasket Basin' }))
			.toBeVisible();
		await expect.element(page.getByText('Water', { exact: true }).nth(0)).toBeVisible();
		await expect.element(page.getByText('Active', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Every 3 days', { exact: true })).toBeVisible();
		await expect.element(page.getByText('2 days', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Day 11', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Destination need', { exact: true })).toBeVisible();
		await expect
			.element(page.getByTestId('route-attempt-destination-need'))
			.toHaveTextContent('20');
		await expect.element(page.getByTestId('route-attempt-capacity')).toHaveTextContent('16');
		await expect.element(page.getByTestId('route-attempt-dispatched')).toHaveTextContent('16');
		await expect.element(page.getByTestId('route-attempt-unused-capacity')).toHaveTextContent('0');
		await expect.element(page.getByTestId('route-attempt-unmet-need')).toHaveTextContent('4');
		await expect.element(page.getByTestId('route-utilization')).toHaveTextContent('100%');
		await expect.element(page.getByTestId('route-delivered-total')).toHaveTextContent('42');
		await expect.element(page.getByTestId('route-in-transit-total')).toHaveTextContent('8');
		await expect
			.element(page.getByText('Route capacity constrained', { exact: true }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Manage route' })).toBeVisible();
	});

	it('forwards Manage route with the current route id', async () => {
		expect.assertions(1);
		const onManageRoute = vi.fn();
		render(LogisticsRouteInspector, {
			route: summary(),
			i18n: createI18n('en'),
			onManageRoute,
			onClose: vi.fn()
		});

		await page.getByRole('button', { name: 'Manage route' }).click();
		expect(onManageRoute).toHaveBeenCalledWith('route-1');
	});

	it('shows the explicit empty latest-attempt state without inventing metrics', async () => {
		expect.assertions(3);
		render(LogisticsRouteInspector, {
			route: summary({
				latestAttempt: null,
				utilization: null,
				condition: 'awaiting-dispatch'
			}),
			i18n: createI18n('en'),
			onManageRoute: vi.fn(),
			onClose: vi.fn()
		});

		await expect
			.element(page.getByText('No dispatch attempt recorded yet.', { exact: true }))
			.toBeVisible();
		await expect.element(page.getByTestId('route-utilization')).toHaveTextContent('—');
		await expect.element(page.getByText('Awaiting dispatch', { exact: true })).toBeVisible();
	});

	it('forwards Close with the close button', async () => {
		expect.assertions(1);
		const onClose = vi.fn();
		render(LogisticsRouteInspector, {
			route: summary(),
			i18n: createI18n('en'),
			onManageRoute: vi.fn(),
			onClose
		});

		await page.getByRole('button', { name: /close/i }).click();
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
