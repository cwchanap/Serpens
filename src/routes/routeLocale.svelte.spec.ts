import { page } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import { createNewGame } from '$lib/game/state';
import { simulateDay } from '$lib/game/simulateDay';
import type { GameState } from '$lib/game/types';
import { LANGUAGE_PREFERENCE_STORAGE_KEY } from '$lib/i18n/locales';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import { createBrowserSaveRepository } from '$lib/persistence/browserSaveRepository';
import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
import { createBrowserScenarioRepository } from '$lib/persistence/browserScenarioRepository';
import { createScenarioRepository } from '$lib/persistence/scenarioRepositoryFactory';
import { createSaveUi } from './saveUi.svelte';
import RetailSimulationPage from './+page.svelte';
import type { GameRouteController } from './gameRouteController';

/** Mounted-route locale contract: guarded storage/navigator initialization, live document language, and cash-recovery dismissal keyed on the primitive crisis kind. */
vi.mock('$lib/persistence/saveRepositoryFactory', () => ({ createSaveRepository: vi.fn() }));
vi.mock('$lib/persistence/scenarioRepositoryFactory', () => ({
	createScenarioRepository: vi.fn()
}));
vi.mock('./saveUi.svelte', { spy: true });
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

async function mountRoute(): Promise<GameRouteController> {
	vi.mocked(createSaveRepository).mockResolvedValue(createBrowserSaveRepository(mapStorage()));
	vi.mocked(createScenarioRepository).mockResolvedValue(
		createBrowserScenarioRepository(mapStorage(), resolveScenarioDefinition)
	);
	mounted = render(RetailSimulationPage);
	await expect.poll(() => vi.mocked(createSaveUi).mock.calls.length).toBeGreaterThan(0);
	const options = vi.mocked(createSaveUi).mock.calls.at(-1)![0];
	return options.commands as GameRouteController;
}

/** Shadows navigator.language / navigator.languages for one test; deleted again in afterEach. */
function stubNavigator(input: { languages?: string[]; language?: string }): void {
	if (input.languages) {
		Object.defineProperty(globalThis.navigator, 'languages', {
			configurable: true,
			get: () => input.languages
		});
	}
	if (input.language) {
		Object.defineProperty(globalThis.navigator, 'language', {
			configurable: true,
			get: () => input.language
		});
	}
}

/** Makes the window.localStorage property access itself throw, like a privacy-restricted origin. */
function breakLocalStorage(): () => void {
	const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
	Object.defineProperty(window, 'localStorage', {
		configurable: true,
		get() {
			throw new DOMException('storage denied', 'SecurityError');
		}
	});
	return () => Object.defineProperty(window, 'localStorage', original);
}

/** Past the sandbox opening window (8 reports) with the given cash position. */
function crisisGame(seed: number, cash: number): GameState {
	let game: GameState = createNewGame('convenience', seed);
	for (let day = 0; day < 8; day += 1) game = simulateDay(game);
	return { ...game, cash };
}

/** Same game shape, but the cash crisis is a missed loan payment instead of a low runway. */
function missedPaymentGame(base: GameState): GameState {
	return {
		...base,
		cash: 5_000_000,
		finance: {
			...base.finance,
			loans: base.finance.loans.map((loan) => ({ ...loan, overdueInterest: 250 }))
		}
	};
}

function dayNumber(): number {
	const text = document.querySelector('.control-desk .day')?.textContent ?? '';
	return Number(text.match(/\d+/)?.[0] ?? 0);
}

afterEach(async () => {
	if (mounted) {
		await mounted.unmount();
		mounted = null;
	}
	Reflect.deleteProperty(globalThis.navigator, 'languages');
	Reflect.deleteProperty(globalThis.navigator, 'language');
	vi.restoreAllMocks();
	localStorage.clear();
});

it('falls back to the navigator locale when the localStorage property itself throws', async () => {
	stubNavigator({ languages: ['en-US'], language: 'en-US' });
	const restoreStorage = breakLocalStorage();
	try {
		await mountRoute();
		await expect.element(page.getByRole('main')).toBeVisible();
		await expect.poll(() => document.documentElement.lang).toBe('en');
	} finally {
		restoreStorage();
	}
});

it('includes navigator.language when it is absent from navigator.languages', async () => {
	// The primary language is unresolvable, so the appended navigator.language
	// is the only candidate that can match — without the fallback a `ja-JP`
	// user would fall through to the English default.
	stubNavigator({ languages: ['fr-FR'], language: 'ja-JP' });
	await mountRoute();
	await expect.poll(() => document.documentElement.lang).toBe('ja');
});

it('initializes from the saved preference and changes live without resetting the game', async () => {
	localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'zh-Hant');
	const controller = await mountRoute();
	await expect.poll(() => document.documentElement.lang).toBe('zh-Hant');

	const game = createNewGame('convenience', 20261108);
	controller.loadSandboxGame(game);
	// Space is the pause-toggle shortcut; the button label is localized under
	// zh-Hant, so freeze the day clock through the keyboard path instead.
	window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
	await expect.element(page.getByRole('main')).toHaveAttribute('data-simulation-paused', 'true');
	expect(dayNumber()).toBe(game.day);

	await page.getByTestId('game-menu-trigger').click();
	await page.getByTestId('language-selector').selectOptions('ja');
	await expect.poll(() => document.documentElement.lang).toBe('ja');
	expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('ja');

	// The locale change re-renders copy but never resets the loaded game.
	expect(dayNumber()).toBe(game.day);
	expect(page.getByRole('main').element().getAttribute('data-play-mode')).toBe('sandbox');
});

it('keeps cash-recovery dismissal across locale and game changes and rearms on a new crisis kind', async () => {
	const controller = await mountRoute();
	const lowCash = crisisGame(20261109, -4_000);
	controller.loadSandboxGame(lowCash);
	await page.getByRole('button', { name: 'Pause', exact: true }).click(); // freeze the day clock
	await expect.element(page.getByTestId('cash-recovery-guidance')).toBeVisible();

	await page.getByTestId('cash-recovery-dismiss').click();
	await expect.element(page.getByTestId('cash-recovery-guidance')).not.toBeInTheDocument();

	// A locale change keeps the dismissal (it must not reset anything).
	await page.getByTestId('game-menu-trigger').click();
	await page.getByTestId('language-selector').selectOptions('ja');
	await expect.poll(() => document.documentElement.lang).toBe('ja');
	await expect.element(page.getByTestId('cash-recovery-guidance')).not.toBeInTheDocument();

	// A replaced game object with the same crisis kind stays dismissed.
	controller.loadSandboxGame({ ...lowCash, cash: lowCash.cash - 1 });
	await expect.element(page.getByTestId('cash-recovery-guidance')).not.toBeInTheDocument();

	// A different primitive crisis kind re-arms the card.
	controller.loadSandboxGame(missedPaymentGame(lowCash));
	await expect.element(page.getByTestId('cash-recovery-guidance')).toBeVisible();
});
