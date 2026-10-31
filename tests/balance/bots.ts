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
import { getArchetype } from '$lib/game/archetypes';
import {
	assessCredit,
	estimateNextLoanPayment,
	getPayoffAmount,
	isOutstandingLoan
} from '$lib/game/finance';
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import { getStoreUpgradeCost } from '$lib/game/leveling';
import { claimEarnedTiers } from '$lib/game/progression';
import { PRODUCTS } from '$lib/game/products';
import { compareWorldCityIds, WORLD_CITY_CATALOG } from '$lib/game/worldCatalog';
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
	LoanTermDays,
	OpeningForecast,
	ProductId,
	ProgressionTierId,
	WorldCityId
} from '$lib/game/types';
import { applyGameCommand } from '$lib/scenarios/runtime';
import type { ScenarioCommand } from '$lib/scenarios/types';

export type BotId = 'idle' | 'retail-steady' | 'advisor' | 'progression';

export type BotActionOutcome = 'applied' | 'no-op' | 'rejected' | 'unsupported';

export interface BotActionRecord {
	day: number;
	bot: BotId;
	action: string;
	outcome: BotActionOutcome;
	detail?: string;
	/** Exact `ScenarioCommand.kind` issued for this action, when it was one command. */
	commandKind?: ScenarioCommand['kind'];
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
	// The progression bot owns its own founding + ledger shape (it additionally
	// records claims/credit/repayments), so dispatch before the shared loop.
	if (bot === 'progression') {
		const progression = runProgressionBot(archetypeId, seed, days);
		return { game: progression.game, ledger: progression.ledger };
	}
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
	detail?: string,
	commandKind?: ScenarioCommand['kind']
): void {
	const entry: BotActionRecord = { day, bot: ledger.bot, action, outcome };
	if (detail !== undefined) entry.detail = detail;
	if (commandKind !== undefined) entry.commandKind = commandKind;
	ledger.actions.push(entry);
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

// ---------------------------------------------------------------------------
// Progression bot (HPA-318 Step 4). Opt-in: the calibration runner selects it
// explicitly; the three HPA-502 bots above are untouched. It plays only legal
// `applyGameCommand` operations (plus the real `setManagerDelegation`
// transition, like every harness bot), and after EVERY successfully applied
// command — including `advanceDay` — calls the production `claimEarnedTiers`
// on the transition result, mirroring the eventual sandbox route commit.
// ---------------------------------------------------------------------------

export interface ProgressionClaimRecord {
	tierId: ProgressionTierId;
	claimedOnDay: number;
}

export interface ProgressionCreditEvent {
	day: number;
	amount: number;
	termDays: LoanTermDays;
	/** Number of progression claims already held when the loan was taken. */
	claimsAtBorrow: number;
	availableCredit: number;
	grossPrincipalLimit: number;
}

export interface ProgressionRepaymentRecord {
	day: number;
	loanId: string;
	amount: number;
}

export interface ProgressionLedger {
	claims: ProgressionClaimRecord[];
	creditEvents: ProgressionCreditEvent[];
	repayments: ProgressionRepaymentRecord[];
	/** Product ids whose supply plan can no longer reduce a shortage. */
	supplyChainsComplete: Set<ProductId>;
}

/** Plain-data determinism digest: identical for identical seeds. */
export interface ProgressionRunDigest {
	actions: BotActionRecord[];
	claims: ProgressionClaimRecord[];
	creditEvents: ProgressionCreditEvent[];
	repayments: ProgressionRepaymentRecord[];
	finalCash: number;
}

export interface ProgressionRunResult {
	game: GameState;
	ledger: BotLedger;
	progression: ProgressionLedger;
	digest: ProgressionRunDigest;
}

/** The progression bot replans on the same weekly cadence as the advisor. */
export const PROGRESSION_CADENCE_DAYS = ADVISOR_CADENCE_DAYS;

/** Tier 4 requires max-store-level ≥ 4; the bot concentrates upgrades there. */
const PROGRESSION_UPGRADE_TARGET_LEVEL = 4;
/** 84-day term: 12 weekly installments minimize the peak payment, so the
 * engine's repayment-service check approves the most principal. */
const PROGRESSION_CREDIT_TERM_DAYS: LoanTermDays = 84;
/** Supply chains are planned in the starter industry city, deterministically. */
const PROGRESSION_INDUSTRY_CITY: WorldCityId = 'industry-city';
/** Retail supply plans target the starter retail city (its supply assignment
 * exists from founding; later retail cities import until assigned manually). */
const PROGRESSION_HOME_RETAIL_CITY: WorldCityId = 'harbor-city';
/**
 * Up to two industry-linked products this archetype actually stocks, in
 * catalog order — the supply chains the company can sell at all. Electronics
 * stocks none, so its runs plan no chain (a documented calibration blocker
 * for the delivery-goal tier). When a planned product's material is one of
 * the branded finished materials {snacks, drinks, essentials, gifts}
 * (convenience → snacks, boutique → gifts), its city-attributed production
 * movement is also the legal reveal path for quarry-works.
 */
function progressionSupplyProductIds(archetypeId: ArchetypeId): ProductId[] {
	return getArchetype(archetypeId)
		.startingProductIds.filter((productId) => PRODUCTS[productId].productionMaterialId !== null)
		.slice(0, 2);
}

/** Working-capital floor: borrow up to this before planner spending so
 * affordability stalls cannot freeze chain builds and rails for months. */
const PROGRESSION_WORKING_CASH_FLOOR = 2_000;
/** Planner week index (day − 1)/7 when secondary chains (the quarry-works
 * reveal path) start if the primary chain has not exhausted by then —
 * deferring their buildout losses past the measured first-quarter trough. */
const PROGRESSION_SECONDARY_CHAIN_START_WEEK = 13;

function claimNewlyEarnedTiers(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number
): GameState {
	const claimed = claimEarnedTiers(game);
	if (claimed === game) return game;
	for (const claim of claimed.progression.claims.slice(game.progression.claims.length)) {
		progression.claims.push({ tierId: claim.tierId, claimedOnDay: claim.claimedOnDay });
		record(ledger, day, 'claimEarnedTiers', 'applied', claim.tierId);
	}
	return claimed;
}

/** Applies one command, records the outcome, then claims via production code. */
function runProgressionCommand(
	game: GameState,
	command: ScenarioCommand,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number,
	action: string,
	detail?: string
): GameState {
	const result = applyGameCommand(game, command);
	if (!result.ok) {
		record(
			ledger,
			day,
			action,
			'rejected',
			JSON.stringify(
				result.decisionContext ??
					result.financeFailure ??
					result.retailSupplyFailure ??
					result.logisticsFailure ??
					result.decisionFailure ??
					null
			),
			command.kind
		);
		return game;
	}
	record(ledger, day, action, result.changed ? 'applied' : 'no-op', detail, command.kind);
	return claimNewlyEarnedTiers(result.game, ledger, progression, day);
}

function runProgressionDelegation(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number
): GameState {
	const delegated = ensureManagerDelegation(game, ledger, day);
	if (delegated === game) return game;
	return claimNewlyEarnedTiers(delegated, ledger, progression, day);
}

/** Hire and assign to cover each store's staffing requirement; nothing more. */
function runProgressionStaffing(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number
): GameState {
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
				const hired = runProgressionCommand(
					next,
					{ kind: 'hireStaff', candidateId: candidate.id },
					ledger,
					progression,
					day,
					'hireStaff',
					`${role} ${candidate.id}`
				);
				if (hired === next) break;
				next = hired;
				const hire = next.staff
					.filter((member) => member.role === role && member.assignedStoreId === null)
					.sort(byId)[0];
				if (hire) {
					const assigned = runProgressionCommand(
						next,
						{ kind: 'assignStaff', staffId: hire.id, storeId: store.id },
						ledger,
						progression,
						day,
						'assignStaff',
						`${hire.id} -> ${store.id}`
					);
					if (assigned !== next) next = assigned;
				}
			}
		}
	}
	return next;
}

