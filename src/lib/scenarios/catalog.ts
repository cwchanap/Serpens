import type {
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioDiagnostic,
	ScenarioId
} from './types';

export const SCENARIO_CATALOG = [] as const satisfies readonly ScenarioDefinition[];

export interface ScenarioCatalogEntry {
	definition: ScenarioDefinition;
	available: boolean;
	diagnostics: ScenarioDiagnostic[];
}

export function listScenarioCatalogEntries(): readonly ScenarioCatalogEntry[] {
	return [];
}

export function listCurrentScenarioDefinitions(): readonly ScenarioDefinition[] {
	return SCENARIO_CATALOG;
}

export function resolveScenarioDefinition(
	ref: ScenarioDefinitionRef
): ScenarioDefinition | undefined {
	void ref;
	return undefined;
}

export function currentScenarioDefinition(scenarioId: ScenarioId): ScenarioDefinition | undefined {
	void scenarioId;
	return undefined;
}
