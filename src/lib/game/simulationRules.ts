export type ImportCostScope = 'retail-product' | 'industrial-material';

export interface ImportCostMultiplierRule {
	scope: ImportCostScope;
	target: { kind: 'all' } | { kind: 'ids'; ids: readonly string[] };
	multiplier: number;
}

export interface SimulationRules {
	importCostMultipliers: readonly ImportCostMultiplierRule[];
}

export const DEFAULT_SIMULATION_RULES: Readonly<SimulationRules> = Object.freeze({
	importCostMultipliers: Object.freeze([])
});

export function getImportCostMultiplier(
	rules: SimulationRules,
	scope: ImportCostScope,
	targetId: string
): number {
	const matchingRule = rules.importCostMultipliers.find(
		(rule) =>
			rule.scope === scope && (rule.target.kind === 'all' || rule.target.ids.includes(targetId))
	);

	return matchingRule?.multiplier ?? 1;
}
