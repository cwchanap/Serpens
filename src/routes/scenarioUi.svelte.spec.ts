import { flushSync } from 'svelte';
import { page } from 'vitest/browser';
import { createI18n } from '$lib/i18n';
import type { ScenarioResult, ScenarioRun, ScenarioOperationError } from '$lib/scenarios/types';
import { encodeScenarioShareCode } from '$lib/scenarios/shareCode';
import { createScenarioUi, type ScenarioUiCommands } from './scenarioUi.svelte';
import ScenarioCatalogHost from './ScenarioCatalogHost.svelte';
import ScenarioProgressHost from './ScenarioProgressHost.svelte';
import ScenarioResultsHost from './ScenarioResultsHost.svelte';
import ScenarioMenuActions from './ScenarioMenuActions.svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import { createFixtureScenarioRun } from '$lib/persistence/scenarioRepository.testUtils';
import { createBrowserScenarioRepository } from '$lib/persistence/browserScenarioRepository';
import { createScenarioRepository } from '$lib/persistence/scenarioRepositoryFactory';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import { startScenario, evaluateScenario } from '$lib/scenarios/runtime';
import { GameRouteController, type GameRouteControllerOptions } from './gameRouteController';
import ControlDesk from '$lib/components/game/ControlDesk.svelte';
import BuildMenu from '$lib/components/game/BuildMenu.svelte';
import MapInspectorHost from './MapInspectorHost.svelte';
import MapSurfaceHost from './MapSurfaceHost.svelte';
import ScenarioStatusStrip from '$lib/components/game/ScenarioStatusStrip.svelte';
import RetailSimulationPage from './+page.svelte';

