import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import { getTileById } from '$lib/game/city';
import { buildIndustrialBuilding } from '$lib/game/industryPlacement';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview
} from '$lib/game/placementPreview';
import { createNewGame, getExpansionSetupCost } from '$lib/game/state';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import type { ScenarioDefinition } from '$lib/scenarios/types';
import type {
	ArchetypeId,
	City,
	GameState,
	IndustryCity,
	IndustrialBuildingTypeId
} from '$lib/game/types';
import type { MapViewId } from '$lib/game/mapViewKeepAlive';
import { createRoutePreviewGame } from './routePreviewGame';
import type { MutationAvailability } from './gameRouteController';
import type { PendingFinancedPurchase } from './financePurchaseReview';
import { createConstructionUi, type ConstructionUiCommands } from './constructionUi.svelte';
import ConstructionControls from './ConstructionControls.svelte';

const starter = createRoutePreviewGame();
const starterCity = starter.cities[0]!;

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

function spyCommands() {
	return {
		foundStore: vi.fn(),
		openStore: vi.fn(),
		buildIndustrialBuilding: vi.fn(),
		buildRail: vi.fn(),
		financeWorldCity: vi.fn(),
		financeRetailStore: vi.fn(),
		financeIndustrialBuilding: vi.fn()
	} satisfies ConstructionUiCommands;
}

type SpyCommands = ReturnType<typeof spyCommands>;

interface Holder {
	game: GameState | null;
	retailCity: City;
	industryCity: IndustryCity;
	view: MapViewId;
	mode: 'sandbox' | 'scenario';
	definition: ScenarioDefinition | null;
	availability: MutationAvailability;
}

function baseHolder(): Holder {
	const game = { ...createNewGame('convenience', 42), cash: 1_000_000 };
	return {
		game,
		retailCity: game.cities.find((city) => city.id === game.activeCityId)!,
		industryCity: game.industryCities.find((city) => city.id === game.activeIndustryCityId)!,
		view: 'retail',
		mode: 'sandbox',
		definition: null,
		availability: allAvailability()
	};
}

interface Mounted {
	ui: ReturnType<typeof createConstructionUi>;
	commands: SpyCommands;
	selections: Array<['retail' | 'industry', string]>;
	counters: { cleared: number; pauses: number; menuOpens: number };
	sfx: Array<string>;
	holder: Holder;
}

function mountConstruction(holder: Holder = baseHolder()): Mounted {
	const commands = spyCommands();
	const selections: Array<['retail' | 'industry', string]> = [];
	const counters = { cleared: 0, pauses: 0, menuOpens: 0 };
	const sfx: Array<string> = [];
	// Live-getter contract: the page feeds construction from $state atoms, so
	// the fixture holder must be reactive for replacement assertions to
	// re-run construction's deriveds.
	const live = $state(holder);
	const ui = createConstructionUi({
		getGame: () => live.game,
		getRetailCity: () => live.retailCity,
		getIndustryCity: () => live.industryCity,
		getFallback: () => starter,
		getView: () => live.view,
		getMode: () => live.mode,
		getDefinition: () => live.definition,
		getAvailability: () => live.availability,
		getI18n: () => createI18n('en'),
		commands,
		playSfx: (cueId) => sfx.push(cueId),
		onSelectPlacementTile: (kind, tileId) => selections.push([kind, tileId]),
		onClearSelections: () => {
			counters.cleared += 1;
		},
		onFoundingPause: () => {
			counters.pauses += 1;
		},
		onMenuOpen: () => {
			counters.menuOpens += 1;
		}
	});
	render(ConstructionControls, {
		ui,
		i18n: createI18n('en'),
		cash: live.game?.cash ?? 0,
		view: live.view,
		guidanceVisible: false,
		onOpenAdvisor: () => {}
	});
	return { ui, commands, selections, counters, sfx, holder: live };
}

function retailRoadTile(city: City): string {
	return city.tiles.find((tile) => tile.feature === 'road')!.id;
}

function validRetailAnchor(holder: Holder, archetypeId: ArchetypeId = 'grocery'): string {
	const preview = createRetailPlacementPreview({
		game: holder.game,
		city: holder.retailCity,
		archetypeId,
		cashCommandAvailable: true,
		financeCommandAvailable: true
	});
	const anchor = preview.validTileIds[0];
	if (!anchor) throw new Error('no valid retail anchor in fixture');
	return anchor;
}

