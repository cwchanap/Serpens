import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	AUDIO_PREFERENCES_STORAGE_KEY,
	DEFAULT_AUDIO_PREFERENCES
} from '$lib/audio/audioPreferences';
import { BROWSER_SAVE_STORAGE_KEY } from '$lib/persistence/browserSaveRepository';
import { BROWSER_SCENARIO_STORAGE_KEY } from '$lib/persistence/browserScenarioRepository';
import RetailSimulationPage from './+page.svelte';

describe('retail supply controls before founding', () => {
	it('keeps the Stores-panel source selector disabled while only starterMapState is displayed', async () => {
		expect.assertions(2);
		const isolatedStorageKeys = [
			AUDIO_PREFERENCES_STORAGE_KEY,
			BROWSER_SAVE_STORAGE_KEY,
			BROWSER_SCENARIO_STORAGE_KEY
		];
		const savedStorage = new Map(
			isolatedStorageKeys.map((key) => [key, globalThis.localStorage.getItem(key)])
		);
		globalThis.localStorage.removeItem(BROWSER_SAVE_STORAGE_KEY);
		globalThis.localStorage.removeItem(BROWSER_SCENARIO_STORAGE_KEY);
		globalThis.localStorage.setItem(
			AUDIO_PREFERENCES_STORAGE_KEY,
			JSON.stringify({ ...DEFAULT_AUDIO_PREFERENCES, bgmEnabled: false })
		);

		try {
			await page.viewport(1280, 800);
			render(RetailSimulationPage);

			const management = page.getByRole('group', { name: /management/i });
			const stores = management.getByRole('button', { name: /stores/i });
			await expect.element(stores).toBeVisible();
			await stores.click();

			await expect
				.element(page.getByLabelText('Local supply source for Harbor City'))
				.toBeDisabled();
		} finally {
			for (const [key, value] of savedStorage) {
				if (value === null) {
					globalThis.localStorage.removeItem(key);
				} else {
					globalThis.localStorage.setItem(key, value);
				}
			}
		}
	});
});
