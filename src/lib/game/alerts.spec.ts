import { describe, expect, it } from 'vitest';
import { collectGameAlerts } from './alerts';
import type { GameState, Store, IndustrialBuilding, DecisionItem, StoreProduct } from './types';

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
	return {
		categoryId: 'snacks',
		stock: 50,
		reorderThreshold: 10,
		targetStock: 60,
		sellingPrice: 5,
		...overrides
	};
}

function store(overrides: Partial<Store> = {}): Store {
	return {
		id: 'store-1',
		level: 1,
		name: 'Corner Market',
		archetypeId: 'convenience',
		location: 'Main & 3rd',
		cityId: 'harbor-city',
		tileId: 'tile-1',
		mapX: 1,
		mapY: 1,
		daysOpen: 3,
		reputation: 50,
		stockHealth: 90,
		products: [product()],
		staffMorale: 80,
		staffCapacity: 2,
		localDemand: 50,
		competition: 20,
		managerQuality: 40,
		...overrides
	};
}

function building(overrides: Partial<IndustrialBuilding> = {}): IndustrialBuilding {
	return {
		id: 'bld-1',
		level: 1,
		typeId: 'flour-mill',
		cityId: 'industry-city',
		tileId: 'itile-1',
		mapX: 2,
		mapY: 2,
		status: 'produced',
		lastProduction: [],
		producedTotal: 10,
		importedInputTotal: 0,
		blockedDays: 0,
		...overrides
	};
}

function baseGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 1,
		rngState: 0,
		day: 5,
		cash: 1000,
		debt: 0,
		policy: {} as GameState['policy'],
		scorecard: {} as GameState['scorecard'],
		world: {} as GameState['world'],
		storeCap: 5,
		cities: [],
		activeCityId: 'harbor-city',
		industryCities: [],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		warehouse: { capacity: 0, materials: {}, overflowUnits: 0, overflowCost: 0 },
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: [],
		...overrides
	};
}

describe('collectGameAlerts', () => {
	it('returns no alerts for a healthy game', () => {
		expect.assertions(1);
		expect(collectGameAlerts(baseGame({ stores: [store()] }))).toEqual([]);
	});

	it('flags a store with out-of-stock products and deep-links to its tile', () => {
		expect.assertions(4);
		const alerts = collectGameAlerts(
			baseGame({ stores: [store({ products: [product({ stock: 0 })] })] })
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].kind).toBe('store-stock');
		expect(alerts[0].tileId).toBe('tile-1');
		expect(alerts[0].message).toMatch(/out of stock/i);
	});

	it('flags a store that needs import (below reorder threshold)', () => {
		expect.assertions(2);
		const alerts = collectGameAlerts(
			baseGame({ stores: [store({ products: [product({ stock: 5, reorderThreshold: 10 })] })] })
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].message).toMatch(/need import/i);
	});

	it('flags pending decisions', () => {
		expect.assertions(2);
		const decision: DecisionItem = {
			id: 'dec-1',
			title: 'Lease renewal',
			context: '',
			expiresOnDay: 9,
			options: []
		};
		const alerts = collectGameAlerts(baseGame({ decisions: [decision] }));
		expect(alerts.some((alert) => alert.kind === 'decision' && alert.decisionId === 'dec-1')).toBe(
			true
		);
		expect(alerts[0].message).toMatch(/lease renewal/i);
	});

	it('flags a blocked factory and deep-links to its tile', () => {
		expect.assertions(3);
		const alerts = collectGameAlerts(
			baseGame({ industrialBuildings: [building({ status: 'blocked', blockedDays: 2 })] })
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].kind).toBe('factory-blocked');
		expect(alerts[0].tileId).toBe('itile-1');
	});
});