const controllers = vi.hoisted(
	() => [] as Array<{ controller: GameRouteController; options: GameRouteControllerOptions }>
);
vi.mock('./scenarioUi.svelte', { spy: true });
vi.mock('./gameRouteController', async (importOriginal) => {
	const original = await importOriginal<typeof import('./gameRouteController')>();
	return {
		...original,
		GameRouteController: class extends original.GameRouteController {
			constructor(options: GameRouteControllerOptions) {
				super(options);
				controllers.push({ controller: this, options });
			}
		}
	};
});
vi.mock('$lib/persistence/scenarioRepositoryFactory', () => ({
	createScenarioRepository: vi.fn()
}));
vi.mock('$lib/components/game/ControlDesk.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/components/game/ControlDesk.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('$lib/components/game/BuildMenu.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/components/game/BuildMenu.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('./MapInspectorHost.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('./MapInspectorHost.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('./MapSurfaceHost.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('./MapSurfaceHost.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('$lib/components/game/ScenarioStatusStrip.svelte', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('$lib/components/game/ScenarioStatusStrip.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('$lib/audio/audioController', () => ({
	createGameAudioController: () => ({
		unlock: async () => {},
		setActiveBgm: () => {},
		playSfx: async () => {},
		getPreferences: () => DEFAULT_AUDIO_PREFERENCES,
		updatePreferences: () => {},
		destroy: async () => {}
	})
}));
afterEach(() => {
	vi.restoreAllMocks();
	controllers.length = 0;
	localStorage.clear();
});

function repository() {
	const storage = new Map<string, string>();
	return createBrowserScenarioRepository(
		{
			getItem: (key) => storage.get(key) ?? null,
			setItem: (key, value) => void storage.set(key, value),
			removeItem: (key) => void storage.delete(key)
		},
		resolveScenarioDefinition
	);
}
function officialRun() {
	const definition = resolveScenarioDefinition(createFixtureScenarioRun().definition)!;
	const result = startScenario(definition, definition.officialSeed);
	if (!result.ok) throw new Error('invalid official fixture');
	return result.value;
}

it('local command preserves UI but external adoption resets synchronously', async () => {
	const repo = repository();
	const definition = resolveScenarioDefinition({ scenarioId: 'local-lifeline', version: 1 })!;
	const started = startScenario(definition, definition.officialSeed);
	if (!started.ok) throw new Error('invalid fixture');
	const run = started.value;
	await repo.saveActiveRun(run);
	vi.mocked(createScenarioRepository).mockResolvedValue(repo);
	const view = render(RetailSimulationPage);
	try {
		await expect.poll(() => controllers.at(-1)?.controller.state.scenariosReady).toBe(true);
		const { controller, options } = controllers.at(-1)!;
		const desk = vi.mocked(ControlDesk).mock.calls.at(-1)![1];
		const inspector = vi.mocked(MapInspectorHost).mock.calls.at(-1)![1];
		const surface = vi.mocked(MapSurfaceHost).mock.calls.at(-1)![1];
		const strip = vi.mocked(ScenarioStatusStrip).mock.calls.at(-1)![1];
		strip.onToggle();
		controller.selectReadOnlyTile('retail', run.game.stores[0].tileId);
		flushSync();
		await surface.session.selectWorldCity('industry-city');
		desk.onBuild();
		flushSync();
		const build = vi.mocked(BuildMenu).mock.calls.at(-1)![1];
		build.onChooseIndustry('water-bottler');
		controller.selectReadOnlyTile('retail', run.game.stores[0].tileId);
		flushSync();
		// The retail inspector's inputs stay live while placement hides it
		// (the visibility rule itself is owned and covered by MapInspectorHost).
		expect(inspector.session.selectedTileId).not.toBeNull();
		expect(inspector.isPlacementActive).toBe(true);
		const original = options.onStateChange;
		expect(surface.industryPlacementPreview).not.toBeNull();
		expect(strip.expanded).toBe(true);
		const seen: Array<{ placement: boolean; selection: string | null }> = [];
		options.onStateChange = (state) => {
			original?.(state);
			// These props read root derived state directly, before a DOM flush or callback return.
			seen.push({
				placement: surface.industryPlacementPreview !== null,
				selection: surface.session.selectedTileId
			});
		};
		await controller.updatePolicy({ pricing: 'premium' });
		expect(controller.state.activeScenarioRun?.game.day).toBe(run.game.day);
		expect(seen.every(({ placement }) => placement)).toBe(true);
		expect(strip.expanded).toBe(true);
		const persisted = controller.state.activeScenarioRun!;
		const advancedGame = { ...persisted.game, cash: persisted.game.cash + 1 };
		await repo.saveActiveRun({
			...persisted,
			game: advancedGame,
			evaluation: evaluateScenario(definition, advancedGame, false)
		});
		seen.length = 0;
		await controller.resumeScenarioRun(run.definition.scenarioId);
		expect(seen.at(-1)).toEqual({ placement: false, selection: null });
		expect(strip.expanded).toBe(true);
		// Adoption clears construction and selection synchronously, not just inspector visibility.
		expect(desk.buildDisabled).toBe(false);
		flushSync();
		expect(document.querySelector('[aria-label="Placement status"]')).toBeNull();
	} finally {
		await view.unmount();
	}
});

function presentation(resolveDefinition = resolveScenarioDefinition) {
	const run = officialRun();
	let inputs = $state.raw({
		run: run as ScenarioRun | null,
		result: null as ScenarioResult | null,
		best: false,
		error: null as ScenarioOperationError | null,
		retry: null as (() => Promise<void>) | null,
		pending: false,
		ready: true,
		mode: 'scenario' as 'sandbox' | 'scenario',
		game: run.game,
		i18n: createI18n('en')
	});
	const commands: ScenarioUiCommands = {
		startScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		importScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		resumeScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		restartScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		abandonScenarioRun: vi.fn(async () => ({ status: 'committed' as const })),
		returnToSandbox: vi.fn(),
		dismissScenarioOperationError: vi.fn()
	};
	const onOpenCatalog = vi.fn();
	const onResultsClosed = vi.fn(() => expect(commands.returnToSandbox).toHaveBeenCalled());
	const ui = createScenarioUi({
		commands,
		getActiveRun: () => inputs.run,
		getResult: () => inputs.result,
		getBestUpdated: () => inputs.best,
		getError: () => inputs.error,
		getRetry: () => inputs.retry,
		getPending: () => inputs.pending,
		getReady: () => inputs.ready,
		getMode: () => inputs.mode,
		getGame: () => inputs.game,
		getI18n: () => inputs.i18n,
		resolveDefinition,
		onOpenCatalog,
		onResultsClosed
	});
	return {
		ui,
		commands,
		onOpenCatalog,
		onResultsClosed,
		get inputs() {
			return inputs;
		},
		update(patch: Partial<typeof inputs>) {
			flushSync(() => {
				inputs = { ...inputs, ...patch };
			});
		}
	};
}
function terminal(run: ScenarioRun): ScenarioResult {
	return {
		definition: run.definition,
		seed: run.seed,
		eligibility: run.eligibility,
		outcome: 'completed',
		completionDay: 3,
		score: 123,
		medal: 'bronze',
		evaluation: run.evaluation
	};
}

it('scenario projections read live inputs', async () => {
	const h = presentation();
	const { ui } = h;
	const catalog = render(ScenarioCatalogHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	const progress = render(ScenarioProgressHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	try {
		ui.openCatalog();
		expect(h.onOpenCatalog).toHaveBeenCalledOnce();
		const oldTitle = ui.title;
		const next = {
			...h.inputs.run!,
			seed: 987,
			eligibility: 'unranked' as const,
			evaluation: { ...h.inputs.run!.evaluation, day: 7 }
		};
		h.update({
			run: next,
			error: { code: 'missing-run', diagnostics: [] },
			i18n: createI18n('ja')
		});
		expect(ui.title).not.toBe(oldTitle);
		expect(ui.progress?.dayLabel).toContain('7');
		expect(ui.cards[0].seedLabel).toContain('987');
		expect(ui.cards[0].primaryAction).toBe('resume');
		expect(ui.error).toBe(h.inputs.i18n.t('scenarioDiagnostics.missingRun'));
		await expect.element(page.getByRole('alert').first()).toHaveTextContent(ui.error!);
		ui.acceptSummary({
			activeRunsByScenarioId: { 'first-profit': next },
			bestResultsByDefinitionKey: { 'first-profit@1': terminal(next) },
			diagnostics: []
		});
		h.update({ run: null });
		expect(ui.cards[0].primaryAction).toBe('resume');
		expect(ui.cards[0].best?.scoreLabel).toContain('123');
		ui.closeCatalog();
		ui.toggleObjectives();
		h.update({ run: next, pending: true });
		expect(ui.pending).toBe(true);
		expect(ui.objectivesExpanded).toBe(true);
		await expect.element(page.getByText(ui.progress!.dayLabel, { exact: false })).toBeVisible();
	} finally {
		await catalog.unmount();
		await progress.unmount();
	}
});

it('dismissed result keeps reference identity', async () => {
	const h = presentation();
	const { ui } = h;
	const view = render(ScenarioResultsHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	try {
		const result = terminal(h.inputs.run!);
		h.update({ result, run: null, best: true });
		expect(ui.isResultsOpen).toBe(true);
		await expect.element(page.getByRole('dialog')).toBeVisible();
		ui.closeResults();
		expect(h.onResultsClosed).toHaveBeenCalledOnce();
		h.update({ i18n: createI18n('ja'), best: false });
		ui.acceptSummary({
			activeRunsByScenarioId: {},
			bestResultsByDefinitionKey: {},
			diagnostics: []
		});
		expect(ui.isResultsOpen).toBe(false);
		expect(ui.results?.bestLabel).toBe(h.inputs.i18n.t('scenarioResults.bestUnchanged'));
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		h.update({ result: { ...result, score: 456 } });
		expect(ui.isResultsOpen).toBe(true);
		expect(ui.results?.scoreLabel).toContain('456');
		await expect.element(page.getByRole('dialog')).toBeVisible();
		ui.returnToSandboxFromResults();
		expect(h.commands.returnToSandbox).toHaveBeenCalledTimes(3);
	} finally {
		await view.unmount();
	}
});

it('terminal labels retain evidence', async () => {
	const h = presentation();
	const { ui } = h;
	const run = h.inputs.run!;
	const named = (name: string) => ({
		...run.game,
		stores: run.game.stores.map((store) => ({ ...store, name }))
	});
	const evidenceRun = { ...run, game: named('Evidence Store') };
	const result = terminal(run);
	result.evaluation = {
		...result.evaluation,
		required: result.evaluation.required.map((row) => ({
			...row,
			evidence: { ...row.evidence, contributingIds: [run.game.stores[0].id] }
		}))
	};
	const view = render(ScenarioResultsHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	try {
		ui.acceptTerminalRun(evidenceRun);
		h.update({
			run: { ...run, game: named('Active Store') },
			result,
			game: named('Sandbox Store')
		});
		expect(ui.results?.required[0].contributorLabels).toEqual(['Active Store']);
		h.update({ run: null });
		expect(ui.results?.required[0].contributorLabels).toEqual(['Evidence Store']);
		await expect.element(page.getByText('Evidence Store', { exact: false }).first()).toBeVisible();
		ui.clearEvidence();
		expect(ui.results?.required[0].contributorLabels).toEqual(['Sandbox Store']);
	} finally {
		await view.unmount();
	}
});

it('stale confirmation keeps catalog open', async () => {
	const h = presentation();
	const { ui, commands } = h;
	const view = render(ScenarioCatalogHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	try {
		ui.openCatalog();
		const card = ui.cards[0];
		let resolve!: (value: Awaited<ReturnType<ScenarioUiCommands['startScenarioRun']>>) => void;
		vi.mocked(commands.startScenarioRun).mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const pending = ui.startScenarioCard(card, true, 'expected-run', 17);
		expect(commands.startScenarioRun).toHaveBeenLastCalledWith(
			expect.objectContaining({ id: 'first-profit' }),
			expect.any(Number),
			true,
			'expected-run',
			17
		);
		expect(ui.isCatalogOpen).toBe(true);
		resolve({ status: 'confirmation-required', expectedRunId: 'newer-run', expectedRevision: 18 });
		expect(await pending).toEqual({
			status: 'confirmation-required',
			expectedRunId: 'newer-run',
			expectedRevision: 18,
			message: h.inputs.i18n.t('scenarioCatalog.startReplacementConfirmation')
		});
		expect(ui.isCatalogOpen).toBe(true);
		vi.mocked(commands.startScenarioRun).mockResolvedValueOnce({
			status: 'confirmation-required',
			expectedRunId: 'newer-run',
			expectedRevision: 19
		});
		expect(await ui.startCurrentVersionCard(card, true, 'newer-run', 18)).toMatchObject({
			message: h.inputs.i18n.t('scenarioCatalog.olderVersionConfirmation'),
			expectedRevision: 19
		});
		const code = encodeScenarioShareCode(h.inputs.run!.definition, 999);
		vi.mocked(commands.importScenarioRun).mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const imported = ui.importScenarioCode(code, true, 'import-run', 21);
		expect(commands.importScenarioRun).toHaveBeenLastCalledWith(
			expect.objectContaining({ id: card.id }),
			999,
			true,
			'import-run',
			21
		);
		resolve({
			status: 'confirmation-required',
			expectedRunId: 'import-newer',
			expectedRevision: 22
		});
		expect(await imported).toMatchObject({
			message: h.inputs.i18n.t('scenarioCatalog.importReplacementConfirmation'),
			expectedRunId: 'import-newer',
			expectedRevision: 22
		});
		expect(ui.isCatalogOpen).toBe(true);
		h.update({ error: { code: 'missing-run', diagnostics: [] } });
		vi.mocked(commands.resumeScenarioRun).mockResolvedValueOnce({ status: 'unavailable' });
		await ui.resumeScenarioCard(card);
		expect(ui.isCatalogOpen).toBe(true);
		expect(ui.error).toBe(h.inputs.i18n.t('scenarioDiagnostics.missingRun'));
		vi.mocked(commands.startScenarioRun).mockResolvedValueOnce({ status: 'unavailable' });
		expect(await ui.startScenarioCard(card, false)).toEqual({ status: 'error', message: ui.error });
		await ui.resumeScenarioCard(card);
		expect(ui.isCatalogOpen).toBe(false);
		ui.openCatalog();
		expect(await ui.importScenarioCode(code, false)).toEqual({ status: 'started' });
		expect(ui.isCatalogOpen).toBe(false);
		ui.openCatalog();
		expect(await ui.startCurrentVersionCard(card, true, 'newer-run', 19)).toEqual({
			status: 'started'
		});
		expect(ui.isCatalogOpen).toBe(false);
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
		expect(await ui.copyScenarioCode(code)).toBe(false);
	} finally {
		await view.unmount();
	}
});

it('import inspection retains version-specific best evidence even when the command is unavailable', async () => {
	const run = officialRun();
	const prior = { ...resolveScenarioDefinition(run.definition)!, version: 2 };
	const h = presentation((ref) =>
		ref.scenarioId === prior.id && ref.version === 2 ? prior : resolveScenarioDefinition(ref)
	);
	const { ui } = h;
	const view = render(ScenarioCatalogHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	try {
		h.update({ run: null });
		ui.acceptSummary({
			activeRunsByScenarioId: {},
			bestResultsByDefinitionKey: {
				'first-profit@2': {
					...terminal(run),
					definition: { scenarioId: prior.id, version: 2 },
					score: 654
				}
			},
			diagnostics: []
		});
		expect(ui.cards[0].priorVersionResult).toBeNull();
		ui.openCatalog();
		vi.mocked(h.commands.importScenarioRun).mockResolvedValueOnce({ status: 'unavailable' });
		await ui.importScenarioCode(
			encodeScenarioShareCode({ scenarioId: prior.id, version: 2 }, 999),
			false
		);
		expect(ui.cards[0].priorVersionResult?.scoreLabel).toContain('654');
		expect(ui.isCatalogOpen).toBe(true);
	} finally {
		await view.unmount();
	}
});

it('catalog errors retry live commands and leave summary-owned replacement entries intact', async () => {
	const h = presentation();
	const { ui, commands } = h;
	const run = h.inputs.run!;
	const view = render(ScenarioCatalogHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	try {
		ui.openCatalog();
		h.update({ error: null });
		vi.mocked(commands.resumeScenarioRun).mockResolvedValueOnce({ status: 'unavailable' });
		await ui.resumeScenarioCard(ui.cards[0]);
		expect(ui.error).toBe(h.inputs.i18n.t('scenarioDiagnostics.persistenceReadFailed'));
		const retry = vi.fn(async () => {
			h.update({ error: null });
		});
		h.update({ retry, error: { code: 'missing-run', diagnostics: [] } });
		await ui.retry();
		expect(retry).toHaveBeenCalledOnce();
		expect(ui.error).toBeNull();
		ui.acceptSummary({
			activeRunsByScenarioId: { 'first-profit': run },
			bestResultsByDefinitionKey: {},
			diagnostics: []
		});
		await ui.abandonActiveScenario();
		h.update({ run: null });
		expect(ui.cards[0].primaryAction).toBe('resume');
		expect(ui.cards[0].activeRunId).toBe(run.runId);
		vi.mocked(commands.restartScenarioRun).mockResolvedValueOnce({ status: 'unavailable' });
		await ui.restartScenarioCard(ui.cards[0]);
		expect(commands.restartScenarioRun).toHaveBeenLastCalledWith(run.definition);
		expect(ui.isCatalogOpen).toBe(true);
		ui.dismissError();
		expect(commands.dismissScenarioOperationError).toHaveBeenCalledOnce();
		expect(ui.error).toBeNull();
		await ui.restartScenarioCard(ui.cards[0]);
		expect(ui.isCatalogOpen).toBe(false);
		ui.openCatalog();
		flushSync();
		page
			.getByRole('dialog')
			.element()
			.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
			);
		flushSync();
		expect(ui.isCatalogOpen).toBe(false);
	} finally {
		await view.unmount();
	}
});

it('sandbox synchronization clears terminal contributor evidence before the observer returns', async () => {
	vi.mocked(createScenarioRepository).mockResolvedValue(repository());
	const view = render(RetailSimulationPage);
	try {
		await expect.poll(() => controllers.at(-1)?.controller.state.scenariosReady).toBe(true);
		const { controller, options } = controllers.at(-1)!;
		const ui = vi.mocked(createScenarioUi).mock.results.at(-1)!.value;
		const run = officialRun();
		const result = terminal(run);
		result.evaluation = {
			...result.evaluation,
			required: result.evaluation.required.map((row) => ({
				...row,
				evidence: { ...row.evidence, contributingIds: [run.game.stores[0].id] }
			}))
		};
		const named = (name: string) => ({
			...run.game,
			stores: run.game.stores.map((store) => ({ ...store, name }))
		});
		options.onScenarioTerminalRun?.({ ...run, game: named('Terminal Evidence') });
		options.onStateChange?.({
			...controller.state,
			playMode: 'scenario',
			lastScenarioResult: result
		});
		expect(ui.results?.required[0].contributorLabels).toEqual(['Terminal Evidence']);
		options.onStateChange?.({
			...controller.state,
			playMode: 'sandbox',
			sandboxGame: named('Sandbox Evidence'),
			lastScenarioResult: result
		});
		expect(ui.results?.required[0].contributorLabels).toEqual(['Sandbox Evidence']);
	} finally {
		await view.unmount();
	}
});

it('two mounted pages have isolated scenario owners and safe observer initialization', async () => {
	vi.mocked(createScenarioRepository).mockImplementation(async () => repository());
	const first = render(RetailSimulationPage);
	const second = render(RetailSimulationPage);
	try {
		await expect
			.poll(() => controllers.filter(({ controller }) => controller.state.scenariosReady).length)
			.toBe(2);
		expect(controllers[0].controller).not.toBe(controllers[1].controller);
		controllers[0].options.onScenarioSummary?.({
			activeRunsByScenarioId: { 'first-profit': officialRun() },
			bestResultsByDefinitionKey: {},
			diagnostics: []
		});
		// Each root constructs exactly one UI; one catalog opening must not open the other.
		const uis = vi
			.mocked(createScenarioUi)
			.mock.results.slice(-2)
			.map((result) => result.value);
		uis[0].openCatalog();
		expect(uis[0].cards[0].primaryAction).toBe('resume');
		expect(uis[1].cards[0].primaryAction).toBe('start');
		expect(uis[1].isCatalogOpen).toBe(false);
		uis[0].toggleObjectives();
		expect(uis[1].objectivesExpanded).toBe(false);
	} finally {
		await first.unmount();
		await second.unmount();
	}
});

it('unresolved definitions fall back to run ids and clear projections', () => {
	const h = presentation(() => undefined);
	const { ui } = h;
	expect(ui.definition).toBeNull();
	expect(ui.title).toBe('first-profit');
	expect(ui.versionLabel).not.toBe('');
	expect(ui.progress).toBeNull();
	expect(ui.hasActiveRun).toBe(true);
	expect(ui.showProgress).toBe(false);
	h.update({ result: terminal(h.inputs.run!), run: null });
	expect(ui.results).toBeNull();
	expect(ui.title).toBe('');
	expect(ui.versionLabel).toBe('');
	expect(ui.hasActiveRun).toBe(false);
});

it('guards stale catalog actions and missing definitions', async () => {
	const h = presentation();
	const { ui, commands } = h;
	ui.openCatalog();
	const staleCard = {
		...ui.cards[0],
		id: 'not-a-scenario'
	} as unknown as (typeof ui.cards)[number];
	expect(await ui.startScenarioCard(staleCard, false)).toMatchObject({ status: 'error' });
	expect(commands.startScenarioRun).not.toHaveBeenCalled();
	await ui.restartScenarioCard({ ...ui.cards[0], activeDefinitionRef: null });
	expect(commands.restartScenarioRun).not.toHaveBeenCalled();
	h.update({ run: null });
	await ui.restartActiveScenario();
	expect(commands.restartScenarioRun).not.toHaveBeenCalled();
	expect(await ui.importScenarioCode('garbage', false)).toMatchObject({ status: 'error' });
	vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValueOnce(undefined);
	expect(await ui.copyScenarioCode('code')).toBe(true);
	ui.returnToSandbox();
	expect(commands.returnToSandbox).toHaveBeenCalledOnce();
});

it('restarts active and finished runs and exits results through the catalog', async () => {
	const h = presentation();
	const { ui, commands } = h;
	const run = h.inputs.run!;
	ui.openCatalog();
	await ui.restartActiveScenario();
	expect(commands.restartScenarioRun).toHaveBeenCalledWith(run.definition);
	expect(ui.isCatalogOpen).toBe(false);
	await ui.restartResultScenario();
	expect(commands.startScenarioRun).not.toHaveBeenCalled();
	h.update({ run: null, result: terminal(run) });
	expect(ui.isResultsOpen).toBe(true);
	await ui.restartResultScenario();
	expect(commands.startScenarioRun).toHaveBeenCalledWith(
		expect.objectContaining({ id: 'first-profit' }),
		run.seed
	);
	expect(ui.isResultsOpen).toBe(false);
	h.update({ result: { ...terminal(run), score: 7 } });
	expect(ui.isResultsOpen).toBe(true);
	ui.openCatalogFromResults();
	expect(commands.returnToSandbox).toHaveBeenCalled();
	expect(ui.isCatalogOpen).toBe(true);
});

it('catalog buttons reach every session action', async () => {
	const h = presentation();
	const { ui, commands } = h;
	const view = render(ScenarioCatalogHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	try {
		const i18n = h.inputs.i18n;
		ui.openCatalog();
		const card = ui.cards.find((candidate) => candidate.primaryAction === 'resume')!;

		await page.getByRole('button', { name: `${card.primaryLabel} ${card.title}` }).click();
		expect(commands.resumeScenarioRun).toHaveBeenCalledOnce();
		ui.openCatalog();
		await page
			.getByRole('button', { name: `${i18n.t('scenarioCatalog.restart')} ${card.title}` })
			.click();
		expect(commands.restartScenarioRun).toHaveBeenCalledOnce();
		ui.openCatalog();
		vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
		await page
			.getByRole('button', { name: i18n.t('scenarioCatalog.copyCode', { title: card.title }) })
			.click();
		await page.getByLabelText(i18n.t('scenarioCatalog.shareCode')).fill('garbage');
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.importCode') }).click();
		const retry = vi.fn(async () => {});
		h.update({ error: { code: 'missing-run', diagnostics: [] }, retry });
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.retry') }).click();
		expect(retry).toHaveBeenCalledOnce();
		h.update({ error: null });
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.close') }).click();
		expect(ui.isCatalogOpen).toBe(false);

		// An active run on a non-current version renders the start-current action.
		h.update({
			run: {
				...h.inputs.run!,
				definition: { ...h.inputs.run!.definition, version: 99 }
			}
		});
		ui.openCatalog();
		const outdated = ui.cards.find((candidate) => candidate.showStartCurrent)!;
		await page
			.getByRole('button', {
				name: `${i18n.t('scenarioCatalog.startCurrent')} ${outdated.title}`
			})
			.click();
		expect(commands.startScenarioRun).toHaveBeenCalledOnce();

		// No active run renders the plain Start action.
		h.update({ run: null });
		ui.openCatalog();
		const fresh = ui.cards.find((candidate) => candidate.primaryAction === 'start')!;
		await page.getByRole('button', { name: `${fresh.primaryLabel} ${fresh.title}` }).click();
		expect(commands.startScenarioRun).toHaveBeenCalledTimes(2);
	} finally {
		await view.unmount();
	}
});

it('results dialog buttons reach the session', async () => {
	const h = presentation();
	const { ui, commands } = h;
	const view = render(ScenarioResultsHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	try {
		const i18n = h.inputs.i18n;
		const run = h.inputs.run!;
		const showResult = () => h.update({ result: terminal(run), run: null });
		showResult();
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.restartChallenge') }).click();
		expect(commands.startScenarioRun).toHaveBeenCalledOnce();
		showResult();
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.catalog') }).click();
		expect(ui.isCatalogOpen).toBe(true);
		ui.closeCatalog();
		showResult();
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.returnSandbox') }).click();
		expect(commands.returnToSandbox).toHaveBeenCalled();
		showResult();
		const retry = vi.fn(async () => {});
		h.update({ error: { code: 'missing-run', diagnostics: [] }, retry });
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.retry') }).click();
		expect(retry).toHaveBeenCalledOnce();
		h.update({ error: { code: 'missing-run', diagnostics: [] } });
		await page.getByRole('button', { name: i18n.t('scenarioStatus.dismiss') }).click();
		expect(commands.dismissScenarioOperationError).toHaveBeenCalledOnce();
		h.update({ error: null });
		await page.getByRole('button', { name: i18n.t('scenarioResults.close') }).click();
		expect(ui.isResultsOpen).toBe(false);
	} finally {
		await view.unmount();
	}
});

it('menu action buttons reach the session', async () => {
	const h = presentation();
	const { ui, commands } = h;
	const view = render(ScenarioMenuActions, {
		ui,
		playMode: 'scenario',
		get i18n() {
			return h.inputs.i18n;
		},
		onOpenSaves: () => {}
	});
	try {
		const i18n = h.inputs.i18n;
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.challengeDetails') }).click();
		expect(ui.isCatalogOpen).toBe(true);
		ui.closeCatalog();
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.catalog') }).click();
		expect(ui.isCatalogOpen).toBe(true);
		ui.closeCatalog();
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.returnSandbox') }).click();
		expect(commands.returnToSandbox).toHaveBeenCalledOnce();
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.abandon') }).click();
		await page.getByRole('button', { name: i18n.t('scenarioCatalog.confirmAbandon') }).click();
		expect(commands.abandonScenarioRun).toHaveBeenCalledOnce();
	} finally {
		await view.unmount();
	}
});

it('progress strip retry and dismiss reach the session', async () => {
	const h = presentation();
	const { ui, commands } = h;
	const view = render(ScenarioProgressHost, {
		ui,
		get i18n() {
			return h.inputs.i18n;
		}
	});
	try {
		const retry = vi.fn(async () => {});
		h.update({ error: { code: 'missing-run', diagnostics: [] }, retry });
		const strip = vi.mocked(ScenarioStatusStrip).mock.calls.at(-1)![1];
		await strip.onRetry();
		expect(retry).toHaveBeenCalledOnce();
		await strip.onDismissError();
		expect(commands.dismissScenarioOperationError).toHaveBeenCalledOnce();
	} finally {
		await view.unmount();
	}
});