/** An anchor plus a footprint cell of it that is not itself a valid anchor. */
function retailNonAnchorFootprint(
	holder: Holder,
	preview: NonNullable<ReturnType<typeof createRetailPlacementPreview>>
): { anchor: string; cell: string } {
	for (const anchor of preview.validTileIds) {
		const anchorTile = getTileById(holder.retailCity, anchor)!;
		const cell = holder.retailCity.tiles
			.filter(
				(tile) =>
					(tile.x === anchorTile.x || tile.x === anchorTile.x + 1) &&
					(tile.y === anchorTile.y || tile.y === anchorTile.y + 1)
			)
			.find((tile) => tile.id !== anchor && !preview.validTileIds.includes(tile.id));
		if (cell) return { anchor, cell: cell.id };
	}
	throw new Error('fixture: every footprint cell is a valid anchor');
}

/** Industry mirror of retailNonAnchorFootprint. */
function industryNonAnchorFootprint(
	city: IndustryCity,
	preview: NonNullable<ReturnType<typeof createIndustryPlacementPreview>>
): { anchor: string; cell: string } {
	for (const anchor of preview.validTileIds) {
		const anchorTile = city.tiles.find((tile) => tile.id === anchor)!;
		const cell = city.tiles
			.filter(
				(tile) =>
					(tile.x === anchorTile.x || tile.x === anchorTile.x + 1) &&
					(tile.y === anchorTile.y || tile.y === anchorTile.y + 1)
			)
			.find((tile) => tile.id !== anchor && !preview.validTileIds.includes(tile.id));
		if (cell) return { anchor, cell: cell.id };
	}
	throw new Error('fixture: every footprint cell is a valid anchor');
}

function validIndustryAnchor(holder: Holder, buildingTypeId: IndustrialBuildingTypeId): string {
	const preview = createIndustryPlacementPreview({
		game: holder.game,
		buildingTypeId,
		financeCommandAvailable: true
	});
	const anchor = preview.validTileIds[0];
	if (!anchor) throw new Error(`no valid ${buildingTypeId} anchor in fixture`);
	return anchor;
}

afterEach(() => {
	vi.restoreAllMocks();
});

it('construction projections read live game, city, definition and permission inputs', () => {
	const mounted = mountConstruction();
	const { ui, holder } = mounted;

	// Founding projections: no game yet, fallback seed drives the menu.
	holder.game = null;
	expect(ui.canStartRetailExpansion).toBe(true);
	expect(ui.industryLockedReason).toEqual({ code: 'industry.lockedUntilRetail' });
	expect(ui.retailBuildOptions.length).toBeGreaterThan(0);

	// A live game fills real-city previews.
	holder.game = { ...createNewGame('convenience', 42), cash: 1_000_000 };
	expect(ui.industryPlacementPreview).toBeNull();
	ui.armRetail('grocery');
	expect(ui.retailPlacementPreview?.validTileIds.length).toBeGreaterThan(0);
	expect(ui.industryLockedReason).toBeNull();

	// Replacing the city replaces the preview without recreating the owner.
	const otherCity = holder.game!.cities.find((city) => city.id !== holder.game!.activeCityId);
	if (otherCity) {
		holder.retailCity = otherCity;
		expect(ui.retailPlacementPreview).not.toBeNull();
	}

	// Permission replacement flips the expansion gates and menu availability.
	holder.availability = allAvailability({ openStore: false, financeRetailStore: false });
	expect(ui.canStartRetailExpansion).toBe(false);
	ui.openMenu();
	expect(ui.isMenuOpen).toBe(false);
	expect(mounted.counters.menuOpens).toBe(0);

	// View replacement drives the industry materials projection: recipe
	// outputs of a placed building appear only while the menu is open on the
	// industry view.
	const flourMillAnchor = validIndustryAnchor(holder, 'flour-mill');
	holder.game = buildIndustrialBuilding(holder.game!, {
		tileId: flourMillAnchor,
		buildingTypeId: 'flour-mill'
	});
	holder.view = 'industry';
	ui.openMenu();
	expect(ui.isMenuOpen).toBe(true);
	expect(ui.availableMaterialIds).toEqual(['flour']);
	holder.view = 'retail';
	expect(ui.availableMaterialIds).toEqual([]);

	// Definition replacement narrows authored scenario content.
	holder.mode = 'scenario';
	holder.definition = resolveScenarioDefinition({ scenarioId: 'local-lifeline', version: 1 })!;
	expect(ui.allowedIndustryBuildingTypeIds).toEqual(['water-bottler']);
	expect(ui.allowedRetailArchetypeIds).toEqual(['convenience']);
	holder.definition = resolveScenarioDefinition({ scenarioId: 'first-profit', version: 1 })!;
	expect(ui.allowedIndustryBuildingTypeIds).toEqual([]);
});

