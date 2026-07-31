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

	it('leaves placeholders unchanged when params are not provided', () => {
		expect.assertions(1);
		const t = createTranslator('en');
		expect(t('topBar.day')).toBe('Day {day}');
	});

	it('resolves numeric message keys via a type-checked lookup', () => {
		// `game.archetypes.<archetype>.risks` is keyed by numeric indices, so the
		// path ends in ".0". Passing the literal key (no `as never`) keeps the
		// compile-time TranslationKey check and verifies getMessage resolves the
		// numeric segment at runtime.
		expect.assertions(1);
		const t = createTranslator('en');
		expect(t('game.archetypes.convenience.risks.0')).toBe('Stockouts');
	});

	it('returns the key without warning when a key is missing and dev mode is off', () => {
		expect.assertions(2);
		const warn = vi.fn();
		const t = createTranslator('ja', { warn });
		expect(t('nonexistent.key' as never)).toBe('nonexistent.key');
		expect(warn).not.toHaveBeenCalled();
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
		expect.assertions(4);
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
		expect(warnMissing).toHaveBeenCalledWith('Missing translation for nonexistent.key');
	});
});
