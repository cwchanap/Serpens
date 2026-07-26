import type { I18nBundle, TranslationKey } from '$lib/i18n';
import type { ScenarioCatalogEntry } from '$lib/scenarios/catalog';
import { encodeScenarioShareCode } from '$lib/scenarios/shareCode';
import type {
	ObjectiveEvidence,
	ScenarioDefinition,
	ScenarioOperationError,
	ScenarioPersistenceSummary,
	ScenarioResult,
	ScenarioId,
	ScenarioRun
} from '$lib/scenarios/types';

export type ScenarioCatalogActionResult =
	| { status: 'started' }
	| {
			status: 'confirmation-required';
			message: string;
			expectedRunId?: string | null;
			expectedRevision?: number | null;
	  }
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
	/**
	 * The runId of the active run for this scenario, or null when no active
	 * run is stored. The current-version replacement flow binds its
	 * confirmed write to this identity so a newer run written between the
	 * dialog opening and the confirm click is not silently clobbered.
	 */
	activeRunId: string | null;
	showStartCurrent: boolean;
	activeVersionLabel: string | null;
	best: ScenarioResultCopy | null;
	priorVersionResult: ScenarioResultCopy | null;
	shareCode: string;
}

export interface ScenarioEvidenceViewModel {
	id: string;
	label: string;
	statusLabel: string;
	evidenceLabel: string;
	windowLabel: string;
	contributorLabels: string[];
}

export interface ScenarioProgressViewModel {
	title: string;
	eligibilityLabel: string;
	dayLabel: string;
	remainingLabel: string;
	requiredProgressLabel: string;
	optionalProgressLabel: string;
	scoreLabel: string;
	medalLabel: string;
	modifierLabels: string[];
	riskLabels: string[];
	required: ScenarioEvidenceViewModel[];
	optional: ScenarioEvidenceViewModel[];
	failures: ScenarioEvidenceViewModel[];
	deadlineLabel: string | null;
	announcement: string;
}

