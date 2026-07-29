import type { ExpansionFinanceOffer, FinanceFailureCode } from '$lib/game/finance';
import type { ArchetypeId, IndustrialBuildingTypeId, WorldCityId } from '$lib/game/types';

export type PendingFinancedPurchase =
	| {
			kind: 'world';
			cityId: WorldCityId;
			expectedCost: number;
			offer: ExpansionFinanceOffer | null;
	  }
	| {
			kind: 'retail';
			tileId: string;
			archetypeId: ArchetypeId;
			expectedCost: number;
			offer: ExpansionFinanceOffer | null;
	  }
	| {
			kind: 'industry';
			tileId: string;
			buildingTypeId: IndustrialBuildingTypeId;
			expectedCost: number;
			offer: ExpansionFinanceOffer | null;
	  };

export interface FinancePurchaseReviewState {
	purchase: PendingFinancedPurchase | null;
	feedback: string | null;
	confirmationPending: boolean;
	/** Invalidates results from a confirmation that started before a dismissal/reset. */
	generation: number;
}

export type FinancePurchaseCommand =
	| { kind: 'world'; args: [cityId: WorldCityId, expectedCost: number] }
	| {
			kind: 'retail';
			args: [tileId: string, archetypeId: ArchetypeId, expectedCost: number];
	  }
	| {
			kind: 'industry';
			args: [tileId: string, buildingTypeId: IndustrialBuildingTypeId, expectedCost: number];
	  };

export interface FinancePurchaseReviewRequest {
	generation: number;
	purchase: PendingFinancedPurchase;
	command: FinancePurchaseCommand;
}

export type FinancePurchaseReviewCompletion =
	| { kind: 'committed' }
	| {
			kind: 'rejected';
			feedback: string;
			/** Present for a quote refresh, including an explicit null offer. */
			refreshedPurchase?: PendingFinancedPurchase | null;
	  };

export function createFinancePurchaseReviewState(): FinancePurchaseReviewState {
	return { purchase: null, feedback: null, confirmationPending: false, generation: 0 };
}

export function openFinancePurchaseReview(
	state: FinancePurchaseReviewState,
	purchase: PendingFinancedPurchase
): FinancePurchaseReviewState {
	return {
		purchase,
		feedback: null,
		confirmationPending: false,
		generation: state.generation + 1
	};
}

/** Clears the review and makes any in-flight confirmation result obsolete. */
export function dismissFinancePurchaseReview(
	state: FinancePurchaseReviewState
): FinancePurchaseReviewState {
	return {
		purchase: null,
		feedback: null,
		confirmationPending: false,
		generation: state.generation + 1
	};
}

export function createFinancePurchaseCommand(
	purchase: PendingFinancedPurchase
): FinancePurchaseCommand {
	switch (purchase.kind) {
		case 'world':
			return { kind: 'world', args: [purchase.cityId, purchase.expectedCost] };
		case 'retail':
			return {
				kind: 'retail',
				args: [purchase.tileId, purchase.archetypeId, purchase.expectedCost]
			};
		case 'industry':
			return {
				kind: 'industry',
				args: [purchase.tileId, purchase.buildingTypeId, purchase.expectedCost]
			};
	}
}

/** Starts one confirmation request; a second click cannot create another request. */
export function beginFinancePurchaseConfirmation(
	state: FinancePurchaseReviewState
): { state: FinancePurchaseReviewState; request: FinancePurchaseReviewRequest } | null {
	const purchase = state.purchase;
	if (!purchase || purchase.offer === null || state.confirmationPending) return null;

	return {
		state: { ...state, confirmationPending: true },
		request: {
			generation: state.generation,
			purchase,
			command: createFinancePurchaseCommand(purchase)
		}
	};
}

/**
 * Applies a controller result only when it belongs to the currently displayed
 * review. A cancel, Escape, placement cancel, or scenario reset increments the
 * generation and therefore cannot be overwritten by a late result.
 */
export function settleFinancePurchaseConfirmation(
	state: FinancePurchaseReviewState,
	request: FinancePurchaseReviewRequest,
	completion: FinancePurchaseReviewCompletion
): FinancePurchaseReviewState {
	if (state.generation !== request.generation) return state;
	if (completion.kind === 'committed') return dismissFinancePurchaseReview(state);

	return {
		...state,
		purchase:
			completion.refreshedPurchase === undefined ? state.purchase : completion.refreshedPurchase,
		feedback: completion.feedback,
		confirmationPending: false
	};
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
