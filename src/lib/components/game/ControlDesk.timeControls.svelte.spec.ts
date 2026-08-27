import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import ControlDesk from './ControlDesk.svelte';

describe('ControlDesk time controls', () => {
	beforeEach(async () => {
		await page.viewport(1280, 800);
	});

	it('replaces manual day advancement with pause and simulation speeds', async () => {
		expect.assertions(5);
		render(ControlDesk, {
			managementItems: [],
			buildDisabled: false,
			advanceDisabled: false,
			i18n: createI18n('en'),
			onBuild: vi.fn(),
			onOpenManagement: vi.fn(),
			onAdvanceDay: vi.fn(),
			onOpenShortcuts: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^1×$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^2×$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^5×$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^advance day$/i })).not.toBeInTheDocument();
	});
});
