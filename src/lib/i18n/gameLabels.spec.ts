import { describe, expect, it } from 'vitest';
import { createI18n } from './index';

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
});
