import type { WorldCityStatus } from '$lib/game/world';
import type {
	ProductChainNode,
	ProductChainEdge,
	ProductChainGraph,
	ProductChainCategorySummary
} from '$lib/game/productChainGraph';

export interface LocalizedDecisionOption {
	id: string;
	label: string;
	description: string;
}

export interface LocalizedDecision {
	id: string;
	title: string;
	context: string;
	expiresOnDay: number;
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
	statLine: string; // localized
}

export interface LocalizedProductChainEdge extends Omit<ProductChainEdge, 'label'> {
	label: string; // localized
	healthLabel: string; // localized
}

export interface LocalizedProductChainGraph extends Omit<
	ProductChainGraph,
	'nodes' | 'edges' | 'warnings' | 'details' | 'emptyReason'
> {
	nodes: LocalizedProductChainNode[];
	edges: LocalizedProductChainEdge[];
	warnings: string[]; // localized
	details: Record<string, LocalizedProductChainNode>;
	emptyReason: string | null; // localized
}

export interface LocalizedProductChainCategorySummary extends Omit<
	ProductChainCategorySummary,
	'bottleneck'
> {
	bottleneck: string; // localized
}
