import { describe, expect, test } from 'vitest';
import {
	WORLD_CITY_CATALOG,
	compareWorldCityIds,
	getWorldCityDefinition,
	isWorldCityId
} from './worldCatalog';

describe('world catalog primitives', () => {
	test('owns canonical lookup, narrowing, and deterministic catalog order', () => {
		expect.assertions(5);

		expect(WORLD_CITY_CATALOG.map((city) => city.id)).toEqual([
			'harbor-city',
			'campus-junction',
			'garden-borough',
			'industry-city',
			'breadbasket-basin',
			'quarry-works'
		]);
		expect(getWorldCityDefinition('breadbasket-basin')?.kind).toBe('industry');
		expect(getWorldCityDefinition('unknown-city')).toBeUndefined();
		expect(isWorldCityId('campus-junction')).toBe(true);
		expect(compareWorldCityIds('harbor-city', 'industry-city')).toBeLessThan(0);
	});

	test('offers copper deposits only in the industry-city and quarry-works resource profiles', () => {
		expect.assertions(3);
		const resourceIds = (cityId: string) =>
			getWorldCityDefinition(cityId)?.industryResourceProfile?.resourceIds ?? [];

		expect(resourceIds('industry-city')).toContain('copper-deposit');
		expect(resourceIds('quarry-works')).toContain('copper-deposit');
		expect(resourceIds('breadbasket-basin')).not.toContain('copper-deposit');
	});
});
