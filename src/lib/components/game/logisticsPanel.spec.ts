import { describe, expect, it } from 'vitest';
import { createI18n } from '$lib/i18n';
import { MATERIALS } from '$lib/game/industry';
import type { RecurringRoute, TransferOrder } from '$lib/game/types';
import { createTwoIndustryCityGame } from '$lib/game/interCityLogistics.testUtils';
import { buildLogisticsPanelView } from './logisticsPanel';

function route(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
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
}

function transfer(overrides: Partial<TransferOrder> = {}): TransferOrder {
	return {
		id: 'transfer-1',
		source: { kind: 'manual' },
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		quantity: 4,
		createdOnDay: 7,
		dispatchedOnDay: 7,
		arrivalOnDay: 9,
		transportCost: 8,
		status: 'in-transit',
		...overrides
	};
}

describe('buildLogisticsPanelView', () => {
	it('keeps only current inventory-backed industry endpoints in world-catalog order', () => {
		const game = createTwoIndustryCityGame({ materials: false });
		const view = buildLogisticsPanelView(game, createI18n('en'));

		expect(view.cityOptions.map((option) => option.cityId)).toEqual([
			'industry-city',
			'breadbasket-basin'
		]);
		expect(view.cityOptions.map((option) => option.label)).toEqual([
			'Industry City',
			'Breadbasket Basin'
		]);
	});

	it('keeps every material selectable, including materials with zero current stock', () => {
		const game = createTwoIndustryCityGame({ materials: false });
		const view = buildLogisticsPanelView(game, createI18n('en'));

		expect(view.materialOptions).toHaveLength(Object.keys(MATERIALS).length);
		expect(view.materialOptions.find((option) => option.materialId === 'snacks')).toMatchObject({
			label: 'Snacks',
			stock: 0
		});
	});

	it('localizes route, in-transit, recent-transfer, and totals rows from read models', () => {
		const base = createTwoIndustryCityGame();
		const game = {
			...base,
			logistics: {
				...base.logistics,
				recurringRoutes: [route()],
				transferOrders: [
					transfer(),
					transfer({
						id: 'transfer-2',
						source: { kind: 'recurring-route', routeId: 'route-1' },
						quantity: 6,
						status: 'delivered',
						arrivalOnDay: 8,
						transportCost: 12
					})
				]
			}
		};
		const view = buildLogisticsPanelView(game, createI18n('en'));

		expect(view.routes).toHaveLength(1);
		expect(view.routes[0]).toMatchObject({
			routeId: 'route-1',
			originLabel: 'Industry City',
			destinationLabel: 'Breadbasket Basin',
			materialLabel: 'Water',
			condition: 'awaiting-dispatch',
			conditionLabel: 'Awaiting dispatch',
			inTransitQuantity: 0,
			deliveredUnits: 6,
			transportCost: 12
		});
		expect(view.inTransit).toHaveLength(1);
		expect(view.inTransit[0]).toMatchObject({
			destinationLabel: 'Breadbasket Basin',
			materialLabel: 'Water',
			quantity: 4,
			earliestArrivalOnDay: 9
		});
		expect(view.recentTransfers[0]).toMatchObject({
			id: 'transfer-2',
			statusLabel: 'Delivered',
			originLabel: 'Industry City'
		});
		expect(view.totals).toEqual({ deliveredUnits: 6, transportCost: 20 });
	});

	it('returns explicit empty/read-only sections without inventing rows', () => {
		const view = buildLogisticsPanelView(
			createTwoIndustryCityGame({ materials: false }),
			createI18n('en')
		);

		expect(view.routes).toEqual([]);
		expect(view.inTransit).toEqual([]);
		expect(view.recentTransfers).toEqual([]);
		expect(view.totals).toEqual({ deliveredUnits: 0, transportCost: 0 });
	});
});
