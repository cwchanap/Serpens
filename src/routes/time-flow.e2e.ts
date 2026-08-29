import { expect, test } from '@playwright/test';
import { createNewGame } from '../lib/game/state';
import { BROWSER_SAVE_STORAGE_KEY } from '../lib/persistence/browserSaveRepository';
import {
	createAutoSaveRecord,
	createEmptySaveStore,
	validateSaveStoreSnapshot
} from '../lib/persistence/saveCodec';

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
