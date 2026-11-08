import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { SfxCueId } from '$lib/audio/audioCatalog';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import { createRecurringRoute } from '$lib/game/interCityLogistics';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import { openWorldCity } from '$lib/game/world';
import {
	createBrowserSaveRepository,
	BROWSER_SAVE_STORAGE_KEY
} from '$lib/persistence/browserSaveRepository';
import {
	createAutoSaveRecord,
	createEmptySaveStore,
	validateSaveStoreSnapshot
} from '$lib/persistence/saveCodec';
import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
import { createMapSession } from './mapSession.svelte';
import RetailSimulationPage from './+page.svelte';

// Production-connected coverage for the page's keyboard dispatch switches.
// The adapter spec (routeKeyboard.svelte.spec.ts) mirrors the root dispatch in
// its harness; these tests mount the actual route so the page's own
// closeOverlay/clearSelection wiring — silent build-menu Escape close and the
// paired logistics selection clear — is what runs. (The keyboard-entry fresh
// openManagementEntry("logistics") contract is covered by
// managementPanelEntry.svelte.spec.ts, which also mounts the real page.)

const audioMocks = vi.hoisted(() => ({
	playSfx: vi.fn<(cueId: SfxCueId) => Promise<void>>(async () => {})
}));

vi.mock('$lib/persistence/saveRepositoryFactory', () => ({ createSaveRepository: vi.fn() }));
vi.mock('$lib/audio/audioController', () => ({
	createGameAudioController: () => ({
		unlock: async () => {},
		setActiveBgm: () => {},
		playSfx: audioMocks.playSfx,
		getPreferences: () => DEFAULT_AUDIO_PREFERENCES,
		updatePreferences: () => {},
		destroy: async () => {}
	})
}));
// Spy only: the page gets the real map session; the spy hands the test the
// created instance so coexisting selection state can be produced through the
// owner's real methods (the clear-on-select rules make the UI itself unable
// to produce that state).
vi.mock('./mapSession.svelte', { spy: true });

afterEach(() => {
	vi.restoreAllMocks();
	audioMocks.playSfx.mockClear();
	window.history.replaceState(null, '', window.location.pathname);
});

/** One recurring route between the two industry cities, save-validated. */
function routeGame(): GameState {
	let game = createNewGame('convenience', 20260810);
	game = {
		...game,
		cash: 1_000_000,
		world: { ...game.world, revealedCityIds: [...game.world.revealedCityIds, 'breadbasket-basin'] }
	};
	game = openWorldCity(game, 'breadbasket-basin');
	const created = createRecurringRoute(game, {
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'bottled-water',
		capacity: 2,
		frequencyDays: 2,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 0
	});
	if (!created.ok) throw new Error(`Route fixture failed: ${created.reason}`);
	return created.game;
}

function saveRepositoryWith(game: GameState | null) {
	const storage = new Map<string, string>();
	if (game !== null) {
		storage.set(
			BROWSER_SAVE_STORAGE_KEY,
			JSON.stringify(
				validateSaveStoreSnapshot({
					...createEmptySaveStore(),
					autoSave: createAutoSaveRecord(game, new Date('2026-08-01T12:00:00.000Z'))
				})
			)
		);
	}
	return createBrowserSaveRepository({
		getItem: (key) => storage.get(key) ?? null,
		setItem: (key, value) => void storage.set(key, value),
		removeItem: (key) => void storage.delete(key)
	});
}

/** Mounts the real route. With a game, the production `?ui-comparison=1`
 * bootstrap resumes the auto-save and selects the founding store's tile. */
function mountRoute(game: GameState | null = null) {
	vi.mocked(createSaveRepository).mockResolvedValue(saveRepositoryWith(game));
	if (game !== null) window.history.replaceState(null, '', '?ui-comparison=1');
	return render(RetailSimulationPage);
}

function mountedSession() {
	return vi.mocked(createMapSession).mock.results.at(-1)!.value;
}

const buildMenu = () => page.getByRole('dialog', { name: /build menu/i });

/** Element-count probe: the menu is conditionally rendered, so closed = 0. */
async function buildMenuCount(): Promise<number> {
	return (await buildMenu().elements()).length;
}

it('closes the build menu silently on Escape while the b toggle keeps its close sound', async () => {
	const view = mountRoute();
	try {
		await userEvent.keyboard('b');
		await expect.element(buildMenu()).toBeVisible();
		expect(audioMocks.playSfx).toHaveBeenCalledWith('sfx.ui.panel-open');

		// Opening traps focus inside the dialog, whose own Escape handler closes
		// with the user-facing SFX. The page's window dispatch is the fallback for
		// focus-escaped events (the focused control was removed, focus fell to
		// <body> — the state focusTrap's document-level handling anticipates), and
		// that fallback must stay silent: hide, not the SFX-playing close.
		(document.activeElement as HTMLElement | null)?.blur();
		expect(document.activeElement).toBe(document.body);

		await userEvent.keyboard('{Escape}');
		await vi.waitFor(async () => expect(await buildMenuCount()).toBe(0));
		expect(audioMocks.playSfx).not.toHaveBeenCalledWith('sfx.ui.panel-close');

		// The user-facing b toggle still closes with its sound.
		await userEvent.keyboard('b');
		await expect.element(buildMenu()).toBeVisible();
		await userEvent.keyboard('b');
		await vi.waitFor(async () => expect(await buildMenuCount()).toBe(0));
		expect(audioMocks.playSfx).toHaveBeenCalledWith('sfx.ui.panel-close');
	} finally {
		await view.unmount();
	}
});

it('drops the paired logistics selection when Escape clears a coexisting tile selection', async () => {
	const view = mountRoute(routeGame());
	try {
		const session = mountedSession();
		// The comparison bootstrap finishing = auto-save resumed + tile selected.
		await vi.waitFor(() => expect(session.selectedTileId).not.toBeNull());
		const storeTileId = session.selectedTileId!;

		// Coexisting selections through the owner's real methods: selecting the
		// route clears the tile, and the read-only receiver re-seeds it — the
		// one state the UI's clear-on-select rules cannot produce themselves.
		session.selectLogisticsRoute('route-1');
		session.acceptReadOnlySelection('retail', storeTileId);
		expect(session.selectedLogisticsRouteId).toBe('route-1');
		expect(session.selectedTileId).toBe(storeTileId);

		await userEvent.keyboard('{Escape}');
		expect(session.selectedTileId).toBeNull();
		// The page's Escape clear pairs every non-logistics clear with a
		// logistics clear, which also drops the management route focus.
		expect(session.selectedLogisticsRouteId).toBeNull();
	} finally {
		await view.unmount();
	}
});
