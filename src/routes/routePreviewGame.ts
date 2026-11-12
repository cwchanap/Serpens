import {
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity
} from '$lib/game/city';
import { createInitialEventRuntime } from '$lib/game/eventSelection';
import { createEmptyFinanceState } from '$lib/game/finance';
import {
	DEFAULT_INDUSTRY_CITY_HEIGHT,
	DEFAULT_INDUSTRY_CITY_WIDTH,
	generateIndustryCity
} from '$lib/game/industry';
import { DEFAULT_POLICY } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import {
	STARTER_STORE_CAP,
	createInitialWorldProgress,
	getWorldCityDefinition
} from '$lib/game/world';

/** Presentation fallback before founding, not a playable company or persisted save. */
export function createRoutePreviewGame(): GameState {
	const starterCity = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: DEFAULT_RETAIL_CITY_WIDTH,
		height: DEFAULT_RETAIL_CITY_HEIGHT,
		seed: 20260503
	});
	const starterIndustry = getWorldCityDefinition('industry-city');
	const starterIndustryCity = generateIndustryCity({
		id: starterIndustry?.id ?? 'industry-city',
		name: starterIndustry?.name ?? 'Industry City',
		width: DEFAULT_INDUSTRY_CITY_WIDTH,
		height: DEFAULT_INDUSTRY_CITY_HEIGHT,
		seed: starterIndustry?.seed ?? 20260512,
		resourceProfile: starterIndustry?.industryResourceProfile
	});
	return {
		seed: 20260503,
		rngState: 0,
		day: 1,
		cash: 0,
		finance: createEmptyFinanceState(1),
		policy: { ...DEFAULT_POLICY },
		policyOverrides: [],
		managerDelegations: [],
		managerActionHistory: [],
		scorecard: {
			profit: 0,
			customerSatisfaction: 0,
			staffMorale: 0,
			marketPosition: 0
		},
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		cities: [starterCity],
		activeCityId: starterCity.id,
		industryCities: [starterIndustryCity],
		activeIndustryCityId: starterIndustryCity.id,
		industrialBuildings: [],
		cityInventories: [{ cityId: 'industry-city', materials: {} }],
		retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }],
		logistics: {
			transferOrders: [],
			recurringRoutes: [],
			nextTransferSequence: 1,
			nextRouteSequence: 1
		},
		stores: [],
		competitors: [],
		staff: [],
		hiringCandidates: [],
		events: createInitialEventRuntime(20260503),
		decisions: [],
		progression: { claims: [] },
		reports: []
	};
}