/**
 * Operating reserve: every outstanding loan's next installment (≈ the next 7
 * days of scheduled debt service). The original 20k floor starved all early
 * growth in calibration (founding cash 24k–34k minus a ~9k–30k setup can
 * never clear it), so growth is cash-gated like the HPA-502 playbooks and
 * only scheduled debt service is protected.
 */
function progressionReserve(game: GameState): number {
	return game.finance.loans.reduce((total, loan) => total + estimateNextLoanPayment(loan), 0);
}

/**
 * Credit is a gap-closer, never speculative: borrow the exact whole-dollar
 * shortfall (rounded up to the 1,000 working-capital minimum) on the 84-day
 * term, only when the engine's own assessment covers it.
 */
function borrowProgressionShortfall(
	game: GameState,
	shortfall: number,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number
): GameState {
	const assessment = assessCredit(game, PROGRESSION_CREDIT_TERM_DAYS);
	const amount = Math.max(1_000, Math.ceil(shortfall / 1_000) * 1_000);
	if (shortfall <= 0) {
		record(ledger, day, 'defer-credit', 'no-op', `no shortfall (${shortfall})`);
		return game;
	}
	if (amount > assessment.availableCredit) {
		// The blocker is the rounded borrow amount (whole-dollar shortfall
		// raised to the 1,000 minimum), not the raw shortfall.
		record(
			ledger,
			day,
			'defer-credit',
			'no-op',
			`required ${amount} exceeds available credit ${assessment.availableCredit}`
		);
		return game;
	}
	const borrowed = runProgressionCommand(
		game,
		{ kind: 'borrow', amount, termDays: PROGRESSION_CREDIT_TERM_DAYS },
		ledger,
		progression,
		day,
		'borrow',
		`workingCapital ${amount}`
	);
	if (borrowed === game) return game;
	progression.creditEvents.push({
		day,
		amount,
		termDays: PROGRESSION_CREDIT_TERM_DAYS,
		claimsAtBorrow: game.progression.claims.length,
		availableCredit: assessment.availableCredit,
		grossPrincipalLimit: assessment.grossPrincipalLimit
	});
	return borrowed;
}

