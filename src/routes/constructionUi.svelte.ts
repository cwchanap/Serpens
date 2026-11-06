import type { SfxCueId } from '$lib/audio/audioCatalog';
import type { I18nBundle } from '$lib/i18n';
import { formatPlacementBlockReason } from '$lib/i18n/gameCopy';
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import {
	getIndustrialBuildMenuOptions,
	getRetailBuildMenuOptions,
	type PlacementBlockReason
} from '$lib/game/placementPreview';
import { getAvailableMaterialIds } from '$lib/game/supplyAdvisor';
import type { MapViewId } from '$lib/game/mapViewKeepAlive';
import type {
	ArchetypeId,
	City,
	GameState,
	IndustryCity,
	IndustrialBuildingTypeId
} from '$lib/game/types';
import type { ScenarioDefinition } from '$lib/scenarios/types';
import { isLiveScenarioContentAllowed } from './scenarioRoute';
import type { FinancePurchaseReviewState, PendingFinancedPurchase } from './financePurchaseReview';
import type { RailBuildMode } from './railBuild';
import type { MutationAvailability, GameRouteController } from './gameRouteController';
import { createRailBuildSession } from './railBuildSession.svelte';
import { createPurchaseReviewSession } from './purchaseReviewSession.svelte';
import { createPlacementSession } from './placementSession.svelte';

export type ConstructionUiCommands = Pick<
	GameRouteController,
	| 'foundStore'
	| 'openStore'
	| 'buildIndustrialBuilding'
	| 'buildRail'
	| 'financeWorldCity'
	| 'financeRetailStore'
	| 'financeIndustrialBuilding'
>;

interface ConstructionUiOptions {
	getGame(): GameState | null;
	getRetailCity(): City;
	getIndustryCity(): IndustryCity;
	/** Presentation fallback game (pre-founding preview): source of the founding seed. */
	getFallback(): GameState;
	getView(): MapViewId;
	getMode(): 'sandbox' | 'scenario';
	getDefinition(): ScenarioDefinition | null;
	getAvailability(): MutationAvailability;
	getI18n(): I18nBundle;
	commands: ConstructionUiCommands;
	playSfx(cueId: SfxCueId): void;
	/** Selects a placement-feedback tile and clears the other placement selections. */
	onSelectPlacementTile(kind: 'retail' | 'industry', tileId: string): void;
	onClearSelections(): void;
	/** Pauses the auto-tick when the founding store is placed. */
	onFoundingPause(): void;
	/** Closes competing shell surfaces (game menu, saves, management panel). */
	onMenuOpen(): void;
}

type RoutingMode = Extract<RailBuildMode, { step: 'routing' }>;

/**
 * Per-route construction owner: the build menu plus three bounded sessions —
 * armed placements, interactive rail building and one financed-purchase
 * review. Pure placement/rail/finance decisions stay in their existing
 * helpers; this owner holds the menu atom, resolves map clicks to the right
 * session and owns the single placement-status authority. Read-only
 * inspection of selected tiles stays with the route.
 */
