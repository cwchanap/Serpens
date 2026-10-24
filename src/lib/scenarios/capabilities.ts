import type {
	ArchetypeId,
	IndustrialBuildingTypeId,
	MaterialId,
	ProductId,
	WorldCityId
} from '$lib/game/types';
import { isWorldCityId } from '$lib/game/world';
import type { ScenarioCommand, ScenarioDefinition, ScenarioRun } from './types';

export type ScenarioContentQuery =
	| { kind: 'city'; cityId: WorldCityId }
	| { kind: 'archetype'; archetypeId: ArchetypeId }
	| { kind: 'product'; productId: ProductId }
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
	| {
			allowed: false;
			code: 'forbidden-command' | 'forbidden-content' | 'invalid-command';
			path: string;
	  };

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
			return definition.content.productIds.includes(query.productId);
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

function invalidCommand(path: string): ScenarioCapabilityResult {
	return { allowed: false, code: 'invalid-command', path };
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function wholeDollar(value: number, minimum = 0): boolean {
	return Number.isSafeInteger(value) && value >= minimum;
}

function positiveCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function routeExists(run: ScenarioRun, routeId: string): boolean {
	return run.game.logistics.recurringRoutes.some((route) => route.id === routeId);
}

function validScenarioRouteShape(input: { capacity: number; frequencyDays: number }): boolean {
	return positiveCount(input.capacity) && positiveCount(input.frequencyDays);
}

function validScenarioRouteEndpoints(
	definition: ScenarioDefinition,
	input: { originCityId: WorldCityId; destinationCityId: WorldCityId; materialId: MaterialId },
	pathPrefix: string
): ScenarioCapabilityResult {
	if (!isWorldCityId(input.originCityId)) return invalidCommand(`${pathPrefix}.originCityId`);
	if (!isWorldCityId(input.destinationCityId))
		return invalidCommand(`${pathPrefix}.destinationCityId`);
	if (
		!isScenarioContentAllowed(definition, { kind: 'city', cityId: input.originCityId }) ||
		!isScenarioContentAllowed(definition, { kind: 'city', cityId: input.destinationCityId })
	)
		return forbiddenContent(`${pathPrefix}.originCityId`);
	if (
		typeof input.materialId !== 'string' ||
		!isScenarioContentAllowed(definition, { kind: 'material', materialId: input.materialId })
	)
		return forbiddenContent(`${pathPrefix}.materialId`);
	return { allowed: true };
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
		case 'setRetailSupplySource': {
			if (typeof command.retailCityId !== 'string' || !isWorldCityId(command.retailCityId)) {
				return invalidCommand('command.setRetailSupplySource.retailCityId');
			}
			if (!isScenarioContentAllowed(definition, { kind: 'city', cityId: command.retailCityId })) {
				return forbiddenContent('command.setRetailSupplySource.retailCityId');
			}
			if (command.supplyCityId === null) return { allowed: true };
			if (typeof command.supplyCityId !== 'string' || !isWorldCityId(command.supplyCityId)) {
				return invalidCommand('command.setRetailSupplySource.supplyCityId');
			}
			return isScenarioContentAllowed(definition, {
				kind: 'city',
				cityId: command.supplyCityId
			})
				? { allowed: true }
				: forbiddenContent('command.setRetailSupplySource.supplyCityId');
		}
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
				productId: command.productId
			})
				? { allowed: true }
				: forbiddenContent(`command.${command.kind}.productId`);
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
			if (!nonEmptyString(command.loanId)) return invalidCommand('command.repayLoan.loanId');
			return wholeDollar(command.amount, 1)
				? { allowed: true }
				: forbiddenContent('command.repayLoan');
		case 'payOffLoan':
			return nonEmptyString(command.loanId)
				? { allowed: true }
				: invalidCommand('command.payOffLoan.loanId');
		case 'refinanceLoan':
			if (!nonEmptyString(command.loanId)) return invalidCommand('command.refinanceLoan.loanId');
			return supportedTerm(command.termDays)
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
		case 'createRecurringRoute': {
			if (!validScenarioRouteShape(command.input))
				return invalidCommand('command.createRecurringRoute.input');
			if (!wholeDollar(command.input.priority))
				return invalidCommand('command.createRecurringRoute.input.priority');
			return validScenarioRouteEndpoints(
				definition,
				command.input,
				'command.createRecurringRoute.input'
			);
		}
		case 'updateRecurringRoute': {
			if (!nonEmptyString(command.routeId) || !routeExists(run, command.routeId))
				return invalidCommand('command.updateRecurringRoute.routeId');
			if (!validScenarioRouteShape(command.input))
				return invalidCommand('command.updateRecurringRoute.input');
			return validScenarioRouteEndpoints(
				definition,
				command.input,
				'command.updateRecurringRoute.input'
			);
		}
		case 'pauseRecurringRoute':
		case 'resumeRecurringRoute':
			return nonEmptyString(command.routeId) && routeExists(run, command.routeId)
				? { allowed: true }
				: invalidCommand(`command.${command.kind}.routeId`);
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
