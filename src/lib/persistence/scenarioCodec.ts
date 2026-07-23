import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import type {
	ScenarioBestResultRecord,
	ScenarioDefinition,
	ScenarioDefinitionKey,
	ScenarioDefinitionRef,
	ScenarioDiagnostic,
	ScenarioEvaluation,
	ScenarioId,
	ScenarioResult,
	ScenarioRun,
	ScenarioRunRecord,
	ScenarioStoreSnapshot
} from '$lib/scenarios/types';
import { migrateSavedGame, validateCurrentGameState } from './saveCodec';
import { SAVE_SCHEMA_VERSION } from './saveTypes';

export const SCENARIO_STORE_SCHEMA_VERSION = 1;
export const SCENARIO_RUN_SCHEMA_VERSION = 1;

const SCENARIO_IDS = ['first-profit', 'import-squeeze', 'local-lifeline'] as const;
const RUN_STATUSES = ['active', 'completed', 'failed', 'abandoned'] as const;
const ELIGIBILITIES = ['ranked', 'unranked'] as const;
const MEDALS = ['bronze', 'silver', 'gold'] as const;
const OBJECTIVE_STATUSES = ['pending', 'satisfied', 'missed'] as const;
const FAILURE_STATUSES = ['inactive', 'triggered'] as const;
const COMPARATORS = ['lt', 'lte', 'eq', 'gte', 'gt'] as const;
const METRICS = [
	'cash',
	'daily-net-income',
	'cumulative-net-income',
	'consecutive-positive-net-income-reports',
	'completed-retail-import-cycles',
	'retail-import-spend',
	'retail-imported-units',
	'retail-local-units',
	'retail-local-share',
	'units-sold',
	'demand-missed',
	'scorecard',
	'store-count',
	'industrial-building-count',
	'warehouse-quantity'
] as const;
const WINDOW_KINDS = ['current', 'run-to-date', 'trailing-reports', 'fixed-report-days'] as const;

export type ScenarioDefinitionResolver = (
	ref: ScenarioDefinitionRef
) => ScenarioDefinition | undefined;

export interface DecodeScenarioStoreResult {
	snapshot: ScenarioStoreSnapshot;
	diagnostics: ScenarioDiagnostic[];
}

export class ScenarioCodecError extends Error {
	readonly diagnostics: ScenarioDiagnostic[];

	constructor(message: string, diagnostics: readonly ScenarioDiagnostic[]) {
		super(message);
		this.name = 'ScenarioCodecError';
		this.diagnostics = [...diagnostics];
	}
}

class ScenarioValidationFailure extends Error {
	constructor(readonly diagnostic: ScenarioDiagnostic) {
		super(diagnostic.detail);
		this.name = 'ScenarioValidationFailure';
	}
}

function compareCodeUnits(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function sortDiagnostics(diagnostics: readonly ScenarioDiagnostic[]): ScenarioDiagnostic[] {
	return [...diagnostics].sort(
		(left, right) =>
			compareCodeUnits(left.path, right.path) || compareCodeUnits(left.code, right.code)
	);
}

function diagnostic(
	code: string,
	path: string,
	value: unknown,
	detail: string
): ScenarioDiagnostic {
	return { code, path, value, detail };
}

function fail(code: string, path: string, value: unknown, detail: string): never {
	throw new ScenarioValidationFailure(diagnostic(code, path, value, detail));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
	if (!isRecord(value)) fail('invalid-record', path, value, `${path} must be a plain object.`);
	return value;
}

function requireArray(value: unknown, path: string): unknown[] {
	if (!Array.isArray(value)) fail('invalid-array', path, value, `${path} must be an array.`);
	return value;
}

function requireString(value: unknown, path: string): string {
	if (typeof value !== 'string') fail('invalid-string', path, value, `${path} must be a string.`);
	return value;
}

function requireBoolean(value: unknown, path: string): boolean {
	if (typeof value !== 'boolean')
		fail('invalid-boolean', path, value, `${path} must be a boolean.`);
	return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		fail('invalid-number', path, value, `${path} must be a finite number.`);
	}
	return value;
}

function requireInteger(value: unknown, path: string, minimum?: number): number {
	const number = requireFiniteNumber(value, path);
	if (!Number.isSafeInteger(number) || (minimum !== undefined && number < minimum)) {
		fail(
			'invalid-integer',
			path,
			value,
			`${path} must be a safe integer${minimum ? ` >= ${minimum}` : ''}.`
		);
	}
	return number;
}

