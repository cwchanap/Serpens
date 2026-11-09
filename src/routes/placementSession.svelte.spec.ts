import { describe, expect, it, vi } from 'vitest';
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview
} from '$lib/game/placementPreview';
import { createNewGame } from '$lib/game/state';
import { currentScenarioDefinition } from '$lib/scenarios/catalog';
import type { City, GameState } from '$lib/game/types';
import type { MutationAvailability } from './gameRouteController';
import { createPlacementSession, type PlacementSessionCommands } from './placementSession.svelte';

function allAvailability(overrides: Partial<MutationAvailability> = {}): MutationAvailability {
	return {
		pending: false,
		advanceDay: true,
		resolveDecision: true,
		updatePolicy: true,
		scopedPolicy: true,
		delegation: true,
		openWorldCity: true,
		setRetailSupplySource: true,
		manageLogistics: true,
		createRecurringRoute: true,
		updateRecurringRoute: true,
		pauseRecurringRoute: true,
		resumeRecurringRoute: true,
		openStore: true,
		upgradeStore: true,
		hireStaff: true,
		assignStaff: true,
		unassignStaff: true,
		releaseStaff: true,
		promoteStaff: true,
		updateStoreSellingPrice: true,
		updateStoreInventoryTargets: true,
		updateStoreProductBrand: true,
		buildIndustrialBuilding: true,
		upgradeIndustrialBuilding: true,
		buildRail: true,
		upgradeRail: true,
		demolishRail: true,
		borrow: true,
		repayLoan: true,
		payOffLoan: true,
		refinanceLoan: true,
		financeWorldCity: true,
		financeRetailStore: true,
		financeIndustrialBuilding: true,
		...overrides
	};
}

const baseGame = createNewGame('convenience', 42);
const fallbackGame = createNewGame('convenience', 7);

interface SessionHarness {
	session: ReturnType<typeof createPlacementSession>;
	foundStore: ReturnType<typeof vi.fn>;
	openStore: ReturnType<typeof vi.fn>;
	buildIndustrialBuilding: ReturnType<typeof vi.fn>;
	playSfx: ReturnType<typeof vi.fn>;
	onSelectPlacementTile: ReturnType<typeof vi.fn>;
	onClearSelections: ReturnType<typeof vi.fn>;
	onFoundingPause: ReturnType<typeof vi.fn>;
	onOpenReview: ReturnType<typeof vi.fn>;
	onSettled: ReturnType<typeof vi.fn>;
}

function makeSession(
	overrides: Partial<Parameters<typeof createPlacementSession>[0]> = {}
): SessionHarness {
	const foundStore = vi.fn();
	const openStore = vi.fn();
	const buildIndustrialBuilding = vi.fn();
	const playSfx = vi.fn();
	const onSelectPlacementTile = vi.fn();
	const onClearSelections = vi.fn();
	const onFoundingPause = vi.fn();
	const onOpenReview = vi.fn();
	const onSettled = vi.fn();
	const session = createPlacementSession({
		getGame: () => baseGame,
		getRetailCity: () => baseGame.cities[0]!,
		getIndustryCity: () => baseGame.industryCities[0]!,
		getFallback: () => fallbackGame,
		getMode: () => 'sandbox',
		getDefinition: () => null,
		getAvailability: () => allAvailability(),
		getAllowedRetailArchetypeIds: () => ['convenience'],
		getAllowedIndustryBuildingTypeIds: () => ['warehouse', 'water-pump'],
		commands: {
			foundStore,
			openStore,
			buildIndustrialBuilding
		} as unknown as PlacementSessionCommands,
		playSfx,
		onSelectPlacementTile,
		onClearSelections,
		onFoundingPause,
		onOpenReview,
		onSettled,
		...overrides
	});
	return {
		session,
		foundStore,
		openStore,
		buildIndustrialBuilding,
		playSfx,
		onSelectPlacementTile,
		onClearSelections,
		onFoundingPause,
		onOpenReview,
		onSettled
	};
}

