import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import { buildRailPreview } from '$lib/game/railPlacement';
import type { IndustrialBuilding, IndustryCity } from '$lib/game/types';
import {
	cancelRailBuildStep,
	deriveRailPreviewRender,
	reduceRailBuildClick,
	type RailBuildMode
} from './railBuild';

function fixture() {
	const city: IndustryCity = {
		id: 'industry-city',
		name: 'Industry City',
		width: 16,
		height: 10,
		rails: [{ x: 5, y: 2, level: 1 }],
		tiles: Array.from({ length: 160 }, (_, i) => {
			const x = i % 16;
			const y = Math.floor(i / 16);
			return {
				id: `tile-${x}-${y}`,
				cityId: 'industry-city',
				x,
				y,
				terrain: x === 0 ? 'blocked' : 'industrial',
				resource: null,
				locked: x === 15
			};
		})
	};
	function building(id: string, mapX: number): IndustrialBuilding {
		return {
			id,
			cityId: city.id,
			tileId: `tile-${mapX}-2`,
			mapX,
			mapY: 2,
			typeId: 'flour-mill',
			level: 1,
			status: 'idle',
			inventory: {},
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0
		};
	}
	const game = {
		...createNewGame('convenience', 42),
		cash: 100_000,
		industryCities: [city],
		activeIndustryCityId: city.id,
		industrialBuildings: [building('origin', 2), building('destination', 10)]
	};
	return {
		game,
		city,
		mode: { step: 'routing', originBuildingId: 'origin', waypoints: [] } as RailBuildMode,
		targetBuildingId: null as string | null
	};
}

describe('reduceRailBuildClick', () => {
	it('ignores no-game, idle and unknown-tile clicks without clearing feedback', () => {
		const input = fixture();
		for (const override of [{ game: null }, { mode: { step: 'idle' } as RailBuildMode }]) {
			expect(reduceRailBuildClick({ ...input, ...override }, 'tile-10-2')).toBeNull();
		}
		expect(reduceRailBuildClick(input, 'unknown')).toBeNull();
	});

	it('selects an origin from any footprint cell, ignoring empty and other-city buildings', () => {
		const input = { ...fixture(), mode: { step: 'origin' } as RailBuildMode };
		expect(reduceRailBuildClick(input, 'tile-7-6')).toBeNull();
		input.game.industrialBuildings[0]!.cityId = 'other-city';
		expect(reduceRailBuildClick(input, 'tile-3-3')).toBeNull();
		input.game.industrialBuildings[0]!.cityId = input.city.id;
		expect(reduceRailBuildClick(input, 'tile-3-3')).toEqual({
			mode: { step: 'routing', originBuildingId: 'origin', waypoints: [] },
			targetBuildingId: null,
			feedback: null
		});
	});

	it('previews the first valid destination and commits only a repeated destination click, without mutating game', () => {
		const input = fixture();
		const before = structuredClone(input.game);
		const first = reduceRailBuildClick(input, 'tile-11-3');
		expect(first).toEqual({ mode: input.mode, targetBuildingId: 'destination', feedback: null });
		const second = reduceRailBuildClick(
			{ ...input, targetBuildingId: first!.targetBuildingId },
			'tile-10-2'
		);
		expect(second).toEqual({
			mode: { step: 'idle' },
			targetBuildingId: null,
			feedback: null,
			commit: { originBuildingId: 'origin', destinationBuildingId: 'destination', waypoints: [] }
		});
		expect(input.game).toEqual(before);
	});

	it('rechecks live cash even for a previously previewed destination and returns invalid SFX/feedback, not a commit', () => {
		const input = fixture();
		input.game.cash = 0;
		const result = reduceRailBuildClick({ ...input, targetBuildingId: 'destination' }, 'tile-10-2');
		expect(result).toMatchObject({
			mode: input.mode,
			targetBuildingId: 'destination',
			feedback: { code: 'industry.rawPlacementBlocked', context: { code: 'railRequiresCash' } },
			sfx: 'sfx.build.invalid'
		});
		expect(result?.commit).toBeUndefined();
	});

	it('keeps a blocked destination as the preview target and never commits self-connections', () => {
		const input = fixture();
		const result = reduceRailBuildClick(input, 'tile-2-2');
		expect(result).toMatchObject({
			mode: input.mode,
			targetBuildingId: 'origin',
			feedback: { context: { code: 'railSelfConnected' } },
			sfx: 'sfx.build.invalid'
		});
		expect(result?.commit).toBeUndefined();
	});

	it.each(['tile-0-6', 'tile-15-6'])(
		'rejects blocked/locked waypoint %s without extending the route or clearing its target',
		(tileId) => {
			const input = { ...fixture(), targetBuildingId: 'destination' };
			expect(reduceRailBuildClick(input, tileId)).toMatchObject({
				mode: input.mode,
				targetBuildingId: 'destination',
				feedback: { code: 'industry.rawPlacementBlocked', context: { code: 'railNoValidPath' } },
				sfx: 'sfx.build.invalid'
			});
		}
	);

	it('appends legal and existing-rail waypoints immutably, clearing feedback while preserving the destination', () => {
		const input = { ...fixture(), targetBuildingId: 'destination' };
		const first = reduceRailBuildClick(input, 'tile-7-6')!;
		const second = reduceRailBuildClick({ ...input, mode: first.mode }, 'tile-5-2')!;
		expect(second).toEqual({
			mode: {
				step: 'routing',
				originBuildingId: 'origin',
				waypoints: [
					{ x: 7, y: 6 },
					{ x: 5, y: 2 }
				]
			},
			targetBuildingId: 'destination',
			feedback: null
		});
		expect(input.mode).toEqual({ step: 'routing', originBuildingId: 'origin', waypoints: [] });
	});
});

