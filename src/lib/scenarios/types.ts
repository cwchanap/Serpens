import type {
	ArchetypeId,
	CompanyPolicy,
	GameState,
	IndustrialBuildingTypeId,
	LoanTermDays,
	MaterialId,
	ScoreKey,
	WorldCityId
} from '$lib/game/types';
import type { TranslationKey } from '$lib/i18n/translate';

export const SCENARIO_COMMAND_KINDS = [
	'advanceDay',
	'resolveDecision',
	'updatePolicy',
	'openWorldCity',
	'selectWorldCity',
	'openStore',
	'upgradeStore',
	'hireStaff',
	'assignStaff',
	'unassignStaff',
	'promoteStaff',
	'updateStoreSellingPrice',
	'updateStoreInventoryTargets',
	'buildIndustrialBuilding',
	'upgradeIndustrialBuilding',
	'buildRail',
	'upgradeRail',
	'demolishRail',
	'borrow',
	'repayLoan',
	'payOffLoan',
	'refinanceLoan',
	'financeWorldCity',
	'financeRetailStore',
	'financeIndustrialBuilding'
] as const;

/** Largest seed that remains a non-zero Park-Miller RNG state without normalization. */
export const MAX_SCENARIO_SEED = 2_147_483_646;

export type ScenarioId = 'first-profit' | 'import-squeeze' | 'local-lifeline';
export type ScenarioDefinitionKey = `${ScenarioId}@${number}`;
export type ScenarioRunStatus = 'active' | 'completed' | 'failed' | 'abandoned';
export type ScenarioEligibility = 'ranked' | 'unranked';
export type ScenarioMedal = 'bronze' | 'silver' | 'gold';
export type ObjectiveConditionStatus = 'pending' | 'satisfied' | 'missed';
export type FailureConditionStatus = 'inactive' | 'triggered';

export type ScenarioCommand =
	| { kind: 'advanceDay' }
	| { kind: 'resolveDecision'; decisionId: string; optionId: string }
	| { kind: 'updatePolicy'; patch: Partial<CompanyPolicy> }
	| { kind: 'openWorldCity'; cityId: WorldCityId }
	| { kind: 'selectWorldCity'; cityId: WorldCityId }
	| { kind: 'openStore'; tileId: string; archetypeId: ArchetypeId }
	| { kind: 'upgradeStore'; storeId: string }
	| { kind: 'hireStaff'; candidateId: string }
	| { kind: 'assignStaff'; staffId: string; storeId: string }
	| { kind: 'unassignStaff'; staffId: string }
	| { kind: 'promoteStaff'; staffId: string }
	| { kind: 'updateStoreSellingPrice'; storeId: string; categoryId: string; sellingPrice: number }
	| {
			kind: 'updateStoreInventoryTargets';
			storeId: string;
			categoryId: string;
			reorderThreshold: number;
			targetStock: number;
	  }
	| { kind: 'buildIndustrialBuilding'; tileId: string; buildingTypeId: IndustrialBuildingTypeId }
	| { kind: 'upgradeIndustrialBuilding'; buildingId: string }
	| {
			kind: 'buildRail';
			originBuildingId: string;
			waypoints: readonly { x: number; y: number }[];
			destinationBuildingId: string;
	  }
	| { kind: 'upgradeRail'; cityId: string; segmentId: string }
	| { kind: 'demolishRail'; cityId: string; segmentId: string }
	| { kind: 'borrow'; amount: number; termDays: LoanTermDays }
	| { kind: 'repayLoan'; loanId: string; amount: number }
	| { kind: 'payOffLoan'; loanId: string }
	| { kind: 'refinanceLoan'; loanId: string; termDays: LoanTermDays }
	| { kind: 'financeWorldCity'; cityId: WorldCityId; expectedCost: number }
	| {
			kind: 'financeRetailStore';
			tileId: string;
			archetypeId: ArchetypeId;
			expectedCost: number;
	  }
	| {
			kind: 'financeIndustrialBuilding';
			tileId: string;
			buildingTypeId: IndustrialBuildingTypeId;
			expectedCost: number;
	  };

export interface ScenarioStartBlueprint {
	foundingStore: {
		ref: string;
		archetypeId: ArchetypeId;
		cityId: WorldCityId;
		tileId: string;
	};
	industrialBuildings: readonly {
		ref: string;
		typeId: IndustrialBuildingTypeId;
		cityId: WorldCityId;
		tileId: string;
	}[];
	rails: readonly { cityId: WorldCityId; x: number; y: number; level: number }[];
	overrides: {
		cash?: number;
		debt?: number;
		policy?: CompanyPolicy;
		storeCap?: number;
		stores?: readonly {
			storeRef: string;
			targetLevel?: number;
			products?: readonly {
				categoryId: string;
				stock: number;
				reorderThreshold: number;
				targetStock: number;
				sellingPrice: number;
			}[];
		}[];
		buildingInventories?: readonly {
			buildingRef: string;
			materials: Partial<Record<MaterialId, number>>;
		}[];
		warehouseMaterials?: Partial<Record<MaterialId, number>>;
		world?: {
			revealedCityIds: readonly WorldCityId[];
			openedCityIds: readonly WorldCityId[];
			activeRetailCityId: WorldCityId;
			activeIndustryCityId: WorldCityId;
		};
	};
}

