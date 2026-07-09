import { buildWarehouseFlowGraph } from '$lib/game/productChainGraph';
import { createNewGame } from '$lib/game/state';
import type { GameAlert } from '$lib/game/alerts';
import type { DecisionItem } from '$lib/game/types';
import type { WorldCityId } from '$lib/game/types';
import { getWorldCityStatus } from '$lib/game/world';
import { describe, expect, it } from 'vitest';
import { createI18n } from './index';
import { messagesByLocale } from './messages';
import {
	localizeAlert,
	localizeDecision,
	localizeProductChainGraph,
	localizeStockStatus,
	localizeStockTrouble,
	localizeWorldCityStatus
} from './gameCopy';

function flattenStrings(
	value: unknown,
	path: string[] = [],
	output: Array<{ key: string; value: string }> = []
): Array<{ key: string; value: string }> {
	if (typeof value === 'string') {
		output.push({ key: path.join('.'), value });
		return output;
	}

	if (value && typeof value === 'object') {
		for (const [key, nested] of Object.entries(value)) {
			flattenStrings(nested, [...path, key], output);
		}
	}

	return output;
}

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

	it('localizes event, state, and world decision families while preserving unknown fallback', () => {
		expect.assertions(15);
		const japanese = createI18n('ja');
		const english = createI18n('en');

		const expansionOpportunity: DecisionItem = {
			id: 'expansion-opportunity',
			title: 'Expansion opportunity',
			context: 'Strong profit and cash reserves make a second storefront plausible.',
			expiresOnDay: 5,
			options: [
				{
					id: 'prepare',
					label: 'Prepare',
					description: 'Start scouting locations and lining up the opening plan.',
					effects: {}
				},
				{
					id: 'pass',
					label: 'Pass',
					description: 'Keep capital focused on the current store.',
					effects: {}
				}
			]
		};
		const supplierTerms: DecisionItem = {
			id: 'supplier-terms',
			title: 'Supplier terms',
			context: 'A supplier is open to revising ordering terms before the next replenishment cycle.',
			expiresOnDay: 5,
			options: [
				{
					id: 'negotiate-credit',
					label: 'Negotiate credit',
					description: 'Stretch payment timing for a small margin penalty.',
					effects: {}
				},
				{
					id: 'bulk-discount',
					label: 'Bulk discount',
					description: 'Commit to larger orders for better unit economics.',
					effects: {}
				}
			]
		};
		const stateDecision: DecisionItem = {
			id: 'location-unavailable-road-1',
			title: 'Location unavailable',
			context: 'Road location blocks store placement. Choose another city tile.',
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		const worldDecision: DecisionItem = {
			id: 'world-city-city-opening-delayed-opening-this-city-requires-18-000-cash-1',
			title: 'City opening delayed',
			context: 'Opening this city requires 18,000 cash.',
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		const unavailableDecision: DecisionItem = {
			id: 'expansion-unavailable-1',
			title: 'Expansion unavailable',
			context: 'This chain can operate up to 3 stores for now.',
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to operations planning.',
					effects: {}
				}
			]
		};
		const industrialDecision: DecisionItem = {
			id: 'industrial-construction-delayed-grain-farm-industry-city-1-1-locked-industrial-tile-2',
			title: 'Industrial construction delayed',
			context: 'Locked industrial tile',
			expiresOnDay: 2,
			options: [
				{
					id: 'acknowledge',
					label: 'Acknowledge',
					description: 'Return to industry planning.',
					effects: {}
				}
			]
		};

		expect(localizeDecision(expansionOpportunity, japanese).title).not.toBe(
			expansionOpportunity.title
		);
		expect(localizeDecision(expansionOpportunity, japanese).options[0]?.label).not.toBe(
			expansionOpportunity.options[0]?.label
		);
		expect(localizeDecision(supplierTerms, japanese).title).not.toBe(supplierTerms.title);
		expect(localizeDecision(supplierTerms, japanese).options[0]?.label).not.toBe(
			supplierTerms.options[0]?.label
		);
		expect(localizeDecision(stateDecision, japanese).title).not.toBe(stateDecision.title);
		expect(localizeDecision(stateDecision, japanese).context).not.toBe(stateDecision.context);
		expect(localizeDecision(worldDecision, japanese).title).not.toBe(worldDecision.title);
		expect(localizeDecision(worldDecision, japanese).context).not.toBe(worldDecision.context);
		expect(localizeDecision(unavailableDecision, japanese).context).not.toBe(
			unavailableDecision.context
		);
		expect(localizeDecision(unavailableDecision, japanese).options[0]?.description).not.toBe(
			unavailableDecision.options[0]?.description
		);
		expect(localizeDecision(stateDecision, english).options[0]?.description).toBe(
			'Return to location planning.'
		);
		expect(localizeDecision(industrialDecision, japanese).title).not.toBe(industrialDecision.title);
		expect(localizeDecision(industrialDecision, japanese).context).not.toBe(
			industrialDecision.context
		);
		expect(localizeDecision(industrialDecision, english).options[0]?.description).toBe(
			'Return to industry planning.'
		);
		expect(localizeDecision({ ...worldDecision, id: 'unknown-decision' }, english).title).toBe(
			worldDecision.title
		);
	});

	it('does not leave known decision-copy branches equal to English in localized catalogs', () => {
		expect.assertions(2);
		const knownDecisionFamilies = [
			'cashPressure',
			'expansionOpportunity',
			'supplierTerms',
			'expansionUnavailable',
			'expansionCashBlocked',
			'locationUnavailable',
			'industrialConstructionDelayed',
			'worldCity',
			'acknowledge'
		] as const;
		const english = messagesByLocale.en.copy.decisions;

		for (const locale of ['ja', 'zh-Hant'] as const) {
			const identicalKeys = knownDecisionFamilies.flatMap((family) => {
				const localized = messagesByLocale[locale].copy.decisions[family];
				const englishFamily = english[family];
				return flattenStrings(localized, [family])
					.filter(({ key, value }) => {
						const englishValue = flattenStrings(englishFamily).find(
							(entry) => `${family}.${entry.key}` === key
						)?.value;
						return englishValue === value;
					})
					.map(({ key }) => key);
			});

			expect(identicalKeys).toEqual([]);
		}
	});
});
