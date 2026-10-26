/**
 * Balance-harness bots (HPA-502 Stage 2). Deterministic, seed-driven players
 * built exclusively on real engine transitions: `applyGameCommand` for
 * command-shaped actions, the actual `setManagerDelegation` transition for
 * manager setup, and existing placement/rail previews for advisor execution.
 * No bot-only stock formulas, no hidden cash injections, no bespoke
 * pathfinders — the engine stays the sole authority.
 *
 * Consumed by the Stage 3 measurement stage: `runBot` returns the final
 * `GameState` plus a plain-data `BotLedger` (opening forecasts + action
 * outcomes) that `measureRun(game, openingLedger)` will read.
 */

import { isTileBuildable } from '$lib/game/city';
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import { getIndustrialPlacementBlockReason } from '$lib/game/industryPlacement';
import { setManagerDelegation } from '$lib/game/managerDelegation';
import {
	createFoundingGameAtTile,
	estimateOpeningRevenue,
	type OpeningEstimate
} from '$lib/game/placement';
import { buildRailPreview } from '$lib/game/railPlacement';
import {
	buildSupplyPlan,
	type SupplyPlannerAction,
	type SupplyPlannerActionAvailability
} from '$lib/game/supplyPlannerActions';
import { createNewGame, getExpansionSetupCost } from '$lib/game/state';
import { summarizeStoreStaffing } from '$lib/game/staffing';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason
} from '$lib/game/storeFootprint';
import type {
	ArchetypeId,
	City,
	CityTile,
	GameState,
	IndustrialBuildingTypeId,
	OpeningForecast,
	WorldCityId
} from '$lib/game/types';
import { applyGameCommand } from '$lib/scenarios/runtime';

export type BotId = 'idle' | 'retail-steady' | 'advisor';

export type BotActionOutcome = 'applied' | 'no-op' | 'rejected' | 'unsupported';

export interface BotActionRecord {
	day: number;
	bot: BotId;
	action: string;
	outcome: BotActionOutcome;
	detail?: string;
}

export interface OpeningRecord {
	day: number;
	storeId: string;
	tileId: string;
	archetypeId: ArchetypeId;
	neighborhood: CityTile['neighborhood'];
	/** Store level at opening; harness bots never upgrade stores. */
	level: number;
	forecast: OpeningForecast;
}

/** Plain-data ledger the Stage 3 measurement stage consumes. */
export interface BotLedger {
	seed: number;
	archetypeId: ArchetypeId;
	bot: BotId;
	foundingTileId: string;
	/** Cash right after founding, before the day-1 bot actions that precede the first tick. */
	foundingCash: number;
	openings: OpeningRecord[];
	actions: BotActionRecord[];
}

/** The advisor replans once per in-game week; day 1 counts as a planning day. */
export const ADVISOR_CADENCE_DAYS = 7;

const ADVISOR_PRODUCT_ID = 'bottled-water';

const ADVISOR_AVAILABILITY: SupplyPlannerActionAvailability = {
	canBuildIndustry: true,
	canUpgradeIndustry: true,
	canBuildRail: true,
	canManageLogistics: true,
	canSetRetailSupplySource: true,
	allowedIndustryBuildingTypeIds: Object.keys(
		INDUSTRIAL_BUILDING_TYPES
	) as IndustrialBuildingTypeId[],
	allowedIndustrialPlacements: null
};