it('invalid road and occupied tiles surface specific feedback and consume the click', () => {
	const mounted = mountConstruction();
	const { ui, commands, selections, sfx } = mounted;
	const roadTile = retailRoadTile(mounted.holder.retailCity);

	ui.armRetail('grocery');
	expect(ui.tryConstructionClick('retail', roadTile)).toBe(true);
	expect(ui.placementFeedback).toEqual({ code: 'retail.roadLocation' });
	expect(selections).toEqual([['retail', roadTile]]);
	expect(commands.openStore).not.toHaveBeenCalled();
	expect(sfx).toContain('sfx.build.invalid');
	// Rejection keeps the placement armed for the next click.
	expect(ui.isPlacementModeActive).toBe(true);

	const occupiedTile = mounted.holder.game!.stores[0]!.tileId;
	expect(ui.tryConstructionClick('retail', occupiedTile)).toBe(true);
	expect(ui.placementFeedback).toEqual({ code: 'retail.occupiedLocation' });
});

it('invalid resource and occupied industry tiles surface specific feedback', () => {
	const mounted = mountConstruction();
	const { ui, commands, selections } = mounted;
	const industrialAnchor = validIndustryAnchor(mounted.holder, 'flour-mill');

	// Wrong-resource tile for a resource-anchored building.
	const wrongResourceTile = mounted.holder.industryCity.tiles.find(
		(tile) => tile.resource !== 'water-source' && !tile.locked
	)!;
	ui.armIndustry('water-pump');
	expect(ui.tryConstructionClick('industry', wrongResourceTile.id)).toBe(true);
	expect(ui.placementFeedback).toEqual({
		code: 'industry.rawPlacementBlocked',
		context: expect.objectContaining({ code: 'industrialRequiresResource' })
	});
	expect(commands.buildIndustrialBuilding).not.toHaveBeenCalled();

	// Occupied footprint for an industrial-terrain building.
	mounted.holder.game = buildIndustrialBuilding(mounted.holder.game!, {
		tileId: industrialAnchor,
		buildingTypeId: 'flour-mill'
	});
	ui.armIndustry('flour-mill');
	expect(ui.tryConstructionClick('industry', industrialAnchor)).toBe(true);
	expect(ui.placementFeedback).toEqual({
		code: 'industry.rawPlacementBlocked',
		context: expect.objectContaining({ code: 'industrialOccupiedTile' })
	});
	expect(selections.every(([kind]) => kind === 'industry')).toBe(true);
	expect(commands.buildIndustrialBuilding).not.toHaveBeenCalled();
});

it('non-anchor footprint clicks resolve to the footprint anchor', () => {
	const mounted = mountConstruction();
	const { ui, commands } = mounted;

	const preview = createRetailPlacementPreview({
		game: mounted.holder.game,
		city: mounted.holder.retailCity,
		archetypeId: 'grocery',
		cashCommandAvailable: true,
		financeCommandAvailable: true
	});
	const retail = retailNonAnchorFootprint(mounted.holder, preview);
	ui.armRetail('grocery');
	expect(ui.tryConstructionClick('retail', retail.cell)).toBe(true);
	expect(commands.openStore).toHaveBeenCalledTimes(1);
	expect(commands.openStore).toHaveBeenCalledWith(retail.anchor, 'grocery');

	const industryPreview = createIndustryPlacementPreview({
		game: mounted.holder.game,
		buildingTypeId: 'flour-mill',
		financeCommandAvailable: true
	});
	const industrial = industryNonAnchorFootprint(mounted.holder.industryCity, industryPreview);
	ui.armIndustry('flour-mill');
	expect(ui.tryConstructionClick('industry', industrial.cell)).toBe(true);
	expect(commands.buildIndustrialBuilding).toHaveBeenCalledTimes(1);
	expect(commands.buildIndustrialBuilding).toHaveBeenCalledWith(industrial.anchor, 'flour-mill');
});