export function createConstructionUi(options: ConstructionUiOptions) {
	let isMenuOpen = $state(false);
	const definition = $derived(options.getDefinition());
	const retailBuildOptions = $derived(
		getRetailBuildMenuOptions({
			game: options.getGame(),
			city: options.getRetailCity(),
			cashCommandAvailable: options.getAvailability().openStore,
			financeCommandAvailable: options.getAvailability().financeRetailStore,
			seed: options.getFallback().seed
		})
	);
	const allowedRetailArchetypeIds = $derived.by<ArchetypeId[]>(() =>
		retailBuildOptions
			.map((option) => option.archetypeId)
			.filter((archetypeId) =>
				isLiveScenarioContentAllowed(options.getMode(), definition, {
					kind: 'archetype',
					archetypeId
				})
			)
	);
	const allowedIndustryBuildingTypeIds = $derived.by<IndustrialBuildingTypeId[]>(() =>
		(Object.keys(INDUSTRIAL_BUILDING_TYPES) as IndustrialBuildingTypeId[]).filter(
			(buildingTypeId) => {
				if (options.getMode() === 'sandbox') return true;
				if (!definition) return false;
				// buildingTypeIds includes pre-placed starting buildings that may
				// have no permitted future placement entries. Only offer types
				// that have at least one industrial placement slot so the player
				// cannot arm a placement that can never commit.
				return (
					isLiveScenarioContentAllowed(options.getMode(), definition, {
						kind: 'building',
						buildingTypeId
					}) &&
					definition.content.industrialPlacements.some(
						(placement) => placement.buildingTypeId === buildingTypeId
					)
				);
			}
		)
	);
	const industrialBuildOptions = $derived(
		getIndustrialBuildMenuOptions({
			game: options.getGame(),
			cashCommandAvailable: options.getAvailability().buildIndustrialBuilding,
			financeCommandAvailable: options.getAvailability().financeIndustrialBuilding,
			allowedIndustrialPlacements:
				options.getMode() === 'sandbox' || !definition
					? null
					: definition.content.industrialPlacements
		})
	);

	const purchaseReviewSession = createPurchaseReviewSession({
		getGame: options.getGame,
		getI18n: options.getI18n,
		commands: options.commands,
		onCommitted: () => {
			options.onClearSelections();
			clearPlacementMode();
		}
	});

	const placement = createPlacementSession({
		getGame: options.getGame,
		getRetailCity: options.getRetailCity,
		getIndustryCity: options.getIndustryCity,
		getFallback: options.getFallback,
		getMode: options.getMode,
		getDefinition: options.getDefinition,
		getAvailability: options.getAvailability,
		getAllowedRetailArchetypeIds: () => allowedRetailArchetypeIds,
		getAllowedIndustryBuildingTypeIds: () => allowedIndustryBuildingTypeIds,
		commands: options.commands,
		playSfx: options.playSfx,
		onSelectPlacementTile: options.onSelectPlacementTile,
		onClearSelections: options.onClearSelections,
		onFoundingPause: options.onFoundingPause,
		onOpenReview: (purchase) => {
			purchaseReviewSession.open(purchase);
		},
		onSettled: () => {
			options.onClearSelections();
			cancel();
		}
	});

	// Rail clicks and step cancels share the placement session's single
	// feedback atom; no second feedback authority exists.
	const rail = createRailBuildSession({
		getGame: options.getGame,
		getCity: options.getIndustryCity,
		commands: options.commands,
		playSfx: options.playSfx,
		setFeedback: placement.setFeedback
	});

	// Shortcuts to a Warehouse placement (link alert, inspector notice) use the
	// same availability as the Build menu option, so they never arm a
	// placement with no legal or affordable tile.
	const canStartWarehousePlacement = $derived(
		placement.canStartIndustryExpansion &&
			allowedIndustryBuildingTypeIds.includes('warehouse') &&
			industrialBuildOptions.some(
				(option) => option.buildingTypeId === 'warehouse' && option.disabledReason === null
			)
	);
	const industryLockedReason = $derived<PlacementBlockReason | null>(
		options.getGame() ? null : { code: 'industry.lockedUntilRetail' }
	);
	const availableMaterialIds = $derived(
		isMenuOpen && options.getView() === 'industry'
			? getAvailableMaterialIds(options.getGame() ?? options.getFallback())
			: []
	);
	const menuDisabledReason = $derived(
		options.getMode() === 'scenario' ? options.getI18n().t('buildMenu.unavailable') : null
	);
	const isPlacementModeActive = $derived(placement.isArmed || rail.isActive);
	// Text for the placement-status plaque while rail-building: a block
	// reason (if any) always wins, then a ready-to-confirm cost summary once
	// a valid destination attempt exists, then step-specific instructions.
	// The block reason can come from either an explicit destination-click
	// rejection (feedback) or the derived preview recomputing against a
	// freshly pushed waypoint that makes the route unreachable — rail clicks
	// clear feedback when a waypoint is added, so without surfacing
	// preview.blockReason the plaque would silently fall back to "pick
	// destination" and hide the real blocker.
	const placementStatusText = $derived.by(() => {
		if (rail.isActive) return railStatusText();
		const i18n = options.getI18n();
		return (
			formatPlacementBlockReason(placement.feedback, i18n) ??
			(placement.industryPlacementPreview?.requiredResource
				? i18n.t('placement.chooseResourceTile', {
						resource: i18n.labels.industryResource(
							placement.industryPlacementPreview.requiredResource
						)
					})
				: i18n.t('placement.chooseHighlightedTile'))
		);
	});

	function railStatusText(): string {
		const i18n = options.getI18n();
		const blocked = formatPlacementBlockReason(placement.feedback, i18n);
		if (blocked) {
			return blocked;
		}

		const preview = rail.preview;
		if (preview?.blockReason) {
			return (
				formatPlacementBlockReason(
					{ code: 'industry.rawPlacementBlocked', context: preview.blockReason },
					i18n
				) ?? i18n.t('railBuild.pickDestination')
			);
		}

		if (preview) {
			return i18n.t('railBuild.confirm', {
				cells: i18n.format.integer(preview.newCellKeys.length),
				cost: i18n.format.currency(preview.cost)
			});
		}

		return rail.mode.step === 'origin'
			? i18n.t('railBuild.pickOrigin')
			: i18n.t('railBuild.pickDestination');
	}

	function clearPlacementMode(): void {
		placement.clear();
		rail.cancelAll();
	}

	function openMenu(): void {
		const view = options.getView();
		if (
			view === 'world' ||
			(view === 'retail'
				? !placement.canStartRetailExpansion
				: !placement.canStartIndustryExpansion)
		) {
			return;
		}

		options.onMenuOpen();
		isMenuOpen = true;
		options.playSfx('sfx.ui.panel-open');
	}

	function armRetail(archetypeId: ArchetypeId): void {
		if (!placement.canStartRetailExpansion || !allowedRetailArchetypeIds.includes(archetypeId))
			return;
		placement.armRetail(archetypeId);
		rail.cancelAll();
		options.onClearSelections();
		isMenuOpen = false;
		options.playSfx('sfx.build.arm');
	}

	function armIndustry(buildingTypeId: IndustrialBuildingTypeId): void {
		if (
			!placement.canStartIndustryExpansion ||
			!allowedIndustryBuildingTypeIds.includes(buildingTypeId)
		)
			return;
		placement.armIndustry(buildingTypeId);
		rail.cancelAll();
		options.onClearSelections();
		isMenuOpen = false;
		options.playSfx('sfx.build.arm');
	}

	function toggleRail(): void {
		if (rail.isActive) {
			rail.cancelAll();
			placement.setFeedback(null);
			return;
		}

		if (
			!options.getGame() ||
			options.getView() !== 'industry' ||
			!options.getAvailability().buildRail
		) {
			return;
		}

		isMenuOpen = false;
		placement.clear();
		rail.enterOrigin();
	}

	function enterRailRouting(mode: RoutingMode): void {
		isMenuOpen = false;
		placement.clear();
		rail.enterRouting(mode);
	}

	function cancel(): void {
		clearPlacementMode();
		purchaseReviewSession.reset();
	}

	function tryConstructionClick(kind: 'retail' | 'industry', tileId: string): boolean {
		if (kind === 'retail') return placement.tryRetailClick(tileId);
		if (rail.isActive) {
			rail.handleClick(tileId);
			return true;
		}
		return placement.tryIndustryClick(tileId);
	}

	function closeReview(): void {
		if (purchaseReviewSession.state.confirmationPending) return;
		clearPlacementMode();
		purchaseReviewSession.close();
	}

	return {
		get isMenuOpen() {
			return isMenuOpen;
		},
		get isPlacementModeActive() {
			return isPlacementModeActive;
		},
		get isRailActive() {
			return rail.isActive;
		},
		get railMode(): RailBuildMode {
			return rail.mode;
		},
		get railPreviewRender() {
			return rail.render;
		},
		get placementFeedback() {
			return placement.feedback;
		},
		get placementStatusText() {
			return placementStatusText;
		},
		get retailBuildOptions() {
			return retailBuildOptions;
		},
		get industrialBuildOptions() {
			return industrialBuildOptions;
		},
		get retailPlacementPreview() {
			return placement.retailPlacementPreview;
		},
		get industryPlacementPreview() {
			return placement.industryPlacementPreview;
		},
		get availableMaterialIds() {
			return availableMaterialIds;
		},
		get industryLockedReason() {
			return industryLockedReason;
		},
		get allowedRetailArchetypeIds() {
			return allowedRetailArchetypeIds;
		},
		get allowedIndustryBuildingTypeIds() {
			return allowedIndustryBuildingTypeIds;
		},
		get canStartRetailExpansion() {
			return placement.canStartRetailExpansion;
		},
		get canStartIndustryExpansion() {
			return placement.canStartIndustryExpansion;
		},
		get canStartWarehousePlacement() {
			return canStartWarehousePlacement;
		},
		get canOpenStore() {
			return options.getAvailability().openStore;
		},
		get canFinanceRetailStore() {
			return options.getAvailability().financeRetailStore;
		},
		get canBuildIndustrialBuilding() {
			return options.getAvailability().buildIndustrialBuilding;
		},
		get canFinanceIndustrialBuilding() {
			return options.getAvailability().financeIndustrialBuilding;
		},
		get menuDisabledReason() {
			return menuDisabledReason;
		},
		get purchaseReview(): FinancePurchaseReviewState {
			return purchaseReviewSession.state;
		},
		openMenu,
		hideMenu(): void {
			isMenuOpen = false;
		},
		closeMenu(): void {
			isMenuOpen = false;
			options.playSfx('sfx.ui.panel-close');
		},
		armRetail,
		armIndustry,
		toggleRail,
		enterRailRouting,
		cancelRailStep(): void {
			rail.cancelStep();
		},
		cancel,
		review(purchase: PendingFinancedPurchase): void {
			purchaseReviewSession.open(purchase);
		},
		tryConstructionClick,
		confirmReview(): Promise<void> {
			return purchaseReviewSession.confirm();
		},
		closeReview
	};
}
