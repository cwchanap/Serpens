import { describe, expect, it } from 'vitest';
import { createI18n } from '$lib/i18n';
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
			'Last 3 reports',
			'Days 2–4'
		]);
		expect(view.deadlineLabel).toContain('Deadline reached');
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
		const operationCodes: ScenarioOperationError['code'][] = [
			'invalid-definition',
			'invalid-share-code',
			'forbidden-command',
			'forbidden-content',
			'stale-definition',
			'persistence-read-failed',
			'persistence-write-failed',
			'terminal-run',
			'missing-run',
			'setup-invariant-failed'
		];
		const shareCodeMessages = shareCodes.map((code) => scenarioShareCodeErrorText(code, i18n));
		const operationMessages = operationCodes.map((code) =>
			scenarioDiagnosticText({ code, diagnostics: [] } as ScenarioOperationError, i18n)
		);

		expect(shareCodeMessages.every((message) => message.length > 0)).toBe(true);
		expect(operationMessages.every((message) => message.length > 0)).toBe(true);
	});
});