/** One planner recommendation per product per planner day, advisor-shaped. */
function executeProgressionPlannerAction(
	game: GameState,
	action: SupplyPlannerAction,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number,
	productId: ProductId
): GameState {
	if (action.kind === 'none') {
		// 'surplus'/'no-demand' mean the chain already serves demand;
		// 'ineffective' means more capacity cannot reduce the shortage — the
		// chain is functionally complete. 'unaffordable'/'no-feasible-action'
		// mean "retry later".
		if (
			action.reason === 'surplus' ||
			action.reason === 'no-demand' ||
			action.reason === 'ineffective'
		) {
			progression.supplyChainsComplete.add(productId);
		}
		record(ledger, day, 'progression:none', 'no-op', `${productId}: ${action.reason}`);
		return game;
	}
	if (
		action.kind === 'create-route' ||
		action.kind === 'edit-route' ||
		action.kind === 'resume-route' ||
		action.kind === 'change-supply-source'
	) {
		record(ledger, day, `progression:${action.kind}`, 'unsupported', JSON.stringify(action));
		return game;
	}
	if (action.kind === 'build-producer' || action.kind === 'build-warehouse') {
		if (action.kind === 'build-warehouse' && action.cityId !== game.activeIndustryCityId) {
			record(
				ledger,
				day,
				'progression:build-warehouse',
				'unsupported',
				`target city ${action.cityId} is not the active industry city`
			);
			return game;
		}
		const buildingTypeId = action.buildingTypeId;
		const tileId = action.tileId ?? findLegalIndustryTile(game, buildingTypeId);
		if (!tileId) {
			record(
				ledger,
				day,
				`progression:${action.kind}`,
				'no-op',
				`no legal tile for ${buildingTypeId}`
			);
			return game;
		}
		return runProgressionCommand(
			game,
			{ kind: 'buildIndustrialBuilding', tileId, buildingTypeId },
			ledger,
			progression,
			day,
			`progression:${action.kind}`,
			`${buildingTypeId} on ${tileId}`
		);
	}
	if (action.kind === 'upgrade-building') {
		return runProgressionCommand(
			game,
			{ kind: 'upgradeIndustrialBuilding', buildingId: action.buildingId },
			ledger,
			progression,
			day,
			'progression:upgrade-building',
			`${action.buildingId} level ${action.fromLevel} -> ${action.toLevel}`
		);
	}
	// connect-rail: the engine's own preview derives the path; buildRail
	// re-validates it inside applyGameCommand. No bespoke pathfinding.
	const preview = buildRailPreview(game, {
		originBuildingId: action.buildingId,
		waypoints: [],
		destinationBuildingId: action.destinationBuildingId
	});
	if (preview.blockReason) {
		record(ledger, day, 'progression:connect-rail', 'no-op', JSON.stringify(preview.blockReason));
		return game;
	}
	return runProgressionCommand(
		game,
		{
			kind: 'buildRail',
			originBuildingId: action.buildingId,
			waypoints: [],
			destinationBuildingId: action.destinationBuildingId
		},
		ledger,
		progression,
		day,
		'progression:connect-rail',
		`${action.buildingId} -> ${action.destinationBuildingId}`
	);
}

