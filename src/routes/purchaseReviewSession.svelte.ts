import { tick } from 'svelte';
import type { I18nBundle } from '$lib/i18n';
import { isGameRouteCommitted, type GameRouteCommitResult } from '$lib/game/commandResult';
import type { FinanceFailureCode } from '$lib/game/finance';
import type { GameState } from '$lib/game/types';
import {
	beginFinancePurchaseConfirmation,
	createFinancePurchaseReviewState,
	dismissFinancePurchaseReview,
	openFinancePurchaseReview,
	refreshedFinancedPurchase,
	settleFinancePurchaseConfirmation,
	shouldRefreshFinancedPurchase,
	type FinancePurchaseReviewState,
	type PendingFinancedPurchase
} from './financePurchaseReview';
import type { GameRouteController } from './gameRouteController';

export type PurchaseReviewSessionCommands = Pick<
	GameRouteController,
	'financeWorldCity' | 'financeRetailStore' | 'financeIndustrialBuilding'
>;

interface PurchaseReviewSessionOptions {
	getGame(): GameState | null;
	getI18n(): I18nBundle;
	commands: PurchaseReviewSessionCommands;
	/**
	 * Runs after a committed settlement passes the generation check, before
	 * the review state clears: the owner clears selections and placement mode
	 * exactly where the pre-extraction route did.
	 */
	onCommitted(): void;
}

/**
 * Route-side session for one financed-purchase review dialog. Owns the review
 * state atom, its focus-return bookkeeping and the confirmation lifecycle;
 * the domain math stays in `financePurchaseReview.ts` reducers. `close` is
 * the guarded user dismissal (focus restored after `tick`); `reset` is the
 * non-focus-restoring dismissal used by route resets and placement cancels.
 */
export function createPurchaseReviewSession(options: PurchaseReviewSessionOptions) {
	// Reducers always replace the whole state object, so raw state keeps
	// reactivity without proxying the stored purchase (identity assertions
	// in specs must see the exact object the caller opened).
	let review = $state.raw<FinancePurchaseReviewState>(createFinancePurchaseReviewState());
	let returnFocus = $state<HTMLElement | null>(null);

	function financeFailureMessage(code: FinanceFailureCode): string {
		return options.getI18n().t(`financePanel.failures.${code}` as never);
	}

	function open(purchase: PendingFinancedPurchase): void {
		returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		review = openFinancePurchaseReview(review, purchase);
	}

	async function confirm(): Promise<void> {
		const game = options.getGame();
		if (!game) return;
		const gameSnapshot = game;
		const started = beginFinancePurchaseConfirmation(review);
		if (!started) return;
		review = started.state;
		const { request } = started;

		let result: GameRouteCommitResult;
		if (request.command.kind === 'world') {
			result = await options.commands.financeWorldCity(...request.command.args);
		} else if (request.command.kind === 'retail') {
			result = await options.commands.financeRetailStore(...request.command.args);
		} else {
			result = await options.commands.financeIndustrialBuilding(...request.command.args);
		}

		if (isGameRouteCommitted(result)) {
			if (review.generation !== request.generation) return;
			options.onCommitted();
			review = settleFinancePurchaseConfirmation(review, request, { kind: 'committed' });
			return;
		}

		const feedback =
			result.status === 'domain-rejected'
				? financeFailureMessage(result.code)
				: options.getI18n().t('financePanel.ui.failed');
		review = settleFinancePurchaseConfirmation(review, request, {
			kind: 'rejected',
			feedback,
			refreshedPurchase: shouldRefreshFinancedPurchase(result)
				? refreshedFinancedPurchase(request.purchase, options.getGame() ?? gameSnapshot)
				: undefined
		});
	}

	function close(): void {
		if (review.confirmationPending) return;
		review = dismissFinancePurchaseReview(review);
		const focus = returnFocus;
		returnFocus = null;
		if (focus) {
			void tick().then(() => focus.focus());
		}
	}

	function reset(): void {
		review = dismissFinancePurchaseReview(review);
		returnFocus = null;
	}

	return {
		get state(): FinancePurchaseReviewState {
			return review;
		},
		open,
		confirm,
		close,
		reset
	};
}
