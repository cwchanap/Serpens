import { describe, expect, test } from 'vitest';
import {
	decisionContextExpansionUnavailable,
	decisionContextExpansionCashBlocked,
	decisionContextLocationBlocked,
	decisionContextLocationGeneric,
	decisionContextWorldCityOpeningCost,
	decisionContextWorldCityUnknown,
	decisionContextWorldCityNotAvailableYet,
	decisionContextIndustrialUnknownTile,
	decisionContextIndustrialUnknownBuilding,
	decisionContextIndustrialLockedTile,
	decisionContextIndustrialOccupiedTile,
	decisionContextIndustrialRequiresResource,
	decisionContextIndustrialRequiresIndustrialTile,
	decisionContextIndustrialRequiresCash,
	decisionContextCashPressure,
	decisionContextExpansionOpportunity,
	decisionContextSupplierTerms
} from './decisionContext';

describe('decisionContext constructors', () => {
	test('each constructor produces the expected code and params', () => {
		expect.assertions(14);
		expect(decisionContextExpansionUnavailable(5)).toEqual({
			code: 'expansionUnavailable',
			storeCap: 5
		});
		expect(decisionContextExpansionCashBlocked(15_000)).toEqual({
			code: 'expansionCashBlocked',
			cash: 15_000
		});
		expect(decisionContextLocationBlocked('locked')).toEqual({
			code: 'locationBlocked',
			reason: 'locked'
		});
		expect(decisionContextLocationBlocked('road')).toEqual({
			code: 'locationBlocked',
			reason: 'road'
		});
		expect(decisionContextLocationBlocked('river')).toEqual({
			code: 'locationBlocked',
			reason: 'river'
		});
		expect(decisionContextLocationGeneric()).toEqual({ code: 'locationGeneric' });
		expect(decisionContextWorldCityOpeningCost(18_000)).toEqual({
			code: 'worldCityOpeningCost',
			cash: 18_000
		});
		expect(decisionContextWorldCityUnknown()).toEqual({ code: 'worldCityUnknown' });
		expect(decisionContextWorldCityNotAvailableYet('campus-junction')).toEqual({
			code: 'worldCityNotAvailableYet',
			cityId: 'campus-junction'
		});
		expect(decisionContextIndustrialUnknownTile()).toEqual({ code: 'industrialUnknownTile' });
		expect(decisionContextIndustrialUnknownBuilding()).toEqual({
			code: 'industrialUnknownBuilding'
		});
		expect(decisionContextIndustrialLockedTile()).toEqual({ code: 'industrialLockedTile' });
		expect(decisionContextIndustrialOccupiedTile()).toEqual({
			code: 'industrialOccupiedTile'
		});
		expect(decisionContextIndustrialRequiresCash('grain-farm', 1_000)).toEqual({
			code: 'industrialRequiresCash',
			buildingTypeId: 'grain-farm',
			cash: 1_000
		});
	});

	test('industrialRequiresResource carries the resource id', () => {
		expect.assertions(1);
		expect(decisionContextIndustrialRequiresResource('farmland')).toEqual({
			code: 'industrialRequiresResource',
			resourceId: 'farmland'
		});
	});

	test('industrialRequiresIndustrialTile carries no params', () => {
		expect.assertions(1);
		expect(decisionContextIndustrialRequiresIndustrialTile()).toEqual({
			code: 'industrialRequiresIndustrialTile'
		});
	});

	test('cashPressure, expansionOpportunity, and supplierTerms carry no params', () => {
		expect.assertions(3);
		expect(decisionContextCashPressure()).toEqual({ code: 'cashPressure' });
		expect(decisionContextExpansionOpportunity()).toEqual({ code: 'expansionOpportunity' });
		expect(decisionContextSupplierTerms()).toEqual({ code: 'supplierTerms' });
	});
});
