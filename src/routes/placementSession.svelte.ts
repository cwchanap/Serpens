import type { SfxCueId } from '$lib/audio/audioCatalog';
import { getTileById } from '$lib/game/city';
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview,
	getIndustryBuildPlacementBlockReason,
	getRetailPlacementBlockReason,
	resolveIndustryPlacementAnchorTileId,
	resolveRetailPlacementAnchorTileId,
	type PlacementBlockReason
} from '$lib/game/placementPreview';
import { getExpansionFinanceOffer } from '$lib/game/finance';
import { getExpansionSetupCost } from '$lib/game/state';
import { isWorldCityId } from '$lib/game/worldCatalog';
import type {
	ArchetypeId,
	City,
	GameState,
	IndustryCity,
	IndustrialBuildingTypeId
} from '$lib/game/types';
import type { ScenarioDefinition } from '$lib/scenarios/types';
import { isLiveScenarioContentAllowed } from './scenarioRoute';
import { restrictPreviewToScenario } from './placementRoute';
import {
	resolveExpansionPurchasePaymentPath,
	type PendingFinancedPurchase
} from './financePurchaseReview';
import type { GameRouteController, MutationAvailability } from './gameRouteController';

export type PlacementSessionCommands = Pick<
	GameRouteController,
	'foundStore' | 'openStore' | 'buildIndustrialBuilding'
>;

interface PlacementSessionOptions {
	getGame(): GameState | null;
	getRetailCity(): City;
	getIndustryCity(): IndustryCity;
	/** Presentation fallback game (pre-founding preview): source of the founding seed. */
	getFallback(): GameState;
	getMode(): 'sandbox' | 'scenario';
	getDefinition(): ScenarioDefinition | null;
	getAvailability(): MutationAvailability;
	/** Menu-offered ids, re-checked at click time so a live permission or definition change disarms a placed click. */
	getAllowedRetailArchetypeIds(): ArchetypeId[];
	getAllowedIndustryBuildingTypeIds(): IndustrialBuildingTypeId[];
	commands: PlacementSessionCommands;
	playSfx(cueId: SfxCueId): void;
	/** Selects a placement-feedback tile and clears the other placement selections. */
	onSelectPlacementTile(kind: 'retail' | 'industry', tileId: string): void;
	onClearSelections(): void;
	/** Pauses the auto-tick when the founding store is placed. */
	onFoundingPause(): void;
	/** Opens the construction-owned purchase review for a finance-path placement. */
	onOpenReview(purchase: PendingFinancedPurchase): void;
	/** Runs after a cash-path or founding commit: clears selections, armed placement and any pending review. */
	onSettled(): void;
}

/**
 * Route-side session for armed retail/industry placements: owns the armed
 * archetype/building atoms, the placement feedback atom and the scenario-
 * restricted previews, and applies the pure `placementPreview.ts` /
 * `placementRoute.ts` decisions to real clicks. The rail session shares the
 * feedback atom through `setFeedback`; construction guarantees placements and
 * rail mode are mutually exclusive (each entry point cancels the other).
 */
