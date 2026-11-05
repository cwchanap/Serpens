import { describe, expect, it } from 'vitest';
import { createRoutePreviewGame } from './routePreviewGame';

describe('pre-game route presentation', () => {
	it('supplies the authored starter maps before any company exists', () => {
		const preview = createRoutePreviewGame();
		expect(preview).toMatchObject({
			seed: 20260503,
			day: 1,
			cash: 0,
			activeCityId: 'harbor-city',
			activeIndustryCityId: 'industry-city',
			storeCap: 3,
			cities: [{ id: 'harbor-city', name: 'Harbor City', width: 56, height: 48 }],
			industryCities: [{ id: 'industry-city', name: 'Industry City', width: 56, height: 48 }],
			stores: [],
			industrialBuildings: [],
			reports: [],
			staff: [],
			decisions: [],
			cityInventories: [{ cityId: 'industry-city', materials: {} }],
			retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }],
			world: { openedCityIds: ['harbor-city', 'industry-city'] },
			logistics: {
				transferOrders: [],
				recurringRoutes: [],
				nextTransferSequence: 1,
				nextRouteSequence: 1
			}
		});
		expect(preview.cities[0]!.tiles).toHaveLength(2688);
		expect(preview.industryCities[0]!.tiles).toHaveLength(2688);
	});
	it('never shares mutable preview data between route instances', () => {
		const first = createRoutePreviewGame();
		const second = createRoutePreviewGame();
		first.cities[0]!.tiles[0]!.locked = !first.cities[0]!.tiles[0]!.locked;
		first.policy.marketing = 'none';
		first.world.openedCityIds.pop();
		expect(second.cities[0]!.tiles[0]!.locked).not.toBe(first.cities[0]!.tiles[0]!.locked);
		expect(second.policy.marketing).toBe('awareness');
		expect(second.world.openedCityIds).toEqual(['harbor-city', 'industry-city']);
	});
});
