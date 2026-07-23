import { isImportDay } from '$lib/game/stock';
import type { DailyReport, GameState } from '$lib/game/types';
import type {
	ObjectiveEvidence,
	ScenarioComparator,
	ScenarioCondition,
	ScenarioDefinition,
	ScenarioDiagnostic,
	ScenarioEvaluation,
	ScenarioMetricQuery,
	ScenarioMetricWindow
} from './types';

export interface MetricEvaluation {
	actual: number;
	contributingIds: string[];
	windowComplete: boolean;
}

type MetricId = ScenarioMetricQuery['metric'];
type WindowKind = ScenarioMetricWindow['kind'];

interface MetricValue {
	actual: number;
	contributingIds: string[];
}

interface MetricContext {
	game: GameState;
	query: ScenarioMetricQuery;
	window: ScenarioMetricWindow;
	reports: readonly DailyReport[];
}

interface MetricRegistration {
	supportedWindows: ReadonlySet<WindowKind>;
	neutral: number;
	isComplete: (context: MetricContext) => boolean;
	evaluate: (context: MetricContext) => MetricValue;
}

interface ProductContribution {
	id: string;
	importSpend: number;
	importedUnits: number;
	warehouseUnits: number;
	unitsSold: number;
	demandMissed: number;
}

const CURRENT = new Set<WindowKind>(['current']);
const RUN_TO_DATE = new Set<WindowKind>(['run-to-date']);
const REPORT_WINDOWS = new Set<WindowKind>([
	'current',
	'run-to-date',
	'trailing-reports',
	'fixed-report-days'
]);
const AGGREGATE_REPORT_WINDOWS = new Set<WindowKind>([
	'run-to-date',
	'trailing-reports',
	'fixed-report-days'
]);
export function compareScenarioEvidenceIds(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}

export function areScenarioEvidenceIdsCanonical(ids: readonly string[]): boolean {
	return ids.every(
		(id, index) => index === 0 || compareScenarioEvidenceIds(ids[index - 1]!, id) < 0
	);
}

function sortedIds(ids: readonly string[]): string[] {
	return [...new Set(ids)].sort(compareScenarioEvidenceIds);
}

function stateMetricComplete(): boolean {
	return true;
}

function reportMetricComplete({ window, reports }: MetricContext): boolean {
	switch (window.kind) {
		case 'current':
			return reports.length === 1;
		case 'run-to-date':
			return true;
		case 'trailing-reports':
			return reports.length === window.count;
		case 'fixed-report-days': {
			const days = new Set(reports.map((report) => report.day));
			for (let day = window.startDay; day <= window.endDay; day += 1) {
				if (!days.has(day)) return false;
			}
			return true;
		}
	}
}

function reportIds(reports: readonly DailyReport[]): string[] {
	return sortedIds(reports.map((report) => reportEvidenceId(report.day)));
}

function sumReports(
	reports: readonly DailyReport[],
	getValue: (report: DailyReport) => number
): number {
	return reports.reduce((sum, report) => sum + getValue(report), 0);
}

function averageNetIncome(reports: readonly DailyReport[], neutral: number): MetricValue {
	if (reports.length === 0) return { actual: neutral, contributingIds: [] };
	return {
		actual: Math.round(sumReports(reports, (report) => report.netIncome) / reports.length),
		contributingIds: reportIds(reports)
	};
}

function categoryIds(query: ScenarioMetricQuery): ReadonlySet<string> {
	return new Set('categoryIds' in query ? query.categoryIds : []);
}

function productContributions(context: MetricContext): ProductContribution[] {
	const included = categoryIds(context.query);
	const contributions: ProductContribution[] = [];

	for (const report of context.reports) {
		for (const storeReport of report.storeReports) {
			for (const productReport of storeReport.productReports) {
				if (!included.has(productReport.categoryId)) continue;
				contributions.push({
					id: productEvidenceId(report.day, storeReport.storeId, productReport.categoryId),
					importSpend: productReport.importSpend,
					importedUnits: productReport.importedUnits,
					warehouseUnits: productReport.warehouseUnits,
					unitsSold: productReport.unitsSold,
					demandMissed: productReport.demandMissed
				});
			}
		}
	}

	return contributions.sort((first, second) => compareScenarioEvidenceIds(first.id, second.id));
}

function sumProductMetric(
	context: MetricContext,
	getValue: (contribution: ProductContribution) => number
): MetricValue {
	const contributions = productContributions(context);
	return {
		actual: contributions.reduce((sum, contribution) => sum + getValue(contribution), 0),
		contributingIds: contributions.map((contribution) => contribution.id)
	};
}

function consecutivePositiveIncome(context: MetricContext): MetricValue {
	const reports = sortedReports(context.reports);
	const contributingIds: string[] = [];

	for (let index = reports.length - 1; index >= 0; index -= 1) {
		const report = reports[index]!;
		if (report.netIncome <= 0) break;
		contributingIds.push(reportEvidenceId(report.day));
	}

	return { actual: contributingIds.length, contributingIds: sortedIds(contributingIds) };
}

