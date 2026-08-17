import { describe, expect, it } from 'vitest';
import { createI18n } from '$lib/i18n';
import type {
	ScenarioDefinition,
	ScenarioPersistenceSummary,
	ScenarioResult
} from '$lib/scenarios/types';
import {
	buildScenarioProgressView,
	buildScenarioResultsView,
	buildScenarioCatalogCards,
	scenarioDiagnosticText,
	scenarioShareCodeErrorText
} from './scenarioCopy';

function definition(
	id: ScenarioDefinition['id'],
	version: number,
	copyName: 'firstProfit' | 'importSqueeze' | 'localLifeline',
	officialSeed: number
): ScenarioDefinition {
	return {
		id,
		version,
		titleKey: `scenarioDefinitions.${copyName}.title`,
		summaryKey: `scenarioDefinitions.${copyName}.summary`,
		briefingKey: `scenarioDefinitions.${copyName}.briefing`,
		strategyHintKey: `scenarioDefinitions.${copyName}.strategyHint`,
		officialSeed,
		dayLimit: 14,
		content: {
			cityIds: ['harbor-city'],
			archetypeIds: ['convenience'],
			productIds: ['snacks'],
			materialIds: [],
			buildingTypeIds: [],
			retailPlacements: [],
			industrialPlacements: []
		},
		requiredObjectives: [
			{
				id: 'required',
				labelKey: `scenarioDefinitions.${copyName}.objectives.cumulativeNetIncome`,
				query: { metric: 'cumulative-net-income' },
				comparator: 'gte',
				target: 1,
				window: { kind: 'run-to-date' }
			}
		],
		optionalObjectives: [],
		failures: [],
		start: {} as ScenarioDefinition['start'],
		allowedCommands: [],
		modifiers: [],
		scoreComponents: [],
		medalThresholds: { silver: 700, gold: 900 }
	} as ScenarioDefinition;
}

function result(
	definitionValue: ScenarioDefinition,
	score: number,
	medal: ScenarioResult['medal']
): ScenarioResult {
	return {
		definition: { scenarioId: definitionValue.id, version: definitionValue.version },
		seed: definitionValue.officialSeed,
		eligibility: 'ranked',
		outcome: 'completed',
		completionDay: 10,
		score,
		medal,
		evaluation: {} as ScenarioResult['evaluation']
	};
}

