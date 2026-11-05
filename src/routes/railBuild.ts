import type { SfxCueId } from '$lib/audio/audioCatalog';
import type { IndustryMapRailPreviewRender } from '$lib/game/industryMapRender';
import type { PlacementBlockReason } from '$lib/game/placementPreview';
import { decisionContextRailNoValidPath } from '$lib/game/decisionContext';
import { getIndustryTileById } from '$lib/game/industry';
import { isTileInIndustryBuildingFootprint } from '$lib/game/industryFootprint';
import { parseRailCellKey } from '$lib/game/rail';
import {
	buildRailPreview,
	buildRailWaypointPreview,
	isRailWaypointTarget,
	type RailBuildInput,
	type RailBuildPreview
} from '$lib/game/railPlacement';
import type { GameState, IndustryCity } from '$lib/game/types';

export type RailBuildMode =
	| { step: 'idle' }
	| { step: 'origin' }
	| { step: 'routing'; originBuildingId: string; waypoints: Array<{ x: number; y: number }> };

export interface RailBuildClickInput {
	game: GameState | null;
	city: IndustryCity;
	mode: RailBuildMode;
	targetBuildingId: string | null;
}

interface RailBuildResult {
	mode: RailBuildMode;
	targetBuildingId: string | null;
	feedback: PlacementBlockReason | null;
	sfx?: SfxCueId;
	commit?: RailBuildInput;
}

export function reduceRailBuildClick(
	{ game, city, mode, targetBuildingId }: RailBuildClickInput,
	tileId: string
): RailBuildResult | null {
	if (!game || mode.step === 'idle') return null;
	const tile = getIndustryTileById(city, tileId);
	if (!tile) return null;
	const building = game.industrialBuildings.find(
		(candidate) =>
			candidate.cityId === city.id && isTileInIndustryBuildingFootprint(tile, candidate)
	);
	if (mode.step === 'origin') {
		return building
			? {
					mode: { step: 'routing', originBuildingId: building.id, waypoints: [] },
					targetBuildingId,
					feedback: null
				}
			: null;
	}
	if (building) {
		const commit = {
			originBuildingId: mode.originBuildingId,
			waypoints: mode.waypoints,
			destinationBuildingId: building.id
		};
		const preview = buildRailPreview(game, commit);
		if (preview.blockReason) {
			return {
				mode,
				targetBuildingId: building.id,
				feedback: { code: 'industry.rawPlacementBlocked', context: preview.blockReason },
				sfx: 'sfx.build.invalid'
			};
		}
		return targetBuildingId === building.id
			? { mode: { step: 'idle' }, targetBuildingId: null, feedback: null, commit }
			: { mode, targetBuildingId: building.id, feedback: null };
	}
	if (!isRailWaypointTarget(game, city.id, tile.x, tile.y)) {
		return {
			mode,
			targetBuildingId,
			feedback: { code: 'industry.rawPlacementBlocked', context: decisionContextRailNoValidPath() },
			sfx: 'sfx.build.invalid'
		};
	}
	return {
		mode: { ...mode, waypoints: [...mode.waypoints, { x: tile.x, y: tile.y }] },
		targetBuildingId,
		feedback: null
	};
}

export function cancelRailBuildStep(mode: RailBuildMode): RailBuildResult | null {
	if (mode.step === 'idle') return null;
	return {
		mode:
			mode.step === 'routing' && mode.waypoints.length > 0
				? { ...mode, waypoints: mode.waypoints.slice(0, -1) }
				: { step: 'idle' },
		// Backtracking invalidates both the destination highlight and its feedback.
		targetBuildingId: null,
		feedback: null
	};
}

export function deriveRailPreviewRender(
	game: GameState | null,
	mode: RailBuildMode,
	preview: RailBuildPreview | null
): IndustryMapRailPreviewRender | null {
	if (!game || mode.step !== 'routing') return null;
	const path = preview ?? buildRailWaypointPreview(game, mode.originBuildingId, mode.waypoints);
	if (!path) return null;
	const newCellKeys = new Set(path.newCellKeys);
	return {
		cells: path.pathKeys.map((key) => ({ ...parseRailCellKey(key), isNew: newCellKeys.has(key) }))
	};
}