function byId(left: { id: string }, right: { id: string }): number {
	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * The founding rule: among legal tiles (tile-legality plus the same store
 * footprint check `createFoundingGameAtTile` enforces), maximize
 * `demand + footTraffic`, tie-break by lowest tile id. Deliberately
 * independent of `forecastOpening`, so forecast tuning can never move the
 * founding site.
 */
export function selectFoundingTile(city: City): CityTile {
	const lookup = createCityTileLookup(city);
	return city.tiles
		.filter(
			(tile) =>
				isTileBuildable(tile) && getStoreFootprintPlacementBlockReason(lookup, tile) === null
		)
		.reduce((best, tile) => {
			const bestScore = best.demand + best.footTraffic;
			const score = tile.demand + tile.footTraffic;
			if (score > bestScore) return tile;
			if (score === bestScore && tile.id < best.id) return tile;
			return best;
		});
}

/**
 * Projects an estimate onto the ledger's legacy `OpeningForecast` shape so
 * `measure.ts` keeps reading the same fields it always has.
 */
function openingForecastFrom(estimate: OpeningEstimate): OpeningForecast {
	return {
		tileId: estimate.tileId,
		setupCost: estimate.setupCost,
		projectedDailyRevenue: estimate.projectedDailyRevenue,
		projectedDailyRent: estimate.projectedDailyRent,
		demandScore: estimate.demandScore,
		customerFit: estimate.customerFit,
		risks: estimate.risks
	};
}

/**
 * Repeatable founding: generate the city with an explicit seed, select the
 * rule tile, and hand city + seed to the real founding transition.
 */
export function createFoundingGame(
	archetypeId: ArchetypeId,
	seed: number
): { game: GameState; tile: CityTile } {
	const generated = createNewGame(archetypeId, seed);
	const city = generated.cities[0]!;
	const tile = selectFoundingTile(city);
	const game = createFoundingGameAtTile({ archetypeId, city, tileId: tile.id, seed });
	return { game, tile };
}

/**
 * Run one bot for an explicit number of days. Each day: the bot acts on the
 * current day, then one advanceDay tick is applied. `idle` only advances.
 */
export function runBot(
	bot: BotId,
	archetypeId: ArchetypeId,
	seed: number,
	days: number
): { game: GameState; ledger: BotLedger } {
	const { game: founded, tile } = createFoundingGame(archetypeId, seed);
	// Founding forecast: the shared estimator's founding derivation (game
	// null + the same seed the real founding command consumes).
	const foundingEstimate = estimateOpeningRevenue({
		game: null,
		city: founded.cities[0]!,
		tileId: tile.id,
		archetypeId,
		seed
	});
	const ledger: BotLedger = {
		seed,
		archetypeId,
		bot,
		foundingTileId: tile.id,
		foundingCash: founded.cash,
		openings: [
			{
				day: founded.day,
				storeId: founded.stores[0]!.id,
				tileId: tile.id,
				archetypeId,
				neighborhood: tile.neighborhood,
				level: founded.stores[0]!.level,
				forecast: openingForecastFrom(foundingEstimate)
			}
		],
		actions: []
	};

	let game = founded;
	for (let day = 1; day <= days; day += 1) {
		if (bot === 'retail-steady' || bot === 'advisor') {
			game = runRetailSteadyDay(game, ledger, day);
		}
		// The advisor layer exists only for convenience; other archetypes run
		// retail-steady alone and must never evaluate a supply plan.
		if (
			bot === 'advisor' &&
			archetypeId === 'convenience' &&
			(day - 1) % ADVISOR_CADENCE_DAYS === 0
		) {
			game = runAdvisorPlan(game, ledger, day);
		}
		const advanced = applyGameCommand(game, { kind: 'advanceDay' });
		if (!advanced.ok) {
			throw new Error(`advanceDay was rejected on day ${day}; this is a harness bug.`);
		}
		game = advanced.game;
	}

	return { game, ledger };
}

function record(
	ledger: BotLedger,
	day: number,
	action: string,
	outcome: BotActionOutcome,
	detail?: string
): void {
	ledger.actions.push(
		detail === undefined
			? { day, bot: ledger.bot, action, outcome }
			: { day, bot: ledger.bot, action, outcome, detail }
	);
}

function runRetailSteadyDay(game: GameState, ledger: BotLedger, day: number): GameState {
	let next = ensureManagerDelegation(game, ledger, day);
	next = runStaffingPlaybook(next, ledger, day);
	next = runExpansionPlaybook(next, ledger, day);
	return next;
}

/**
 * Delegate protect-availability to the first eligible manager, once. City
 * scope (not the founding store) so stores opened later by the expansion
 * playbook stay inside the manager's target set.
 */
function ensureManagerDelegation(game: GameState, ledger: BotLedger, day: number): GameState {
	if (
		game.managerDelegations.some(
			(delegation) => delegation.playbook === 'protect-availability' && delegation.enabled
		)
	) {
		return game;
	}
	const manager = game.staff.filter((member) => member.role === 'manager').sort(byId)[0];
	if (!manager) {
		record(ledger, day, 'await-manager', 'no-op', 'no eligible manager on staff');
		return game;
	}
	const store = [...game.stores].sort(byId)[0]!;
	const delegated = setManagerDelegation(game, {
		managerId: manager.id,
		scope: { kind: 'city', cityId: store.cityId as WorldCityId },
		playbook: 'protect-availability',
		authority: { pricing: false, inventory: true, staffing: false, supply: false },
		enabled: true
	});
	if (delegated === game) {
		record(
			ledger,
			day,
			'setManagerDelegation',
			'rejected',
			'transition returned the game unchanged'
		);
		return game;
	}
	record(
		ledger,
		day,
		'setManagerDelegation',
		'applied',
		`manager ${manager.id} on ${store.cityId}`
	);
	return delegated;
}

/** Hire and assign to cover each store's staffing requirement; nothing more. */
function runStaffingPlaybook(game: GameState, ledger: BotLedger, day: number): GameState {
	let next = game;
	for (const store of [...next.stores].sort(byId)) {
		for (const role of ['manager', 'general'] as const) {
			for (;;) {
				const shortage = summarizeStoreStaffing(next, store).shortage[role];
				if (shortage <= 0) break;
				const candidate = next.hiringCandidates.filter((item) => item.role === role).sort(byId)[0];
				if (!candidate) {
					record(ledger, day, 'hireStaff', 'no-op', `no ${role} candidate on the market`);
					break;
				}
				const hired = applyGameCommand(next, { kind: 'hireStaff', candidateId: candidate.id });
				if (!hired.ok || !hired.changed) {
					record(ledger, day, 'hireStaff', hired.ok ? 'no-op' : 'rejected', candidate.id);
					break;
				}
				next = hired.game;
				record(ledger, day, 'hireStaff', 'applied', `${role} ${candidate.id}`);
				const hire = next.staff
					.filter((member) => member.role === role && member.assignedStoreId === null)
					.sort(byId)[0];
				if (hire) {
					const assigned = applyGameCommand(next, {
						kind: 'assignStaff',
						staffId: hire.id,
						storeId: store.id
					});
					record(
						ledger,
						day,
						'assignStaff',
						assigned.ok && assigned.changed ? 'applied' : assigned.ok ? 'no-op' : 'rejected',
						`${hire.id} -> ${store.id}`
					);
					if (assigned.ok && assigned.changed) next = assigned.game;
				}
			}
		}
	}
	return next;
}

/** Legal, cash-safe expansion: best-scoring free tile, only if affordable. */
function runExpansionPlaybook(game: GameState, ledger: BotLedger, day: number): GameState {
	if (game.stores.length >= game.storeCap) {
		record(ledger, day, 'openStore', 'no-op', 'store cap reached');
		return game;
	}
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId)!;
	// Mirror openStoreAtTile's legality so the bot only proposes openings the
	// engine can accept; any residual rejection still lands in the ledger.
	const lookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, lookup);
	const candidate = city.tiles
		.filter(
			(tile) =>
				isTileBuildable(tile) &&
				getStoreFootprintPlacementBlockReason(lookup, tile, occupiedTileIds) === null
		)
		.reduce((best, tile) => {
			const bestScore = best.demand + best.footTraffic;
			const score = tile.demand + tile.footTraffic;
			if (score > bestScore) return tile;
			if (score === bestScore && tile.id < best.id) return tile;
			return best;
		});
	const cost = getExpansionSetupCost(candidate, game.stores[0]!.archetypeId);
	if (cost > game.cash) {
		record(ledger, day, 'openStore', 'no-op', `cash ${game.cash} below setup cost ${cost}`);
		return game;
	}
	// Expansion forecast is recorded on the PRE-COMMAND game, before
	// openStore competes for the pool — the prospective entrant is counted
	// exactly once and the command's own state changes cannot leak in.
	const expansionEstimate = estimateOpeningRevenue({
		game,
		city,
		tileId: candidate.id,
		archetypeId: game.stores[0]!.archetypeId,
		seed: game.seed
	});
	const result = applyGameCommand(game, {
		kind: 'openStore',
		tileId: candidate.id,
		archetypeId: game.stores[0]!.archetypeId
	});
	if (!result.ok) {
		record(
			ledger,
			day,
			'openStore',
			'rejected',
			JSON.stringify(result.decisionContext ?? result.financeFailure ?? null)
		);
		return game;
	}
	if (!result.changed) {
		record(ledger, day, 'openStore', 'no-op');
		return game;
	}
	const store = result.game.stores.find((entry) => entry.tileId === candidate.id)!;
	record(ledger, day, 'openStore', 'applied', store.id);
	ledger.openings.push({
		day,
		storeId: store.id,
		tileId: candidate.id,
		archetypeId: store.archetypeId,
		neighborhood: candidate.neighborhood,
		level: store.level,
		forecast: openingForecastFrom(expansionEstimate)
	});
	return result.game;
}