export function createPlacementSession(options: PlacementSessionOptions) {
	let retailArchetypeId = $state<ArchetypeId | null>(null);
	let industryBuildingTypeId = $state<IndustrialBuildingTypeId | null>(null);
	let placementFeedback = $state<PlacementBlockReason | null>(null);

	const availability = $derived(options.getAvailability());
	const canStartRetailExpansion = $derived(
		availability.openStore || availability.financeRetailStore
	);
	const canStartIndustryExpansion = $derived(
		availability.buildIndustrialBuilding || availability.financeIndustrialBuilding
	);
	const retailPlacementPreview = $derived.by(() => {
		if (retailArchetypeId === null) return null;
		const city = options.getRetailCity();
		const preview = createRetailPlacementPreview({
			game: options.getGame(),
			city,
			archetypeId: retailArchetypeId,
			cashCommandAvailable: availability.openStore,
			financeCommandAvailable: availability.financeRetailStore
		});
		if (options.getMode() === 'sandbox' || !definition()) return preview;
		if (!isWorldCityId(city.id)) return { ...preview, validTileIds: [] };
		const archetypeId = retailArchetypeId;
		const cityId = city.id;
		return restrictPreviewToScenario(preview, (tileId) =>
			isLiveScenarioContentAllowed(options.getMode(), definition(), {
				kind: 'retail-placement',
				cityId,
				tileId,
				archetypeId
			})
		);
	});
	const industryPlacementPreview = $derived.by(() => {
		if (industryBuildingTypeId === null) return null;
		const city = options.getIndustryCity();
		const preview = createIndustryPlacementPreview({
			game: options.getGame(),
			buildingTypeId: industryBuildingTypeId,
			financeCommandAvailable: availability.financeIndustrialBuilding
		});
		if (options.getMode() === 'sandbox' || !definition()) return preview;
		if (!isWorldCityId(city.id)) return { ...preview, validTileIds: [] };
		const buildingTypeId = industryBuildingTypeId;
		const cityId = city.id;
		return restrictPreviewToScenario(preview, (tileId) =>
			isLiveScenarioContentAllowed(options.getMode(), definition(), {
				kind: 'industrial-placement',
				cityId,
				tileId,
				buildingTypeId
			})
		);
	});

	function definition(): ScenarioDefinition | null {
		return options.getDefinition();
	}

	function setFeedback(feedback: PlacementBlockReason | null): void {
		placementFeedback = feedback;
	}

	function clear(): void {
		retailArchetypeId = null;
		industryBuildingTypeId = null;
		placementFeedback = null;
	}

	function armRetail(archetypeId: ArchetypeId): void {
		retailArchetypeId = archetypeId;
		industryBuildingTypeId = null;
		placementFeedback = null;
	}

	function armIndustry(buildingTypeId: IndustrialBuildingTypeId): void {
		industryBuildingTypeId = buildingTypeId;
		retailArchetypeId = null;
		placementFeedback = null;
	}

	function placeRetailAtTile(archetypeId: ArchetypeId, tileId: string): void {
		if (!canStartRetailExpansion || !options.getAllowedRetailArchetypeIds().includes(archetypeId))
			return;
		// Don't early-return on tiles outside the preview's validTileIds: let
		// the block-reason helper run so a click on a road/river/occupied tile
		// surfaces the specific reason instead of a silent no-op.
		const blockReason = getRetailPlacementBlockReason({
			game: options.getGame(),
			city: options.getRetailCity(),
			tileId,
			archetypeId,
			cashCommandAvailable: availability.openStore,
			financeCommandAvailable: availability.financeRetailStore
		});

		if (blockReason) {
			options.onSelectPlacementTile('retail', tileId);
			placementFeedback = blockReason;
			options.playSfx('sfx.build.invalid');
			return;
		}

		const game = options.getGame();
		if (!game) {
			if (!availability.openStore) return;
			const tile = getTileById(options.getRetailCity(), tileId);

			if (!tile) {
				placementFeedback = { code: 'retail.unknownCityTile' };
				options.playSfx('sfx.build.invalid');
				return;
			}

			// Pause the auto-tick so the player can review their newly founded
			// store before time starts flowing.
			options.onFoundingPause();
			void options.commands.foundStore({
				archetypeId,
				city: options.getRetailCity(),
				tileId: tile.id,
				seed: options.getFallback().seed
			});
		} else {
			const tile = getTileById(options.getRetailCity(), tileId);
			if (!tile) {
				placementFeedback = { code: 'retail.unknownCityTile' };
				options.playSfx('sfx.build.invalid');
				return;
			}
			const expectedCost = getExpansionSetupCost(tile, archetypeId);
			const paymentPath = resolveExpansionPurchasePaymentPath({
				cashCommandAvailable: availability.openStore,
				financeCommandAvailable: availability.financeRetailStore,
				cash: game.cash,
				expectedCost
			});
			if (paymentPath === 'finance') {
				const offer = getExpansionFinanceOffer(game, expectedCost);
				if (!offer) {
					placementFeedback = { code: 'retail.requiresCash', amount: expectedCost };
					options.playSfx('sfx.build.invalid');
					return;
				}
				options.onOpenReview({ kind: 'retail', tileId, archetypeId, expectedCost, offer });
				clear();
				options.onSelectPlacementTile('retail', tileId);
				return;
			}
			if (paymentPath === 'requiresCash') {
				placementFeedback = { code: 'retail.requiresCash', amount: expectedCost };
				options.playSfx('sfx.build.invalid');
				return;
			}
			void options.commands.openStore(tileId, archetypeId);
		}

		options.onSettled();
	}

	function placeIndustryAtTile(buildingTypeId: IndustrialBuildingTypeId, tileId: string): void {
		if (
			!canStartIndustryExpansion ||
			!options.getAllowedIndustryBuildingTypeIds().includes(buildingTypeId)
		)
			return;
		// Don't early-return on tiles outside the preview's validTileIds: let
		// the block-reason helper run so a click on a wrong-resource/occupied
		// tile surfaces the specific reason instead of a silent no-op.
		const blockReason = getIndustryBuildPlacementBlockReason({
			game: options.getGame(),
			tileId,
			buildingTypeId,
			financeCommandAvailable: availability.financeIndustrialBuilding
		});

		if (blockReason) {
			options.onSelectPlacementTile('industry', tileId);
			placementFeedback = blockReason;
			options.playSfx('sfx.build.invalid');
			return;
		}

		const game = options.getGame();
		if (!game) {
			placementFeedback = { code: 'industry.lockedUntilRetail' };
			options.playSfx('sfx.build.invalid');
			return;
		}

		const expectedCost = INDUSTRIAL_BUILDING_TYPES[buildingTypeId]?.buildCost;
		if (expectedCost === undefined) {
			placementFeedback = { code: 'industry.unknownBuildingType' };
			options.playSfx('sfx.build.invalid');
			return;
		}
		const paymentPath = resolveExpansionPurchasePaymentPath({
			cashCommandAvailable: availability.buildIndustrialBuilding,
			financeCommandAvailable: availability.financeIndustrialBuilding,
			cash: game.cash,
			expectedCost
		});
		if (paymentPath === 'finance') {
			const offer = getExpansionFinanceOffer(game, expectedCost);
			if (!offer) {
				placementFeedback = { code: 'industry.requiresCash', buildingTypeId, amount: expectedCost };
				options.playSfx('sfx.build.invalid');
				return;
			}
			options.onOpenReview({
				kind: 'industry',
				tileId,
				buildingTypeId,
				expectedCost,
				offer
			});
			clear();
			options.onSelectPlacementTile('industry', tileId);
			return;
		}
		if (paymentPath === 'requiresCash') {
			placementFeedback = { code: 'industry.requiresCash', buildingTypeId, amount: expectedCost };
			options.playSfx('sfx.build.invalid');
			return;
		}

		void options.commands.buildIndustrialBuilding(tileId, buildingTypeId);
		options.onSettled();
	}

	function tryRetailClick(tileId: string): boolean {
		if (retailArchetypeId === null) return false;
		// Placement previews only mark valid 2x2 anchors. If the user clicks a
		// non-anchor cell that sits inside a valid footprint, resolve to that
		// footprint's anchor so the click places the store instead of being
		// rejected as an invalid anchor.
		const anchorTileId = retailPlacementPreview
			? resolveRetailPlacementAnchorTileId(retailPlacementPreview, options.getRetailCity(), tileId)
			: tileId;
		placeRetailAtTile(retailArchetypeId, anchorTileId);
		return true;
	}

	function tryIndustryClick(tileId: string): boolean {
		if (industryBuildingTypeId === null) return false;
		const anchorTileId = industryPlacementPreview
			? resolveIndustryPlacementAnchorTileId(
					industryPlacementPreview,
					options.getIndustryCity(),
					tileId
				)
			: tileId;
		placeIndustryAtTile(industryBuildingTypeId, anchorTileId);
		return true;
	}

	return {
		get canStartRetailExpansion() {
			return canStartRetailExpansion;
		},
		get canStartIndustryExpansion() {
			return canStartIndustryExpansion;
		},
		get isArmed() {
			return retailArchetypeId !== null || industryBuildingTypeId !== null;
		},
		get feedback() {
			return placementFeedback;
		},
		get retailPlacementPreview() {
			return retailPlacementPreview;
		},
		get industryPlacementPreview() {
			return industryPlacementPreview;
		},
		setFeedback,
		clear,
		armRetail,
		armIndustry,
		tryRetailClick,
		tryIndustryClick
	};
}
