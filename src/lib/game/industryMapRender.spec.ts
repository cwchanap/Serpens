import { describe, expect, test } from 'vitest';
import { DEFAULT_RETAIL_CITY_HEIGHT, DEFAULT_RETAIL_CITY_WIDTH } from './city';
import { getIndustryTilesByResource } from './industry';
import { buildIndustrialBuilding } from './industryPlacement';
import { createIndustryMapSnapshot } from './industryMapRender';
import { railUsageKey } from './rail';
import { createNewGame } from './state';
import type { DailyProductionReport, DailyReport, IndustryCity, RailCell } from './types';

function emptyProductionReport(): DailyProductionReport {
	return {
		produced: [],
		consumed: [],
		importedInputs: [],
		warehousePulls: [],
		shopImports: [],
		importSpend: 0,
		operatingCost: 0,
		overflowUnits: 0,
		overflowCost: 0,
		warehouseCapacity: 0,
		warehouseUsed: 0,
		railShipments: [],
		railUsage: {},
		cityInventories: []
	};
}

function emptyLogisticsReport(): DailyReport['logistics'] {
	return {
		arrivals: [],
		routeDispatchAttempts: [],
		deliveredUnits: 0,
		scheduledTransportCost: 0
	};
}

function makeReport(railUsage: Record<string, number>): DailyReport {
	return {
		day: 1,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		operatingCosts: 0,
		payrollCost: 0,
		importSpend: 0,
		cashBefore: 0,
		operatingIncome: 0,
		operatingCashFlow: 0,
		interestAccrued: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0,
		netCashChange: 0,
		netIncome: 0,
		cashAfter: 0,
		outstandingPrincipalAfter: 0,
		nextLoanPayment: null,
		scorecard: { profit: 0, customerSatisfaction: 0, staffMorale: 0, marketPosition: 0 },
		productionReport: { ...emptyProductionReport(), railUsage },
		logistics: emptyLogisticsReport(),
		storeReports: [],
		modifierImpacts: [],
		modifierLifecycle: [],
		warnings: []
	};
}

function withRails(city: IndustryCity, rails: RailCell[]): IndustryCity {
	return { ...city, rails };
}

