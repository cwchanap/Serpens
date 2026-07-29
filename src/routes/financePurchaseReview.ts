import type { FinanceFailureCode } from '$lib/game/finance';

export function canConfirmFinancedPurchase(
	offer: unknown | null,
	confirmationPending: boolean
): boolean {
	return offer !== null && !confirmationPending;
}

export function hasFinancedPurchaseOffer<T>(offer: T | null): offer is T {
	return offer !== null;
}

export function shouldRefreshFinancedPurchase(
	result:
		| { status: 'domain-rejected'; code: FinanceFailureCode }
		| { status: string; code?: FinanceFailureCode }
): boolean {
	return (
		result.status === 'domain-rejected' &&
		(result.code === 'purchaseCostChanged' || result.code === 'insufficientCredit')
	);
}
