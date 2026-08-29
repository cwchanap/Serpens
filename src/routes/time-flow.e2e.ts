import { expect, test } from '@playwright/test';
import { createNewGame } from '../lib/game/state';
import { LANGUAGE_PREFERENCE_STORAGE_KEY } from '../lib/i18n/locales';
import { BROWSER_SAVE_STORAGE_KEY } from '../lib/persistence/browserSaveRepository';
import { BROWSER_SCENARIO_STORAGE_KEY } from '../lib/persistence/browserScenarioRepository';
import {
	createAutoSaveRecord,
	createEmptySaveStore,
	validateSaveStoreSnapshot
} from '../lib/persistence/saveCodec';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(
		({ languageKey, scenarioKey }) => {
			window.localStorage.setItem(languageKey, 'en');
			const isolationKey = 'serpens.e2e.challenge-storage-isolated';
			if (window.sessionStorage.getItem(isolationKey) !== 'true') {
				window.localStorage.removeItem(scenarioKey);
				window.sessionStorage.setItem(isolationKey, 'true');
			}
		},
		{
			languageKey: LANGUAGE_PREFERENCE_STORAGE_KEY,
			scenarioKey: BROWSER_SCENARIO_STORAGE_KEY
		}
	);
});

function sandboxSave(): string {
	const game = createNewGame('convenience', 20260827);
	const snapshot = validateSaveStoreSnapshot({
		...createEmptySaveStore(),
		autoSave: createAutoSaveRecord(game, new Date('2026-08-27T12:00:00.000Z'))
	});
	return JSON.stringify(snapshot);
}

test('simulation advances automatically at the selected speed and stops while paused', async ({
	page
}) => {
	await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
		key: BROWSER_SAVE_STORAGE_KEY,
		value: sandboxSave()
	});
	await page.goto('/');
	await page.getByRole('button', { name: /^menu$/i }).click();
	await page.getByRole('button', { name: /^saves$/i }).click();
	await page.getByRole('button', { name: /^resume$/i }).click();

	const day = page.getByText(/^Day \d+$/);
	await expect(day).toHaveText('Day 1');
	await page.keyboard.press('Escape');

	// Resume the auto-tick (loading a save starts paused so the player can
	// review the state before time flows).
	await page.getByRole('button', { name: 'Resume', exact: true }).click();

	await page.getByRole('button', { name: '5×', exact: true }).click();
	await expect
		.poll(async () => Number(((await day.textContent()) ?? '').match(/\d+/)?.[0] ?? 0))
		.toBeGreaterThan(1);

	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	const pausedDay = await day.textContent();
	await page.waitForTimeout(1_200);
	await expect(day).toHaveText(pausedDay ?? '');
});

test('automatic day clock keeps advancing across a non-day mutation', async ({ page }) => {
	await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
		key: BROWSER_SAVE_STORAGE_KEY,
		value: sandboxSave()
	});
	await page.goto('/');
	await page.getByRole('button', { name: /^menu$/i }).click();
	await page.getByRole('button', { name: /^saves$/i }).click();
	await page.getByRole('button', { name: /^resume$/i }).click();

	const day = page.getByText(/^Day \d+$/);
	await expect(day).toHaveText('Day 1');
	await page.keyboard.press('Escape');

	// Resume the auto-tick (loading a save starts paused so the player can
	// review the state before time flows).
	await page.getByRole('button', { name: 'Resume', exact: true }).click();

	// Freeze virtual time, then switch to 5x (1000ms/day). Changing speed re-arms
	// the timer for a fresh, deterministic 1000ms delay at the frozen instant T0.
	await page.clock.pauseAt(Date.now());
	await page.getByRole('button', { name: '5×', exact: true }).click();
	await page.clock.runFor(0);

	// Advance most of the 1000ms interval without crossing the day boundary.
	await page.clock.runFor(850);

	// Perform a NON-day mutation that publishes a new game snapshot: change a
	// company policy. Management panels intentionally do not block the clock, so
	// this is exactly the case where subscribing the timer to the whole snapshot
	// would clear the pending timeout and restart the day delay.
	await page.getByRole('button', { name: /policies/i }).click();
	const policies = page.getByRole('dialog', { name: /policies/i });
	await expect(policies).toBeVisible();
	await policies.getByLabel(/pricing/i).selectOption('premium');
	await policies.getByRole('button', { name: /close policies/i }).click();
	await page.clock.runFor(0);

	// Advance the remainder of the interval (total 1050ms > 1000ms). The day
	// must still advance despite the mid-interval mutation; if the clock
	// re-subscribed to `game`, the mutation would have restarted the 1000ms delay
	// and Day 1 would stall.
	await page.clock.runFor(200);
	await expect
		.poll(async () => (await day.allTextContents()).includes('Day 2'), {
			timeout: 2_500
		})
		.toBe(true);

	await page.clock.resume();
});