function runProgressionSupplyPlan(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number,
	productId: ProductId
): GameState {
	const result = buildSupplyPlan(
		game,
		{ retailCityId: PROGRESSION_HOME_RETAIL_CITY, productId },
		ADVISOR_AVAILABILITY
	);
	if (result.status !== 'ready') {
		record(
			ledger,
			day,
			'progression:plan',
			'no-op',
			`${productId}: ${result.status}: ${result.reason}`
		);
		return game;
	}
	return executeProgressionPlannerAction(
		game,
		result.plan.recommendation.action,
		ledger,
		progression,
		day,
		productId
	);
}

/**
 * City opening: on planner days, the revealed-but-unopened city with the
 * lowest opening cost (tie: lexicographic id), opened cash-first; borrowing
 * only to close the gap to (cost + reserve). Reveal eligibility is never
 * forced — the bot earns reveals through its own builds/stores/reports.
 */
function runProgressionCityOpening(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number
): GameState {
	const opened = new Set(game.world.openedCityIds);
	const candidate = WORLD_CITY_CATALOG.filter(
		(city) =>
			city.openingCost > 0 && !opened.has(city.id) && game.world.revealedCityIds.includes(city.id)
	).sort(
		(left, right) => left.openingCost - right.openingCost || compareWorldCityIds(left.id, right.id)
	)[0];
	if (!candidate) {
		record(ledger, day, 'openWorldCity', 'no-op', 'no revealed unopened city');
		return game;
	}
	const reserve = progressionReserve(game);
	let next = game;
	if (next.cash < candidate.openingCost + reserve) {
		next = borrowProgressionShortfall(
			next,
			candidate.openingCost + reserve - next.cash,
			ledger,
			progression,
			day
		);
		if (next.cash < candidate.openingCost + reserve) {
			record(
				ledger,
				day,
				'openWorldCity',
				'no-op',
				`deferred: ${candidate.id} costs ${candidate.openingCost} with reserve ${reserve} vs cash ${next.cash}`
			);
			return next;
		}
	}
	return runProgressionCommand(
		next,
		{ kind: 'openWorldCity', cityId: candidate.id },
		ledger,
		progression,
		day,
		'openWorldCity',
		`${candidate.id} for ${candidate.openingCost}`
	);
}

/**
 * Store upgrades concentrate on the lowest-id store below the tier-4 target
 * level (one milestone ladder to level 4 satisfies both the tier-2 and tier-4
 * level goals); cash-only, reserve-gated, one per planner day.
 */
function runProgressionStoreUpgrade(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number
): GameState {
	const target = [...game.stores]
		.sort(byId)
		.find((store) => store.level < PROGRESSION_UPGRADE_TARGET_LEVEL);
	if (!target) {
		record(ledger, day, 'upgradeStore', 'no-op', 'all stores at target level');
		return game;
	}
	const cost = getStoreUpgradeCost(target.level);
	const reserve = progressionReserve(game);
	if (game.cash < cost + reserve) {
		record(
			ledger,
			day,
			'upgradeStore',
			'no-op',
			`deferred: ${target.id} level ${target.level} costs ${cost} with reserve ${reserve} vs cash ${game.cash}`
		);
		return game;
	}
	return runProgressionCommand(
		game,
		{ kind: 'upgradeStore', storeId: target.id },
		ledger,
		progression,
		day,
		'upgradeStore',
		`${target.id} level ${target.level} -> ${target.level + 1} for ${cost}`
	);
}