it('no authored future placement blocks arming in scenarios', () => {
	const mounted = mountConstruction();
	const { ui } = mounted;
	mounted.holder.mode = 'scenario';
	mounted.holder.definition = resolveScenarioDefinition({
		scenarioId: 'first-profit',
		version: 1
	})!;

	ui.armIndustry('water-bottler');
	expect(ui.isPlacementModeActive).toBe(false);
	expect(ui.tryConstructionClick('industry', mounted.holder.industryCity.tiles[0]!.id)).toBe(false);

	mounted.holder.definition = resolveScenarioDefinition({
		scenarioId: 'local-lifeline',
		version: 1
	})!;
	ui.armIndustry('water-bottler');
	expect(ui.isPlacementModeActive).toBe(true);
	expect(ui.placementStatusText).toBe('Choose a highlighted tile to build.');
});

it('founding pauses the clock and cleans up without awaiting the command', () => {
	const holder = baseHolder();
	holder.game = null;
	holder.retailCity = starterCity;
	const mounted = mountConstruction(holder);
	const { ui, commands, counters } = mounted;

	const foundingAnchor = createRetailPlacementPreview({
		game: null,
		city: starterCity,
		archetypeId: 'convenience',
		cashCommandAvailable: true,
		financeCommandAvailable: true
	}).validTileIds[0]!;
	ui.armRetail('convenience');
	expect(ui.tryConstructionClick('retail', foundingAnchor)).toBe(true);

	expect(commands.foundStore).toHaveBeenCalledTimes(1);
	expect(commands.foundStore).toHaveBeenCalledWith(
		expect.objectContaining({
			archetypeId: 'convenience',
			tileId: foundingAnchor,
			seed: starter.seed
		})
	);
	expect(counters.pauses).toBe(1);
	// Immediate cleanup, before the never-settling founding promise resolves.
	expect(counters.cleared).toBe(2);
	expect(ui.isPlacementModeActive).toBe(false);
	expect(mounted.selections).toEqual([]);
});

it('sufficient cash commits immediately without awaiting the command', () => {
	const mounted = mountConstruction();
	const { ui, commands, counters } = mounted;
	const anchor = validRetailAnchor(mounted.holder, 'grocery');
	const tile = getTileById(mounted.holder.retailCity, anchor)!;
	mounted.holder.game = {
		...mounted.holder.game!,
		cash: getExpansionSetupCost(tile, 'grocery') + 1_000
	};

	ui.armRetail('grocery');
	expect(ui.tryConstructionClick('retail', anchor)).toBe(true);
	expect(commands.openStore).toHaveBeenCalledTimes(1);
	expect(commands.openStore).toHaveBeenCalledWith(anchor, 'grocery');
	expect(counters.cleared).toBe(2);
	expect(ui.isPlacementModeActive).toBe(false);
});

it('finance-only opens review while no-offer insufficient cash stays requiresCash', () => {
	const mounted = mountConstruction();
	const { ui, commands, selections } = mounted;
	const anchor = validRetailAnchor(mounted.holder, 'grocery');
	const tile = getTileById(mounted.holder.retailCity, anchor)!;
	const expectedCost = getExpansionSetupCost(tile, 'grocery');

	// Finance-only with an offer: review opens, placement disarms, tile selects.
	mounted.holder.availability = allAvailability({ openStore: false, financeRetailStore: true });
	mounted.holder.game = { ...mounted.holder.game!, cash: expectedCost - 1 };
	ui.armRetail('grocery');
	expect(ui.tryConstructionClick('retail', anchor)).toBe(true);
	expect(commands.openStore).not.toHaveBeenCalled();
	expect(commands.financeRetailStore).not.toHaveBeenCalled();
	expect(ui.purchaseReview.purchase).toEqual({
		kind: 'retail',
		tileId: anchor,
		archetypeId: 'grocery',
		expectedCost,
		offer: expect.objectContaining({ principal: 1 })
	});
	expect(ui.isPlacementModeActive).toBe(false);
	expect(selections).toEqual([['retail', anchor]]);

	// Insufficient cash with no offer (credit exhausted): requiresCash feedback.
	// The still-open review from the previous branch is dismissed first —
	// arming never dismisses it (the modal blocks the map in the real UI).
	mounted.holder.game = { ...mounted.holder.game!, cash: -5_000_000 };
	ui.closeReview();
	ui.armRetail('grocery');
	expect(ui.tryConstructionClick('retail', anchor)).toBe(true);
	expect(ui.purchaseReview.purchase).toBeNull();
	expect(ui.placementFeedback).toEqual({ code: 'retail.requiresCash', amount: expectedCost });

	// No expansion command at all: the armed placement is cancelled, arming
	// is blocked again and the click is not consumed.
	mounted.holder.availability = allAvailability({
		openStore: false,
		financeRetailStore: false
	});
	expect(ui.canStartRetailExpansion).toBe(false);
	ui.cancel();
	ui.armRetail('grocery');
	expect(ui.tryConstructionClick('retail', anchor)).toBe(false);
	expect(commands.financeRetailStore).not.toHaveBeenCalled();
});

