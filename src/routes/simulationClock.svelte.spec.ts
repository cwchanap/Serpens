import { page } from 'vitest/browser';
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import { createNewGame } from '$lib/game/state';
import { createBrowserSaveRepository } from '$lib/persistence/browserSaveRepository';
import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
import { createBrowserScenarioRepository } from '$lib/persistence/browserScenarioRepository';
import { createScenarioRepository } from '$lib/persistence/scenarioRepositoryFactory';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import RetailSimulationPage from './+page.svelte';
import type {
	GameRouteCommitResult,
	GameRouteController,
	GameRouteControllerOptions,
	GameRouteControllerState
} from './gameRouteController';

/**
 * Mounted-route clock contract: the auto-tick timer's lifecycle may depend
 * only on the primitive hasGame/pause/speed/tickPending/blocked/rearm inputs.
 * Every test below mounts the real route under fake timers so the assertions
 * exercise actual Svelte effect lifetime, not a node-only timer stub.
 */
const harness = vi.hoisted(() => ({
	controllers: [] as Array<{
		controller: import('./gameRouteController').GameRouteController;
		options: import('./gameRouteController').GameRouteControllerOptions;
	}>,
	advanceDay: undefined as unknown as Mock<
		() => Promise<import('$lib/game/commandResult').GameRouteCommitResult>
	>
}));

vi.mock('./gameRouteController', async (importOriginal) => {
	const original = await importOriginal<typeof import('./gameRouteController')>();
	return {
		...original,
		GameRouteController: class extends original.GameRouteController {
			constructor(options: GameRouteControllerOptions) {
				super(options);
				harness.controllers.push({ controller: this as GameRouteController, options });
			}

			override advanceDay(): Promise<GameRouteCommitResult> {
				return harness.advanceDay();
			}
		}
	};
});
vi.mock('$lib/persistence/saveRepositoryFactory', () => ({ createSaveRepository: vi.fn() }));
vi.mock('$lib/persistence/scenarioRepositoryFactory', () => ({
	createScenarioRepository: vi.fn()
}));
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

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function mapStorage() {
	const storage = new Map<string, string>();
	return {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => void storage.set(key, value),
		removeItem: (key: string) => void storage.delete(key)
	};
}

function saveRepository() {
	return createBrowserSaveRepository(mapStorage());
}

function scenarioRepository() {
	return createBrowserScenarioRepository(mapStorage(), resolveScenarioDefinition);
}

type MountedRoute = ReturnType<typeof render>;

const ROUTE_MOUNT_TIMEOUT = 120_000;

let mounted: MountedRoute | null = null;

async function settle(steps = 4): Promise<void> {
	for (let i = 0; i < steps; i += 1) {
		await vi.advanceTimersByTimeAsync(0);
	}
}

async function mountRoute(): Promise<{ view: MountedRoute; controller: GameRouteController }> {
	vi.mocked(createSaveRepository).mockResolvedValue(saveRepository());
	vi.mocked(createScenarioRepository).mockResolvedValue(scenarioRepository());
	// Render and settle under real timers (scenario init, renderer boot),
	// then freeze time before any clock input is driven. Freezing earlier
	// would make the first fake advance fire the whole boot timer backlog.
	const view = render(RetailSimulationPage);
	mounted = view;
	// Manual polling with real timers: scenario init resolves via microtasks
	// plus at most a few real ticks.
	for (let i = 0; i < 100 && !harness.controllers.at(-1)!.controller.state.scenariosReady; i += 1) {
		await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
	}
	await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
	vi.useFakeTimers();
	await settle();
	return { view, controller: harness.controllers.at(-1)!.controller };
}

/** Feeds the route a controller-shaped state patch, exactly like the real publish path. */
function publish(patch: Partial<GameRouteControllerState>): void {
	const entry = harness.controllers.at(-1)!;
	entry.options.onStateChange?.({ ...entry.controller.state, ...patch });
}

