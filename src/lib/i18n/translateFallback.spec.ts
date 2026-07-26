import { describe, expect, it, vi } from 'vitest';

vi.mock('./messages', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./messages')>();
	// Create a ja locale that is missing the 'app.title' key to exercise the
	// fallback-to-English-with-warning path in translate.ts (lines 71-76).
	const jaCopy = structuredClone(actual.messagesByLocale.ja) as Record<
		string,
		Record<string, unknown>
	>;
	delete jaCopy.app.title;
	return {
		...actual,
		messagesByLocale: {
			...actual.messagesByLocale,
			ja: jaCopy as typeof actual.messagesByLocale.ja
		}
	};
});

const { createTranslator } = await import('./translate');
const { messagesByLocale } = await import('./messages');

describe('createTranslator fallback path', () => {
	it('warns and falls back to English when a non-English locale is missing a key in dev mode', () => {
		expect.assertions(3);
		const warn = vi.fn();
		const t = createTranslator('ja', { dev: true, warn });
		// 'app.title' is deleted from the mocked ja locale, so this exercises
		// the fallback-to-English-with-warning path.
		expect(t('app.title')).toBe(messagesByLocale.en.app.title);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith('Missing ja translation for app.title');
	});

	it('does not warn when dev mode is off even if the key is missing from the locale', () => {
		expect.assertions(2);
		const warn = vi.fn();
		const t = createTranslator('ja', { warn });
		expect(t('app.title')).toBe(messagesByLocale.en.app.title);
		expect(warn).not.toHaveBeenCalled();
	});
});
