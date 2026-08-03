import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

describe('retail supply source page handler', () => {
	it('composes the Stores-panel control from panelGame and delegates only through GameRouteController', () => {
		const handler = pageSource.match(
			/\n\tfunction setRetailSupplySource\(retailCityId: string, supplyCityId: string \| null\): void \{([\s\S]*?)\n\t\}/
		)?.[1];

		expect(pageSource).toContain(
			"import RetailSupplySources from '$lib/components/game/RetailSupplySources.svelte';"
		);
		expect(pageSource).toContain(
			"import { buildRetailCitySupplyViews } from '$lib/components/game/retailSupplySources';"
		);
		expect(pageSource).toContain('<RetailSupplySources');
		expect(pageSource).toContain('retailCities={buildRetailCitySupplyViews(panelGame, i18n)}');
		expect(pageSource).toContain('disabled={!mutationAvailability.setRetailSupplySource}');
		expect(pageSource).toContain('onChange={setRetailSupplySource}');
		expect(handler).toContain(
			'void gameRouteController.setRetailSupplySource(retailCityId, supplyCityId);'
		);
		expect(handler).not.toMatch(/saveAuto|saveRepository|sandboxGame\s*=|activeScenarioRun\s*=/);
		expect(pageSource).not.toContain('void setRetailSupplySource;');
	});
});
