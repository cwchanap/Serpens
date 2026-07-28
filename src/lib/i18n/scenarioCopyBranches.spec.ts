import { describe, expect, it } from 'vitest';
import { createI18n, type TranslationKey } from '$lib/i18n';
import type {
	ObjectiveEvidence,
	ScenarioDefinition,
	ScenarioOperationError,
	ScenarioResult,
	ScenarioRun
} from '$lib/scenarios/types';
import {
	buildScenarioProgressView,
	buildScenarioResultsView,
	scenarioDiagnosticText,
	scenarioShareCodeErrorText
} from './scenarioCopy';

function definition(): ScenarioDefinition {
	return {
		id: 'first-profit',
		version: 1,
		titleKey: 'scenarioDefinitions.firstProfit.title',
		summaryKey: 'scenarioDefinitions.firstProfit.summary',
		briefingKey: 'scenarioDefinitions.firstProfit.briefing',
		strategyHintKey: 'scenarioDefinitions.firstProfit.strategyHint',
		officialSeed: 101,
		dayLimit: 14,
		start: {} as ScenarioDefinition['start'],
		content: {
			cityIds: ['harbor-city'],
			archetypeIds: ['convenience'],
			productCategoryIds: ['snacks'],
			materialIds: [],
			buildingTypeIds: [],
			retailPlacements: [],
			industrialPlacements: []
		},
		allowedCommands: [],
		modifiers: [],
		requiredObjectives: [
			{
				id: 'cash',
				labelKey: 'scenarioDefinitions.firstProfit.objectives.cumulativeNetIncome',
				query: { metric: 'cash' },
				comparator: 'gte',
				target: 100,
				window: { kind: 'current' }
			},
			{
				id: 'share',
				labelKey: 'scenarioDefinitions.firstProfit.objectives.cumulativeNetIncome',
				query: { metric: 'retail-local-share' },
				comparator: 'gte',
				target: 0.5,
				window: { kind: 'trailing-reports', count: 3 }
			},
			{
				id: 'units',
				labelKey: 'scenarioDefinitions.firstProfit.objectives.cumulativeNetIncome',
				query: { metric: 'units-sold' },
				comparator: 'gte',
				target: 10,
				window: { kind: 'fixed-report-days', startDay: 2, endDay: 4 }
			}
		],
		optionalObjectives: [],
		failures: [],
		scoreComponents: [],
		medalThresholds: { silver: 700, gold: 900 }
	} as ScenarioDefinition;
}

function evidence(
	conditionId: string,
	metric: ObjectiveEvidence['metric'],
	actual: number,
	target: number,
	window: ObjectiveEvidence['window']
): ObjectiveEvidence {
	return {
		conditionId,
		metric,
		comparator: 'gte',
		target,
		actual,
		day: 4,
		window,
		windowComplete: true,
		contributingIds: []
	};
}

function evaluation(): ScenarioRun['evaluation'] {
	return {
		day: 4,
		required: [
			{
				conditionId: 'cash',
				status: 'satisfied',
				evidence: evidence('cash', 'cash', 125, 100, { kind: 'current' })
			},
			{
				conditionId: 'share',
				status: 'pending',
				evidence: evidence('share', 'retail-local-share', 0.4, 0.5, {
					kind: 'trailing-reports',
					count: 3
				})
			},
			{
				conditionId: 'units',
				status: 'missed',
				evidence: evidence('units', 'units-sold', 8, 10, {
					kind: 'fixed-report-days',
					startDay: 2,
					endDay: 4
				})
			}
		],
		optional: [],
		failures: [],
		deadline: {
			triggered: true,
			evidence: { conditionId: 'deadline-exceeded', day: 4, dayLimit: 14 }
		},
		risks: [{ kind: 'condition', conditionId: 'share', distance: 0.1, triggered: true }],
		projection: { score: 650, medal: 'bronze', componentPoints: [], componentEvidence: [] }
	};
}