describe('cancelRailBuildStep', () => {
	it('pops exactly one waypoint and clears stale destination/feedback, then exits only after the final empty-route cancel', () => {
		const mode: RailBuildMode = {
			step: 'routing',
			originBuildingId: 'origin',
			waypoints: [
				{ x: 7, y: 6 },
				{ x: 8, y: 6 }
			]
		};
		const first = cancelRailBuildStep(mode)!;
		expect(first).toEqual({
			mode: { step: 'routing', originBuildingId: 'origin', waypoints: [{ x: 7, y: 6 }] },
			targetBuildingId: null,
			feedback: null
		});
		const second = cancelRailBuildStep(first.mode)!;
		expect(second.mode).toEqual({ step: 'routing', originBuildingId: 'origin', waypoints: [] });
		expect(cancelRailBuildStep(second.mode)).toEqual({
			mode: { step: 'idle' },
			targetBuildingId: null,
			feedback: null
		});
		expect(mode.waypoints).toHaveLength(2);
	});

	it('exits origin selection but leaves idle feedback alone', () => {
		expect(cancelRailBuildStep({ step: 'origin' })).toEqual({
			mode: { step: 'idle' },
			targetBuildingId: null,
			feedback: null
		});
		expect(cancelRailBuildStep({ step: 'idle' })).toBeNull();
	});
});

describe('deriveRailPreviewRender', () => {
	it('renders a destination path with new and reused cells', () => {
		const { game, mode } = fixture();
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			destinationBuildingId: 'destination',
			waypoints: []
		});
		expect(deriveRailPreviewRender(game, mode, preview)).toEqual({
			cells: [
				{ x: 4, y: 2, isNew: true },
				{ x: 5, y: 2, isNew: false },
				{ x: 6, y: 2, isNew: true },
				{ x: 7, y: 2, isNew: true },
				{ x: 8, y: 2, isNew: true },
				{ x: 9, y: 2, isNew: true }
			]
		});
	});

	it('shows origin attach cells and extends through waypoints when no destination is selected', () => {
		const { game, mode } = fixture();
		const attach = deriveRailPreviewRender(game, mode, null)!;
		expect(attach.cells).toContainEqual({ x: 4, y: 2, isNew: true });
		expect(attach.cells).not.toContainEqual({ x: 2, y: 2, isNew: true });
		const routed = deriveRailPreviewRender(
			game,
			{ step: 'routing', originBuildingId: 'origin', waypoints: [{ x: 7, y: 6 }] },
			null
		)!;
		expect(routed.cells).toContainEqual({ x: 7, y: 6, isNew: true });
	});

	it('clears rendering without game/routing or when the partial path is invalid', () => {
		const { game, mode } = fixture();
		expect(deriveRailPreviewRender(null, mode, null)).toBeNull();
		expect(deriveRailPreviewRender(game, { step: 'origin' }, null)).toBeNull();
		expect(deriveRailPreviewRender(game, { step: 'idle' }, null)).toBeNull();
		expect(
			deriveRailPreviewRender(
				game,
				{ step: 'routing', originBuildingId: 'missing', waypoints: [] },
				null
			)
		).toBeNull();
	});
});
