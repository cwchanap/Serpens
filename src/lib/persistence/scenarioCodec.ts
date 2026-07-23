import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import {
	isScenarioConditionWindowCompleteAtDay,
	scenarioConditionPasses
} from '$lib/scenarios/metrics';
import { evaluateScenario } from '$lib/scenarios/runtime';
import { medalForScore } from '$lib/scenarios/scoring';
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
import { createPlainSnapshot, migrateSavedGame, validateCurrentGameState } from './saveCodec';
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

const scenarioValidationFailures = new WeakSet<object>();

class ScenarioValidationFailure extends Error {
	constructor(readonly diagnostic: ScenarioDiagnostic) {
		super(diagnostic.detail);
		this.name = 'ScenarioValidationFailure';
		scenarioValidationFailures.add(this);
	}
}

function isScenarioValidationFailure(error: unknown): error is ScenarioValidationFailure {
	return (
		typeof error === 'object' && error !== null && scenarioValidationFailures.has(error as object)
	);
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

function safeDescribe(value: unknown): string {
	if (value === null) return 'null';
	switch (typeof value) {
		case 'string':
			return value;
		case 'number':
			return Number.isFinite(value) ? `${value}` : 'non-finite number';
		case 'boolean':
			return value ? 'true' : 'false';
		case 'undefined':
			return 'undefined';
		case 'bigint':
			return `${value}`;
		case 'symbol':
			return '[symbol]';
		case 'function':
			return '[function]';
		case 'object':
			return '[object]';
	}
	return '[unknown]';
}

function sanitizeDiagnosticValue(value: unknown): unknown {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		typeof value === 'undefined'
	) {
		return value;
	}
	if (typeof value === 'number') return Number.isFinite(value) ? value : safeDescribe(value);
	return safeDescribe(value);
}

function diagnostic(
	code: string,
	path: string,
	value: unknown,
	detail: string
): ScenarioDiagnostic {
	return { code, path, value: sanitizeDiagnosticValue(value), detail };
}

function fail(code: string, path: string, value: unknown, detail: string): never {
	throw new ScenarioValidationFailure(diagnostic(code, path, value, detail));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null) return false;
	try {
		if (Array.isArray(value)) return false;
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	} catch {
		return false;
	}
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
		return createPlainSnapshot(value, path, { rejectCycles: true }) as T;
	} catch (error) {
		fail(
			'not-cloneable',
			path,
			safeDescribe(error),
			`${path} must contain only bounded, acyclic, structured-cloneable own data properties.`
		);
	}
}

function deeplyEqual(left: unknown, right: unknown): boolean {
	const worklist: Array<[unknown, unknown]> = [[left, right]];
	const compared = new WeakMap<object, WeakSet<object>>();
	let nodes = 0;
	while (worklist.length > 0) {
		const [first, second] = worklist.pop()!;
		if (Object.is(first, second)) continue;
		if (
			typeof first !== 'object' ||
			first === null ||
			typeof second !== 'object' ||
			second === null
		) {
			return false;
		}
		nodes += 1;
		if (nodes > 250_000) return false;
		let seconds = compared.get(first);
		if (seconds?.has(second)) continue;
		if (!seconds) {
			seconds = new WeakSet<object>();
			compared.set(first, seconds);
		}
		seconds.add(second);
		const firstIsArray = Array.isArray(first);
		const secondIsArray = Array.isArray(second);
		if (firstIsArray || secondIsArray) {
			if (!firstIsArray || !secondIsArray) return false;
			const firstArray = first as unknown[];
			const secondArray = second as unknown[];
			if (firstArray.length !== secondArray.length) return false;
			for (let index = 0; index < firstArray.length; index += 1) {
				worklist.push([firstArray[index], secondArray[index]]);
			}
			continue;
		}
		if (!isRecord(first) || !isRecord(second)) return false;
		const firstKeys = Object.keys(first);
		const secondKeys = Object.keys(second);
		if (firstKeys.length !== secondKeys.length) return false;
		for (const key of firstKeys) {
			if (!Object.hasOwn(second, key)) return false;
			worklist.push([first[key], second[key]]);
		}
	}
	return true;
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
		fail(
			'unsupported-definition',
			path,
			ref,
			`Definition resolution failed: ${safeDescribe(error)}`
		);
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
	requireArray(projection.componentEvidence, `${path}.projection.componentEvidence`).forEach(
		(evidenceValue, index) => {
			if (evidenceValue === null) return;
			const evidencePath = `${path}.projection.componentEvidence[${index}]`;
			const evidence = requireRecord(evidenceValue, evidencePath);
			if (evidence.kind !== 'metric') {
				fail(
					'invalid-value',
					`${evidencePath}.kind`,
					evidence.kind,
					'Score component evidence must use the metric kind.'
				);
			}
			requireRecord(evidence.query, `${evidencePath}.query`);
			validateWindow(evidence.window, `${evidencePath}.window`);
			requireFiniteNumber(evidence.actual, `${evidencePath}.actual`);
			requireInteger(evidence.day, `${evidencePath}.day`, 1);
			requireBoolean(evidence.windowComplete, `${evidencePath}.windowComplete`);
		}
	);
	return evaluation as unknown as ScenarioEvaluation;
}

