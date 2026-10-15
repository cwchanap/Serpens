import { describe, expect, it } from 'vitest';
import { collectGameAlerts } from './alerts';
import type { GameAlert, GameAlertKind } from './alerts';
import { isSandboxOpeningWindow, selectOpeningGuidance } from './openingGuidance';
import { simulateDay } from './simulateDay';
import { createNewGame } from './state';
import { currentScenarioDefinition } from '$lib/scenarios/catalog';
import { executeScenarioCommand, startScenario } from '$lib/scenarios/runtime';
import type { GameState } from './types';

const REPORT_TEMPLATE = simulateDay(createNewGame('convenience', 1)).reports[0]!;

function reportOnDay(day: number) {
	return { ...REPORT_TEMPLATE, day };
}

function alertOf(kind: GameAlertKind, id: string): GameAlert {
	return { id, kind };
}

/** Deterministic one-store sandbox with zero reports (the day-1 opening state). */
function sandboxGame(): GameState {
	return createNewGame('convenience', 1);
}

function gameWithReports(reportCount: number): GameState {
	const game = sandboxGame();
	return {
		...game,
		reports: Array.from({ length: reportCount }, (_, index) => reportOnDay(index + 1))
	};
}

describe('opening guidance selector — hand-built cases', () => {
	it('1. missedLoanPayment alongside stock selects cash-risk (beats stock-recovery)', () => {
		const game = sandboxGame();
		const stock = alertOf('store-stock', 'store-stock:store-1');
		const missed = alertOf('missedLoanPayment', 'missedLoanPayment:loan-1');
		expect(selectOpeningGuidance(game, [stock, missed])).toEqual({
			kind: 'cash-risk',
			alert: missed
		});
	});

	it('2. lowCashRunway alongside stock selects cash-risk', () => {
		const game = sandboxGame();
		const runway = alertOf('lowCashRunway', 'lowCashRunway');
		expect(
			selectOpeningGuidance(game, [alertOf('store-stock', 'store-stock:store-1'), runway])
		).toEqual({ kind: 'cash-risk', alert: runway });
	});

	it('3. covenantRisk alongside stock selects stock-recovery, never cash-risk', () => {
		const game = sandboxGame();
		const stock = alertOf('store-stock', 'store-stock:store-1');
		const guidance = selectOpeningGuidance(game, [stock, alertOf('covenantRisk', 'covenantRisk')]);
		expect(guidance).toEqual({ kind: 'stock-recovery', alert: stock });
	});

	it('4. upcomingLoanPayment alongside stock selects stock-recovery, never cash-risk', () => {
		const game = sandboxGame();
		const stock = alertOf('store-stock', 'store-stock:store-1');
		const guidance = selectOpeningGuidance(game, [
			stock,
			alertOf('upcomingLoanPayment', 'upcomingLoanPayment:loan-1')
		]);
		expect(guidance).toEqual({ kind: 'stock-recovery', alert: stock });
	});

	it('5. stock beats report-backed guidance once reports exist', () => {
		const game = gameWithReports(3);
		const stock = alertOf('store-stock', 'store-stock:store-1');
		expect(selectOpeningGuidance(game, [stock])).toEqual({ kind: 'stock-recovery', alert: stock });
	});

	it('6. zero reports select first-result; structural finance alerts cannot hijack it', () => {
		const game = sandboxGame();
		expect(selectOpeningGuidance(game, [])).toEqual({ kind: 'first-result' });
		expect(selectOpeningGuidance(game, [alertOf('covenantRisk', 'covenantRisk')])).toEqual({
			kind: 'first-result'
		});
	});

	it('7. one or more reports select result-evidence when no alert lane matches', () => {
		expect(selectOpeningGuidance(gameWithReports(1), [])).toEqual({ kind: 'result-evidence' });
		expect(
			selectOpeningGuidance(gameWithReports(7), [
				alertOf('covenantRisk', 'covenantRisk'),
				alertOf('upcomingLoanPayment', 'upcomingLoanPayment:loan-1')
			])
		).toEqual({ kind: 'result-evidence' });
	});

	it('8. matching alerts preserve existing array order', () => {
		const game = sandboxGame();
		const firstMissed = alertOf('missedLoanPayment', 'missedLoanPayment:loan-2');
		const secondMissed = alertOf('missedLoanPayment', 'missedLoanPayment:loan-1');
		const guidance = selectOpeningGuidance(game, [firstMissed, secondMissed]);
		expect(guidance).toEqual({ kind: 'cash-risk', alert: firstMissed });
		expect(guidance?.kind === 'cash-risk' && guidance.alert).toBe(firstMissed);

		const firstStock = alertOf('store-stock', 'store-stock:store-2');
		const secondStock = alertOf('store-stock', 'store-stock:store-1');
		const stockGuidance = selectOpeningGuidance(game, [firstStock, secondStock]);
		expect(stockGuidance).toEqual({ kind: 'stock-recovery', alert: firstStock });
		expect(stockGuidance?.kind === 'stock-recovery' && stockGuidance.alert).toBe(firstStock);
	});

	it('9. inputs are not mutated and the matched alert is carried by reference', () => {
		const game = sandboxGame();
		const stock = alertOf('store-stock', 'store-stock:store-1');
		const missed = alertOf('missedLoanPayment', 'missedLoanPayment:loan-1');
		const alerts = [stock, missed];
		const gameBefore = structuredClone(game);
		const alertsBefore = structuredClone(alerts);

		const guidance = selectOpeningGuidance(game, alerts);

		expect(guidance).toEqual({ kind: 'cash-risk', alert: missed });
		expect(game).toEqual(gameBefore);
		expect(alerts).toEqual(alertsBefore);
	});

	it('10. sandbox window is one store with 0-7 reports, closed otherwise', () => {
		expect(isSandboxOpeningWindow(sandboxGame())).toBe(true);
		expect(isSandboxOpeningWindow(gameWithReports(7))).toBe(true);
		expect(isSandboxOpeningWindow(gameWithReports(8))).toBe(false);
		expect(isSandboxOpeningWindow(null)).toBe(false);

		const game = sandboxGame();
		const secondStore = { ...game.stores[0]!, id: 'store-2' };
		expect(isSandboxOpeningWindow({ ...game, stores: [...game.stores, secondStore] })).toBe(false);
	});

	it('returns null outside the opening window', () => {
		expect(selectOpeningGuidance(null, [])).toBeNull();
		expect(selectOpeningGuidance(gameWithReports(8), [])).toBeNull();
		const game = sandboxGame();
		const secondStore = { ...game.stores[0]!, id: 'store-2' };
		expect(
			selectOpeningGuidance({ ...game, stores: [...game.stores, secondStore] }, [])
		).toBeNull();
	});
});

