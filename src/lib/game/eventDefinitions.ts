import type {
	EventCondition,
	EventImmediateEffect,
	EventModifierTemplate,
	EventSelectionPolicy,
	EventTargetSelector,
	ScoreKey,
	StructuredCopyRef
} from './types';

export type EventFinanceBorrowAmount = number | 'available-credit-clamped';

export type EventAuthoredImmediateEffect =
	| Exclude<EventImmediateEffect, { kind: 'finance-borrow' }>
	| {
			kind: 'finance-borrow';
			purpose: 'emergency' | 'supplierCredit';
			amount: EventFinanceBorrowAmount;
			termDays: 28 | 56;
	  };

export interface EventOptionDefinition {
	id: string;
	effects: readonly EventAuthoredImmediateEffect[];
	modifiers: readonly EventModifierTemplate[];
}

export interface EventDefinition {
	id: string;
	version: number;
	selection: EventSelectionPolicy;
	condition: EventCondition;
	target: EventTargetSelector;
	expiresAfterDays: number;
	cooldownDays: number;
	copy: StructuredCopyRef;
	options: readonly EventOptionDefinition[];
}

export interface EventCatalogDiagnostic {
	eventId: string;
	path: string;
	message: string;
}

export class EventCatalogValidationError extends Error {
	readonly diagnostics: readonly EventCatalogDiagnostic[];

	constructor(diagnostics: readonly EventCatalogDiagnostic[]) {
		super(
			`Invalid event catalog:\n${diagnostics
				.map(({ eventId, path, message }) => `${eventId}.${path}: ${message}`)
				.join('\n')}`
		);
		this.name = 'EventCatalogValidationError';
		this.diagnostics = diagnostics;
	}
}

export interface NormalizedEventCatalog {
	readonly definitions: readonly EventDefinition[];
	readonly byId: ReadonlyMap<string, EventDefinition>;
}

const EVENT_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SCORE_KEYS: readonly ScoreKey[] = [
	'profit',
	'customerSatisfaction',
	'staffMorale',
	'marketPosition'
];

export function validateAndNormalizeEventCatalog(
	definitions: readonly EventDefinition[]
): NormalizedEventCatalog {
	const diagnostics: EventCatalogDiagnostic[] = [];
	const ids = new Set<string>();

	for (const definition of definitions) {
		validateDefinition(definition, ids, diagnostics);
	}

	const sortedDiagnostics = sortDiagnostics(diagnostics);
	if (sortedDiagnostics.length > 0) {
		throw new EventCatalogValidationError(sortedDiagnostics);
	}

	const normalizedDefinitions = definitions
		.map(cloneDefinition)
		.sort((first, second) => compareCodeUnits(first.id, second.id));
	const byId = createReadonlyLookup(normalizedDefinitions);

	return deepFreeze({ definitions: normalizedDefinitions, byId });
}

function validateDefinition(
	definition: EventDefinition,
	ids: Set<string>,
	diagnostics: EventCatalogDiagnostic[]
): void {
	const eventId = typeof definition.id === 'string' ? definition.id : '<invalid-id>';
	const add = (path: string, message: string) => diagnostics.push({ eventId, path, message });

	if (!EVENT_ID.test(definition.id)) {
		add('id', 'must use lowercase kebab-case syntax');
	} else if (ids.has(definition.id)) {
		add('id', 'duplicates another event definition ID');
	} else {
		ids.add(definition.id);
	}

	if (!isPositiveInteger(definition.version)) add('version', 'must be a positive integer');
	if (!isPositiveInteger(definition.expiresAfterDays)) {
		add('expiresAfterDays', 'must be a positive integer');
	}
	if (!isPositiveInteger(definition.cooldownDays)) {
		add('cooldownDays', 'must be a positive integer');
	}
	validateSelection(definition.selection, add);
	validateCondition(definition.condition, 'condition', add);
	validateCopy(definition.copy, 'copy', add);

	if (definition.target?.kind !== 'company') {
		add('target', 'must select the company target');
	}
	if (definition.options.length === 0) {
		add('options', 'must contain at least one option');
	}

	const optionIds = new Set<string>();
	for (const [index, option] of definition.options.entries()) {
		const path = `options[${index}]`;
		if (!EVENT_ID.test(option.id)) {
			add(`${path}.id`, 'must use lowercase kebab-case syntax');
		} else if (optionIds.has(option.id)) {
			add(`${path}.id`, 'duplicates another option ID in this event');
		} else {
			optionIds.add(option.id);
		}
		validateOption(option, path, add);
	}
}

