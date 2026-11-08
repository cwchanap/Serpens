import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import { createBrowserSaveRepository } from '$lib/persistence/browserSaveRepository';
import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
import { createBrowserScenarioRepository } from '$lib/persistence/browserScenarioRepository';
import { createScenarioRepository } from '$lib/persistence/scenarioRepositoryFactory';
import RetailSimulationPage from './+page.svelte';
import type { AudioPreferences } from '$lib/audio/audioPreferences';

interface AudioControllerMock {
	unlock: ReturnType<typeof vi.fn>;
	setActiveBgm: ReturnType<typeof vi.fn>;
	playSfx: ReturnType<typeof vi.fn>;
	getPreferences: ReturnType<typeof vi.fn>;
	updatePreferences: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
}

/** Mounted-route audio contract: audio mounts after save/scenario boot, pins the first BGM to the live view, unlocks on key/pointer input and tears down exactly once. */
const harness = vi.hoisted(() => ({
	order: [] as string[],
	controllers: [] as AudioControllerMock[],
	storedPreferences: {
		bgmEnabled: false,
		bgmVolume: 0.5,
		sfxEnabled: true,
		sfxVolume: 0.4
	}
}));

vi.mock('$lib/audio/audioController', () => ({
	createGameAudioController: (options: {
		onPreferencesChanged?: (preferences: AudioPreferences) => void;
	}) => {
		const controller: AudioControllerMock = {
			unlock: vi.fn(async () => {}),
			setActiveBgm: vi.fn(),
			playSfx: vi.fn(async () => {}),
			getPreferences: vi.fn(() => harness.storedPreferences),
			updatePreferences: vi.fn((patch: Partial<AudioPreferences>) => {
				options.onPreferencesChanged?.({ ...harness.storedPreferences, ...patch });
			}),
			destroy: vi.fn(async () => {})
		};
		harness.controllers.push(controller);
		harness.order.push('audio');
		return controller;
	}
}));
vi.mock('./gameRouteController', async (importOriginal) => {
	const original = await importOriginal<typeof import('./gameRouteController')>();
	return {
		...original,
		GameRouteController: class extends original.GameRouteController {
			override initializeSaves(): Promise<void> {
				harness.order.push('saves');
				return super.initializeSaves();
			}

			override initializeScenarios(): Promise<void> {
				harness.order.push('scenarios');
				return super.initializeScenarios();
			}
		}
	};
});
vi.mock('$lib/persistence/saveRepositoryFactory', () => ({ createSaveRepository: vi.fn() }));
vi.mock('$lib/persistence/scenarioRepositoryFactory', () => ({
	createScenarioRepository: vi.fn()
}));
function mapStorage() {
	const storage = new Map<string, string>();
	return {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => void storage.set(key, value),
		removeItem: (key: string) => void storage.delete(key)
	};
}

type MountedRoute = ReturnType<typeof render>;

let mounted: MountedRoute | null = null;

async function mountRoute(): Promise<MountedRoute> {
	vi.mocked(createSaveRepository).mockResolvedValue(createBrowserSaveRepository(mapStorage()));
	vi.mocked(createScenarioRepository).mockResolvedValue(
		createBrowserScenarioRepository(mapStorage(), resolveScenarioDefinition)
	);
	const view = render(RetailSimulationPage);
	mounted = view;
	await expect.poll(() => [...harness.order]).toEqual(['saves', 'scenarios', 'audio']);
	return view;
}

afterEach(async () => {
	if (mounted) {
		await mounted.unmount();
		mounted = null;
	}
	vi.restoreAllMocks();
	harness.order.length = 0;
	harness.controllers.length = 0;
	localStorage.clear();
});

it('initializes saves and scenarios before audio and tears audio down exactly once', async () => {
	const view = await mountRoute();
	// The mount order above is pinned by the poll: saves, then scenarios, then
	// audio. A TDZ break in the root wiring would have failed the render itself.
	const controller = harness.controllers.at(-1)!;
	expect(controller.getPreferences).toHaveBeenCalledTimes(1);

	// The synchronous mount cleanup runs exactly once on unmount; an async
	// "cleanup" promise would never be registered and destroy would stay at 0.
	await view.unmount();
	mounted = null;
	expect(controller.destroy).toHaveBeenCalledTimes(1);
});

it('pins the first BGM to the current view and follows later view changes', async () => {
	await mountRoute();
	const controller = harness.controllers.at(-1)!;
	expect(controller.setActiveBgm.mock.calls[0]).toEqual(['bgm.retail-map']);

	window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
	await expect.element(page.getByRole('main')).toHaveAttribute('data-active-map-view', 'world');
	expect(controller.setActiveBgm).toHaveBeenLastCalledWith('bgm.world-map');

	window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
	await expect.element(page.getByRole('main')).toHaveAttribute('data-active-map-view', 'industry');
	expect(controller.setActiveBgm).toHaveBeenLastCalledWith('bgm.industry-map');
});

it('unlocks audio on keydown and pointerdown', async () => {
	await mountRoute();
	window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
	await page.getByRole('main').click();
	expect(harness.controllers.at(-1)!.unlock).toHaveBeenCalledTimes(2);
});

it('initializes preferences from the controller and applies live updates', async () => {
	await mountRoute();
	await page.getByTestId('game-menu-trigger').click();
	const bgmToggle = page.getByRole('checkbox', { name: 'BGM' });
	// Initialized from the controller's stored preferences, not the defaults.
	await expect.element(bgmToggle).not.toBeChecked();

	await bgmToggle.click();
	const controller = harness.controllers.at(-1)!;
	expect(controller.updatePreferences).toHaveBeenCalledWith({ bgmEnabled: true });
	// The preferences change propagates live through onPreferencesChanged.
	await expect.element(bgmToggle).toBeChecked();
});