function requireOneOf<const T extends readonly string[]>(
	value: unknown,
	values: T,
	path: string
): T[number] {
	if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
		fail('invalid-value', path, value, `${path} contains an unsupported value.`);
	}
	return value as T[number];
}

function cloneValue<T>(value: T, path = 'scenarioStore'): T {
	try {
		return structuredClone(value);
	} catch (error) {
		fail(
			'not-cloneable',
			path,
			String(error),
			`${path} must contain only structured-cloneable data.`
		);
	}
}

function deeplyEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
		return false;
	}
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
		return left.every((value, index) => deeplyEqual(value, right[index]));
	}
	if (!isRecord(left) || !isRecord(right)) return false;
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	return leftKeys.every((key) => Object.hasOwn(right, key) && deeplyEqual(left[key], right[key]));
}

function isScenarioId(value: string): value is ScenarioId {
	return (SCENARIO_IDS as readonly string[]).includes(value);
}

function validateDefinitionRef(value: unknown, path: string): ScenarioDefinitionRef {
	const ref = requireRecord(value, path);
	const scenarioId = requireString(ref.scenarioId, `${path}.scenarioId`);
	if (!isScenarioId(scenarioId)) {
		fail('unknown-scenario', `${path}.scenarioId`, scenarioId, 'Unknown scenario ID.');
	}
	const version = requireInteger(ref.version, `${path}.version`, 1);
	return { scenarioId, version };
}

function resolveSupportedDefinition(
	ref: ScenarioDefinitionRef,
	resolveDefinition: ScenarioDefinitionResolver,
	path: string
): ScenarioDefinition {
	let definition: ScenarioDefinition | undefined;
	try {
		definition = resolveDefinition(ref);
	} catch (error) {
		fail('unsupported-definition', path, ref, `Definition resolution failed: ${String(error)}`);
	}
	if (!definition || definition.id !== ref.scenarioId || definition.version !== ref.version) {
		fail(
			'unsupported-definition',
			path,
			ref,
			`Scenario definition ${scenarioDefinitionKey(ref)} is not supported.`
		);
	}
	return definition;
}

function validateWindow(value: unknown, path: string): void {
	const window = requireRecord(value, path);
	const kind = requireOneOf(window.kind, WINDOW_KINDS, `${path}.kind`);
	if (kind === 'trailing-reports') requireInteger(window.count, `${path}.count`, 1);
	if (kind === 'fixed-report-days') {
		requireInteger(window.startDay, `${path}.startDay`, 1);
		requireInteger(window.endDay, `${path}.endDay`, 1);
	}
}

function validateEvidence(value: unknown, path: string, conditionId: string): void {
	const evidence = requireRecord(value, path);
	if (requireString(evidence.conditionId, `${path}.conditionId`) !== conditionId) {
		fail(
			'condition-id-mismatch',
			`${path}.conditionId`,
			evidence.conditionId,
			'Evidence must reference its containing condition.'
		);
	}
	requireOneOf(evidence.metric, METRICS, `${path}.metric`);
	requireOneOf(evidence.comparator, COMPARATORS, `${path}.comparator`);
	requireFiniteNumber(evidence.target, `${path}.target`);
	requireFiniteNumber(evidence.actual, `${path}.actual`);
	requireInteger(evidence.day, `${path}.day`, 1);
	validateWindow(evidence.window, `${path}.window`);
	requireArray(evidence.contributingIds, `${path}.contributingIds`).forEach((id, index) =>
		requireString(id, `${path}.contributingIds[${index}]`)
	);
}

function validateObjectiveEvaluation(value: unknown, path: string): void {
	const objective = requireRecord(value, path);
	const conditionId = requireString(objective.conditionId, `${path}.conditionId`);
	requireOneOf(objective.status, OBJECTIVE_STATUSES, `${path}.status`);
	validateEvidence(objective.evidence, `${path}.evidence`, conditionId);
}

function validateFailureEvaluation(value: unknown, path: string): void {
	const failure = requireRecord(value, path);
	const conditionId = requireString(failure.conditionId, `${path}.conditionId`);
	requireOneOf(failure.status, FAILURE_STATUSES, `${path}.status`);
	validateEvidence(failure.evidence, `${path}.evidence`, conditionId);
}

