import { MANAGEMENT_PANEL_SHORTCUT_KEY, type ManagementPanelId } from '$lib/game/keyboardShortcuts';
import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
import type { WorldCityId } from '$lib/game/types';
import type { I18nBundle } from '$lib/i18n';
import type { GameRouteController } from './gameRouteController';

/** Panel-workflow command port: the controller mutations the panels drive. */
export type ManagementUiCommands = Pick<
	GameRouteController,
	| 'updatePolicy'
	| 'setPolicyOverride'
	| 'clearPolicyOverrideField'
	| 'resetPolicyOverrideScope'
	| 'setManagerDelegation'
	| 'removeManagerDelegation'
	| 'resolveDecision'
	| 'hireStaff'
	| 'assignStaff'
	| 'unassignStaff'
	| 'releaseStaff'
	| 'promoteStaff'
	| 'setRetailSupplySource'
	| 'borrowWorkingCapital'
	| 'repayFinanceLoan'
	| 'payOffFinanceLoan'
	| 'refinanceFinanceLoan'
	| 'dispatchManualTransfer'
	| 'createRecurringRoute'
	| 'updateRecurringRoute'
	| 'pauseRecurringRoute'
	| 'resumeRecurringRoute'
	| 'reprioritizeRecurringRoute'
	| 'removeRecurringRoute'
>;

export interface ManagementPanelMenuItem {
	id: ManagementPanelId;
	label: string;
	shortcut: string;
}

const managementPanelMenuConfig: Array<{ id: ManagementPanelId; shortcut: string }> = [
	{ id: 'dashboard', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.dashboard },
	{ id: 'policies', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.policies },
	{ id: 'staff', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.staff },
	{ id: 'stores', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.stores },
	{ id: 'decisions', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.decisions },
	{ id: 'reports', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.reports },
	{ id: 'productChains', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.productChains },
	{ id: 'finance', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.finance },
	{ id: 'logistics', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.logistics }
];

interface ManagementUiOptions {
	getI18n(): I18nBundle;
	/** Closes the current shell surfaces (game menu, saves panel, build menu) before a panel opens. */
	onOpen(): void;
}

/**
 * Per-page management navigation owner: the active panel id, the localized
 * panel menu and the panel-scoped focus atoms (logistics route/preset, retail
 * supply city, finance loan). `hide()` parks the panel while another shell
 * owns the screen and keeps every focus atom; `close()` is the user's explicit
 * dismissal and clears the logistics and supply focus while the finance loan
 * focus survives until an explicit `clearFinanceFocus()`. Holds no game state
 * and issues no commands — the host and route controller own those.
 */
export function createManagementUi(options: ManagementUiOptions) {
	let activePanelId = $state<ManagementPanelId | null>(null);
	let focusedFinanceLoanId = $state<string | null>(null);
	let focusedLogisticsRouteId = $state<string | null>(null);
	// Replaced wholesale by handoffs, never mutated in place — raw keeps the
	// caller's reference intact for the panel form.
	let logisticsRoutePreset = $state.raw<RecurringRouteInput | null>(null);
	let focusedRetailSupplyCityId = $state<WorldCityId | null>(null);

	const menu = $derived.by<ManagementPanelMenuItem[]>(() =>
		managementPanelMenuConfig.map((item) => ({
			...item,
			label: options.getI18n().labels.managementPanel(item.id)
		}))
	);

	function open(panelId: ManagementPanelId): void {
		options.onOpen();
		if (panelId !== 'logistics') {
			focusedLogisticsRouteId = null;
			logisticsRoutePreset = null;
		}
		if (panelId !== 'stores') {
			focusedRetailSupplyCityId = null;
		}
		// Panels open even before a store is founded; the host falls back to an
		// empty starter state and its command handlers no-op until a game exists.
		activePanelId = panelId;
	}

	function openLogistics(
		routeId: string | null = null,
		preset: RecurringRouteInput | null = null
	): void {
		open('logistics');
		// Handoff opens intentionally reset the focus/preset, even to null.
		focusedLogisticsRouteId = routeId;
		logisticsRoutePreset = preset;
	}

	function openStores(retailCityId: WorldCityId): void {
		open('stores');
		focusedRetailSupplyCityId = retailCityId;
	}

	function hide(): void {
		activePanelId = null;
	}

	function close(): void {
		activePanelId = null;
		focusedLogisticsRouteId = null;
		logisticsRoutePreset = null;
		focusedRetailSupplyCityId = null;
	}

	return {
		get activePanelId() {
			return activePanelId;
		},
		get activePanel() {
			return menu.find((item) => item.id === activePanelId) ?? null;
		},
		get menu() {
			return menu;
		},
		get focusedFinanceLoanId() {
			return focusedFinanceLoanId;
		},
		get focusedLogisticsRouteId() {
			return focusedLogisticsRouteId;
		},
		get logisticsRoutePreset() {
			return logisticsRoutePreset;
		},
		get focusedRetailSupplyCityId() {
			return focusedRetailSupplyCityId;
		},
		open,
		openLogistics,
		openStores,
		hide,
		close,
		clearLogisticsFocus(): void {
			focusedLogisticsRouteId = null;
		},
		clearLogisticsPreset(): void {
			logisticsRoutePreset = null;
		},
		clearRetailSupplyFocus(): void {
			focusedRetailSupplyCityId = null;
		},
		focusFinance(loanId: string): void {
			focusedFinanceLoanId = loanId;
		},
		clearFinanceFocus(): void {
			focusedFinanceLoanId = null;
		},
		acceptRouteRemoved(routeId: string): void {
			if (focusedLogisticsRouteId === routeId) {
				focusedLogisticsRouteId = null;
			}
		}
	};
}

export type ManagementUi = ReturnType<typeof createManagementUi>;
