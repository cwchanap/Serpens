import { describe, expect, it } from 'vitest';
import type { GameAlert, GameAlertKind } from './alerts';
import { selectCashRecovery } from './cashRecovery';
import { createNewGame } from './state';
import type { GameState, RecurringRoute, StaffMember } from './types';

function alertOf(kind: GameAlertKind, id: string): GameAlert {
	return { id, kind };
}

function staffMember(
	id: string,
	assignedStoreId: string | null,
	role: StaffMember['role'] = 'general'
): StaffMember {
	return {
		id,
		name: id,
		role,
		monthlySalary: 3000,
		skill: 50,
		morale: 50,
		assignedStoreId,
		hiredOnDay: 1,
		level: 1,
		xp: 0
	};
}

function route(id: string, state: RecurringRoute['state']): RecurringRoute {
	return {
		id,
		originCityId: 'industry-city',
		destinationCityId: 'harbor-city',
		materialId: 'bottled-water',
		capacity: 10,
		frequencyDays: 1,
		leadTimeDays: 1,
		transportCostPerUnit: 1,
		priority: 1,
		state,
		nextDispatchOnDay: 2
	};
}

function gameWith(staff: StaffMember[], routes: RecurringRoute[] = []): GameState {
	const game = createNewGame('convenience', 1);
	return {
		...game,
		staff,
		logistics: { ...game.logistics, recurringRoutes: routes }
	};
}

const runway = alertOf('lowCashRunway', 'lowCashRunway');
const missed = alertOf('missedLoanPayment', 'missedLoanPayment:loan-1');
const stock = alertOf('store-stock', 'store-stock:store-1');

describe('selectCashRecovery', () => {
	it('returns null without a game or a same-day cash alert', () => {
		expect(selectCashRecovery(null, [runway])).toBeNull();
		expect(
			selectCashRecovery(gameWith([]), [
				stock,
				alertOf('covenantRisk', 'covenantRisk'),
				alertOf('upcomingLoanPayment', 'upcomingLoanPayment:loan-1')
			])
		).toBeNull();
	});

	it('orders steps as restock, finance, staff cost, then routes', () => {
		// store-1 is short a manager, which idle general hands cannot fill.
		const plan = selectCashRecovery(
			gameWith(
				[staffMember('a', 'store-1'), staffMember('b', null), staffMember('c', null)],
				[route('r1', 'active'), route('r2', 'paused'), route('r3', 'active')]
			),
			[runway, stock]
		);

		expect(plan).toEqual({
			alert: runway,
			steps: [
				{ kind: 'restock', alert: stock },
				{ kind: 'finance', alert: runway },
				{ kind: 'release-idle-staff', count: 2 },
				{ kind: 'pause-routes', count: 2 }
			]
		});
	});

	it('anchors on the first cash alert in priority order', () => {
		const plan = selectCashRecovery(gameWith([]), [missed, runway]);

		expect(plan?.alert).toBe(missed);
		expect(plan?.steps).toEqual([{ kind: 'finance', alert: missed }]);
	});

	it('assigns idle staff who can fill a store shortage and releases only the surplus', () => {
		// The fixture's store-1 needs one manager and one general hand.
		const plan = selectCashRecovery(
			gameWith([
				staffMember('a', 'store-1'),
				staffMember('m', null, 'manager'),
				staffMember('b', null)
			]),
			[runway]
		);

		expect(plan?.steps).toEqual([
			{ kind: 'assign-idle-staff', count: 1 },
			{ kind: 'finance', alert: runway },
			{ kind: 'release-idle-staff', count: 1 }
		]);
	});

	it('does not suggest cutting staff when every idle member fills a shortage', () => {
		const plan = selectCashRecovery(
			gameWith([staffMember('m', null, 'manager'), staffMember('g', null)]),
			[runway]
		);

		expect(plan?.steps).toEqual([
			{ kind: 'assign-idle-staff', count: 2 },
			{ kind: 'finance', alert: runway }
		]);
	});

	it('points at payroll when every staff member is assigned', () => {
		const plan = selectCashRecovery(gameWith([staffMember('a', 'store-1')]), [runway]);

		expect(plan?.steps).toEqual([{ kind: 'finance', alert: runway }, { kind: 'review-payroll' }]);
	});
});
