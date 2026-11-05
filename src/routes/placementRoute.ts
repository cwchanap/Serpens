import type { PlacementPreview } from '$lib/game/placementPreview';

export function restrictPreviewToScenario(
	preview: PlacementPreview,
	allowTile: (tileId: string) => boolean
): PlacementPreview {
	const validTileIds = preview.validTileIds.filter(allowTile);
	const allowedTileIds = new Set(validTileIds);
	return {
		...preview,
		validTileIds,
		invalidTileIds: [
			...new Set([
				...preview.invalidTileIds,
				...preview.validTileIds.filter((tileId) => !allowedTileIds.has(tileId))
			])
		]
	};
}
