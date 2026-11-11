import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { ProgressionRunSummary } from './progressionCalibration';

export interface ProgressionRunDiff {
	key: string;
	archetypeId: string;
	fields: string[];
}

export interface ProgressionArtifactLike {
	config?: unknown;
	runs: ProgressionRunSummary[];
}

export interface ArtifactCoverageIssue {
	missingKeys: string[];
	unexpectedKeys: string[];
	configProblems: string[];
}

export interface ProgressionDiffResult {
	comparedKeys: number;
	missingInBase: string[];
	missingInHead: string[];
	duplicateBaseKeys: string[];
	duplicateHeadKeys: string[];
	configMismatches: string[];
	unrepresentedArchetypes: string[];
	baseCoverage: ArtifactCoverageIssue;
	headCoverage: ArtifactCoverageIssue;
	identical: ProgressionRunSummary[];
	differing: ProgressionRunDiff[];
	requireIdenticalPassed: boolean;
	requireIdenticalFailures: string[];
}

function argsError(detail: string): never {
	throw new Error(`progression-diff: ${detail}`);
}

function readArtifact(path: string): ProgressionArtifactLike {
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
	return parsed as ProgressionArtifactLike;
}

function compareConfigs(baseConfig: unknown, headConfig: unknown): string[] {
	const mismatches: string[] = [];
	const read = (config: unknown) => {
		if (typeof config !== 'object' || config === null) return null;
		const candidate = config as { seeds?: unknown; days?: unknown; archetypes?: unknown };
		return {
			seeds: Array.isArray(candidate.seeds)
				? [...new Set(candidate.seeds.map(Number))].sort((a, b) => a - b)
				: null,
			days: typeof candidate.days === 'number' ? candidate.days : null,
			archetypes: Array.isArray(candidate.archetypes)
				? [...candidate.archetypes].map(String).sort()
				: null
		};
	};
	const base = read(baseConfig);
	const head = read(headConfig);
	if (!base || !head) {
		mismatches.push(
			base || head ? `config absent in ${base ? 'head' : 'base'}` : 'config absent in both'
		);
		return mismatches;
	}
	if (base.days !== head.days) {
		mismatches.push(`days: base ${base.days} vs head ${head.days}`);
	}
	if (JSON.stringify(base.seeds) !== JSON.stringify(head.seeds)) {
		mismatches.push(
			`seeds: base ${base.seeds?.length ?? 'absent'} seed(s) vs head ${head.seeds?.length ?? 'absent'}`
		);
	}
	if (JSON.stringify(base.archetypes) !== JSON.stringify(head.archetypes)) {
		mismatches.push(
			`archetypes: base [${base.archetypes?.join(', ') ?? 'absent'}] vs head [${head.archetypes?.join(', ') ?? 'absent'}]`
		);
	}
	return mismatches;
}

function validateArtifactCoverage(
	artifact: ProgressionArtifactLike,
	rowKey: (run: ProgressionRunSummary) => string
): ArtifactCoverageIssue {
	const configProblems: string[] = [];
	const missingKeys: string[] = [];
	const unexpectedKeys: string[] = [];
	const config = artifact.config;
	let seeds: number[] | null = null;
	let archetypes: string[] | null = null;
	if (typeof config !== 'object' || config === null) {
		configProblems.push('config is absent or not an object');
	} else {
		const candidate = config as { seeds?: unknown; days?: unknown; archetypes?: unknown };
		if (
			Array.isArray(candidate.seeds) &&
			candidate.seeds.length > 0 &&
			candidate.seeds.every((seed) => Number.isSafeInteger(seed))
		) {
			seeds = [...new Set(candidate.seeds as number[])];
		} else {
			configProblems.push('config.seeds must be a non-empty array of integer seeds');
		}
		if (
			Array.isArray(candidate.archetypes) &&
			candidate.archetypes.length > 0 &&
			candidate.archetypes.every(
				(archetypeId) => typeof archetypeId === 'string' && archetypeId.length > 0
			)
		) {
			archetypes = [...new Set(candidate.archetypes as string[])];
		} else {
			configProblems.push('config.archetypes must be a non-empty array of archetype ids');
		}
		if (
			typeof candidate.days !== 'number' ||
			!Number.isFinite(candidate.days) ||
			candidate.days <= 0
		) {
			configProblems.push('config.days must be a positive finite number');
		}
	}
	if (seeds && archetypes) {
		const expected = new Set<string>();
		for (const seed of seeds) {
			for (const archetypeId of archetypes) {
				expected.add(`${seed}/${archetypeId}`);
			}
		}
		const present = new Set(artifact.runs.map(rowKey));
		for (const key of expected) {
			if (!present.has(key)) missingKeys.push(key);
		}
		for (const key of present) {
			if (!expected.has(key)) unexpectedKeys.push(key);
		}
	}
	return {
		missingKeys: missingKeys.sort(),
		unexpectedKeys: unexpectedKeys.sort(),
		configProblems
	};
}

