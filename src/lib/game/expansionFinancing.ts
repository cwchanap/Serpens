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
	code: 'purchaseUnavailable' | 'purchaseCostChanged' | 'cashSufficient',
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

	// A financed command must not fall back to the cash-only transition when
	// shortfall <= 0. That bypasses scenario allowedCommands: a definition
	// granting financeIndustrialBuilding but not buildIndustrialBuilding could
	// still spend cash through the finance command. The cash-sufficient path is
	// the cash command's responsibility; the finance command is offered only for
	// a positive shortfall.
	const shortfall = purchaseCost - game.cash;
	if (shortfall <= 0) {
		return purchaseFailure(game, 'cashSufficient', {
			purchaseCost,
			cash: game.cash
		});
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
