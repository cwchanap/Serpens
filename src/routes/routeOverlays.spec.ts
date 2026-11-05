import { describe, expect, it } from 'vitest';
import { resolveShortcutAction } from '$lib/game/keyboardShortcuts';
import {
	resolveEscapeTarget,
	selectOverlayGates,
	type EscapeResolution,
	type OverlayId,
	type OverlaySnapshot
} from './routeOverlays';

function snapshot(overrides: Partial<OverlaySnapshot> = {}): OverlaySnapshot {
	return {
		openOverlays: new Set(),
		isPlacementActive: false,
		isRailBuildActive: false,
		isFinanceReviewPending: false,
		selected: { worldCity: false, retailTile: false, industryTile: false, logisticsRoute: false },
		allowMenuFallback: true,
		...overrides
	};
}

const gates: [OverlayId, boolean, boolean, boolean][] = [
	['finance-review', true, true, false],
	['save-panel', true, true, false],
	['scenario-catalog', true, true, false],
	['scenario-results', true, true, false],
	['cheat-sheet', true, true, false],
	['supply-advisor', true, true, false],
	['store-detail', true, true, false],
	['build-menu', true, false, false],
	['game-menu', true, true, false],
	['alerts-menu', false, true, false],
	['management-panel', true, false, false]
];

describe('selectOverlayGates', () => {
	it('leaves an unobstructed map and shortcuts running', () => {
		expect(selectOverlayGates(snapshot())).toEqual({
			isMapPaused: false,
			hasBlockingOverlay: false,
			railKeyboardEnabled: true
		});
	});

	it.each(gates)('%s preserves its distinct gate membership', (overlay, map, shortcuts, rail) => {
		expect(selectOverlayGates(snapshot({ openOverlays: new Set([overlay]) }))).toEqual({
			isMapPaused: map,
			hasBlockingOverlay: shortcuts,
			railKeyboardEnabled: rail
		});
	});

	it.each(gates)(
		'placement keeps rendering through %s without enabling shortcuts or rail Escape',
		(overlay) => {
			expect(
				selectOverlayGates(
					snapshot({
						openOverlays: new Set([overlay]),
						isPlacementActive: true
					})
				)
			).toEqual({ isMapPaused: false, hasBlockingOverlay: true, railKeyboardEnabled: false });
		}
	);

	it('placement alone blocks shortcuts but leaves the canvas keyboard enabled', () => {
		expect(
			selectOverlayGates(snapshot({ isPlacementActive: true, isRailBuildActive: true }))
		).toEqual({
			isMapPaused: false,
			hasBlockingOverlay: true,
			railKeyboardEnabled: true
		});
	});

	it('pending finance confirmation only removes the finance map-pause reason', () => {
		const pending = snapshot({
			openOverlays: new Set(['finance-review']),
			isFinanceReviewPending: true
		});
		expect(selectOverlayGates(pending)).toEqual({
			isMapPaused: false,
			hasBlockingOverlay: true,
			railKeyboardEnabled: false
		});
		expect(
			selectOverlayGates({ ...pending, openOverlays: new Set(['finance-review', 'save-panel']) })
				.isMapPaused
		).toBe(true);
		expect(resolveEscapeTarget(pending)).toEqual({ type: 'external-owned', owner: 'dialog' });
	});

	it('management keeps the soft isMenuOpen shortcut path instead of blocking all keys', () => {
		const context = {
			...selectOverlayGates(snapshot({ openOverlays: new Set(['management-panel']) })),
			isMenuOpen: true,
			isTypingTarget: false,
			isInteractiveTarget: false,
			hasModifier: false,
			activeMapView: 'industry' as const,
			hasGame: true
		};
		expect(resolveShortcutAction({ ...context, key: 'h' })).toEqual({
			type: 'toggle-panel',
			panel: 'staff'
		});
		expect(resolveShortcutAction({ ...context, key: '1' })).toBeNull();
	});
});

