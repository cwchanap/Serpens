import type {
	ScenarioCommitOutcome,
	ScenarioId,
	ScenarioPersistenceSummary,
	ScenarioRun
} from '$lib/scenarios/types';

export interface ScenarioRepository {
	getSummary(): Promise<ScenarioPersistenceSummary>;
	loadActiveRun(scenarioId: ScenarioId): Promise<ScenarioRun | null>;
	saveActiveRun(run: ScenarioRun): Promise<ScenarioCommitOutcome>;
	removeActiveRun(scenarioId: ScenarioId): Promise<void>;
	commitTerminalRun(run: ScenarioRun): Promise<ScenarioCommitOutcome>;
}
