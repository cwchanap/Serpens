import { describe, expect, it, vi } from 'vitest';
import { createI18n } from '$lib/i18n';
import type { SupportedLocale } from '$lib/i18n/locales';
import { MANAGEMENT_PANEL_SHORTCUT_KEY } from '$lib/game/keyboardShortcuts';
import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
import { createManagementUi } from './managementUi.svelte';

const routePreset: RecurringRouteInput = {
	originCityId: 'industry-city',
	destinationCityId: 'breadbasket-basin',
	materialId: 'water',
	capacity: 20,
	frequencyDays: 2,
	leadTimeDays: 1,
	transportCostPerUnit: 2,
	priority: 0
};

const panelOrder = [
	'dashboard',
	'policies',
	'staff',
	'stores',
	'decisions',
	'reports',
	'productChains',
	'finance',
	'logistics'
] as const;

function createUi() {
	const onOpen = vi.fn();
	// Raw reactive i18n mirrors the page's $derived locale chain: assigning a
	// new bundle must re-derive the owner's menu.
	let i18n = $state.raw(createI18n('en'));
	const ui = createManagementUi({ getI18n: () => i18n, onOpen });
	return {
		ui,
		onOpen,
		setLocale: (locale: SupportedLocale) => {
			i18n = createI18n(locale);
		}
	};
}

describe('createManagementUi navigation', () => {
	it('drops the other panels scoped focus when opening through the generic open', () => {
		expect.assertions(5);
		const { ui } = createUi();

		ui.openLogistics('route-7', routePreset);
		ui.open('stores');
		expect(ui.activePanelId).toBe('stores');
		expect(ui.focusedLogisticsRouteId).toBeNull();
		expect(ui.logisticsRoutePreset).toBeNull();

		ui.openStores('harbor-city');
		ui.open('staff');
		expect(ui.activePanelId).toBe('staff');
		expect(ui.focusedRetailSupplyCityId).toBeNull();
	});

	it('keeps focus and preset when open targets the logistics panel again', () => {
		expect.assertions(3);
		const { ui } = createUi();

		ui.openLogistics('route-7', routePreset);
		ui.open('logistics');
		expect(ui.activePanelId).toBe('logistics');
		expect(ui.focusedLogisticsRouteId).toBe('route-7');
		expect(ui.logisticsRoutePreset).toBe(routePreset);
	});

	it('applies its null defaults intentionally in openLogistics', () => {
		expect.assertions(3);
		const { ui } = createUi();

		ui.openLogistics('route-7', routePreset);
		ui.openLogistics();
		expect(ui.activePanelId).toBe('logistics');
		expect(ui.focusedLogisticsRouteId).toBeNull();
		expect(ui.logisticsRoutePreset).toBeNull();
	});

	it('preserves focus atoms while hidden and reopens with them through open', () => {
		expect.assertions(6);
		const { ui } = createUi();

		ui.openLogistics('route-7', routePreset);
		ui.hide();
		expect(ui.activePanelId).toBeNull();
		// Anchor: hiding for another shell must not clear the logistics handoff.
		expect(ui.focusedLogisticsRouteId).toBe('route-7');
		expect(ui.logisticsRoutePreset).toBe(routePreset);

		ui.open('logistics');
		expect(ui.activePanelId).toBe('logistics');
		expect(ui.focusedLogisticsRouteId).toBe('route-7');
		expect(ui.logisticsRoutePreset).toBe(routePreset);
	});

	it('clears the logistics and supply focus on the user close', () => {
		expect.assertions(5);
		const { ui } = createUi();

		ui.openLogistics('route-7', routePreset);
		ui.close();
		// Anchor: the user's close is a dismissal, not a hide.
		expect(ui.activePanelId).toBeNull();
		expect(ui.focusedLogisticsRouteId).toBeNull();
		expect(ui.logisticsRoutePreset).toBeNull();

		ui.openStores('harbor-city');
		ui.close();
		expect(ui.focusedLogisticsRouteId).toBeNull();
		expect(ui.focusedRetailSupplyCityId).toBeNull();
	});

	it('keeps the finance focus through a close until it is reset explicitly', () => {
		expect.assertions(3);
		const { ui } = createUi();

		ui.open('finance');
		ui.focusFinance('loan-1');
		ui.close();
		expect(ui.activePanelId).toBeNull();
		// Anchor: closing does not change focusedFinanceLoanId.
		expect(ui.focusedFinanceLoanId).toBe('loan-1');
		ui.clearFinanceFocus();
		expect(ui.focusedFinanceLoanId).toBeNull();
	});

	it('clears each individual focus atom without touching the others', () => {
		expect.assertions(5);
		const { ui } = createUi();

		ui.openLogistics('route-7', routePreset);
		ui.clearLogisticsFocus();
		expect(ui.focusedLogisticsRouteId).toBeNull();
		expect(ui.logisticsRoutePreset).toBe(routePreset);
		ui.clearLogisticsPreset();
		expect(ui.logisticsRoutePreset).toBeNull();

		ui.openStores('harbor-city');
		ui.clearRetailSupplyFocus();
		expect(ui.focusedRetailSupplyCityId).toBeNull();
		expect(ui.focusedLogisticsRouteId).toBeNull();
	});

	it('closes the current shell only when a panel opens, never on hide or close', () => {
		expect.assertions(3);
		const { ui, onOpen } = createUi();

		ui.open('dashboard');
		expect(onOpen).toHaveBeenCalledTimes(1);
		ui.hide();
		ui.open('stores');
		expect(onOpen).toHaveBeenCalledTimes(2);
		ui.close();
		expect(onOpen).toHaveBeenCalledTimes(2);
	});

	it('exposes the localized panel menu live with the locale', () => {
		expect.assertions(6);
		const { ui, setLocale } = createUi();

		expect(ui.menu.map((item) => item.id)).toEqual([...panelOrder]);
		const dashboard = ui.menu.find((item) => item.id === 'dashboard')!;
		expect(dashboard.label).toBe(createI18n('en').labels.managementPanel('dashboard'));
		expect(dashboard.shortcut).toBe(MANAGEMENT_PANEL_SHORTCUT_KEY.dashboard);

		setLocale('ja');
		expect(ui.menu.find((item) => item.id === 'dashboard')!.label).toBe(
			createI18n('ja').labels.managementPanel('dashboard')
		);

		expect(ui.activePanel).toBeNull();
		ui.open('finance');
		expect(ui.activePanel?.id).toBe('finance');
	});

	it('accepts a committed route removal by clearing only the matching focus', () => {
		expect.assertions(2);
		const { ui } = createUi();

		ui.openLogistics('route-7');
		ui.acceptRouteRemoved('route-2');
		expect(ui.focusedLogisticsRouteId).toBe('route-7');
		ui.acceptRouteRemoved('route-7');
		expect(ui.focusedLogisticsRouteId).toBeNull();
	});
});
