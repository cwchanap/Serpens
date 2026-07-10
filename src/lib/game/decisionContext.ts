import type { IndustrialBuildingTypeId, WorldCityId } from './types';

export type DecisionContext =
	| { code: 'expansionUnavailable'; storeCap: number }
	| { code: 'expansionCashBlocked'; cash: number }
	| { code: 'locationBlocked'; reason: 'locked' | 'road' | 'river' }
	| { code: 'locationGeneric' }
	| { code: 'worldCityOpeningCost'; cash: number }
	| { code: 'worldCityUnknown' }
	| { code: 'worldCityNotAvailableYet'; cityId: WorldCityId }
	| { code: 'industrialUnknownTile' }
	| { code: 'industrialUnknownBuilding' }
	| { code: 'industrialLockedTile' }
	| { code: 'industrialOccupiedTile' }
	| { code: 'industrialRequiresResource'; resourceId: string }
	| { code: 'industrialRequiresIndustrialTile' }
	| { code: 'industrialRequiresCash'; buildingTypeId: IndustrialBuildingTypeId; cash: number }
	| { code: 'cashPressure' }
	| { code: 'expansionOpportunity' }
	| { code: 'supplierTerms' };

export const decisionContextExpansionUnavailable = (storeCap: number): DecisionContext => ({
	code: 'expansionUnavailable',
	storeCap
});

export const decisionContextExpansionCashBlocked = (cash: number): DecisionContext => ({
	code: 'expansionCashBlocked',
	cash
});

export const decisionContextLocationBlocked = (
	reason: 'locked' | 'road' | 'river'
): DecisionContext => ({ code: 'locationBlocked', reason });

export const decisionContextLocationGeneric = (): DecisionContext => ({ code: 'locationGeneric' });

export const decisionContextWorldCityOpeningCost = (cash: number): DecisionContext => ({
	code: 'worldCityOpeningCost',
	cash
});

export const decisionContextWorldCityUnknown = (): DecisionContext => ({
	code: 'worldCityUnknown'
});

export const decisionContextWorldCityNotAvailableYet = (cityId: WorldCityId): DecisionContext => ({
	code: 'worldCityNotAvailableYet',
	cityId
});

export const decisionContextIndustrialUnknownTile = (): DecisionContext => ({
	code: 'industrialUnknownTile'
});

export const decisionContextIndustrialUnknownBuilding = (): DecisionContext => ({
	code: 'industrialUnknownBuilding'
});

export const decisionContextIndustrialLockedTile = (): DecisionContext => ({
	code: 'industrialLockedTile'
});

export const decisionContextIndustrialOccupiedTile = (): DecisionContext => ({
	code: 'industrialOccupiedTile'
});

export const decisionContextIndustrialRequiresResource = (resourceId: string): DecisionContext => ({
	code: 'industrialRequiresResource',
	resourceId
});

export const decisionContextIndustrialRequiresIndustrialTile = (): DecisionContext => ({
	code: 'industrialRequiresIndustrialTile'
});

export const decisionContextIndustrialRequiresCash = (
	buildingTypeId: IndustrialBuildingTypeId,
	cash: number
): DecisionContext => ({ code: 'industrialRequiresCash', buildingTypeId, cash });

export const decisionContextCashPressure = (): DecisionContext => ({ code: 'cashPressure' });

export const decisionContextExpansionOpportunity = (): DecisionContext => ({
	code: 'expansionOpportunity'
});

export const decisionContextSupplierTerms = (): DecisionContext => ({ code: 'supplierTerms' });