/** Best legal expansion tile across ALL opened retail cities. */
export function bestExpansionCandidate(game: GameState): { city: City; tile: CityTile } | null {
	let best: { city: City; tile: CityTile; score: number } | null = null;
	for (const city of [...game.cities].sort(byId)) {
		const lookup = createCityTileLookup(city);
		const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, lookup);
		for (const tile of city.tiles) {
			if (
				!isTileBuildable(tile) ||
				getStoreFootprintPlacementBlockReason(lookup, tile, occupiedTileIds) !== null
			) {
				continue;
			}
			const score = tile.demand + tile.footTraffic;
			// Ascending city ids + strict improvement give the deterministic
			// tie-break: highest score, then lowest city id, then lowest tile id.
			if (
				!best ||
				score > best.score ||
				(score === best.score && best.city.id === city.id && tile.id < best.tile.id)
			) {
				best = { city, tile, score };
			}
		}
	}
	return best ? { city: best.city, tile: best.tile } : null;
}

/** Expansion: retail-steady's tile rule extended to every opened retail city. */
function runProgressionExpansion(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number,
	archetypeId: ArchetypeId
): GameState {
	if (game.stores.length >= game.storeCap) {
		record(ledger, day, 'openStore', 'no-op', 'store cap reached');
		return game;
	}
	const candidate = bestExpansionCandidate(game);
	if (!candidate) {
		record(ledger, day, 'openStore', 'no-op', 'no legal tile in any opened retail city');
		return game;
	}
	const cost = getExpansionSetupCost(candidate.tile, archetypeId);
	const reserve = progressionReserve(game);
	let next = runProgressionCommand(
		game,
		{ kind: 'selectWorldCity', cityId: candidate.city.id as WorldCityId },
		ledger,
		progression,
		day,
		'selectWorldCity',
		candidate.city.id
	);
	if (next.cash < cost + reserve) {
		next = borrowProgressionShortfall(next, cost + reserve - next.cash, ledger, progression, day);
		if (next.cash < cost + reserve) {
			record(
				ledger,
				day,
				'openStore',
				'no-op',
				`deferred: setup ${cost} with reserve ${reserve} vs cash ${next.cash}`
			);
			return next;
		}
	}
	// Expansion forecast on the PRE-COMMAND game, exactly like retail-steady.
	const expansionEstimate = estimateOpeningRevenue({
		game: next,
		city: candidate.city,
		tileId: candidate.tile.id,
		archetypeId,
		seed: next.seed
	});
	const opened = runProgressionCommand(
		next,
		{ kind: 'openStore', tileId: candidate.tile.id, archetypeId },
		ledger,
		progression,
		day,
		'openStore',
		`${candidate.city.id}/${candidate.tile.id} for ${cost}`
	);
	if (opened === next) return opened;
	const store = opened.stores.find((entry) => entry.tileId === candidate.tile.id)!;
	ledger.openings.push({
		day,
		storeId: store.id,
		tileId: candidate.tile.id,
		archetypeId: store.archetypeId,
		neighborhood: candidate.tile.neighborhood,
		level: store.level,
		forecast: openingForecastFrom(expansionEstimate)
	});
	return opened;
}

/** Close the smallest outstanding loan when cash covers payoff + reserve. */
function runProgressionRepayment(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number
): GameState {
	const target = game.finance.loans
		.filter(isOutstandingLoan)
		.sort(
			(left, right) => left.remainingPrincipal - right.remainingPrincipal || byId(left, right)
		)[0];
	if (!target) {
		record(ledger, day, 'payOffLoan', 'no-op', 'no outstanding loan');
		return game;
	}
	const payoff = getPayoffAmount(target);
	const reserve = progressionReserve(game);
	if (game.cash <= reserve + payoff) {
		record(
			ledger,
			day,
			'payOffLoan',
			'no-op',
			`deferred: ${target.id} payoff ${payoff} with reserve ${reserve} vs cash ${game.cash}`
		);
		return game;
	}
	const paid = runProgressionCommand(
		game,
		{ kind: 'payOffLoan', loanId: target.id },
		ledger,
		progression,
		day,
		'payOffLoan',
		`${target.id} for ${payoff}`
	);
	if (paid !== game) {
		progression.repayments.push({ day, loanId: target.id, amount: payoff });
	}
	return paid;
}

