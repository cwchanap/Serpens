import type { JsonObject, ValidationContext } from './shared';
import {
	BRONZE_SCORE,
	MAX_SCORE,
	MEDAL_THRESHOLD_KEYS,
	METRIC_WINDOWS,
	arrayValue,
	closedObject,
	diagnostic,
	finiteNumber,
	isObject,
	nonEmptyString
} from './shared';
import { validateMetricQuery, validateWindow } from './conditions';

function validateScores(context: ValidationContext, definition: JsonObject): void {
	const components = arrayValue(context, definition.scoreComponents, 'scoreComponents');
	let total = 0;
	if (components) {
		for (const [index, candidate] of components.entries()) {
			const path = `scoreComponents[${index}]`;
			if (!isObject(candidate)) {
				diagnostic(context, path, 'invalid-object', candidate, 'Score components must be objects.');
				continue;
			}
			const kind = candidate.kind;
			let component: JsonObject | undefined;
			if (kind === 'optional-objective') {
				component = closedObject(context, candidate, path, ['kind', 'objectiveId', 'points']);
				if (
					component &&
					(!nonEmptyString(context, component.objectiveId, `${path}.objectiveId`) ||
						!context.optionalObjectiveIds.has(component.objectiveId as string))
				)
					diagnostic(
						context,
						`${path}.objectiveId`,
						'invalid-reference',
						component?.objectiveId,
						'Optional-objective score components must reference an optional objective.'
					);
			} else if (kind === 'metric') {
				component = closedObject(context, candidate, path, [
					'kind',
					'query',
					'window',
					'zeroBonusAt',
					'fullBonusAt',
					'points'
				]);
				if (component) {
					const metric = validateMetricQuery(context, component.query, `${path}.query`);
					const window = validateWindow(context, component.window, `${path}.window`);
					if (metric && window && !METRIC_WINDOWS[metric]?.has(window))
						diagnostic(
							context,
							`${path}.window.kind`,
							'unsupported-window',
							window,
							`Metric ${metric} does not support ${window}.`
						);
					validateScoreAnchors(context, component, path);
				}
			} else if (kind === 'remaining-days') {
				component = closedObject(context, candidate, path, [
					'kind',
					'zeroBonusAt',
					'fullBonusAt',
					'points'
				]);
				if (component) validateScoreAnchors(context, component, path);
			} else {
				closedObject(context, candidate, path, ['kind'], ['kind']);
				diagnostic(
					context,
					`${path}.kind`,
					'unsupported-score-component',
					kind,
					`Unsupported score component: ${String(kind)}.`
				);
			}
			if (
				component &&
				(typeof component.points !== 'number' ||
					!Number.isInteger(component.points) ||
					component.points < 0)
			)
				diagnostic(
					context,
					`${path}.points`,
					'invalid-score-points',
					component.points,
					'Score component points must be a non-negative integer.'
				);
			else if (component && typeof component.points === 'number') total += component.points;
		}
	}
	if (total !== BRONZE_SCORE)
		diagnostic(
			context,
			'scoreComponents',
			'invalid-score-total',
			total,
			`Score components must allocate exactly ${BRONZE_SCORE} bonus points.`
		);

	const medals = closedObject(
		context,
		definition.medalThresholds,
		'medalThresholds',
		MEDAL_THRESHOLD_KEYS
	);
	if (
		medals &&
		(typeof medals.silver !== 'number' ||
			!Number.isInteger(medals.silver) ||
			typeof medals.gold !== 'number' ||
			!Number.isInteger(medals.gold) ||
			medals.silver <= BRONZE_SCORE ||
			medals.gold <= medals.silver ||
			medals.gold > MAX_SCORE)
	)
		diagnostic(
			context,
			'medalThresholds',
			'invalid-medal-thresholds',
			definition.medalThresholds,
			`Medal thresholds must satisfy ${BRONZE_SCORE} < silver < gold <= ${MAX_SCORE}.`
		);
}

function validateScoreAnchors(
	context: ValidationContext,
	component: JsonObject,
	path: string
): void {
	const zeroValid = finiteNumber(context, component.zeroBonusAt, `${path}.zeroBonusAt`);
	const fullValid = finiteNumber(context, component.fullBonusAt, `${path}.fullBonusAt`);
	if (zeroValid && fullValid && component.zeroBonusAt === component.fullBonusAt)
		diagnostic(
			context,
			path,
			'invalid-score-anchors',
			component,
			'Score anchors must define a non-zero range.'
		);
}

export { validateScores };
