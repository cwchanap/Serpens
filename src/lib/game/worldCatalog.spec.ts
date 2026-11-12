import { describe, expect, test } from 'vitest';
import {
	QUARRY_WORKS_FINISHED_MATERIALS,
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

	test('quarry-works defines advanced unlock requirements and materials', () => {
		expect.assertions(2);
		expect(getWorldCityDefinition('quarry-works')?.unlockRequirement).toBe(
			'Produce an advanced finished material locally.'
		);
		expect(QUARRY_WORKS_FINISHED_MATERIALS).toEqual([
			'snacks',
			'drinks',
			'essentials',
			'gifts',
			'electronic-accessories'
		]);
	});
});
