import type { GameAlert } from '$lib/game/alerts';
import { selectCashRecovery, type CashRecoveryStep } from '$lib/game/cashRecovery';
import {
	isSandboxOpeningWindow,
	selectOpeningGuidance,
	type OpeningGuidance
} from '$lib/game/openingGuidance';
import type { GameState } from '$lib/game/types';

export function selectRouteGuidance(input: {
	game: GameState | null;
	alerts: readonly GameAlert[];
	playMode: 'sandbox' | 'scenario';
	scenarioId: string | null;
	openingDismissed: boolean;
}) {
	const { game, alerts, playMode, scenarioId, openingDismissed } = input;
	const openingGuidanceHint = selectOpeningGuidance(game, alerts);
	const inOpeningWindow = isSandboxOpeningWindow(game);
	const showOpeningGuidance =
		openingGuidanceHint !== null &&
		((playMode === 'scenario' && scenarioId === 'first-profit') ||
			(playMode === 'sandbox' && inOpeningWindow && !openingDismissed));
	// Dismissing the opening card must not substitute a second card for the same crisis.
	const cashRecoveryPlan =
		playMode === 'sandbox' && !showOpeningGuidance && !inOpeningWindow
			? selectCashRecovery(game, alerts)
			: null;
	return { openingGuidanceHint, showOpeningGuidance, cashRecoveryPlan };
}

export type RouteGuidanceAction = OpeningGuidance | CashRecoveryStep;

type GuidanceHandoff =
	| { kind: 'alert'; alert: GameAlert }
	| { kind: 'panel'; panelId: 'dashboard' | 'staff' | 'logistics' };

export function resolveGuidanceHandoff(action: RouteGuidanceAction): GuidanceHandoff {
	switch (action.kind) {
		case 'cash-risk':
		case 'stock-recovery':
		case 'restock':
		case 'finance':
			return { kind: 'alert', alert: action.alert };
		case 'first-result':
		case 'result-evidence':
			return { kind: 'panel', panelId: 'dashboard' };
		case 'assign-idle-staff':
		case 'release-idle-staff':
		case 'review-payroll':
			return { kind: 'panel', panelId: 'staff' };
		case 'pause-routes':
			return { kind: 'panel', panelId: 'logistics' };
	}
}
