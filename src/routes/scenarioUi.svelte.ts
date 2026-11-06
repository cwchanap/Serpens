import type { GameState } from '$lib/game/types';
import type { I18nBundle } from '$lib/i18n';
import {
	buildScenarioProgressView,
	buildScenarioResultsView,
	buildScenarioCatalogCards,
	resolveScenarioContributorLabel,
	scenarioDiagnosticText,
	scenarioShareCodeErrorText,
	type ScenarioCatalogActionResult,
	type ScenarioCatalogCardViewModel
} from '$lib/i18n/scenarioCopy';
import { currentScenarioDefinition, listScenarioCatalogEntries } from '$lib/scenarios/catalog';
import { decodeScenarioShareCode } from '$lib/scenarios/shareCode';
import type {
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioOperationError,
	ScenarioPersistenceSummary,
	ScenarioResult,
	ScenarioRun
} from '$lib/scenarios/types';
import type { GameRouteController } from './gameRouteController';
import { toCatalogActionResult } from './scenarioRoute';

export type ScenarioUiCommands = Pick<
	GameRouteController,
	| 'startScenarioRun'
	| 'resumeScenarioRun'
	| 'restartScenarioRun'
	| 'importScenarioRun'
	| 'abandonScenarioRun'
	| 'returnToSandbox'
	| 'dismissScenarioOperationError'
>;

