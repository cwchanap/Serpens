import type {
	ArchetypeId,
	IndustrialBuildingTypeId,
	MaterialId,
	WorldCityId
} from '$lib/game/types';
import { isWorldCityId } from '$lib/game/world';
import type { ScenarioCommand, ScenarioDefinition, ScenarioRun } from './types';

export type ScenarioContentQuery =
	| { kind: 'city'; cityId: WorldCityId }
	| { kind: 'archetype'; archetypeId: ArchetypeId }
	| { kind: 'product'; categoryId: string }
	| { kind: 'material'; materialId: MaterialId }
	| { kind: 'building'; buildingTypeId: IndustrialBuildingTypeId }
	| {
			kind: 'retail-placement';
			cityId: WorldCityId;
			tileId: string;
			archetypeId: ArchetypeId;
	  }
	| {
			kind: 'industrial-placement';
			cityId: WorldCityId;
			tileId: string;
			buildingTypeId: IndustrialBuildingTypeId;
	  };

export type ScenarioCapabilityResult =
	| { allowed: true }
	| { allowed: false; code: 'forbidden-command' | 'forbidden-content'; path: string };

export function isScenarioContentAllowed(
	definition: ScenarioDefinition,
	query: ScenarioContentQuery
): boolean {
	switch (query.kind) {
		case 'city':
			return definition.content.cityIds.includes(query.cityId);
		case 'archetype':
			return definition.content.archetypeIds.includes(query.archetypeId);
		case 'product':
			return definition.content.productCategoryIds.includes(query.categoryId);
		case 'material':
			return definition.content.materialIds.includes(query.materialId);
		case 'building':
			return definition.content.buildingTypeIds.includes(query.buildingTypeId);
		case 'retail-placement':
			return definition.content.retailPlacements.some(
				(placement) =>
					placement.cityId === query.cityId &&
					placement.tileId === query.tileId &&
					placement.archetypeId === query.archetypeId
			);
		case 'industrial-placement':
			return definition.content.industrialPlacements.some(
				(placement) =>
					placement.cityId === query.cityId &&
					placement.tileId === query.tileId &&
					placement.buildingTypeId === query.buildingTypeId
			);
	}
}

function forbiddenContent(path: string): ScenarioCapabilityResult {
	return { allowed: false, code: 'forbidden-content', path };
}

function nonEmpty(value: string): boolean {
	return value.length > 0;
}

function wholeDollar(value: number, minimum = 0): boolean {
	return Number.isSafeInteger(value) && value >= minimum;
}

function supportedTerm(value: number): boolean {
	return value === 28 || value === 56 || value === 84;
}

