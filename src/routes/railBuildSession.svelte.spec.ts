import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import { formatPlacementBlockReason } from '$lib/i18n/gameCopy';
import { buildIndustrialBuilding } from '$lib/game/industryPlacement';
import { createIndustryPlacementPreview } from '$lib/game/placementPreview';
import { isRailWaypointTarget } from '$lib/game/railPlacement';
import { decisionContextRailSelfConnected } from '$lib/game/decisionContext';
import { createNewGame } from '$lib/game/state';
import type { GameState, IndustryCity, IndustrialBuildingTypeId } from '$lib/game/types';
import type { MutationAvailability } from './gameRouteController';
import { createRailBuildSession } from './railBuildSession.svelte';
import { createConstructionUi, type ConstructionUiCommands } from './constructionUi.svelte';
import ConstructionControls from './ConstructionControls.svelte';

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

interface RailFixture {
	game: GameState;
	city: IndustryCity;
	originTileId: string;
	destinationTileId: string;
	originBuildingId: string;
	destinationBuildingId: string;
	waypointTileIds: string[];
}

function railFixture(buildingTypeId: IndustrialBuildingTypeId = 'flour-mill'): RailFixture {
	let game: GameState = { ...createNewGame('convenience', 42), cash: 1_000_000 };
	const anchors: string[] = [];
	while (anchors.length < 2) {
		const preview = createIndustryPlacementPreview({
			game,
			buildingTypeId,
			financeCommandAvailable: true
		});
		const anchor = preview.validTileIds[0];
		if (!anchor) throw new Error('rail fixture ran out of placement tiles');
		anchors.push(anchor);
		game = buildIndustrialBuilding(game, { tileId: anchor, buildingTypeId });
	}
	const city = game.industryCities.find((candidate) => candidate.id === game.activeIndustryCityId)!;
	const waypointTileIds = city.tiles
		.filter((tile) => isRailWaypointTarget(game, city.id, tile.x, tile.y))
		.map((tile) => tile.id);
	return {
		game,
		city,
		originTileId: anchors[0]!,
		destinationTileId: anchors[1]!,
		originBuildingId: game.industrialBuildings[0]!.id,
		destinationBuildingId: game.industrialBuildings[1]!.id,
		waypointTileIds
	};
}

function mountedConstruction(fixture: RailFixture, commands: ConstructionUiCommands) {
	const playSfx = vi.fn();
	const ui = createConstructionUi({
		getGame: () => fixture.game,
		getRetailCity: () => fixture.game.cities[0]!,
		getIndustryCity: () => fixture.city,
		getFallback: () => fixture.game,
		getView: () => 'industry',
		getMode: () => 'sandbox',
		getDefinition: () => null,
		getAvailability: () => allAvailability(),
		getI18n: () => createI18n('en'),
		commands,
		playSfx,
		onSelectPlacementTile: () => {},
		onClearSelections: () => {},
		onFoundingPause: () => {},
		onMenuOpen: () => {}
	});
	render(ConstructionControls, {
		ui,
		i18n: createI18n('en'),
		cash: fixture.game.cash,
		view: 'industry',
		guidanceVisible: false,
		onOpenAdvisor: () => {}
	});
	return { ui, playSfx };
}

afterEach(() => {
	vi.restoreAllMocks();
});

