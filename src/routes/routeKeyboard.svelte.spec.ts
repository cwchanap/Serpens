import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
import type { MapViewId } from '$lib/game/mapViewKeepAlive';
import { createStoreDetailFocus } from './storeDetailFocus.svelte';
import { createRouteKeyboard, type RouteSelectionKind } from './routeKeyboard';
import { selectOverlayGates, type OverlayId, type OverlaySnapshot } from './routeOverlays';

// Mounted harness: a real DOM + window wiring mirroring the route's listener
// stack — the page adapter on the window bubble phase, the finance dialog's
// capture-phase boundary (FinancePurchaseReviewHost), and the industry
// canvas's rail waypoint pop (IndustryMap scene, gated by railKeyboardEnabled).
// Every test dispatches actual KeyboardEvents; no resolver return values are
// inspected directly.
//
// The root close/selection/panel dispatch switches below are harness mirrors
// of the page's switches; the page's own production wiring for the silent
// build-menu Escape close and the paired logistics selection clear is covered
// by routeKeyboardPage.svelte.spec.ts (real route mount), and the keyboard
// fresh openManagementEntry("logistics") entry by managementPanelEntry.svelte.spec.ts.

interface OwnerFlags {
	finance: boolean;
	financePending: boolean;
	save: boolean;
	catalog: boolean;
	results: boolean;
	cheatSheet: boolean;
	supplyAdvisor: boolean;
	storeDetail: boolean;
	buildMenu: boolean;
	gameMenu: boolean;
	alerts: boolean;
	management: boolean;
	placementActive: boolean;
	railActive: boolean;
}

const ALL_SELECTIONS = {
	worldCity: true,
	retailTile: true,
	industryTile: true,
	logisticsRoute: true
};

type VoidSpy = ReturnType<typeof vi.fn<() => void>>;
type PanelSpy = ReturnType<typeof vi.fn<(panel: ManagementPanelId) => void>>;
type ViewSpy = ReturnType<typeof vi.fn<(view: MapViewId) => void>>;

interface KeyboardHarness {
	owners: OwnerFlags;
	selected: {
		worldCity: boolean;
		retailTile: boolean;
		industryTile: boolean;
		logisticsRoute: boolean;
	};
	spies: {
		unlockAudio: VoidSpy;
		toggleCheatSheet: VoidSpy;
		openGameMenu: VoidSpy;
		cancelConstruction: VoidSpy;
		togglePanel: PanelSpy;
		togglePause: VoidSpy;
		showView: ViewSpy;
		openBuildMenu: VoidSpy;
		hideBuildMenu: VoidSpy;
		closeBuildMenuWithSfx: VoidSpy;
		cancelRailStep: VoidSpy;
		dismissFinance: VoidSpy;
	};
	closeOverlayCalls: OverlayId[];
	clearSelectionCalls: RouteSelectionKind[];
	storeDetailFocus: ReturnType<typeof createStoreDetailFocus>;
	canvas: HTMLDivElement;
	input: HTMLInputElement;
	button: HTMLButtonElement;
	focusedLogisticsRouteId(): string | null;
	setFocusedLogisticsRoute(routeId: string | null): void;
	setHasGame(hasGame: boolean): void;
	snapshot(): OverlaySnapshot;
	press(key: string, target?: HTMLElement, init?: KeyboardEventInit): KeyboardEvent;
	cleanup(): void;
}

const mounted: KeyboardHarness[] = [];

