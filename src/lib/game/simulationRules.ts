import type { StructuredCopyRef } from './types';

export type ImportCostScope = 'retail-product' | 'industrial-material';

export type SimulationRuleSource =
	| { kind: 'scenario'; sourceId: string }
	| {
			kind: 'event-modifier';
			sourceId: string;
			modifierId: string;
			eventId: string;
			instanceId: string;
			explanation: StructuredCopyRef;
	  };

export interface ImportCostMultiplierRule {
	source: SimulationRuleSource;
	scope: ImportCostScope;
	target: { kind: 'all' } | { kind: 'ids'; ids: readonly string[] };
	multiplier: number;
}

export interface SimulationRules {
	importCostMultipliers: readonly ImportCostMultiplierRule[];
}

export interface ImportCostResolution {
	multiplier: number;
	contributions: readonly { source: SimulationRuleSource; multiplier: number }[];
}

export interface ImportCostApplicationEvidence {
	scope: ImportCostScope;
	targetId: string;
	baselineCost: number;
	resolvedMultiplier: number;
	actualCost: number;
	contributions: ImportCostResolution['contributions'];
}

export const DEFAULT_SIMULATION_RULES: Readonly<SimulationRules> = Object.freeze({
	importCostMultipliers: Object.freeze([])
});

export function mergeSimulationRules(...sets: readonly SimulationRules[]): SimulationRules {
	return {
		importCostMultipliers: sets.flatMap((set) => set.importCostMultipliers)
	};
}

export function resolveImportCostMultiplier(
	rules: SimulationRules,
	scope: ImportCostScope,
	targetId: string
): ImportCostResolution {
	const contributions = rules.importCostMultipliers
		.filter(
			(rule) =>
				rule.scope === scope && (rule.target.kind === 'all' || rule.target.ids.includes(targetId))
		)
		.sort((left, right) => compareSourceIds(left.source.sourceId, right.source.sourceId))
		.map((rule) => ({ source: rule.source, multiplier: rule.multiplier }));

	return {
		multiplier: contributions.reduce(
			(product, contribution) => product * contribution.multiplier,
			1
		),
		contributions
	};
}

function compareSourceIds(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
