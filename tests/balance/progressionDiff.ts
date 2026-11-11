/**
 * Calibration-artifact row diff (HPA-720 Task 3). Compares the per-seed
 * `runs` rows of two progression-sweep artifacts (same shape
 * `progressionRun.ts` writes) and reports per-archetype identity counts.
 * `--require-identical` names the archetype ids whose rows must be
 * field-identical between the two artifacts; the command exits nonzero on
 * any violation so it can serve as a regression check. Deterministic plain
 * text output — no timestamps or machine paths.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { ProgressionRunSummary } from './progressionCalibration';

export interface ProgressionRunDiff {
	key: string;
	archetypeId: string;
	fields: string[];
}

export interface ProgressionDiffResult {
	comparedKeys: number;
	missingInBase: string[];
	missingInHead: string[];
	identical: ProgressionRunSummary[];
	differing: ProgressionRunDiff[];
	requireIdenticalPassed: boolean;
	requireIdenticalFailures: string[];
}

function argsError(detail: string): never {
	throw new Error(`progression-diff: ${detail}`);
}

function readArtifact(path: string): { config: unknown; runs: ProgressionRunSummary[] } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		argsError(`cannot read artifact "${path}": ${(error as Error).message}`);
	}
	const runs = (parsed as { runs?: unknown }).runs;
	if (!Array.isArray(runs)) {
		argsError(`artifact "${path}" has no runs array — expected a progression-sweep artifact.`);
	}
	return parsed as { config: unknown; runs: ProgressionRunSummary[] };
}

export function diffProgressionRunRows(
	baseRuns: ProgressionRunSummary[],
	headRuns: ProgressionRunSummary[],
	requireIdentical: string[] = []
): ProgressionDiffResult {
	const rowKey = (run: ProgressionRunSummary) => `${run.seed}/${run.archetypeId}`;
	const baseByKey = new Map(baseRuns.map((run) => [rowKey(run), run]));
	const headByKey = new Map(headRuns.map((run) => [rowKey(run), run]));
	const missingInBase = [...headByKey.keys()].filter((key) => !baseByKey.has(key)).sort();
	const missingInHead = [...baseByKey.keys()].filter((key) => !headByKey.has(key)).sort();

	const identical: ProgressionRunSummary[] = [];
	const differing: ProgressionRunDiff[] = [];
	for (const key of [...baseByKey.keys()].sort()) {
		const baseRun = baseByKey.get(key)!;
		const headRun = headByKey.get(key);
		if (!headRun) continue;
		const fields = (Object.keys(baseRun) as (keyof ProgressionRunSummary)[]).filter(
			(field) => JSON.stringify(baseRun[field]) !== JSON.stringify(headRun[field])
		);
		if (fields.length === 0) {
			identical.push(baseRun);
		} else {
			differing.push({ key, archetypeId: baseRun.archetypeId, fields });
		}
	}

	const requireIdenticalFailures = [
		...new Set(
			differing
				.filter((diff) => requireIdentical.includes(diff.archetypeId))
				.map((diff) => diff.key)
		)
	].sort();

	return {
		comparedKeys: identical.length + differing.length,
		missingInBase,
		missingInHead,
		identical,
		differing,
		requireIdenticalPassed: requireIdenticalFailures.length === 0,
		requireIdenticalFailures
	};
}

export function formatProgressionDiff(result: ProgressionDiffResult): string {
	const lines: string[] = [];
	lines.push(`compared ${result.comparedKeys} row pair(s)`);
	if (result.missingInBase.length > 0) {
		lines.push(
			`missing in base (${result.missingInBase.length}): ${result.missingInBase.join(', ')}`
		);
	}
	if (result.missingInHead.length > 0) {
		lines.push(
			`missing in head (${result.missingInHead.length}): ${result.missingInHead.join(', ')}`
		);
	}
	const byArchetype = new Map<string, { identical: number; differing: number }>();
	for (const run of result.identical) {
		const entry = byArchetype.get(run.archetypeId) ?? { identical: 0, differing: 0 };
		entry.identical += 1;
		byArchetype.set(run.archetypeId, entry);
	}
	for (const diff of result.differing) {
		const entry = byArchetype.get(diff.archetypeId) ?? { identical: 0, differing: 0 };
		entry.differing += 1;
		byArchetype.set(diff.archetypeId, entry);
	}
	for (const [archetypeId, entry] of [...byArchetype].sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(`${archetypeId}: ${entry.identical} identical, ${entry.differing} differing`);
	}
	for (const diff of result.differing.slice(0, 20)) {
		lines.push(`differs: ${diff.key} (${diff.fields.join(', ')})`);
	}
	if (result.differing.length > 20) {
		lines.push(`…and ${result.differing.length - 20} more differing rows`);
	}
	lines.push(
		result.requireIdenticalPassed
			? 'require-identical: PASS'
			: `require-identical: FAIL (${result.requireIdenticalFailures.length} violation(s))`
	);
	return lines.join('\n');
}

export function main(argv: readonly string[]): number {
	let basePath: string | undefined;
	let headPath: string | undefined;
	let requireIdentical: string[] = [];

	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (flag !== '--base' && flag !== '--head' && flag !== '--require-identical') {
			argsError(`unknown argument "${flag}". Expected --base, --head or --require-identical.`);
		}
		const raw = argv[index + 1];
		if (raw === undefined) {
			argsError(`--${flag.slice(2)} requires a value.`);
		}
		index += 1;
		switch (flag) {
			case '--base':
				basePath = raw;
				break;
			case '--head':
				headPath = raw;
				break;
			case '--require-identical':
				requireIdentical = raw
					.split(',')
					.map((part) => part.trim())
					.filter((part) => part.length > 0);
				break;
		}
	}
	if (!basePath) argsError('--base is required (path to the base-sweep artifact JSON).');
	if (!headPath) argsError('--head is required (path to the head-sweep artifact JSON).');

	const base = readArtifact(basePath);
	const head = readArtifact(headPath);
	const result = diffProgressionRunRows(base.runs, head.runs, requireIdentical);
	console.log(formatProgressionDiff(result));
	return result.requireIdenticalPassed ? 0 : 1;
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : '')) {
	process.exit(main(process.argv.slice(2)));
}