function validateSelection(
	selection: EventSelectionPolicy,
	add: (path: string, message: string) => void
): void {
	if (selection.kind === 'forced') {
		if (!Number.isFinite(selection.priority)) {
			add('selection.priority', 'must be finite');
		}
		return;
	}

	if (!Number.isFinite(selection.weight) || selection.weight <= 0) {
		add('selection.weight', 'must be a finite positive number');
	}
}

function validateCondition(
	condition: EventCondition,
	path: string,
	add: (path: string, message: string) => void
): void {
	switch (condition.kind) {
		case 'always':
		case 'store-count-below-cap':
			return;
		case 'all': {
			if (condition.conditions.length === 0) {
				add(`${path}.conditions`, 'must not be empty');
				return;
			}
			for (const [index, child] of condition.conditions.entries()) {
				validateCondition(child, `${path}.conditions[${index}]`, add);
			}
			validateCashBounds(condition, path, add);
			return;
		}
		case 'day-at-least':
			validateFinite(condition.day, `${path}.day`, add);
			return;
		case 'cash-below':
		case 'cash-at-least':
			validateFinite(condition.amount, `${path}.amount`, add);
			return;
		case 'score-at-least':
			if (!SCORE_KEYS.includes(condition.score))
				add(`${path}.score`, 'must be a supported score key');
			validateFinite(condition.value, `${path}.value`, add);
			if (Number.isFinite(condition.value) && (condition.value < 0 || condition.value > 100)) {
				add(`${path}.value`, 'must be within the supported 0..100 score range');
			}
			return;
	}
}

function validateCashBounds(
	condition: Extract<EventCondition, { kind: 'all' }>,
	path: string,
	add: (path: string, message: string) => void
): void {
	const conditions = flattenAllConditions(condition.conditions);
	const lowerBounds = conditions
		.filter(
			(candidate): candidate is Extract<EventCondition, { kind: 'cash-at-least' }> =>
				candidate.kind === 'cash-at-least'
		)
		.map((candidate) => candidate.amount)
		.filter(Number.isFinite);
	const upperBounds = conditions
		.filter(
			(candidate): candidate is Extract<EventCondition, { kind: 'cash-below' }> =>
				candidate.kind === 'cash-below'
		)
		.map((candidate) => candidate.amount)
		.filter(Number.isFinite);

	if (
		lowerBounds.length > 0 &&
		upperBounds.length > 0 &&
		Math.max(...lowerBounds) >= Math.min(...upperBounds)
	) {
		add(path, 'fails supported bounded contradiction checks for incompatible cash bounds');
	}
}

function flattenAllConditions(conditions: readonly EventCondition[]): readonly EventCondition[] {
	return conditions.flatMap((condition) =>
		condition.kind === 'all'
			? [condition, ...flattenAllConditions(condition.conditions)]
			: [condition]
	);
}

function validateOption(
	option: EventOptionDefinition,
	path: string,
	add: (path: string, message: string) => void
): void {
	let financeEffects = 0;
	let cashEffects = 0;
	for (const [index, effect] of option.effects.entries()) {
		const effectPath = `${path}.effects[${index}]`;
		switch (effect.kind) {
			case 'cash-adjust':
				cashEffects += 1;
				validateFinite(effect.amount, `${effectPath}.amount`, add);
				break;
			case 'score-adjust':
				if (!SCORE_KEYS.includes(effect.score))
					add(`${effectPath}.score`, 'must be a supported score key');
				validateFinite(effect.amount, `${effectPath}.amount`, add);
				break;
			case 'store-morale-adjust':
				if (effect.scope !== 'all-stores') add(`${effectPath}.scope`, 'must target all stores');
				validateFinite(effect.amount, `${effectPath}.amount`, add);
				break;
			case 'store-stock-adjust-by-target-percent':
				if (effect.scope !== 'all-stores') add(`${effectPath}.scope`, 'must target all stores');
				validateFinite(effect.percent, `${effectPath}.percent`, add);
				break;
			case 'finance-borrow':
				financeEffects += 1;
				if (
					typeof effect.amount === 'number' &&
					(!Number.isFinite(effect.amount) || effect.amount <= 0)
				) {
					add(`${effectPath}.amount`, 'must be a finite positive amount');
				}
				if (effect.amount !== 'available-credit-clamped' && typeof effect.amount !== 'number') {
					add(`${effectPath}.amount`, 'must be numeric or available-credit-clamped');
				}
				if (effect.purpose !== 'emergency' && effect.purpose !== 'supplierCredit') {
					add(`${effectPath}.purpose`, 'must be an allowed borrowing purpose');
				}
				if (effect.termDays !== 28 && effect.termDays !== 56) {
					add(`${effectPath}.termDays`, 'must be 28 or 56');
				}
				break;
		}
	}

	if (cashEffects > 0 && financeEffects > 0) {
		add(`${path}.effects`, 'cannot combine cash-adjust and finance-borrow');
	}
	if (financeEffects > 1) {
		let found = 0;
		for (let index = 0; index < option.effects.length; index += 1) {
			if (option.effects[index].kind === 'finance-borrow') {
				found += 1;
				if (found > 1) add(`${path}.effects[${index}]`, 'duplicates finance-borrow in this option');
			}
		}
	}

	for (const [index, modifier] of option.modifiers.entries()) {
		validateModifier(modifier, `${path}.modifiers[${index}]`, add);
	}
}