function mountKeyboardHarness(
	initial: Partial<OwnerFlags> = {},
	initialSelection: KeyboardHarness['selected'] = {
		worldCity: false,
		retailTile: false,
		industryTile: false,
		logisticsRoute: false
	}
): KeyboardHarness {
	const owners: OwnerFlags = {
		finance: false,
		financePending: false,
		save: false,
		catalog: false,
		results: false,
		cheatSheet: false,
		supplyAdvisor: false,
		storeDetail: false,
		buildMenu: false,
		gameMenu: false,
		alerts: false,
		management: false,
		placementActive: false,
		railActive: false,
		...initial
	};
	const selected = { ...initialSelection };
	let activeMapView: MapViewId = 'retail';
	let hasGame = true;
	let focusedLogisticsRouteId: string | null = null;

	// Real route owner atom: Escape-close must clear the focused product.
	const storeDetailFocus = createStoreDetailFocus(() => selected.retailTile);

	const spies: KeyboardHarness['spies'] = {
		unlockAudio: vi.fn<() => void>(),
		toggleCheatSheet: vi.fn<() => void>(),
		openGameMenu: vi.fn<() => void>(),
		cancelConstruction: vi.fn<() => void>(),
		togglePanel: vi.fn<(panel: ManagementPanelId) => void>(),
		togglePause: vi.fn<() => void>(),
		showView: vi.fn<(view: MapViewId) => void>(),
		openBuildMenu: vi.fn<() => void>(),
		hideBuildMenu: vi.fn<() => void>(),
		closeBuildMenuWithSfx: vi.fn<() => void>(),
		cancelRailStep: vi.fn<() => void>(),
		dismissFinance: vi.fn<() => void>()
	};
	const closeOverlayCalls: OverlayId[] = [];
	const clearSelectionCalls: RouteSelectionKind[] = [];

	// Mirrors the page's $derived overlay snapshot: rebuilt from owners.
	function snapshot(): OverlaySnapshot {
		const openOverlays = new Set<OverlayId>();
		if (owners.finance) openOverlays.add('finance-review');
		if (owners.save) openOverlays.add('save-panel');
		if (owners.catalog) openOverlays.add('scenario-catalog');
		if (owners.results) openOverlays.add('scenario-results');
		if (owners.cheatSheet) openOverlays.add('cheat-sheet');
		if (owners.supplyAdvisor) openOverlays.add('supply-advisor');
		if (owners.storeDetail) openOverlays.add('store-detail');
		if (owners.buildMenu) openOverlays.add('build-menu');
		if (owners.gameMenu) openOverlays.add('game-menu');
		if (owners.alerts) openOverlays.add('alerts-menu');
		if (owners.management) openOverlays.add('management-panel');
		return {
			openOverlays,
			isPlacementActive: owners.placementActive,
			isRailBuildActive: owners.railActive,
			isFinanceReviewPending: owners.financePending,
			selected: { ...selected },
			allowMenuFallback: false
		};
	}

	// Root close dispatch: mirrors the page's switch. Escape closes are
	// silent; the build menu hides without the close SFX its user toggle plays.
	function closeOverlay(id: OverlayId): void {
		closeOverlayCalls.push(id);
		switch (id) {
			case 'save-panel':
				owners.save = false;
				break;
			case 'cheat-sheet':
				owners.cheatSheet = false;
				break;
			case 'supply-advisor':
				owners.supplyAdvisor = false;
				break;
			case 'store-detail':
				storeDetailFocus.close();
				owners.storeDetail = false;
				break;
			case 'build-menu':
				spies.hideBuildMenu();
				owners.buildMenu = false;
				break;
			case 'game-menu':
				owners.gameMenu = false;
				break;
			case 'alerts-menu':
				owners.alerts = false;
				break;
			case 'management-panel':
				owners.management = false;
				break;
			// finance-review / scenario-catalog / scenario-results are
			// externally owned; the resolver never emits a close for them.
		}
	}

	// Root selection dispatch: mirrors the page — any cleared selection also
	// drops the logistics selection, which clears the management route focus.
	function clearSelection(kind: RouteSelectionKind): void {
		clearSelectionCalls.push(kind);
		selected[kind] = false;
		if (kind !== 'logisticsRoute') selected.logisticsRoute = false;
		focusedLogisticsRouteId = null;
	}

	// Canvas mirror (IndustryMap): pops one waypoint per Escape only while the
	// page leaves rail keyboard enabled; a right-click cancels once.
	const canvas = document.createElement('div');
	canvas.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && selectOverlayGates(snapshot()).railKeyboardEnabled) {
			spies.cancelRailStep();
		}
	});
	canvas.addEventListener('contextmenu', (event) => {
		event.preventDefault();
		spies.cancelRailStep();
	});

	// Finance dialog capture mirror (FinancePurchaseReviewHost): capture-phase
	// window boundary stops the page keydown before its bubble listener.
	function financeCapture(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !owners.finance) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (!owners.financePending) spies.dismissFinance();
	}
	window.addEventListener('keydown', financeCapture, true);

	const keyboard = createRouteKeyboard({
		getOverlaySnapshot: snapshot,
		getIsMenuOpen: () => owners.buildMenu || owners.management,
		getActiveMapView: () => activeMapView,
		getHasGame: () => hasGame,
		unlockAudio: spies.unlockAudio,
		toggleCheatSheet: () => {
			spies.toggleCheatSheet();
			owners.cheatSheet = !owners.cheatSheet;
		},
		closeOverlay,
		cancelConstruction: () => {
			spies.cancelConstruction();
			owners.placementActive = false;
		},
		clearSelection,
		openGameMenu: () => {
			spies.openGameMenu();
			owners.gameMenu = true;
		},
		toggleBuild: () => {
			if (owners.buildMenu) {
				spies.closeBuildMenuWithSfx();
				owners.buildMenu = false;
			} else {
				spies.openBuildMenu();
				owners.buildMenu = true;
			}
		},
		togglePanel: (panel: ManagementPanelId) => spies.togglePanel(panel),
		togglePause: spies.togglePause,
		showView: (view: MapViewId) => {
			spies.showView(view);
			activeMapView = view;
		}
	});
	// The page's single svelte:window keydown, as a window bubble listener.
	window.addEventListener('keydown', keyboard.handleKeydown);

	const input = document.createElement('input');
	const button = document.createElement('button');
	button.type = 'button';
	document.body.append(canvas, input, button);

	function press(
		key: string,
		target: HTMLElement = document.body,
		init: KeyboardEventInit = {}
	): KeyboardEvent {
		const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
		target.dispatchEvent(event);
		return event;
	}

	function cleanup(): void {
		window.removeEventListener('keydown', keyboard.handleKeydown);
		window.removeEventListener('keydown', financeCapture, true);
		canvas.remove();
		input.remove();
		button.remove();
	}

	const harness: KeyboardHarness = {
		owners,
		selected,
		spies,
		closeOverlayCalls,
		clearSelectionCalls,
		storeDetailFocus,
		canvas,
		input,
		button,
		focusedLogisticsRouteId: () => focusedLogisticsRouteId,
		setFocusedLogisticsRoute: (routeId) => (focusedLogisticsRouteId = routeId),
		setHasGame: (value) => (hasGame = value),
		snapshot,
		press,
		cleanup
	};
	mounted.push(harness);
	return harness;
}

