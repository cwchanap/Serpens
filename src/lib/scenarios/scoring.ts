import type { GameState } from '$lib/game/types';
import { evaluateMetric } from './metrics';
import type {
	ScenarioDefinition,
	ScenarioEvaluation,
	ScenarioMedal,
	ScenarioResult,
	ScenarioRunStatus,
	ScenarioScoreProjection
} from './types';

function normalizePoints(actual: number, zeroAt: number, fullAt: number, points: number): number {
	if (zeroAt === fullAt) return actual >= fullAt ? points : 0;
	const ratio = (actual - zeroAt) / (fullAt - zeroAt);
	return Math.round(Math.min(1, Math.max(0, ratio)) * points);
}

function componentPoints(
	definition: ScenarioDefinition,
	game: GameState,
	evaluation: Omit<ScenarioEvaluation, 'projection'>
): number[] {
	return definition.scoreComponents.map((component) => {
		switch (component.kind) {
			case 'optional-objective':
				return evaluation.optional.some(
					(objective) =>
						objective.conditionId === component.objectiveId && objective.status === 'satisfied'
				)
					? component.points
					: 0;
			case 'metric': {
				const metric = evaluateMetric(game, component.query, component.window);
				return normalizePoints(
					metric.actual,
					component.zeroBonusAt,
					component.fullBonusAt,
					component.points
				);
			}
			case 'remaining-days':
				return normalizePoints(
					definition.dayLimit - game.day,
					component.zeroBonusAt,
					component.fullBonusAt,
					component.points
				);
		}
	});
}

export function calculateScenarioScore(
	definition: ScenarioDefinition,
	game: GameState,
	evaluation: Omit<ScenarioEvaluation, 'projection'>
): number {
	const score = componentPoints(definition, game, evaluation).reduce(
		(total, points) => total + points,
		500
	);
	return Math.min(1000, Math.max(0, score));
}

export function calculateScenarioScoreProjection(
	definition: ScenarioDefinition,
	game: GameState,
	evaluation: Omit<ScenarioEvaluation, 'projection'>
): ScenarioScoreProjection {
	const points = componentPoints(definition, game, evaluation);
	const score = Math.min(
		1000,
		Math.max(
			0,
			points.reduce((total, component) => total + component, 500)
		)
	);
	return {
		score,
		medal: medalForScore(definition, 'completed', score)!,
		componentPoints: points
	};
}

export function medalForScore(
	definition: ScenarioDefinition,
	status: ScenarioRunStatus,
	score: number
): ScenarioMedal | null {
	if (status !== 'completed') return null;
	if (score >= definition.medalThresholds.gold) return 'gold';
	if (score >= definition.medalThresholds.silver) return 'silver';
	return 'bronze';
}

export function pointsToNextMedal(
	definition: ScenarioDefinition,
	score: number
): { medal: 'silver' | 'gold'; points: number } | null {
	if (score < definition.medalThresholds.silver) {
		return { medal: 'silver', points: definition.medalThresholds.silver - score };
	}
	if (score < definition.medalThresholds.gold) {
		return { medal: 'gold', points: definition.medalThresholds.gold - score };
	}
	return null;
}

export function shouldReplaceBestResult(
	existing: ScenarioResult | null,
	candidate: ScenarioResult
): boolean {
	if (candidate.outcome !== 'completed' || candidate.eligibility !== 'ranked') return false;
	if (!existing) return true;
	if (
		existing.definition.scenarioId !== candidate.definition.scenarioId ||
		existing.definition.version !== candidate.definition.version
	)
		return false;
	return candidate.score > existing.score;
}
