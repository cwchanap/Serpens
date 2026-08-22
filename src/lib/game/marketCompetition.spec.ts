import { describe, expect, test } from 'vitest';
import { getProductDefinition } from './products';
import { resolveProductMarketShare } from './marketCompetition';
import type { ActiveEventModifier, MarketCompetitor } from './types';

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

function attractionModifier(overrides: Partial<ActiveEventModifier> = {}): ActiveEventModifier {
	return {
		id: 'event-modifier-1',
		source: { eventId: 'rival-promotion', instanceId: 'event-instance-1', optionId: 'respond' },
		target: { kind: 'competitor', competitorId: 'competitor-harbor-city-1' },
		startsOnDay: 2,
		expiresOnDay: 5,
		stackingKey: 'rival-promotion:market-attraction',
		stackingRule: 'replace',
		effect: { kind: 'competitor-attraction-multiplier', multiplier: 1.18 },
		explanation: { key: 'events.rivalPromotion.modifier', params: {} },
		importance: 'important',
		...overrides
	};
}

describe('explicit product market share', () => {
	test('gives the player the whole market with no rivals and positive attraction', () => {
		expect.assertions(2);
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
		expect.assertions(2);
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
		expect.assertions(2);
		const product = getProductDefinition('bottled-water');
		const low = resolveProductMarketShare([competitor({ reputation: 45 })], [], product, 80, 1);
		const high = resolveProductMarketShare([competitor({ reputation: 75 })], [], product, 80, 1);

		expect(high.playerShare).toBeLessThan(low.playerShare);
		expect(high.competitors[0]!.attractionScore).toBeGreaterThan(
			low.competitors[0]!.attractionScore
		);
	});

	test('lowers player share for a focused rival compared with an unfocused rival', () => {
		expect.assertions(1);
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
		expect.assertions(1);
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
		expect.assertions(1);
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

	test('excludes a rival whose archetype does not stock the product', () => {
		expect.assertions(2);
		const resolution = resolveProductMarketShare(
			[competitor({ archetypeId: 'boutique' })],
			[],
			getProductDefinition('bottled-water'),
			80,
			1
		);

		expect(resolution.competitors).toEqual([]);
		expect(resolution.playerShare).toBe(1);
	});

	test('excludes a rival whose brands support only other product families', () => {
		expect.assertions(2);
		const resolution = resolveProductMarketShare(
			[competitor({ brandIds: ['northstar-select'] })],
			[],
			getProductDefinition('bottled-water'),
			80,
			1
		);

		expect(resolution.competitors).toEqual([]);
		expect(resolution.playerShare).toBe(1);
	});

	test('returns canonical rival rows and shares that sum to one', () => {
		expect.assertions(2);
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

	test('applies an active rival attraction modifier and restores the base share after expiry', () => {
		expect.assertions(4);
		const rival = competitor();
		const product = getProductDefinition('bottled-water');
		const base = resolveProductMarketShare([rival], [], product, 80, 2);
		const active = resolveProductMarketShare([rival], [attractionModifier()], product, 80, 2);
		const expired = resolveProductMarketShare([rival], [attractionModifier()], product, 80, 5);

		expect(active.playerShare).toBeLessThan(base.playerShare);
		expect(active.competitors[0]?.eventMultiplier).toBe(1.18);
		expect(expired.playerShare).toBe(base.playerShare);
		expect(expired.competitors[0]?.eventMultiplier).toBe(1);
	});

	test('ignores active modifiers that target another rival or carry invalid attraction values', () => {
		expect.assertions(4);
		const rival = competitor();
		const product = getProductDefinition('bottled-water');
		const base = resolveProductMarketShare([rival], [], product, 80, 2);

		const otherRival = resolveProductMarketShare(
			[rival],
			[
				attractionModifier({
					target: { kind: 'competitor', competitorId: 'competitor-harbor-city-2' }
				})
			],
			product,
			80,
			2
		);
		const nonFinite = resolveProductMarketShare(
			[rival],
			[
				attractionModifier({
					effect: { kind: 'competitor-attraction-multiplier', multiplier: Number.NaN }
				})
			],
			product,
			80,
			2
		);
		const nonPositive = resolveProductMarketShare(
			[rival],
			[attractionModifier({ effect: { kind: 'competitor-attraction-multiplier', multiplier: 0 } })],
			product,
			80,
			2
		);
		const wrongEffect = resolveProductMarketShare(
			[rival],
			[
				attractionModifier({
					effect: { kind: 'route-capacity-multiplier', multiplier: 1.5 } as never
				})
			],
			product,
			80,
			2
		);

		expect(otherRival.playerShare).toBe(base.playerShare);
		expect(nonFinite.playerShare).toBe(base.playerShare);
		expect(nonPositive.playerShare).toBe(base.playerShare);
		expect(wrongEffect.playerShare).toBe(base.playerShare);
	});

	test('normalizes a negative or non-finite player attraction score to zero', () => {
		expect.assertions(6);
		const product = getProductDefinition('bottled-water');

		for (const invalidScore of [-12, Number.NEGATIVE_INFINITY, Number.NaN]) {
			const resolution = resolveProductMarketShare([competitor()], [], product, invalidScore, 1);

			expect(resolution.playerAttractionScore).toBe(0);
			expect(resolution.playerShare).toBe(0);
		}
	});

	test('returns a zero player share when the total attraction pool is zero', () => {
		expect.assertions(2);
		const resolution = resolveProductMarketShare(
			[],
			[],
			getProductDefinition('bottled-water'),
			Number.NaN,
			1
		);

		expect(resolution.playerShare).toBe(0);
		expect(resolution.competitors).toEqual([]);
	});
});
