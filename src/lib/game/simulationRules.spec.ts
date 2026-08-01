import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SIMULATION_RULES,
	mergeSimulationRules,
	resolveImportCostMultiplier,
	type SimulationRuleSource,
	type SimulationRules
} from './simulationRules';

const scenarioSource = (sourceId: string): SimulationRuleSource => ({
	kind: 'scenario',
	sourceId
});

const eventSource = (sourceId: string): SimulationRuleSource => ({
	kind: 'event-modifier',
	sourceId,
	modifierId: sourceId,
	eventId: 'supplier-opportunity',
	instanceId: 'event-instance-4',
	explanation: { key: 'events.supplierOpportunity.explanation', params: {} }
});

describe('simulation rules', () => {
	it('provides a deeply frozen default with no import multipliers', () => {
		expect(DEFAULT_SIMULATION_RULES).toEqual({ importCostMultipliers: [] });
		expect(Object.isFrozen(DEFAULT_SIMULATION_RULES)).toBe(true);
		expect(Object.isFrozen(DEFAULT_SIMULATION_RULES.importCostMultipliers)).toBe(true);
	});

	it('resolves unmatched targets to one with no contributions', () => {
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenarioSource('scenario:test:modifier:0'),
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['games'] },
					multiplier: 2
				}
			]
		};

		expect(resolveImportCostMultiplier(rules, 'retail-product', 'accessories')).toEqual({
			multiplier: 1,
			contributions: []
		});
		expect(resolveImportCostMultiplier(rules, 'industrial-material', 'games')).toEqual({
			multiplier: 1,
			contributions: []
		});
	});

	it('preserves a scenario-only multiplier and its provenance', () => {
		const source = scenarioSource('scenario:import-squeeze:modifier:0');
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source,
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['games', 'accessories'] },
					multiplier: 2
				}
			]
		};

		expect(resolveImportCostMultiplier(rules, 'retail-product', 'games')).toEqual({
			multiplier: 2,
			contributions: [{ source, multiplier: 2 }]
		});
	});

	it('resolves an event-only multiplier and its provenance', () => {
		const source = eventSource('event-modifier-7');
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source,
					scope: 'retail-product',
					target: { kind: 'all' },
					multiplier: 0.9
				}
			]
		};

		expect(resolveImportCostMultiplier(rules, 'retail-product', 'games')).toEqual({
			multiplier: 0.9,
			contributions: [{ source, multiplier: 0.9 }]
		});
	});

	it('multiplies overlapping scenario and event rules in stable source order', () => {
		const scenario = scenarioSource('scenario:import-squeeze:modifier:0');
		const event = eventSource('event-modifier-7');
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenario,
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['games'] },
					multiplier: 2
				},
				{
					source: event,
					scope: 'retail-product',
					target: { kind: 'all' },
					multiplier: 0.9
				}
			]
		};

		expect(resolveImportCostMultiplier(rules, 'retail-product', 'games')).toEqual({
			multiplier: 1.8,
			contributions: [
				{ source: event, multiplier: 0.9 },
				{ source: scenario, multiplier: 2 }
			]
		});
	});

	it('merges rule sets without mutating their arrays or source order', () => {
		const first: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenarioSource('scenario:test:modifier:0'),
					scope: 'retail-product',
					target: { kind: 'all' },
					multiplier: 1.5
				}
			]
		};
		const second: SimulationRules = {
			importCostMultipliers: [
				{
					source: eventSource('event-modifier-2'),
					scope: 'retail-product',
					target: { kind: 'all' },
					multiplier: 0.8
				}
			]
		};
		const firstSnapshot = structuredClone(first);
		const secondSnapshot = structuredClone(second);

		const merged = mergeSimulationRules(first, second);

		expect(merged.importCostMultipliers.map((rule) => rule.source.sourceId)).toEqual([
			'scenario:test:modifier:0',
			'event-modifier-2'
		]);
		expect(merged.importCostMultipliers).not.toBe(first.importCostMultipliers);
		expect(merged.importCostMultipliers).not.toBe(second.importCostMultipliers);
		expect(first).toEqual(firstSnapshot);
		expect(second).toEqual(secondSnapshot);
	});
});
