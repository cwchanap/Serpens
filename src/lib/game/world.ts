import type {
	GameState,
	IndustryResourceProfile,
	WorldCityDefinition,
	WorldCityId,
	WorldCityState,
	WorldProgress
} from './types';

export const STARTER_STORE_CAP = 3;

const STARTER_CITY_IDS: WorldCityId[] = ['harbor-city', 'industry-city'];

export interface WorldCityStatus {
	city: WorldCityDefinition;
	state: WorldCityState;
	canOpen: boolean;
	blockedReason: string | null;
	storeCount: number;
	buildingCount: number;
}

export const WORLD_CITY_CATALOG: readonly WorldCityDefinition[] = [
	{
		id: 'harbor-city',
		name: 'Harbor City',
		kind: 'retail',
		worldX: 28,
		worldY: 52,
		seed: 20260503,
		openingCost: 0,
		initiallyOpened: true,
		unlockRequirement: 'Starter retail city',
		specialtySummary: 'Balanced starter market with steady everyday demand.',
		storeCapBonus: 0,
		retailDemandProfile: {},
		industryResourceProfile: null
	},
	{
		id: 'campus-junction',
		name: 'Campus Junction',
		kind: 'retail',
		worldX: 48,
		worldY: 28,
		seed: 20260531,
		openingCost: 18_000,
		initiallyOpened: false,
		unlockRequirement: 'Reach 2 stores or day 7.',
		specialtySummary: 'Student-heavy districts favor electronics, games, accessories, and gifts.',
		storeCapBonus: 1,
		retailDemandProfile: {
			games: 1.35,
			accessories: 1.22,
			devices: 1.18,
			gifts: 1.2,
			produce: 0.9,
			pantry: 0.92,
			prepared: 0.96,
			essentials: 0.94
		},
		industryResourceProfile: null
	},
	{
		id: 'garden-borough',
		name: 'Garden Borough',
		kind: 'retail',
		worldX: 66,
		worldY: 64,
		seed: 20260532,
		openingCost: 28_000,
		initiallyOpened: false,
		unlockRequirement: 'Reach 4 stores or hold positive cash after daily reports.',
		specialtySummary:
			'Residential neighborhoods favor groceries, essentials, and convenience goods.',
		storeCapBonus: 1,
		retailDemandProfile: {
			produce: 1.3,
			pantry: 1.25,
			prepared: 1.18,
			essentials: 1.25,
			snacks: 1.12,
			drinks: 1.08,
			games: 0.9,
			devices: 0.88
		},
		industryResourceProfile: null
	},
	{
		id: 'industry-city',
		name: 'Industry City',
		kind: 'industry',
		worldX: 30,
		worldY: 75,
		seed: 20260512,
		openingCost: 0,
		initiallyOpened: true,
		unlockRequirement: 'Starter industrial city',
		specialtySummary: 'Balanced starter resources with broad processing room.',
		storeCapBonus: 0,
		retailDemandProfile: {},
		industryResourceProfile: {
			resourceIds: [
				'grain-field',
				'salt-deposit',
				'oilseed-field',
				'water-source',
				'fruit-orchard',
				'sugar-field',
				'pulpwood-forest',
				'chemical-feedstock'
			],
			industrialBias: 1
		}
	},
	{
		id: 'breadbasket-basin',
		name: 'Breadbasket Basin',
		kind: 'industry',
		worldX: 58,
		worldY: 82,
		seed: 20260533,
		openingCost: 15_000,
		initiallyOpened: false,
		unlockRequirement: 'Build a warehouse and one raw producer.',
		specialtySummary: 'Food-chain resource basin for grain, oilseeds, fruit, and sugar.',
		storeCapBonus: 0,
		retailDemandProfile: {},
		industryResourceProfile: {
			resourceIds: ['grain-field', 'oilseed-field', 'fruit-orchard', 'sugar-field', 'water-source'],
			industrialBias: 0.9
		}
	},
	{
		id: 'quarry-works',
		name: 'Quarry Works',
		kind: 'industry',
		worldX: 76,
		worldY: 36,
		seed: 20260534,
		openingCost: 26_000,
		initiallyOpened: false,
		unlockRequirement: 'Produce a finished material locally.',
		specialtySummary:
			'Extraction and factory district for salt, chemicals, pulpwood, and packaging chains.',
		storeCapBonus: 0,
		retailDemandProfile: {},
		industryResourceProfile: {
			resourceIds: ['salt-deposit', 'chemical-feedstock', 'pulpwood-forest', 'water-source'],
			industrialBias: 1.25
		}
	}
];

export function createInitialWorldProgress(): WorldProgress {
	return {
		revealedCityIds: [...STARTER_CITY_IDS],
		openedCityIds: [...STARTER_CITY_IDS],
		claimedMilestoneIds: []
	};
}

export function getWorldCityDefinition(cityId: string): WorldCityDefinition | undefined {
	return WORLD_CITY_CATALOG.find((city) => city.id === cityId);
}

export function getWorldCityStatus(game: GameState, cityId: string): WorldCityStatus | null {
	const city = getWorldCityDefinition(cityId);
	if (!city) return null;

	const opened = game.world.openedCityIds.includes(city.id);
	const revealed = game.world.revealedCityIds.includes(city.id);
	const state: WorldCityState = opened ? 'opened' : revealed ? 'revealed' : 'locked';
	const storeCount = game.stores.filter((store) => store.cityId === city.id).length;
	const buildingCount = game.industrialBuildings.filter(
		(building) => building.cityId === city.id
	).length;
	const blockedReason =
		state === 'locked'
			? city.unlockRequirement
			: state === 'revealed' && game.cash < city.openingCost
				? `Opening this city requires ${city.openingCost.toLocaleString('en-US')} cash.`
				: null;

	return {
		city,
		state,
		canOpen: state === 'revealed' && game.cash >= city.openingCost,
		blockedReason,
		storeCount,
		buildingCount
	};
}

export function getRetailCityDemandMultiplier(
	_game: Pick<GameState, 'world'>,
	cityId: string,
	categoryId: string
): number {
	const city = getWorldCityDefinition(cityId);
	return city?.retailDemandProfile[categoryId] ?? 1;
}

export function getIndustryCityResourceProfile(cityId: string): IndustryResourceProfile | null {
	return getWorldCityDefinition(cityId)?.industryResourceProfile ?? null;
}
