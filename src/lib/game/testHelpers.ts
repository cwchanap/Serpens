import type { DecisionItem, SystemDecisionItem } from './types';

export function systemDecision(decision: DecisionItem | undefined): SystemDecisionItem {
	if (decision?.kind !== 'system') throw new Error('Expected a system decision');
	return decision;
}
