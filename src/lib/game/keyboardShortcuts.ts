import type { MapViewId } from './mapViewKeepAlive';

export type ManagementPanelId =
	| 'dashboard'
	| 'policies'
	| 'staff'
	| 'stores'
	| 'decisions'
	| 'reports'
	| 'productChains'
	| 'finance';

export type ShortcutAction =
	| { type: 'toggle-build' }
	| { type: 'advance-day' }
	| { type: 'view'; view: MapViewId }
	| { type: 'toggle-panel'; panel: ManagementPanelId };

export interface ShortcutContext {
	key: string;
	isTypingTarget: boolean;
	/**
	 * The keypress originates from a focused interactive control (button, link,
	 * summary, or an ARIA interactive role such as `button`/`menuitem`/`tab`).
	 * Only the control's native activation keys (Space/Enter) are suppressed so
	 * the browser can activate it; other keys (mnemonic letters, view digits)
	 * remain global hotkeys so focus-trapped menus stay toggleable.
	 */
	isInteractiveTarget: boolean;
	/** A Cmd/Ctrl/Alt modifier is held — leave the keypress to the browser/OS (e.g. Cmd+D bookmark). Shift is allowed. */
	hasModifier: boolean;
	/** Hard modal overlays (save panel, cheat sheet, store detail, supply advisor, alerts popover, game-menu hamburger, placement) suppress every shortcut. */
	hasBlockingOverlay: boolean;
	/** A soft menu (build menu or a management panel) is open — suppresses navigation keys, but menu-toggle keys still switch/close it. */
	isMenuOpen: boolean;
	activeMapView: MapViewId;
	hasGame: boolean;
}

/** Mnemonic letter keys that open/toggle each management panel. */
export const MANAGEMENT_PANEL_SHORTCUTS: Record<string, ManagementPanelId> = {
	d: 'dashboard',
	p: 'policies',
	s: 'staff',
	t: 'stores',
	c: 'decisions',
	r: 'reports',
	g: 'productChains',
	f: 'finance'
};

/** Panel id → the uppercase key that toggles it, for surfacing the hotkey in the UI. */
export const MANAGEMENT_PANEL_SHORTCUT_KEY = Object.fromEntries(
	Object.entries(MANAGEMENT_PANEL_SHORTCUTS).map(([key, panel]): [ManagementPanelId, string] => [
		panel,
		key.toUpperCase()
	])
) as Record<ManagementPanelId, string>;

export function resolveShortcutAction(context: ShortcutContext): ShortcutAction | null {
	if (context.isTypingTarget || context.hasModifier || context.hasBlockingOverlay) {
		return null;
	}

	const key = context.key.toLowerCase();

	// A focused interactive control owns only its native activation keys
	// (Space/Enter) — e.g. Space activates a button. Other keys are not native
	// activations, so mnemonic letters and view digits remain global hotkeys
	// even while focus is trapped on a menu button.
	if (context.isInteractiveTarget && (key === ' ' || key === 'enter')) {
		return null;
	}

	// Menu-toggle keys stay active even while another soft menu is open, so the
	// key can switch to (or close) its own menu. Panels open regardless of whether
	// a game exists yet — they fall back to an empty starter state.
	const panel = MANAGEMENT_PANEL_SHORTCUTS[key];
	if (panel) {
		return { type: 'toggle-panel', panel };
	}

	if (key === 'b') {
		return context.activeMapView === 'world' ? null : { type: 'toggle-build' };
	}

	// Navigation keys are suppressed while a soft menu (build / panel) is open.
	if (context.isMenuOpen) {
		return null;
	}

	switch (key) {
		case ' ':
			return context.hasGame ? { type: 'advance-day' } : null;
		case '1':
			return { type: 'view', view: 'retail' };
		case '2':
			return { type: 'view', view: 'industry' };
		case '3':
			return { type: 'view', view: 'world' };
		default:
			return null;
	}
}
