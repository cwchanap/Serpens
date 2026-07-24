import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import ScenarioMenuSection from './ScenarioMenuSection.svelte';

describe('ScenarioMenuSection', { timeout: 30_000 }, () => {
	it('replaces save controls with challenge details, restart, catalog, sandbox, and abandon', async () => {
		expect.assertions(8);
		const onDetails = vi.fn();
		const onRestart = vi.fn();
		const onCatalog = vi.fn();
		const onSandbox = vi.fn();
		const onAbandon = vi.fn();
		render(ScenarioMenuSection, {
			i18n: createI18n('en'),
			title: 'First Profit',
			versionLabel: 'Version 2 · Ranked',
			pending: false,
			onDetails,
			onRestart,
			onCatalog,
			onSandbox,
			onAbandon
		});

		await expect.element(page.getByText('First Profit')).toBeVisible();
		await expect.element(page.getByText('Version 2 · Ranked')).toBeVisible();
		await page.getByRole('button', { name: 'Challenge details' }).click();
		await page.getByRole('button', { name: 'Restart challenge' }).click();
		await page.getByRole('button', { name: 'Challenge catalog' }).click();
		await page.getByRole('button', { name: 'Return to sandbox' }).click();
		await page.getByRole('button', { name: 'Abandon challenge' }).click();
		expect(onAbandon).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Confirm abandon' }).click();

		expect(onDetails).toHaveBeenCalledTimes(1);
		expect(onRestart).toHaveBeenCalledTimes(1);
		expect(onCatalog).toHaveBeenCalledTimes(1);
		expect(onSandbox).toHaveBeenCalledTimes(1);
		expect(onAbandon).toHaveBeenCalledTimes(1);
	});
});
