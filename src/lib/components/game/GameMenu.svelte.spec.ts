import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n, SUPPORTED_LOCALE_METADATA } from '$lib/i18n';
import GameMenu from './GameMenu.svelte';

function baseProps() {
	return {
		i18n: createI18n('en'),
		activeLocale: 'en' as const,
		onSelectLocale: vi.fn()
	};
}

describe('GameMenu', () => {
	it('keeps map switching out of the menu dialog', async () => {
		expect.assertions(5);
		render(GameMenu, baseProps());
		await page.getByRole('button', { name: /^menu$/i }).click();
		const menu = page.getByRole('dialog', { name: /^menu$/i });
		await expect.element(menu).toBeVisible();
		await expect.element(menu.getByLabelText('Language')).toBeVisible();
		await expect
			.element(menu.getByRole('button', { name: /retail city map/i }))
			.not.toBeInTheDocument();
		await expect
			.element(menu.getByRole('button', { name: /industry city map/i }))
			.not.toBeInTheDocument();
		await expect.element(menu.getByRole('button', { name: /world map/i })).not.toBeInTheDocument();
	});

	it('renders open when the open prop is set (controlled)', async () => {
		expect.assertions(1);
		render(GameMenu, { ...baseProps(), open: true });
		await expect.element(page.getByLabelText('Language')).toBeVisible();
	});

	it('dismisses the popover on an outside pointer press', async () => {
		expect.assertions(2);
		render(GameMenu, baseProps());
		await page.getByRole('button', { name: /^menu$/i }).click();
		await expect.element(page.getByLabelText('Language')).toBeVisible();
		// A pointer press anywhere outside the menu closes it (standard dropdown behaviour).
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.element(page.getByLabelText('Language')).not.toBeInTheDocument();
	});

	it('closes the popover on Escape and ignores other keys', async () => {
		expect.assertions(3);
		render(GameMenu, baseProps());
		await page.getByRole('button', { name: /^menu$/i }).click();
		const popover = page.getByRole('dialog', { name: /^menu$/i });
		await expect.element(popover).toBeVisible();

		// A non-Escape key must not close the popover (exercises the false branch).
		popover
			.element()
			.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
			);
		await expect.element(popover).toBeVisible();

		// Escape closes the popover via the dialog keydown handler.
		popover
			.element()
			.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
			);
		await expect.element(popover).not.toBeInTheDocument();
	});

	it('shows language choices and emits the selected locale', async () => {
		expect.assertions(3);
		const props = {
			...baseProps(),
			i18n: createI18n('en'),
			activeLocale: 'en' as const,
			onSelectLocale: vi.fn()
		};
		render(GameMenu, props);
		await page.getByRole('button', { name: /^menu$/i }).click();
		await expect.element(page.getByLabelText('Language')).toBeVisible();
		await expect
			.element(page.getByTestId('language-selector'))
			.toHaveTextContent(SUPPORTED_LOCALE_METADATA.map((locale) => locale.label).join(''));
		await page.getByLabelText('Language').selectOptions('ja');
		expect(props.onSelectLocale).toHaveBeenCalledWith('ja');
	});

	it('closes the popover after a locale is selected', async () => {
		expect.assertions(2);
		render(GameMenu, baseProps());
		await page.getByRole('button', { name: /^menu$/i }).click();
		const localeSelect = page.getByTestId('language-selector');
		await expect.element(localeSelect).toBeVisible();
		await localeSelect.selectOptions('ja');
		await expect.element(page.getByTestId('language-selector')).not.toBeInTheDocument();
	});
});