export type ScenarioMetricWindow =
	| { kind: 'current' }
	| { kind: 'run-to-date' }
	| { kind: 'trailing-reports'; count: number }
	| { kind: 'fixed-report-days'; startDay: number; endDay: number };

export type ScenarioMetricQuery =
	| { metric: 'cash' }
	| { metric: 'daily-net-income' }
	| { metric: 'cumulative-net-income' }
	| { metric: 'consecutive-positive-net-income-reports' }
	| { metric: 'completed-retail-import-cycles' }
	| { metric: 'retail-import-spend'; categoryIds: readonly string[] }
	| { metric: 'retail-imported-units'; categoryIds: readonly string[] }
	| { metric: 'retail-local-units'; categoryIds: readonly string[] }
	| { metric: 'retail-local-share'; categoryIds: readonly string[] }
	| { metric: 'units-sold'; categoryIds: readonly string[] }
	| { metric: 'demand-missed'; categoryIds: readonly string[] }
	| { metric: 'scorecard'; score: ScoreKey }
	| { metric: 'store-count' }
	| { metric: 'industrial-building-count'; buildingTypeIds: readonly IndustrialBuildingTypeId[] }
	| { metric: 'warehouse-quantity'; materialId: MaterialId };

export type ScenarioComparator = 'lt' | 'lte' | 'eq' | 'gte' | 'gt';

export interface ScenarioCondition {
	id: string;
	labelKey: TranslationKey;
	query: ScenarioMetricQuery;
	comparator: ScenarioComparator;
	target: number;
	window: ScenarioMetricWindow;
	requiresCompleteWindow?: boolean;
}

export interface ObjectiveEvidence {
	conditionId: string;
	metric: ScenarioMetricQuery['metric'];
	comparator: ScenarioComparator;
	target: number;
	actual: number;
	day: number;
	window: ScenarioMetricWindow;
	windowComplete: boolean;
	contributingIds: string[];
}

export interface ScenarioDefinitionRef {
	scenarioId: ScenarioId;
	version: number;
}

export type ScenarioModifier = {
	kind: 'import-cost-multiplier';
	scope: 'retail-product' | 'industrial-material';
	target: { kind: 'all' } | { kind: 'ids'; ids: readonly string[] };
	multiplier: number;
};

export interface ScenarioContentRules {
	cityIds: readonly WorldCityId[];
	archetypeIds: readonly ArchetypeId[];
	productCategoryIds: readonly string[];
	materialIds: readonly MaterialId[];
	buildingTypeIds: readonly IndustrialBuildingTypeId[];
	retailPlacements: readonly {
		cityId: WorldCityId;
		tileId: string;
		archetypeId: ArchetypeId;
	}[];
	industrialPlacements: readonly {
		cityId: WorldCityId;
		tileId: string;
		buildingTypeId: IndustrialBuildingTypeId;
	}[];
}

export type ScenarioScoreComponent =
	| { kind: 'optional-objective'; objectiveId: string; points: number }
	| {
			kind: 'metric';
			query: ScenarioMetricQuery;
			window: ScenarioMetricWindow;
			zeroBonusAt: number;
			fullBonusAt: number;
			points: number;
	  }
	| {
			kind: 'remaining-days';
			zeroBonusAt: number;
			fullBonusAt: number;
			points: number;
	  };

export interface ScenarioDefinition {
	id: ScenarioId;
	version: number;
	titleKey: TranslationKey;
	summaryKey: TranslationKey;
	briefingKey: TranslationKey;
	strategyHintKey: TranslationKey;
	officialSeed: number;
	dayLimit: number;
	start: ScenarioStartBlueprint;
	content: ScenarioContentRules;
	allowedCommands: readonly ScenarioCommand['kind'][];
	modifiers: readonly ScenarioModifier[];
	requiredObjectives: readonly ScenarioCondition[];
	optionalObjectives: readonly ScenarioCondition[];
	failures: readonly ScenarioCondition[];
	scoreComponents: readonly ScenarioScoreComponent[];
	medalThresholds: { silver: number; gold: number };
}

export interface ScenarioObjectiveEvaluation {
	conditionId: string;
	status: ObjectiveConditionStatus;
	evidence: ObjectiveEvidence;
}

export interface ScenarioFailureEvaluation {
	conditionId: string;
	status: FailureConditionStatus;
	evidence: ObjectiveEvidence;
}