function validateModifier(
	modifier: EventModifierTemplate,
	path: string,
	add: (path: string, message: string) => void
): void {
	if (!isPositiveInteger(modifier.durationDays)) {
		add(`${path}.durationDays`, 'must be a positive integer');
	}
	if (typeof modifier.stackingKey !== 'string' || modifier.stackingKey.trim().length === 0) {
		add(`${path}.stackingKey`, 'must be non-empty');
	}
	if (modifier.stackingRule !== 'replace') {
		add(`${path}.stackingRule`, 'must be replace');
	}
	if (modifier.effect.kind !== 'import-cost-multiplier') {
		add(`${path}.effect.kind`, 'must be import-cost-multiplier');
	}
	if (modifier.effect.scope !== 'retail-product') {
		add(`${path}.effect.scope`, 'must target retail products');
	}
	if (modifier.effect.target?.kind !== 'all') {
		add(`${path}.effect.target`, 'must target all retail products');
	}
	if (!Number.isFinite(modifier.effect.multiplier) || modifier.effect.multiplier <= 0) {
		add(`${path}.effect.multiplier`, 'must be a finite positive multiplier');
	}
	validateCopy(modifier.explanation, `${path}.explanation`, add);
	if (modifier.importance !== 'normal' && modifier.importance !== 'important') {
		add(`${path}.importance`, 'must be normal or important');
	}
}

function validateCopy(
	copy: StructuredCopyRef,
	path: string,
	add: (path: string, message: string) => void
): void {
	if (typeof copy?.key !== 'string' || copy.key.trim().length === 0) {
		add(`${path}.key`, 'must be non-empty');
	}
	for (const [name, value] of Object.entries(copy?.params ?? {})) {
		if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
			add(`${path}.params.${name}`, 'must be a string or finite number');
		}
	}
}

function validateFinite(
	value: number,
	path: string,
	add: (path: string, message: string) => void
): void {
	if (!Number.isFinite(value)) add(path, 'must be finite');
}

function isPositiveInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}

function sortDiagnostics(diagnostics: readonly EventCatalogDiagnostic[]): EventCatalogDiagnostic[] {
	return [...diagnostics].sort(
		(first, second) =>
			compareCodeUnits(first.eventId, second.eventId) || compareCodeUnits(first.path, second.path)
	);
}

function compareCodeUnits(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}

function cloneDefinition(definition: EventDefinition): EventDefinition {
	return {
		...definition,
		selection: { ...definition.selection },
		condition: cloneCondition(definition.condition),
		target: { ...definition.target },
		copy: cloneCopy(definition.copy),
		options: definition.options.map((option) => ({
			...option,
			effects: option.effects.map((effect) => ({ ...effect })),
			modifiers: option.modifiers.map((modifier) => ({
				...modifier,
				effect: { ...modifier.effect, target: { ...modifier.effect.target } },
				explanation: cloneCopy(modifier.explanation)
			}))
		}))
	};
}

function cloneCondition(condition: EventCondition): EventCondition {
	if (condition.kind !== 'all') return { ...condition };
	return { ...condition, conditions: condition.conditions.map(cloneCondition) };
}

function cloneCopy(copy: StructuredCopyRef): StructuredCopyRef {
	return { ...copy, params: { ...copy.params } };
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
		Object.freeze(value);
	}
	return value;
}

function createReadonlyLookup(
	definitions: readonly EventDefinition[]
): ReadonlyMap<string, EventDefinition> {
	const values = new Map(definitions.map((definition) => [definition.id, definition]));
	const lookup = {
		get size() {
			return values.size;
		},
		get: values.get.bind(values),
		has: values.has.bind(values),
		entries: values.entries.bind(values),
		keys: values.keys.bind(values),
		values: values.values.bind(values),
		forEach(
			callback: (
				value: EventDefinition,
				key: string,
				map: ReadonlyMap<string, EventDefinition>
			) => void,
			thisArg?: unknown
		) {
			values.forEach((value, key) =>
				callback.call(thisArg, value, key, lookup as ReadonlyMap<string, EventDefinition>)
			);
		},
		[Symbol.iterator]: values[Symbol.iterator].bind(values)
	};

	return Object.freeze(lookup) as ReadonlyMap<string, EventDefinition>;
}
