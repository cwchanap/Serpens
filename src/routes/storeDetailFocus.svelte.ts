import type { ProductId } from '$lib/game/types';

/**
 * Route-side focus wiring for the focused store-detail overlay (HPA-293
 * deep-link), extracted from +page.svelte so page.svelte.spec.ts can pin the
 * focus contract: the milestone CTA's review-stock handoff, the alert
 * deep-link, and every detail-close path route through this single instance —
 * the page holds no second focus atom.
 *
 * The focused product is transient (a deep-link target from a stock alert or
 * milestone CTA); it is never persisted.
 *
 * @param hasSelectedStore must return true when a store IS selected (e.g.
 * `() => selectedStore !== null`); `open()` silently refuses to open the
 * overlay while it returns false. Do NOT invert this (e.g. `!selectedStore`).
 */
export function createStoreDetailFocus(hasSelectedStore: () => boolean) {
	let isOpen = $state(false);
	let focusedProductId = $state<ProductId | null>(null);

	return {
		get isOpen() {
			return isOpen;
		},
		get focusedProductId() {
			return focusedProductId;
		},
		/**
		 * Brief contract, verbatim: `openStoreDetail(productId = null)` — same
		 * guard, same writes, same order (focus first, then open).
		 */
		open(productId: ProductId | null = null): void {
			if (!hasSelectedStore()) return;
			focusedProductId = productId;
			isOpen = true;
		},
		/** Stock-alert deep-link: opens focused without a pre-selected store. */
		openDirect(productId: ProductId | null): void {
			focusedProductId = productId;
			isOpen = true;
		},
		/** Shared close semantics: closing the detail always clears focus. */
		close(): void {
			isOpen = false;
			focusedProductId = null;
		}
	};
}