describe('industry map render snapshot', () => {
	test('creates a serializable snapshot for the active industry city', () => {
		expect.assertions(9);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const tile = city.tiles.find((candidate) => !candidate.locked)!;

		const snapshot = createIndustryMapSnapshot(game, tile.id);

		expect(snapshot.cityId).toBe(city.id);
		expect(snapshot.width).toBe(DEFAULT_RETAIL_CITY_WIDTH);
		expect(snapshot.height).toBe(DEFAULT_RETAIL_CITY_HEIGHT);
		expect(snapshot.tiles).toHaveLength(DEFAULT_RETAIL_CITY_WIDTH * DEFAULT_RETAIL_CITY_HEIGHT);
		expect(snapshot.selectedTileId).toBe(tile.id);
		expect(snapshot.placementPreview).toBeNull();
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.selected).toBe(true);
		expect(snapshot.buildings).toHaveLength(0);
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.occupied).toBe(false);
	});

	test('returns an empty safe snapshot when the active industry city is missing', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260512);

		const snapshot = createIndustryMapSnapshot(
			{ ...game, activeIndustryCityId: 'missing-industry-city' },
			null
		);

		expect(snapshot.cityId).toBe('missing-industry-city');
		expect(snapshot.width).toBe(0);
		expect(snapshot.height).toBe(0);
		expect(snapshot.placementPreview).toBeNull();
		expect(snapshot.tiles).toHaveLength(0);
		expect(snapshot.buildings).toHaveLength(0);
	});

	test('includes industry placement preview metadata when provided', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260512);
		const placementPreview = {
			validTileIds: ['industry-city-1-1'],
			invalidTileIds: ['industry-city-1-4']
		};

		const snapshot = createIndustryMapSnapshot(game, null, placementPreview);
		const missingCitySnapshot = createIndustryMapSnapshot(
			{ ...game, activeIndustryCityId: 'missing-industry-city' },
			null,
			placementPreview
		);

		expect(snapshot.placementPreview?.validTileIds).toEqual(['industry-city-1-1']);
		expect(snapshot.placementPreview?.invalidTileIds).toEqual(['industry-city-1-4']);
		expect(missingCitySnapshot.placementPreview).toEqual(placementPreview);
		expect(createIndustryMapSnapshot(game, null).placementPreview).toBeNull();
	});

	test('clones industry placement preview arrays at the snapshot boundary', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260512);
		const placementPreview = {
			validTileIds: ['industry-city-1-1'],
			invalidTileIds: ['industry-city-1-4']
		};

		const snapshot = createIndustryMapSnapshot(game, null, placementPreview);
		const missingCitySnapshot = createIndustryMapSnapshot(
			{ ...game, activeIndustryCityId: 'missing-industry-city' },
			null,
			placementPreview
		);
		placementPreview.validTileIds.push('industry-city-2-2');
		placementPreview.invalidTileIds[0] = 'industry-city-3-3';

		expect(snapshot.placementPreview?.validTileIds).toEqual(['industry-city-1-1']);
		expect(snapshot.placementPreview?.invalidTileIds).toEqual(['industry-city-1-4']);
		expect(missingCitySnapshot.placementPreview?.validTileIds).toEqual(['industry-city-1-1']);
		expect(missingCitySnapshot.placementPreview?.invalidTileIds).toEqual(['industry-city-1-4']);
	});

	test('marks 2x2 occupied footprint tiles and renders active city buildings', () => {
		expect.assertions(9);
		const baseGame = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = baseGame.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const game = buildIndustrialBuilding(baseGame, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		const snapshot = createIndustryMapSnapshot(game, grainTile.id);
		const building = snapshot.buildings[0]!;
		const occupiedTileIds = snapshot.tiles
			.filter((candidate) => candidate.occupied)
			.map((candidate) => candidate.id)
			.sort();

		expect(occupiedTileIds).toEqual(
			[
				`${city.id}-${grainTile.x}-${grainTile.y}`,
				`${city.id}-${grainTile.x + 1}-${grainTile.y}`,
				`${city.id}-${grainTile.x}-${grainTile.y + 1}`,
				`${city.id}-${grainTile.x + 1}-${grainTile.y + 1}`
			].sort()
		);
		expect(building.id).toBe('industry-building-1');
		expect(building.name).toBe('Grain Farm');
		expect(building.typeId).toBe('grain-farm');
		expect(building.tileId).toBe(grainTile.id);
		expect(building.x).toBe(grainTile.x);
		expect(building.y).toBe(grainTile.y);
		expect(building).toMatchObject({ width: 2, height: 2 });
		expect(building.status).toBe('idle');
	});

	test('renders an L-shaped rail network with per-cell connection bitmasks', () => {
		expect.assertions(6);
		const baseGame = createNewGame('convenience', 20260512);
		const city = baseGame.industryCities[0]!;
		const rails: RailCell[] = [
			{ x: 2, y: 2, level: 1 },
			{ x: 3, y: 2, level: 4 },
			{ x: 3, y: 3, level: 1 }
		];
		const game = {
			...baseGame,
			industryCities: [withRails(city, rails), ...baseGame.industryCities.slice(1)],
			reports: []
		};

		const snapshot = createIndustryMapSnapshot(game, null);

		expect(snapshot.rails).toHaveLength(3);
		const corner = snapshot.rails.find((cell) => cell.x === 3 && cell.y === 2);
		expect(corner).toBeDefined();
		// (2,2) is W of the corner => bit 8; (3,3) is S of the corner => bit 4.
		expect(corner?.connections).toBe(12);
		expect(corner?.level).toBe(4);
		// No reports yet => usage defaults to 0.
		expect(corner?.utilization).toBe(0);
		expect(snapshot.railPreview).toBeNull();
	});

	test("computes rail utilization from yesterday's railUsage report", () => {
		expect.assertions(2);
		const baseGame = createNewGame('convenience', 20260512);
		const city = baseGame.industryCities[0]!;
		const rails: RailCell[] = [
			{ x: 2, y: 2, level: 1 },
			{ x: 3, y: 2, level: 4 },
			{ x: 3, y: 3, level: 1 }
		];
		const railUsage = { [railUsageKey(city.id, 3, 2)]: 2 };
		const game = {
			...baseGame,
			industryCities: [withRails(city, rails), ...baseGame.industryCities.slice(1)],
			reports: [makeReport(railUsage)]
		};

		const snapshot = createIndustryMapSnapshot(game, null);

		const corner = snapshot.rails.find((cell) => cell.x === 3 && cell.y === 2);
		expect(corner?.utilization).toBe(0.5);
		const west = snapshot.rails.find((cell) => cell.x === 2 && cell.y === 2);
		expect(west?.utilization).toBe(0);
	});

	test('passes railPreview through to the snapshot unchanged', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260512);
		const railPreview = { cells: [{ x: 1, y: 1, isNew: true }] };

		const snapshot = createIndustryMapSnapshot(game, null, null, railPreview);
		const missingCitySnapshot = createIndustryMapSnapshot(
			{ ...game, activeIndustryCityId: 'missing-industry-city' },
			null,
			null,
			railPreview
		);

		expect(snapshot.railPreview).toBe(railPreview);
		expect(missingCitySnapshot.railPreview).toBeNull();
	});

	test('returns empty rails and null railPreview when the active industry city is missing', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260512);

		const snapshot = createIndustryMapSnapshot(
			{ ...game, activeIndustryCityId: 'missing-industry-city' },
			null
		);

		expect(snapshot.rails).toEqual([]);
		expect(snapshot.railPreview).toBeNull();
	});
});
