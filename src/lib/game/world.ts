import { DEFAULT_RETAIL_CITY_HEIGHT, DEFAULT_RETAIL_CITY_WIDTH, generateCity } from './city';
import {
	DEFAULT_INDUSTRY_CITY_HEIGHT,
	DEFAULT_INDUSTRY_CITY_WIDTH,
	generateIndustryCity
} from './industry';
import {
	getExpansionFinanceOffer,
	type ExpansionFinanceOffer,
	type FinanceActionResult,
	type FinancedPurchaseReceipt
} from './finance';
import { runExpansionPurchase } from './expansionFinancing';
import {
	getCityInventory,
	initializeCityInventory,
	initializeRetailSupplyAssignment
} from './cityInventory';
import { getWorldCityDefinition } from './worldCatalog';
import {
	decisionContextWorldCityNotAvailableYet,
	decisionContextWorldCityOpeningCost,
	decisionContextWorldCityUnknown
} from './decisionContext';
import type { DecisionContext } from './decisionContext';
import type {
	DecisionItem,
	SystemDecisionOption,
	GameState,
	IndustrialBuildingTypeId,
	IndustryResourceProfile,
	MaterialId,
	ProductId,
	WorldCityDefinition,
	WorldCityId,
	WorldMilestoneId,
	WorldCityState,
	WorldProgress
} from './types';

export const STARTER_STORE_CAP = 3;

export { WORLD_CITY_CATALOG, getWorldCityDefinition, isWorldCityId } from './worldCatalog';

const STARTER_CITY_IDS: WorldCityId[] = ['harbor-city', 'industry-city'];

const RAW_PRODUCER_BUILDING_TYPE_IDS: readonly IndustrialBuildingTypeId[] = [
	'grain-farm',
	'salt-mine',
	'oilseed-farm',
	'water-pump',
	'fruit-farm',
	'sugar-farm',
	'pulpwood-grove',
	'chemical-feedstock-well'
];

const FINISHED_MATERIAL_IDS: readonly MaterialId[] = ['snacks', 'drinks', 'essentials', 'gifts'];

export interface WorldCityStatus {
	city: WorldCityDefinition;
	state: WorldCityState;
	canOpen: boolean;
	blockedReason: DecisionContext | null;
	storeCount: number;
	buildingCount: number;
	financeOffer: ExpansionFinanceOffer | null;
}

export function createInitialWorldProgress(): WorldProgress {
	return {
		revealedCityIds: [...STARTER_CITY_IDS],
		openedCityIds: [...STARTER_CITY_IDS],
		claimedMilestoneIds: []
	};
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
	const blockedReason: DecisionContext | null =
		state === 'locked'
			? decisionContextWorldCityNotAvailableYet(city.id)
			: state === 'revealed' && game.cash < city.openingCost
				? decisionContextWorldCityOpeningCost(city.openingCost)
				: null;

	return {
		city,
		state,
		canOpen: state === 'revealed' && game.cash >= city.openingCost,
		blockedReason,
		storeCount,
		buildingCount,
		financeOffer:
			state === 'revealed' && game.cash < city.openingCost
				? getExpansionFinanceOffer(game, city.openingCost)
				: null
	};
}

function uniqueCityIds(cityIds: readonly WorldCityId[]): WorldCityId[] {
	return [...new Set(cityIds)];
}

function appendDecision(game: GameState, decision: DecisionItem): GameState {
	if (game.decisions.some((candidate) => candidate.id === decision.id)) {
		return game;
	}

	return {
		...game,
		decisions: [...game.decisions, decision]
	};
}

