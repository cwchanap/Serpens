import type { ArchetypeId, StoreArchetype } from './types';

function cloneArchetype(archetype: StoreArchetype): StoreArchetype {
	return {
		...archetype,
		startingCategories: archetype.startingCategories.map((category) => ({ ...category })),
		risks: [...archetype.risks]
	};
}

function freezeArchetype(archetype: StoreArchetype): StoreArchetype {
	return Object.freeze({
		...archetype,
		startingCategories: Object.freeze(
			archetype.startingCategories.map((category) => Object.freeze({ ...category }))
		),
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
		startingCategories: [
			{
				id: 'snacks',
				name: 'Snacks',
				baseDemand: 72,
				margin: 0.34,
				demandWeight: 1,
				importCost: 3,
				defaultSellingPrice: 5,
				priceSensitivity: 0.9
			},
			{
				id: 'drinks',
				name: 'Drinks',
				baseDemand: 88,
				margin: 0.3,
				demandWeight: 1.15,
				importCost: 2,
				defaultSellingPrice: 4,
				priceSensitivity: 0.8
			},
			{
				id: 'essentials',
				name: 'Essentials',
				baseDemand: 45,
				margin: 0.22,
				demandWeight: 0.8,
				importCost: 6,
				defaultSellingPrice: 8,
				priceSensitivity: 0.45
			},
			{
				id: 'household',
				name: 'Household',
				baseDemand: 30,
				margin: 0.28,
				demandWeight: 0.7,
				importCost: 7,
				defaultSellingPrice: 11,
				priceSensitivity: 0.5
			}
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
		startingCategories: [
			{
				id: 'apparel',
				name: 'Apparel',
				baseDemand: 36,
				margin: 0.5,
				demandWeight: 1,
				importCost: 18,
				defaultSellingPrice: 38,
				priceSensitivity: 1.05
			},
			{
				id: 'home-goods',
				name: 'Home Goods',
				baseDemand: 30,
				margin: 0.44,
				demandWeight: 0.85,
				importCost: 14,
				defaultSellingPrice: 28,
				priceSensitivity: 0.85
			},
			{
				id: 'gifts',
				name: 'Gifts',
				baseDemand: 26,
				margin: 0.48,
				demandWeight: 0.75,
				importCost: 9,
				defaultSellingPrice: 20,
				priceSensitivity: 0.95
			},
			{
				id: 'fashion-accessories',
				name: 'Accessories',
				baseDemand: 24,
				margin: 0.52,
				demandWeight: 0.7,
				importCost: 12,
				defaultSellingPrice: 26,
				priceSensitivity: 1.0
			}
		],
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
		startingCategories: [
			{
				id: 'games',
				name: 'Games',
				baseDemand: 40,
				margin: 0.28,
				demandWeight: 1,
				importCost: 32,
				defaultSellingPrice: 48,
				priceSensitivity: 0.75
			},
			{
				id: 'accessories',
				name: 'Accessories',
				baseDemand: 34,
				margin: 0.42,
				demandWeight: 0.9,
				importCost: 11,
				defaultSellingPrice: 22,
				priceSensitivity: 0.9
			},
			{
				id: 'devices',
				name: 'Devices',
				baseDemand: 18,
				margin: 0.24,
				demandWeight: 0.55,
				importCost: 180,
				defaultSellingPrice: 240,
				priceSensitivity: 0.5
			},
			{
				id: 'peripherals',
				name: 'Peripherals',
				baseDemand: 28,
				margin: 0.4,
				demandWeight: 0.7,
				importCost: 24,
				defaultSellingPrice: 44,
				priceSensitivity: 0.85
			}
		],
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
		startingCategories: [
			{
				id: 'produce',
				name: 'Produce',
				baseDemand: 64,
				margin: 0.26,
				demandWeight: 1,
				importCost: 2,
				defaultSellingPrice: 4,
				priceSensitivity: 0.7
			},
			{
				id: 'pantry',
				name: 'Pantry',
				baseDemand: 74,
				margin: 0.24,
				demandWeight: 1.1,
				importCost: 3,
				defaultSellingPrice: 6,
				priceSensitivity: 0.55
			},
			{
				id: 'prepared',
				name: 'Prepared Food',
				baseDemand: 38,
				margin: 0.38,
				demandWeight: 0.75,
				importCost: 5,
				defaultSellingPrice: 10,
				priceSensitivity: 0.85
			},
			{
				id: 'bakery',
				name: 'Bakery',
				baseDemand: 34,
				margin: 0.4,
				demandWeight: 0.7,
				importCost: 3,
				defaultSellingPrice: 7,
				priceSensitivity: 0.8
			}
		],
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
