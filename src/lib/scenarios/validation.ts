import { STARTER_STORE_CAP, createInitialWorldProgress } from '$lib/game/world';
import { MAX_SCENARIO_SEED, type ScenarioDefinition, type ScenarioDiagnostic } from './types';
import type { JsonObject, ValidationContext } from './validation/shared';
import {
	DEFINITION_KEYS,
	SUPPORTED_DEFINITION_VERSION,
	closedObject,
	diagnostic,
	nonEmptyString,
	sortScenarioDiagnostics
} from './validation/shared';
import { validateContent } from './validation/content';
import { validateCommands, validateModifiers } from './validation/commands';
import { validateStart } from './validation/start';
import { validateConditions } from './validation/conditions';
import { validateScores } from './validation/scores';

export { sortScenarioDiagnostics, validateScenarioSetupReserve } from './validation/shared';
export {
	validateCityInventoryCapacities,
	validateRetailSupplyAssignments
} from './validation/cityInventory';

function validateDefinitionIdentity(context: ValidationContext, definition: JsonObject): void {
	if (
		typeof definition.id !== 'string' ||
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id) ||
		definition.id.includes('.')
	) {
		diagnostic(
			context,
			'id',
			'invalid-scenario-id',
			definition.id,
			'Scenario IDs must use lowercase kebab case without dots.'
		);
	}
	if (definition.version !== SUPPORTED_DEFINITION_VERSION) {
		diagnostic(
			context,
			'version',
			'unsupported-version',
			definition.version,
			`Only scenario definition version ${SUPPORTED_DEFINITION_VERSION} is supported.`
		);
	}
	if (
		!Number.isInteger(definition.officialSeed) ||
		typeof definition.officialSeed !== 'number' ||
		definition.officialSeed < 1 ||
		definition.officialSeed > MAX_SCENARIO_SEED
	) {
		diagnostic(
			context,
			'officialSeed',
			'invalid-seed',
			definition.officialSeed,
			`Scenario seeds must be integers from 1 through ${MAX_SCENARIO_SEED}.`
		);
	} else {
		context.officialSeed = definition.officialSeed;
	}
	if (
		typeof definition.dayLimit !== 'number' ||
		!Number.isInteger(definition.dayLimit) ||
		definition.dayLimit <= 0
	) {
		diagnostic(
			context,
			'dayLimit',
			'invalid-positive-integer',
			definition.dayLimit,
			'The day limit must be a positive integer.'
		);
	} else {
		context.dayLimit = definition.dayLimit;
	}
	for (const key of ['titleKey', 'summaryKey', 'briefingKey', 'strategyHintKey']) {
		nonEmptyString(context, definition[key], key);
	}
}

export function validateScenarioDefinition(definition: unknown): ScenarioDiagnostic[] {
	const initialWorld = createInitialWorldProgress();
	const context: ValidationContext = {
		diagnostics: [],
		content: {
			cities: new Set(),
			archetypes: new Set(),
			products: new Set(),
			materials: new Set(),
			buildingTypes: new Set()
		},
		allowedCommands: new Set(),
		optionalObjectiveIds: new Set(),
		permittedRetailPlacements: [],
		storeCap: STARTER_STORE_CAP,
		startBuildingPlacements: [],
		permittedBuildingPlacements: [],
		railBuildingGraph: new Map(),
		authoredRailsByCity: new Map(),
		revealedCityIds: new Set(initialWorld.revealedCityIds),
		openedCityIds: new Set(initialWorld.openedCityIds),
		cities: new Map()
	};
	const root = closedObject(context, definition, '', DEFINITION_KEYS);
	if (!root) return sortScenarioDiagnostics(context.diagnostics);
	context.definition = root;
	validateDefinitionIdentity(context, root);
	validateContent(context, root.content);
	validateCommands(context, root.allowedCommands);
	validateStart(context, root.start);
	validateModifiers(context, root.modifiers);
	validateConditions(context, root);
	validateScores(context, root);
	return sortScenarioDiagnostics(context.diagnostics);
}

export function assertValidScenarioDefinition(
	definition: unknown
): asserts definition is ScenarioDefinition {
	const diagnostics = validateScenarioDefinition(definition);
	if (diagnostics.length === 0) return;
	const error = new Error(
		`Invalid scenario definition (${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}).`
	) as Error & {
		diagnostics: ScenarioDiagnostic[];
	};
	error.name = 'ScenarioDefinitionValidationError';
	error.diagnostics = diagnostics;
	throw error;
}
