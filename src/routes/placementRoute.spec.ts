import { describe, expect, it } from 'vitest';
import type { PlacementPreview } from '$lib/game/placementPreview';
import { restrictPreviewToScenario } from './placementRoute';

describe('scenario placement preview restriction', () => {
	const preview: PlacementPreview = {
		validTileIds: ['allowed-1', 'blocked-1', 'allowed-2', 'blocked-2'],
		invalidTileIds: ['road', 'blocked-1', 'road'],
		requiredResource: 'water-source'
	};

	it('moves only forbidden valid anchors into the deduplicated invalid tiles', () => {
		const restricted = restrictPreviewToScenario(preview, (tileId) => tileId.startsWith('allowed'));
		expect(restricted).toEqual({
			validTileIds: ['allowed-1', 'allowed-2'],
			invalidTileIds: ['road', 'blocked-1', 'blocked-2'],
			requiredResource: 'water-source'
		});
		expect(preview.validTileIds).toEqual(['allowed-1', 'blocked-1', 'allowed-2', 'blocked-2']);
		expect(preview.invalidTileIds).toEqual(['road', 'blocked-1', 'road']);
	});

	it('keeps all valid anchors when every tile is allowed without allowing existing invalid tiles', () => {
		expect(restrictPreviewToScenario(preview, () => true)).toEqual({
			validTileIds: ['allowed-1', 'blocked-1', 'allowed-2', 'blocked-2'],
			invalidTileIds: ['road', 'blocked-1'],
			requiredResource: 'water-source'
		});
	});

	it('marks every formerly valid anchor invalid when none is allowed', () => {
		expect(restrictPreviewToScenario(preview, () => false)).toEqual({
			validTileIds: [],
			invalidTileIds: ['road', 'blocked-1', 'allowed-1', 'allowed-2', 'blocked-2'],
			requiredResource: 'water-source'
		});
	});

	it('leaves an empty retail preview empty', () => {
		expect(
			restrictPreviewToScenario({ validTileIds: [], invalidTileIds: [] }, () => false)
		).toEqual({ validTileIds: [], invalidTileIds: [] });
	});
});
