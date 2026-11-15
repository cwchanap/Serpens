/**
 * Claim-aligned trace collector (HPA-721 threshold evidence). The collector is
 * a passive observer of the production claim evaluations: it must never alter
 * the run, and its claim/daily/peak rows must agree with the run's own
 * receipts, persisted reports and the production run-to-date metric.
 */

import { describe, expect, it } from 'vitest';
import { PROGRESSION_TIERS } from '$lib/game/progression';
import { PRODUCTS } from '$lib/game/products';
import type { DailyReport } from '$lib/game/types';
import { runProgressionBot, type ProgressionClaimProbe } from './bots';
import { summarizeProgressionRun } from './progressionCalibration';
import {
	buildProgressionClaimTraceReport,
	createProgressionClaimTraceCollector
} from './progressionClaimTrace';

const SEED = 20260503;
const DAYS = 260;
/** Established pilot seed whose T3+T4+T5 receipts land in one evaluation. */
const MULTI_SEED = 20260529;
const MULTI_DAYS = 198;

function storeCapacityReward(tierId: string): number {
	return PROGRESSION_TIERS.find((tier) => tier.id === tierId)!.reward.storeCapacityBonus;
}

/**
 * Independent derivation of the tier-3 local-delivery evidence: cumulative
 * `warehouseUnits` for the industry-linked product catalog, read straight from
 * the persisted daily reports (not through the metric or the collector). A
 * collector that reports `0` for every non-null value fails this comparison.
 */
function cumulativeLocalUnitsByDay(reports: readonly DailyReport[]): Map<number, number> {
	const productIds = new Set(
		Object.values(PRODUCTS)
			.filter((product) => product.productionMaterialId !== null)
			.map((product) => product.id)
	);
	let total = 0;
	const byDay = new Map<number, number>();
	for (const report of reports) {
		for (const storeReport of report.storeReports) {
			for (const productReport of storeReport.productReports) {
				if (productIds.has(productReport.productId)) total += productReport.warehouseUnits;
			}
		}
		byDay.set(report.day, total);
	}
	return byDay;
}

