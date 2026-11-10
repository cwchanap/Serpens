import { resolveShortcutAction, type ManagementPanelId } from '$lib/game/keyboardShortcuts';
import type { MapViewId } from '$lib/game/mapViewKeepAlive';
import {
	resolveEscapeTarget,
	selectOverlayGates,
	type OverlayId,
	type OverlaySnapshot
} from './routeOverlays';

/** Selection kinds the root may clear on Escape, mirroring the map session. */
export type RouteSelectionKind = 'worldCity' | 'retailTile' | 'industryTile' | 'logisticsRoute';

interface RouteKeyboardOptions {
	/** Root-derived read-only overlay snapshot; read at event time, never copied. */
	getOverlaySnapshot(): OverlaySnapshot;
	/** Derived root flag indicating if a blocking modal overlay is open. */
	getHasBlockingOverlay?(): boolean;
	/** A soft menu (build menu or a management panel) is open. */
	getIsMenuOpen(): boolean;
	getActiveMapView(): MapViewId;
	getHasGame(): boolean;
	unlockAudio(): void;
	toggleCheatSheet(): void;
	/** Root dispatch switch; owns silent-vs-user-close semantics per overlay. */
	closeOverlay(id: OverlayId): void;
	cancelConstruction(): void;
	/** Root dispatch: any clear also drops the paired logistics selection. */
	clearSelection(kind: RouteSelectionKind): void;
	openGameMenu(): void;
	toggleBuild(): void;
	togglePanel(panel: ManagementPanelId): void;
	togglePause(): void;
	showView(view: MapViewId): void;
}

function isTypingElement(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	const tag = target.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

// Interactive controls (buttons, links, disclosure summaries, and ARIA
// interactive roles) own their native activation keys — Space activates a
// button, so the global shortcut handler must not hijack it and call
// preventDefault(). Mnemonic letters are not native activations, so they stay
// global hotkeys even from focused controls; dedicated keys (`?`, Escape) are
// handled separately and stay unaffected by both guards.
const INTERACTIVE_CONTROL_SELECTOR =
	'button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"]';

function isInteractiveControl(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	return target.closest(INTERACTIVE_CONTROL_SELECTOR) !== null;
}

/**
 * Route keyboard owner: the page's single window keydown handler, as an
 * event-time adapter rather than overlay state. Every input is a live getter
 * over the existing owners; every effect is an explicit named operation back
 * to the page's dispatch switches. Escape results owned elsewhere (finance
 * and scenario dialogs, the industry canvas) are left untouched.
 */
export function createRouteKeyboard(options: RouteKeyboardOptions) {
	function handleKeydown(event: KeyboardEvent): void {
		options.unlockAudio();

		// Leave Cmd/Ctrl/Alt combinations to the browser/OS (e.g. Cmd+D, Cmd+S) —
		// only bare keypresses (Shift allowed) drive game shortcuts.
		const hasModifier = event.metaKey || event.ctrlKey || event.altKey;

		if (event.key === '?' && !hasModifier) {
			// `?` is a true toggle: it opens the cheat sheet when no overlay is
			// active, and closes it when the cheat sheet itself is the open
			// overlay. It stays suppressed when a *different* modal is open so
			// it can't stack on top of it.
			const snapshot = options.getOverlaySnapshot();
			const isCheatSheetOpen = snapshot.openOverlays.has('cheat-sheet');
			const hasBlocking =
				options.getHasBlockingOverlay !== undefined
					? options.getHasBlockingOverlay()
					: selectOverlayGates(snapshot).hasBlockingOverlay;
			if (!isTypingElement(event.target) && (!hasBlocking || isCheatSheetOpen)) {
				event.preventDefault();
				options.toggleCheatSheet();
			}
			return;
		}

		if (event.key === 'Escape') {
			const resolution = resolveEscapeTarget({
				...options.getOverlaySnapshot(),
				allowMenuFallback: !hasModifier && !isTypingElement(event.target)
			});
			switch (resolution.type) {
				case 'close-overlay':
					options.closeOverlay(resolution.overlay);
					break;
				case 'cancel-placement':
					options.cancelConstruction();
					break;
				case 'clear-selection':
					options.clearSelection(resolution.kind);
					break;
				case 'open-game-menu':
					options.openGameMenu();
					break;
				case 'external-owned':
				case 'none':
					break;
			}
			return;
		}

		const hasBlocking =
			options.getHasBlockingOverlay !== undefined
				? options.getHasBlockingOverlay()
				: selectOverlayGates(options.getOverlaySnapshot()).hasBlockingOverlay;

		const action = resolveShortcutAction({
			key: event.key,
			isTypingTarget: isTypingElement(event.target),
			isInteractiveTarget: isInteractiveControl(event.target),
			hasModifier,
			hasBlockingOverlay: hasBlocking,
			isMenuOpen: options.getIsMenuOpen(),
			activeMapView: options.getActiveMapView(),
			hasGame: options.getHasGame()
		});

		if (!action) {
			return;
		}

		event.preventDefault();

		if (action.type === 'toggle-build') {
			options.toggleBuild();
		} else if (action.type === 'toggle-panel') {
			options.togglePanel(action.panel);
		} else if (action.type === 'toggle-pause') {
			options.togglePause();
		} else if (action.type === 'view') {
			options.showView(action.view);
		}
	}

	return { handleKeydown };
}
