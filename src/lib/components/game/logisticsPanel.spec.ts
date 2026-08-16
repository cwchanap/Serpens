import { describe, expect, it } from 'vitest';
import { createI18n } from '$lib/i18n';
import { MATERIALS } from '$lib/game/industry';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import { createRouteDispatchAttempt } from '$lib/game/logisticsReport.testUtils';
import type {
	DailyReport,
	DailyRouteDispatchAttempt,
	RecurringRoute,
	TransferOrder
} from '$lib/game/types';
import { createTwoIndustryCityGame } from '$lib/game/interCityLogistics.testUtils';
import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
import {
	applyRoutePreset,
	buildLogisticsPanelView,
	routePresetKey,
	type LogisticsRouteFormValues
} from './logisticsPanel';

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

	it('skips an opened industry city whose city inventory entry is missing', () => {
		const game = createTwoIndustryCityGame({ materials: false });
		const gameWithMissingInventory = {
			...game,
			cityInventories: game.cityInventories.filter(
				(inventory) => inventory.cityId !== 'breadbasket-basin'
			)
		};

		const view = buildLogisticsPanelView(gameWithMissingInventory, createI18n('en'));

		expect(view.cityOptions.map((option) => option.cityId)).toEqual(['industry-city']);
		expect(view.materialOptions.find((option) => option.materialId === 'water')?.stock).toBe(0);
	});

	it('localizes the latest dispatch attempt when a route has matching report evidence', () => {
		const base = createTwoIndustryCityGame();
		const activeRoute = route({ nextDispatchOnDay: 10 });
		const attempt = createRouteDispatchAttempt({
			routeId: 'route-1',
			materialId: 'water',
			destinationNeed: 20,
			capacity: 30,
			availableOriginStock: 50,
			dispatchedQuantity: 20,
			unusedCapacity: 10,
			unmetDestinationNeed: 0,
			transportCost: 40,
			transferOrderId: 'transfer-dispatch-1',
			baselineCapacity: 30
		});
		let reportTemplate: DailyReport | null = null;
		function reportWithAttempt(day: number, attempts: DailyRouteDispatchAttempt[]): DailyReport {
			if (!reportTemplate) {
				reportTemplate = simulateDay(createNewGame('convenience', 20260806)).reports[0]!;
			}
			return {
				...reportTemplate,
				day,
				logistics: {
					...reportTemplate.logistics,
					arrivals: [],
					routeDispatchAttempts: attempts,
					scheduledTransportCost: attempts.reduce((total, a) => total + a.transportCost, 0)
				}
			};
		}
		const game = {
			...base,
			logistics: {
				...base.logistics,
				recurringRoutes: [activeRoute]
			},
			reports: [reportWithAttempt(9, [attempt])]
		};

		const view = buildLogisticsPanelView(game, createI18n('en'));

		expect(view.routes).toHaveLength(1);
		expect(view.routes[0]).toMatchObject({
			routeId: 'route-1',
			condition: 'normal',
			latestAttempt: {
				originLabel: 'Industry City',
				destinationLabel: 'Breadbasket Basin',
				materialLabel: 'Water',
				dispatchedQuantity: 20,
				transferOrderId: 'transfer-dispatch-1'
			}
		});
	});

	it('treats null material quantities in city inventory as zero stock', () => {
		const base = createTwoIndustryCityGame({ materials: false });
		const game = {
			...base,
			cityInventories: [
				{
					cityId: 'industry-city' as const,
					materials: { water: null as unknown as number }
				},
				{
					cityId: 'breadbasket-basin' as const,
					materials: {}
				}
			]
		};

		const view = buildLogisticsPanelView(game, createI18n('en'));

		expect(view.materialOptions.find((option) => option.materialId === 'water')?.stock).toBe(0);
	});
});

describe('route presets', () => {
	const emptyRouteForm = (): LogisticsRouteFormValues => ({
		originCityId: '',
		destinationCityId: '',
		materialId: '',
		capacity: '',
		frequencyDays: '',
		leadTimeDays: '',
		transportCostPerUnit: '',
		priority: ''
	});

	it('converts a typed route preset once without overwriting user edits', () => {
		const preset: RecurringRouteInput = {
			originCityId: 'breadbasket-basin',
			destinationCityId: 'industry-city',
			materialId: 'grain',
			capacity: 12,
			frequencyDays: 1,
			leadTimeDays: 2,
			transportCostPerUnit: 2,
			priority: 0
		};
		const first = applyRoutePreset(emptyRouteForm(), preset, null);
		expect(first.values).toMatchObject({
			originCityId: 'breadbasket-basin',
			capacity: '12',
			leadTimeDays: '2'
		});
		expect(first.appliedKey).toBe(routePresetKey(preset));

		const userEdited = { ...first.values, capacity: '9' };
		const repeated = applyRoutePreset(userEdited, preset, first.appliedKey);
		expect(repeated.values.capacity).toBe('9');

		const changed = applyRoutePreset(
			repeated.values,
			{ ...preset, capacity: 16, priority: 1 },
			repeated.appliedKey
		);
		expect(changed.values).toMatchObject({ capacity: '16', priority: '1' });
	});
});
