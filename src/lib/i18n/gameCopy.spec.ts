import { buildWarehouseFlowGraph } from '$lib/game/productChainGraph';
import { createNewGame } from '$lib/game/state';
import type { GameAlert } from '$lib/game/alerts';
import type { DecisionItem } from '$lib/game/types';
import type { WorldCityId } from '$lib/game/types';
import { getWorldCityStatus } from '$lib/game/world';
import { describe, expect, it } from 'vitest';
import { createI18n } from './index';
import {
	localizeAlert,
	localizeDecision,
	localizeProductChainGraph,
	localizeStockStatus,
	localizeStockTrouble,
	localizeWorldCityStatus
} from './gameCopy';

describe('game copy builders', () => {
	it('localizes stock status and stock-trouble summaries', () => {
		expect.assertions(3);
		const i18n = createI18n('en');
		expect(localizeStockStatus('Healthy', i18n)).toBe('Healthy');
		expect(
			localizeStockTrouble(
				[
					{ stock: 0, reorderThreshold: 4 },
					{ stock: 2, reorderThreshold: 4 }
				],
				i18n
			)
		).toBe('1 product out of stock, 1 product needs import');
		expect(localizeStockStatus('Healthy', createI18n('ja'))).not.toBe('Healthy');
	});

	it('rebuilds known alerts and falls back for unknown ones', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260708);
		const troubledGame = {
			...game,
			stores: game.stores.map((store) =>
				store.id === 'store-1'
					? {
							...store,
							products: store.products.map((product) => ({
								...product,
								stock: 0,
								reorderThreshold: 4
							}))
						}
					: store
			)
		};
		const alert: GameAlert = {
			id: 'store-stock:store-1',
			kind: 'store-stock',
			message: 'stale',
			storeId: 'store-1'
		};

		expect(localizeAlert(alert, troubledGame, createI18n('en'))).toBe(
			'Convenience Store: 1 product out of stock'
		);
		expect(
			localizeAlert(
				{ id: 'unknown', kind: 'decision', message: 'Keep original message' },
				troubledGame,
				createI18n('en')
			)
		).toBe('Keep original message');
	});

	it('localizes known decisions, world-city status copy, and product-chain graph labels', () => {
		expect.assertions(9);
		const english = createI18n('en');
		const japanese = createI18n('ja');
		const decision: DecisionItem = {
			id: 'cash-pressure',
			title: 'Cash pressure',
			context:
				'Cash is below zero. Choose how to keep operations moving while protecting the brand.',
			expiresOnDay: 3,
			options: [
				{
					id: 'short-loan',
					label: 'Short loan',
					description: 'Add emergency working capital and accept pressure on profitability.',
					effects: { cash: 12_000 }
				}
			]
		};
		const localizedDecision = localizeDecision(decision, japanese);
		const game = {
			...createNewGame('convenience', 20260708),
			cash: 1_000,
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'] as WorldCityId[],
				openedCityIds: ['harbor-city', 'industry-city'] as WorldCityId[],
				claimedMilestoneIds: []
			}
		};
		const worldStatus = getWorldCityStatus(game, 'campus-junction');
		const graph = buildWarehouseFlowGraph(createNewGame('convenience', 20260708));
		const localizedGraph = localizeProductChainGraph(graph, japanese);

		expect(localizedDecision.title).not.toBe(decision.title);
		expect(localizedDecision.options[0]?.label).not.toBe(decision.options[0]?.label);
		expect(localizeDecision({ ...decision, id: 'unknown' }, english).title).toBe(decision.title);
		expect(worldStatus).not.toBeNull();
		expect(localizeWorldCityStatus(worldStatus!, english).city.name).toBe('Campus Junction');
		expect(localizeWorldCityStatus(worldStatus!, japanese).city.name).not.toBe('Campus Junction');
		expect(localizedGraph.id).toBe(graph.id);
		expect(localizedGraph.title).not.toBe(graph.title);
		expect(localizedGraph.emptyReason).not.toBe(graph.emptyReason);
	});
});