function validateEvaluation(value: unknown, path: string): ScenarioEvaluation {
	const evaluation = requireRecord(value, path);
	requireInteger(evaluation.day, `${path}.day`, 1);
	requireArray(evaluation.required, `${path}.required`).forEach((objective, index) =>
		validateObjectiveEvaluation(objective, `${path}.required[${index}]`)
	);
	requireArray(evaluation.optional, `${path}.optional`).forEach((objective, index) =>
		validateObjectiveEvaluation(objective, `${path}.optional[${index}]`)
	);
	requireArray(evaluation.failures, `${path}.failures`).forEach((failure, index) =>
		validateFailureEvaluation(failure, `${path}.failures[${index}]`)
	);
	if (evaluation.deadline !== null) {
		const deadline = requireRecord(evaluation.deadline, `${path}.deadline`);
		requireBoolean(deadline.triggered, `${path}.deadline.triggered`);
		const evidence = requireRecord(deadline.evidence, `${path}.deadline.evidence`);
		if (evidence.conditionId !== 'deadline-exceeded') {
			fail(
				'invalid-deadline',
				`${path}.deadline.evidence.conditionId`,
				evidence.conditionId,
				'Deadline evidence must use the deadline-exceeded condition ID.'
			);
		}
		requireInteger(evidence.day, `${path}.deadline.evidence.day`, 1);
		requireInteger(evidence.dayLimit, `${path}.deadline.evidence.dayLimit`, 1);
	}
	requireArray(evaluation.risks, `${path}.risks`).forEach((risk, index) => {
		const riskPath = `${path}.risks[${index}]`;
		const record = requireRecord(risk, riskPath);
		if (record.kind === 'condition') {
			requireString(record.conditionId, `${riskPath}.conditionId`);
			requireFiniteNumber(record.distance, `${riskPath}.distance`);
			requireBoolean(record.triggered, `${riskPath}.triggered`);
			return;
		}
		if (record.kind === 'deadline') {
			requireFiniteNumber(record.daysRemaining, `${riskPath}.daysRemaining`);
			requireBoolean(record.triggered, `${riskPath}.triggered`);
			return;
		}
		fail('invalid-risk', `${riskPath}.kind`, record.kind, 'Unsupported scenario risk kind.');
	});
	const projection = requireRecord(evaluation.projection, `${path}.projection`);
	const score = requireInteger(projection.score, `${path}.projection.score`, 0);
	if (score > 1000) {
		fail('invalid-score', `${path}.projection.score`, score, 'Scenario score cannot exceed 1000.');
	}
	requireOneOf(projection.medal, MEDALS, `${path}.projection.medal`);
	requireArray(projection.componentPoints, `${path}.projection.componentPoints`).forEach(
		(points, index) => requireInteger(points, `${path}.projection.componentPoints[${index}]`, 0)
	);
	return evaluation as unknown as ScenarioEvaluation;
}

function validateResult(
	value: unknown,
	resolveDefinition: ScenarioDefinitionResolver,
	path: string
): ScenarioResult {
	const result = requireRecord(value, path);
	const definitionRef = validateDefinitionRef(result.definition, `${path}.definition`);
	const definition = resolveSupportedDefinition(
		definitionRef,
		resolveDefinition,
		`${path}.definition`
	);
	const seed = requireInteger(result.seed, `${path}.seed`, 1);
	const eligibility = requireOneOf(result.eligibility, ELIGIBILITIES, `${path}.eligibility`);
	const expectedEligibility = seed === definition.officialSeed ? 'ranked' : 'unranked';
	if (eligibility !== expectedEligibility) {
		fail(
			'eligibility-mismatch',
			`${path}.eligibility`,
			eligibility,
			'Eligibility must match the definition official seed.'
		);
	}
	const outcome = requireOneOf(
		result.outcome,
		['completed', 'failed', 'abandoned'] as const,
		`${path}.outcome`
	);
	const completionDay = requireInteger(result.completionDay, `${path}.completionDay`, 1);
	const score = requireInteger(result.score, `${path}.score`, 0);
	if (score > 1000)
		fail('invalid-score', `${path}.score`, score, 'Scenario score cannot exceed 1000.');
	const evaluation = validateEvaluation(result.evaluation, `${path}.evaluation`);
	if (evaluation.day !== completionDay || evaluation.projection.score !== score) {
		fail(
			'result-evaluation-mismatch',
			path,
			{ completionDay, score },
			'Terminal result day and score must match its evaluation.'
		);
	}
	if (outcome === 'completed') {
		const medal = requireOneOf(result.medal, MEDALS, `${path}.medal`);
		if (medal !== evaluation.projection.medal) {
			fail('medal-mismatch', `${path}.medal`, medal, 'Result medal must match its projection.');
		}
	} else if (result.medal !== null) {
		fail(
			'invalid-medal',
			`${path}.medal`,
			result.medal,
			'Failed and abandoned runs have no medal.'
		);
	}
	return result as unknown as ScenarioResult;
}

