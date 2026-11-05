import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createNewGame } from '$lib/game/state';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import { createGameAudioController } from '$lib/audio/audioController';
import type { SfxCueId } from '$lib/audio/audioCatalog';
import { createBrowserSaveRepository } from '$lib/persistence/browserSaveRepository';
import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
import type { SaveSummary } from '$lib/persistence/saveTypes';
import RetailSimulationPage from './+page.svelte';

vi.mock('$lib/persistence/saveRepositoryFactory', () => ({ createSaveRepository: vi.fn() }));
vi.mock('$lib/audio/audioController', () => ({ createGameAudioController: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe('manual save feedback ordering', () => {
	for (const operation of ['create', 'overwrite', 'delete'] as const) {
		for (const outcome of ['resolve', 'reject'] as const) {
			it(`${operation} shows success before a deferred summary ${outcome}s`, async () => {
				// Keep real persistence and route/page behavior; only gate the summary read.
				const storage = new Map<string, string>();
				const repository = createBrowserSaveRepository({
					getItem: (key) => storage.get(key) ?? null,
					setItem: (key, value) => void storage.set(key, value),
					removeItem: (key) => void storage.delete(key)
				});
				const game = createNewGame('convenience', 71);
				await repository.saveAuto(game);
				await repository.createManualSlot('Existing', game);
				vi.mocked(createSaveRepository).mockResolvedValue(repository);
				const playSfx = vi.fn<(cue: SfxCueId) => Promise<void>>(async () => {});
				vi.mocked(createGameAudioController).mockReturnValue({
					unlock: async () => {},
					setActiveBgm: () => {},
					playSfx,
					getPreferences: () => DEFAULT_AUDIO_PREFERENCES,
					updatePreferences: () => {},
					destroy: async () => {}
				});
				const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
				await page.viewport(1280, 800);
				const view = render(RetailSimulationPage);
				let resolve!: (summary: SaveSummary) => void;
				let reject!: (error: unknown) => void;
				const summaryGate = new Promise<SaveSummary>((resolvePromise, rejectPromise) => {
					resolve = resolvePromise;
					reject = rejectPromise;
				});
				try {
					await page.getByRole('button', { name: /^menu$/i }).click();
					await page.getByRole('button', { name: /saves/i }).click();
					const panel = page.getByRole('dialog', { name: /saves/i });
					await panel.getByRole('button', { name: /^resume$/i }).click();
					await expect.element(panel.getByRole('status')).toHaveTextContent('Loaded auto-save');

					// A previous error must be replaced as soon as the next write succeeds.
					vi.spyOn(repository, 'createManualSlot').mockRejectedValueOnce(new Error('write boom'));
					await panel.getByRole('textbox', { name: /slot name/i }).fill('Fail first');
					await panel.getByRole('button', { name: /save slot/i }).click();
					await expect.element(panel.getByRole('alert')).toBeVisible();
					playSfx.mockClear();
					vi.spyOn(repository, 'getSummary').mockReturnValue(summaryGate);
					if (operation === 'create') {
						await panel.getByRole('textbox', { name: /slot name/i }).fill('New slot');
						await panel.getByRole('button', { name: /save slot/i }).click();
					} else {
						await panel.getByRole('button', { name: new RegExp(`^${operation}$`, 'i') }).click();
					}

					const success =
						operation === 'delete'
							? 'Deleted save slot'
							: `Saved ${operation === 'create' ? 'New slot' : 'Existing'}`;
					await expect.element(panel.getByRole('status')).toHaveTextContent(success);
					await expect.element(panel.getByRole('alert')).not.toBeInTheDocument();
					expect(playSfx).not.toHaveBeenCalledWith('sfx.save.saved');

					if (outcome === 'resolve') {
						resolve({ autoSave: null, manualSlots: [], diagnostics: [] });
						await expect
							.element(panel.getByRole('heading', { name: 'Existing', exact: true }))
							.not.toBeInTheDocument();
						await expect.element(panel.getByRole('status')).toHaveTextContent(success);
						if (operation !== 'delete') {
							await expect
								.poll(() => playSfx.mock.calls.filter(([cue]) => cue === 'sfx.save.saved').length)
								.toBe(1);
						}
					} else {
						reject(new Error('summary boom'));
						await expect.element(panel.getByRole('alert')).toBeVisible();
						await expect.element(panel.getByRole('status')).not.toBeInTheDocument();
						expect(logError).toHaveBeenLastCalledWith(
							'Save operation failed:',
							expect.objectContaining({ message: 'summary boom' })
						);
					}
					if (outcome === 'reject' || operation === 'delete') {
						expect(playSfx).not.toHaveBeenCalledWith('sfx.save.saved');
					}
				} finally {
					resolve({ autoSave: null, manualSlots: [], diagnostics: [] });
					await view.unmount();
				}
			});
		}
	}
});