type EvaluationPhase = 'active' | 'terminal';

function normalizedPoints(actual: number, zeroAt: number, fullAt: number, points: number): number {
	if (zeroAt === fullAt) return actual >= fullAt ? points : 0;
	const ratio = (actual - zeroAt) / (fullAt - zeroAt);
	return Math.round(Math.min(1, Math.max(0, ratio)) * points);
}

function validateConditionContract(
	evaluation: ScenarioEvaluation['required'][number] | ScenarioEvaluation['failures'][number],
	condition: ScenarioDefinition['requiredObjectives'][number],
	evaluationDay: number,
	phase: EvaluationPhase,
	isFailure: boolean,
	path: string
): void {
	if (
		evaluation.conditionId !== condition.id ||
		evaluation.evidence.conditionId !== condition.id ||
		evaluation.evidence.metric !== condition.query.metric ||
		evaluation.evidence.comparator !== condition.comparator ||
		evaluation.evidence.target !== condition.target ||
		!deeplyEqual(evaluation.evidence.window, condition.window)
	) {
		fail(
			'evaluation-mismatch',
			path,
			evaluation,
			'Evaluation evidence must match the resolved scenario condition.'
		);
	}
	if (evaluation.evidence.day !== evaluationDay) {
		fail(
			'evaluation-mismatch',
			`${path}.evidence.day`,
			evaluation.evidence.day,
			'Condition evidence day must equal the containing evaluation day.'
		);
	}
	const passes = scenarioConditionPasses(
		condition,
		evaluation.evidence.actual,
		isScenarioConditionWindowCompleteAtDay(condition, evaluationDay)
	);
	const expectedStatus = isFailure
		? passes
			? 'triggered'
			: 'inactive'
		: passes
			? 'satisfied'
			: phase === 'active'
				? 'pending'
				: 'missed';
	if (evaluation.status !== expectedStatus) {
		fail(
			'evaluation-mismatch',
			`${path}.status`,
			evaluation.status,
			'Condition status must be derived from its actual value, comparator, target, and phase.'
		);
	}
}

