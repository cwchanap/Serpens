import type { ValidationContext } from './shared';
import {
	KNOWN_COMMANDS,
	KNOWN_MATERIAL_IDS,
	KNOWN_PRODUCT_IDS,
	arrayValue,
	closedObject,
	diagnostic,
	finiteNumber,
	isObject,
	validateIncluded,
	validateReferenceArray
} from './shared';

function validateCommands(context: ValidationContext, value: unknown): void {
	const commands = arrayValue(context, value, 'allowedCommands');
	if (!commands) return;
	const seen = new Set<string>();
	for (const [index, command] of commands.entries()) {
		const path = `allowedCommands[${index}]`;
		if (typeof command !== 'string' || !KNOWN_COMMANDS.has(command)) {
			diagnostic(
				context,
				path,
				'unsupported-command',
				command,
				`Unsupported scenario command: ${String(command)}.`
			);
			continue;
		}
		if (seen.has(command))
			diagnostic(
				context,
				path,
				'duplicate-command',
				command,
				`Duplicate allowed command: ${command}.`
			);
		seen.add(command);
	}
	context.allowedCommands = seen;
}

function validateModifiers(context: ValidationContext, value: unknown): void {
	const modifiers = arrayValue(context, value, 'modifiers');
	if (!modifiers) return;
	const claimedByScope = new Map<string, { all: boolean; ids: Set<string> }>();
	for (const [index, candidate] of modifiers.entries()) {
		const path = `modifiers[${index}]`;
		if (!isObject(candidate)) {
			diagnostic(context, path, 'invalid-object', candidate, 'Scenario modifiers must be objects.');
			continue;
		}
		if (candidate.kind !== 'import-cost-multiplier') {
			closedObject(context, candidate, path, ['kind'], ['kind']);
			diagnostic(
				context,
				`${path}.kind`,
				'unsupported-modifier',
				candidate.kind,
				`Unsupported modifier kind: ${String(candidate.kind)}.`
			);
			continue;
		}
		const modifier = closedObject(context, candidate, path, [
			'kind',
			'scope',
			'target',
			'multiplier'
		]);
		if (!modifier) continue;
		if (modifier.scope !== 'retail-product' && modifier.scope !== 'industrial-material') {
			diagnostic(
				context,
				`${path}.scope`,
				'invalid-modifier',
				modifier.scope,
				'Unsupported import multiplier scope.'
			);
		}
		if (
			!finiteNumber(context, modifier.multiplier, `${path}.multiplier`) ||
			(typeof modifier.multiplier === 'number' && modifier.multiplier <= 0)
		) {
			if (typeof modifier.multiplier === 'number' && Number.isFinite(modifier.multiplier))
				diagnostic(
					context,
					`${path}.multiplier`,
					'invalid-modifier',
					modifier.multiplier,
					'Import multiplier must be greater than zero.'
				);
			else
				replaceDiagnosticCode(
					context,
					`${path}.multiplier`,
					'invalid-finite-number',
					'invalid-modifier'
				);
		}
		validateModifierTarget(context, modifier.target, `${path}.target`, modifier.scope);
		trackModifierTargetOverlap(
			context,
			{ scope: modifier.scope, target: modifier.target },
			`${path}.target`,
			claimedByScope
		);
	}
}

function trackModifierTargetOverlap(
	context: ValidationContext,
	modifier: { scope: unknown; target: unknown },
	path: string,
	claimedByScope: Map<string, { all: boolean; ids: Set<string> }>
): void {
	if (modifier.scope !== 'retail-product' && modifier.scope !== 'industrial-material') return;
	if (!isObject(modifier.target)) return;
	const scope = modifier.scope as string;
	let claimed = claimedByScope.get(scope);
	if (!claimed) {
		claimed = { all: false, ids: new Set() };
		claimedByScope.set(scope, claimed);
	}
	if (modifier.target.kind === 'all') {
		if (claimed.all || claimed.ids.size > 0)
			diagnostic(
				context,
				path,
				'invalid-modifier',
				modifier.target,
				'Import multiplier target overlaps a previous target in the same scope.'
			);
		claimed.all = true;
		return;
	}
	if (modifier.target.kind === 'ids' && Array.isArray(modifier.target.ids)) {
		const ids = (modifier.target.ids as readonly unknown[]).filter(
			(id): id is string => typeof id === 'string'
		);
		if (claimed.all || ids.some((id) => claimed!.ids.has(id)))
			diagnostic(
				context,
				path,
				'invalid-modifier',
				modifier.target,
				'Import multiplier target overlaps a previous target in the same scope.'
			);
		for (const id of ids) claimed.ids.add(id);
	}
}

function replaceDiagnosticCode(
	context: ValidationContext,
	path: string,
	oldCode: string,
	newCode: string
): void {
	const found = context.diagnostics.findLast((item) => item.path === path && item.code === oldCode);
	if (found) found.code = newCode;
}

function validateModifierTarget(
	context: ValidationContext,
	value: unknown,
	path: string,
	scope: unknown
): void {
	if (!isObject(value)) {
		diagnostic(context, path, 'invalid-object', value, 'Modifier target must be an object.');
		return;
	}
	if (value.kind === 'all') {
		closedObject(context, value, path, ['kind']);
		return;
	}
	if (value.kind !== 'ids') {
		closedObject(context, value, path, ['kind'], ['kind']);
		diagnostic(
			context,
			`${path}.kind`,
			'invalid-modifier',
			value.kind,
			'Modifier target kind must be all or ids.'
		);
		return;
	}
	const target = closedObject(context, value, path, ['kind', 'ids']);
	if (!target) return;
	const registry = scope === 'retail-product' ? KNOWN_PRODUCT_IDS : KNOWN_MATERIAL_IDS;
	const allowed = scope === 'retail-product' ? context.content.products : context.content.materials;
	const kind = scope === 'retail-product' ? 'product category' : 'material';
	const ids = validateReferenceArray(context, target.ids, `${path}.ids`, registry, kind);
	for (const id of ids) {
		const raw = target.ids as readonly unknown[];
		validateIncluded(context, id, `${path}.ids[${raw.indexOf(id)}]`, allowed);
	}
}

export { validateCommands, validateModifiers };