function retailPreview(game: GameState | null, city: City = baseGame.cities[0]!) {
	return createRetailPlacementPreview({
		game,
		city,
		archetypeId: 'convenience',
		cashCommandAvailable: true,
		financeCommandAvailable: true
	});
}

function industryPreview(game: GameState | null) {
	return createIndustryPlacementPreview({
		game,
		buildingTypeId: 'warehouse',
		financeCommandAvailable: true
	});
}

describe('armed retail placement', () => {
	it('commits a cash openStore on a valid armed tile and settles', () => {
		const { session, openStore, onSettled, foundStore } = makeSession();
		session.armRetail('convenience');
		const tileId = retailPreview(baseGame).validTileIds[0]!;

		expect(session.tryRetailClick(tileId)).toBe(true);
		expect(openStore).toHaveBeenCalledWith(tileId, 'convenience');
		expect(onSettled).toHaveBeenCalled();
		expect(foundStore).not.toHaveBeenCalled();
		expect(session.feedback).toBeNull();
	});

	it('returns false from both click probes while nothing is armed', () => {
		const { session, openStore, buildIndustrialBuilding } = makeSession();
		expect(session.isArmed).toBe(false);
		expect(session.tryRetailClick('harbor-city-3-1')).toBe(false);
		expect(session.tryIndustryClick('industry-city-26-6')).toBe(false);
		expect(openStore).not.toHaveBeenCalled();
		expect(buildIndustrialBuilding).not.toHaveBeenCalled();
	});

	it('resolves a clicked non-anchor footprint cell to its anchor tile', () => {
		const { session, openStore } = makeSession();
		session.armRetail('convenience');
		// harbor-city-37-2 sits inside the harbor-city-36-1 footprint but is not
		// itself a valid anchor.
		expect(session.tryRetailClick('harbor-city-37-2')).toBe(true);
		expect(openStore).toHaveBeenCalledWith('harbor-city-36-1', 'convenience');
	});

	it('surfaces the block reason and invalid sfx for an unknown tile', () => {
		const { session, openStore, playSfx, onSelectPlacementTile, onSettled } = makeSession();
		session.armRetail('convenience');

		expect(session.tryRetailClick('harbor-city-999-999')).toBe(true);
		expect(session.feedback).toEqual({ code: 'retail.unknownCityTile' });
		expect(onSelectPlacementTile).toHaveBeenCalledWith('retail', 'harbor-city-999-999');
		expect(playSfx).toHaveBeenCalledWith('sfx.build.invalid');
		expect(openStore).not.toHaveBeenCalled();
		expect(onSettled).not.toHaveBeenCalled();
	});

	it('ignores a retail click when the archetype is not menu-offered', () => {
		const { session, openStore, foundStore } = makeSession({
			getAllowedRetailArchetypeIds: () => []
		});
		session.armRetail('convenience');

		expect(session.tryRetailClick(retailPreview(baseGame).validTileIds[0]!)).toBe(true);
		expect(openStore).not.toHaveBeenCalled();
		expect(foundStore).not.toHaveBeenCalled();
		expect(session.feedback).toBeNull();
	});

	it('ignores a retail click when no retail expansion command is available', () => {
		const { session, openStore, foundStore } = makeSession({
			getAvailability: () => allAvailability({ openStore: false, financeRetailStore: false })
		});
		session.armRetail('convenience');

		expect(session.canStartRetailExpansion).toBe(false);
		expect(session.tryRetailClick('harbor-city-3-1')).toBe(true);
		expect(openStore).not.toHaveBeenCalled();
		expect(foundStore).not.toHaveBeenCalled();
	});

	it('issues foundStore through the founding path and pauses time', () => {
		const { session, foundStore, onFoundingPause, onSettled, openStore } = makeSession({
			getGame: () => null
		});
		session.armRetail('convenience');
		const tileId = retailPreview(null).validTileIds[0]!;

		expect(session.tryRetailClick(tileId)).toBe(true);
		expect(onFoundingPause).toHaveBeenCalled();
		expect(foundStore).toHaveBeenCalledWith({
			archetypeId: 'convenience',
			city: baseGame.cities[0],
			tileId,
			seed: fallbackGame.seed
		});
		expect(openStore).not.toHaveBeenCalled();
		expect(onSettled).toHaveBeenCalled();
	});

	it('opens the purchase review on the finance path instead of committing', () => {
		// Cash is short of the tile's setup cost but within available credit, so
		// the finance offer exists and the review path is taken.
		const cashShort = { ...baseGame, cash: 15_000 };
		const { session, openStore, onOpenReview, onSelectPlacementTile, playSfx } = makeSession({
			getGame: () => cashShort,
			getRetailCity: () => cashShort.cities[0]!,
			getAvailability: () => allAvailability({ openStore: false, financeRetailStore: true })
		});
		session.armRetail('convenience');
		const tileId = retailPreview(cashShort, cashShort.cities[0]!).validTileIds[0]!;

		expect(session.tryRetailClick(tileId)).toBe(true);
		expect(onOpenReview).toHaveBeenCalledWith(
			expect.objectContaining({ kind: 'retail', tileId, archetypeId: 'convenience' })
		);
		expect(onSelectPlacementTile).toHaveBeenCalledWith('retail', tileId);
		expect(openStore).not.toHaveBeenCalled();
		expect(playSfx).not.toHaveBeenCalled();
		expect(session.isArmed).toBe(false);
	});

	it('restricts the armed retail preview to scenario placements', () => {
		const definition = currentScenarioDefinition('first-profit')!;
		const { session } = makeSession({
			getMode: () => 'scenario',
			getDefinition: () => definition
		});
		session.armRetail('convenience');
		// first-profit authors no retail placements, so every tile is filtered.
		expect(session.retailPlacementPreview?.validTileIds).toEqual([]);
		expect(session.retailPlacementPreview?.invalidTileIds.length).toBeGreaterThan(0);
	});

	it('drops the retail preview entirely on a non-world scenario city', () => {
		const definition = currentScenarioDefinition('first-profit')!;
		const customCity: City = { ...baseGame.cities[0]!, id: 'custom-scenario-city' };
		const { session } = makeSession({
			getMode: () => 'scenario',
			getDefinition: () => definition,
			getRetailCity: () => customCity
		});
		session.armRetail('convenience');
		expect(session.retailPlacementPreview?.validTileIds).toEqual([]);
	});

	it('keeps the raw preview in scenario mode without a resolved definition', () => {
		const { session } = makeSession({
			getMode: () => 'scenario',
			getDefinition: () => null
		});
		session.armRetail('convenience');
		expect(session.retailPlacementPreview?.validTileIds.length).toBeGreaterThan(0);
	});
});

