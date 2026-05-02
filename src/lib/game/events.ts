import { createRngFromState } from './rng';
import { MAX_STORES, type DecisionItem, type GameState } from './types';

const CASH_PRESSURE_ID = 'cash-pressure';
const EXPANSION_ID = 'expansion-opportunity';
const SUPPLIER_TERMS_ID = 'supplier-terms';

export function generateDecisions(game: GameState): DecisionItem[] {
	const existingIds = new Set(game.decisions.map((decision) => decision.id));
	const decisions: DecisionItem[] = [];

	if (game.cash < 0 && !existingIds.has(CASH_PRESSURE_ID)) {
		decisions.push(cashPressureDecision(game));
	}

	if (
		decisions.length === 0 &&
		game.day >= 14 &&
		game.cash >= 55_000 &&
		game.stores.length < MAX_STORES &&
		game.scorecard.profit >= 62 &&
		!existingIds.has(EXPANSION_ID)
	) {
		decisions.push(expansionOpportunityDecision(game));
	}

	if (decisions.length === 0 && !existingIds.has(SUPPLIER_TERMS_ID)) {
		const rng = createRngFromState(game.rngState + game.day * 97);

		if (rng.next() < 0.12) {
			decisions.push(supplierTermsDecision(game));
		}
	}

	return decisions.slice(0, 1);
}

export function pruneExpiredDecisions(game: GameState): DecisionItem[] {
	return game.decisions.filter((decision) => decision.expiresOnDay >= game.day);
}

function cashPressureDecision(game: GameState): DecisionItem {
	return {
		id: CASH_PRESSURE_ID,
		title: 'Cash pressure',
		context: 'Cash is below zero. Choose how to keep operations moving while protecting the brand.',
		expiresOnDay: game.day + 2,
		options: [
			{
				id: 'short-loan',
				label: 'Short loan',
				description: 'Add emergency working capital and accept pressure on profitability.',
				effects: {
					cash: 12_000,
					profit: -4,
					marketPosition: -1
				}
			},
			{
				id: 'cut-costs',
				label: 'Cut costs',
				description: 'Trim discretionary spend and inventory depth to stabilize cash.',
				effects: {
					cash: 5_500,
					customerSatisfaction: -4,
					staffMorale: -5,
					stockHealth: -8
				}
			},
			{
				id: 'hold-course',
				label: 'Hold course',
				description: "Avoid reactive changes and let tomorrow's sales carry the business.",
				effects: {
					profit: 1,
					staffMorale: -2
				}
			}
		]
	};
}

function expansionOpportunityDecision(game: GameState): DecisionItem {
	return {
		id: EXPANSION_ID,
		title: 'Expansion opportunity',
		context: 'Strong profit and cash reserves make a second storefront plausible.',
		expiresOnDay: game.day + 3,
		options: [
			{
				id: 'prepare',
				label: 'Prepare',
				description: 'Start scouting locations and lining up the opening plan.',
				effects: {
					cash: -3_500,
					marketPosition: 5,
					profit: -1
				}
			},
			{
				id: 'pass',
				label: 'Pass',
				description: 'Keep capital focused on the current store.',
				effects: {
					profit: 1,
					staffMorale: 1
				}
			}
		]
	};
}

function supplierTermsDecision(game: GameState): DecisionItem {
	return {
		id: SUPPLIER_TERMS_ID,
		title: 'Supplier terms',
		context: 'A supplier is open to revising ordering terms before the next replenishment cycle.',
		expiresOnDay: game.day + 2,
		options: [
			{
				id: 'negotiate-credit',
				label: 'Negotiate credit',
				description: 'Stretch payment timing for a small margin penalty.',
				effects: {
					cash: 4_000,
					profit: -2
				}
			},
			{
				id: 'bulk-discount',
				label: 'Bulk discount',
				description: 'Commit to larger orders for better unit economics.',
				effects: {
					cash: -2_500,
					profit: 3,
					stockHealth: 6
				}
			}
		]
	};
}
