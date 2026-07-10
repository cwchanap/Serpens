import type { DecisionItem, DecisionOption } from '$lib/game/types';
import type { WorldCityStatus } from '$lib/game/world';
import type {
	ProductChainNode,
	ProductChainEdge,
	ProductChainGraph,
	ProductChainCategorySummary
} from '$lib/game/productChainGraph';

export type LocalizedDecisionOption = DecisionOption;

export interface LocalizedDecision extends Omit<DecisionItem, 'context'> {
	context: string; // localized display string (was inherited as DecisionContext)
	options: LocalizedDecisionOption[];
}

export interface LocalizedWorldCityStatus extends Omit<WorldCityStatus, 'blockedReason'> {
	blockedReason: string | null; // localized (was DecisionContext | null on the raw type)
	city: WorldCityStatus['city'];
	kindLabel: string;
	stateLabel: string;
}

export interface LocalizedProductChainNode extends Omit<ProductChainNode, 'bottleneck'> {
	bottleneck: string; // localized
}

export interface LocalizedProductChainEdge extends Omit<ProductChainEdge, 'label'> {
	label: string; // localized
}

export interface LocalizedProductChainGraph extends Omit<
	ProductChainGraph,
	'nodes' | 'edges' | 'warnings' | 'details'
> {
	nodes: LocalizedProductChainNode[];
	edges: LocalizedProductChainEdge[];
	warnings: string[]; // localized
	details: Record<string, LocalizedProductChainNode>;
}

export interface LocalizedProductChainCategorySummary extends Omit<
	ProductChainCategorySummary,
	'bottleneck'
> {
	bottleneck: string; // localized
}