const METRIC_REGISTRY = {
	cash: {
		supportedWindows: CURRENT,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game }) => ({ actual: game.cash, contributingIds: [] })
	},
	'daily-net-income': {
		supportedWindows: REPORT_WINDOWS,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => averageNetIncome(context.reports, 0)
	},
	'cumulative-net-income': {
		supportedWindows: RUN_TO_DATE,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: ({ reports }) => ({
			actual: sumReports(reports, (report) => report.netIncome),
			contributingIds: reportIds(reports)
		})
	},
	'consecutive-positive-net-income-reports': {
		supportedWindows: new Set<WindowKind>(['current', 'trailing-reports']),
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: consecutivePositiveIncome
	},
	'completed-retail-import-cycles': {
		supportedWindows: RUN_TO_DATE,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: ({ reports }) => {
			const importReports = reports.filter((report) => isImportDay(report.day));
			return { actual: importReports.length, contributingIds: reportIds(importReports) };
		}
	},
	'retail-import-spend': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.importSpend)
	},
	'retail-imported-units': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.importedUnits)
	},
	'retail-local-units': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.warehouseUnits)
	},
	'retail-local-share': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => {
			const contributions = productContributions(context);
			const warehouseUnits = contributions.reduce(
				(sum, contribution) => sum + contribution.warehouseUnits,
				0
			);
			const importedUnits = contributions.reduce(
				(sum, contribution) => sum + contribution.importedUnits,
				0
			);
			const denominator = warehouseUnits + importedUnits;
			return {
				actual: denominator === 0 ? 0 : warehouseUnits / denominator,
				contributingIds: contributions.map((contribution) => contribution.id)
			};
		}
	},
	'units-sold': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.unitsSold)
	},
	'demand-missed': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.demandMissed)
	},
	scorecard: {
		supportedWindows: CURRENT,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game, query }) => ({
			actual: query.metric === 'scorecard' ? game.scorecard[query.score] : 0,
			contributingIds: []
		})
	},
	'store-count': {
		supportedWindows: CURRENT,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game }) => ({
			actual: game.stores.length,
			contributingIds: sortedIds(game.stores.map((store) => store.id))
		})
	},
	'industrial-building-count': {
		supportedWindows: CURRENT,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game, query }) => {
			const included = new Set(
				query.metric === 'industrial-building-count' ? query.buildingTypeIds : []
			);
			const buildings = game.industrialBuildings.filter((building) =>
				included.has(building.typeId)
			);
			return {
				actual: buildings.length,
				contributingIds: sortedIds(buildings.map((building) => building.id))
			};
		}
	},
	'warehouse-quantity': {
		supportedWindows: CURRENT,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game, query }) => {
			if (query.metric !== 'warehouse-quantity') {
				return { actual: 0, contributingIds: [] };
			}
			return {
				actual: game.warehouse.materials[query.materialId] ?? 0,
				contributingIds: [query.materialId]
			};
		}
	}
} satisfies Record<MetricId, MetricRegistration>;

function sortedReports(reports: readonly DailyReport[]): DailyReport[] {
	return [...reports].sort((first, second) => first.day - second.day);
}

function selectReports(game: GameState, window: ScenarioMetricWindow): DailyReport[] {
	const reports = sortedReports(game.reports);
	switch (window.kind) {
		case 'current':
			return reports.length === 0 ? [] : [reports.at(-1)!];
		case 'run-to-date':
			return reports;
		case 'trailing-reports':
			return reports.slice(-window.count);
		case 'fixed-report-days':
			return reports.filter(
				(report) => report.day >= window.startDay && report.day <= window.endDay
			);
	}
}

export function encodeEvidenceSegment(value: string): string {
	return encodeURIComponent(value);
}

export function reportEvidenceId(day: number): string {
	return `report:${day}`;
}

export function storeReportEvidenceId(day: number, storeId: string): string {
	return `${reportEvidenceId(day)}/store:${encodeEvidenceSegment(storeId)}`;
}

export function productEvidenceId(day: number, storeId: string, categoryId: string): string {
	return `${storeReportEvidenceId(day, storeId)}/product:${encodeEvidenceSegment(categoryId)}`;
}

export function evaluateMetric(
	game: GameState,
	query: ScenarioMetricQuery,
	window: ScenarioMetricWindow,
	requiresCompleteWindow = false
): MetricEvaluation {
	const registration = METRIC_REGISTRY[query.metric];
	if (!registration.supportedWindows.has(window.kind)) {
		throw new Error(`Metric ${query.metric} does not support ${window.kind}.`);
	}

	const context: MetricContext = {
		game,
		query,
		window,
		reports: selectReports(game, window)
	};
	const value = registration.evaluate(context);

	return {
		actual: Number.isFinite(value.actual) ? value.actual : registration.neutral,
		contributingIds: sortedIds(value.contributingIds),
		windowComplete: !requiresCompleteWindow || registration.isComplete(context)
	};
}