function validateRunWithGame(
	runValue: unknown,
	game: ReturnType<typeof validateCurrentGameState>,
	resolveDefinition: ScenarioDefinitionResolver,
	path: string
): ScenarioRun {
	const run = requireRecord(runValue, path);
	const definitionRef = validateDefinitionRef(run.definition, `${path}.definition`);
	const definition = resolveSupportedDefinition(
		definitionRef,
		resolveDefinition,
		`${path}.definition`
	);
	const seed = requireInteger(run.seed, `${path}.seed`, 1);
	const eligibility = requireOneOf(run.eligibility, ELIGIBILITIES, `${path}.eligibility`);
	const expectedEligibility = seed === definition.officialSeed ? 'ranked' : 'unranked';
	if (eligibility !== expectedEligibility) {
		fail(
			'eligibility-mismatch',
			`${path}.eligibility`,
			eligibility,
			'Eligibility must match the definition official seed.'
		);
	}
	const status = requireOneOf(run.status, RUN_STATUSES, `${path}.status`);
	const evaluation = validateEvaluation(run.evaluation, `${path}.evaluation`);
	if (seed !== game.seed || evaluation.day !== game.day) {
		fail(
			'run-game-mismatch',
			path,
			{ runSeed: seed, gameSeed: game.seed, evaluationDay: evaluation.day, gameDay: game.day },
			'Run seed and evaluation day must match the embedded game.'
		);
	}
	let result: ScenarioResult | null;
	if (status === 'active') {
		if (run.result !== null) {
			fail(
				'invalid-active-run',
				`${path}.result`,
				run.result,
				'An active run cannot have a result.'
			);
		}
		result = null;
	} else {
		if (run.result === null) {
			fail(
				'invalid-terminal-run',
				`${path}.result`,
				run.result,
				'A terminal run must have a result.'
			);
		}
		result = validateResult(run.result, resolveDefinition, `${path}.result`);
		if (
			result.outcome !== status ||
			result.seed !== seed ||
			result.eligibility !== eligibility ||
			!deeplyEqual(result.definition, definitionRef) ||
			!deeplyEqual(result.evaluation, evaluation)
		) {
			fail(
				'terminal-run-mismatch',
				`${path}.result`,
				result,
				'Terminal result must exactly describe its containing run.'
			);
		}
	}
	return {
		...(run as Omit<ScenarioRun, 'game'>),
		definition: definitionRef,
		seed,
		eligibility,
		status,
		game,
		evaluation,
		result
	};
}

function scenarioRunEnvelope(run: ScenarioRun): Omit<ScenarioRun, 'game'> {
	return {
		definition: run.definition,
		seed: run.seed,
		eligibility: run.eligibility,
		status: run.status,
		evaluation: run.evaluation,
		result: run.result
	};
}

export function scenarioDefinitionKey(ref: ScenarioDefinitionRef): ScenarioDefinitionKey {
	return `${ref.scenarioId}@${ref.version}`;
}

export function createEmptyScenarioStore(): ScenarioStoreSnapshot {
	return {
		schemaVersion: SCENARIO_STORE_SCHEMA_VERSION,
		activeRunsByScenarioId: {},
		bestResultsByDefinitionKey: {}
	};
}

