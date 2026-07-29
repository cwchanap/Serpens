import { buildIndustrialBuilding, upgradeBuilding } from '$lib/game/industryPlacement';
import {
	borrow,
	payOffLoan,
	refinanceLoan,
	repayLoan,
	type FinanceActionResult,
	type FinanceFailureCode
} from '$lib/game/finance';
import { openStoreAtTile } from '$lib/game/placement';
import { financeRetailStoreOpening } from '$lib/game/placement';
import { buildRail, demolishRailSegment, upgradeRailSegment } from '$lib/game/railPlacement';
import { normalizeSeed } from '$lib/game/rng';
import { simulateDay } from '$lib/game/simulateDay';
import type { SimulationRules } from '$lib/game/simulationRules';
import { assignStaffToStore, hireCandidate, promoteStaff, unassignStaff } from '$lib/game/staffing';
import { resolveDecision, updatePolicy, upgradeStore } from '$lib/game/state';
import { updateStoreProduct } from '$lib/game/stock';
import type { GameState } from '$lib/game/types';
import { financeWorldCityOpening, openWorldCity, selectWorldCity } from '$lib/game/world';
import { financeIndustrialBuilding } from '$lib/game/industryPlacement';
import { deeplyEqual } from '$lib/game/equality';
import { isScenarioCommandAllowed } from './capabilities';
import { evaluateScenarioConditions } from './metrics';
import { calculateScenarioScoreProjection, medalForScore } from './scoring';
import { buildScenarioGame } from './setup';
import type {
	ScenarioCommand,
	ScenarioDefinition,
	ScenarioDiagnostic,
	ScenarioEvaluation,
	ScenarioOperationResult,
	ScenarioResult,
	ScenarioRun
} from './types';

export type ExecuteScenarioCommandResult =
	| { ok: true; changed: false; run: ScenarioRun }
	| { ok: true; changed: true; run: ScenarioRun }
	| {
			ok: false;
			code:
				| 'forbidden-command'
				| 'forbidden-content'
				| 'invalid-command'
				| 'terminal-run'
				| 'stale-definition';
			financeFailure?: {
				code: FinanceFailureCode;
				context: Record<string, string | number>;
			};
	  };

export type ScenarioStartResult = ScenarioOperationResult<ScenarioRun>;

function withScoreProjection(
	definition: ScenarioDefinition,
	game: GameState,
	conditions: Omit<ScenarioEvaluation, 'projection'>
): ScenarioEvaluation {
	return {
		...conditions,
		projection: calculateScenarioScoreProjection(definition, game, conditions)
	};
}

export function evaluateScenario(
	definition: ScenarioDefinition,
	game: GameState,
	terminal: boolean
): ScenarioEvaluation {
	const conditions = evaluateScenarioConditions(definition, game, terminal);
	return withScoreProjection(definition, game, conditions);
}

function setupErrorCode(diagnostics: readonly ScenarioDiagnostic[]) {
	return diagnostics.some((diagnostic) => diagnostic.code === 'setup-invariant-failed')
		? ('setup-invariant-failed' as const)
		: ('invalid-definition' as const);
}

export function startScenario(definition: ScenarioDefinition, seed: number): ScenarioStartResult {
	const normalizedSeed = normalizeSeed(seed);
	const built = buildScenarioGame(definition, normalizedSeed);
	if (!built.ok) {
		return {
			ok: false,
			error: {
				code: setupErrorCode(built.diagnostics),
				diagnostics: built.diagnostics
			}
		};
	}

	return {
		ok: true,
		value: {
			runId: crypto.randomUUID(),
			definition: { scenarioId: definition.id, version: definition.version },
			seed: normalizedSeed,
			eligibility: normalizedSeed === definition.officialSeed ? 'ranked' : 'unranked',
			status: 'active',
			game: built.game,
			evaluation: evaluateScenario(definition, built.game, false),
			result: null
		}
	};
}

function staleDefinitionDiagnostic(
	run: ScenarioRun,
	definition: ScenarioDefinition
): ScenarioDiagnostic {
	return {
		code: 'stale-definition',
		path: 'definition',
		value: {
			run: run.definition,
			provided: { scenarioId: definition.id, version: definition.version }
		},
		detail: 'The provided definition does not match the run definition reference.'
	};
}