export interface ScenarioResultsViewModel {
	title: string;
	outcomeLabel: string;
	scoreLabel: string;
	medalLabel: string;
	bestLabel: string;
	nextMedalLabel: string | null;
	required: ScenarioEvidenceViewModel[];
	optional: ScenarioEvidenceViewModel[];
	failures: ScenarioEvidenceViewModel[];
	deadlineLabel: string | null;
	announcement: string;
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
			activeRunId: active?.runId ?? null,
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

function formatEvidenceValue(evidence: ObjectiveEvidence, value: number, i18n: I18nBundle): string {
	if (
		evidence.metric === 'cash' ||
		evidence.metric === 'daily-net-income' ||
		evidence.metric === 'cumulative-net-income' ||
		evidence.metric === 'retail-import-spend'
	) {
		return i18n.format.currency(value);
	}
	if (evidence.metric === 'retail-local-share') return i18n.format.percent(value);
	return i18n.format.decimal(value);
}

function windowLabel(evidence: ObjectiveEvidence, i18n: I18nBundle): string {
	switch (evidence.window.kind) {
		case 'current':
			return i18n.t('scenarioObjectives.windows.current');
		case 'run-to-date':
			return i18n.t('scenarioObjectives.windows.runToDate');
		case 'trailing-reports':
			return i18n.t('scenarioObjectives.windows.trailingReports', {
				count: evidence.window.count
			});
		case 'fixed-report-days':
			return i18n.t('scenarioObjectives.windows.fixedReportDays', {
				start: evidence.window.startDay,
				end: evidence.window.endDay
			});
	}
}

function conditionViews(
	definitions: readonly ScenarioDefinition['requiredObjectives'][number][],
	evaluations: ReadonlyArray<{
		conditionId: string;
		status: 'pending' | 'satisfied' | 'missed' | 'inactive' | 'triggered';
		evidence: ObjectiveEvidence;
	}>,
	i18n: I18nBundle,
	resolveContributor: (id: string) => string
): ScenarioEvidenceViewModel[] {
	return evaluations.map((evaluation) => {
		const condition = definitions.find((candidate) => candidate.id === evaluation.conditionId);
		return {
			id: evaluation.conditionId,
			label: condition ? i18n.t(condition.labelKey) : evaluation.conditionId,
			statusLabel: i18n.t(`scenarioObjectives.status.${evaluation.status}` as TranslationKey),
			evidenceLabel: i18n.t('scenarioObjectives.actualTarget', {
				actual: formatEvidenceValue(evaluation.evidence, evaluation.evidence.actual, i18n),
				target: formatEvidenceValue(evaluation.evidence, evaluation.evidence.target, i18n)
			}),
			windowLabel: windowLabel(evaluation.evidence, i18n),
			contributorLabels: evaluation.evidence.contributingIds.map(resolveContributor)
		};
	});
}

function deadlineLabel(
	evaluation: ScenarioRun['evaluation'],
	dayLimit: number,
	i18n: I18nBundle
): string | null {
	if (!evaluation.deadline) return null;
	return evaluation.deadline.triggered
		? i18n.t('scenarioResults.deadlineTriggered', { day: evaluation.deadline.evidence.day })
		: i18n.t('scenarioResults.deadlineNotTriggered', {
				day: evaluation.deadline.evidence.day,
				limit: dayLimit
			});
}

function progressEvidence(
	definition: ScenarioDefinition,
	evaluation: ScenarioRun['evaluation'],
	i18n: I18nBundle,
	resolveContributor: (id: string) => string
) {
	return {
		required: conditionViews(
			definition.requiredObjectives,
			evaluation.required,
			i18n,
			resolveContributor
		),
		optional: conditionViews(
			definition.optionalObjectives,
			evaluation.optional,
			i18n,
			resolveContributor
		),
		failures: conditionViews(definition.failures, evaluation.failures, i18n, resolveContributor),
		deadlineLabel: deadlineLabel(evaluation, definition.dayLimit, i18n)
	};
}

export function buildScenarioProgressView(
	definition: ScenarioDefinition,
	run: ScenarioRun,
	i18n: I18nBundle,
	resolveContributor: (id: string) => string = (id) => id
): ScenarioProgressViewModel {
	const evaluation = run.evaluation;
	const satisfiedRequired = evaluation.required.filter(
		({ status }) => status === 'satisfied'
	).length;
	const satisfiedOptional = evaluation.optional.filter(
		({ status }) => status === 'satisfied'
	).length;
	const evidence = progressEvidence(definition, evaluation, i18n, resolveContributor);
	const remainingCount = Math.max(0, definition.dayLimit - evaluation.day);
	return {
		title: i18n.t(definition.titleKey),
		eligibilityLabel: i18n.t(
			run.eligibility === 'ranked' ? 'scenarioStatus.ranked' : 'scenarioStatus.unranked'
		),
		dayLabel: i18n.t('scenarioStatus.day', { day: evaluation.day, limit: definition.dayLimit }),
		remainingLabel: i18n.t(
			(remainingCount === 1
				? 'scenarioStatus.remaining.one'
				: 'scenarioStatus.remaining.other') as TranslationKey,
			{ count: remainingCount }
		),
		requiredProgressLabel: i18n.t('scenarioStatus.requiredProgress', {
			complete: satisfiedRequired,
			total: evaluation.required.length
		}),
		optionalProgressLabel: i18n.t('scenarioStatus.optionalProgress', {
			complete: satisfiedOptional,
			total: evaluation.optional.length
		}),
		scoreLabel: i18n.t('scenarioStatus.projectedScore', {
			score: i18n.format.integer(evaluation.projection.score)
		}),
		medalLabel: i18n.t('scenarioStatus.projectedMedal', {
			medal: i18n.t(`scenarioResults.${evaluation.projection.medal}` as TranslationKey)
		}),
		modifierLabels: definition.modifiers.map((modifier) =>
			i18n.t('scenarioModifiers.importCostMultiplier', {
				multiplier: i18n.format.decimal(modifier.multiplier)
			})
		),
		riskLabels: evaluation.risks.map((risk) =>
			risk.kind === 'deadline'
				? i18n.t(
						(risk.daysRemaining === 1
							? 'scenarioStatus.deadlineRisk.one'
							: 'scenarioStatus.deadlineRisk.other') as TranslationKey,
						{ count: risk.daysRemaining }
					)
				: i18n.t('scenarioStatus.conditionRisk', {
						distance: i18n.format.decimal(risk.distance),
						status: risk.triggered
							? i18n.t('scenarioObjectives.status.triggered')
							: i18n.t('scenarioObjectives.status.inactive')
					})
		),
		...evidence,
		announcement: i18n.t('scenarioStatus.progressAnnouncement', { day: evaluation.day })
	};
}

export function buildScenarioResultsView(
	definition: ScenarioDefinition,
	result: ScenarioResult,
	bestUpdated: boolean,
	i18n: I18nBundle,
	resolveContributor: (id: string) => string = (id) => id
): ScenarioResultsViewModel {
	const evidence = progressEvidence(definition, result.evaluation, i18n, resolveContributor);
	const next =
		result.outcome !== 'completed'
			? null
			: result.score < definition.medalThresholds.silver
				? { medal: 'silver' as const, points: definition.medalThresholds.silver - result.score }
				: result.score < definition.medalThresholds.gold
					? { medal: 'gold' as const, points: definition.medalThresholds.gold - result.score }
					: null;
	const outcomeLabel = i18n.t(`scenarioResults.outcome.${result.outcome}` as TranslationKey);
	return {
		title: i18n.t(definition.titleKey),
		outcomeLabel,
		scoreLabel: i18n.t('scenarioResults.points', { score: i18n.format.integer(result.score) }),
		medalLabel: result.medal
			? i18n.t(`scenarioResults.${result.medal}` as TranslationKey)
			: i18n.t('scenarioResults.noMedal'),
		bestLabel: i18n.t(bestUpdated ? 'scenarioResults.newBest' : 'scenarioResults.bestUnchanged'),
		nextMedalLabel: next
			? i18n.t('scenarioResults.nextMedal', {
					points: i18n.format.integer(next.points),
					medal: i18n.t(`scenarioResults.${next.medal}` as TranslationKey)
				})
			: null,
		...evidence,
		announcement: i18n.t('scenarioResults.announcement', {
			outcome: outcomeLabel,
			score: i18n.format.integer(result.score)
		})
	};
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
		'invalid-command': 'scenarioDiagnostics.invalidCommand',
		'stale-definition': 'scenarioDiagnostics.staleDefinition',
		'persistence-read-failed': 'scenarioDiagnostics.persistenceReadFailed',
		'persistence-write-failed': 'scenarioDiagnostics.persistenceWriteFailed',
		'terminal-run': 'scenarioDiagnostics.terminalRun',
		'missing-run': 'scenarioDiagnostics.missingRun',
		'setup-invariant-failed': 'scenarioDiagnostics.setupInvariantFailed'
	};
	return i18n.t(keys[error.code]);
}
