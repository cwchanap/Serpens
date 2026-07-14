import { describe, expect, it } from 'vitest';
import {
	addInventory,
	clampInventoryToRecipe,
	getRecipeMaterialIds,
	inventoryUsed,
	removeInventory
} from './buildingInventory';
import { INDUSTRIAL_BUILDING_TYPES } from './industry';

describe('buildingInventory', () => {
	it('sums inventory units across materials', () => {
		expect(inventoryUsed({ grain: 3, flour: 2 })).toBe(5);
		expect(inventoryUsed({})).toBe(0);
	});

	it('derives recipe materials as inputs plus outputs', () => {
		const ids = getRecipeMaterialIds(INDUSTRIAL_BUILDING_TYPES['flour-mill']);
		expect([...ids].sort()).toEqual(['flour', 'grain']);
	});

	it('recipe-less warehouse has no recipe materials', () => {
		expect(getRecipeMaterialIds(INDUSTRIAL_BUILDING_TYPES.warehouse).size).toBe(0);
	});

	it('adds up to capacity and reports overflow', () => {
		const result = addInventory({ flour: 8 }, 'flour', 5, 10);
		expect(result.inventory.flour).toBe(10);
		expect(result.added).toBe(2);
		expect(result.overflow).toBe(3);
	});

	it('removes available stock and reports shortage', () => {
		const result = removeInventory({ grain: 4 }, 'grain', 10);
		expect(result.inventory.grain).toBe(0);
		expect(result.removed).toBe(4);
		expect(result.shortage).toBe(6);
	});

	it('does not mutate the input inventory', () => {
		const original = { grain: 4 };
		removeInventory(original, 'grain', 2);
		addInventory(original, 'grain', 2, 100);
		expect(original.grain).toBe(4);
	});

	it('clamps inventory to recipe materials and buffer capacity', () => {
		const millType = INDUSTRIAL_BUILDING_TYPES['flour-mill'];
		const clamped = clampInventoryToRecipe({ grain: 5, snacks: 9, flour: 10_000 }, millType);
		expect(clamped.snacks).toBeUndefined();
		expect((clamped.grain ?? 0) + (clamped.flour ?? 0)).toBeLessThanOrEqual(
			millType.bufferCapacity
		);
	});

	it('every recipe building type has a positive bufferCapacity', () => {
		for (const type of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
			if (type.recipeId) {
				expect(type.bufferCapacity).toBeGreaterThan(0);
			}
		}
	});
});
