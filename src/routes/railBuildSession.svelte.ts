import type { SfxCueId } from '$lib/audio/audioCatalog';
import type { IndustryMapRailPreviewRender } from '$lib/game/industryMapRender';
import type { PlacementBlockReason } from '$lib/game/placementPreview';
import { buildRailPreview, type RailBuildPreview } from '$lib/game/railPlacement';
import type { GameState, IndustryCity } from '$lib/game/types';
import {
	cancelRailBuildStep,
	deriveRailPreviewRender,
	reduceRailBuildClick,
	type RailBuildMode
} from './railBuild';
import type { GameRouteController } from './gameRouteController';

export type RailBuildSessionCommands = Pick<GameRouteController, 'buildRail'>;

interface RailBuildSessionOptions {
	getGame(): GameState | null;
	getCity(): IndustryCity;
	commands: RailBuildSessionCommands;
	playSfx(cueId: SfxCueId): void;
	/**
	 * Rail clicks and step cancels share construction's single placement
	 * feedback atom; the session never keeps a second feedback authority.
	 */
	setFeedback(feedback: PlacementBlockReason | null): void;
}

/**
 * Route-side session for interactive rail building: owns the mode machine and
 * the last attempted destination, and applies the pure `railBuild.ts`
 * reducers to real clicks. `cancelStep` pops exactly one step per call
 * (one waypoint, or the origin step); `cancelAll` exits rail mode entirely.
 */
export function createRailBuildSession(options: RailBuildSessionOptions) {
	let mode = $state<RailBuildMode>({ step: 'idle' });
	// Set on each destination-building click while routing, so the derived
	// preview below can keep showing the last attempted path (including
	// blocked attempts) until the player clicks a different building or
	// cancels. There is no map hover event to drive this continuously.
	let targetBuildingId = $state<string | null>(null);

	// Full preview (path, new/reused cells, cost, block reason) for the last
	// destination-building attempt while routing. There is no continuous map
	// hover event, so this only updates on a destination click — including a
	// blocked one, so the toast and the highlighted path stay in sync.
	const preview = $derived.by<RailBuildPreview | null>(() => {
		const game = options.getGame();
		if (mode.step !== 'routing' || !game || targetBuildingId === null) {
			return null;
		}
		return buildRailPreview(game, {
			originBuildingId: mode.originBuildingId,
			waypoints: mode.waypoints,
			destinationBuildingId: targetBuildingId
		});
	});
	const render = $derived(deriveRailPreviewRender(options.getGame(), mode, preview));

	function handleClick(tileId: string): void {
		const result = reduceRailBuildClick(
			{
				game: options.getGame(),
				city: options.getCity(),
				mode,
				targetBuildingId
			},
			tileId
		);
		if (!result) return;
		if (result.commit) void options.commands.buildRail(result.commit);
		mode = result.mode;
		targetBuildingId = result.targetBuildingId;
		options.setFeedback(result.feedback);
		if (result.sfx) options.playSfx(result.sfx);
	}

	function cancelStep(): void {
		const result = cancelRailBuildStep(mode);
		if (!result) return;
		mode = result.mode;
		targetBuildingId = result.targetBuildingId;
		options.setFeedback(result.feedback);
	}

	function enterRouting(next: Extract<RailBuildMode, { step: 'routing' }>): void {
		mode = next;
		targetBuildingId = null;
	}

	function enterOrigin(): void {
		mode = { step: 'origin' };
		targetBuildingId = null;
	}

	function cancelAll(): void {
		mode = { step: 'idle' };
		targetBuildingId = null;
	}

	return {
		get mode(): RailBuildMode {
			return mode;
		},
		get isActive(): boolean {
			return mode.step !== 'idle';
		},
		get isIdle(): boolean {
			return mode.step === 'idle';
		},
		get targetBuildingId(): string | null {
			return targetBuildingId;
		},
		get preview(): RailBuildPreview | null {
			return preview;
		},
		get render(): IndustryMapRailPreviewRender | null {
			return render;
		},
		handleClick,
		cancelStep,
		enterRouting,
		enterOrigin,
		cancelAll
	};
}
