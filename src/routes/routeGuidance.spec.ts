import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import { simulateDay } from '$lib/game/simulateDay';
import type { GameAlert } from '$lib/game/alerts';
import {
	resolveGuidanceHandoff,
	selectRouteGuidance,
	type RouteGuidanceAction
} from './routeGuidance';

const game = createNewGame('convenience', 1);
const cashAlert: GameAlert = { id: 'runway', kind: 'lowCashRunway', managementPanelId: 'finance' };
const stockAlert: GameAlert = { id: 'stock', kind: 'store-stock', storeId: game.stores[0]!.id };
const base = {
	game,
	alerts: [cashAlert, stockAlert],
	playMode: 'sandbox' as const,
	scenarioId: null,
	openingDismissed: false
};
let established = game;
for (let day = 0; day < 8; day++) established = simulateDay(established);

// Opening and recovery must be exclusive. Dismissing the opening card cannot
// reveal a second cash card for the same alert while still in the opening week.
describe('route guidance eligibility', () => {
	it('shows opening guidance only for a live opening company', () => {
		expect(selectRouteGuidance(base)).toMatchObject({
			openingGuidanceHint: { kind: 'cash-risk', alert: cashAlert },
			showOpeningGuidance: true,
			cashRecoveryPlan: null
		});
		expect(selectRouteGuidance({ ...base, game: null })).toEqual({
			openingGuidanceHint: null,
			showOpeningGuidance: false,
			cashRecoveryPlan: null
		});
	});
	it('does not replace dismissed opening guidance with cash recovery', () => {
		expect(selectRouteGuidance({ ...base, openingDismissed: true })).toMatchObject({
			showOpeningGuidance: false,
			cashRecoveryPlan: null
		});
	});
	it('hands an established sandbox company to the existing recovery selector', () => {
		const guidance = selectRouteGuidance({ ...base, game: established, openingDismissed: true });
		expect(guidance.showOpeningGuidance).toBe(false);
		expect(guidance.cashRecoveryPlan?.alert).toBe(cashAlert);
		expect(guidance.cashRecoveryPlan?.steps.slice(0, 2)).toEqual([
			{ kind: 'restock', alert: stockAlert },
			{ kind: 'finance', alert: cashAlert }
		]);
	});
	it('keeps First Profit opening guidance for the entire run and ignores sandbox dismissal', () => {
		expect(
			selectRouteGuidance({
				...base,
				game: established,
				playMode: 'scenario',
				scenarioId: 'first-profit',
				openingDismissed: true
			})
		).toMatchObject({ showOpeningGuidance: true, cashRecoveryPlan: null });
	});
	it.each([null, 'two-city-supply-run'])(
		'never shows sandbox guidance in another scenario %s',
		(scenarioId) => {
			expect(
				selectRouteGuidance({ ...base, game: established, playMode: 'scenario', scenarioId })
			).toMatchObject({ showOpeningGuidance: false, cashRecoveryPlan: null });
		}
	);
	it('does not turn structural finance noise into a recovery plan', () => {
		expect(
			selectRouteGuidance({
				...base,
				game: established,
				alerts: [{ id: 'covenant', kind: 'covenantRisk' }]
			}).cashRecoveryPlan
		).toBeNull();
	});
	it('keys successive crises by their actual alert kind without replacing the alert object', () => {
		const missed: GameAlert = { id: 'missed', kind: 'missedLoanPayment' };
		expect(
			selectRouteGuidance({ ...base, game: established, alerts: [] }).cashRecoveryPlan
		).toBeNull();
		expect(
			selectRouteGuidance({ ...base, game: established, alerts: [missed] }).cashRecoveryPlan?.alert
		).toBe(missed);
	});
});

describe('guidance action handoffs', () => {
	it.each(['cash-risk', 'stock-recovery', 'restock', 'finance'] as const)(
		'preserves the live alert for %s',
		(kind) => {
			expect(resolveGuidanceHandoff({ kind, alert: cashAlert })).toEqual({
				kind: 'alert',
				alert: cashAlert
			});
		}
	);
	it.each([
		[{ kind: 'first-result' }, 'dashboard'],
		[{ kind: 'result-evidence' }, 'dashboard'],
		[{ kind: 'assign-idle-staff', count: 1 }, 'staff'],
		[{ kind: 'release-idle-staff', count: 2 }, 'staff'],
		[{ kind: 'review-payroll' }, 'staff'],
		[{ kind: 'pause-routes', count: 3 }, 'logistics']
	] satisfies [RouteGuidanceAction, string][])('routes %j to %s', (action, panelId) => {
		expect(resolveGuidanceHandoff(action)).toEqual({ kind: 'panel', panelId });
	});
});