describe('armed industry placement', () => {
	it('commits buildIndustrialBuilding on a valid armed tile and settles', () => {
		const { session, buildIndustrialBuilding, onSettled } = makeSession();
		session.armIndustry('warehouse');
		const tileId = industryPreview(baseGame).validTileIds[0]!;

		expect(session.tryIndustryClick(tileId)).toBe(true);
		expect(buildIndustrialBuilding).toHaveBeenCalledWith(tileId, 'warehouse');
		expect(onSettled).toHaveBeenCalled();
		expect(session.feedback).toBeNull();
	});

	it('resolves a clicked non-anchor industry footprint cell to its anchor', () => {
		const { session, buildIndustrialBuilding } = makeSession();
		session.armIndustry('warehouse');
		// industry-city-54-6 sits inside the industry-city-53-6 footprint.
		expect(session.tryIndustryClick('industry-city-54-6')).toBe(true);
		expect(buildIndustrialBuilding).toHaveBeenCalledWith('industry-city-53-6', 'warehouse');
	});

	it('ignores an industry click when the building type is not menu-offered', () => {
		const { session, buildIndustrialBuilding } = makeSession({
			getAllowedIndustryBuildingTypeIds: () => []
		});
		session.armIndustry('warehouse');

		expect(session.tryIndustryClick('industry-city-26-6')).toBe(true);
		expect(buildIndustrialBuilding).not.toHaveBeenCalled();
	});

	it('ignores an industry click when no industry expansion command is available', () => {
		const { session, buildIndustrialBuilding } = makeSession({
			getAvailability: () =>
				allAvailability({
					buildIndustrialBuilding: false,
					financeIndustrialBuilding: false
				})
		});
		session.armIndustry('warehouse');

		expect(session.canStartIndustryExpansion).toBe(false);
		expect(session.tryIndustryClick('industry-city-26-6')).toBe(true);
		expect(buildIndustrialBuilding).not.toHaveBeenCalled();
	});

	it('surfaces lockedUntilRetail feedback when industry is clicked pre-founding', () => {
		const { session, buildIndustrialBuilding, playSfx, onSelectPlacementTile } = makeSession({
			getGame: () => null
		});
		session.armIndustry('warehouse');

		expect(session.tryIndustryClick('industry-city-26-6')).toBe(true);
		expect(session.feedback).toEqual({ code: 'industry.lockedUntilRetail' });
		expect(onSelectPlacementTile).toHaveBeenCalledWith('industry', 'industry-city-26-6');
		expect(playSfx).toHaveBeenCalledWith('sfx.build.invalid');
		expect(buildIndustrialBuilding).not.toHaveBeenCalled();
	});

	it('opens the purchase review on the industry finance path instead of committing', () => {
		const cashShort = { ...baseGame, cash: 0 };
		const { session, buildIndustrialBuilding, onOpenReview, onSelectPlacementTile } = makeSession({
			getGame: () => cashShort,
			getIndustryCity: () => cashShort.industryCities[0]!,
			getAvailability: () =>
				allAvailability({
					buildIndustrialBuilding: false,
					financeIndustrialBuilding: true
				})
		});
		session.armIndustry('warehouse');
		const tileId = industryPreview(cashShort).validTileIds[0]!;
		const expectedCost = INDUSTRIAL_BUILDING_TYPES['warehouse'].buildCost;

		expect(session.tryIndustryClick(tileId)).toBe(true);
		expect(onOpenReview).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'industry',
				tileId,
				buildingTypeId: 'warehouse',
				expectedCost
			})
		);
		expect(onSelectPlacementTile).toHaveBeenCalledWith('industry', tileId);
		expect(buildIndustrialBuilding).not.toHaveBeenCalled();
		expect(session.isArmed).toBe(false);
	});

	it('surfaces requiresCash when cash covers the build but the cash command is unavailable', () => {
		const { session, buildIndustrialBuilding, playSfx } = makeSession({
			getAvailability: () =>
				allAvailability({
					buildIndustrialBuilding: false,
					financeIndustrialBuilding: true
				})
		});
		session.armIndustry('warehouse');
		const tileId = industryPreview(baseGame).validTileIds[0]!;

		expect(session.tryIndustryClick(tileId)).toBe(true);
		expect(session.feedback).toEqual({
			code: 'industry.requiresCash',
			buildingTypeId: 'warehouse',
			amount: INDUSTRIAL_BUILDING_TYPES['warehouse'].buildCost
		});
		expect(playSfx).toHaveBeenCalledWith('sfx.build.invalid');
		expect(buildIndustrialBuilding).not.toHaveBeenCalled();
	});

	it('restricts the armed industry preview to authored scenario placements', () => {
		const definition = currentScenarioDefinition('local-lifeline')!;
		const { session } = makeSession({
			getMode: () => 'scenario',
			getDefinition: () => definition
		});
		session.armIndustry('water-bottler');
		expect(session.industryPlacementPreview?.validTileIds).toEqual(['industry-city-26-8']);
	});
});