export function isScenarioCommandAllowed(
	definition: ScenarioDefinition,
	run: ScenarioRun,
	command: ScenarioCommand
): ScenarioCapabilityResult {
	if (!definition.allowedCommands.includes(command.kind)) {
		return {
			allowed: false,
			code: 'forbidden-command',
			path: `allowedCommands.${command.kind}`
		};
	}

	switch (command.kind) {
		case 'openWorldCity':
			return isScenarioContentAllowed(definition, { kind: 'city', cityId: command.cityId })
				? { allowed: true }
				: forbiddenContent('command.openWorldCity.cityId');
		case 'selectWorldCity':
			return isScenarioContentAllowed(definition, { kind: 'city', cityId: command.cityId }) &&
				run.game.world.openedCityIds.includes(command.cityId)
				? { allowed: true }
				: forbiddenContent('command.selectWorldCity.cityId');
		case 'openStore': {
			if (
				!isScenarioContentAllowed(definition, {
					kind: 'archetype',
					archetypeId: command.archetypeId
				})
			)
				return forbiddenContent('command.openStore.archetypeId');
			const cityId = run.game.activeCityId;
			if (
				!isWorldCityId(cityId) ||
				!isScenarioContentAllowed(definition, {
					kind: 'retail-placement',
					cityId,
					tileId: command.tileId,
					archetypeId: command.archetypeId
				})
			)
				return forbiddenContent('command.openStore.tileId');
			return { allowed: true };
		}
		case 'updateStoreSellingPrice':
		case 'updateStoreInventoryTargets':
			return isScenarioContentAllowed(definition, {
				kind: 'product',
				categoryId: command.categoryId
			})
				? { allowed: true }
				: forbiddenContent(`command.${command.kind}.categoryId`);
		case 'buildIndustrialBuilding': {
			if (
				!isScenarioContentAllowed(definition, {
					kind: 'building',
					buildingTypeId: command.buildingTypeId
				})
			)
				return forbiddenContent('command.buildIndustrialBuilding.buildingTypeId');
			const cityId = run.game.activeIndustryCityId;
			if (
				!isWorldCityId(cityId) ||
				!isScenarioContentAllowed(definition, {
					kind: 'industrial-placement',
					cityId,
					tileId: command.tileId,
					buildingTypeId: command.buildingTypeId
				})
			)
				return forbiddenContent('command.buildIndustrialBuilding.tileId');
			return { allowed: true };
		}
		case 'borrow':
			return wholeDollar(command.amount, 1) && supportedTerm(command.termDays)
				? { allowed: true }
				: forbiddenContent('command.borrow');
		case 'repayLoan':
			return nonEmpty(command.loanId) && wholeDollar(command.amount, 1)
				? { allowed: true }
				: forbiddenContent('command.repayLoan');
		case 'payOffLoan':
			return nonEmpty(command.loanId)
				? { allowed: true }
				: forbiddenContent('command.payOffLoan.loanId');
		case 'refinanceLoan':
			return nonEmpty(command.loanId) && supportedTerm(command.termDays)
				? { allowed: true }
				: forbiddenContent('command.refinanceLoan');
		case 'financeWorldCity':
			return wholeDollar(command.expectedCost) &&
				isScenarioContentAllowed(definition, { kind: 'city', cityId: command.cityId })
				? { allowed: true }
				: forbiddenContent('command.financeWorldCity');
		case 'financeRetailStore': {
			if (!wholeDollar(command.expectedCost))
				return forbiddenContent('command.financeRetailStore.expectedCost');
			if (
				!isScenarioContentAllowed(definition, {
					kind: 'archetype',
					archetypeId: command.archetypeId
				})
			)
				return forbiddenContent('command.financeRetailStore.archetypeId');
			const cityId = run.game.activeCityId;
			return isWorldCityId(cityId) &&
				isScenarioContentAllowed(definition, {
					kind: 'retail-placement',
					cityId,
					tileId: command.tileId,
					archetypeId: command.archetypeId
				})
				? { allowed: true }
				: forbiddenContent('command.financeRetailStore.tileId');
		}
		case 'financeIndustrialBuilding': {
			if (!wholeDollar(command.expectedCost))
				return forbiddenContent('command.financeIndustrialBuilding.expectedCost');
			if (
				!isScenarioContentAllowed(definition, {
					kind: 'building',
					buildingTypeId: command.buildingTypeId
				})
			)
				return forbiddenContent('command.financeIndustrialBuilding.buildingTypeId');
			const cityId = run.game.activeIndustryCityId;
			return isWorldCityId(cityId) &&
				isScenarioContentAllowed(definition, {
					kind: 'industrial-placement',
					cityId,
					tileId: command.tileId,
					buildingTypeId: command.buildingTypeId
				})
				? { allowed: true }
				: forbiddenContent('command.financeIndustrialBuilding.tileId');
		}
		case 'upgradeRail':
		case 'demolishRail':
			return isWorldCityId(command.cityId) &&
				isScenarioContentAllowed(definition, { kind: 'city', cityId: command.cityId })
				? { allowed: true }
				: forbiddenContent(`command.${command.kind}.cityId`);
		case 'advanceDay':
		case 'resolveDecision':
		case 'updatePolicy':
		case 'upgradeStore':
		case 'hireStaff':
		case 'assignStaff':
		case 'unassignStaff':
		case 'promoteStaff':
		case 'upgradeIndustrialBuilding':
		case 'buildRail':
			return { allowed: true };
	}
}
