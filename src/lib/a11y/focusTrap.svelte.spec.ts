import { afterEach, describe, expect, it } from 'vitest';
import { focusTrap } from './focusTrap';

// focusTrap is an Attachment<HTMLElement> — a plain function (node) => cleanup.
// These tests drive it directly against real DOM in the browser (client) project.
// The `.svelte.spec.ts` suffix is what routes this file into the client Vitest
// project (see vite.config.ts `test.projects`); it is deliberate because
// focusTrap needs a real DOM (focus, tab order, getComputedStyle), which the
// node-based server project does not provide. The module under test itself
// (`focusTrap.ts`) is framework-agnostic and has no Svelte dependency.

function mountDialog(html: string): HTMLDivElement {
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.appendChild(container);
	return container;
}

function tabKey(shift = false): KeyboardEvent {
	return new KeyboardEvent('keydown', {
		key: 'Tab',
		shiftKey: shift,
		bubbles: true,
		cancelable: true
	});
}

describe('focusTrap', () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it('moves focus to the first focusable element on attach', () => {
		expect.assertions(1);
		const trigger = document.createElement('button');
		trigger.id = 'trigger';
		document.body.appendChild(trigger);
		trigger.focus();

		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' +
				'<button id="first">First</button>' +
				'<button id="last">Last</button>' +
				'</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;

		focusTrap(node);

		expect(document.activeElement).toBe(node.querySelector('#first'));
	});

	it('focuses the container itself when it has no focusable children but is focusable', () => {
		expect.assertions(1);
		const dialog = mountDialog('<div role="dialog" tabindex="-1"></div>');
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;

		focusTrap(node);

		expect(document.activeElement).toBe(node);
	});

	it('wraps Tab from the last focusable back to the first', () => {
		expect.assertions(2);
		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' +
				'<button id="first">First</button>' +
				'<button id="last">Last</button>' +
				'</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		const last = node.querySelector<HTMLButtonElement>('#last')!;
		last.focus();
		expect(document.activeElement).toBe(last);

		node.dispatchEvent(tabKey(false));
		expect(document.activeElement).toBe(node.querySelector('#first'));

		detach();
	});

	it('wraps Shift+Tab from the first focusable back to the last', () => {
		expect.assertions(2);
		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' +
				'<button id="first">First</button>' +
				'<button id="last">Last</button>' +
				'</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		const first = node.querySelector<HTMLButtonElement>('#first')!;
		first.focus();
		expect(document.activeElement).toBe(first);

		node.dispatchEvent(tabKey(true));
		expect(document.activeElement).toBe(node.querySelector('#last'));

		detach();
	});

	it('ignores non-Tab keydown events', () => {
		expect.assertions(1);
		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' +
				'<button id="first">First</button>' +
				'<button id="last">Last</button>' +
				'</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		const first = node.querySelector<HTMLButtonElement>('#first')!;
		first.focus();
		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		node.dispatchEvent(enter);

		expect(document.activeElement).toBe(first);

		detach();
	});

	it('restores focus to the previously-focused element on detach', () => {
		expect.assertions(3);
		const trigger = document.createElement('button');
		trigger.id = 'trigger';
		document.body.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);

		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' + '<button id="first">First</button>' + '</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		expect(document.activeElement).toBe(node.querySelector('#first'));

		detach();
		expect(document.activeElement).toBe(trigger);
	});

	it('skips hidden (display:none) focusable elements when choosing the initial target', () => {
		expect.assertions(1);
		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' +
				'<button id="hidden" style="display:none">Hidden</button>' +
				'<button id="visible">Visible</button>' +
				'</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		expect(document.activeElement).toBe(node.querySelector('#visible'));

		detach();
	});

	it('skips visibility:hidden focusable elements when choosing the initial target', () => {
		expect.assertions(1);
		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' +
				'<button id="hidden" style="visibility:hidden">Hidden</button>' +
				'<button id="visible">Visible</button>' +
				'</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		expect(document.activeElement).toBe(node.querySelector('#visible'));

		detach();
	});

	it('traps Tab and focuses the container when there are no focusable children', () => {
		expect.assertions(2);
		const dialog = mountDialog('<div role="dialog" tabindex="-1"></div>');
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		const event = tabKey(false);
		node.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(node);

		detach();
	});

	it('wraps Tab to the first focusable when focus is outside the dialog', () => {
		expect.assertions(2);
		const outside = document.createElement('button');
		outside.id = 'outside';
		document.body.appendChild(outside);
		outside.focus();

		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' +
				'<button id="first">First</button>' +
				'<button id="last">Last</button>' +
				'</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		// Focus is still on the outside button when Tab fires inside the dialog.
		node.dispatchEvent(tabKey(false));
		expect(document.activeElement).toBe(node.querySelector('#first'));

		// Shift+Tab from outside the dialog wraps to the last focusable.
		outside.focus();
		node.dispatchEvent(tabKey(true));
		expect(document.activeElement).toBe(node.querySelector('#last'));

		detach();
	});

	it('does not restore focus on detach when the previously-focused element was removed from the DOM', () => {
		expect.assertions(2);
		const trigger = document.createElement('button');
		trigger.id = 'trigger';
		document.body.appendChild(trigger);
		trigger.focus();

		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' + '<button id="first">First</button>' + '</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		expect(document.activeElement).toBe(node.querySelector('#first'));

		// Remove the trigger while the dialog is open; detach must not throw or
		// restore focus to a detached node.
		trigger.remove();
		detach();
		expect(document.activeElement).not.toBe(trigger);
	});

	it('skips non-HTMLElement focus candidates (e.g. an SVG <a>) when choosing the initial target', () => {
		expect.assertions(1);
		// `a[href]` matches both HTML and SVG <a> elements; the SVG anchor is an
		// SVGElement, not an HTMLElement, so `isVisible` must short-circuit on the
		// `instanceof HTMLElement` guard rather than reading layout properties.
		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' +
				'<svg><a href="#x"><text>svg-link</text></a></svg>' +
				'<button id="first">First</button>' +
				'</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		expect(document.activeElement).toBe(node.querySelector('#first'));

		detach();
	});

	it('does not move focus when there are no focusable children and the container is not focusable', () => {
		expect.assertions(1);
		// tabIndex < -1 means the container is not programmatically focusable, so
		// the fallback target resolves to null and `.focus()` is never called.
		const dialog = mountDialog('<div role="dialog" tabindex="-2"></div>');
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		expect(document.activeElement).not.toBe(node);

		detach();
	});

	it('inerts backdrop siblings on attach so screen-reader browse mode cannot reach page chrome', () => {
		expect.assertions(3);
		const pageChrome = document.createElement('button');
		pageChrome.id = 'page-chrome';
		document.body.appendChild(pageChrome);

		const backdrop = document.createElement('div');
		backdrop.className = 'dialog-backdrop';
		backdrop.innerHTML = '<div role="dialog" tabindex="-1"><button id="first">First</button></div>';
		document.body.appendChild(backdrop);
		const node = backdrop.querySelector<HTMLDivElement>('[role="dialog"]')!;

		expect(pageChrome.hasAttribute('inert')).toBe(false);
		const detach = focusTrap(node) as () => void;
		expect(pageChrome.hasAttribute('inert')).toBe(true);
		// The backdrop itself is not inerted — only its siblings.
		expect(backdrop.hasAttribute('inert')).toBe(false);

		detach();
	});

	it('removes inert from backdrop siblings on detach', () => {
		expect.assertions(2);
		const pageChrome = document.createElement('button');
		pageChrome.id = 'page-chrome';
		document.body.appendChild(pageChrome);

		const backdrop = document.createElement('div');
		backdrop.className = 'dialog-backdrop';
		backdrop.innerHTML = '<div role="dialog" tabindex="-1"><button id="first">First</button></div>';
		document.body.appendChild(backdrop);
		const node = backdrop.querySelector<HTMLDivElement>('[role="dialog"]')!;

		const detach = focusTrap(node) as () => void;
		expect(pageChrome.hasAttribute('inert')).toBe(true);
		detach();
		expect(pageChrome.hasAttribute('inert')).toBe(false);
	});

	it('keeps a sibling inerted while a stacked inner dialog is still open', () => {
		expect.assertions(4);
		const pageChrome = document.createElement('button');
		pageChrome.id = 'page-chrome';
		document.body.appendChild(pageChrome);

		const outerBackdrop = document.createElement('div');
		outerBackdrop.innerHTML =
			'<div role="dialog" tabindex="-1"><button id="outer">Outer</button></div>';
		document.body.appendChild(outerBackdrop);
		const outerNode = outerBackdrop.querySelector<HTMLDivElement>('[role="dialog"]')!;

		const innerBackdrop = document.createElement('div');
		innerBackdrop.innerHTML =
			'<div role="dialog" tabindex="-1"><button id="inner">Inner</button></div>';
		document.body.appendChild(innerBackdrop);
		const innerNode = innerBackdrop.querySelector<HTMLDivElement>('[role="dialog"]')!;

		const outerDetach = focusTrap(outerNode) as () => void;
		expect(pageChrome.hasAttribute('inert')).toBe(true);
		// Inner dialog also inerts pageChrome (ref-count to 2) and inerts the
		// outer backdrop so SR browse mode cannot reach the paused outer dialog.
		const innerDetach = focusTrap(innerNode) as () => void;
		expect(pageChrome.hasAttribute('inert')).toBe(true);

		// Closing the outer dialog first must NOT un-inert pageChrome while the
		// inner dialog is still open.
		outerDetach();
		expect(pageChrome.hasAttribute('inert')).toBe(true);

		// Once both dialogs are detached the ref-count drops to zero and
		// pageChrome must be re-enabled.
		innerDetach();
		expect(pageChrome.hasAttribute('inert')).toBe(false);
	});

	it('does not wrap focus when shift-tabbing from a middle focusable element', () => {
		expect.assertions(1);
		const dialog = mountDialog(
			'<div role="dialog" tabindex="-1">' +
				'<button id="first">First</button>' +
				'<button id="middle">Middle</button>' +
				'<button id="last">Last</button>' +
				'</div>'
		);
		const node = dialog.querySelector<HTMLDivElement>('[role="dialog"]')!;
		const detach = focusTrap(node) as () => void;

		const middle = node.querySelector<HTMLButtonElement>('#middle')!;
		middle.focus();
		// Shift+Tab from a middle element is neither the first nor outside the
		// dialog, so the trap must not intercept/wrap — focus stays put.
		node.dispatchEvent(tabKey(true));
		expect(document.activeElement).toBe(middle);

		detach();
	});
});
