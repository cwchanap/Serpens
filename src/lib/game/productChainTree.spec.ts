import { describe, expect, it } from 'vitest';
import { buildProductChainTree } from './productChainTree';
import { createNewGame } from './state';
import type { GameState } from './types';

function convenienceGame(): GameState {
	return { ...createNewGame('convenience', 20260611), cash: 1_000_000 };
}

describe('buildProductChainTree', () => {
	it('builds the bottled water chain as a three-node spine', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'bottled-water'
		});

		expect(tree.id).toBe('chain:bottled-water');
		expect(tree.emptyReason).toBeNull();
		expect(tree.nodes.map((node) => node.id)).toEqual([
			'recipe:water-pumping@water-bottling',
			'recipe:water-bottling',
			'product:bottled-water'
		]);
		expect(tree.edges.map((edge) => edge.id)).toEqual([
			'recipe:water-bottling->product:bottled-water',
			'recipe:water-pumping@water-bottling->recipe:water-bottling'
		]);
	});

	it('gives every non-root node exactly one outgoing edge (tree property)', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const sourceCounts = new Map<string, number>();
		for (const edge of tree.edges) {
			sourceCounts.set(edge.source, (sourceCounts.get(edge.source) ?? 0) + 1);
		}
		for (const node of tree.nodes) {
			if (node.id === 'product:snacks') continue;
			expect(sourceCounts.get(node.id), `${node.id} must feed exactly one parent`).toBe(1);
		}
	});

	it('duplicates shared sub-chains per branch with unique path-suffixed ids', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const ids = tree.nodes.map((node) => node.id);
		expect(new Set(ids).size).toBe(ids.length);
		// In the snacks chain, packaging pulls pulp + plastic — both sub-chains
		// must appear under the packaging branch with path suffixes.
		expect(ids).toContain('recipe:pulp-milling@snack-production/packaging-production');
		expect(ids).toContain('recipe:plastic-production@snack-production/packaging-production');
	});

	it('marks duplicated producers with a shared branch count', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'drinks' });

		// Water pumping feeds filtration directly and syrup production in the drinks chain.
		const waterCopies = tree.nodes.filter((node) => node.recipeId === 'water-pumping');
		expect(waterCopies.length).toBeGreaterThanOrEqual(2);
		for (const copy of waterCopies) {
			expect(copy.sharedBranchCount).toBe(waterCopies.length);
		}
	});

	it('lays out a planar tree: each parent row sits within its children rows', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const byId = tree.details;
		const childrenOf = new Map<string, string[]>();
		for (const edge of tree.edges) {
			childrenOf.set(edge.target, [...(childrenOf.get(edge.target) ?? []), edge.source]);
		}
		for (const [parentId, childIds] of childrenOf) {
			const rows = childIds.map((id) => byId[id]!.row);
			expect(byId[parentId]!.row).toBeGreaterThanOrEqual(Math.min(...rows));
			expect(byId[parentId]!.row).toBeLessThanOrEqual(Math.max(...rows));
			// Every child sits exactly one layer to the left of its parent.
			for (const id of childIds) {
				expect(byId[id]!.layer).toBe(byId[parentId]!.layer - 1);
			}
		}
		// Leaves occupy distinct rows — no overlap.
		const leafRows = tree.nodes.filter((node) => !childrenOf.has(node.id)).map((node) => node.row);
		expect(new Set(leafRows).size).toBe(leafRows.length);
	});

	it('labels merged cards with the building name and output material', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'pantry' });

		const mill = tree.nodes.find(
			(node) => node.id === 'recipe:flour-milling@pantry-goods-production'
		);
		expect(mill?.label).toBe('Flour Mill');
		expect(mill?.subLabel).toBe('Flour');
		expect(mill?.kind).toBe('recipe');
		const root = tree.nodes.find((node) => node.id === 'product:pantry');
		expect(root?.label).toBe('Pantry Goods');
		expect(root?.kind).toBe('material');
	});

	it('flags chains with no placed buildings and no report', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'bottled-water'
		});

		expect(tree.warnings).toContain('No daily report yet; latest-day flow is unavailable.');
		const bottler = tree.details['recipe:water-bottling']!;
		expect(bottler.health).toBe('no-local-capacity');
		expect(bottler.capacity.buildingCount).toBe(0);
	});

	it('returns an empty graph for categories without chains', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'apparel' });

		expect(tree.nodes).toEqual([]);
		expect(tree.emptyReason).toBe('No local production chain available for this category yet.');
	});
});
