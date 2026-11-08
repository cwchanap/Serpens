import type { GameRouteCommitResult } from '$lib/game/commandResult';

export type SimulationSpeed = 1 | 2 | 5;

/** One simulated day per 5,000 real ms at speed 1. */
const SIMULATION_DAY_MS = 5_000;

interface SimulationClockOptions {
	/** Primitive game-existence projection; never the game object itself. */
	getHasGame(): boolean;
	/** True while an overlay or the world view owns the screen. */
	getBlocked(): boolean;
	/** Command permission; read at fire time only, never while arming. */
	getCanAdvance(): boolean;
	advanceDay(): Promise<GameRouteCommitResult>;
}

/**
 * Simulation clock owner: the pause/speed/tick-pending atoms and the
 * auto-tick timer. The arming effect's lifecycle may depend only on the
 * primitive inputs — game existence, pause, speed, tick-pending, blocked
 * and the re-arm signal — so a non-day publication (a new game snapshot,
 * policy edit, command-busy toggle) never resets the armed day deadline.
 * `runTick` re-reads permission at fire time; a blocked fire bumps the
 * re-arm signal instead of stalling, and an in-flight day (`tickPending`)
 * prevents overlapping ticks.
 */
export function createSimulationClock(options: SimulationClockOptions) {
	let paused = $state(false);
	let speed = $state<SimulationSpeed>(1);
	let tickPending = $state(false);
	// Bumped when a fire is skipped because a scenario command is in flight
	// (getCanAdvance() is false at fire time). The arming effect reads this
	// as a re-arm signal so the clock schedules a fresh tick instead of
	// stalling until the next user action.
	let tickRearm = $state(0);

	$effect(() => {
		const gameExists = options.getHasGame();
		const isPaused = paused;
		const nextSpeed = speed;
		const pending = tickPending;
		const blocked = options.getBlocked();
		void tickRearm;

		// Deliberately NOT reading options.getCanAdvance() here. In scenario
		// mode that flag flips with every persisted command (commitMutation
		// sets the pending flag for the duration of each command), so
		// subscribing the timer lifecycle to it would clear the armed
		// timeout mid-interval and restart the SIMULATION_DAY_MS / speed
		// delay each time a policy/build/hire/etc. action landed. Frequent
		// gameplay could then postpone a day indefinitely. runTick()
		// re-checks permission when the timer fires and skips (bumping
		// tickRearm to re-arm) if a command is still pending, so the
		// deadline is preserved across the busy window.
		if (!gameExists || isPaused || pending || blocked) {
			return;
		}

		const timer = globalThis.setTimeout(() => void runTick(), SIMULATION_DAY_MS / nextSpeed);
		return () => globalThis.clearTimeout(timer);
	});

	async function runTick(): Promise<void> {
		if (!options.getHasGame() || paused || tickPending) {
			return;
		}
		if (!options.getCanAdvance()) {
			tickRearm += 1;
			return;
		}

		tickPending = true;
		try {
			await options.advanceDay();
		} finally {
			tickPending = false;
		}
	}

	function pause(): void {
		paused = true;
	}

	function togglePause(): void {
		if (!options.getHasGame()) return;
		paused = !paused;
	}

	function setSpeed(nextSpeed: SimulationSpeed): void {
		speed = nextSpeed;
	}

	return {
		get paused() {
			return paused;
		},
		get speed() {
			return speed;
		},
		get tickPending() {
			return tickPending;
		},
		pause,
		togglePause,
		setSpeed,
		runTick
	};
}