function validateEvaluationContract(
	evaluation: ScenarioEvaluation,
	definition: ScenarioDefinition,
	path: string,
	phase: EvaluationPhase
): void {
	const groups = [
		['required', evaluation.required, definition.requiredObjectives],
		['optional', evaluation.optional, definition.optionalObjectives],
		['failures', evaluation.failures, definition.failures]
	] as const;
	for (const [name, evaluated, conditions] of groups) {
		if (evaluated.length !== conditions.length) {
			fail(
				'evaluation-mismatch',
				`${path}.${name}`,
				evaluated.length,
				`${name} evaluations must match the resolved definition cardinality.`
			);
		}
		for (let index = 0; index < conditions.length; index += 1) {
			validateConditionContract(
				evaluated[index],
				conditions[index],
				evaluation.day,
				phase,
				name === 'failures',
				`${path}.${name}[${index}]`
			);
		}
	}

	const deadlineTriggered = evaluation.day >= definition.dayLimit;
	if (
		deadlineTriggered !== (evaluation.deadline !== null) ||
		(evaluation.deadline !== null &&
			(!evaluation.deadline.triggered ||
				evaluation.deadline.evidence.day !== evaluation.day ||
				evaluation.deadline.evidence.dayLimit !== definition.dayLimit))
	) {
		fail(
			'evaluation-mismatch',
			`${path}.deadline`,
			evaluation.deadline,
			'Deadline evaluation must match the resolved definition and evaluation day.'
		);
	}

	if (evaluation.risks.length !== definition.failures.length + 1) {
		fail(
			'evaluation-mismatch',
			`${path}.risks`,
			evaluation.risks.length,
			'Risk projections must contain the resolved failures followed by the deadline risk.'
		);
	}
	for (let index = 0; index < definition.failures.length; index += 1) {
		const risk = evaluation.risks[index];
		const distance = Math.abs(
			evaluation.failures[index].evidence.actual - definition.failures[index].target
		);
		const expectedDistance = Number.isFinite(distance) ? distance : 0;
		if (
			risk?.kind !== 'condition' ||
			risk.conditionId !== definition.failures[index].id ||
			risk.triggered !== (evaluation.failures[index].status === 'triggered') ||
			risk.distance !== expectedDistance
		) {
			fail(
				'evaluation-mismatch',
				`${path}.risks[${index}]`,
				risk,
				'Failure risk identity and state must match the resolved definition evaluation.'
			);
		}
	}
	const deadlineRisk = evaluation.risks[definition.failures.length];
	if (
		deadlineRisk?.kind !== 'deadline' ||
		deadlineRisk.triggered !== deadlineTriggered ||
		deadlineRisk.daysRemaining !== Math.max(0, definition.dayLimit - evaluation.day)
	) {
		fail(
			'evaluation-mismatch',
			`${path}.risks[${definition.failures.length}]`,
			deadlineRisk,
			'Deadline risk must match the resolved definition and evaluation day.'
		);
	}

	const points = evaluation.projection.componentPoints;
	const componentEvidence = evaluation.projection.componentEvidence;
	if (points.length !== definition.scoreComponents.length) {
		fail(
			'evaluation-mismatch',
			`${path}.projection.componentPoints`,
			points.length,
			'Score components must match the resolved definition cardinality.'
		);
	}
	if (componentEvidence.length !== definition.scoreComponents.length) {
		fail(
			'evaluation-mismatch',
			`${path}.projection.componentEvidence`,
			componentEvidence.length,
			'Score component evidence must align with the resolved definition cardinality.'
		);
	}
	for (let index = 0; index < definition.scoreComponents.length; index += 1) {
		const component = definition.scoreComponents[index];
		const componentPoints = points[index];
		const evidence = componentEvidence[index];
		if (componentPoints > component.points) {
			fail(
				'evaluation-mismatch',
				`${path}.projection.componentPoints[${index}]`,
				componentPoints,
				'Score component points cannot exceed the resolved component maximum.'
			);
		}
		if (component.kind === 'optional-objective') {
			if (evidence !== null) {
				fail(
					'evaluation-mismatch',
					`${path}.projection.componentEvidence[${index}]`,
					evidence,
					'Optional-objective components do not carry metric evidence.'
				);
			}
			const objective = evaluation.optional.find(
				(candidate) => candidate.conditionId === component.objectiveId
			);
			const expected = objective?.status === 'satisfied' ? component.points : 0;
			if (!objective || componentPoints !== expected) {
				fail(
					'evaluation-mismatch',
					`${path}.projection.componentPoints[${index}]`,
					componentPoints,
					'Optional-objective points must match the resolved objective state.'
				);
			}
		} else if (component.kind === 'remaining-days') {
			if (evidence !== null) {
				fail(
					'evaluation-mismatch',
					`${path}.projection.componentEvidence[${index}]`,
					evidence,
					'Remaining-day components do not carry metric evidence.'
				);
			}
			const expected = normalizedPoints(
				definition.dayLimit - evaluation.day,
				component.zeroBonusAt,
				component.fullBonusAt,
				component.points
			);
			if (componentPoints !== expected) {
				fail(
					'evaluation-mismatch',
					`${path}.projection.componentPoints[${index}]`,
					componentPoints,
					'Remaining-day points must be derived from the definition day limit and evaluation day.'
				);
			}
		} else {
			if (
				evidence === null ||
				evidence.kind !== 'metric' ||
				!deeplyEqual(evidence.query, component.query) ||
				!deeplyEqual(evidence.window, component.window) ||
				evidence.day !== evaluation.day ||
				evidence.windowComplete !== true
			) {
				fail(
					'evaluation-mismatch',
					`${path}.projection.componentEvidence[${index}]`,
					evidence,
					'Metric component evidence must match its definition query, window, day, and completeness.'
				);
			}
			const expected = normalizedPoints(
				evidence.actual,
				component.zeroBonusAt,
				component.fullBonusAt,
				component.points
			);
			if (componentPoints !== expected) {
				fail(
					'evaluation-mismatch',
					`${path}.projection.componentPoints[${index}]`,
					componentPoints,
					'Metric points must be derived from canonical score component evidence.'
				);
			}
		}
	}
	const expectedScore = Math.min(
		1000,
		Math.max(
			0,
			points.reduce((total, componentPoints) => total + componentPoints, 500)
		)
	);
	if (
		evaluation.projection.score !== expectedScore ||
		evaluation.projection.medal !== medalForScore(definition, 'completed', expectedScore)
	) {
		fail(
			'evaluation-mismatch',
			`${path}.projection`,
			evaluation.projection,
			'Score and projected medal must follow the resolved definition scoring contract.'
		);
	}
}

