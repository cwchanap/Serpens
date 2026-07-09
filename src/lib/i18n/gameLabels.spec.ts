import { describe, expect, it } from 'vitest';
import { createI18n } from './index';
import { messagesByLocale } from './messages';

function flattenStrings(
	value: unknown,
	path: string[] = [],
	output: Array<{ key: string; value: string }> = []
): Array<{ key: string; value: string }> {
	if (typeof value === 'string') {
		output.push({ key: path.join('.'), value });
		return output;
	}

	if (value && typeof value === 'object') {
		for (const [key, nested] of Object.entries(value)) {
			flattenStrings(nested, [...path, key], output);
		}
	}

	return output;
}

describe('game labels', () => {
	it('localizes stable game-domain IDs', () => {
		expect.assertions(5);
		const english = createI18n('en').labels;
		const japanese = createI18n('ja').labels;
		expect(english.archetype('convenience').name).toBe('Convenience Store');
		expect(japanese.archetype('convenience').name).not.toBe('Convenience Store');
		expect(english.material('bottled-water')).toBe('Bottled Water');
		expect(english.policyValue('service', 'highTouch')).toBe('High Touch');
		expect(english.worldCity('harbor-city').name).toBe('Harbor City');
	});

	it('falls back to readable IDs for unknown dynamic values', () => {
		expect.assertions(1);
		expect(createI18n('en').labels.productCategory('unknown-category')).toBe('Unknown Category');
	});

	it('does not leave game-domain strings equal to English in localized catalogs', () => {
		expect.assertions(2);
		const english = new Map(
			flattenStrings(messagesByLocale.en.game).map(({ key, value }) => [key, value] as const)
		);

		for (const locale of ['ja', 'zh-Hant'] as const) {
			const identicalKeys = flattenStrings(messagesByLocale[locale].game)
				.filter(({ key, value }) => english.get(key) === value)
				.map(({ key }) => key);

			expect(identicalKeys).toEqual([]);
		}
	});
});
