import type { DecisionItem, DecisionOption } from '$lib/game/types';
import type { WorldCityStatus } from '$lib/game/world';

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
