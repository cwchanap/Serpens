import { describe, expect, it } from 'vitest';
import { resolveShortcutAction, type ShortcutContext } from './keyboardShortcuts';

function context(overrides: Partial<ShortcutContext> = {}): ShortcutContext {
	return {
		key: 'b',
		isTypingTarget: false,
		isInteractiveTarget: false,
		hasModifier: false,
		hasBlockingOverlay: false,
		isMenuOpen: false,
		activeMapView: 'retail',
		hasGame: true,
		...overrides
	};
}

describe('resolveShortcutAction', () => {
	it('toggles the build menu on "b" and "B"', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: 'b' }))).toEqual({ type: 'toggle-build' });
		expect(resolveShortcutAction(context({ key: 'B' }))).toEqual({ type: 'toggle-build' });
	});

	it('still toggles build while another menu is open', () => {
		expect.assertions(1);
		expect(resolveShortcutAction(context({ key: 'b', isMenuOpen: true }))).toEqual({
			type: 'toggle-build'
		});
	});

	it('does not toggle build on the world view', () => {
		expect.assertions(1);
		expect(resolveShortcutAction(context({ key: 'b', activeMapView: 'world' }))).toBeNull();
	});

	it('toggles each management panel by its mnemonic key', () => {
		expect.assertions(9);
		expect(resolveShortcutAction(context({ key: 'o' }))).toEqual({
			type: 'toggle-panel',
			panel: 'dashboard'
		});
		expect(resolveShortcutAction(context({ key: 'p' }))).toEqual({
			type: 'toggle-panel',
			panel: 'policies'
		});
		expect(resolveShortcutAction(context({ key: 'h' }))).toEqual({
			type: 'toggle-panel',
			panel: 'staff'
		});
		expect(resolveShortcutAction(context({ key: 't' }))).toEqual({
			type: 'toggle-panel',
			panel: 'stores'
		});
		expect(resolveShortcutAction(context({ key: 'c' }))).toEqual({
			type: 'toggle-panel',
			panel: 'decisions'
		});
		expect(resolveShortcutAction(context({ key: 'r' }))).toEqual({
			type: 'toggle-panel',
			panel: 'reports'
		});
		expect(resolveShortcutAction(context({ key: 'g' }))).toEqual({
			type: 'toggle-panel',
			panel: 'productChains'
		});
		expect(resolveShortcutAction(context({ key: 'f' }))).toEqual({
			type: 'toggle-panel',
			panel: 'finance'
		});
		expect(resolveShortcutAction(context({ key: 'l' }))).toEqual({
			type: 'toggle-panel',
			panel: 'logistics'
		});
	});

	it('opens logistics case-insensitively and switches from another soft panel', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: 'L', isMenuOpen: true }))).toEqual({
			type: 'toggle-panel',
			panel: 'logistics'
		});
		expect(resolveShortcutAction(context({ key: 'l', isMenuOpen: true }))).toEqual({
			type: 'toggle-panel',
			panel: 'logistics'
		});
	});

	it('matches panel keys case-insensitively and while another menu is open', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: 'O' }))).toEqual({
			type: 'toggle-panel',
			panel: 'dashboard'
		});
		expect(resolveShortcutAction(context({ key: 'r', isMenuOpen: true }))).toEqual({
			type: 'toggle-panel',
			panel: 'reports'
		});
	});

	it('opens a management panel even before a game exists', () => {
		expect.assertions(1);
		expect(resolveShortcutAction(context({ key: 'o', hasGame: false }))).toEqual({
			type: 'toggle-panel',
			panel: 'dashboard'
		});
	});

	it('toggles pause on Space only when a game exists', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: ' ' }))).toEqual({ type: 'toggle-pause' });
		expect(resolveShortcutAction(context({ key: ' ', hasGame: false }))).toBeNull();
	});

	it('leaves WASD unclaimed for the active Phaser map', () => {
		// Route-level shortcuts must not shadow continuous camera movement.
		expect.assertions(4);
		expect(resolveShortcutAction(context({ key: 'w' }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'a' }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 's' }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'd' }))).toBeNull();
	});

	it('switches views on 1/2/3', () => {
		expect.assertions(3);
		expect(resolveShortcutAction(context({ key: '1' }))).toEqual({ type: 'view', view: 'retail' });
		expect(resolveShortcutAction(context({ key: '2' }))).toEqual({
			type: 'view',
			view: 'industry'
		});
		expect(resolveShortcutAction(context({ key: '3' }))).toEqual({ type: 'view', view: 'world' });
	});

	it('suppresses view navigation but keeps the time toggle while a soft menu is open', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: '2', isMenuOpen: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: ' ', isMenuOpen: true }))).toEqual({
			type: 'toggle-pause'
		});
	});

	it('ignores every shortcut while typing or when a modal overlay is open', () => {
		expect.assertions(5);
		expect(resolveShortcutAction(context({ key: 'b', isTypingTarget: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'b', hasBlockingOverlay: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'o', hasBlockingOverlay: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'l', isTypingTarget: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'L', hasModifier: true }))).toBeNull();
	});

	it('suppresses only activation keys when a focused interactive control owns the keypress', () => {
		expect.assertions(5);
		expect(resolveShortcutAction(context({ key: ' ', isInteractiveTarget: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'Enter', isInteractiveTarget: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'o', isInteractiveTarget: true }))).toEqual({
			type: 'toggle-panel',
			panel: 'dashboard'
		});
		expect(resolveShortcutAction(context({ key: 'b', isInteractiveTarget: true }))).toEqual({
			type: 'toggle-build'
		});
		expect(resolveShortcutAction(context({ key: 'f', isInteractiveTarget: true }))).toEqual({
			type: 'toggle-panel',
			panel: 'finance'
		});
	});

	it('leaves Cmd/Ctrl/Alt combinations to the browser', () => {
		expect.assertions(3);
		expect(resolveShortcutAction(context({ key: 'o', hasModifier: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'b', hasModifier: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: '2', hasModifier: true }))).toBeNull();
	});

	it('returns null for unmapped keys', () => {
		expect.assertions(1);
		expect(resolveShortcutAction(context({ key: 'q' }))).toBeNull();
	});
});