describe('progression claim trace collector (noninterference)', { timeout: 180_000 }, () => {
	it('leaves the run byte-identical: digest, RNG and summary match an untraced run', () => {
		const plain = runProgressionBot('boutique', SEED, DAYS);
		const collector = createProgressionClaimTraceCollector();
		const traced = runProgressionBot('boutique', SEED, DAYS, collector.probe);

		expect(JSON.stringify(traced.digest)).toBe(JSON.stringify(plain.digest));
		expect(JSON.stringify(traced.ledger.actions)).toBe(JSON.stringify(plain.ledger.actions));
		expect(traced.game.rngState).toBe(plain.game.rngState);
		expect(traced.game.day).toBe(plain.game.day);
		expect(summarizeProgressionRun(SEED, 'boutique', traced)).toEqual(
			summarizeProgressionRun(SEED, 'boutique', plain)
		);
	});

	it('reports receipts, daily reports and peak evidence that match the finished run', () => {
		const collector = createProgressionClaimTraceCollector();
		const result = runProgressionBot('boutique', SEED, DAYS, collector.probe);
		const trace = collector.build(SEED, 'boutique', DAYS, result);

		expect(trace.seed).toBe(SEED);
		expect(trace.claims).toEqual(result.progression.claims);
		expect(trace.claims.length).toBeGreaterThan(0);

		// Daily rows mirror the persisted reports exactly, day for day.
		expect(trace.daily.map((row) => row.day)).toEqual(
			result.game.reports.map((report) => report.day)
		);
		const lastReport = result.game.reports.at(-1)!;
		expect(trace.daily.at(-1)).toMatchObject({
			day: lastReport.day,
			cashAfter: lastReport.cashAfter,
			debtAfter: lastReport.outstandingPrincipalAfter,
			companyBookValueAfter: lastReport.companyBookValueAfter,
			operatingCashFlow: lastReport.operatingCashFlow
		});

		// The recorded peak is the production run-to-date metric over that day's reports.
		for (const row of trace.daily) {
			const peakToDate = result.game.reports
				.filter((report) => report.day <= row.day)
				.reduce(
					(peak, report) => Math.max(peak, report.companyBookValueAfter),
					Number.NEGATIVE_INFINITY
				);
			expect(row.peakBookValue).toBe(peakToDate);
		}
		// Every evaluation is internally consistent and sees at most the store cap.
		for (const event of trace.claimEvaluations) {
			expect(event.stores).toBeLessThanOrEqual(event.storeCap);
			expect(event.maxLevel).toBeGreaterThanOrEqual(1);
			expect(event.cities).toBeGreaterThanOrEqual(1);
			expect(event.claimsAfter).toBeGreaterThanOrEqual(event.claimsBefore);
			expect(event.newTierIds.length).toBe(event.claimsAfter - event.claimsBefore);
			const peakToDate =
				event.reportDay === null
					? 0
					: result.game.reports
							.filter((report) => report.day <= event.reportDay!)
							.reduce(
								(peak, report) => Math.max(peak, report.companyBookValueAfter),
								Number.NEGATIVE_INFINITY
							);
			expect(event.peakBookValue).toBe(peakToDate);
		}

		// Every receipt is observed by the evaluation that appended it, in order.
		for (const [index, claim] of trace.claims.entries()) {
			const appending = trace.claimEvaluations.filter((event) =>
				event.newTierIds.includes(claim.tierId)
			);
			expect(appending).toHaveLength(1);
			expect(appending[0]).toMatchObject({
				day: claim.claimedOnDay,
				peakBookValue: expect.any(Number),
				stores: expect.any(Number),
				storeCap: expect.any(Number),
				cities: expect.any(Number),
				maxLevel: expect.any(Number)
			});
			// A same-call prefix catch-up can append several tiers at once, so the
			// indices bracket the receipt rather than pinning it one-to-one.
			const event = appending[0]!;
			expect(event.claimsBefore).toBeLessThanOrEqual(index);
			expect(event.claimsAfter).toBeGreaterThan(index);
			expect(event.newTierIds).toEqual(
				trace.claims.slice(event.claimsBefore, event.claimsAfter).map((entry) => entry.tierId)
			);
			// Claim-appending evaluations always retain the decomposition.
			expect(event.bookValue).not.toBeNull();
			expect(event.bookValue).toMatchObject({
				total: expect.any(Number),
				cash: expect.any(Number),
				debt: expect.any(Number),
				inventory: expect.any(Number),
				retailAssets: expect.any(Number)
			});
		}
		expect(trace.claims.length).toBe(trace.claimEvaluations.at(-1)!.claimsAfter);

		// The trace covers every simulated day and ends on the final state.
		const evaluationDays = new Set(trace.claimEvaluations.map((event) => event.day));
		for (let day = 1; day <= DAYS; day += 1) expect(evaluationDays.has(day)).toBe(true);
		const finalEvaluation = trace.claimEvaluations.at(-1)!;
		expect(trace.days).toBe(DAYS);
		// `game.day` is the terminal counter (one past the last advanced day).
		expect(trace.final.day).toBe(DAYS + 1);
		expect(finalEvaluation.day).toBe(DAYS + 1);
		expect(finalEvaluation.stores).toBe(result.game.stores.length);
		expect(trace.final.storeCount).toBe(result.game.stores.length);
		expect(trace.final.storeCap).toBe(result.game.storeCap);
		expect(trace.final.reportDay).toBe(DAYS);
	});

	it('records the multi-tier claim boundary: action order, reward capacity, local units and report timing', () => {
		const collector = createProgressionClaimTraceCollector();
		const result = runProgressionBot('boutique', MULTI_SEED, MULTI_DAYS, collector.probe);
		const trace = collector.build(MULTI_SEED, 'boutique', MULTI_DAYS, result);

		// The fixture must contain a same-call multi-tier claim to be meaningful.
		const index = trace.claimEvaluations.findIndex((event) => event.newTierIds.length > 1);
		expect(index).toBeGreaterThanOrEqual(0);
		const multi = trace.claimEvaluations[index]!;
		expect(multi.newTierIds.length).toBe(multi.claimsAfter - multi.claimsBefore);
		expect(multi.bookValue).not.toBeNull();

		// The probe ran before the receipts were recorded, so the ledger at
		// `actionIndex` is exactly this call's claim receipts, in ladder order.
		const receipts = result.ledger.actions.slice(
			multi.actionIndex,
			multi.actionIndex + multi.newTierIds.length
		);
		expect(receipts.map((action) => action.action)).toEqual(
			multi.newTierIds.map(() => 'claimEarnedTiers')
		);
		expect(receipts.map((action) => action.detail)).toEqual(multi.newTierIds);
		expect(receipts.every((action) => action.outcome === 'applied')).toBe(true);

		// Day boundary: this claim call follows a daily tick, so the evaluation is
		// the first one to see that report day, the ledger records the loop day
		// (the report day) and the receipt stamps the advanced game day.
		const firstWithReportDay = trace.claimEvaluations.findIndex(
			(event) => event.reportDay === multi.reportDay
		);
		expect(firstWithReportDay).toBe(index);
		expect(receipts.every((action) => action.day === multi.reportDay)).toBe(true);
		expect(
			trace.claims
				.filter((claim) => multi.newTierIds.includes(claim.tierId))
				.map((claim) => claim.claimedOnDay)
		).toEqual(multi.newTierIds.map(() => multi.day));

		// The retained decomposition is the daily report's own book value.
		const boundaryReport = trace.daily.find((row) => row.day === multi.reportDay);
		expect(boundaryReport).toBeDefined();
		expect(multi.bookValue!.total).toBe(boundaryReport!.companyBookValueAfter);
		expect(multi.peakBookValue).toBe(boundaryReport!.peakBookValue);

		// Pre-reward capacity: the claim call adds its own capacity rewards before
		// the next evaluation can observe the new cap.
		const expectedCap =
			multi.storeCap +
			multi.newTierIds.reduce((total, tierId) => total + storeCapacityReward(tierId), 0);
		const after = trace.claimEvaluations[index + 1];
		expect(after).toBeDefined();
		expect(after!.storeCap).toBe(expectedCap);
		expect(after!.storeCap).toBeGreaterThan(multi.storeCap);

		// Timestamp boundary: after an advance the game day is the report day + 1,
		// so every recorded evaluation satisfies reportDay = day − 1 (or has no
		// report yet on day 1).
		for (const event of trace.claimEvaluations) {
			if (event.reportDay === null) expect(event.day).toBe(1);
			else expect(event.reportDay).toBe(event.day - 1);
		}

		// Decomposition retention boundary: the first evaluation of each newly
		// visible report day (the post-advance evaluation) and every claim call.
		const seenReportDays = new Set<number>();
		for (const event of trace.claimEvaluations) {
			const postAdvance = event.reportDay !== null && !seenReportDays.has(event.reportDay);
			if (event.reportDay !== null) seenReportDays.add(event.reportDay);
			expect(event.bookValue === null).toBe(!(postAdvance || event.newTierIds.length > 0));
		}

		// Tier-3 local units are the real qualifying evidence while the tier is
		// unclaimed (pre-claim state of the appending evaluation included) and null
		// afterwards. Expected values are derived independently from the persisted
		// reports, so a collector that substitutes 0 for every value fails.
		const t3Index = trace.claimEvaluations.findIndex((event) =>
			event.newTierIds.includes('regional-supplier')
		);
		expect(t3Index).toBeGreaterThanOrEqual(0);
		const localUnitsTarget = PROGRESSION_TIERS.find(
			(tier) => tier.id === 'regional-supplier'
		)!.goals.find((goal) => goal.id === 'regional-supplier-local-units')!.target as number;
		expect(localUnitsTarget).toBeGreaterThan(0);
		const t3ClaimIndex = trace.claims.findIndex((claim) => claim.tierId === 'regional-supplier');
		expect(t3ClaimIndex).toBeGreaterThanOrEqual(0);
		const expectedUnits = cumulativeLocalUnitsByDay(result.game.reports);
		let checkedT3Values = 0;
		for (const event of trace.claimEvaluations) {
			const t3ClaimedBefore = event.claimsBefore > t3ClaimIndex;
			if (t3ClaimedBefore) {
				expect(event.localUnits).toBeNull();
				continue;
			}
			const expected = event.reportDay === null ? 0 : (expectedUnits.get(event.reportDay) ?? 0);
			expect(event.localUnits).toBe(expected);
			checkedT3Values += 1;
		}
		expect(checkedT3Values).toBeGreaterThan(0);

		// The fixture must carry real qualifying evidence at the T3 boundary, not a
		// placeholder: the recorded value is the report-derived total and passes the
		// authored target on the evaluation that appends the receipt.
		const boundary = trace.claimEvaluations[t3Index]!;
		expect(boundary.localUnits).toBe(
			boundary.reportDay === null ? 0 : (expectedUnits.get(boundary.reportDay) ?? 0)
		);
		expect(boundary.localUnits).toBeGreaterThan(0);
		expect(boundary.localUnits).toBeGreaterThanOrEqual(localUnitsTarget);
	});

	it('restores the caller probe after a nested run instead of clearing it', () => {
		const baselineCollector = createProgressionClaimTraceCollector();
		const baselineResult = runProgressionBot('convenience', SEED, 5, baselineCollector.probe);
		const expectedOuterCalls = baselineCollector.build(SEED, 'convenience', 5, baselineResult)
			.claimEvaluations.length;
		expect(expectedOuterCalls).toBeGreaterThan(1);

		let outerCalls = 0;
		let innerCalls = 0;
		let nested = false;
		const outerProbe: ProgressionClaimProbe = () => {
			outerCalls += 1;
			if (nested) return;
			nested = true;
			runProgressionBot('convenience', SEED + 1, 5, () => {
				innerCalls += 1;
			});
		};

		runProgressionBot('convenience', SEED, 5, outerProbe);
		expect(innerCalls).toBeGreaterThan(0);
		expect(outerCalls).toBe(expectedOuterCalls);
	});

	it('clears the probe when the probe itself throws', () => {
		let calls = 0;
		const thrower: ProgressionClaimProbe = () => {
			calls += 1;
			throw new Error('probe boom');
		};

		expect(() => runProgressionBot('convenience', SEED, 5, thrower)).toThrow('probe boom');
		expect(calls).toBe(1);
		// The abandoned probe must not observe a later, unrelated run.
		expect(runProgressionBot('convenience', SEED, 5).game.day).toBe(6);
		expect(calls).toBe(1);
	});

	it('rejects a thenable probe synchronously and absorbs its later rejection', async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			unhandled.push(reason);
		};
		process.on('unhandledRejection', onUnhandled);
		try {
			const asyncProbe = (async () => {
				throw new Error('async probe result must not surface');
			}) as unknown as ProgressionClaimProbe;

			expect(() => runProgressionBot('convenience', SEED, 5, asyncProbe)).toThrow(
				/progression claim probe must return void/
			);
			// Give the rejected promise a full macrotask to surface if unhandled.
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}
	});

	it('records the unchanged ladder header from the catalog instead of duplicate constants', () => {
		const collector = createProgressionClaimTraceCollector();
		const result = runProgressionBot('convenience', SEED, 30, collector.probe);
		const report = buildProgressionClaimTraceReport(
			{ seeds: [SEED], days: 30, archetypes: ['convenience'] },
			[collector.build(SEED, 'convenience', 30, result)]
		);

		expect(report.ladder.map((tier) => tier.id)).toEqual(PROGRESSION_TIERS.map((tier) => tier.id));
		expect(report.ladder.map((tier) => tier.goals.map((goal) => goal.target))).toEqual(
			PROGRESSION_TIERS.map((tier) => tier.goals.map((goal) => goal.target))
		);
		expect(report.ladder.map((tier) => tier.reward)).toEqual(
			PROGRESSION_TIERS.map((tier) => tier.reward)
		);
		expect(report.runs).toHaveLength(1);
	});
});