describe('scenario copy branches', () => {
	it('formats evidence values, windows, triggered risks, and deadlines', () => {
		const current = definition();
		const view = buildScenarioProgressView(
			current,
			{
				runId: '00000000-0000-4000-8000-000000000000',
				definition: { scenarioId: current.id, version: current.version },
				seed: current.officialSeed,
				eligibility: 'unranked',
				status: 'active',
				game: {} as never,
				evaluation: evaluation(),
				result: null
			},
			createI18n('en')
		);

		expect(view.eligibilityLabel).toBe('Unranked');
		expect(view.required[0]?.evidenceLabel).toContain('$125');
		expect(view.required[1]?.evidenceLabel).toContain('40%');
		expect(view.required[2]?.evidenceLabel).toContain('8');
		expect(view.required.map((item) => item.windowLabel)).toEqual([
			'Current value',
			'Trailing 3 reports',
			'Report days 2–4'
		]);
		expect(view.deadlineLabel).toBe('Deadline triggered on day 4');
		expect(view.riskLabels[0]).toContain('Triggered');
	});

	it.each([
		['completed', 650, 'bronze', true, 'Silver'],
		['completed', 800, 'silver', false, 'Gold'],
		['completed', 950, 'gold', false, null],
		['failed', 500, null, false, null]
	] as const)(
		'formats %s result score %s across medal branches',
		(outcome, score, medal, bestUpdated, nextMedal) => {
			const current = definition();
			const result: ScenarioResult = {
				definition: { scenarioId: current.id, version: current.version },
				seed: current.officialSeed,
				eligibility: 'ranked',
				outcome,
				completionDay: 4,
				score,
				medal,
				evaluation: evaluation()
			};

			const view = buildScenarioResultsView(current, result, bestUpdated, createI18n('en'));

			expect(view.bestLabel.length).toBeGreaterThan(0);
			expect(view.medalLabel.length).toBeGreaterThan(0);
			if (nextMedal) expect(view.nextMedalLabel).toContain(nextMedal);
			else expect(view.nextMedalLabel).toBeNull();
		}
	);

	it('maps every share-code and operation error code to localized copy', () => {
		const i18n = createI18n('en');
		const shareCodes = [
			'malformed',
			'unknown-scenario',
			'unsupported-version',
			'invalid-seed',
			'checksum-mismatch'
		] as const;
		const shareCodeKeys: Record<(typeof shareCodes)[number], TranslationKey> = {
			malformed: 'scenarioDiagnostics.malformedShareCode',
			'unknown-scenario': 'scenarioDiagnostics.unknownScenario',
			'unsupported-version': 'scenarioDiagnostics.unsupportedVersion',
			'invalid-seed': 'scenarioDiagnostics.invalidSeed',
			'checksum-mismatch': 'scenarioDiagnostics.checksumMismatch'
		};
		const operationCodes: ScenarioOperationError['code'][] = [
			'invalid-definition',
			'invalid-share-code',
			'forbidden-command',
			'forbidden-content',
			'invalid-command',
			'stale-definition',
			'persistence-read-failed',
			'persistence-write-failed',
			'terminal-run',
			'missing-run',
			'setup-invariant-failed'
		];
		const operationKeys: Record<ScenarioOperationError['code'], TranslationKey> = {
			'invalid-definition': 'scenarioDiagnostics.invalidDefinition',
			'invalid-share-code': 'scenarioDiagnostics.malformedShareCode',
			'forbidden-command': 'scenarioDiagnostics.forbiddenCommand',
			'forbidden-content': 'scenarioDiagnostics.forbiddenContent',
			'invalid-command': 'scenarioDiagnostics.invalidCommand',
			'stale-definition': 'scenarioDiagnostics.staleDefinition',
			'persistence-read-failed': 'scenarioDiagnostics.persistenceReadFailed',
			'persistence-write-failed': 'scenarioDiagnostics.persistenceWriteFailed',
			'terminal-run': 'scenarioDiagnostics.terminalRun',
			'missing-run': 'scenarioDiagnostics.missingRun',
			'setup-invariant-failed': 'scenarioDiagnostics.setupInvariantFailed'
		};
		const shareCodeMessages = shareCodes.map((code) => scenarioShareCodeErrorText(code, i18n));
		const operationMessages = operationCodes.map((code) =>
			scenarioDiagnosticText({ code, diagnostics: [] } as ScenarioOperationError, i18n)
		);

		expect(shareCodeMessages).toEqual(shareCodes.map((code) => i18n.t(shareCodeKeys[code])));
		expect(operationMessages).toEqual(operationCodes.map((code) => i18n.t(operationKeys[code])));
	});

	it('formats daily-net-income and retail-import-spend as currency', () => {
		const current = definition();
		const evaluationWithCurrencyMetrics: ScenarioRun['evaluation'] = {
			day: 4,
			required: [
				{
					conditionId: 'cash',
					status: 'satisfied',
					evidence: evidence('cash', 'daily-net-income', 200, 100, { kind: 'current' })
				},
				{
					conditionId: 'share',
					status: 'satisfied',
					evidence: evidence('share', 'retail-import-spend', 50, 100, {
						kind: 'current'
					})
				}
			],
			optional: [],
			failures: [],
			deadline: null,
			risks: [],
			projection: { score: 650, medal: 'bronze', componentPoints: [], componentEvidence: [] }
		};
		const view = buildScenarioProgressView(
			current,
			{
				runId: '00000000-0000-4000-8000-000000000000',
				definition: { scenarioId: current.id, version: current.version },
				seed: current.officialSeed,
				eligibility: 'ranked',
				status: 'active',
				game: {} as never,
				evaluation: evaluationWithCurrencyMetrics,
				result: null
			},
			createI18n('en')
		);

		expect(view.required[0]?.evidenceLabel).toContain('$200');
		expect(view.required[1]?.evidenceLabel).toContain('$50');
	});

	it('falls back to the conditionId label when an evaluation references an unknown condition', () => {
		// conditionViews looks up the condition in the definition's
		// objective/failure arrays by id. When the evaluation references a
		// conditionId that is not in the definition (e.g. a stale run from
		// an older definition version), the label falls back to the raw
		// conditionId rather than crashing.
		const current = definition();
		const view = buildScenarioProgressView(
			current,
			{
				runId: '00000000-0000-4000-8000-000000000000',
				definition: { scenarioId: current.id, version: current.version },
				seed: current.officialSeed,
				eligibility: 'ranked',
				status: 'active',
				game: {} as never,
				evaluation: {
					day: 4,
					required: [
						{
							conditionId: 'unknown-condition',
							status: 'pending',
							evidence: evidence('unknown-condition', 'cash', 50, 100, {
								kind: 'current'
							})
						}
					],
					optional: [],
					failures: [
						{
							conditionId: 'unknown-failure',
							status: 'inactive',
							evidence: evidence('unknown-failure', 'cash', 50, 0, {
								kind: 'current'
							})
						}
					],
					deadline: null,
					risks: [],
					projection: { score: 650, medal: 'bronze', componentPoints: [], componentEvidence: [] }
				},
				result: null
			},
			createI18n('en')
		);

		expect(view.required[0]?.label).toBe('unknown-condition');
		expect(view.failures[0]?.label).toBe('unknown-failure');
	});
});
