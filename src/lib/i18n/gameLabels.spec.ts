import { describe, expect, it } from 'vitest';
import { createI18n } from './index';
import { messagesByLocale } from './messages';
import { flattenStrings } from './testUtils';

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

	it('localizes additional game-domain label functions', () => {
		expect.assertions(16);
		const labels = createI18n('en').labels;
		expect(labels.archetypeRisk('convenience', 0)).toBe('Stockouts');
		expect(labels.tileFeature('road')).toBe('Road');
		expect(labels.industryTerrain('farmland')).toBe('Farmland');
		expect(labels.neighborhood('downtown')).toBe('Downtown');
		expect(labels.terrain('commercial')).toBe('Commercial');
		expect(labels.policyField('pricing')).toBe('Pricing');
		expect(labels.scoreKey('profit')).toBe('Profit');
		expect(labels.mapView('retail')).toBe('Retail');
		expect(labels.managementPanel('stores')).toBe('Stores');
		expect(labels.managementPanel('finance')).toBe('Finance');
		expect(labels.loanPurpose('workingCapital')).toBe('Working capital');
		expect(labels.loanStatus('delinquent')).toBe('Delinquent');
		expect(labels.loanTerm(56)).toBe('56 days');
		expect(labels.industrialBuilding('warehouse')).toBe('Warehouse');
		expect(labels.industryResource('grain-field')).toBe('Grain Field');
		expect(labels.archetype('convenience').description).toBe(
			'Fast turnover, steady foot traffic, low margins, and stockout sensitivity.'
		);
	});
});