function press(key: string): void {
	window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

function mainAttribute(name: string): string {
	return page.getByRole('main').element().getAttribute(name) ?? '';
}

async function startPausedScenario(controller: GameRouteController): Promise<void> {
	const definition = resolveScenarioDefinition({ scenarioId: 'first-profit', version: 1 })!;
	const result = await controller.startScenarioRun(definition, definition.officialSeed);
	expect(['committed', 'sandbox-committed']).toContain(result.status);
	await settle();
	// Starting a run resets transient view state, which pauses the auto-tick.
	expect(mainAttribute('data-simulation-paused')).toBe('true');
	await page.getByRole('button', { name: 'Resume', exact: true }).click();
	await settle();
}

beforeEach(() => {
	harness.controllers.length = 0;
	harness.advanceDay = vi.fn(
		async (): Promise<GameRouteCommitResult> => ({ status: 'sandbox-committed', changed: true })
	);
});

afterEach(async () => {
	if (mounted) {
		await mounted.unmount();
		mounted = null;
	}
	// A pending fake timer at teardown (e.g. the re-armed day clock) makes the
	// browser runner's post-test timer restore cost seconds; clear the queue
	// of the already-unmounted page's timers first.
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	localStorage.clear();
});
const NON_DAY_SPEED_CASES = [
	// Brief anchors: at speed 1 advance 2,000ms, publish, then 2,999ms + 1ms.
	// Speeds 2 and 5 repeat the same deadline shape scaled to their interval.
	{ speed: 1, interval: 5_000, lead: 2_000 },
	{ speed: 2, interval: 2_500, lead: 1_000 },
	{ speed: 5, interval: 1_000, lead: 400 }
] as const;

it.each(NON_DAY_SPEED_CASES)(
	'keeps the armed day deadline across non-day publications at $speed× speed',
	{ timeout: ROUTE_MOUNT_TIMEOUT },
	async ({ speed, interval, lead }) => {
		const { controller } = await mountRoute();
		await startPausedScenario(controller);
		if (speed !== 1) {
			await page.getByRole('button', { name: `${speed}×`, exact: true }).click();
			await settle(); // re-armed with the full interval of the new speed
		}

		// Partway into the current interval, before any deadline.
		vi.advanceTimersByTime(lead);

		// Non-day publications before the deadline: a replaced game object…
		const run = controller.state.activeScenarioRun!;
		publish({ activeScenarioRun: { ...run, game: { ...run.game } } });
		// …a real, committed policy command (First Profit starts at pricing
		// 'premium', so 'standard' is a genuine change: the scenario pending
		// window opens and closes around the persisted publish of a fresh game)…
		expect(run.game.policy.pricing).toBe('premium');
		const policy = await controller.updatePolicy({ pricing: 'standard' });
		expect(policy.status).toBe('committed');
		expect(controller.state.activeScenarioRun!.game.policy.pricing).toBe('standard');
		// …and an explicit pending window that opens and closes before the deadline.
		publish({ scenarioCommandPending: true });
		publish({ scenarioCommandPending: false });
		await settle();

		vi.advanceTimersByTime(interval - lead - 1); // 1ms before the original deadline
		expect(harness.advanceDay).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1); // exactly the original deadline
		expect(harness.advanceDay).toHaveBeenCalledTimes(1);
		await settle();
	}
);

it(
	'rearms after a permission-blocked fire without overlapping ticks',
	{ timeout: ROUTE_MOUNT_TIMEOUT },
	async () => {
		const { controller } = await mountRoute();
		await startPausedScenario(controller);
		// Armed at 5,000ms (speed 1).

		// Permission is false at the deadline: the fire skips the day command.
		publish({ scenarioCommandPending: true });
		await settle();
		vi.advanceTimersByTime(5_000); // deadline: skip, bump rearm
		await settle(); // flush the re-arm
		expect(harness.advanceDay).not.toHaveBeenCalled();

		// The skip re-arms; once permission returns, the next full interval fires one day.
		publish({ scenarioCommandPending: false });
		await settle();
		vi.advanceTimersByTime(5_000);
		await settle();
		expect(harness.advanceDay).toHaveBeenCalledTimes(1);

		// An unresolved day promise prevents a second day while it is in flight:
		// advancing a full interval (+1ms) past the fire would land a second
		// tick if tickPending did not gate the timer.
		const pendingDay = deferred<GameRouteCommitResult>();
		harness.advanceDay.mockImplementationOnce(() => pendingDay.promise);
		vi.advanceTimersByTime(5_000);
		await settle();
		expect(harness.advanceDay).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(5_001);
		await settle();
		expect(harness.advanceDay).toHaveBeenCalledTimes(2);

		// Settling the day clears tickPending and finally allows the next schedule.
		pendingDay.resolve({ status: 'sandbox-committed', changed: true });
		await settle();
		vi.advanceTimersByTime(5_000);
		await settle();
		expect(harness.advanceDay).toHaveBeenCalledTimes(3);
	}
);

