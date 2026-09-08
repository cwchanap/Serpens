import type { LocalizedProductChainGraph } from '$lib/i18n/localizedTypes';

/** Follow the first ingredient branch; the full graph remains available in the panel. */
export function chainOverview(graph: LocalizedProductChainGraph): LocalizedProductChainGraph {
	const path: LocalizedProductChainGraph['nodes'] = [];
	let node = graph.nodes.find((entry) => entry.id.startsWith('product:'));
	while (node && !path.some((entry) => entry.id === node?.id)) {
		path.unshift(node);
		const inputs = graph.edges.filter((edge) => edge.target === node?.id);
		node = inputs
			.map((edge) => graph.details[edge.source])
			.filter((entry) => entry !== undefined)
			.sort((a, b) => a.row - b.row)[0];
	}
	if (path.length === 0) return graph;
	const ids = new Set(path.map((entry) => entry.id));
	return {
		...graph,
		nodes: path.map((entry, layer) => ({ ...entry, layer, row: 0 })),
		edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
	};
}
