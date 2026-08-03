import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

describe('retail supply source page handler', () => {
	it('delegates the typed selection through GameRouteController without mutating or persisting page state', () => {
		const handler = pageSource.match(
			/\n\tfunction setRetailSupplySource\(retailCityId: string, supplyCityId: string \| null\): void \{([\s\S]*?)\n\t\}/
		)?.[1];

		expect(handler).toContain(
			'void gameRouteController.setRetailSupplySource(retailCityId, supplyCityId);'
		);
		expect(handler).not.toMatch(/saveAuto|saveRepository|sandboxGame\s*=|activeScenarioRun\s*=/);
	});
});
