import type { MapViewId } from './mapViewKeepAlive';

export type ShortcutAction =
	| { type: 'build' }
	| { type: 'advance-day' }
	| { type: 'view'; view: MapViewId };

export interface ShortcutContext {
	key: string;
	isTypingTarget: boolean;
	hasBlockingOverlay: boolean;
	activeMapView: MapViewId;
	hasGame: boolean;
}

export function resolveShortcutAction(context: ShortcutContext): ShortcutAction | null {
	if (context.isTypingTarget || context.hasBlockingOverlay) {
		return null;
	}

	switch (context.key) {
		case 'b':
		case 'B':
			return context.activeMapView === 'world' ? null : { type: 'build' };
		case ' ':
			return context.hasGame ? { type: 'advance-day' } : null;
		case '1':
			return { type: 'view', view: 'retail' };
		case '2':
			return { type: 'view', view: 'industry' };
		case '3':
			return { type: 'view', view: 'world' };
		default:
			return null;
	}
}