describe('scenario copy', () => {
	it('builds three localized cards with current bests and ranked seed labels', () => {
		expect.assertions(8);
		const definitions = [
			definition('first-profit', 2, 'firstProfit', 101),
			definition('import-squeeze', 1, 'importSqueeze', 202),
			definition('local-lifeline', 1, 'localLifeline', 303)
		];
		const summary: ScenarioPersistenceSummary = {
			activeRunsByScenarioId: {},
			bestResultsByDefinitionKey: {
				'first-profit@2': result(definitions[0]!, 880, 'silver')
			},
			diagnostics: []
		};

		const cards = buildScenarioCatalogCards(
			definitions.map((definitionValue) => ({
				definition: definitionValue,
				available: true,
				diagnostics: []
			})),
			summary,
			createI18n('en')
		);

		expect(cards).toHaveLength(3);
		expect(cards.map((card) => card.title)).toEqual([
			'First Profit',
			'Import Squeeze',
			'Local Lifeline'
		]);
		expect(cards[0]?.seedLabel).toContain('Official seed 101');
		expect(cards[0]?.eligibilityLabel).toBe('Ranked');
		expect(cards[0]?.best?.scoreLabel).toBe('880 points');
		expect(cards[0]?.best?.medalLabel).toBe('Silver');
		expect(cards[1]?.best).toBeNull();
		expect(cards.every((card) => card.primaryAction === 'start')).toBe(true);
	});

	it('keeps current best separate while exposing an older active version and prior-version detail', () => {
		expect.assertions(7);
		const current = definition('first-profit', 2, 'firstProfit', 101);
		const old = definition('first-profit', 1, 'firstProfit', 99);
		const oldResult = result(old, 999, 'gold');
		const summary: ScenarioPersistenceSummary = {
			activeRunsByScenarioId: {
				'first-profit': {
					runId: '00000000-0000-4000-8000-000000000000',
					definition: { scenarioId: 'first-profit', version: 1 },
					seed: 777,
					eligibility: 'unranked',
					status: 'active',
					game: {} as never,
					evaluation: {} as never,
					result: null
				}
			},
			bestResultsByDefinitionKey: {
				'first-profit@1': oldResult,
				'first-profit@2': result(current, 700, 'silver')
			},
			diagnostics: []
		};

		const [card] = buildScenarioCatalogCards(
			[{ definition: current, available: true, diagnostics: [] }],
			summary,
			createI18n('en')
		);

		expect(card?.primaryAction).toBe('resume');
		expect(card?.activeVersionLabel).toBe('Active version 1 (current version 2)');
		expect(card?.seedLabel).toContain('Custom seed 777');
		expect(card?.eligibilityLabel).toBe('Unranked');
		expect(card?.showStartCurrent).toBe(true);
		expect(card?.best?.scoreLabel).toBe('700 points');
		expect(card?.priorVersionResult?.scoreLabel).toBe('999 points');
	});

	it('only exposes the exact explicitly inspected prior version', () => {
		expect.assertions(4);
		const current = definition('first-profit', 3, 'firstProfit', 101);
		const versionOne = definition('first-profit', 1, 'firstProfit', 99);
		const versionTwo = definition('first-profit', 2, 'firstProfit', 100);
		const summary: ScenarioPersistenceSummary = {
			activeRunsByScenarioId: {},
			bestResultsByDefinitionKey: {
				'first-profit@1': result(versionOne, 610, 'bronze'),
				'first-profit@2': result(versionTwo, 920, 'gold')
			},
			diagnostics: []
		};
		const entries = [{ definition: current, available: true, diagnostics: [] }];

		expect(
			buildScenarioCatalogCards(entries, summary, createI18n('en'))[0]?.priorVersionResult
		).toBeNull();
		expect(
			buildScenarioCatalogCards(entries, summary, createI18n('en'), {
				'first-profit': { scenarioId: 'first-profit', version: 1 }
			})[0]?.priorVersionResult?.scoreLabel
		).toBe('610 points');
		expect(
			buildScenarioCatalogCards(entries, summary, createI18n('en'), {
				'first-profit': { scenarioId: 'first-profit', version: 2 }
			})[0]?.priorVersionResult?.scoreLabel
		).toBe('920 points');
		expect(
			buildScenarioCatalogCards(
				entries,
				{
					...summary,
					activeRunsByScenarioId: {
						'first-profit': {
							runId: '00000000-0000-4000-8000-000000000000',
							definition: { scenarioId: 'first-profit', version: 1 },
							seed: 99,
							eligibility: 'ranked',
							status: 'active',
							game: {} as never,
							evaluation: {} as never,
							result: null
						}
					}
				},
				createI18n('ja')
			)[0]?.primaryLabel
		).toBe('バージョン 1 を再開');
	});

	it('localizes invalid built-ins and share-code/runtime diagnostics', () => {
		expect.assertions(5);
		const current = definition('first-profit', 2, 'firstProfit', 101);
		const [card] = buildScenarioCatalogCards(
			[
				{
					definition: current,
					available: false,
					diagnostics: [{ code: 'invalid-reference', path: 'content', value: null, detail: 'bad' }]
				}
			],
			{ activeRunsByScenarioId: {}, bestResultsByDefinitionKey: {}, diagnostics: [] },
			createI18n('en')
		);

		expect(card?.unavailableReason).toContain('Invalid built-in challenge');
		expect(scenarioShareCodeErrorText('malformed', createI18n('en'))).toContain('format');
		expect(scenarioShareCodeErrorText('unsupported-version', createI18n('en'))).toContain(
			'version'
		);
		expect(scenarioShareCodeErrorText('checksum-mismatch', createI18n('en'))).toContain('checksum');
		expect(
			scenarioDiagnosticText(
				{ code: 'persistence-write-failed', diagnostics: [] },
				createI18n('en')
			)
		).toContain('save');
	});

	it('formats committed evaluation progress, evidence, modifiers, risks, and contributor names', () => {
		expect.assertions(12);
		const current = definition('first-profit', 1, 'firstProfit', 101);
		current.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'all' },
				multiplier: 1.5
			}
		];
		current.optionalObjectives = [
			{
				...current.requiredObjectives[0]!,
				id: 'optional',
				labelKey: 'scenarioDefinitions.firstProfit.objectives.positiveIncomeStreak'
			}
		];
		current.failures = [
			{
				...current.requiredObjectives[0]!,
				id: 'negative-cash',
				labelKey: 'scenarioDefinitions.firstProfit.failures.negativeCash',
				comparator: 'lt',
				target: 0
			}
		];
		const evidence = {
			conditionId: 'required',
			metric: 'cumulative-net-income' as const,
			comparator: 'gte' as const,
			target: 1_000,
			actual: 1_200,
			day: 4,
			window: { kind: 'run-to-date' as const },
			windowComplete: true,
			contributingIds: ['store:store-1', 'report:3']
		};
		const evaluation = {
			day: 4,
			required: [{ conditionId: 'required', status: 'satisfied' as const, evidence }],
			optional: [
				{
					conditionId: 'optional',
					status: 'pending' as const,
					evidence: { ...evidence, conditionId: 'optional', actual: 2, target: 3 }
				}
			],
			failures: [
				{
					conditionId: 'negative-cash',
					status: 'inactive' as const,
					evidence: { ...evidence, conditionId: 'negative-cash', actual: 500, target: 0 }
				}
			],
			deadline: null,
			risks: [
				{
					kind: 'condition' as const,
					conditionId: 'negative-cash',
					distance: 500,
					triggered: false
				},
				{ kind: 'deadline' as const, daysRemaining: 10, triggered: false }
			],
			projection: {
				score: 760,
				medal: 'silver' as const,
				componentPoints: [],
				componentEvidence: []
			}
		};

		const view = buildScenarioProgressView(
			current,
			{
				runId: '00000000-0000-4000-8000-000000000000',
				definition: { scenarioId: current.id, version: 1 },
				seed: 101,
				eligibility: 'ranked',
				status: 'active',
				game: {} as never,
				evaluation,
				result: null
			},
			createI18n('en'),
			(id) => ({ 'store:store-1': 'Harbor Shop', 'report:3': 'Day 3 report' })[id] ?? id
		);

		expect(view.eligibilityLabel).toBe('Ranked');
		expect(view.dayLabel).toBe('Day 4 of 14');
		expect(view.remainingLabel).toBe('10 days remaining');
		expect(view.requiredProgressLabel).toBe('Required 1 of 1');
		expect(view.optionalProgressLabel).toBe('Optional 0 of 1');
		expect(view.scoreLabel).toBe('Projected score 760 points');
		expect(view.medalLabel).toBe('Projected medal Silver');
		expect(view.modifierLabels).toContain('Import costs ×1.5');
		expect(view.riskLabels).toContain('Deadline: 10 days remaining');
		expect(view.required[0]?.evidenceLabel).toContain('Actual $1,200');
		expect(view.required[0]?.windowLabel).toBe('Run to date');
		expect(view.required[0]?.contributorLabels).toEqual(['Harbor Shop', 'Day 3 report']);
	});

	it('formats completed and failed result views with next medal, best, and deadline evidence', () => {
		expect.assertions(8);
		const current = definition('first-profit', 1, 'firstProfit', 101);
		const evaluation = {
			day: 10,
			required: [],
			optional: [],
			failures: [],
			deadline: {
				triggered: false,
				evidence: { conditionId: 'deadline-exceeded' as const, day: 10, dayLimit: 14 }
			},
			risks: [],
			projection: {
				score: 880,
				medal: 'silver' as const,
				componentPoints: [],
				componentEvidence: []
			}
		};
		const completed = buildScenarioResultsView(
			current,
			{
				definition: { scenarioId: current.id, version: 1 },
				seed: 101,
				eligibility: 'ranked',
				outcome: 'completed',
				completionDay: 10,
				score: 880,
				medal: 'silver',
				evaluation
			},
			true,
			createI18n('en')
		);
		const failed = buildScenarioResultsView(
			current,
			{
				definition: { scenarioId: current.id, version: 1 },
				seed: 101,
				eligibility: 'ranked',
				outcome: 'failed',
				completionDay: 14,
				score: 300,
				medal: null,
				evaluation: {
					...evaluation,
					day: 14,
					deadline: {
						triggered: true,
						evidence: { conditionId: 'deadline-exceeded', day: 14, dayLimit: 14 }
					}
				}
			},
			false,
			createI18n('en')
		);

		expect(completed.outcomeLabel).toBe('Challenge completed');
		expect(completed.bestLabel).toBe('New best recorded');
		expect(completed.nextMedalLabel).toBe('20 points to Gold');
		expect(completed.deadlineLabel).toBe('Deadline not triggered: day 10 of 14');
		expect(failed.outcomeLabel).toBe('Challenge failed');
		expect(failed.medalLabel).toBe('No medal');
		expect(failed.bestLabel).toBe('Best unchanged');
		expect(failed.deadlineLabel).toBe('Deadline triggered on day 14');
	});

	it('localizes catalog card titles, eligibility, medals, and scores for ja and zh-Hant', () => {
		expect.assertions(12);
		const definitions = [
			definition('first-profit', 2, 'firstProfit', 101),
			definition('import-squeeze', 1, 'importSqueeze', 202),
			definition('local-lifeline', 1, 'localLifeline', 303)
		];
		const summary: ScenarioPersistenceSummary = {
			activeRunsByScenarioId: {},
			bestResultsByDefinitionKey: {
				'first-profit@2': result(definitions[0]!, 880, 'silver')
			},
			diagnostics: []
		};
		const entries = definitions.map((definitionValue) => ({
			definition: definitionValue,
			available: true,
			diagnostics: []
		}));

		const ja = buildScenarioCatalogCards(entries, summary, createI18n('ja'));
		expect(ja.map((card) => card.title)).toEqual(['最初の利益', '輸入圧力', '地域の生命線']);
		expect(ja[0]?.eligibilityLabel).toBe('ランク対象');
		expect(ja[0]?.best?.scoreLabel).toBe('880 ポイント');
		expect(ja[0]?.best?.medalLabel).toBe('シルバー');
		expect(ja[1]?.best).toBeNull();

		const zh = buildScenarioCatalogCards(entries, summary, createI18n('zh-Hant'));
		expect(zh.map((card) => card.title)).toEqual(['首次獲利', '進口壓力', '在地生命線']);
		expect(zh[0]?.eligibilityLabel).toBe('計入排名');
		expect(zh[0]?.best?.scoreLabel).toBe('880 分');
		expect(zh[0]?.best?.medalLabel).toBe('銀牌');
		expect(zh[1]?.best).toBeNull();
		expect(ja.every((card) => card.primaryAction === 'start')).toBe(true);
		expect(zh.every((card) => card.primaryAction === 'start')).toBe(true);
	});

	it('uses singular copy when exactly one day remains (plural slip regression)', () => {
		expect.assertions(4);
		const current = definition('first-profit', 1, 'firstProfit', 101);
		const evaluation = {
			day: 13,
			required: [],
			optional: [],
			failures: [],
			deadline: null,
			risks: [{ kind: 'deadline' as const, daysRemaining: 1, triggered: false }],
			projection: {
				score: 760,
				medal: 'silver' as const,
				componentPoints: [],
				componentEvidence: []
			}
		};
		const run = {
			runId: '00000000-0000-4000-8000-000000000000',
			definition: { scenarioId: current.id, version: 1 },
			seed: 101,
			eligibility: 'ranked' as const,
			status: 'active' as const,
			game: {} as never,
			evaluation,
			result: null
		};

		const en = buildScenarioProgressView(current, run, createI18n('en'));
		expect(en.remainingLabel).toBe('1 day remaining');
		expect(en.riskLabels).toContain('Deadline: 1 day remaining');

		// ja has no singular/plural distinction; both forms render identically.
		const ja = buildScenarioProgressView(current, run, createI18n('ja'));
		expect(ja.remainingLabel).toBe('残り1日');
		expect(ja.riskLabels).toContain('期限: 残り1日');
	});
});
