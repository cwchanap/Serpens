import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';

export type GameIconName =
	| 'build'
	| 'dashboard'
	| 'policies'
	| 'staff'
	| 'stores'
	| 'decisions'
	| 'reports'
	| 'productChains'
	| 'finance'
	| 'logistics'
	| 'retail'
	| 'industry'
	| 'world'
	| 'rail'
	| 'pause'
	| 'resume'
	| 'shortcuts'
	| 'alerts'
	| 'menu'
	| 'day'
	| 'cash'
	| 'close';

export interface ManagementPanelMenuItem {
	id: ManagementPanelId;
	label: string;
	shortcut: string;
	icon: GameIconName;
}

export const ICON_PATHS: Record<GameIconName, readonly string[]> = {
	build: ['M3 20h18', 'M6 20V9l6-4 6 4v11', 'M10 20v-6h4v6'],
	dashboard: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 10h7v10h-7z', 'M4 13h7v7H4z'],
	policies: ['M6 3h9l3 3v15H6z', 'M15 3v4h4', 'm9 13 2 2 4-4'],
	staff: [
		'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
		'M3 21c0-4 12-4 12 0',
		'M17 8a3 3 0 0 1 0 6',
		'M18 16c2.5.4 3 1.8 3 4'
	],
	stores: ['M4 9h16l-2-5H6z', 'M5 9v11h14V9', 'M9 20v-6h6v6'],
	decisions: ['M12 3v6', 'M12 9 5-5', 'M17 4v4', 'M12 9 7 4', 'M19 13v5', 'M19 18l-2 3'],
	reports: ['M5 20V10', 'M10 20V4', 'M15 20v-7', 'M20 20V7', 'M3 20h19'],
	productChains: ['M6 6h.01', 'M18 12h.01', 'M7 18h.01', 'M8 7.4 15.8 11', 'M16.2 13.8 9 17'],
	finance: [
		'M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z',
		'M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7',
		'M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3'
	],
	logistics: [
		'M3 6h11v10H3z',
		'M14 10h4l3 3v3h-7z',
		'M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
		'M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'
	],
	retail: ['M6 8h12l-1-4H7z', 'M7 8v12h10V8', 'M10 20v-6h4v6'],
	industry: ['M3 20V9l6 3V9l6 3V5h4v15Z', 'M3 20h18'],
	world: [
		'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
		'M3 12h18',
		'M12 3c3 3 3 15 0 18',
		'M12 3c-3 3-3 15 0 18'
	],
	rail: ['M6 3h12v13H6z', 'M8 20l2-4', 'M16 20l-2-4', 'M6 8h12', 'M9 6h6'],
	pause: ['M8 5v14', 'M16 5v14'],
	resume: ['M8 5l11 7-11 7Z'],
	shortcuts: [
		'M3 6h18v12H3z',
		'M6 10h.01',
		'M9 10h.01',
		'M12 10h.01',
		'M15 10h.01',
		'M18 10h.01',
		'M7 14h10'
	],
	alerts: ['M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z', 'M10 20a2 2 0 0 0 4 0'],
	menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
	day: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3 2'],
	cash: [
		'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z',
		'M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7',
		'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'
	],
	close: ['M6 6l12 12', 'M18 6L6 18']
};