export function diffProgressionArtifacts(
	base: ProgressionArtifactLike,
	head: ProgressionArtifactLike,
	requireIdentical: string[] = []
): ProgressionDiffResult {
	const rowKey = (run: ProgressionRunSummary) => `${run.seed}/${run.archetypeId}`;
	const keyArchetype = (key: string) => key.slice(key.indexOf('/') + 1);
	const countKeys = (runs: ProgressionRunSummary[]) => {
		const counts = new Map<string, number>();
		for (const run of runs) {
			const key = rowKey(run);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return counts;
	};
	const baseCounts = countKeys(base.runs);
	const headCounts = countKeys(head.runs);
	const duplicateBaseKeys = [...baseCounts]
		.filter(([, count]) => count > 1)
		.map(([key]) => key)
		.sort();
	const duplicateHeadKeys = [...headCounts]
		.filter(([, count]) => count > 1)
		.map(([key]) => key)
		.sort();
	const missingInBase = [...headCounts.keys()].filter((key) => !baseCounts.has(key)).sort();
	const missingInHead = [...baseCounts.keys()].filter((key) => !headCounts.has(key)).sort();
	const configMismatches = compareConfigs(base.config, head.config);
	const baseCoverage = validateArtifactCoverage(base, rowKey);
	const headCoverage = validateArtifactCoverage(head, rowKey);

	const presentArchetypes = new Set([...baseCounts.keys(), ...headCounts.keys()].map(keyArchetype));
	const unrepresentedArchetypes = requireIdentical
		.filter((archetypeId) => !presentArchetypes.has(archetypeId))
		.sort();

	const baseByKey = new Map(base.runs.map((run) => [rowKey(run), run]));
	const headByKey = new Map(head.runs.map((run) => [rowKey(run), run]));
	const identical: ProgressionRunSummary[] = [];
	const differing: ProgressionRunDiff[] = [];
	for (const key of [...baseByKey.keys()].sort()) {
		const baseRun = baseByKey.get(key)!;
		const headRun = headByKey.get(key);
		if (!headRun) continue;
		const fieldUnion = [...new Set([...Object.keys(baseRun), ...Object.keys(headRun)])];
		const fields = fieldUnion.filter(
			(field) =>
				JSON.stringify(baseRun[field as keyof ProgressionRunSummary]) !==
				JSON.stringify(headRun[field as keyof ProgressionRunSummary])
		);
		if (fields.length === 0) {
			identical.push(baseRun);
		} else {
			differing.push({ key, archetypeId: baseRun.archetypeId, fields });
		}
	}

	const requiredSet = new Set(requireIdentical);
	const failureKeys = new Set<string>();
	for (const diff of differing) {
		if (requiredSet.has(diff.archetypeId)) failureKeys.add(diff.key);
	}
	for (const key of [
		...missingInBase,
		...missingInHead,
		...duplicateBaseKeys,
		...duplicateHeadKeys,
		...baseCoverage.missingKeys,
		...baseCoverage.unexpectedKeys,
		...headCoverage.missingKeys,
		...headCoverage.unexpectedKeys
	]) {
		if (requiredSet.has(keyArchetype(key))) failureKeys.add(key);
	}
	const requireIdenticalFailures = [...failureKeys].sort();
	const requireIdenticalPassed =
		requireIdenticalFailures.length === 0 &&
		missingInBase.length === 0 &&
		missingInHead.length === 0 &&
		duplicateBaseKeys.length === 0 &&
		duplicateHeadKeys.length === 0 &&
		configMismatches.length === 0 &&
		unrepresentedArchetypes.length === 0 &&
		baseCoverage.missingKeys.length === 0 &&
		baseCoverage.unexpectedKeys.length === 0 &&
		baseCoverage.configProblems.length === 0 &&
		headCoverage.missingKeys.length === 0 &&
		headCoverage.unexpectedKeys.length === 0 &&
		headCoverage.configProblems.length === 0;

	return {
		comparedKeys: identical.length + differing.length,
		missingInBase,
		missingInHead,
		duplicateBaseKeys,
		duplicateHeadKeys,
		configMismatches,
		unrepresentedArchetypes,
		baseCoverage,
		headCoverage,
		identical,
		differing,
		requireIdenticalPassed,
		requireIdenticalFailures
	};
}

export function formatProgressionDiff(result: ProgressionDiffResult): string {
	const lines: string[] = [];
	lines.push(`compared ${result.comparedKeys} row pair(s)`);
	for (const mismatch of result.configMismatches) {
		lines.push(`config mismatch: ${mismatch}`);
	}
	for (const [label, coverage] of [
		['base', result.baseCoverage],
		['head', result.headCoverage]
	] as const) {
		for (const problem of coverage.configProblems) {
			lines.push(`${label} config problem: ${problem}`);
		}
		if (coverage.missingKeys.length > 0) {
			lines.push(
				`${label} missing declared row(s) (${coverage.missingKeys.length}): ${coverage.missingKeys.join(', ')}`
			);
		}
		if (coverage.unexpectedKeys.length > 0) {
			lines.push(
				`${label} undeclared row(s) (${coverage.unexpectedKeys.length}): ${coverage.unexpectedKeys.join(', ')}`
			);
		}
	}
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
	if (result.duplicateBaseKeys.length > 0) {
		lines.push(
			`duplicate in base (${result.duplicateBaseKeys.length}): ${result.duplicateBaseKeys.join(', ')}`
		);
	}
	if (result.duplicateHeadKeys.length > 0) {
		lines.push(
			`duplicate in head (${result.duplicateHeadKeys.length}): ${result.duplicateHeadKeys.join(', ')}`
		);
	}
	if (result.unrepresentedArchetypes.length > 0) {
		lines.push(`required archetype(s) absent: ${result.unrepresentedArchetypes.join(', ')}`);
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
	const result = diffProgressionArtifacts(base, head, requireIdentical);
	console.log(formatProgressionDiff(result));
	return result.requireIdenticalPassed ? 0 : 1;
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : '')) {
	process.exit(main(process.argv.slice(2)));
}