function selectedTerminalStatus(evaluation: ScenarioEvaluation): 'active' | 'completed' | 'failed' {
	if (evaluation.failures.some((failure) => failure.status === 'triggered')) return 'failed';
	if (evaluation.required.every((objective) => objective.status === 'satisfied'))
		return 'completed';
	if (evaluation.deadline?.triggered) return 'failed';
	return 'active';
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
	validateEvaluationContract(evaluation, definition, `${path}.evaluation`, 'terminal');
	if (evaluation.day !== completionDay || evaluation.projection.score !== score) {
		fail(
			'result-evaluation-mismatch',
			path,
			{ completionDay, score },
			'Terminal result day and score must match its evaluation.'
		);
	}
	if (outcome !== 'abandoned') {
		const selected = selectedTerminalStatus(evaluation);
		if (selected !== outcome) {
			fail(
				'lifecycle-mismatch',
				`${path}.outcome`,
				outcome,
				'Terminal outcome must follow failure, completion, then deadline precedence.'
			);
		}
	}
	if (outcome === 'completed') {
		const medal = requireOneOf(result.medal, MEDALS, `${path}.medal`);
		if (
			medal !== evaluation.projection.medal ||
			medal !== medalForScore(definition, 'completed', score) ||
			evaluation.required.some((objective) => objective.status !== 'satisfied') ||
			evaluation.failures.some((failure) => failure.status === 'triggered')
		) {
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
	if (
		outcome === 'failed' &&
		!evaluation.failures.some((failure) => failure.status === 'triggered') &&
		!evaluation.deadline?.triggered
	) {
		fail(
			'evaluation-mismatch',
			`${path}.evaluation`,
			evaluation,
			'A failed result must contain a triggered failure condition or deadline.'
		);
	}
	return result as unknown as ScenarioResult;
}

function expectedRunEvaluation(
	definition: ScenarioDefinition,
	game: ReturnType<typeof validateCurrentGameState>,
	status: ScenarioRun['status']
): ScenarioEvaluation {
	const expected = evaluateScenario(
		definition,
		game,
		status !== 'active' && status !== 'abandoned'
	);
	if (status !== 'abandoned') return expected;
	return {
		...expected,
		required: expected.required.map((objective) =>
			objective.status === 'pending' ? { ...objective, status: 'missed' as const } : objective
		),
		optional: expected.optional.map((objective) =>
			objective.status === 'pending' ? { ...objective, status: 'missed' as const } : objective
		)
	};
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
	validateEvaluationContract(
		evaluation,
		definition,
		`${path}.evaluation`,
		status === 'active' ? 'active' : 'terminal'
	);
	if (seed !== game.seed || evaluation.day !== game.day) {
		fail(
			'run-game-mismatch',
			path,
			{ runSeed: seed, gameSeed: game.seed, evaluationDay: evaluation.day, gameDay: game.day },
			'Run seed and evaluation day must match the embedded game.'
		);
	}
	const expectedEvaluation = expectedRunEvaluation(definition, game, status);
	if (!deeplyEqual(evaluation, expectedEvaluation)) {
		fail(
			'evaluation-mismatch',
			`${path}.evaluation`,
			undefined,
			'Run evaluation must exactly match the resolved definition and embedded game.'
		);
	}
	const nonterminalEvaluation = evaluateScenario(definition, game, false);
	const selectedStatus = selectedTerminalStatus(nonterminalEvaluation);
	const expectedStatus = status === 'abandoned' ? 'active' : status;
	if (selectedStatus !== expectedStatus) {
		fail(
			'lifecycle-mismatch',
			`${path}.status`,
			status,
			'Run status must match runtime failure, completion, then deadline selection.'
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
		fail(
			'invalid-game',
			'run.game',
			safeDescribe(error),
			'Run game failed strict current validation.'
		);
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
			`Embedded game migration failed: ${safeDescribe(error)}`
		);
	}
	let game: ReturnType<typeof validateCurrentGameState>;
	try {
		game = validateCurrentGameState(migrated);
	} catch (error) {
		fail(
			'invalid-game',
			`${path}.game`,
			safeDescribe(error),
			'Embedded game failed strict validation.'
		);
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

function ownDataDescriptors(value: unknown, path: string, code: string): PropertyDescriptorMap {
	if (typeof value !== 'object' || value === null) {
		fail(code, path, value, `${path} must be a plain object with own data properties.`);
	}
	try {
		if (Array.isArray(value)) {
			fail(code, path, value, `${path} must be a plain object with own data properties.`);
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			fail(code, path, undefined, `${path} must have a plain-object prototype.`);
		}
		return Object.getOwnPropertyDescriptors(value);
	} catch (error) {
		if (isScenarioValidationFailure(error)) throw error;
		fail(code, path, safeDescribe(error), `${path} descriptors could not be inspected safely.`);
	}
}

function requireEnvelopeData(
	descriptors: PropertyDescriptorMap,
	key: string,
	path: string
): unknown {
	const descriptor = descriptors[key];
	if (!descriptor?.enumerable || !('value' in descriptor)) {
		fail(
			'invalid-store',
			`${path}.${key}`,
			undefined,
			`${path}.${key} must be an own enumerable data property.`
		);
	}
	return descriptor.value;
}

function collectOwnMapEntries(
	value: unknown,
	path: string,
	diagnostics: ScenarioDiagnostic[]
): Array<[string, unknown]> {
	const descriptors = collectEntry(
		() => ownDataDescriptors(value, path, 'invalid-record'),
		diagnostics
	);
	if (!descriptors) return [];
	let keys: PropertyKey[];
	try {
		keys = Reflect.ownKeys(value as object);
	} catch (error) {
		diagnostics.push(
			diagnostic(
				'invalid-record',
				path,
				safeDescribe(error),
				`${path} keys could not be inspected safely.`
			)
		);
		return [];
	}
	const entries: Array<[string, unknown]> = [];
	for (const key of keys) {
		const descriptor = descriptors[key as keyof PropertyDescriptorMap];
		const entryPath = `${path}.${typeof key === 'string' ? key : '[symbol]'}`;
		if (typeof key !== 'string' || !descriptor?.enumerable || !('value' in descriptor)) {
			diagnostics.push(
				diagnostic(
					'invalid-entry-descriptor',
					entryPath,
					typeof key === 'string' ? key : '[symbol]',
					'Scenario entry must be an own enumerable string-keyed data property.'
				)
			);
			continue;
		}
		entries.push([key, descriptor.value]);
	}
	return entries.sort(([left], [right]) => compareCodeUnits(left, right));
}

function cloneScenarioEntry(value: unknown, path: string): unknown {
	return cloneValue(value, path);
}

function collectEntry<T>(operation: () => T, diagnostics: ScenarioDiagnostic[]): T | undefined {
	try {
		return operation();
	} catch (error) {
		if (isScenarioValidationFailure(error)) {
			diagnostics.push(error.diagnostic);
			return undefined;
		}
		throw error;
	}
}

type EnvelopeDataRead = { ok: true; value: unknown } | { ok: false };

function readEnvelopeData(
	descriptors: PropertyDescriptorMap,
	key: string,
	path: string,
	diagnostics: ScenarioDiagnostic[]
): EnvelopeDataRead {
	try {
		return { ok: true, value: requireEnvelopeData(descriptors, key, path) };
	} catch (error) {
		if (isScenarioValidationFailure(error)) {
			diagnostics.push(error.diagnostic);
			return { ok: false };
		}
		throw error;
	}
}

export function decodeScenarioStoreSnapshot(
	value: unknown,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): DecodeScenarioStoreResult {
	let sourceDescriptors: PropertyDescriptorMap;
	try {
		sourceDescriptors = ownDataDescriptors(value, 'scenarioStore', 'invalid-store');
	} catch (error) {
		if (isScenarioValidationFailure(error)) {
			return { snapshot: createEmptyScenarioStore(), diagnostics: [error.diagnostic] };
		}
		throw error;
	}
	const schemaVersion = collectEntry(
		() => requireEnvelopeData(sourceDescriptors, 'schemaVersion', 'scenarioStore'),
		[]
	);
	if (schemaVersion !== SCENARIO_STORE_SCHEMA_VERSION) {
		return {
			snapshot: createEmptyScenarioStore(),
			diagnostics: [
				diagnostic(
					'unsupported-store-schema',
					'scenarioStore.schemaVersion',
					schemaVersion,
					`Unsupported scenario store schema version: ${safeDescribe(schemaVersion)}.`
				)
			]
		};
	}

	const diagnostics: ScenarioDiagnostic[] = [];
	const decoded = createEmptyScenarioStore();
	const activeSource = readEnvelopeData(
		sourceDescriptors,
		'activeRunsByScenarioId',
		'scenarioStore',
		diagnostics
	);
	if (activeSource.ok) {
		for (const [key, rawEntry] of collectOwnMapEntries(
			activeSource.value,
			'scenarioStore.activeRunsByScenarioId',
			diagnostics
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
			const record = collectEntry(() => {
				const path = `activeRunsByScenarioId.${key}`;
				return decodeActiveRunRecord(
					cloneScenarioEntry(rawEntry, path),
					key,
					resolveDefinition,
					path
				);
			}, diagnostics);
			if (record) decoded.activeRunsByScenarioId[key] = record;
		}
	}

	const bestSource = readEnvelopeData(
		sourceDescriptors,
		'bestResultsByDefinitionKey',
		'scenarioStore',
		diagnostics
	);
	if (bestSource.ok) {
		for (const [key, rawEntry] of collectOwnMapEntries(
			bestSource.value,
			'scenarioStore.bestResultsByDefinitionKey',
			diagnostics
		)) {
			const record = collectEntry(() => {
				const path = `bestResultsByDefinitionKey.${key}`;
				return decodeBestResultRecord(
					cloneScenarioEntry(rawEntry, path),
					key,
					resolveDefinition,
					path
				);
			}, diagnostics);
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
					safeDescribe(error),
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
