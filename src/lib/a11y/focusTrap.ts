import type { Attachment } from 'svelte/attachments';

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'textarea:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'details > summary:first-of-type',
	'[tabindex]:not([tabindex="-1"])'
]
	.map((selector) => `${selector}:not([inert])`)
	.join(',');

function isVisible(element: Element): boolean {
	if (!(element instanceof HTMLElement)) return false;
	return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
}

function getFocusableCandidates(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

/**
 * Attachment that traps keyboard focus inside a dialog and restores focus to the
 * previously-focused element when the dialog is removed.
 *
 * - On attach: records the active element, moves focus into the dialog (first
 *   focusable, else the container itself when it is focusable), and intercepts
 *   Tab/Shift+Tab so focus wraps within the dialog.
 * - On detach: returns focus to the element that was focused before the dialog
 *   opened.
 *
 * The container should carry `role="dialog"` / `aria-modal="true"` and either
 * contain focusable controls or be given `tabindex="-1"` so it can receive focus.
 */
export const focusTrap: Attachment<HTMLElement> = (node) => {
	const previouslyFocused = document.activeElement as HTMLElement | null;

	const focusable = getFocusableCandidates(node);
	const initialTarget = focusable[0] ?? (node.tabIndex >= 0 ? node : null);
	initialTarget?.focus({ preventScroll: true });

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Tab') return;
		const candidates = getFocusableCandidates(node);
		if (candidates.length === 0) {
			event.preventDefault();
			node.focus();
			return;
		}

		const first = candidates[0];
		const last = candidates[candidates.length - 1];
		const active = document.activeElement;

		if (event.shiftKey) {
			if (active === first || !node.contains(active)) {
				event.preventDefault();
				last.focus();
			}
		} else {
			if (active === last || !node.contains(active)) {
				event.preventDefault();
				first.focus();
			}
		}
	}

	node.addEventListener('keydown', handleKeydown);

	return () => {
		node.removeEventListener('keydown', handleKeydown);
		previouslyFocused?.focus?.();
	};
};
