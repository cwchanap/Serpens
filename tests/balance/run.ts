/**
 * Balance-harness CLI shell (HPA-502). This stage only parses and validates
 * the sweep flags with explicit errors; the sweep itself (bots, simulation,
 * report writing) arrives with the harness measurement stage.
 *
 * Every seed is provided explicitly on the command line — never rely on the
 * game's `Date.now()` default, or sweeps stop being reproducible.
 */

import { pathToFileURL } from 'node:url';

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
	console.log(
		`balance: parsed --seeds ${options.seeds.join(',')} --days ${options.days} --bots ${options.bots.join(',')}` +
			(options.output === undefined ? '' : ` --output ${options.output}`)
	);
	console.error('balance: sweep wiring arrives with the harness measurement stage.');
	return 1;
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : '')) {
	process.exit(main(process.argv.slice(2)));
}
