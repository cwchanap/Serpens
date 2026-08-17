import type { ArchetypeId, StoreArchetype } from './types';

function cloneArchetype(archetype: StoreArchetype): StoreArchetype {
	return {
		...archetype,
		startingProductIds: [...archetype.startingProductIds],
		risks: [...archetype.risks]
	};
}

function freezeArchetype(archetype: StoreArchetype): StoreArchetype {
	return Object.freeze({
		...archetype,
		startingProductIds: Object.freeze([...archetype.startingProductIds]),
		risks: Object.freeze([...archetype.risks])
	}) as StoreArchetype;
}

const RAW_ARCHETYPES: StoreArchetype[] = [
	{
		id: 'convenience',
		name: 'Convenience Store',
		description: 'Fast turnover, steady foot traffic, low margins, and stockout sensitivity.',
		startingCash: 32_000,
		startingDebt: 8_000,
		baseRent: 115,
		baseWage: 420,
		baseTraffic: 132,
		customerExpectation: 58,
		startingProductIds: [
			'bottled-water',
			'snacks',
			'soft-drinks',
			'essentials',
			// Household is intentionally unreachable: convenience has five
			// authored products, but the milestone cap unlocks only four.
			'household'
		],
		risks: ['Stockouts', 'Low margins', 'High foot traffic pressure']
	},
	{
		id: 'boutique',
		name: 'Boutique Goods',
		description: 'Curated products, customer taste, reputation sensitivity, and premium upside.',
		startingCash: 38_000,
		startingDebt: 6_000,
		baseRent: 135,
		baseWage: 390,
		baseTraffic: 58,
		customerExpectation: 72,
		startingProductIds: ['apparel', 'home-goods', 'gifts', 'fashion-accessories'],
		risks: ['Trend mismatch', 'Reputation swings', 'Premium service expectations']
	},
	{
		id: 'electronics',
		name: 'Electronics & Games',
		description: 'Higher-ticket sales, trend spikes, launches, and shrink risk.',
		startingCash: 46_000,
		startingDebt: 12_000,
		baseRent: 150,
		baseWage: 460,
		baseTraffic: 52,
		customerExpectation: 68,
		startingProductIds: ['games', 'accessories', 'devices', 'peripherals'],
		risks: ['Launch volatility', 'Shrink', 'Expensive inventory']
	},
	{
		id: 'grocery',
		name: 'Grocery Market',
		description: 'Recurring demand, freshness pressure, broad categories, and supply complexity.',
		startingCash: 42_000,
		startingDebt: 14_000,
		baseRent: 165,
		baseWage: 520,
		baseTraffic: 118,
		customerExpectation: 65,
		startingProductIds: ['produce', 'pantry', 'prepared', 'bakery'],
		risks: ['Freshness', 'Waste', 'Staffing pressure']
	}
];

const ARCHETYPE_DEFINITIONS: StoreArchetype[] = RAW_ARCHETYPES.map(freezeArchetype);

export const ARCHETYPES: StoreArchetype[] = Object.freeze(
	ARCHETYPE_DEFINITIONS.map(cloneArchetype).map(freezeArchetype)
) as StoreArchetype[];

export function getArchetype(id: ArchetypeId): StoreArchetype {
	const archetype = ARCHETYPE_DEFINITIONS.find((candidate) => candidate.id === id);

	if (!archetype) {
		throw new Error(`Unknown archetype: ${id}`);
	}

	return cloneArchetype(archetype);
}