export interface ScenarioDeadlineEvidence {
	conditionId: 'deadline-exceeded';
	day: number;
	dayLimit: number;
}

export type ScenarioRiskProjection =
	| { kind: 'condition'; conditionId: string; distance: number; triggered: boolean }
	| { kind: 'deadline'; daysRemaining: number; triggered: boolean };

export interface ScenarioMetricScoreEvidence {
	kind: 'metric';
	query: ScenarioMetricQuery;
	window: ScenarioMetricWindow;
	/**
	 * Canonical persisted scoring input for result-only best records. Decoding recomputes derived
	 * points, score, and medal from this value, but cannot authenticate coordinated rewrites.
	 */
	actual: number;
	day: number;
	windowComplete: boolean;
}

export interface ScenarioScoreProjection {
	score: number;
	medal: ScenarioMedal;
	componentPoints: number[];
	componentEvidence: Array<ScenarioMetricScoreEvidence | null>;
}

export interface ScenarioEvaluation {
	day: number;
	required: ScenarioObjectiveEvaluation[];
	optional: ScenarioObjectiveEvaluation[];
	failures: ScenarioFailureEvaluation[];
	deadline: { triggered: boolean; evidence: ScenarioDeadlineEvidence } | null;
	risks: ScenarioRiskProjection[];
	projection: ScenarioScoreProjection;
}

export interface ScenarioResult {
	definition: ScenarioDefinitionRef;
	seed: number;
	eligibility: ScenarioEligibility;
	outcome: 'completed' | 'failed' | 'abandoned';
	completionDay: number;
	score: number;
	medal: ScenarioMedal | null;
	evaluation: ScenarioEvaluation;
}

export interface ScenarioRun {
	runId: string;
	definition: ScenarioDefinitionRef;
	seed: number;
	eligibility: ScenarioEligibility;
	status: ScenarioRunStatus;
	game: GameState;
	evaluation: ScenarioEvaluation;
	result: ScenarioResult | null;
}

export interface ScenarioDiagnostic {
	code: string;
	path: string;
	value: unknown;
	detail: string;
}

export type ScenarioOperationErrorCode =
	| 'invalid-definition'
	| 'invalid-share-code'
	| 'forbidden-command'
	| 'forbidden-content'
	| 'invalid-command'
	| 'stale-definition'
	| 'persistence-read-failed'
	| 'persistence-write-failed'
	| 'terminal-run'
	| 'missing-run'
	| 'setup-invariant-failed';

export interface ScenarioOperationError {
	code: ScenarioOperationErrorCode;
	diagnostics: ScenarioDiagnostic[];
}

export type ScenarioOperationResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: ScenarioOperationError };

export interface ScenarioRunRecord {
	scenarioSchemaVersion: number;
	gameSchemaVersion: number;
	/**
	 * Monotonic write counter incremented by the repository on every successful
	 * persist of this scenario's active run. Used as a compare-and-swap token so
	 * two tabs resuming the same run (which share the same `runId`) cannot
	 * silently roll back each other's progress: a tab that loaded at revision N
	 * passes `expectedRevision: N`, and the repository refuses the write if the
	 * stored revision has advanced. `0` means the record was decoded from a
	 * pre-revision payload (in-development save) and has not been re-written
	 * since; the next write sets it to `1`.
	 */
	revision: number;
	run: Omit<ScenarioRun, 'game'>;
	game: unknown;
}

/**
 * A run loaded from persistence together with its stored `revision`, so the
 * controller can bind subsequent writes to the revision it observed. Returned
 * by `loadActiveRunWithRevision`.
 */
export interface LoadedScenarioRun {
	run: ScenarioRun;
	revision: number;
}

/**
 * A result-only best record. Its persisted condition actuals and score-component evidence are the
 * canonical sources used to derive statuses, points, score, and medal for internal consistency
 * checks; unlike a game-backed run, it cannot be re-evaluated against runtime state or treated as
 * tamper-proof.
 */
export interface ScenarioBestResultRecord {
	scenarioSchemaVersion: number;
	result: ScenarioResult;
}

export interface ScenarioStoreSnapshot {
	schemaVersion: number;
	activeRunsByScenarioId: Partial<Record<ScenarioId, ScenarioRunRecord>>;
	bestResultsByDefinitionKey: Partial<Record<ScenarioDefinitionKey, ScenarioBestResultRecord>>;
}

export interface ScenarioPersistenceSummary {
	activeRunsByScenarioId: Partial<Record<ScenarioId, ScenarioRun>>;
	bestResultsByDefinitionKey: Partial<Record<ScenarioDefinitionKey, ScenarioResult>>;
	diagnostics: ScenarioDiagnostic[];
}

export interface ScenarioCommitOutcome {
	activeRun: ScenarioRun | null;
	terminalResult: ScenarioResult | null;
	bestUpdated: boolean;
}
