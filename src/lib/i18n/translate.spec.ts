import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from './translate';
import { messagesByLocale } from './messages';

describe('createTranslator', () => {
	it('returns localized text and interpolates params', () => {
		expect.assertions(2);
		const t = createTranslator('en');
		expect(t('topBar.day', { day: 7 })).toBe('Day 7');
		expect(createTranslator('ja')('gameMenu.language')).toBe('言語');
	});

	it('falls back to English and warns in development', () => {
		expect.assertions(2);
		const warn = vi.fn();
		const t = createTranslator('ja', { dev: true, warn });
		expect(t('app.title')).toBe(messagesByLocale.en.app.title);
		expect(warn).not.toHaveBeenCalled();
	});

	it('keeps message key parity across supported locales', () => {
		expect.assertions(2);
		const keys = (value: unknown, prefix = ''): string[] =>
			typeof value === 'string'
				? [prefix]
				: Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
						keys(child, prefix ? `${prefix}.${key}` : key)
					);
		const englishKeys = keys(messagesByLocale.en).sort();
		expect(keys(messagesByLocale['zh-Hant']).sort()).toEqual(englishKeys);
		expect(keys(messagesByLocale.ja).sort()).toEqual(englishKeys);
	});

	it('warns for missing localized keys so untranslated strings are visible in dev', () => {
		expect.assertions(3);
		const keys = (value: unknown, prefix = ''): string[] =>
			typeof value === 'string'
				? [prefix]
				: Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
						keys(child, prefix ? `${prefix}.${key}` : key)
					);
		const englishKeys = keys(messagesByLocale.en);

		for (const locale of ['ja', 'zh-Hant'] as const) {
			const warn = vi.fn();
			const t = createTranslator(locale, { dev: true, warn });
			for (const key of englishKeys) {
				t(key as never);
			}
			expect(warn).not.toHaveBeenCalled();
		}

		const warnMissing = vi.fn();
		const tMissing = createTranslator('ja', { dev: true, warn: warnMissing });
		tMissing('nonexistent.key' as never);
		expect(warnMissing).toHaveBeenCalledTimes(1);
	});
});
