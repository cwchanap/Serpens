import { flushSync } from 'svelte';
import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createNewGame } from '$lib/game/state';
import { createI18n, type I18nBundle } from '$lib/i18n';
import { createBrowserSaveRepository } from '$lib/persistence/browserSaveRepository';
import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
import { SaveDataError } from '$lib/persistence/saveCodec';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import { GameRouteController } from './gameRouteController';
import MapInspectorHost from './MapInspectorHost.svelte';
import ManagementPanelHost from './ManagementPanelHost.svelte';
import { createSaveUi } from './saveUi.svelte';
import SavePanelHost from './SavePanelHost.svelte';
import RetailSimulationPage from './+page.svelte';

vi.mock('$lib/persistence/saveRepositoryFactory', () => ({ createSaveRepository: vi.fn() }));
vi.mock('./saveUi.svelte', { spy: true });
vi.mock('./MapInspectorHost.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('./MapInspectorHost.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('./ManagementPanelHost.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('./ManagementPanelHost.svelte')>();
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
afterEach(() => vi.restoreAllMocks());

function repository() {
	const storage = new Map<string, string>();
	return createBrowserSaveRepository({
		getItem: (key) => storage.get(key) ?? null,
		setItem: (key, value) => void storage.set(key, value),
		removeItem: (key) => void storage.delete(key)
	});
}

it('save UI relocalizes feedback and resets only loaded results', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	const repo = repository();
	let game = $state.raw<ReturnType<typeof createNewGame> | null>(null);
	let i18n = $state.raw<I18nBundle>(createI18n('en'));
	const onLoaded = vi.fn();
	const onOpen = vi.fn();
	const playSfx = vi.fn();
	const controller = new GameRouteController({
		createSaveRepository: async () => repo,
		createScenarioRepository: async () => {
			throw new Error('not used');
		},
		resolveScenarioDefinition: () => undefined,
		playSfx,
		onStateChange: (state) => {
			game = state.sandboxGame;
		},
		onSaveSummary: (summary) => ui.acceptSummary(summary)
	});
	const ui = createSaveUi({
		getGame: () => game,
		getI18n: () => i18n,
		commands: controller,
		playSfx,
		onOpen,
		onLoaded
	});
	const view = render(SavePanelHost, {
		ui,
		get game() {
			return game;
		},
		get i18n() {
			return i18n;
		}
	});
	try {
		await ui.initialize();
		controller.loadSandboxGame(createNewGame('convenience', 71));
		ui.open();
		expect(onOpen).toHaveBeenCalledTimes(1);
		await ui.saveManualSlot('Live');
		await expect.element(page.getByRole('status')).toHaveTextContent('Saved Live');
		ui.acceptAutoSave({ ...ui.manualSlots[0], day: 1234 });
		await expect.element(page.getByRole('status')).toHaveTextContent('Auto-saved day 1,234');
		flushSync(() => {
			const next = createI18n('ja');
			i18n = { ...next, format: { ...next.format, integer: (value) => `DAY-${value}` } };
		});
		await expect.element(page.getByRole('status')).toHaveTextContent('DAY-1234');
		expect(page.getByRole('status').element().textContent).not.toContain('Auto-saved');
		ui.close();
		ui.acceptAutoSaveError(new Error('hidden error'));
		ui.open();
		expect(ui.error).toBeNull();
		await ui.loadManualSlot(ui.manualSlots[0].id);
		expect(onLoaded).toHaveBeenCalledTimes(1);
	} finally {
		await view.unmount();
	}
});

for (const operation of ['auto', 'manual'] as const) {
	for (const outcome of ['loaded', 'missing', 'unavailable', 'throw'] as const) {
		it(`${operation} ${outcome} preserves the mounted route except for successful load reset`, async () => {
			const repo = repository();
			const game = createNewGame('convenience', 71);
			await repo.saveAuto(game);
			const slot = await repo.createManualSlot('Existing', game);
			vi.mocked(createSaveRepository).mockResolvedValue(repo);
			const log = vi.spyOn(console, 'error').mockImplementation(() => {});
			const view = render(RetailSimulationPage);
			try {
				await page.getByRole('button', { name: /^menu$/i }).click();
				await page.getByRole('button', { name: /^saves$/i }).click();
				const ui = vi.mocked(createSaveUi).mock.results.at(-1)!.value;
				const options = vi.mocked(createSaveUi).mock.calls.at(-1)![0];
				await ui.resumeAutoSave();
				ui.close();
				await page.getByTestId('opening-guidance-dismiss').click();
				const controller = options.commands as GameRouteController;
				controller.selectReadOnlyTile('retail', game.stores[0].tileId);
				await expect.element(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
				// A running clock must stay running on unsuccessful loads.
				await page.getByRole('button', { name: /^resume$/i }).click();
				const onLoaded = vi.spyOn(options, 'onLoaded');
				const load = vi.spyOn(
					controller,
					operation === 'auto' ? 'resumeAutoSave' : 'loadManualSave'
				);
				if (outcome === 'throw') load.mockRejectedValueOnce(new Error('load boom'));
				else load.mockResolvedValueOnce(outcome);
				await (operation === 'auto' ? ui.resumeAutoSave() : ui.loadManualSlot(slot.id));
				if (outcome === 'loaded') {
					expect(onLoaded).toHaveBeenCalledTimes(1);
					await expect
						.element(page.getByRole('dialog', { name: /tile details/i }))
						.not.toBeInTheDocument();
					await expect.element(page.getByTestId('opening-guidance')).toBeVisible();
					await expect
						.element(page.getByRole('main'))
						.toHaveAttribute('data-simulation-paused', 'true');
				} else {
					expect(onLoaded).not.toHaveBeenCalled();
					await expect.element(page.getByRole('dialog', { name: /tile details/i })).toBeVisible();
					await expect.element(page.getByTestId('opening-guidance')).not.toBeInTheDocument();
					await expect
						.element(page.getByRole('main'))
						.toHaveAttribute('data-simulation-paused', 'false');
					if (outcome === 'throw')
						expect(log).toHaveBeenCalledWith(
							'Save operation failed:',
							expect.objectContaining({ message: 'load boom' })
						);
				}
			} finally {
				await view.unmount();
			}
		});
	}
}

it('opening saves hides management without its stronger close cleanup', async () => {
	vi.mocked(createSaveRepository).mockResolvedValue(repository());
	const view = render(RetailSimulationPage);
	try {
		await page.getByRole('button', { name: /^menu$/i }).click();
		await page.getByRole('button', { name: /^saves$/i }).click();
		const ui = vi.mocked(createSaveUi).mock.results.at(-1)!.value;
		const options = vi.mocked(createSaveUi).mock.calls.at(-1)![0];
		const onLoaded = vi.spyOn(options, 'onLoaded');
		ui.close();
		flushSync(() => {
			vi.mocked(MapInspectorHost).mock.calls.at(-1)![1].onManageLogisticsRoute!('retained-route');
		});
		const panel = vi.mocked(ManagementPanelHost).mock.calls.at(-1)![1];
		expect(panel.focusedLogisticsRouteId).toBe('retained-route');
		flushSync(() => ui.open());
		await expect.element(page.getByRole('dialog', { name: /saves/i })).toBeVisible();
		await expect.element(page.getByRole('dialog', { name: /management/i })).not.toBeInTheDocument();
		// These are live route props even while the management host is hidden.
		expect(panel.focusedLogisticsRouteId).toBe('retained-route');
		expect(onLoaded).not.toHaveBeenCalled();
	} finally {
		await view.unmount();
	}
});

it('save observers map errors without losing live localization', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	let i18n = $state.raw(createI18n('en'));
	const controller = new GameRouteController({
		createSaveRepository: async () => repository(),
		createScenarioRepository: async () => {
			throw new Error('not used');
		},
		resolveScenarioDefinition: () => undefined,
		playSfx: () => {}
	});
	const ui = createSaveUi({
		getGame: () => null,
		getI18n: () => i18n,
		commands: controller,
		playSfx: () => {},
		onOpen: () => {},
		onLoaded: () => {}
	});
	for (const code of ['storage-unavailable', 'slot-not-found', 'corrupt'] as const) {
		ui.acceptAutoSaveError(new SaveDataError('bad save', code));
		expect(ui.error).toBeTruthy();
		expect(ui.status).toBe('');
	}
	const english = ui.error;
	i18n = createI18n('ja');
	expect(ui.error).not.toBe(english);
	expect(log).toHaveBeenCalledTimes(3);
	await ui.saveManualSlot('No game');
	await ui.deleteManualSlot('not ready');
	expect(ui.manualSlots).toEqual([]);
});