describe('route keyboard adapter', () => {
	afterEach(() => {
		for (const harness of mounted) harness.cleanup();
		mounted.length = 0;
		document.body.replaceChildren();
	});

	it('toggles the cheat sheet for bare ? and locks typing targets and other modals out', () => {
		const h = mountKeyboardHarness();
		expect(h.press('?').defaultPrevented).toBe(true);
		expect(h.spies.toggleCheatSheet).toHaveBeenCalledTimes(1);
		expect(h.spies.unlockAudio).toHaveBeenCalledTimes(1);

		// A typing target owns ?.
		expect(h.press('?', h.input).defaultPrevented).toBe(false);
		expect(h.spies.toggleCheatSheet).toHaveBeenCalledTimes(1);

		// ? closes the cheat sheet while it is the open overlay.
		expect(h.press('?').defaultPrevented).toBe(true);
		expect(h.spies.toggleCheatSheet).toHaveBeenCalledTimes(2);

		// A different modal suppresses ? while the cheat sheet is closed.
		h.owners.save = true;
		expect(h.press('?').defaultPrevented).toBe(false);
		expect(h.spies.toggleCheatSheet).toHaveBeenCalledTimes(2);

		// …and the open cheat sheet still wins over the blocking overlay.
		h.owners.cheatSheet = true;
		expect(h.press('?').defaultPrevented).toBe(true);
		expect(h.spies.toggleCheatSheet).toHaveBeenCalledTimes(3);

		// Modifier ? (e.g. Cmd+/) is left to the browser.
		expect(h.press('?', document.body, { metaKey: true }).defaultPrevented).toBe(false);
		expect(h.spies.toggleCheatSheet).toHaveBeenCalledTimes(3);
	});

	it('leaves Cmd/Ctrl/Alt combinations to the browser', () => {
		const h = mountKeyboardHarness();
		for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
			expect(h.press('o', document.body, modifier).defaultPrevented).toBe(false);
		}
		expect(h.spies.togglePanel).not.toHaveBeenCalled();

		// Shift is allowed — Shift+O still toggles the dashboard.
		expect(h.press('o', document.body, { shiftKey: true }).defaultPrevented).toBe(true);
		expect(h.spies.togglePanel).toHaveBeenCalledWith('dashboard');

		// Escape with a modifier never falls back to opening the game menu.
		h.press('Escape', document.body, { ctrlKey: true });
		expect(h.spies.openGameMenu).not.toHaveBeenCalled();
	});

	it('ignores mnemonics from typing targets and Space from interactive controls', () => {
		const h = mountKeyboardHarness();
		// Typing targets own mnemonic letters.
		expect(h.press('o', h.input).defaultPrevented).toBe(false);
		expect(h.spies.togglePanel).not.toHaveBeenCalled();

		// Interactive controls own their native activation key (Space)…
		expect(h.press(' ', h.button).defaultPrevented).toBe(false);
		expect(h.spies.togglePause).not.toHaveBeenCalled();

		// …but mnemonics stay global on interactive controls so focus-trapped
		// menus remain toggleable.
		expect(h.press('o', h.button).defaultPrevented).toBe(true);
		expect(h.spies.togglePanel).toHaveBeenCalledWith('dashboard');

		// Space at the map toggles pause only while a game exists.
		expect(h.press(' ').defaultPrevented).toBe(true);
		expect(h.spies.togglePause).toHaveBeenCalledTimes(1);
		h.setHasGame(false);
		expect(h.press(' ').defaultPrevented).toBe(false);
		expect(h.spies.togglePause).toHaveBeenCalledTimes(1);
	});

	it('keeps the Escape menu fallback out of typing targets and modifiers', () => {
		const h = mountKeyboardHarness();
		h.press('Escape', h.input);
		expect(h.spies.openGameMenu).not.toHaveBeenCalled();
		h.press('Escape', document.body, { metaKey: true });
		expect(h.spies.openGameMenu).not.toHaveBeenCalled();

		// Bare Escape with nothing else open opens the game menu.
		h.press('Escape');
		expect(h.spies.openGameMenu).toHaveBeenCalledTimes(1);

		// Overlay close is not gated on typing: Escape at an input still closes.
		h.owners.cheatSheet = true;
		h.press('Escape', h.input);
		expect(h.closeOverlayCalls).toEqual(['cheat-sheet']);
	});

	it('walks the full Escape priority ladder one owner per dispatched event', () => {
		const h = mountKeyboardHarness(
			{
				save: true,
				cheatSheet: true,
				supplyAdvisor: true,
				storeDetail: true,
				buildMenu: true,
				gameMenu: true,
				alerts: true,
				management: true,
				railActive: true,
				placementActive: true
			},
			{ ...ALL_SELECTIONS }
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
		for (const overlay of ordered) {
			h.press('Escape');
			expect(h.closeOverlayCalls).toEqual([overlay]);
			h.closeOverlayCalls.length = 0;
		}

		// Active rail owns the next Escape on the canvas; the page leaves it alone.
		h.press('Escape');
		expect(h.closeOverlayCalls).toEqual([]);
		expect(h.spies.cancelConstruction).not.toHaveBeenCalled();

		// Placement follows the rail.
		h.owners.railActive = false;
		h.press('Escape');
		expect(h.spies.cancelConstruction).toHaveBeenCalledTimes(1);

		// Management closes after placement.
		h.press('Escape');
		expect(h.closeOverlayCalls).toEqual(['management-panel']);
		h.closeOverlayCalls.length = 0;

		// Selections clear in order; the paired logistics clear folds in.
		h.press('Escape');
		expect(h.clearSelectionCalls).toEqual(['worldCity']);
		expect(h.selected).toEqual({
			worldCity: false,
			retailTile: true,
			industryTile: true,
			logisticsRoute: false
		});
		expect(h.focusedLogisticsRouteId()).toBeNull();
		h.press('Escape');
		expect(h.clearSelectionCalls).toEqual(['worldCity', 'retailTile']);
		h.press('Escape');
		expect(h.clearSelectionCalls).toEqual(['worldCity', 'retailTile', 'industryTile']);

		// logisticsRoute was pair-cleared, so the next Escape falls back to the menu.
		h.press('Escape');
		expect(h.spies.openGameMenu).toHaveBeenCalledTimes(1);
	});

	it('blocks finance dismissal while its confirmation is pending', () => {
		const h = mountKeyboardHarness({ finance: true, financePending: true });
		h.press('Escape');
		expect(h.spies.dismissFinance).not.toHaveBeenCalled();
		expect(h.closeOverlayCalls).toEqual([]);
		expect(h.spies.cancelConstruction).not.toHaveBeenCalled();

		h.owners.financePending = false;
		h.press('Escape');
		expect(h.spies.dismissFinance).toHaveBeenCalledTimes(1);
	});

	it('leaves catalog and results Escape ownership to their dialogs', () => {
		for (const owner of ['catalog', 'results'] as const) {
			const h = mountKeyboardHarness({ [owner]: true });
			h.press('Escape');
			expect(h.closeOverlayCalls).toEqual([]);
			expect(h.clearSelectionCalls).toEqual([]);
			expect(h.spies.openGameMenu).not.toHaveBeenCalled();
			h.cleanup();
			mounted.pop();
		}
	});

	it('lets alerts own Escape without pausing the map', () => {
		const h = mountKeyboardHarness({ alerts: true });
		expect(selectOverlayGates(h.snapshot()).isMapPaused).toBe(false);

		// Alerts still block the other shortcuts.
		expect(h.press('b').defaultPrevented).toBe(false);
		expect(h.spies.openBuildMenu).not.toHaveBeenCalled();

		h.press('Escape');
		expect(h.closeOverlayCalls).toEqual(['alerts-menu']);
	});

	it('keeps the management shortcut exception: mnemonics stay active, view digits suppressed', () => {
		const h = mountKeyboardHarness({ management: true });
		h.press('h');
		expect(h.spies.togglePanel).toHaveBeenCalledWith('staff');

		h.press('1');
		expect(h.spies.showView).not.toHaveBeenCalled();

		// Menu-toggle keys stay active through a soft panel.
		h.press('b');
		expect(h.spies.openBuildMenu).toHaveBeenCalledTimes(1);

		// Space remains a simulation control while a soft panel is open.
		h.press(' ');
		expect(h.spies.togglePause).toHaveBeenCalledTimes(1);

		// Escape closes the soft build menu first, then the management panel.
		h.press('Escape');
		expect(h.closeOverlayCalls).toEqual(['build-menu']);
		h.press('Escape');
		expect(h.closeOverlayCalls).toEqual(['build-menu', 'management-panel']);
	});

	it('cancels placement on Escape while the map keeps running', () => {
		const h = mountKeyboardHarness({ placementActive: true });
		expect(selectOverlayGates(h.snapshot()).isMapPaused).toBe(false);

		// Placement blocks the other shortcuts.
		expect(h.press('b').defaultPrevented).toBe(false);
		expect(h.spies.openBuildMenu).not.toHaveBeenCalled();

		h.press('Escape');
		expect(h.spies.cancelConstruction).toHaveBeenCalledTimes(1);
		expect(h.closeOverlayCalls).toEqual([]);
	});

	it('keeps view shortcuts available on the world map where the clock is blocked', () => {
		const h = mountKeyboardHarness();
		h.press('3');
		expect(h.spies.showView).toHaveBeenCalledWith('world');

		// Build has no meaning on the world map.
		expect(h.press('b').defaultPrevented).toBe(false);
		expect(h.spies.openBuildMenu).not.toHaveBeenCalled();

		h.press('1');
		expect(h.spies.showView).toHaveBeenCalledWith('retail');
	});

	it('targets post-initialization owner changes at dispatch time', () => {
		const h = mountKeyboardHarness();
		// Open the store detail and focus a product AFTER the adapter was created.
		h.owners.storeDetail = true;
		h.selected.retailTile = true;
		h.storeDetailFocus.openDirect('pantry');
		expect(h.storeDetailFocus.focusedProductId).toBe('pantry');

		h.press('Escape');
		expect(h.closeOverlayCalls).toEqual(['store-detail']);
		// Store detail close clears the product focus.
		expect(h.storeDetailFocus.isOpen).toBe(false);
		expect(h.storeDetailFocus.focusedProductId).toBeNull();

		h.press('Escape');
		expect(h.clearSelectionCalls).toEqual(['retailTile']);
	});

	it('clears the management logistics focus with the logistics selection', () => {
		const h = mountKeyboardHarness();
		h.selected.logisticsRoute = true;
		h.setFocusedLogisticsRoute('route-9');

		h.press('Escape');
		expect(h.clearSelectionCalls).toEqual(['logisticsRoute']);
		expect(h.selected.logisticsRoute).toBe(false);
		expect(h.focusedLogisticsRouteId()).toBeNull();
	});

	it('closes the build menu silently on Escape while the b toggle keeps its close sound', () => {
		const h = mountKeyboardHarness({ buildMenu: true });
		h.press('Escape');
		expect(h.spies.hideBuildMenu).toHaveBeenCalledTimes(1);
		expect(h.spies.closeBuildMenuWithSfx).not.toHaveBeenCalled();
		expect(h.owners.buildMenu).toBe(false);

		h.press('b');
		expect(h.spies.openBuildMenu).toHaveBeenCalledTimes(1);
		h.press('b');
		expect(h.spies.closeBuildMenuWithSfx).toHaveBeenCalledTimes(1);
	});

	it('pops exactly one rail waypoint per canvas Escape and never also cancels at the window', () => {
		const h = mountKeyboardHarness({ railActive: true });
		h.press('Escape', h.canvas);
		expect(h.spies.cancelRailStep).toHaveBeenCalledTimes(1);
		expect(h.spies.cancelConstruction).not.toHaveBeenCalled();
		expect(h.closeOverlayCalls).toEqual([]);
		expect(h.clearSelectionCalls).toEqual([]);
		// The adapter still received the bubbled event (audio unlock) and no-oped.
		expect(h.spies.unlockAudio).toHaveBeenCalledTimes(1);
	});

	it('cancels exactly once on canvas right-click', () => {
		const h = mountKeyboardHarness({ railActive: true });
		h.canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		expect(h.spies.cancelRailStep).toHaveBeenCalledTimes(1);
		expect(h.spies.cancelConstruction).not.toHaveBeenCalled();
	});

	it('gives a captured finance Escape to the dialog alone, even over active rail', () => {
		const h = mountKeyboardHarness({ finance: true, railActive: true });
		h.press('Escape', h.canvas);
		expect(h.spies.dismissFinance).toHaveBeenCalledTimes(1);
		expect(h.spies.cancelRailStep).not.toHaveBeenCalled();
		// Capture stopped the event before the page adapter ever ran.
		expect(h.spies.unlockAudio).not.toHaveBeenCalled();
		expect(h.closeOverlayCalls).toEqual([]);
	});
});
