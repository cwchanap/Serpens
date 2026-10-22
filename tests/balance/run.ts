/**
 * Balance-harness CLI (HPA-502). Parses and validates the sweep flags with
 * explicit errors, runs the deterministic seed/archetype/bot matrix through
 * real engine transitions, measures each run purely, and writes JSON +
 * Markdown to the chosen --output path (no timestamps, UUIDs, machine paths
 * or durations anywhere in the artifacts).
 *
 * Every seed is provided explicitly on the command line — never rely on the
 * game's `Date.now()` default, or sweeps stop being reproducible.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARCHETYPES } from '$lib/game/archetypes';
import { runBot } from './bots';
import {
	botsForArchetype,
	buildSweepReport,
	measureRun,
	renderSweepMarkdown,
	SWEEP_BOTS,
	type SweepRunResult
} from './measure';

const SWEEP_BOT_IDS: readonly string[] = SWEEP_BOTS;

export interface BalanceSweepOptions {
	seeds: number[];
	days: number;
	bots: string[];
	output?: string;
}

function argsError(detail: string): never {
	throw new Error(`balance: ${detail}`);
}

function parsePositiveInteger(flag: string, raw: string): number {
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 1) {
		argsError(`--${flag} expects a positive integer, got "${raw}".`);
	}
	return value;
}

export function parseBalanceSweepArgs(argv: readonly string[]): BalanceSweepOptions {
	let seeds: number[] | undefined;
	let days: number | undefined;
	let bots: string[] | undefined;
	let output: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (flag !== '--seeds' && flag !== '--days' && flag !== '--bots' && flag !== '--output') {
			argsError(`unknown argument "${flag}". Expected --seeds, --days, --bots or --output.`);
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
			case '--bots':
				bots = raw.split(',').map((part) => part.trim());
				if (bots.some((bot) => bot.length === 0)) {
					argsError('--bots expects comma-separated bot names.');
				}
				break;
			case '--output':
				output = raw;
				if (output.length === 0) {
					argsError('--output expects a file path.');
				}
				break;
		}
	}

	if (!seeds)
		argsError('--seeds is required (comma-separated seeds; every sweep is seeded explicitly).');
	if (!days) argsError('--days is required (positive integer of simulated days per seed).');
	if (!bots) argsError('--bots is required (comma-separated bot names).');
	return { seeds, days, bots, ...(output === undefined ? {} : { output }) };
}

export function main(argv: readonly string[]): number {
	const options = parseBalanceSweepArgs(argv);
	const requestedBots = new Set(options.bots);
	for (const bot of requestedBots) {
		if (!SWEEP_BOT_IDS.includes(bot)) {
			argsError(`unknown bot "${bot}". Expected ${SWEEP_BOT_IDS.join(', ')}.`);
		}
	}
	const archetypeIds = ARCHETYPES.map((archetype) => archetype.id);
	const results: SweepRunResult[] = [];
	for (const seed of options.seeds) {
		for (const archetypeId of archetypeIds) {
			for (const bot of botsForArchetype(archetypeId)) {
				if (!requestedBots.has(bot)) continue;
				const { game, ledger } = runBot(bot, archetypeId, seed, options.days);
				results.push({ seed, archetypeId, bot, measurement: measureRun(game, ledger) });
			}
		}
	}
	const report = buildSweepReport(options.seeds, options.days, results);
	const outputBase = options.output ?? 'docs/balance/generated/balance-sweep';
	mkdirSync(dirname(outputBase), { recursive: true });
	writeFileSync(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`);
	writeFileSync(`${outputBase}.md`, renderSweepMarkdown(report));
	console.log(
		`balance: measured ${results.length} run(s) over ${options.seeds.length} seed(s) × ${options.days} days; wrote ${outputBase}.json and ${outputBase}.md`
	);
	return 0;
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : '')) {
	process.exit(main(process.argv.slice(2)));
}
