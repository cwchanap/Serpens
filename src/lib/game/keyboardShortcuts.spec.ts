import { describe, expect, it } from 'vitest';
import { resolveShortcutAction, type ShortcutContext } from './keyboardShortcuts';

function context(overrides: Partial<ShortcutContext> = {}): ShortcutContext {
	return {
		key: 'b',
		isTypingTarget: false,
		hasBlockingOverlay: false,
		activeMapView: 'retail',
		hasGame: true,
		...overrides
	};
}

describe('resolveShortcutAction', () => {
	it('opens build on "b" and "B"', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: 'b' }))).toEqual({ type: 'build' });
		expect(resolveShortcutAction(context({ key: 'B' }))).toEqual({ type: 'build' });
	});

	it('does not open build on the world view', () => {
		expect.assertions(1);
		expect(resolveShortcutAction(context({ key: 'b', activeMapView: 'world' }))).toBeNull();
	});

	it('advances the day on Space only when a game exists', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: ' ' }))).toEqual({ type: 'advance-day' });
		expect(resolveShortcutAction(context({ key: ' ', hasGame: false }))).toBeNull();
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

	it('ignores shortcuts while typing or when an overlay is open', () => {
		expect.assertions(2);
		expect(resolveShortcutAction(context({ key: 'b', isTypingTarget: true }))).toBeNull();
		expect(resolveShortcutAction(context({ key: 'b', hasBlockingOverlay: true }))).toBeNull();
	});

	it('returns null for unmapped keys', () => {
		expect.assertions(1);
		expect(resolveShortcutAction(context({ key: 'q' }))).toBeNull();
	});
});
