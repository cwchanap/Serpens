import { describe, expect, test } from 'vitest';
import {
	createRecurringRoute,
	dispatchManualTransfer,
	getDestinationTransferNeed,
	quoteInterCityTransfer,
	removeRecurringRoute,
	updateRecurringRoute
} from './interCityLogistics';
import { selectLogisticsTotals, selectRecentTransfers } from './logisticsReadModels';
import { simulateDay } from './simulateDay';
import { createNewGame } from './state';
import type {
	DailyReport,
	GameState,
	IndustrialBuilding,
	TransferOrder,
	WorldCityId
} from './types';
import { openWorldCity, refreshWorldProgress } from './world';

function createFixtureBuilding(
	id: string,
	cityId: WorldCityId,
	typeId: IndustrialBuilding['typeId'],
	mapX: number
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId,
		tileId: `${cityId}-fixture-${mapX}`,
		mapX,
		mapY: 1,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

function getWater(game: GameState, cityId: WorldCityId): number {
	const inventory = game.cityInventories.find((candidate) => candidate.cityId === cityId);
	if (!inventory) {
		throw new Error(`Expected ${cityId} to have a city inventory`);
	}

	return inventory.materials.water ?? 0;
}

function getOrder(game: GameState, orderId: string): TransferOrder {
	const order = game.logistics.transferOrders.find((candidate) => candidate.id === orderId);
	if (!order) {
		throw new Error(`Expected ${orderId} to exist`);
	}

	return order;
}

function getLatestReport(game: GameState): DailyReport {
	const report = game.reports.at(-1);
	if (!report) {
		throw new Error('Expected a daily report');
	}

	return report;
}

function withoutRecurringRoutes(game: GameState): GameState {
	return {
		...game,
		logistics: {
			...game.logistics,
			recurringRoutes: []
		}
	};
}

describe('inter-city logistics lifecycle', () => {
	test('moves manual and recurring industry inventory across multiple simulated days', () => {
		const base = createNewGame('convenience', 20260806);
		const revealPrerequisite = {
			...base,
			cash: 100_000,
			industrialBuildings: [
				createFixtureBuilding('fixture-origin-warehouse', 'industry-city', 'warehouse', 1),
				createFixtureBuilding('fixture-origin-water-pump', 'industry-city', 'water-pump', 2)
			]
		};
		const revealed = refreshWorldProgress(revealPrerequisite);
		expect(revealed.world.revealedCityIds).toContain('breadbasket-basin');

		const opened = openWorldCity(revealed, 'breadbasket-basin');
		expect(opened.world.openedCityIds).toContain('breadbasket-basin');

		const game: GameState = {
			...opened,
			day: 7,
			cash: 100_000,
			industrialBuildings: [
				createFixtureBuilding('fixture-origin-warehouse', 'industry-city', 'warehouse', 1),
				createFixtureBuilding('fixture-destination-warehouse', 'breadbasket-basin', 'warehouse', 1)
			],
			cityInventories: opened.cityInventories.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, materials: { water: 100 } }
					: inventory.cityId === 'breadbasket-basin'
						? { ...inventory, materials: {} }
						: inventory
			)
		};

		expect(getWater(game, 'industry-city')).toBe(100);
		expect(getWater(game, 'breadbasket-basin')).toBe(0);
		expect(getDestinationTransferNeed(game, 'breadbasket-basin')).toBe(200);

		const manualInput = {
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			quantity: 10
		} as const;
		const quote = quoteInterCityTransfer(game, manualInput);
		expect(quote).toEqual({
			ok: true,
			quote: { leadTimeDays: 2, transportCostPerUnit: 2, transportCost: 20 }
		});
		if (!quote.ok) {
			throw new Error(`Expected manual transfer quote, received ${quote.reason}`);
		}

		const manualDispatch = dispatchManualTransfer(game, manualInput);
		expect(manualDispatch.ok).toBe(true);
		if (!manualDispatch.ok) {
			throw new Error(`Expected manual dispatch, received ${manualDispatch.reason}`);
		}

		let currentGame = manualDispatch.game;
		expect(manualDispatch.order).toEqual({
			id: 'transfer-1',
			source: { kind: 'manual' },
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			quantity: 10,
			createdOnDay: 7,
			dispatchedOnDay: 7,
			arrivalOnDay: 9,
			transportCost: quote.quote.transportCost,
			status: 'in-transit'
		});
		expect(currentGame.cash).toBe(99_980);
		expect(getWater(currentGame, 'industry-city')).toBe(90);
		expect(getWater(currentGame, 'breadbasket-basin')).toBe(0);
		expect(getDestinationTransferNeed(currentGame, 'breadbasket-basin')).toBe(190);

		currentGame = simulateDay(currentGame);
		expect(currentGame.day).toBe(8);
		expect(getWater(currentGame, 'breadbasket-basin')).toBe(0);
		expect(getLatestReport(currentGame).logistics).toEqual({
			arrivals: [],
			routeDispatchAttempts: [],
			deliveredUnits: 0,
			scheduledTransportCost: 0
		});

		currentGame = simulateDay(currentGame);
		expect(currentGame.day).toBe(9);
		expect(getWater(currentGame, 'breadbasket-basin')).toBe(0);
		expect(getOrder(currentGame, 'transfer-1').status).toBe('in-transit');

		currentGame = simulateDay(currentGame);
		const manualArrivalReport = getLatestReport(currentGame);
		expect(currentGame.day).toBe(10);
		expect(manualArrivalReport.day).toBe(9);
		expect(manualArrivalReport.logistics).toEqual({
			arrivals: [
				{
					transferOrderId: 'transfer-1',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					quantity: 10
				}
			],
			routeDispatchAttempts: [],
			deliveredUnits: 10,
			scheduledTransportCost: 0
		});
		expect(manualArrivalReport.productionReport.overflowCost).toBe(0);
		expect(getOrder(currentGame, 'transfer-1').status).toBe('delivered');
		expect(getWater(currentGame, 'breadbasket-basin')).toBe(10);

		const routeCreation = createRecurringRoute(currentGame, {
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			capacity: 20,
			frequencyDays: 2,
			leadTimeDays: 2,
			transportCostPerUnit: 3,
			priority: 1
		});
		expect(routeCreation.ok).toBe(true);
		if (!routeCreation.ok) {
			throw new Error(`Expected recurring route, received ${routeCreation.reason}`);
		}
		expect(routeCreation.route).toMatchObject({ id: 'route-1', nextDispatchOnDay: 10 });

		const firstScheduledBaseline = simulateDay(withoutRecurringRoutes(routeCreation.game));
		currentGame = simulateDay(routeCreation.game);
		const firstScheduledReport = getLatestReport(currentGame);
		expect(firstScheduledReport.day).toBe(10);
		expect(firstScheduledReport.logistics).toEqual({
			arrivals: [],
			routeDispatchAttempts: [
				{
					routeId: 'route-1',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					destinationNeed: 190,
					capacity: 20,
					availableOriginStock: 90,
					dispatchedQuantity: 20,
					unusedCapacity: 0,
					unmetDestinationNeed: 170,
					transportCost: 60,
					transferOrderId: 'transfer-2'
				}
			],
			deliveredUnits: 0,
			scheduledTransportCost: 60
		});
		const firstScheduledBaselineReport = getLatestReport(firstScheduledBaseline);
		expect(firstScheduledReport.operatingCosts).toBe(
			firstScheduledBaselineReport.operatingCosts + 60
		);
		expect(firstScheduledReport.operatingCashFlow).toBe(
			firstScheduledBaselineReport.operatingCashFlow - 60
		);
		expect(firstScheduledReport.cashAfter).toBe(firstScheduledBaselineReport.cashAfter - 60);
		expect(currentGame.cash).toBe(firstScheduledBaseline.cash - 60);
		expect(getOrder(currentGame, 'transfer-2')).toEqual({
			id: 'transfer-2',
			source: { kind: 'recurring-route', routeId: 'route-1' },
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			quantity: 20,
			createdOnDay: 10,
			dispatchedOnDay: 10,
			arrivalOnDay: 12,
			transportCost: 60,
			status: 'in-transit'
		});
		expect(currentGame.logistics.recurringRoutes).toEqual([
			{ ...routeCreation.route, nextDispatchOnDay: 12 }
		]);
		expect(getWater(currentGame, 'industry-city')).toBe(70);
		expect(getDestinationTransferNeed(currentGame, 'breadbasket-basin')).toBe(170);

		const routeUpdate = updateRecurringRoute(currentGame, 'route-1', {
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			capacity: 7,
			frequencyDays: 3,
			leadTimeDays: 4,
			transportCostPerUnit: 5
		});
		expect(routeUpdate.ok).toBe(true);
		if (!routeUpdate.ok) {
			throw new Error(`Expected route update, received ${routeUpdate.reason}`);
		}
		expect(routeUpdate.route).toEqual({
			id: 'route-1',
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			capacity: 7,
			frequencyDays: 3,
			leadTimeDays: 4,
			transportCostPerUnit: 5,
			priority: 1,
			state: 'active',
			nextDispatchOnDay: 12
		});
		currentGame = routeUpdate.game;
		expect(getOrder(currentGame, 'transfer-2')).toEqual({
			id: 'transfer-2',
			source: { kind: 'recurring-route', routeId: 'route-1' },
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			quantity: 20,
			createdOnDay: 10,
			dispatchedOnDay: 10,
			arrivalOnDay: 12,
			transportCost: 60,
			status: 'in-transit'
		});

		currentGame = simulateDay(currentGame);
		expect(currentGame.day).toBe(12);
		expect(getLatestReport(currentGame).logistics).toEqual({
			arrivals: [],
			routeDispatchAttempts: [],
			deliveredUnits: 0,
			scheduledTransportCost: 0
		});

		const secondScheduledBaseline = simulateDay(withoutRecurringRoutes(currentGame));
		currentGame = simulateDay(currentGame);
		const secondScheduledReport = getLatestReport(currentGame);
		expect(secondScheduledReport.day).toBe(12);
		expect(secondScheduledReport.logistics).toEqual({
			arrivals: [
				{
					transferOrderId: 'transfer-2',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					quantity: 20
				}
			],
			routeDispatchAttempts: [
				{
					routeId: 'route-1',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					destinationNeed: 170,
					capacity: 7,
					availableOriginStock: 70,
					dispatchedQuantity: 7,
					unusedCapacity: 0,
					unmetDestinationNeed: 163,
					transportCost: 35,
					transferOrderId: 'transfer-3'
				}
			],
			deliveredUnits: 20,
			scheduledTransportCost: 35
		});
		const secondScheduledBaselineReport = getLatestReport(secondScheduledBaseline);
		expect(secondScheduledReport.operatingCosts).toBe(
			secondScheduledBaselineReport.operatingCosts + 35
		);
		expect(secondScheduledReport.operatingCashFlow).toBe(
			secondScheduledBaselineReport.operatingCashFlow - 35
		);
		expect(secondScheduledReport.cashAfter).toBe(secondScheduledBaselineReport.cashAfter - 35);
		expect(currentGame.cash).toBe(secondScheduledBaseline.cash - 35);
		expect(getOrder(currentGame, 'transfer-2')).toMatchObject({
			quantity: 20,
			arrivalOnDay: 12,
			transportCost: 60,
			status: 'delivered'
		});
		expect(getOrder(currentGame, 'transfer-3')).toEqual({
			id: 'transfer-3',
			source: { kind: 'recurring-route', routeId: 'route-1' },
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			quantity: 7,
			createdOnDay: 12,
			dispatchedOnDay: 12,
			arrivalOnDay: 16,
			transportCost: 35,
			status: 'in-transit'
		});
		expect(currentGame.logistics.recurringRoutes).toEqual([
			{ ...routeUpdate.route, nextDispatchOnDay: 15 }
		]);
		expect(getWater(currentGame, 'industry-city')).toBe(63);
		expect(getWater(currentGame, 'breadbasket-basin')).toBe(30);
		expect(getDestinationTransferNeed(currentGame, 'breadbasket-basin')).toBe(163);
		expect(
			currentGame.reports
				.filter((report) => report.logistics.routeDispatchAttempts.length > 0)
				.map((report) => ({
					day: report.day,
					dispatchedQuantity: report.logistics.routeDispatchAttempts[0]!.dispatchedQuantity,
					transferOrderId: report.logistics.routeDispatchAttempts[0]!.transferOrderId
				}))
		).toEqual([
			{ day: 10, dispatchedQuantity: 20, transferOrderId: 'transfer-2' },
			{ day: 12, dispatchedQuantity: 7, transferOrderId: 'transfer-3' }
		]);

		const routeRemoval = removeRecurringRoute(currentGame, 'route-1');
		expect(routeRemoval.ok).toBe(true);
		if (!routeRemoval.ok) {
			throw new Error('Expected route removal');
		}
		currentGame = routeRemoval.game;
		expect(currentGame.logistics.recurringRoutes).toEqual([]);
		expect(selectRecentTransfers(currentGame).map((order) => order.id)).toContain('transfer-3');

		currentGame = simulateDay(currentGame);
		currentGame = simulateDay(currentGame);
		currentGame = simulateDay(currentGame);
		expect(currentGame.day).toBe(16);
		expect(getLatestReport(currentGame).logistics.routeDispatchAttempts).toEqual([]);
		expect(getOrder(currentGame, 'transfer-3').status).toBe('in-transit');
		expect(getWater(currentGame, 'breadbasket-basin')).toBe(30);

		currentGame = simulateDay(currentGame);
		const removedRouteArrivalReport = getLatestReport(currentGame);
		expect(currentGame.day).toBe(17);
		expect(removedRouteArrivalReport.day).toBe(16);
		expect(removedRouteArrivalReport.logistics).toEqual({
			arrivals: [
				{
					transferOrderId: 'transfer-3',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					quantity: 7
				}
			],
			routeDispatchAttempts: [],
			deliveredUnits: 7,
			scheduledTransportCost: 0
		});
		expect(getWater(currentGame, 'industry-city')).toBe(63);
		expect(getWater(currentGame, 'breadbasket-basin')).toBe(37);
		expect(getDestinationTransferNeed(currentGame, 'breadbasket-basin')).toBe(163);
		expect(currentGame.logistics.transferOrders.map((order) => order.id)).toEqual([
			'transfer-1',
			'transfer-2',
			'transfer-3'
		]);
		expect(
			currentGame.logistics.transferOrders.every((order) => order.status === 'delivered')
		).toBe(true);
		expect(currentGame.logistics.nextTransferSequence).toBe(4);
		expect(selectRecentTransfers(currentGame).map((order) => order.id)).toEqual([
			'transfer-3',
			'transfer-2',
			'transfer-1'
		]);
		expect(selectLogisticsTotals(currentGame)).toEqual({ deliveredUnits: 37, transportCost: 115 });
	});
});
