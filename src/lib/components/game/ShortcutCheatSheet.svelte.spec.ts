import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ShortcutCheatSheet from './ShortcutCheatSheet.svelte';

describe('ShortcutCheatSheet', () => {
	it('lists shortcuts and closes', async () => {
		expect.assertions(4);
		const onClose = vi.fn();
		render(ShortcutCheatSheet, { onClose });
		await expect.element(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible();
		await expect.element(page.getByText(/toggle build menu/i)).toBeVisible();
		await expect.element(page.getByText(/toggle dashboard/i)).toBeVisible();
		await page
			.getByRole('button', { name: /close shortcuts/i })
			.first()
			.click();
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
