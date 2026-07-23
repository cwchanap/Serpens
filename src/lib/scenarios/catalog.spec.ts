import { describe, expect, it } from 'vitest';
import { buildScenarioGame } from './setup';
import { decodeScenarioShareCode, encodeScenarioShareCode } from './shareCode';
import { validateScenarioDefinition } from './validation';
import {
	SCENARIO_CATALOG,
	compileScenarioCatalogEntries,
	currentScenarioDefinition,
	listCurrentScenarioDefinitions,
	listScenarioCatalogEntries,
	resolveScenarioDefinition
} from './catalog';
import type { ScenarioDefinition } from './types';

const EXPECTED = [
	{
		id: 'first-profit',
		version: 1,
		officialSeed: 280_001,
		dayLimit: 14,
		shareCode: 'SC1.first-profit.1.601t.04d9xyn'
	},
	{
		id: 'import-squeeze',
		version: 1,
		officialSeed: 280_002,
		dayLimit: 21,
		shareCode: 'SC1.import-squeeze.1.601u.12s7q19'
	},
	{
		id: 'local-lifeline',
		version: 1,
		officialSeed: 280_003,
		dayLimit: 21,
		shareCode: 'SC1.local-lifeline.1.601v.0455cvi'
	}
] as const;

function expectDeepFrozen(value: unknown): void {
	if (typeof value !== 'object' || value === null) return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const nested of Object.values(value)) expectDeepFrozen(nested);
}

describe('launch scenario catalog', () => {
	it('ships exactly three valid immutable current definitions in canonical order', () => {
		expect(
			listCurrentScenarioDefinitions().map(({ id, version, officialSeed, dayLimit }) => ({
				id,
				version,
				officialSeed,
				dayLimit
			}))
		).toEqual(
			EXPECTED.map(({ id, version, officialSeed, dayLimit }) => ({
				id,
				version,
				officialSeed,
				dayLimit
			}))
		);
		expect(new Set(SCENARIO_CATALOG.map(({ id }) => id)).size).toBe(3);
		expect(new Set(SCENARIO_CATALOG.map(({ id, version }) => `${id}@${version}`)).size).toBe(3);
		expectDeepFrozen(SCENARIO_CATALOG);
		expectDeepFrozen(listScenarioCatalogEntries());
		for (const definition of SCENARIO_CATALOG) {
			expect(validateScenarioDefinition(definition)).toEqual([]);
		}
	});

	it('builds every official setup and classifies every canonical official code as ranked', () => {
		for (const expected of EXPECTED) {
			const definition = currentScenarioDefinition(expected.id);
			expect(definition).toBeDefined();
			if (!definition) continue;
			const built = buildScenarioGame(definition, definition.officialSeed);
			expect(built.ok).toBe(true);
			if (built.ok) {
				expect(built.game.seed).toBe(definition.officialSeed);
				expect(built.game.stores[0]?.tileId).toBe('harbor-city-29-35');
			}
			expect(
				encodeScenarioShareCode(
					{ scenarioId: definition.id, version: definition.version },
					definition.officialSeed
				)
			).toBe(expected.shareCode);
			expect(decodeScenarioShareCode(expected.shareCode)).toMatchObject({
				ok: true,
				value: {
					definition: { scenarioId: expected.id, version: 1 },
					seed: expected.officialSeed,
					eligibility: 'ranked',
					canonicalCode: expected.shareCode
				}
			});
		}
	});

	it('uses exact ID/version lookup and does not substitute unsupported versions', () => {
		for (const expected of EXPECTED) {
			const current = currentScenarioDefinition(expected.id);
			expect(current).toBe(SCENARIO_CATALOG.find(({ id }) => id === expected.id));
			expect(resolveScenarioDefinition({ scenarioId: expected.id, version: 1 })).toBe(current);
			expect(resolveScenarioDefinition({ scenarioId: expected.id, version: 2 })).toBeUndefined();
		}
		expect(
			listScenarioCatalogEntries().every(
				(entry) => entry.available && entry.diagnostics.length === 0
			)
		).toBe(true);
	});

	it('keeps a cross-reference-invalid definition visible but unavailable with stable diagnostics', () => {
		const invalid = structuredClone(SCENARIO_CATALOG[0]!) as ScenarioDefinition;
		invalid.start.foundingStore.archetypeId = 'electronics';

		const first = compileScenarioCatalogEntries([invalid]);
		const second = compileScenarioCatalogEntries([invalid]);

		expect(first).toHaveLength(1);
		expect(first[0]?.definition).toBe(invalid);
		expect(first[0]?.available).toBe(false);
		expect(first[0]?.diagnostics).toEqual(second[0]?.diagnostics);
		expect(first[0]?.diagnostics).toContainEqual(
			expect.objectContaining({
				path: 'start.foundingStore.archetypeId',
				code: 'excluded-content'
			})
		);
	});
});