describe('opening guidance — real sandbox walk', { timeout: 30_000 }, () => {
	it('pins first-result, the real stock-recovery period, and result-evidence inside the window', () => {
		let game = createNewGame('convenience', 1);
		const walk: {
			day: number;
			alertKinds: GameAlertKind[];
			guidance: ReturnType<typeof selectOpeningGuidance>;
		}[] = [];

		while (game.reports.length <= 7) {
			const alerts = collectGameAlerts(game);
			walk.push({
				day: game.day,
				alertKinds: alerts.map((alert) => alert.kind),
				guidance: selectOpeningGuidance(game, alerts)
			});
			game = simulateDay(game);
		}

		// Day 1: the structural covenantRisk alert fires immediately but must not
		// hijack the zero-report opening state.
		expect(walk[0]).toMatchObject({
			day: 1,
			alertKinds: ['covenantRisk'],
			guidance: { kind: 'first-result' }
		});

		// Days 2-7: the real stock-recovery period. covenantRisk is present the
		// whole time, yet stock-recovery wins and carries the store-stock alert.
		for (const entry of walk.slice(1, -1)) {
			expect(entry.alertKinds).toContain('store-stock');
			expect(entry.alertKinds).toContain('covenantRisk');
			expect(entry.guidance?.kind).toBe('stock-recovery');
			expect(entry.guidance?.kind === 'stock-recovery' && entry.guidance.alert.kind).toBe(
				'store-stock'
			);
		}

		// Day 8 (still inside the window at 7 reports): only the structural
		// upcomingLoanPayment alert remains, and it must not hijack result-evidence.
		expect(walk.at(-1)).toMatchObject({
			day: 8,
			alertKinds: ['upcomingLoanPayment'],
			guidance: { kind: 'result-evidence' }
		});

		// The allowlisted cash lanes never fire in this walk.
		expect(walk.every((entry) => entry.guidance?.kind !== 'cash-risk')).toBe(true);

		// One report later the window is closed and the selector stays quiet.
		expect(game.reports.length).toBe(8);
		expect(selectOpeningGuidance(game, collectGameAlerts(game))).toBeNull();
	});
});

describe('opening guidance — First Profit walk', { timeout: 30_000 }, () => {
	it('pins day-1 first-result, report-backed guidance after the first advance, and a day-4 natural end', () => {
		const definition = currentScenarioDefinition('first-profit');
		if (!definition) throw new Error('first-profit definition missing');
		const started = startScenario(definition, 280_001);
		if (!started.ok) throw new Error('first-profit failed to start');
		let run = started.value;
		expect(run.eligibility).toBe('ranked');

		// Day 1: zero reports, only the structural covenantRisk alert, so the
		// opening loop starts on first-result instead of a finance hijack.
		const dayOneAlerts = collectGameAlerts(run.game);
		expect(dayOneAlerts.map((alert) => alert.kind)).toEqual(['covenantRisk']);
		expect(run.game.reports).toHaveLength(0);
		expect(selectOpeningGuidance(run.game, dayOneAlerts)).toEqual({ kind: 'first-result' });

		// First advance: a real report exists, so guidance becomes report-backed.
		const advanced = executeScenarioCommand(run, definition, { kind: 'advanceDay' });
		if (!advanced.ok || !advanced.changed) throw new Error('first advance failed');
		run = advanced.run;
		expect(run.game.reports).toHaveLength(1);
		expect(collectGameAlerts(run.game).map((alert) => alert.kind)).toEqual(['covenantRisk']);
		expect(selectOpeningGuidance(run.game, collectGameAlerts(run.game))).toEqual({
			kind: 'result-evidence'
		});

		// Continue the no-action trace: guidance stays report-backed (never
		// hijacked by the structural covenantRisk alert) until the scenario
		// naturally terminates on day 4. No guidance is planned beyond it.
		while (run.status === 'active') {
			const alerts = collectGameAlerts(run.game);
			const guidance = selectOpeningGuidance(run.game, alerts);
			expect(guidance?.kind === 'cash-risk' || guidance?.kind === 'stock-recovery').toBe(false);
			const next = executeScenarioCommand(run, definition, { kind: 'advanceDay' });
			if (!next.ok || !next.changed) throw new Error('no-action advance failed');
			run = next.run;
		}

		expect(run.status).toBe('completed');
		expect(run.result).toMatchObject({
			outcome: 'completed',
			completionDay: 4,
			score: 862,
			medal: 'gold'
		});
	});
});