async function startFirstProfitChallenge(page: import('@playwright/test').Page): Promise<void> {
	const menuTrigger = page.getByTestId('game-menu-trigger');
	if ((await menuTrigger.getAttribute('aria-expanded')) !== 'true') {
		await menuTrigger.click();
	}
	await page.getByRole('button', { name: 'Challenge catalog', exact: true }).click();
	const catalog = page.getByRole('dialog', { name: 'Challenge catalog' });
	await expect(catalog).toBeVisible();
	await catalog
		.getByRole('article')
		.filter({ has: page.getByRole('heading', { name: 'First Profit', exact: true }) })
		.getByRole('button', { name: 'Start First Profit', exact: true })
		.click();
	// Wait for the scenario run to finish persisting so the clock starts from a
	// settled Day 1 with no command in flight.
	await expect(page.locator('main.app')).toHaveAttribute('data-play-mode', 'scenario');
	await expect(page.locator('main.app')).toHaveAttribute('data-scenario-command-pending', 'false');
}

test('automatic day clock keeps advancing across a non-day mutation in scenario mode', async ({
	page
}) => {
	await page.goto('/');
	await startFirstProfitChallenge(page);

	const day = page.getByText(/^Day \d+$/);
	await expect(day).toHaveText('Day 1');

	// Resume the auto-tick (starting a challenge begins paused so the player
	// can review the scenario before time flows).
	await page.getByRole('button', { name: 'Resume', exact: true }).click();

	// Freeze virtual time, then switch to 5x (1000ms/day). Changing speed re-arms
	// the timer for a fresh, deterministic 1000ms delay at the frozen instant T0.
	await page.clock.pauseAt(Date.now());
	await page.getByRole('button', { name: '5×', exact: true }).click();
	await page.clock.runFor(0);

	// Advance most of the 1000ms interval without crossing the day boundary.
	await page.clock.runFor(850);

	// Perform a NON-day scenario mutation: change a company policy. In scenario
	// mode every persisted command flips scenarioCommandPending true for its
	// duration (via commitMutation's onPendingChange), which toggles
	// mutationAvailability.advanceDay false. If the auto-tick effect subscribed
	// to advanceDay, this would clear the pending timeout and restart the 1000ms
	// day delay — the exact regression the sandbox test pins for snapshot
	// re-subscription, here scoped to the scenario command-busy flag.
	//
	// The First Profit challenge starts with pricing 'premium', so select
	// 'standard' to ensure the command actually changes the game (a no-op
	// 'premium'->'premium' publish would not exercise the command-busy path).
	// This also pins that an ordinary scenario command does NOT pause the
	// auto-tick: resetTransientViewState() must be keyed on run identity
	// (runId/status), not the run object reference, which changes on every
	// command publish.
	await page.getByRole('button', { name: /policies/i }).click();
	const policies = page.getByRole('dialog', { name: /policies/i });
	await expect(policies).toBeVisible();
	await policies.getByLabel(/pricing/i).selectOption('standard');
	await policies.getByRole('button', { name: /close policies/i }).click();
	// Wait for the scenario command to finish persisting so advanceDay is true
	// again before the day timer fires.
	await expect(page.locator('main.app')).toHaveAttribute('data-scenario-command-pending', 'false');
	// An ordinary scenario command must not pause the auto-tick.
	await expect(page.locator('main.app')).toHaveAttribute('data-simulation-paused', 'false');
	await page.clock.runFor(0);

	// Advance the remainder of the interval (total 1050ms > 1000ms). The day
	// must still advance despite the mid-interval scenario command; if the
	// clock re-subscribed to mutationAvailability.advanceDay, the command would
	// have restarted the 1000ms delay and Day 1 would stall.
	await page.clock.runFor(200);
	await expect
		.poll(async () => (await day.allTextContents()).includes('Day 2'), {
			timeout: 2_500
		})
		.toBe(true);

	await page.clock.resume();
});