function worldDecision(
	game: GameState,
	title: string,
	context: DecisionContext,
	cityId?: string
): DecisionItem {
	const parts = ['world-city', toDecisionIdPart(title), toDecisionIdPart(context.code)];

	if (cityId) {
		parts.push(toDecisionIdPart(cityId));
	}

	parts.push(String(game.day));

	return {
		kind: 'system',
		id: parts.join('-'),
		title,
		context,
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}

export function refreshWorldProgress(game: GameState): GameState {
	const revealedCityIds = new Set(game.world.revealedCityIds);
	const claimedMilestoneIds = new Set(game.world.claimedMilestoneIds);
	let storeCap = game.storeCap;
	let changed = false;
	const revealCity = (cityId: WorldCityId, milestoneId: WorldMilestoneId, condition: boolean) => {
		if (!condition) return;

		if (!revealedCityIds.has(cityId)) {
			revealedCityIds.add(cityId);
			changed = true;
		}

		if (!claimedMilestoneIds.has(milestoneId)) {
			claimedMilestoneIds.add(milestoneId);
			changed = true;
		}
	};

	revealCity('campus-junction', 'reveal-campus-junction', game.stores.length >= 2 || game.day >= 7);
	revealCity('breadbasket-basin', 'reveal-breadbasket-basin', hasWarehouseAndRawProducer(game));
	revealCity('quarry-works', 'reveal-quarry-works', hasFinishedMaterialInCityInventories(game));
	revealCity(
		'garden-borough',
		'reveal-garden-borough',
		game.stores.length >= 4 || (game.cash > 0 && hasPositiveReport(game))
	);

	if (
		hasOpenedNonHarborRetailCity(game) &&
		hasPositiveReport(game) &&
		!claimedMilestoneIds.has('positive-income-store-cap')
	) {
		claimedMilestoneIds.add('positive-income-store-cap');
		storeCap += 1;
		changed = true;
	}

	const openedCityIds = uniqueCityIds(game.world.openedCityIds);
	const nextRevealedCityIds = uniqueCityIds([...revealedCityIds]);
	const nextClaimedMilestoneIds = [...claimedMilestoneIds];
	const normalized =
		openedCityIds.length !== game.world.openedCityIds.length ||
		nextRevealedCityIds.length !== game.world.revealedCityIds.length ||
		nextClaimedMilestoneIds.length !== game.world.claimedMilestoneIds.length;

	if (!changed && !normalized && storeCap === game.storeCap) {
		return game;
	}

	return {
		...game,
		storeCap,
		world: {
			...game.world,
			revealedCityIds: nextRevealedCityIds,
			openedCityIds,
			claimedMilestoneIds: nextClaimedMilestoneIds
		}
	};
}

export function openWorldCity(game: GameState, cityId: string): GameState {
	const city = getWorldCityDefinition(cityId);

	if (!city) {
		return appendDecision(
			game,
			worldDecision(game, 'City unavailable', decisionContextWorldCityUnknown())
		);
	}

	if (game.world.openedCityIds.includes(city.id)) {
		return selectWorldCity(game, city.id);
	}

	if (!game.world.revealedCityIds.includes(city.id)) {
		return appendDecision(
			game,
			worldDecision(
				game,
				'City is not available yet',
				decisionContextWorldCityNotAvailableYet(city.id),
				city.id
			)
		);
	}

	if (game.cash < city.openingCost) {
		return appendDecision(
			game,
			worldDecision(
				game,
				'City opening delayed',
				decisionContextWorldCityOpeningCost(city.openingCost),
				city.id
			)
		);
	}

	const openedGame = {
		...game,
		cash: game.cash - city.openingCost,
		storeCap: game.storeCap + city.storeCapBonus,
		world: {
			...game.world,
			revealedCityIds: uniqueCityIds([...game.world.revealedCityIds, city.id]),
			openedCityIds: uniqueCityIds([...game.world.openedCityIds, city.id])
		}
	};

	const mapGame = ensureWorldCityMap(openedGame, city);
	const lifecycleGame =
		city.kind === 'industry'
			? initializeCityInventory(mapGame, city.id)
			: initializeRetailSupplyAssignment(mapGame, city.id);

	return refreshWorldProgress(selectWorldCity(lifecycleGame, city.id));
}

export function financeWorldCityOpening(
	game: GameState,
	input: { cityId: WorldCityId; expectedCost: number }
): FinanceActionResult<FinancedPurchaseReceipt> {
	return runExpansionPurchase(game, {
		expectedCost: input.expectedCost,
		resolveLiveCost: (candidate) => {
			const city = getWorldCityDefinition(input.cityId);
			return city &&
				!candidate.world.openedCityIds.includes(city.id) &&
				candidate.world.revealedCityIds.includes(city.id)
				? city.openingCost
				: null;
		},
		cashOnlyPurchase: (candidate) => openWorldCity(candidate, input.cityId),
		postcondition: (candidate) => candidate.world.openedCityIds.includes(input.cityId)
	});
}

export function selectWorldCity(game: GameState, cityId: WorldCityId): GameState {
	const city = getWorldCityDefinition(cityId);

	if (!city || !game.world.openedCityIds.includes(city.id)) return game;
	if (city.kind === 'retail') {
		return game.activeCityId === city.id ? game : { ...game, activeCityId: city.id };
	}
	return game.activeIndustryCityId === city.id ? game : { ...game, activeIndustryCityId: city.id };
}

export function getRetailCityDemandMultiplier(
	_game: Pick<GameState, 'world'>,
	cityId: string,
	productId: ProductId
): number {
	const city = getWorldCityDefinition(cityId);
	return city?.retailDemandProfile[productId] ?? 1;
}

export function getIndustryCityResourceProfile(cityId: string): IndustryResourceProfile | null {
	return getWorldCityDefinition(cityId)?.industryResourceProfile ?? null;
}

function hasWarehouseAndRawProducer(game: GameState): boolean {
	return (
		game.industrialBuildings.some((building) => building.typeId === 'warehouse') &&
		game.industrialBuildings.some((building) =>
			RAW_PRODUCER_BUILDING_TYPE_IDS.includes(building.typeId)
		)
	);
}

function hasFinishedMaterialInCityInventories(game: GameState): boolean {
	if (
		game.cityInventories.some((inventory) => {
			const access = getCityInventory(game, inventory.cityId);
			return (
				access.ok &&
				FINISHED_MATERIAL_IDS.some(
					(materialId) => (access.inventory.materials[materialId] ?? 0) > 0
				)
			);
		})
	) {
		return true;
	}

	// Produced materials may have been pulled from their city inventory on the
	// same day. Only attributed movement can establish that city-local evidence;
	// historical global-pool rows intentionally do not unlock this milestone.
	const latestReport = game.reports.at(-1);
	if (!latestReport) return false;

	return latestReport.productionReport.produced.some((movement) => {
		if (
			movement.source !== 'local' ||
			!movement.cityId ||
			!FINISHED_MATERIAL_IDS.includes(movement.materialId)
		) {
			return false;
		}

		return getCityInventory(game, movement.cityId).ok;
	});
}

function hasPositiveReport(game: GameState): boolean {
	return game.reports.some((report) => report.netIncome > 0);
}

function hasOpenedNonHarborRetailCity(game: GameState): boolean {
	return game.world.openedCityIds.some((cityId) => {
		const city = getWorldCityDefinition(cityId);
		return city?.kind === 'retail' && city.id !== 'harbor-city';
	});
}

function ensureWorldCityMap(game: GameState, city: WorldCityDefinition): GameState {
	if (city.kind === 'retail') {
		if (game.cities.some((candidate) => candidate.id === city.id)) return game;

		return {
			...game,
			cities: [
				...game.cities,
				generateCity({
					id: city.id,
					name: city.name,
					width: DEFAULT_RETAIL_CITY_WIDTH,
					height: DEFAULT_RETAIL_CITY_HEIGHT,
					seed: city.seed
				})
			]
		};
	}

	if (game.industryCities.some((candidate) => candidate.id === city.id)) return game;

	return {
		...game,
		industryCities: [
			...game.industryCities,
			generateIndustryCity({
				id: city.id,
				name: city.name,
				width: DEFAULT_INDUSTRY_CITY_WIDTH,
				height: DEFAULT_INDUSTRY_CITY_HEIGHT,
				seed: city.seed,
				resourceProfile: city.industryResourceProfile ?? undefined
			})
		]
	};
}

function acknowledgeOption(): SystemDecisionOption {
	return {
		id: 'acknowledge',
		label: 'Acknowledge',
		description: 'Return to the world map.'
	};
}

function toDecisionIdPart(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
