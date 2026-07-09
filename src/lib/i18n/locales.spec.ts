import { describe, expect, it, vi } from 'vitest';
import {
	LANGUAGE_PREFERENCE_STORAGE_KEY,
	readLocalePreference,
	resolveSupportedLocale,
	saveLocalePreference
} from './locales';

function storageMock(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getItem: vi.fn((key: string) => (data.has(key) ? data.get(key)! : null)),
		setItem: vi.fn((key: string, value: string) => {
			data.set(key, value);
		})
	};
}

describe('locale resolution', () => {
	it('prefers a valid stored preference over browser language', () => {
		expect.assertions(1);
		expect(
			resolveSupportedLocale({
				storedLocale: 'ja',
				navigatorLanguages: ['zh-TW', 'en-US']
			})
		).toBe('ja');
	});

	it('maps Traditional Chinese browser locales to zh-Hant', () => {
		expect.assertions(3);
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-TW'] })).toBe('zh-Hant');
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-HK'] })).toBe('zh-Hant');
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-MO'] })).toBe('zh-Hant');
	});

	it('maps Japanese and English browser locales', () => {
		expect.assertions(2);
		expect(resolveSupportedLocale({ navigatorLanguages: ['ja-JP'] })).toBe('ja');
		expect(resolveSupportedLocale({ navigatorLanguages: ['en-CA'] })).toBe('en');
	});

	it('falls back to English for unsupported values', () => {
		expect.assertions(1);
		expect(
			resolveSupportedLocale({
				storedLocale: 'fr',
				navigatorLanguages: ['ko-KR']
			})
		).toBe('en');
	});

	it('reads and saves the local language preference', () => {
		expect.assertions(3);
		const storage = storageMock();
		expect(readLocalePreference(storage, ['ja-JP'])).toBe('ja');
		expect(saveLocalePreference('zh-Hant', storage)).toBe('zh-Hant');
		expect(storage.setItem).toHaveBeenCalledWith(LANGUAGE_PREFERENCE_STORAGE_KEY, 'zh-Hant');
	});
});
