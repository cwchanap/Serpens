import { afterEach, describe, expect, it } from 'vitest';
import { focusTrap } from './focusTrap';

// focusTrap is an Attachment<HTMLElement> — a plain function (node) => cleanup.
// These tests drive it directly against real DOM in the browser (client) project.

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
});
