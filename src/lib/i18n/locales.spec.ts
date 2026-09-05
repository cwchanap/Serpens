import { describe, expect, it, vi } from 'vitest';
import {
	LANGUAGE_PREFERENCE_STORAGE_KEY,
	readLocalePreference,
	resolveSupportedLocale,
	saveLocalePreference
} from './locales';
import { messagesByLocale } from './messages';
import type { TranslationKey } from './translate';

function storageMock(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getItem: vi.fn((key: string) => (data.has(key) ? data.get(key)! : null)),
		setItem: vi.fn((key: string, value: string) => {
			data.set(key, value);
		})
	};
}

function resolveCatalogValue(catalog: unknown, key: string): unknown {
	return key
		.split('.')
		.reduce<unknown>(
			(acc, part) =>
				acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
			catalog
		);
}

function collectLeafPaths(obj: unknown, prefix = ''): string[] {
	if (obj === null || typeof obj !== 'object') return [];
	const paths: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === 'object') {
			paths.push(...collectLeafPaths(value, path));
		} else {
			paths.push(path);
		}
	}
	return paths;
}

describe('locale resolution', () => {
	it('provides the identical city inventory attribution key set in every supported locale', () => {
		const keys = [
			'industryTileInspector.warehouseBuilding',
			'industryTileInspector.cityInventorySummary',
			'industryTileInspector.currentCityInventory',
			'industryTileInspector.cityInventoryMaterials',
			'industryTileInspector.cityInventoryZeroCapacity',
			'industryTileInspector.cityInventoryEmpty',
			'industryTileInspector.cityInventoryOverflow',
			'reportsPanel.inventory.productionCloseTitle',
			'reportsPanel.inventory.reportDay',
			'reportsPanel.inventory.currentTitle',
			'reportsPanel.inventory.productionCloseUnavailable',
			'reportsPanel.inventory.productionCloseEmpty',
			'reportsPanel.inventory.currentUnavailable',
			'reportsPanel.inventory.currentEmpty',
			'reportsPanel.inventory.citySummary',
			'reportsPanel.inventory.cityOverflow',
			'reportsPanel.attribution.title',
			'reportsPanel.attribution.empty',
			'reportsPanel.attribution.production',
			'reportsPanel.attribution.productionUnavailable',
			'reportsPanel.attribution.consumption',
			'reportsPanel.attribution.consumptionUnavailable',
			'reportsPanel.attribution.localSupply',
			'reportsPanel.attribution.localSupplyUnavailable',
			'reportsPanel.attribution.externalImports',
			'reportsPanel.attribution.externalImportsUnavailable',
			'storeOverview.metrics.imports',
			'storeOverview.warehouseUnits',
			'storeOverview.importedUnits',
			'productChainsPanel.cityInventoryFlow',
			'productChainsPanel.capacityLabel',
			'productChainsPanel.activeIndustryInventory',
			'productChainsPanel.supplyState.importsOnly',
			'productChainsPanel.supplyState.zeroCapacity',
			'productChainsPanel.supplyState.emptyInventory',
			'productChainsPanel.supplyState.inventoryOverflow'
		];

		for (const locale of Object.keys(messagesByLocale) as (keyof typeof messagesByLocale)[]) {
			const catalog = messagesByLocale[locale];
			for (const key of keys) {
				const value = resolveCatalogValue(catalog, key);
				expect(value, `${locale} missing ${key}`).toBeDefined();
				expect(typeof value, `${locale} ${key} is not a string`).toBe('string');
			}
		}
	});

	it('provides the identical retail supply source control key set in every supported locale', () => {
		const keys = [
			'retailSupplySources.title',
			'retailSupplySources.citySection',
			'retailSupplySources.controlLabel',
			'retailSupplySources.controlDescription',
			'retailSupplySources.importsOnly',
			'retailSupplySources.importsOnlySummary',
			'retailSupplySources.inventorySummary',
			'retailSupplySources.overflow',
			'retailSupplySources.overflowSingular',
			'retailSupplySources.noOverflow'
		];

		for (const locale of Object.keys(messagesByLocale) as (keyof typeof messagesByLocale)[]) {
			const catalog = messagesByLocale[locale];
			for (const key of keys) {
				const value = resolveCatalogValue(catalog, key);
				expect(value, `${locale} missing ${key}`).toBeDefined();
				expect(typeof value, `${locale} ${key} is not a string`).toBe('string');
			}
		}
	});

	it('provides the identical supply planner evidence key set in every supported locale', () => {
		const keys = collectLeafPaths(messagesByLocale.en.supplyAdvisor, 'supplyAdvisor');

		for (const locale of Object.keys(messagesByLocale) as (keyof typeof messagesByLocale)[]) {
			const catalog = messagesByLocale[locale];
			for (const key of keys) {
				const value = resolveCatalogValue(catalog, key);
				expect(value, `${locale} missing ${key}`).toBeDefined();
				expect(typeof value, `${locale} ${key} is not a string`).toBe('string');
			}
		}
	});

	it('does not retain retired active-logistics omission copy', () => {
		for (const locale of Object.keys(messagesByLocale) as (keyof typeof messagesByLocale)[]) {
			const catalog = messagesByLocale[locale];
			expect(catalog.supplyAdvisor.limitations).not.toHaveProperty('activeLogistics');
			expect(catalog.supplyAdvisor.noOpReasons).not.toHaveProperty('logisticsContention');
		}
	});

	it('provides every finance localization surface in every supported locale', () => {
		const keys: TranslationKey[] = [
			'game.managementPanels.finance',
			'game.loanPurposes.founding',
			'game.loanStatuses.delinquent',
			'game.loanTerms.84',
			'financePanel.metrics.outstandingPrincipal',
			'financePanel.metrics.noDebtServiceDue',
			'financePanel.credit.baseApr',
			'financePanel.credit.reasons.debtServiceCapacityLimited',
			'financePanel.failures.insufficientCredit',
			'financePanel.decisionAvailability.unavailable',
			'copy.alerts.upcomingLoanPayment',
			'financePanel.financedPurchase.financeOpening',
			'financePanel.transactions.disbursement',
			'financePanel.activity.principalBorrowed',
			'shortcutCheatSheet.actions.finance'
		];

		for (const locale of Object.keys(messagesByLocale) as (keyof typeof messagesByLocale)[]) {
			const catalog = messagesByLocale[locale];
			for (const key of keys) {
				const value = resolveCatalogValue(catalog, key);
				expect(value, `${locale} missing ${key}`).toBeDefined();
				expect(typeof value, `${locale} ${key} is not a string`).toBe('string');
			}
		}
	});
	it('prefers a valid stored preference over browser language', () => {
		expect.assertions(1);
		expect(
			resolveSupportedLocale({
				storedLocale: 'ja',
				navigatorLanguages: ['zh-TW', 'en-US']
			})
		).toBe('ja');
	});

	it('maps Traditional Chinese browser locales to zh-Hant', () => {
		expect.assertions(4);
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-TW'] })).toBe('zh-Hant');
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-HK'] })).toBe('zh-Hant');
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-MO'] })).toBe('zh-Hant');
		expect(resolveSupportedLocale({ navigatorLanguages: ['zh-Hant-TW'] })).toBe('zh-Hant');
	});

	it('maps Japanese and English browser locales', () => {
		expect.assertions(2);
		expect(resolveSupportedLocale({ navigatorLanguages: ['ja-JP'] })).toBe('ja');
		expect(resolveSupportedLocale({ navigatorLanguages: ['en-CA'] })).toBe('en');
	});

	it('falls back to English for unsupported values', () => {
		expect.assertions(1);
		expect(
			resolveSupportedLocale({
				storedLocale: 'fr',
				navigatorLanguages: ['ko-KR']
			})
		).toBe('en');
	});

	it('reads and saves the local language preference', () => {
		expect.assertions(3);
		const storage = storageMock();
		expect(readLocalePreference(storage, ['ja-JP'])).toBe('ja');
		expect(saveLocalePreference('zh-Hant', storage)).toBe('zh-Hant');
		expect(storage.setItem).toHaveBeenCalledWith(LANGUAGE_PREFERENCE_STORAGE_KEY, 'zh-Hant');
	});

	it('falls back to navigator locale when storage.getItem throws', () => {
		expect.assertions(2);
		const storage = {
			getItem: vi.fn(() => {
				throw new Error('storage unavailable');
			}),
			setItem: vi.fn()
		};
		expect(readLocalePreference(storage, ['ja-JP'])).toBe('ja');
		expect(storage.getItem).toHaveBeenCalledWith(LANGUAGE_PREFERENCE_STORAGE_KEY);
	});

	it('still returns the locale when storage.setItem throws', () => {
		expect.assertions(2);
		const storage = {
			getItem: vi.fn(() => null),
			setItem: vi.fn(() => {
				throw new Error('storage unavailable');
			})
		};
		expect(saveLocalePreference('zh-Hant', storage)).toBe('zh-Hant');
		expect(storage.setItem).toHaveBeenCalledWith(LANGUAGE_PREFERENCE_STORAGE_KEY, 'zh-Hant');
	});

	it('ignores tag-matched stored preferences that are not exact supported IDs', () => {
		// saveLocalePreference only ever writes exact supported IDs ('en',
		// 'zh-Hant', 'ja'). A stored value like 'ja-JP' or 'zh-TW' is a
		// browser-style tag, not a user-explicit choice, so it must not
		// override navigator resolution — tag matching is reserved for
		// navigator candidates.
		expect.assertions(2);
		expect(
			resolveSupportedLocale({
				storedLocale: 'ja-JP',
				navigatorLanguages: ['zh-TW']
			})
		).toBe('zh-Hant');
		expect(
			resolveSupportedLocale({
				storedLocale: 'zh-TW',
				navigatorLanguages: ['ja-JP']
			})
		).toBe('ja');
	});

	it('falls through to navigator languages when storedLocale is not a string', () => {
		expect.assertions(1);
		expect(
			resolveSupportedLocale({
				storedLocale: 123,
				navigatorLanguages: ['ja-JP']
			})
		).toBe('ja');
	});

	it('returns English when navigatorLanguages is undefined', () => {
		expect.assertions(1);
		expect(resolveSupportedLocale({})).toBe('en');
	});

	it('uses navigator languages when storage is null', () => {
		expect.assertions(1);
		expect(readLocalePreference(null, ['ja-JP'])).toBe('ja');
	});
});