function definitionMatchesRun(run: ScenarioRun, definition: ScenarioDefinition): boolean {
	return (
		run.definition.scenarioId === definition.id && run.definition.version === definition.version
	);
}

export function restartScenario(
	run: ScenarioRun,
	definition: ScenarioDefinition
): ScenarioStartResult {
	if (!definitionMatchesRun(run, definition)) {
		return {
			ok: false,
			error: {
				code: 'stale-definition',
				diagnostics: [staleDefinitionDiagnostic(run, definition)]
			}
		};
	}
	return startScenario(definition, run.seed);
}

function freezeAbandonedEvaluation(evaluation: ScenarioEvaluation): ScenarioEvaluation {
	return {
		...evaluation,
		required: evaluation.required.map((objective) =>
			objective.status === 'pending' ? { ...objective, status: 'missed' as const } : objective
		),
		optional: evaluation.optional.map((objective) =>
			objective.status === 'pending' ? { ...objective, status: 'missed' as const } : objective
		)
	};
}

export function abandonScenario(run: ScenarioRun): ScenarioRun {
	if (run.status !== 'active' || run.result !== null) return run;
	const evaluation = freezeAbandonedEvaluation(run.evaluation);
	const result: ScenarioResult = {
		definition: run.definition,
		seed: run.seed,
		eligibility: run.eligibility,
		outcome: 'abandoned',
		completionDay: run.game.day,
		score: evaluation.projection.score,
		medal: null,
		evaluation
	};
	return {
		...run,
		status: 'abandoned',
		evaluation,
		result
	};
}

function compileSimulationRules(definition: ScenarioDefinition): SimulationRules {
	return {
		importCostMultipliers: definition.modifiers.map((modifier) => ({
			scope: modifier.scope,
			target:
				modifier.target.kind === 'all'
					? { kind: 'all' as const }
					: { kind: 'ids' as const, ids: [...modifier.target.ids] },
			multiplier: modifier.multiplier
		}))
	};
}

type FinanceActionFailure = Extract<FinanceActionResult<unknown>, { ok: false }>;
type ScenarioDispatchResult = GameState | FinanceActionFailure;

function dispatchScenarioCommand(
	game: GameState,
	definition: ScenarioDefinition,
	command: ScenarioCommand
): ScenarioDispatchResult {
	switch (command.kind) {
		case 'advanceDay':
			return simulateDay(game, compileSimulationRules(definition));
		case 'resolveDecision':
			return resolveDecision(game, command.decisionId, command.optionId);
		case 'updatePolicy':
			return updatePolicy(game, command.patch);
		case 'openWorldCity':
			return openWorldCity(game, command.cityId);
		case 'selectWorldCity':
			return selectWorldCity(game, command.cityId);
		case 'openStore':
			return openStoreAtTile(game, {
				tileId: command.tileId,
				archetypeId: command.archetypeId
			});
		case 'upgradeStore':
			return upgradeStore(game, command.storeId);
		case 'hireStaff':
			return hireCandidate(game, command.candidateId);
		case 'assignStaff':
			return assignStaffToStore(game, command.staffId, command.storeId);
		case 'unassignStaff':
			return unassignStaff(game, command.staffId);
		case 'promoteStaff':
			return promoteStaff(game, command.staffId);
		case 'updateStoreSellingPrice':
			return updateStoreProduct(game, command.storeId, command.categoryId, {
				sellingPrice: command.sellingPrice
			});
		case 'updateStoreInventoryTargets':
			return updateStoreProduct(game, command.storeId, command.categoryId, {
				reorderThreshold: command.reorderThreshold,
				targetStock: command.targetStock
			});
		case 'buildIndustrialBuilding':
			return buildIndustrialBuilding(game, {
				tileId: command.tileId,
				buildingTypeId: command.buildingTypeId
			});
		case 'upgradeIndustrialBuilding':
			return upgradeBuilding(game, command.buildingId);
		case 'buildRail':
			return buildRail(game, {
				originBuildingId: command.originBuildingId,
				waypoints: [...command.waypoints],
				destinationBuildingId: command.destinationBuildingId
			});
		case 'upgradeRail':
			return upgradeRailSegment(game, command.cityId, command.segmentId);
		case 'demolishRail':
			return demolishRailSegment(game, command.cityId, command.segmentId);
		case 'borrow': {
			const result = borrow(game, {
				purpose: 'workingCapital',
				amount: command.amount,
				termDays: command.termDays
			});
			return result.ok ? result.game : result;
		}
		case 'repayLoan': {
			const result = repayLoan(game, { loanId: command.loanId, amount: command.amount });
			return result.ok ? result.game : result;
		}
		case 'payOffLoan': {
			const result = payOffLoan(game, command.loanId);
			return result.ok ? result.game : result;
		}
		case 'refinanceLoan': {
			const result = refinanceLoan(game, { loanId: command.loanId, termDays: command.termDays });
			return result.ok ? result.game : result;
		}
		case 'financeWorldCity': {
			const result = financeWorldCityOpening(game, command);
			return result.ok ? result.game : result;
		}
		case 'financeRetailStore': {
			const result = financeRetailStoreOpening(game, command);
			return result.ok ? result.game : result;
		}
		case 'financeIndustrialBuilding': {
			const result = financeIndustrialBuilding(game, command);
			return result.ok ? result.game : result;
		}
	}
}

