import type { GameRouteCommitResult } from '$lib/game/commandResult';
import type { I18nBundle } from '$lib/i18n';
import { scenarioDiagnosticText, type ScenarioCatalogActionResult } from '$lib/i18n/scenarioCopy';
import { isScenarioContentAllowed, type ScenarioContentQuery } from '$lib/scenarios/capabilities';
import type {
	ScenarioDefinition,
	ScenarioOperationError,
	ScenarioRunStatus
} from '$lib/scenarios/types';

type CatalogConfirmationKey =
	| 'scenarioCatalog.startReplacementConfirmation'
	| 'scenarioCatalog.olderVersionConfirmation'
	| 'scenarioCatalog.importReplacementConfirmation';

export function toCatalogActionResult(
	result: GameRouteCommitResult,
	confirmationKey: CatalogConfirmationKey,
	error: ScenarioOperationError | null,
	i18n: I18nBundle
): ScenarioCatalogActionResult {
	if (result.status === 'confirmation-required') {
		return {
			status: 'confirmation-required',
			message: i18n.t(confirmationKey),
			expectedRunId: result.expectedRunId,
			expectedRevision: result.expectedRevision
		};
	}
	if (result.status === 'committed') return { status: 'started' };
	return {
		status: 'error',
		message: error
			? scenarioDiagnosticText(error, i18n)
			: i18n.t('scenarioDiagnostics.persistenceWriteFailed')
	};
}

export function isLiveScenarioContentAllowed(
	playMode: 'sandbox' | 'scenario',
	definition: ScenarioDefinition | null,
	query: ScenarioContentQuery
): boolean {
	return (
		playMode === 'sandbox' || (definition !== null && isScenarioContentAllowed(definition, query))
	);
}

export interface ScenarioRouteIdentity {
	playMode: 'sandbox' | 'scenario';
	runId: string | null;
	status: ScenarioRunStatus | null;
	scenarioRunSyncEpoch: number;
}

// Commands publish new objects/revisions; only lifecycle or external adoption resets the view.
export function shouldResetScenarioView(
	previous: ScenarioRouteIdentity | undefined,
	next: ScenarioRouteIdentity
): boolean {
	return (
		previous !== undefined &&
		(previous.playMode !== next.playMode ||
			previous.runId !== next.runId ||
			previous.status !== next.status ||
			previous.scenarioRunSyncEpoch !== next.scenarioRunSyncEpoch)
	);
}
