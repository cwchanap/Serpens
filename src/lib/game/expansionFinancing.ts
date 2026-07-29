import {
	FOUNDING_LOAN_TERM_DAYS,
	borrow,
	type FinanceActionResult,
	type FinancedPurchaseReceipt
} from './finance';
import type { GameState } from './types';

export interface ExpansionPurchaseInput {
	expectedCost: number;
	resolveLiveCost: (candidate: GameState) => number | null;
	cashOnlyPurchase: (candidate: GameState) => GameState;
	postcondition: (candidate: GameState) => boolean;
}

function purchaseFailure(
	game: GameState,
	code: 'purchaseUnavailable' | 'purchaseCostChanged',
	context: Record<string, string | number> = {}
): Extract<FinanceActionResult<FinancedPurchaseReceipt>, { ok: false }> {
	return { ok: false, game, code, context };
}

// This runner is internal-only: its callback-bearing input is consumed solely by
// the three domain adapters, never re-exported from their public modules.
export function runExpansionPurchase(
	game: GameState,
	input: ExpansionPurchaseInput
): FinanceActionResult<FinancedPurchaseReceipt> {
	const purchaseCost = input.resolveLiveCost(game);
	if (purchaseCost === null || !Number.isSafeInteger(purchaseCost) || purchaseCost < 0) {
		return purchaseFailure(game, 'purchaseUnavailable');
	}
	if (input.expectedCost !== purchaseCost) {
		return purchaseFailure(game, 'purchaseCostChanged', {
			expectedCost: input.expectedCost,
			purchaseCost
		});
	}

	const shortfall = purchaseCost - game.cash;
	if (shortfall <= 0) {
		const purchased = input.cashOnlyPurchase(game);
		return input.postcondition(purchased)
			? {
					ok: true,
					game: purchased,
					receipt: { loanId: '', purchaseCost, financedPrincipal: 0 }
				}
			: purchaseFailure(game, 'purchaseUnavailable');
	}

	const borrowed = borrow(game, {
		purpose: 'expansion',
		amount: shortfall,
		termDays: FOUNDING_LOAN_TERM_DAYS,
		allowBelowMinimum: true
	});
	if (!borrowed.ok) return { ...borrowed, game };

	const purchased = input.cashOnlyPurchase(borrowed.game);
	if (!input.postcondition(purchased)) return purchaseFailure(game, 'purchaseUnavailable');

	return {
		ok: true,
		game: purchased,
		receipt: {
			loanId: borrowed.receipt.loanId,
			purchaseCost,
			financedPrincipal: shortfall
		}
	};
}
