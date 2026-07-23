import type { I18nBundle, TranslationKey } from '$lib/i18n';
import type { ScenarioCatalogEntry } from '$lib/scenarios/catalog';
import { encodeScenarioShareCode } from '$lib/scenarios/shareCode';
import type {
	ScenarioOperationError,
	ScenarioPersistenceSummary,
	ScenarioResult,
	ScenarioId
} from '$lib/scenarios/types';

export type ScenarioCatalogActionResult =
	| { status: 'started' }
	| { status: 'confirmation-required'; message: string }
	| { status: 'error'; message: string };

export interface ScenarioResultCopy {
	scoreLabel: string;
	medalLabel: string;
}

export interface ScenarioCatalogCardViewModel {
	id: ScenarioId;
	version: number;
	title: string;
	summary: string;
	briefing: string;
	strategyHint: string;
	dayLimitLabel: string;
	objectiveSummaries: string[];
	allowedContentSummary: string;
	seedLabel: string;
	eligibilityLabel: string;
	available: boolean;
	unavailableReason: string | null;
	primaryAction: 'start' | 'resume';
	primaryLabel: string;
	showRestart: boolean;
	activeDefinitionRef: ScenarioResult['definition'] | null;
	showStartCurrent: boolean;
	activeVersionLabel: string | null;
	best: ScenarioResultCopy | null;
	priorVersionResult: ScenarioResultCopy | null;
	shareCode: string;
}

function resultCopy(
	result: ScenarioResult | undefined,
	i18n: I18nBundle
): ScenarioResultCopy | null {
	if (!result) return null;
	return {
		scoreLabel: i18n.t('scenarioResults.points', { score: i18n.format.integer(result.score) }),
		medalLabel: result.medal
			? i18n.t(`scenarioResults.${result.medal}` as TranslationKey)
			: i18n.t('scenarioResults.noMedal')
	};
}

export function buildScenarioCatalogCards(
	entries: readonly ScenarioCatalogEntry[],
	summary: ScenarioPersistenceSummary,
	i18n: I18nBundle,
	inspectedDefinitionRefsByScenarioId: Partial<
		Record<ScenarioId, ScenarioResult['definition']>
	> = {}
): ScenarioCatalogCardViewModel[] {
	return entries.map(({ definition, available, diagnostics }) => {
		const active = summary.activeRunsByScenarioId[definition.id];
		const seed = active?.seed ?? definition.officialSeed;
		const eligibility = active?.eligibility ?? 'ranked';
		const isOlderActive = Boolean(active && active.definition.version !== definition.version);
		const currentBest =
			summary.bestResultsByDefinitionKey[`${definition.id}@${definition.version}`];
		const inspectedRef =
			active && active.definition.version !== definition.version
				? active.definition
				: inspectedDefinitionRefsByScenarioId[definition.id];
		const inspectedPriorResult =
			inspectedRef && inspectedRef.version !== definition.version
				? summary.bestResultsByDefinitionKey[`${inspectedRef.scenarioId}@${inspectedRef.version}`]
				: undefined;
		return {
			id: definition.id,
			version: definition.version,
			title: i18n.t(definition.titleKey),
			summary: i18n.t(definition.summaryKey),
			briefing: i18n.t(definition.briefingKey),
			strategyHint: i18n.t(definition.strategyHintKey),
			dayLimitLabel: i18n.t('scenarioCatalog.dayLimit', { days: definition.dayLimit }),
			objectiveSummaries: [...definition.requiredObjectives, ...definition.optionalObjectives].map(
				(objective) => i18n.t(objective.labelKey)
			),
			allowedContentSummary: i18n.t('scenarioCatalog.allowedContent', {
				cities: definition.content.cityIds.length,
				stores: definition.content.archetypeIds.length,
				products: definition.content.productCategoryIds.length
			}),
			seedLabel: i18n.t(
				seed === definition.officialSeed
					? 'scenarioStatus.officialSeed'
					: 'scenarioStatus.customSeed',
				{ seed }
			),
			eligibilityLabel: i18n.t(
				eligibility === 'ranked' ? 'scenarioStatus.ranked' : 'scenarioStatus.unranked'
			),
			available,
			unavailableReason: available
				? null
				: i18n.t('scenarioDiagnostics.invalidBuiltIn', {
						detail: diagnostics[0]?.detail ?? i18n.t('scenarioDiagnostics.invalidDefinition')
					}),
			primaryAction: active ? 'resume' : 'start',
			primaryLabel: active
				? isOlderActive
					? i18n.t('scenarioCatalog.resumeVersion', {
							version: active.definition.version
						})
					: i18n.t('scenarioCatalog.resume')
				: i18n.t('scenarioCatalog.start'),
			showRestart: Boolean(active),
			activeDefinitionRef: active?.definition ?? null,
			showStartCurrent: isOlderActive,
			activeVersionLabel: active
				? i18n.t('scenarioStatus.activeVersion', {
						active: active.definition.version,
						current: definition.version
					})
				: null,
			best: resultCopy(currentBest, i18n),
			priorVersionResult: resultCopy(inspectedPriorResult, i18n),
			shareCode: encodeScenarioShareCode(
				active?.definition ?? { scenarioId: definition.id, version: definition.version },
				seed
			)
		};
	});
}

export function scenarioShareCodeErrorText(
	code:
		| 'malformed'
		| 'unknown-scenario'
		| 'unsupported-version'
		| 'invalid-seed'
		| 'checksum-mismatch',
	i18n: I18nBundle
): string {
	const keys = {
		malformed: 'scenarioDiagnostics.malformedShareCode',
		'unknown-scenario': 'scenarioDiagnostics.unknownScenario',
		'unsupported-version': 'scenarioDiagnostics.unsupportedVersion',
		'invalid-seed': 'scenarioDiagnostics.invalidSeed',
		'checksum-mismatch': 'scenarioDiagnostics.checksumMismatch'
	} as const;
	return i18n.t(keys[code]);
}

export function scenarioDiagnosticText(error: ScenarioOperationError, i18n: I18nBundle): string {
	const keys: Record<ScenarioOperationError['code'], TranslationKey> = {
		'invalid-definition': 'scenarioDiagnostics.invalidDefinition',
		'invalid-share-code': 'scenarioDiagnostics.malformedShareCode',
		'forbidden-command': 'scenarioDiagnostics.forbiddenCommand',
		'forbidden-content': 'scenarioDiagnostics.forbiddenContent',
		'stale-definition': 'scenarioDiagnostics.staleDefinition',
		'persistence-read-failed': 'scenarioDiagnostics.persistenceReadFailed',
		'persistence-write-failed': 'scenarioDiagnostics.persistenceWriteFailed',
		'terminal-run': 'scenarioDiagnostics.terminalRun',
		'missing-run': 'scenarioDiagnostics.missingRun',
		'setup-invariant-failed': 'scenarioDiagnostics.setupInvariantFailed'
	};
	return i18n.t(keys[error.code]);
}
