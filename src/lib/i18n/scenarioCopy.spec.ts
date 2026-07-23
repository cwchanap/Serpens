import { describe, expect, it } from 'vitest';
import { createI18n } from '$lib/i18n';
import type {
	ScenarioDefinition,
	ScenarioPersistenceSummary,
	ScenarioResult
} from '$lib/scenarios/types';
import {
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
			productCategoryIds: ['snacks'],
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
});
