import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SIMULATION_RULES,
	getImportCostMultiplier,
	type SimulationRules
} from './simulationRules';

describe('simulation rules', () => {
	it('provides a deeply frozen default with no import multipliers', () => {
		expect(DEFAULT_SIMULATION_RULES).toEqual({ importCostMultipliers: [] });
		expect(Object.isFrozen(DEFAULT_SIMULATION_RULES)).toBe(true);
		expect(Object.isFrozen(DEFAULT_SIMULATION_RULES.importCostMultipliers)).toBe(true);
	});

	it('returns one for targets not matched in the requested scope', () => {
		const rules: SimulationRules = {
			importCostMultipliers: [
				{ scope: 'retail-product', target: { kind: 'ids', ids: ['games'] }, multiplier: 2 }
			]
		};

		expect(getImportCostMultiplier(rules, 'retail-product', 'accessories')).toBe(1);
		expect(getImportCostMultiplier(rules, 'industrial-material', 'games')).toBe(1);
	});

	it('matches all targets or selected ids within the requested scope', () => {
		const rules: SimulationRules = {
			importCostMultipliers: [
				{ scope: 'industrial-material', target: { kind: 'all' }, multiplier: 1.25 },
				{
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['games', 'accessories'] },
					multiplier: 2
				}
			]
		};

		expect(getImportCostMultiplier(rules, 'industrial-material', 'grain')).toBe(1.25);
		expect(getImportCostMultiplier(rules, 'retail-product', 'games')).toBe(2);
		expect(getImportCostMultiplier(rules, 'retail-product', 'accessories')).toBe(2);
	});

	it('returns only the first matching multiplier in definition order', () => {
		const rules: SimulationRules = {
			importCostMultipliers: [
				{ scope: 'retail-product', target: { kind: 'all' }, multiplier: 1.5 },
				{ scope: 'retail-product', target: { kind: 'ids', ids: ['games'] }, multiplier: 2 }
			]
		};

		expect(getImportCostMultiplier(rules, 'retail-product', 'games')).toBe(1.5);
	});
});
