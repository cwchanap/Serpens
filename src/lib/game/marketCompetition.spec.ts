import { describe, expect, test } from 'vitest';
import { getProductDefinition } from './products';
import { resolveProductMarketShare } from './marketCompetition';
import type { MarketCompetitor } from './types';

function competitor(overrides: Partial<MarketCompetitor> = {}): MarketCompetitor {
	return {
		id: 'competitor-harbor-city-1',
		name: 'Harborline Market',
		cityId: 'harbor-city',
		location: { neighborhoodId: 'downtown', x: 2, y: 2 },
		archetypeId: 'convenience',
		reputation: 50,
		pricePosture: 'standard',
		productFocus: ['beverages'],
		brandIds: ['common-ground'],
		status: 'active',
		...overrides
	};
}

describe('explicit product market share', () => {
	test('gives the player the whole market with no rivals and positive attraction', () => {
		const resolution = resolveProductMarketShare(
			[],
			[],
			getProductDefinition('bottled-water'),
			80,
			1
		);

		expect(resolution.playerShare).toBe(1);
		expect(resolution.competitors).toEqual([]);
	});

	test('excludes closed rivals from attraction and report rows', () => {
		const resolution = resolveProductMarketShare(
			[competitor({ status: 'closed' })],
			[],
			getProductDefinition('bottled-water'),
			80,
			1
		);

		expect(resolution.playerShare).toBe(1);
		expect(resolution.competitors).toEqual([]);
	});

	test('reduces player share as a rival reputation increases', () => {
		const product = getProductDefinition('bottled-water');
		const low = resolveProductMarketShare([competitor({ reputation: 45 })], [], product, 80, 1);
		const high = resolveProductMarketShare([competitor({ reputation: 75 })], [], product, 80, 1);

		expect(high.playerShare).toBeLessThan(low.playerShare);
		expect(high.competitors[0]!.attractionScore).toBeGreaterThan(
			low.competitors[0]!.attractionScore
		);
	});

	test('lowers player share for a focused rival compared with an unfocused rival', () => {
		const product = getProductDefinition('bottled-water');
		const focused = resolveProductMarketShare(
			[competitor({ productFocus: ['beverages'] })],
			[],
			product,
			80,
			1
		);
		const unfocused = resolveProductMarketShare(
			[competitor({ productFocus: ['grocery-food'] })],
			[],
			product,
			80,
			1
		);

		expect(focused.playerShare).toBeLessThan(unfocused.playerShare);
	});

	test('makes an aggressive discount posture more effective as price sensitivity rises', () => {
		const rival = competitor({ pricePosture: 'discount' });
		const sensitive = resolveProductMarketShare(
			[rival],
			[],
			getProductDefinition('bottled-water'),
			80,
			1
		);
		const insensitive = resolveProductMarketShare(
			[rival],
			[],
			{ ...getProductDefinition('bottled-water'), priceSensitivity: 0 },
			80,
			1
		);

		expect(sensitive.competitors[0]!.attractionScore).toBeGreaterThan(
			insensitive.competitors[0]!.attractionScore
		);
	});

	test('raises compatible specialist attraction for the matching product family', () => {
		const product = getProductDefinition('produce');
		const common = resolveProductMarketShare(
			[
				competitor({
					archetypeId: 'grocery',
					productFocus: ['grocery-food'],
					brandIds: ['common-ground']
				})
			],
			[],
			product,
			80,
			1
		);
		const specialist = resolveProductMarketShare(
			[
				competitor({
					archetypeId: 'grocery',
					productFocus: ['grocery-food'],
					brandIds: ['common-ground', 'fresh-field']
				})
			],
			[],
			product,
			80,
			1
		);

		expect(specialist.competitors[0]!.attractionScore).toBeGreaterThan(
			common.competitors[0]!.attractionScore
		);
	});

	test('returns canonical rival rows and shares that sum to one', () => {
		const resolution = resolveProductMarketShare(
			[
				competitor({ id: 'competitor-harbor-city-2', reputation: 60 }),
				competitor({ id: 'competitor-harbor-city-1', reputation: 55 })
			],
			[],
			getProductDefinition('bottled-water'),
			100,
			1
		);
		const totalShare =
			resolution.playerShare +
			resolution.competitors.reduce((total, rival) => total + rival.share, 0);

		expect(resolution.competitors.map((rival) => rival.competitorId)).toEqual([
			'competitor-harbor-city-1',
			'competitor-harbor-city-2'
		]);
		expect(totalShare).toBeCloseTo(1, 10);
	});
});