it('mounted origin, waypoint and second-click destination clicks route through one session', async () => {
	expect.assertions(9);
	const fixture = railFixture();
	const commands = {
		foundStore: vi.fn(),
		openStore: vi.fn(),
		buildIndustrialBuilding: vi.fn(),
		buildRail: vi.fn().mockResolvedValue({ status: 'sandbox-committed', changed: true }),
		financeWorldCity: vi.fn(),
		financeRetailStore: vi.fn(),
		financeIndustrialBuilding: vi.fn()
	} satisfies ConstructionUiCommands;
	const { ui } = mountedConstruction(fixture, commands);

	ui.toggleRail();
	expect(ui.railMode).toEqual({ step: 'origin' });
	expect(ui.placementStatusText).toBe('Select the first building');

	// Origin click selects the first building and enters routing.
	expect(ui.tryConstructionClick('industry', fixture.originTileId)).toBe(true);
	expect(ui.railMode).toEqual({
		step: 'routing',
		originBuildingId: fixture.originBuildingId,
		waypoints: []
	});
	expect(ui.placementStatusText).toBe('Select waypoints, then the destination building');

	// Waypoint click appends exactly one waypoint and clears stale click
	// feedback so the plaque reflects the new routing state.
	expect(ui.tryConstructionClick('industry', fixture.waypointTileIds[0]!)).toBe(true);
	expect(ui.placementFeedback).toBeNull();
	const routed = ui.railMode;
	if (routed.step !== 'routing') throw new Error('expected routing after waypoint click');
	expect(routed.waypoints).toHaveLength(1);
	expect(routed.originBuildingId).toBe(fixture.originBuildingId);
});

it('second destination click commits exactly one build command', async () => {
	expect.assertions(8);
	const fixture = railFixture();
	const commands = {
		foundStore: vi.fn(),
		openStore: vi.fn(),
		buildIndustrialBuilding: vi.fn(),
		buildRail: vi.fn().mockResolvedValue({ status: 'sandbox-committed', changed: true }),
		financeWorldCity: vi.fn(),
		financeRetailStore: vi.fn(),
		financeIndustrialBuilding: vi.fn()
	} satisfies ConstructionUiCommands;
	const { ui, playSfx } = mountedConstruction(fixture, commands);

	ui.toggleRail();
	ui.tryConstructionClick('industry', fixture.originTileId);
	// First destination click records the target without committing.
	expect(ui.tryConstructionClick('industry', fixture.destinationTileId)).toBe(true);
	expect(commands.buildRail).not.toHaveBeenCalled();
	expect(ui.placementStatusText).toMatch(/new cells/);

	// Second click on the same building commits.
	expect(ui.tryConstructionClick('industry', fixture.destinationTileId)).toBe(true);
	expect(commands.buildRail).toHaveBeenCalledTimes(1);
	expect(commands.buildRail).toHaveBeenCalledWith({
		originBuildingId: fixture.originBuildingId,
		waypoints: [],
		destinationBuildingId: fixture.destinationBuildingId
	});
	expect(ui.railMode).toEqual({ step: 'idle' });
	expect(playSfx).not.toHaveBeenCalledWith('sfx.build.invalid');
});

it('blocked destination target survives preview invalidation', async () => {
	expect.assertions(7);
	const fixture = railFixture();
	const commands = {
		foundStore: vi.fn(),
		openStore: vi.fn(),
		buildIndustrialBuilding: vi.fn(),
		buildRail: vi.fn(),
		financeWorldCity: vi.fn(),
		financeRetailStore: vi.fn(),
		financeIndustrialBuilding: vi.fn()
	} satisfies ConstructionUiCommands;
	const { ui, playSfx } = mountedConstruction(fixture, commands);
	const i18n = createI18n('en');
	const selfConnectedText = formatPlacementBlockReason(
		{ code: 'industry.rawPlacementBlocked', context: decisionContextRailSelfConnected() },
		i18n
	)!;

	ui.toggleRail();
	ui.tryConstructionClick('industry', fixture.originTileId);
	ui.tryConstructionClick('industry', fixture.waypointTileIds[0]!);
	// Clicking the origin building as destination is always blocked
	// (self-connected spur), but the attempted target must be retained.
	expect(ui.tryConstructionClick('industry', fixture.originTileId)).toBe(true);
	expect(ui.placementFeedback).toEqual({
		code: 'industry.rawPlacementBlocked',
		context: decisionContextRailSelfConnected()
	});
	expect(playSfx).toHaveBeenCalledWith('sfx.build.invalid');

	// A later waypoint click clears the click feedback but not the attempted
	// target: the re-derived preview keeps explaining the block.
	expect(ui.tryConstructionClick('industry', fixture.waypointTileIds[1]!)).toBe(true);
	expect(ui.placementFeedback).toBeNull();
	const survived = ui.railMode;
	if (survived.step !== 'routing') throw new Error('expected routing after waypoint click');
	expect(survived.waypoints).toHaveLength(2);
	expect(ui.placementStatusText).toBe(selfConnectedText);
});