describe('resolveEscapeTarget', () => {
	it.each<OverlayId>(['finance-review', 'scenario-catalog', 'scenario-results'])(
		'%s leaves Escape to its dialog',
		(overlay) => {
			expect(resolveEscapeTarget(snapshot({ openOverlays: new Set([overlay]) }))).toEqual({
				type: 'external-owned',
				owner: 'dialog'
			});
		}
	);

	const ordered: OverlayId[] = [
		'save-panel',
		'cheat-sheet',
		'supply-advisor',
		'store-detail',
		'build-menu',
		'game-menu',
		'alerts-menu'
	];
	it.each(ordered)('%s closes before rail, placement, management and selections', (overlay) => {
		const remaining = ordered.slice(ordered.indexOf(overlay));
		expect(
			resolveEscapeTarget(
				snapshot({
					openOverlays: new Set([...remaining, 'management-panel']),
					isRailBuildActive: true,
					isPlacementActive: true,
					selected: { worldCity: true, retailTile: true, industryTile: true, logisticsRoute: true }
				})
			)
		).toEqual({ type: 'close-overlay', overlay });
	});

	it('active rail leaves cancellation to the canvas before placement or management', () => {
		expect(
			resolveEscapeTarget(
				snapshot({
					openOverlays: new Set(['management-panel']),
					isPlacementActive: true,
					isRailBuildActive: true
				})
			)
		).toEqual({ type: 'external-owned', owner: 'canvas' });
	});

	it('finance owns Escape ahead of page dismissals and rail cancellation', () => {
		expect(
			resolveEscapeTarget(
				snapshot({
					openOverlays: new Set(['finance-review', 'save-panel', 'alerts-menu']),
					isRailBuildActive: true,
					isPlacementActive: true
				})
			)
		).toEqual({ type: 'external-owned', owner: 'dialog' });
	});

	it('cancels non-rail placement before closing management or clearing selections', () => {
		expect(
			resolveEscapeTarget(
				snapshot({
					openOverlays: new Set(['management-panel']),
					isPlacementActive: true,
					selected: { worldCity: true, retailTile: true, industryTile: true, logisticsRoute: true }
				})
			)
		).toEqual({ type: 'cancel-placement' });
	});

	it('closes management before clearing selections', () => {
		expect(
			resolveEscapeTarget(
				snapshot({
					openOverlays: new Set(['management-panel']),
					selected: { worldCity: true, retailTile: true, industryTile: true, logisticsRoute: true }
				})
			)
		).toEqual({ type: 'close-overlay', overlay: 'management-panel' });
	});

	it.each<[OverlaySnapshot['selected'], EscapeResolution]>([
		[
			{ worldCity: true, retailTile: true, industryTile: true, logisticsRoute: true },
			{ type: 'clear-selection', kind: 'worldCity' }
		],
		[
			{ worldCity: false, retailTile: true, industryTile: true, logisticsRoute: true },
			{ type: 'clear-selection', kind: 'retailTile' }
		],
		[
			{ worldCity: false, retailTile: false, industryTile: true, logisticsRoute: true },
			{ type: 'clear-selection', kind: 'industryTile' }
		],
		[
			{ worldCity: false, retailTile: false, industryTile: false, logisticsRoute: true },
			{ type: 'clear-selection', kind: 'logisticsRoute' }
		]
	])('clears only the first selected target in current priority: %j', (selected, expected) => {
		expect(resolveEscapeTarget(snapshot({ selected, allowMenuFallback: false }))).toEqual(expected);
	});

	it('opens the hamburger only when fallback is allowed and nothing else owns Escape', () => {
		expect(resolveEscapeTarget(snapshot())).toEqual({ type: 'open-game-menu' });
		expect(resolveEscapeTarget(snapshot({ allowMenuFallback: false }))).toEqual({ type: 'none' });
		expect(
			resolveEscapeTarget(
				snapshot({ openOverlays: new Set(['game-menu']), allowMenuFallback: false })
			)
		).toEqual({ type: 'close-overlay', overlay: 'game-menu' });
	});
});