function comparatorPasses(actual: number, comparator: ScenarioComparator, target: number): boolean {
	switch (comparator) {
		case 'lt':
			return actual < target;
		case 'lte':
			return actual <= target;
		case 'eq':
			return actual === target;
		case 'gte':
			return actual >= target;
		case 'gt':
			return actual > target;
	}
}

export function scenarioConditionPasses(
	condition: ScenarioCondition,
	actual: number,
	windowComplete: boolean
): boolean {
	return windowComplete && comparatorPasses(actual, condition.comparator, condition.target);
}

function evaluateCondition(condition: ScenarioCondition, game: GameState) {
	const evaluation = evaluateMetric(
		game,
		condition.query,
		condition.window,
		condition.requiresCompleteWindow
	);
	const evidence: ObjectiveEvidence = {
		conditionId: condition.id,
		metric: condition.query.metric,
		comparator: condition.comparator,
		target: condition.target,
		actual: evaluation.actual,
		day: game.day,
		window: condition.window,
		windowComplete: evaluation.windowComplete,
		contributingIds: evaluation.contributingIds
	};
	return {
		evidence,
		passes: scenarioConditionPasses(condition, evaluation.actual, evaluation.windowComplete)
	};
}

function finiteDistance(actual: number, target: number): number {
	const distance = Math.abs(actual - target);
	return Number.isFinite(distance) ? distance : 0;
}

export function evaluateScenarioConditions(
	definition: ScenarioDefinition,
	game: GameState,
	terminal: boolean
): Omit<ScenarioEvaluation, 'projection'> {
	const required = definition.requiredObjectives.map((condition) => {
		const result = evaluateCondition(condition, game);
		return {
			conditionId: condition.id,
			status: result.passes
				? ('satisfied' as const)
				: terminal
					? ('missed' as const)
					: ('pending' as const),
			evidence: result.evidence
		};
	});
	const optional = definition.optionalObjectives.map((condition) => {
		const result = evaluateCondition(condition, game);
		return {
			conditionId: condition.id,
			status: result.passes
				? ('satisfied' as const)
				: terminal
					? ('missed' as const)
					: ('pending' as const),
			evidence: result.evidence
		};
	});
	const failureResults = definition.failures.map((condition) => ({
		condition,
		result: evaluateCondition(condition, game)
	}));
	const failures = failureResults.map(({ condition, result }) => ({
		conditionId: condition.id,
		status: result.passes ? ('triggered' as const) : ('inactive' as const),
		evidence: result.evidence
	}));
	const deadlineTriggered = game.day >= definition.dayLimit;

	return {
		day: game.day,
		required,
		optional,
		failures,
		deadline: deadlineTriggered
			? {
					triggered: true,
					evidence: {
						conditionId: 'deadline-exceeded',
						day: game.day,
						dayLimit: definition.dayLimit
					}
				}
			: null,
		risks: [
			...failureResults.map(({ condition, result }) => ({
				kind: 'condition' as const,
				conditionId: condition.id,
				distance: finiteDistance(result.evidence.actual, result.evidence.target),
				triggered: result.passes
			})),
			{
				kind: 'deadline' as const,
				daysRemaining: Math.max(0, definition.dayLimit - game.day),
				triggered: deadlineTriggered
			}
		]
	};
}

export function validateScenarioReportInvariants(
	reports: readonly DailyReport[]
): ScenarioDiagnostic[] {
	const diagnostics: ScenarioDiagnostic[] = [];

	for (const [reportIndex, report] of reports.entries()) {
		if (reportIndex > 0 && report.day <= reports[reportIndex - 1]!.day) {
			diagnostics.push({
				code: 'non-increasing-report-day',
				path: `reports[${reportIndex}].day`,
				value: report.day,
				detail: 'Scenario report days must be strictly increasing and unique.'
			});
		}

		const storeIds = new Set<string>();
		for (const [storeIndex, storeReport] of report.storeReports.entries()) {
			if (storeIds.has(storeReport.storeId)) {
				diagnostics.push({
					code: 'duplicate-store-report-id',
					path: `reports[${reportIndex}].storeReports[${storeIndex}].storeId`,
					value: storeReport.storeId,
					detail: 'Store IDs must be unique within each daily report.'
				});
			} else {
				storeIds.add(storeReport.storeId);
			}

			const categoryIds = new Set<string>();
			for (const [productIndex, productReport] of storeReport.productReports.entries()) {
				if (categoryIds.has(productReport.categoryId)) {
					diagnostics.push({
						code: 'duplicate-product-report-category-id',
						path: `reports[${reportIndex}].storeReports[${storeIndex}].productReports[${productIndex}].categoryId`,
						value: productReport.categoryId,
						detail: 'Product category IDs must be unique within each store report.'
					});
				} else {
					categoryIds.add(productReport.categoryId);
				}
			}
		}
	}

	return diagnostics.sort(
		(first, second) =>
			compareScenarioEvidenceIds(first.path, second.path) ||
			compareScenarioEvidenceIds(first.code, second.code)
	);
}