it('cancelRailStep pops exactly one waypoint per call and cancel exits rail mode', async () => {
	expect.assertions(9);
	const fixture = railFixture();
	const session = createRailBuildSession({
		getGame: () => fixture.game,
		getCity: () => fixture.city,
		commands: { buildRail: vi.fn() },
		playSfx: () => {},
		setFeedback: () => {}
	});

	session.enterOrigin();
	session.handleClick(fixture.originTileId);
	session.handleClick(fixture.waypointTileIds[0]!);
	session.handleClick(fixture.waypointTileIds[1]!);
	if (session.mode.step !== 'routing') throw new Error('fixture did not enter routing');
	expect(session.mode.waypoints).toHaveLength(2);

	session.cancelStep();
	if (session.mode.step !== 'routing') throw new Error('unexpected idle');
	expect(session.mode.waypoints).toHaveLength(1);
	expect(session.isActive).toBe(true);
	// Backtracking invalidates the destination highlight, not just the last cell.
	expect(session.targetBuildingId).toBeNull();

	session.cancelStep();
	if (session.mode.step !== 'routing') throw new Error('unexpected idle');
	expect(session.mode.waypoints).toHaveLength(0);
	expect(session.isActive).toBe(true);

	session.cancelStep();
	expect(session.mode).toEqual({ step: 'idle' });
	expect(session.isIdle).toBe(true);
	expect(session.targetBuildingId).toBeNull();
});

it('invalid waypoint clicks are rejected with specific feedback and one invalid cue', async () => {
	expect.assertions(5);
	const fixture = railFixture();
	const playSfx = vi.fn();
	const setFeedback = vi.fn();
	const session = createRailBuildSession({
		getGame: () => fixture.game,
		getCity: () => fixture.city,
		commands: { buildRail: vi.fn() },
		playSfx,
		setFeedback
	});

	session.enterOrigin();
	session.handleClick(fixture.originTileId);
	const blockedTile = fixture.city.tiles.find(
		(tile) =>
			tile.terrain === 'blocked' &&
			!isRailWaypointTarget(fixture.game, fixture.city.id, tile.x, tile.y)
	);
	expect(blockedTile).toBeDefined();

	session.handleClick(blockedTile!.id);
	if (session.mode.step !== 'routing') throw new Error('unexpected idle');
	expect(session.mode.waypoints).toHaveLength(0);
	expect(setFeedback).toHaveBeenCalledWith({
		code: 'industry.rawPlacementBlocked',
		context: expect.objectContaining({ code: 'railNoValidPath' })
	});
	expect(playSfx).toHaveBeenCalledTimes(1);
	expect(playSfx).toHaveBeenCalledWith('sfx.build.invalid');
});

it('ignores clicks and cancels while idle', () => {
	const fixture = railFixture();
	const session = createRailBuildSession({
		getGame: () => fixture.game,
		getCity: () => fixture.city,
		commands: { buildRail: vi.fn() },
		playSfx: () => {},
		setFeedback: () => {}
	});

	// Idle is the quiet no-op: the reducer returns null and cancel has nothing
	// to pop, so neither surfaces feedback.
	expect(session.isIdle).toBe(true);
	session.handleClick(fixture.originTileId);
	session.cancelStep();
	expect(session.mode).toEqual({ step: 'idle' });
});
