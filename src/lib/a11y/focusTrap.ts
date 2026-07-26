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
	// `offsetWidth`/`offsetHeight`/`getClientRects()` catch `display: none`, but
	// an element with `visibility: hidden` still occupies layout space and would
	// pass those checks while being invisible to users. Check computed style too.
	if (
		element.offsetWidth <= 0 &&
		element.offsetHeight <= 0 &&
		element.getClientRects().length === 0
	) {
		return false;
	}
	return getComputedStyle(element).visibility !== 'hidden';
}

function getFocusableCandidates(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

/**
 * Ref-counted `inert` management for stacked dialogs.
 *
 * Each active focusTrap that inerts a given sibling increments its count; the
 * `inert` attribute is applied while the count is positive and removed when it
 * drops back to zero. This keeps stacked dialogs correct: the outer dialog's
 * trap won't un-inert a sibling that an inner dialog's trap still needs inerted.
 */
const inertCounts = new Map<Element, number>();

function addInert(element: Element): void {
	const next = (inertCounts.get(element) ?? 0) + 1;
	inertCounts.set(element, next);
	if (next === 1) element.setAttribute('inert', '');
}

function removeInert(element: Element): void {
	const current = inertCounts.get(element);
	if (current === undefined) return;
	if (current <= 1) {
		inertCounts.delete(element);
		element.removeAttribute('inert');
	} else {
		inertCounts.set(element, current - 1);
	}
}

/**
 * Attachment that traps keyboard focus inside a dialog and restores focus to the
 * previously-focused element when the dialog is removed.
 *
 * - On attach: records the active element, moves focus into the dialog (first
 *   focusable, else the container itself when it is focusable), intercepts
 *   Tab/Shift+Tab so focus wraps within the dialog, and sets `inert` on the
 *   dialog's backdrop siblings so screen-reader virtual cursor and browse mode
 *   cannot reach underlying page chrome.
 * - On detach: returns focus to the element that was focused before the dialog
 *   opened and releases the `inert` counts (stacking-safe).
 *
 * The container should carry `role="dialog"` / `aria-modal="true"` and either
 * contain focusable controls or be given `tabindex="-1"` so it can receive focus.
 * The markup is expected to wrap the dialog in a full-viewport backdrop element
 * (`<div class="...backdrop"><div role="dialog" ...>{@attach focusTrap}</div></div>`);
 * the backdrop's siblings are the page chrome that gets inerted.
 */
export const focusTrap: Attachment<HTMLElement> = (node) => {
	const previouslyFocused = document.activeElement as HTMLElement | null;

	// Inert the backdrop's siblings so screen-reader browse mode and the virtual
	// cursor cannot reach underlying controls. `aria-modal` + Tab trapping alone
	// do not block SR browse mode; `inert` is the spec-correct mechanism.
	const backdrop = node.parentElement;
	const inerted: Element[] = [];
	if (backdrop?.parentElement) {
		for (const sibling of backdrop.parentElement.children) {
			if (sibling === backdrop) continue;
			if (!(sibling instanceof Element)) continue;
			addInert(sibling);
			inerted.push(sibling);
		}
	}

	const focusable = getFocusableCandidates(node);
	// Fall back to the container itself when there are no focusable children.
	// `tabIndex >= -1` covers both `tabindex="0"` and `tabindex="-1"` (the latter is
	// programmatically focusable but excluded from tab order); `.focus()` is a no-op
	// on elements that are not actually focusable, so this is safe to attempt.
	const initialTarget = focusable[0] ?? (node.tabIndex >= -1 ? node : null);
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
		for (const sibling of inerted) {
			removeInert(sibling);
		}
		// Only restore focus if the previously-focused element is still in the
		// DOM. If it was removed while the dialog was open (e.g. a list item that
		// re-rendered), focus would silently fall to `document.body` anyway, but
		// calling `.focus()` on a detached node is a no-op we can skip explicitly.
		if (previouslyFocused?.isConnected) {
			previouslyFocused.focus?.();
		}
	};
};