it(
	'cancels the armed timer on pause and re-arms on resume',
	{ timeout: ROUTE_MOUNT_TIMEOUT },
	async () => {
		const { controller } = await mountRoute();
		controller.loadSandboxGame(createNewGame('convenience', 20261102));
		await settle(); // armed (a direct sandbox load does not pause)
		vi.advanceTimersByTime(1_000);
		await page.getByRole('button', { name: 'Pause', exact: true }).click();
		await settle();
		expect(mainAttribute('data-simulation-paused')).toBe('true');
		vi.advanceTimersByTime(5_001);
		expect(harness.advanceDay).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Resume', exact: true }).click();
		await settle();
		vi.advanceTimersByTime(4_999);
		expect(harness.advanceDay).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(harness.advanceDay).toHaveBeenCalledTimes(1);
		await settle();
	}
);

it(
	're-arms with the full interval of the newly selected speed',
	{ timeout: ROUTE_MOUNT_TIMEOUT },
	async () => {
		const { controller } = await mountRoute();
		controller.loadSandboxGame(createNewGame('convenience', 20261103));
		await settle(); // armed at speed 1 (5,000ms)

		await page.getByRole('button', { name: '2×', exact: true }).click();
		await settle(); // re-armed: a fresh 2,500ms interval
		vi.advanceTimersByTime(2_499);
		expect(harness.advanceDay).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(harness.advanceDay).toHaveBeenCalledTimes(1);
		await settle();

		await page.getByRole('button', { name: '5×', exact: true }).click();
		await settle(); // re-armed: a fresh 1,000ms interval
		vi.advanceTimersByTime(999);
		expect(harness.advanceDay).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1);
		expect(harness.advanceDay).toHaveBeenCalledTimes(2);
		await settle();
	}
);

it(
	'blocks the auto-tick on the world view and resumes on return',
	{ timeout: ROUTE_MOUNT_TIMEOUT },
	async () => {
		const { controller } = await mountRoute();
		controller.loadSandboxGame(createNewGame('convenience', 20261104));
		await settle();
		press('3'); // the world view owns the screen: no time controls, clock blocked
		await settle();
		expect(mainAttribute('data-simulation-blocked')).toBe('true');
		vi.advanceTimersByTime(5_001);
		expect(harness.advanceDay).not.toHaveBeenCalled();

		press('1');
		await settle();
		expect(mainAttribute('data-simulation-blocked')).toBe('false');
		vi.advanceTimersByTime(4_999);
		expect(harness.advanceDay).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(harness.advanceDay).toHaveBeenCalledTimes(1);
		await settle();
	}
);

it(
	'cancels the timer when the game disappears and re-arms on a new game',
	{ timeout: ROUTE_MOUNT_TIMEOUT },
	async () => {
		const { controller } = await mountRoute();
		controller.loadSandboxGame(createNewGame('convenience', 20261105));
		await settle();
		vi.advanceTimersByTime(2_000);
		publish({ sandboxGame: null });
		await settle();
		expect(mainAttribute('data-play-mode')).toBe('sandbox');
		vi.advanceTimersByTime(5_001);
		expect(harness.advanceDay).not.toHaveBeenCalled();

		publish({ sandboxGame: createNewGame('convenience', 20261106) });
		await settle();
		vi.advanceTimersByTime(4_999);
		expect(harness.advanceDay).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(harness.advanceDay).toHaveBeenCalledTimes(1);
		await settle();
	}
);

it(
	'does nothing without a game and keeps the pause control locked',
	{ timeout: ROUTE_MOUNT_TIMEOUT },
	async () => {
		await mountRoute();
		// Past a full speed-1 interval nothing may fire: without a game the
		// clock never arms a timer.
		vi.advanceTimersByTime(6_001);
		expect(harness.advanceDay).not.toHaveBeenCalled();
		expect(mainAttribute('data-simulation-paused')).toBe('false');
		// Space is the pause-toggle shortcut; without a game it toggles nothing.
		press(' ');
		await settle();
		expect(mainAttribute('data-simulation-paused')).toBe('false');
		const pauseButton = page.getByRole('button', { name: 'Pause', exact: true }).element();
		expect((pauseButton as HTMLButtonElement).disabled).toBe(true);
	}
);

it('clears the armed timer on unmount', { timeout: ROUTE_MOUNT_TIMEOUT }, async () => {
	const { view, controller } = await mountRoute();
	controller.loadSandboxGame(createNewGame('convenience', 20261107));
	await settle();
	await view.unmount();
	mounted = null;
	vi.advanceTimersByTime(6_001);
	expect(harness.advanceDay).not.toHaveBeenCalled();
});