function runAdvisorPlan(game: GameState, ledger: BotLedger, day: number): GameState {
	const result = buildSupplyPlan(
		game,
		{ retailCityId: game.activeCityId as WorldCityId, productId: ADVISOR_PRODUCT_ID },
		ADVISOR_AVAILABILITY
	);
	if (result.status !== 'ready') {
		record(ledger, day, 'advisor:plan', 'no-op', `${result.status}: ${result.reason}`);
		return game;
	}
	const applied = executeAdvisorAction(game, result.plan.recommendation.action, day);
	record(ledger, day, applied.record.action, applied.record.outcome, applied.record.detail);
	return applied.game;
}

/**
 * Execute one planner recommendation through `applyGameCommand` (and the
 * existing rail preview for path derivation). Returns the next game plus the
 * outcome record; unsupported suggestions are recorded evidence, never
 * applied.
 */
export function executeAdvisorAction(
	game: GameState,
	action: SupplyPlannerAction,
	day: number
): { game: GameState; record: BotActionRecord } {
	if (action.kind === 'none') {
		return {
			game,
			record: {
				day,
				bot: 'advisor',
				action: 'advisor:none',
				outcome: 'no-op',
				detail: action.reason
			}
		};
	}
	const kind = action.kind;
	if (
		kind === 'create-route' ||
		kind === 'edit-route' ||
		kind === 'resume-route' ||
		kind === 'change-supply-source'
	) {
		return {
			game,
			record: {
				day,
				bot: 'advisor',
				action: `advisor:${action.kind}`,
				outcome: 'unsupported',
				detail: JSON.stringify(action)
			}
		};
	}
	if (action.kind === 'build-producer' || action.kind === 'build-warehouse') {
		// The planner scoped its plan to the game's active industry city in this
		// sandbox (fresh harness games source from the starter industry city).
		if (action.kind === 'build-warehouse' && action.cityId !== game.activeIndustryCityId) {
			return {
				game,
				record: {
					day,
					bot: 'advisor',
					action: 'advisor:build-warehouse',
					outcome: 'unsupported',
					detail: `target city ${action.cityId} is not the active industry city`
				}
			};
		}
		const buildingTypeId = action.buildingTypeId;
		// Execute the placement the planner evaluated (rail-ready class
		// preferred) rather than whichever legal tile sorts first — the
		// harness must measure what the plan measured. Actions built
		// without a tile fall back to the first legal tile.
		const tileId = action.tileId ?? findLegalIndustryTile(game, buildingTypeId);
		if (!tileId) {
			return {
				game,
				record: {
					day,
					bot: 'advisor',
					action: `advisor:${action.kind}`,
					outcome: 'no-op',
					detail: `no legal tile for ${buildingTypeId}`
				}
			};
		}
		const applied = applyGameCommand(game, {
			kind: 'buildIndustrialBuilding',
			tileId,
			buildingTypeId
		});
		return {
			game: applied.ok ? applied.game : game,
			record: {
				day,
				bot: 'advisor',
				action: `advisor:${action.kind}`,
				outcome: !applied.ok ? 'rejected' : applied.changed ? 'applied' : 'no-op',
				detail: `${buildingTypeId} on ${tileId}`
			}
		};
	}
	if (action.kind === 'upgrade-building') {
		const applied = applyGameCommand(game, {
			kind: 'upgradeIndustrialBuilding',
			buildingId: action.buildingId
		});
		return {
			game: applied.ok ? applied.game : game,
			record: {
				day,
				bot: 'advisor',
				action: 'advisor:upgrade-building',
				outcome: !applied.ok ? 'rejected' : applied.changed ? 'applied' : 'no-op',
				detail: `${action.buildingId} level ${action.fromLevel} -> ${action.toLevel}`
			}
		};
	}
	// connect-rail: derive the path with the engine's own preview (zero
	// waypoints = direct route); buildRail re-validates through the same
	// preview inside applyGameCommand. No bespoke pathfinding here.
	const preview = buildRailPreview(game, {
		originBuildingId: action.buildingId,
		waypoints: [],
		destinationBuildingId: action.destinationBuildingId
	});
	if (preview.blockReason) {
		return {
			game,
			record: {
				day,
				bot: 'advisor',
				action: 'advisor:connect-rail',
				outcome: 'no-op',
				detail: JSON.stringify(preview.blockReason)
			}
		};
	}
	const applied = applyGameCommand(game, {
		kind: 'buildRail',
		originBuildingId: action.buildingId,
		waypoints: [],
		destinationBuildingId: action.destinationBuildingId
	});
	return {
		game: applied.ok ? applied.game : game,
		record: {
			day,
			bot: 'advisor',
			action: 'advisor:connect-rail',
			outcome: !applied.ok ? 'rejected' : applied.changed ? 'applied' : 'no-op',
			detail: `${action.buildingId} -> ${action.destinationBuildingId}`
		}
	};
}

function findLegalIndustryTile(
	game: GameState,
	buildingTypeId: keyof typeof INDUSTRIAL_BUILDING_TYPES
): string | null {
	const city = game.industryCities.find((candidate) => candidate.id === game.activeIndustryCityId);
	if (!city) return null;
	const legal = city.tiles
		.filter((tile) => getIndustrialPlacementBlockReason(game, tile.id, buildingTypeId) === null)
		.sort(byId);
	return legal[0]?.id ?? null;
}