function runProgressionPlanner(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number,
	archetypeId: ArchetypeId
): GameState {
	let next = runProgressionCommand(
		game,
		{ kind: 'selectWorldCity', cityId: PROGRESSION_INDUSTRY_CITY },
		ledger,
		progression,
		day,
		'selectWorldCity',
		PROGRESSION_INDUSTRY_CITY
	);
	// Working-capital floor: borrow the shortfall up to the engine's own
	// assessment so affordability stalls (railRequiresCash at cash < 0 for
	// months) don't freeze the chains. Credit is still gap-closing only.
	if (next.cash < PROGRESSION_WORKING_CASH_FLOOR) {
		next = borrowProgressionShortfall(
			next,
			PROGRESSION_WORKING_CASH_FLOOR - next.cash,
			ledger,
			progression,
			day
		);
	}
	// Supply builds are the cheapest, highest-leverage spend (500–1,500 per
	// building) and the planner is affordability-aware, so plans run FIRST on
	// the planner day — before city/upgrade/expansion cash commits. The first
	// (primary) chain plans weekly; secondary chains (the quarry-works reveal
	// path) start at week 13 or when the primary chain exhausts, whichever is
	// first, keeping the measured first-quarter trough shallow.
	const supplyProductIds = progressionSupplyProductIds(archetypeId);
	supplyProductIds.forEach((productId, index) => {
		if (
			index === 0 ||
			progression.supplyChainsComplete.has(supplyProductIds[0]!) ||
			(day - 1) / PROGRESSION_CADENCE_DAYS >= PROGRESSION_SECONDARY_CHAIN_START_WEEK
		) {
			next = runProgressionSupplyPlan(next, ledger, progression, day, productId);
		}
	});
	next = runProgressionCityOpening(next, ledger, progression, day);
	next = runProgressionStoreUpgrade(next, ledger, progression, day);
	next = runProgressionExpansion(next, ledger, progression, day, archetypeId);
	next = runProgressionRepayment(next, ledger, progression, day);
	return next;
}

function runProgressionDay(
	game: GameState,
	ledger: BotLedger,
	progression: ProgressionLedger,
	day: number,
	archetypeId: ArchetypeId
): GameState {
	let next = runProgressionDelegation(game, ledger, progression, day);
	next = runProgressionStaffing(next, ledger, progression, day);
	if ((day - 1) % PROGRESSION_CADENCE_DAYS === 0) {
		next = runProgressionPlanner(next, ledger, progression, day, archetypeId);
	}
	return next;
}

/**
 * Run the progression bot for an explicit number of days. Identical founding
 * and daily-loop shape to `runBot`; every applied command (including the
 * final `advanceDay`) is followed by the production `claimEarnedTiers`.
 */
export function runProgressionBot(
	archetypeId: ArchetypeId,
	seed: number,
	days: number
): ProgressionRunResult {
	const { game: founded, tile } = createFoundingGame(archetypeId, seed);
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
		bot: 'progression',
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
	const progression: ProgressionLedger = {
		claims: [],
		creditEvents: [],
		repayments: [],
		supplyChainsComplete: new Set()
	};

	let game = founded;
	for (let day = 1; day <= days; day += 1) {
		game = runProgressionDay(game, ledger, progression, day, archetypeId);
		const advanced = applyGameCommand(game, { kind: 'advanceDay' });
		if (!advanced.ok) {
			throw new Error(`advanceDay was rejected on day ${day}; this is a harness bug.`);
		}
		game = claimNewlyEarnedTiers(advanced.game, ledger, progression, day);
	}

	const digest: ProgressionRunDigest = {
		actions: ledger.actions,
		claims: progression.claims,
		creditEvents: progression.creditEvents,
		repayments: progression.repayments,
		finalCash: game.cash
	};
	return { game, ledger, progression, digest };
}