function terminalRun(
	run: ScenarioRun,
	definition: ScenarioDefinition,
	game: GameState,
	status: 'completed' | 'failed'
): ScenarioRun {
	const evaluation = evaluateScenario(definition, game, true);
	const result: ScenarioResult = {
		definition: run.definition,
		seed: run.seed,
		eligibility: run.eligibility,
		outcome: status,
		completionDay: game.day,
		score: evaluation.projection.score,
		medal: medalForScore(definition, status, evaluation.projection.score),
		evaluation
	};
	return {
		...run,
		status,
		game,
		evaluation,
		result
	};
}

export function executeScenarioCommand(
	run: ScenarioRun,
	definition: ScenarioDefinition,
	command: ScenarioCommand
): ExecuteScenarioCommandResult {
	if (!definitionMatchesRun(run, definition)) return { ok: false, code: 'stale-definition' };
	if (run.status !== 'active' || run.result !== null) return { ok: false, code: 'terminal-run' };

	const capability = isScenarioCommandAllowed(definition, run, command);
	if (!capability.allowed) return { ok: false, code: capability.code };

	let game: GameState;
	try {
		const dispatched = dispatchScenarioCommand(run.game, definition, command);
		if ('ok' in dispatched) {
			return {
				ok: false,
				code: 'invalid-command',
				financeFailure: { code: dispatched.code, context: dispatched.context }
			};
		}
		game = dispatched;
	} catch {
		// The command passed capability/content checks but the transition itself
		// rejected it (e.g. openStoreAtTile throws on a locked/occupied tile, or
		// buildIndustrialBuilding throws on an invalid placement). Surface this as
		// a rejected command instead of letting it propagate to the controller's
		// catch-all, which would mislabel a state-validation error as a
		// persistence-write failure and offer a pointless retry.
		return { ok: false, code: 'invalid-command' };
	}
	if (deeplyEqual(run.game, game)) return { ok: true, changed: false, run };

	const conditions = evaluateScenarioConditions(definition, game, false);
	const failed = conditions.failures.some((failure) => failure.status === 'triggered');
	const completed = conditions.required.every((objective) => objective.status === 'satisfied');

	if (failed) {
		return { ok: true, changed: true, run: terminalRun(run, definition, game, 'failed') };
	}
	if (completed) {
		return { ok: true, changed: true, run: terminalRun(run, definition, game, 'completed') };
	}
	if (command.kind === 'advanceDay' && conditions.deadline?.triggered) {
		return { ok: true, changed: true, run: terminalRun(run, definition, game, 'failed') };
	}
	const evaluation = withScoreProjection(definition, game, conditions);

	return {
		ok: true,
		changed: true,
		run: {
			...run,
			game,
			evaluation,
			result: null
		}
	};
}
