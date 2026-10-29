/**
 * Progression calibration CLI (HPA-318 Step 4). Runs the opt-in `progression`
 * bot and the `idle` negative control over an explicit seed/archetype matrix,
 * aggregates per-tier claim distributions + credit utilization + the tier-1
 * non-decorative check, and writes plain JSON (no timestamps, durations, or
 * machine paths in artifacts). A `--trace` mode dumps the named reference
 * run's full action log + claim/credit events for the acceptance trace.
 *
 * The idle set must produce zero claims; a violation aborts the sweep.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARCHETYPES } from '$lib/game/archetypes';
import { getCompanyBookValue } from '$lib/game/companyBookValue';
import type { ArchetypeId } from '$lib/game/types';
import { createFoundingGame, runBot, runProgressionBot } from './bots';
import { SWEEP_ARCHETYPES } from './measure';
import {
	buildProgressionCalibrationReport,
	summarizeIdleRun,
	summarizeProgressionRun,
	type IdleRunSummary,
	type ProgressionRunSummary
} from './progressionCalibration';

export interface ProgressionSweepOptions {
	seeds: number[];
	days: number;
	archetypes: ArchetypeId[];
	output?: string;
	trace?: string;
}

function argsError(detail: string): never {
	throw new Error(`progression-calibration: ${detail}`);
}

function parsePositiveInteger(flag: string, raw: string): number {
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 1) {
		argsError(`--${flag} expects a positive integer, got "${raw}".`);
	}
	return value;
}

export function parseProgressionSweepArgs(argv: readonly string[]): ProgressionSweepOptions {
	let seeds: number[] | undefined;
	let days: number | undefined;
	let archetypes: ArchetypeId[] | undefined;
	let output: string | undefined;
	let trace: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (
			flag !== '--seeds' &&
			flag !== '--days' &&
			flag !== '--archetypes' &&
			flag !== '--output' &&
			flag !== '--trace'
		) {
			argsError(
				`unknown argument "${flag}". Expected --seeds, --days, --archetypes, --output or --trace.`
			);
		}
		const raw = argv[index + 1];
		if (raw === undefined) {
			argsError(`--${flag.slice(2)} requires a value.`);
		}
		index += 1;
		switch (flag) {
			case '--seeds':
				seeds = raw.split(',').map((part) => parsePositiveInteger('seeds', part.trim()));
				break;
			case '--days':
				days = parsePositiveInteger('days', raw.trim());
				break;
			case '--archetypes':
				archetypes = raw
					.split(',')
					.map((part) => part.trim() as ArchetypeId)
					.filter((part) => part.length > 0);
				break;
			case '--output':
				output = raw;
				if (output.length === 0) argsError('--output expects a file path.');
				break;
			case '--trace':
				trace = raw;
				if (trace.length === 0) argsError('--trace expects a file path.');
				break;
		}
	}

	if (!seeds)
		argsError('--seeds is required (comma-separated seeds; every sweep is seeded explicitly).');
	if (!days) argsError('--days is required (positive integer of simulated days per run).');
	const archetypeIds = archetypes ?? [...SWEEP_ARCHETYPES];
	const known = new Set(ARCHETYPES.map((archetype) => archetype.id));
	for (const archetypeId of archetypeIds) {
		if (!known.has(archetypeId)) {
			argsError(`unknown archetype "${archetypeId}". Expected ${[...known].join(', ')}.`);
		}
	}
	return {
		seeds,
		days,
		archetypes: archetypeIds,
		...(output === undefined ? {} : { output }),
		...(trace === undefined ? {} : { trace })
	};
}

function writeJson(path: string, payload: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function runReferenceTrace(options: ProgressionSweepOptions): number {
	if (options.seeds.length !== 1) {
		argsError('--trace requires exactly one seed (the named acceptance run).');
	}
	const seed = options.seeds[0]!;
	const archetypeId = options.archetypes[0]!;
	const result = runProgressionBot(archetypeId, seed, options.days);
	writeJson(options.trace!, {
		seed,
		archetypeId,
		days: options.days,
		foundingTileId: result.ledger.foundingTileId,
		foundingCash: result.ledger.foundingCash,
		actions: result.ledger.actions,
		claims: result.progression.claims,
		creditEvents: result.progression.creditEvents,
		repayments: result.progression.repayments,
		final: {
			cash: result.game.cash,
			bookValue: getCompanyBookValue(result.game).total,
			storeCap: result.game.storeCap,
			stores: result.game.stores.map((store) => ({
				id: store.id,
				level: store.level,
				cityId: store.cityId
			})),
			openedCityIds: result.game.world.openedCityIds,
			revealedCityIds: result.game.world.revealedCityIds,
			buildings: result.game.industrialBuildings.map((building) => building.typeId)
		}
	});
	console.log(
		`progression-calibration: wrote reference trace for seed ${seed} (${archetypeId}, ${result.progression.claims.length} claim(s)) to ${options.trace}`
	);
	return 0;
}

export function main(argv: readonly string[]): number {
	const options = parseProgressionSweepArgs(argv);
	if (options.trace) return runReferenceTrace(options);

	const progressionRuns: ProgressionRunSummary[] = [];
	const idleRuns: IdleRunSummary[] = [];
	const startedAt = performance.now();
	for (const seed of options.seeds) {
		for (const archetypeId of options.archetypes) {
			const progression = runProgressionBot(archetypeId, seed, options.days);
			progressionRuns.push(summarizeProgressionRun(seed, archetypeId, progression));
			const idle = runBot('idle', archetypeId, seed, options.days);
			// Same seed → identical deterministic founding; the snapshot uses the
			// shared founding helper (the idle bot starts from exactly this state).
			idleRuns.push(
				summarizeIdleRun(seed, archetypeId, createFoundingGame(archetypeId, seed).game, idle.game)
			);
		}
	}
	const elapsedSeconds = (performance.now() - startedAt) / 1000;
	const report = buildProgressionCalibrationReport(
		{ seeds: options.seeds, days: options.days, archetypes: options.archetypes },
		progressionRuns,
		idleRuns
	);
	// Hard negative-control requirement: idle must never claim.
	if (report.idle.totalClaims !== 0) {
		argsError(
			`idle negative control violated: ${report.idle.totalClaims} claim(s) across ${report.idle.runs} idle runs.`
		);
	}
	const outputBase = options.output ?? 'docs/balance/generated/progression-calibration';
	writeJson(`${outputBase}.json`, report);
	console.log(
		`progression-calibration: ${report.progressionRuns} progression + ${report.idleRuns} idle run(s) over ${options.seeds.length} seed(s) × ${options.days} days in ${elapsedSeconds.toFixed(1)}s; wrote ${outputBase}.json`
	);
	for (const tier of report.tiers) {
		console.log(
			`  ${tier.tierId}: ${tier.reached}/${tier.total} reached` +
				(tier.claimDayMedian !== null
					? ` (p10 ${tier.claimDayP10?.toFixed(0)} / median ${tier.claimDayMedian.toFixed(0)} / p90 ${tier.claimDayP90?.toFixed(0)})`
					: ' (never claimed)')
		);
	}
	console.log(
		`  idle: ${report.idle.zeroClaimRuns}/${report.idle.runs} zero-claim runs, peak book value max ${report.idle.peakReportBookValue.max}`
	);
	console.log(
		`  tier1 non-decorative: ${report.tier1NonDecorative.passes} (idle max ${report.tier1NonDecorative.idlePeakReportBookValueMax} < target ${report.tier1NonDecorative.tier1PeakTarget})`
	);
	console.log(
		`  credit: ${report.credit.borrowCount} borrow(s) totaling ${report.credit.totalBorrowed}; borrows by claims-at-borrow ${JSON.stringify(report.credit.borrowCountByClaimsAtBorrow)}`
	);
	return 0;
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : '')) {
	process.exit(main(process.argv.slice(2)));
}