it('stale confirmation keeps the newer review, selection and armed placement', async () => {
	const mounted = mountConstruction();
	const { ui, commands, counters } = mounted;
	commands.financeIndustrialBuilding.mockResolvedValue({ status: 'committed' });

	ui.armIndustry('flour-mill');
	const purchase: PendingFinancedPurchase = {
		kind: 'industry',
		tileId: 'industry-city-10-10',
		buildingTypeId: 'flour-mill',
		expectedCost: 9_000,
		offer: {
			principal: 4_000,
			termDays: 84,
			annualInterestRateBps: 725,
			estimatedPeakPayment: 60
		}
	};
	const newerPurchase: PendingFinancedPurchase = { ...purchase, tileId: 'industry-city-11-11' };
	ui.review(purchase);
	const pending = ui.confirmReview();
	ui.review(newerPurchase);
	await pending;

	expect(commands.financeIndustrialBuilding).toHaveBeenCalledTimes(1);
	expect(ui.purchaseReview.purchase).toBe(newerPurchase);
	expect(ui.purchaseReview.confirmationPending).toBe(false);
	// The stale committed result cannot clear selections or the armed placement
	// (only the arming itself cleared them).
	expect(counters.cleared).toBe(1);
	expect(ui.isPlacementModeActive).toBe(true);
});

it('silent hideMenu differs from SFX closeMenu and guarded openMenu', () => {
	const mounted = mountConstruction();
	const { ui, sfx } = mounted;

	mounted.holder.view = 'world';
	ui.openMenu();
	expect(ui.isMenuOpen).toBe(false);
	expect(mounted.counters.menuOpens).toBe(0);

	mounted.holder.view = 'retail';
	ui.openMenu();
	expect(ui.isMenuOpen).toBe(true);
	expect(mounted.counters.menuOpens).toBe(1);
	expect(sfx).toContain('sfx.ui.panel-open');

	ui.hideMenu();
	expect(ui.isMenuOpen).toBe(false);
	expect(sfx).not.toContain('sfx.ui.panel-close');

	ui.openMenu();
	ui.closeMenu();
	expect(ui.isMenuOpen).toBe(false);
	expect(sfx).toContain('sfx.ui.panel-close');
	expect(mounted.counters.menuOpens).toBe(2);
});

it('arming replaces rail and other placements and clears selections', () => {
	const mounted = mountConstruction();
	const { ui, sfx } = mounted;

	mounted.holder.view = 'industry';
	ui.armIndustry('flour-mill');
	expect(ui.isPlacementModeActive).toBe(true);
	expect(mounted.counters.cleared).toBe(1);

	ui.armRetail('grocery');
	expect(ui.isPlacementModeActive).toBe(true);
	expect(ui.railMode).toEqual({ step: 'idle' });
	expect(mounted.counters.cleared).toBe(2);
	expect(sfx.filter((cue) => cue === 'sfx.build.arm')).toHaveLength(2);

	ui.toggleRail();
	expect(ui.railMode).toEqual({ step: 'origin' });
	ui.armIndustry('flour-mill');
	expect(ui.railMode).toEqual({ step: 'idle' });

	// Rail toggle is guarded outside the industry view and without permission.
	mounted.holder.view = 'retail';
	ui.toggleRail();
	expect(ui.railMode).toEqual({ step: 'idle' });
	mounted.holder.view = 'industry';
	mounted.holder.availability = allAvailability({ buildRail: false });
	ui.toggleRail();
	expect(ui.railMode).toEqual({ step: 'idle' });
});
