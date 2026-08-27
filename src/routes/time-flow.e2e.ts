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
	await expect(day).toHaveText('Day 2', { timeout: 2_500 });

	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.waitForTimeout(1_200);
	await expect(day).toHaveText('Day 2');
});