export function validateScenarioRun(
	value: unknown,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioRun {
	const source = cloneValue(value, 'run');
	const run = requireRecord(source, 'run');
	let game: ReturnType<typeof validateCurrentGameState>;
	try {
		game = validateCurrentGameState(run.game);
	} catch (error) {
		fail('invalid-game', 'run.game', String(error), 'Run game failed strict current validation.');
	}
	if (!deeplyEqual(game, run.game)) {
		fail(
			'current-game-mismatch',
			'run.game',
			undefined,
			'Current-schema validation must not transform a scenario game.'
		);
	}
	return validateRunWithGame(
		scenarioRunEnvelope(run as unknown as ScenarioRun),
		game,
		resolveDefinition,
		'run'
	);
}

export function encodeScenarioRunRecord(
	run: ScenarioRun,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioRunRecord {
	const validated = validateScenarioRun(run, resolveDefinition);
	const { game, ...runEnvelope } = validated;
	return {
		scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
		gameSchemaVersion: SAVE_SCHEMA_VERSION,
		run: runEnvelope,
		game
	};
}

export const createScenarioRunRecord = encodeScenarioRunRecord;

export function encodeScenarioBestResultRecord(
	result: ScenarioResult,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioBestResultRecord {
	const source = cloneValue(result, 'result');
	const validated = validateResult(source, resolveDefinition, 'result');
	if (validated.outcome !== 'completed' || validated.eligibility !== 'ranked') {
		fail(
			'invalid-best-result',
			'result',
			{ outcome: validated.outcome, eligibility: validated.eligibility },
			'Only ranked completed results can be stored as best results.'
		);
	}
	return { scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION, result: validated };
}

export const createScenarioBestResultRecord = encodeScenarioBestResultRecord;

function decodeActiveRunRecord(
	value: unknown,
	scenarioId: ScenarioId,
	resolveDefinition: ScenarioDefinitionResolver,
	path: string
): ScenarioRunRecord {
	const record = requireRecord(value, path);
	const scenarioSchemaVersion = requireInteger(
		record.scenarioSchemaVersion,
		`${path}.scenarioSchemaVersion`
	);
	if (scenarioSchemaVersion !== SCENARIO_RUN_SCHEMA_VERSION) {
		fail(
			'unsupported-scenario-schema',
			`${path}.scenarioSchemaVersion`,
			scenarioSchemaVersion,
			`Unsupported scenario run schema version: ${scenarioSchemaVersion}.`
		);
	}
	const gameSchemaVersion = requireInteger(record.gameSchemaVersion, `${path}.gameSchemaVersion`);
	let migrated: unknown;
	try {
		migrated = migrateSavedGame(record.game, gameSchemaVersion);
	} catch (error) {
		fail(
			'unsupported-game-schema',
			`${path}.gameSchemaVersion`,
			gameSchemaVersion,
			`Embedded game migration failed: ${String(error)}`
		);
	}
	let game: ReturnType<typeof validateCurrentGameState>;
	try {
		game = validateCurrentGameState(migrated);
	} catch (error) {
		fail('invalid-game', `${path}.game`, String(error), 'Embedded game failed strict validation.');
	}
	if (gameSchemaVersion === SAVE_SCHEMA_VERSION && !deeplyEqual(game, record.game)) {
		fail(
			'current-game-mismatch',
			`${path}.game`,
			undefined,
			'Current-schema validation must not transform a scenario game.'
		);
	}
	const runEnvelope = requireRecord(record.run, `${path}.run`);
	if (Object.hasOwn(runEnvelope, 'game')) {
		fail(
			'invalid-run-envelope',
			`${path}.run.game`,
			runEnvelope.game,
			'Run envelope must not contain game.'
		);
	}
	const run = validateRunWithGame(runEnvelope, game, resolveDefinition, `${path}.run`);
	if (run.definition.scenarioId !== scenarioId) {
		fail(
			'definition-key-mismatch',
			`${path}.run.definition.scenarioId`,
			run.definition.scenarioId,
			'Active-run key must match the embedded definition scenario ID.'
		);
	}
	if (run.status !== 'active' || run.result !== null) {
		fail('invalid-active-run', `${path}.run.status`, run.status, 'Only active runs are resumable.');
	}
	return {
		scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
		gameSchemaVersion: SAVE_SCHEMA_VERSION,
		run: scenarioRunEnvelope(run),
		game
	};
}

function decodeBestResultRecord(
	value: unknown,
	key: string,
	resolveDefinition: ScenarioDefinitionResolver,
	path: string
): ScenarioBestResultRecord {
	const record = requireRecord(value, path);
	const scenarioSchemaVersion = requireInteger(
		record.scenarioSchemaVersion,
		`${path}.scenarioSchemaVersion`
	);
	if (scenarioSchemaVersion !== SCENARIO_RUN_SCHEMA_VERSION) {
		fail(
			'unsupported-scenario-schema',
			`${path}.scenarioSchemaVersion`,
			scenarioSchemaVersion,
			`Unsupported scenario result schema version: ${scenarioSchemaVersion}.`
		);
	}
	const result = validateResult(record.result, resolveDefinition, `${path}.result`);
	if (scenarioDefinitionKey(result.definition) !== key) {
		fail(
			'definition-key-mismatch',
			`${path}.result.definition`,
			result.definition,
			'Best-result key must match its embedded definition reference.'
		);
	}
	if (result.outcome !== 'completed' || result.eligibility !== 'ranked') {
		fail(
			'invalid-best-result',
			`${path}.result`,
			{ outcome: result.outcome, eligibility: result.eligibility },
			'Only ranked completed results can be stored as best results.'
		);
	}
	return { scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION, result };
}

function collectEntry<T>(operation: () => T, diagnostics: ScenarioDiagnostic[]): T | undefined {
	try {
		return operation();
	} catch (error) {
		if (error instanceof ScenarioValidationFailure) {
			diagnostics.push(error.diagnostic);
			return undefined;
		}
		throw error;
	}
}

export function decodeScenarioStoreSnapshot(
	value: unknown,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): DecodeScenarioStoreResult {
	let source: unknown;
	try {
		source = cloneValue(value);
	} catch (error) {
		if (error instanceof ScenarioValidationFailure) {
			return { snapshot: createEmptyScenarioStore(), diagnostics: [error.diagnostic] };
		}
		throw error;
	}
	if (!isRecord(source)) {
		return {
			snapshot: createEmptyScenarioStore(),
			diagnostics: [
				diagnostic(
					'invalid-store',
					'scenarioStore',
					source,
					'Scenario store must be a plain object.'
				)
			]
		};
	}
	if (source.schemaVersion !== SCENARIO_STORE_SCHEMA_VERSION) {
		return {
			snapshot: createEmptyScenarioStore(),
			diagnostics: [
				diagnostic(
					'unsupported-store-schema',
					'scenarioStore.schemaVersion',
					source.schemaVersion,
					`Unsupported scenario store schema version: ${String(source.schemaVersion)}.`
				)
			]
		};
	}

	const diagnostics: ScenarioDiagnostic[] = [];
	const decoded = createEmptyScenarioStore();
	const activeSource = collectEntry(
		() => requireRecord(source.activeRunsByScenarioId, 'activeRunsByScenarioId'),
		diagnostics
	);
	if (activeSource) {
		for (const [key, entry] of Object.entries(activeSource).sort(([left], [right]) =>
			compareCodeUnits(left, right)
		)) {
			if (!isScenarioId(key)) {
				diagnostics.push(
					diagnostic(
						'unknown-scenario',
						`activeRunsByScenarioId.${key}`,
						key,
						'Unknown scenario ID.'
					)
				);
				continue;
			}
			const record = collectEntry(
				() => decodeActiveRunRecord(entry, key, resolveDefinition, `activeRunsByScenarioId.${key}`),
				diagnostics
			);
			if (record) decoded.activeRunsByScenarioId[key] = record;
		}
	}

	const bestSource = collectEntry(
		() => requireRecord(source.bestResultsByDefinitionKey, 'bestResultsByDefinitionKey'),
		diagnostics
	);
	if (bestSource) {
		for (const [key, entry] of Object.entries(bestSource).sort(([left], [right]) =>
			compareCodeUnits(left, right)
		)) {
			const record = collectEntry(
				() =>
					decodeBestResultRecord(
						entry,
						key,
						resolveDefinition,
						`bestResultsByDefinitionKey.${key}`
					),
				diagnostics
			);
			if (record) {
				decoded.bestResultsByDefinitionKey[key as ScenarioDefinitionKey] = record;
			}
		}
	}

	return { snapshot: decoded, diagnostics: sortDiagnostics(diagnostics) };
}

export function parseScenarioStoreSnapshot(
	serialized: string,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): DecodeScenarioStoreResult {
	try {
		return decodeScenarioStoreSnapshot(JSON.parse(serialized), resolveDefinition);
	} catch (error) {
		return {
			snapshot: createEmptyScenarioStore(),
			diagnostics: [
				diagnostic(
					'invalid-json',
					'scenarioStore',
					String(error),
					'Scenario store is not valid JSON.'
				)
			]
		};
	}
}

export function validateScenarioStoreSnapshot(
	value: unknown,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioStoreSnapshot {
	const decoded = decodeScenarioStoreSnapshot(value, resolveDefinition);
	if (decoded.diagnostics.length > 0) {
		throw new ScenarioCodecError('Scenario store contains invalid data.', decoded.diagnostics);
	}
	return decoded.snapshot;
}

export function cloneScenarioStoreSnapshot(
	value: ScenarioStoreSnapshot,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioStoreSnapshot {
	return validateScenarioStoreSnapshot(value, resolveDefinition);
}
