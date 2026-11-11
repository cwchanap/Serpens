import { describe, expect, it } from 'vitest';
import { runProgressionBot } from './bots';
import { chainMaterialIds, parseChainEvidenceArgs, summarizeChainEvidence } from './chainEvidence';

const BASE_ARGS = [
	'--seeds',
	'20260503',
	'--days',
	'365',
	'--archetype',
	'electronics',
	'--product',
	'accessories'
];

describe('parseChainEvidenceArgs', () => {
	it('rejects a literal ellipsis placeholder in --seeds', () => {
		expect(() =>
			parseChainEvidenceArgs([
				...BASE_ARGS.slice(0, 1),
				'20260501,…,20260550',
				...BASE_ARGS.slice(2)
			])
		).toThrow(/positive integer/);
	});

	it('requires archetype and product flags', () => {
		expect(() => parseChainEvidenceArgs(['--seeds', '42', '--days', '10'])).toThrow(/--archetype/);
	});

	it('rejects products without a production material', () => {
		expect(() =>
			parseChainEvidenceArgs([
				'--seeds',
				'42',
				'--days',
				'10',
				'--archetype',
				'boutique',
				'--product',
				'apparel'
			])
		).toThrow(/productionMaterialId/);
	});
});

describe('chainMaterialIds', () => {
	it('derives the accessories upstream closure from the recipe graph', () => {
		const materials = chainMaterialIds('electronic-accessories');
		for (const expected of [
			'electronic-accessories',
			'circuit-boards',
			'packaging',
			'copper-ore',
			'plastic'
		]) {
			expect(materials).toContain(expected);
		}
	});
});

describe('summarizeChainEvidence', () => {
	it('captures deterministic chain evidence for the 20260503 reference run', () => {
		const evidence = summarizeChainEvidence(
			20260503,
			runProgressionBot('electronics', 20260503, 365),
			{
				days: 365,
				product: 'accessories',
				costBuildings: ['copper-mine', 'circuit-board-plant', 'accessory-assembly-plant']
			}
		);
		expect(evidence.claims).toEqual([
			{ tierId: 'local-shop', claimedOnDay: 49 },
			{ tierId: 'neighborhood-chain', claimedOnDay: 57 },
			{ tierId: 'regional-supplier', claimedOnDay: 260 }
		]);
		expect(evidence.product).toMatchObject({
			warehouseUnits: 463,
			firstLocalDeliveryDay: 245,
			localDeliveryDays: 17,
			demandMissed: 25041
		});
		expect(evidence.chainMaterials['electronic-accessories']!.produced).toBe(541);
		expect(evidence.chainMaterials['circuit-boards']!.produced).toBe(489);
		expect(evidence.chainMaterials['copper-ore']!.importedInputQuantity).toBe(149);
		const copperMine = evidence.buildings.find((building) => building.typeId === 'copper-mine');
		expect(copperMine).toMatchObject({ builtOnDay: 15, producedTotal: 265, chainBuilding: true });
		expect(evidence.costScope.buildingTypeIds).toEqual([
			'accessory-assembly-plant',
			'circuit-board-plant',
			'copper-mine'
		]);
		expect(evidence.costScope.fixedOperating).toBeGreaterThan(0);
	});
});