interface ScenarioUiOptions {
	commands: ScenarioUiCommands;
	getActiveRun(): ScenarioRun | null;
	getResult(): ScenarioResult | null;
	getBestUpdated(): boolean;
	getError(): ScenarioOperationError | null;
	getRetry(): (() => Promise<void>) | null;
	getPending(): boolean;
	getReady(): boolean;
	getMode(): 'sandbox' | 'scenario';
	getGame(): GameState | null;
	getI18n(): I18nBundle;
	resolveDefinition(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined;
	onOpenCatalog(): void;
	onResultsClosed(): void;
}

type StartParameters = Parameters<ScenarioUiCommands['startScenarioRun']>;
type CommandResult = Awaited<ReturnType<ScenarioUiCommands['startScenarioRun']>>;

export function createScenarioUi(options: ScenarioUiOptions) {
	let isCatalogOpen = $state(false);
	let objectivesExpanded = $state(false);
	// Keep the published result reference, not a new deep-state proxy.
	let dismissedResult = $state.raw<ScenarioResult | null>(null);
	let evidenceGame = $state.raw<GameState | null>(null);
	let fallbackError = $state<ScenarioOperationError | null>(null);
	let summary = $state.raw<ScenarioPersistenceSummary>({
		activeRunsByScenarioId: {},
		bestResultsByDefinitionKey: {},
		diagnostics: []
	});
	let inspectedRefs = $state<
		Partial<Record<ScenarioRun['definition']['scenarioId'], ScenarioDefinitionRef>>
	>({});
	const activeRun = $derived(options.getActiveRun());
	const result = $derived(options.getResult());
	const i18n = $derived(options.getI18n());
	const definition = $derived(
		activeRun ? (options.resolveDefinition(activeRun.definition) ?? null) : null
	);
	const resultDefinition = $derived(
		result ? (options.resolveDefinition(result.definition) ?? null) : null
	);
	const operationError = $derived(options.getError() ?? fallbackError);
	const title = $derived(
		definition ? i18n.t(definition.titleKey) : (activeRun?.definition.scenarioId ?? '')
	);
	const versionLabel = $derived(
		activeRun
			? i18n.t('scenarioStatus.versionEligibility', {
					version: activeRun.definition.version,
					eligibility: i18n.t(
						activeRun.eligibility === 'ranked' ? 'scenarioStatus.ranked' : 'scenarioStatus.unranked'
					)
				})
			: ''
	);
	const progress = $derived(
		definition && activeRun
			? buildScenarioProgressView(definition, activeRun, i18n, resolveContributor)
			: null
	);
	const results = $derived(
		resultDefinition && result
			? buildScenarioResultsView(
					resultDefinition,
					result,
					options.getBestUpdated(),
					i18n,
					resolveContributor
				)
			: null
	);
	const isResultsOpen = $derived(results !== null && result !== null && result !== dismissedResult);
	const effectiveSummary = $derived({
		...summary,
		activeRunsByScenarioId: activeRun
			? { ...summary.activeRunsByScenarioId, [activeRun.definition.scenarioId]: activeRun }
			: summary.activeRunsByScenarioId
	});
	const cards = $derived(
		buildScenarioCatalogCards(listScenarioCatalogEntries(), effectiveSummary, i18n, inspectedRefs)
	);
	const error = $derived(operationError ? scenarioDiagnosticText(operationError, i18n) : null);

	function resolveContributor(id: string): string {
		return resolveScenarioContributorLabel(
			activeRun?.game ?? evidenceGame ?? options.getGame(),
			id,
			i18n
		);
	}
	function openCatalog(): void {
		options.onOpenCatalog();
		isCatalogOpen = true;
	}
	function closeCatalog(): void {
		isCatalogOpen = false;
	}
	function handleCardResult(result: CommandResult): void {
		if (result.status === 'committed') isCatalogOpen = false;
		else if (result.status === 'unavailable' && !options.getError()) {
			fallbackError = { code: 'persistence-read-failed', diagnostics: [] };
		}
	}
	async function startCard(
		card: ScenarioCatalogCardViewModel,
		confirmed: StartParameters[2],
		expectedRunId: StartParameters[3],
		expectedRevision: StartParameters[4],
		confirmationKey:
			| 'scenarioCatalog.startReplacementConfirmation'
			| 'scenarioCatalog.olderVersionConfirmation'
	): Promise<ScenarioCatalogActionResult> {
		const definition = currentScenarioDefinition(card.id);
		if (!definition)
			return { status: 'error', message: i18n.t('scenarioDiagnostics.staleDefinition') };
		fallbackError = null;
		const result = await options.commands.startScenarioRun(
			definition,
			definition.officialSeed,
			confirmed,
			expectedRunId,
			expectedRevision
		);
		const action = toCatalogActionResult(result, confirmationKey, options.getError(), i18n);
		if (action.status === 'started') isCatalogOpen = false;
		return action;
	}
	function startScenarioCard(
		card: ScenarioCatalogCardViewModel,
		confirmed: boolean,
		expectedRunId?: StartParameters[3],
		expectedRevision?: StartParameters[4]
	): Promise<ScenarioCatalogActionResult> {
		return startCard(
			card,
			confirmed,
			expectedRunId,
			expectedRevision,
			'scenarioCatalog.startReplacementConfirmation'
		);
	}
	function startCurrentVersionCard(
		card: ScenarioCatalogCardViewModel,
		confirmed: boolean,
		expectedRunId?: StartParameters[3],
		expectedRevision?: StartParameters[4]
	): Promise<ScenarioCatalogActionResult> {
		return startCard(
			card,
			confirmed,
			expectedRunId,
			expectedRevision,
			'scenarioCatalog.olderVersionConfirmation'
		);
	}
	async function resumeScenarioCard(card: ScenarioCatalogCardViewModel): Promise<void> {
		fallbackError = null;
		handleCardResult(await options.commands.resumeScenarioRun(card.id));
	}
	async function restartScenarioCard(card: ScenarioCatalogCardViewModel): Promise<void> {
		if (!card.activeDefinitionRef) return;
		fallbackError = null;
		handleCardResult(await options.commands.restartScenarioRun(card.activeDefinitionRef));
	}
	async function restartActiveScenario(): Promise<void> {
		if (!activeRun) return;
		fallbackError = null;
		const result = await options.commands.restartScenarioRun(activeRun.definition);
		if (result.status === 'committed') isCatalogOpen = false;
	}
	async function restartResultScenario(): Promise<void> {
		if (!result || !resultDefinition) return;
		fallbackError = null;
		const outcome = await options.commands.startScenarioRun(resultDefinition, result.seed);
		if (outcome.status === 'committed') dismissedResult = result;
	}
	function closeResults(): void {
		dismissedResult = result;
		// Terminal publication leaves scenario mode without a playable game.
		options.commands.returnToSandbox();
		options.onResultsClosed();
	}
	function openCatalogFromResults(): void {
		closeResults();
		openCatalog();
	}
	function returnToSandboxFromResults(): void {
		closeResults();
		options.commands.returnToSandbox();
	}
	async function importScenarioCode(
		code: string,
		confirmed: boolean,
		expectedRunId?: Parameters<ScenarioUiCommands['importScenarioRun']>[3],
		expectedRevision?: Parameters<ScenarioUiCommands['importScenarioRun']>[4]
	): Promise<ScenarioCatalogActionResult> {
		const decoded = decodeScenarioShareCode(code, options.resolveDefinition);
		if (!decoded.ok)
			return { status: 'error', message: scenarioShareCodeErrorText(decoded.code, i18n) };
		inspectedRefs = {
			...inspectedRefs,
			[decoded.value.definition.scenarioId]: decoded.value.definition
		};
		const definition = options.resolveDefinition(decoded.value.definition);
		if (!definition)
			return { status: 'error', message: scenarioShareCodeErrorText('unsupported-version', i18n) };
		fallbackError = null;
		const result = await options.commands.importScenarioRun(
			definition,
			decoded.value.seed,
			confirmed,
			expectedRunId,
			expectedRevision
		);
		const action = toCatalogActionResult(
			result,
			'scenarioCatalog.importReplacementConfirmation',
			options.getError(),
			i18n
		);
		if (action.status === 'started') isCatalogOpen = false;
		return action;
	}
	async function copyScenarioCode(code: string): Promise<boolean> {
		try {
			await globalThis.navigator.clipboard.writeText(code);
			return true;
		} catch {
			return false;
		}
	}
	async function abandonActiveScenario(): Promise<void> {
		fallbackError = null;
		// Summary publication owns surviving replacement entries after a conflict.
		await options.commands.abandonScenarioRun();
	}

	return {
		get definition() {
			return definition;
		},
		get title() {
			return title;
		},
		get versionLabel() {
			return versionLabel;
		},
		get progress() {
			return progress;
		},
		get results() {
			return results;
		},
		get cards() {
			return cards;
		},
		get error() {
			return error;
		},
		get pending() {
			return options.getPending();
		},
		get ready() {
			return options.getReady();
		},
		get hasActiveRun() {
			return activeRun !== null;
		},
		get showProgress() {
			return options.getMode() === 'scenario' && activeRun !== null && progress !== null;
		},
		get isCatalogOpen() {
			return isCatalogOpen;
		},
		get isResultsOpen() {
			return isResultsOpen;
		},
		get objectivesExpanded() {
			return objectivesExpanded;
		},
		openCatalog,
		closeCatalog,
		closeResults,
		toggleObjectives(): void {
			objectivesExpanded = !objectivesExpanded;
		},
		acceptSummary(next: ScenarioPersistenceSummary): void {
			summary = next;
		},
		acceptTerminalRun(run: ScenarioRun): void {
			evidenceGame = run.game;
		},
		clearEvidence(): void {
			evidenceGame = null;
			fallbackError = null;
		},
		startScenarioCard,
		startCurrentVersionCard,
		resumeScenarioCard,
		restartScenarioCard,
		restartActiveScenario,
		restartResultScenario,
		openCatalogFromResults,
		returnToSandboxFromResults,
		importScenarioCode,
		copyScenarioCode,
		abandonActiveScenario,
		retry(): Promise<void> | undefined {
			fallbackError = null;
			return options.getRetry()?.();
		},
		returnToSandbox(): void {
			options.commands.returnToSandbox();
		},
		dismissError(): void {
			fallbackError = null;
			options.commands.dismissScenarioOperationError();
		}
	};
}
