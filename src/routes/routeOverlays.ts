export type OverlayId =
	| 'finance-review'
	| 'save-panel'
	| 'scenario-catalog'
	| 'scenario-results'
	| 'cheat-sheet'
	| 'supply-advisor'
	| 'store-detail'
	| 'build-menu'
	| 'game-menu'
	| 'alerts-menu'
	| 'management-panel';

export type OverlaySnapshot = {
	openOverlays: ReadonlySet<OverlayId>;
	isPlacementActive: boolean;
	isRailBuildActive: boolean; // origin OR routing
	isFinanceReviewPending: boolean;
	selected: {
		worldCity: boolean;
		retailTile: boolean;
		industryTile: boolean;
		logisticsRoute: boolean;
	};
	allowMenuFallback: boolean;
};

export type EscapeResolution =
	| { type: 'external-owned'; owner: 'canvas' | 'dialog' }
	| { type: 'close-overlay'; overlay: OverlayId }
	| { type: 'cancel-placement' }
	| {
			type: 'clear-selection';
			kind: 'worldCity' | 'retailTile' | 'industryTile' | 'logisticsRoute';
	  }
	| { type: 'open-game-menu' }
	| { type: 'none' };

type OverlayPolicy = {
	pausesMap: boolean;
	blocksShortcuts: boolean;
	disablesRailKeyboard: boolean;
};

const OVERLAY_POLICY: Record<OverlayId, OverlayPolicy> = {
	'finance-review': { pausesMap: true, blocksShortcuts: true, disablesRailKeyboard: true },
	'save-panel': { pausesMap: true, blocksShortcuts: true, disablesRailKeyboard: true },
	'scenario-catalog': { pausesMap: true, blocksShortcuts: true, disablesRailKeyboard: true },
	'scenario-results': { pausesMap: true, blocksShortcuts: true, disablesRailKeyboard: true },
	'cheat-sheet': { pausesMap: true, blocksShortcuts: true, disablesRailKeyboard: true },
	'supply-advisor': { pausesMap: true, blocksShortcuts: true, disablesRailKeyboard: true },
	'store-detail': { pausesMap: true, blocksShortcuts: true, disablesRailKeyboard: true },
	'build-menu': { pausesMap: true, blocksShortcuts: false, disablesRailKeyboard: true },
	'game-menu': { pausesMap: true, blocksShortcuts: true, disablesRailKeyboard: true },
	'alerts-menu': { pausesMap: false, blocksShortcuts: true, disablesRailKeyboard: true },
	'management-panel': { pausesMap: true, blocksShortcuts: false, disablesRailKeyboard: true }
};

// Page-owned dismissals before rail/placement; management closes after placement.
export const ESCAPE_ORDER = [
	'save-panel',
	'cheat-sheet',
	'supply-advisor',
	'store-detail',
	'build-menu',
	'game-menu',
	'alerts-menu'
] as const satisfies readonly OverlayId[];

export function selectOverlayGates(snapshot: OverlaySnapshot) {
	let isMapPaused = false;
	let hasBlockingOverlay = snapshot.isPlacementActive;
	let railKeyboardEnabled = true;
	for (const overlay of snapshot.openOverlays) {
		const policy = OVERLAY_POLICY[overlay];
		// A confirming finance commit needs the renderer to consume its activity batch.
		if (!(overlay === 'finance-review' && snapshot.isFinanceReviewPending)) {
			isMapPaused ||= policy.pausesMap;
		}
		hasBlockingOverlay ||= policy.blocksShortcuts;
		railKeyboardEnabled &&= !policy.disablesRailKeyboard;
	}
	return {
		isMapPaused: !snapshot.isPlacementActive && isMapPaused,
		hasBlockingOverlay,
		railKeyboardEnabled
	};
}

export function resolveEscapeTarget(snapshot: OverlaySnapshot): EscapeResolution {
	const open = snapshot.openOverlays;
	// Finance captures Escape; catalog/results stop it inside their own dialogs.
	if (open.has('finance-review') || open.has('scenario-catalog') || open.has('scenario-results')) {
		return { type: 'external-owned', owner: 'dialog' };
	}
	for (const overlay of ESCAPE_ORDER) {
		if (open.has(overlay)) return { type: 'close-overlay', overlay };
	}
	// IndustryMap already pops one waypoint (or exits origin mode) for this event.
	if (snapshot.isRailBuildActive) return { type: 'external-owned', owner: 'canvas' };
	if (snapshot.isPlacementActive) return { type: 'cancel-placement' };
	if (open.has('management-panel')) return { type: 'close-overlay', overlay: 'management-panel' };
	if (snapshot.selected.worldCity) return { type: 'clear-selection', kind: 'worldCity' };
	if (snapshot.selected.retailTile) return { type: 'clear-selection', kind: 'retailTile' };
	if (snapshot.selected.industryTile) return { type: 'clear-selection', kind: 'industryTile' };
	if (snapshot.selected.logisticsRoute) return { type: 'clear-selection', kind: 'logisticsRoute' };
	return snapshot.allowMenuFallback ? { type: 'open-game-menu' } : { type: 'none' };
}
