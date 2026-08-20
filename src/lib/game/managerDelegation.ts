import { getArchetype } from './archetypes';
import { compareWorldCityIds, getCityInventory } from './cityInventory';
import { appendBoundedHistory } from './eventHistory';
import { getProductDefinition } from './products';
import { resolveEffectivePolicy, setPolicyOverride, stepPolicyValue } from './policyInheritance';
import { setRetailSupplySource } from './retailSupply';
import { updateStoreProduct } from './stock';
import { getWorldCityDefinition } from './worldCatalog';
import type {
	DailyProductReport,
	DailyReport,
	DailyStoreReport,
	GameState,
	ManagerActionChange,
	ManagerActionReason,
	ManagerActionRecord,
	ManagerAuthority,
	ManagerDelegation,
	ManagerDelegationScope,
	ProductId,
	StoreProduct,
	WorldCityId
} from './types';

export const MANAGER_ACTION_HISTORY_LIMIT = 100;

type ManagerProposal = {
	delegation: ManagerDelegation;
	conflictKey: string;
	requiredAuthority: keyof ManagerAuthority;
	reason: ManagerActionReason;
	change: ManagerActionChange;
};

type AppliedProposal = {
	game: GameState;
	outcome: ManagerActionRecord['outcome'];
	reason: ManagerActionReason;
	change: ManagerActionChange;
};

export interface ManagerEvaluationResult {
	game: GameState;
	records: ManagerActionRecord[];
}

export function setManagerDelegation(game: GameState, delegation: ManagerDelegation): GameState {
	const persistedDelegation: ManagerDelegation = {
		...delegation,
		scope:
			delegation.scope.kind === 'city'
				? { kind: 'city', cityId: delegation.scope.cityId }
				: { kind: 'store', storeId: delegation.scope.storeId },
		authority: { ...delegation.authority }
	};

	if (
		!game.staff.some(
			(member) => member.id === persistedDelegation.managerId && member.role === 'manager'
		)
	) {
		return game;
	}

	if (!isValidDelegationScope(game, persistedDelegation.scope)) return game;
	if (
		persistedDelegation.playbook === 'prefer-local-supply' &&
		persistedDelegation.scope.kind !== 'city'
	) {
		return game;
	}

	const managerDelegations = [
		...game.managerDelegations.filter(
			(candidate) => candidate.managerId !== persistedDelegation.managerId
		),
		persistedDelegation
	].sort((left, right) => compareIds(left.managerId, right.managerId));

	return { ...game, managerDelegations };
}

export function removeManagerDelegation(game: GameState, managerId: string): GameState {
	const managerDelegations = game.managerDelegations.filter(
		(delegation) => delegation.managerId !== managerId
	);
	if (managerDelegations.length === game.managerDelegations.length) return game;
	return { ...game, managerDelegations };
}

export function applyManagerDelegations(game: GameState): ManagerEvaluationResult {
	const delegations = game.managerDelegations
		.filter((delegation) => delegation.enabled)
		.sort((left, right) => compareIds(left.managerId, right.managerId));
	const latestReport = game.reports.at(-1);

	if (delegations.length === 0 || !latestReport) {
		return { game, records: [] };
	}

	const proposals = delegations.flatMap((delegation) =>
		buildProposals(game, latestReport, delegation)
	);
	if (proposals.length === 0) return { game, records: [] };

	const winners = new Map<string, ManagerProposal>();
	for (const proposal of proposals) {
		if (!proposal.delegation.authority[proposal.requiredAuthority]) continue;
		const current = winners.get(proposal.conflictKey);
		if (!current || compareProposalPriority(proposal, current) < 0) {
			winners.set(proposal.conflictKey, proposal);
		}
	}

	let workingGame = game;
	const records: ManagerActionRecord[] = [];
	for (const proposal of proposals) {
		const authorityEnabled = proposal.delegation.authority[proposal.requiredAuthority];
		if (!authorityEnabled) {
			records.push(createRecord(game, proposal, 'out-of-authority', 'authority-disabled'));
			continue;
		}

		if (winners.get(proposal.conflictKey) !== proposal) {
			records.push(createRecord(game, proposal, 'overridden', 'conflict-lost'));
			continue;
		}

		const applied = applyProposal(workingGame, proposal);
		workingGame = applied.game;
		records.push({
			...createRecord(game, proposal, applied.outcome, applied.reason),
			change: applied.change
		});
	}

	if (records.length === 0) return { game, records };
	return {
		game: {
			...workingGame,
			managerActionHistory: appendBoundedHistory(
				game.managerActionHistory,
				records,
				MANAGER_ACTION_HISTORY_LIMIT
			)
		},
		records
	};
}

function buildProposals(
	game: GameState,
	latestReport: DailyReport,
	delegation: ManagerDelegation
): ManagerProposal[] {
	if (delegation.playbook === 'prefer-local-supply') {
		return buildLocalSupplyProposal(game, delegation);
	}
	if (delegation.playbook === 'stabilize-cash' && !(latestReport.operatingCashFlow < 0)) {
		return [];
	}

	const stores = getTargetStores(game, delegation);
	const proposals: ManagerProposal[] = [];
	for (const store of stores) {
		const report = latestReport.storeReports?.find((candidate) => candidate.storeId === store.id);
		if (!report) continue;
		const proposal = buildStoreProposal(game, delegation, store.id, report);
		if (proposal) proposals.push(proposal);
	}
	return proposals;
}

function buildStoreProposal(
	game: GameState,
	delegation: ManagerDelegation,
	storeId: string,
	report: DailyStoreReport
): ManagerProposal | null {
	const policy = resolveEffectivePolicy(game, { kind: 'store', storeId }).values;

	switch (delegation.playbook) {
		case 'protect-margin': {
			if (!(report.revenue > 0 && report.grossMargin / report.revenue < 0.3)) return null;
			const proposed = stepPolicyValue('pricing', policy.pricing, 1);
			if (proposed === policy.pricing) return null;
			return {
				delegation,
				conflictKey: `pricing:${storeId}`,
				requiredAuthority: 'pricing',
				reason: 'margin-below-threshold',
				change: {
					kind: 'pricing-policy',
					storeId,
					before: policy.pricing,
					proposed,
					applied: null
				}
			};
		}
		case 'protect-availability': {
			const selected = selectAvailabilityProduct(report.productReports ?? []);
			if (selected && hasAvailabilityPressure(selected)) {
				const before = findProduct(game, storeId, selected.productId);
				if (!before) return null;
				const proposed = {
					reorderThreshold: increaseStockValue(before.reorderThreshold),
					targetStock: increaseStockValue(before.targetStock)
				};
				if (sameInventoryValues(before, proposed)) return null;
				return {
					delegation,
					conflictKey: `inventory:${storeId}:${selected.productId}`,
					requiredAuthority: 'inventory',
					reason: 'availability-pressure',
					change: {
						kind: 'inventory-targets',
						storeId,
						productId: selected.productId,
						before: {
							reorderThreshold: before.reorderThreshold,
							targetStock: before.targetStock
						},
						proposed,
						applied: null
					}
				};
			}

			if (!hasNearStaffCapacity(report)) return null;
			const proposed = stepPolicyValue('staffing', policy.staffing, 1);
			if (proposed === policy.staffing) return null;
			return {
				delegation,
				conflictKey: `staffing:${storeId}`,
				requiredAuthority: 'staffing',
				reason: 'staff-capacity-pressure',
				change: {
					kind: 'staffing-policy',
					storeId,
					before: policy.staffing,
					proposed,
					applied: null
				}
			};
		}
		case 'grow-market-share': {
			if (!(report.marketPosition < 60 && report.stockHealth >= 40)) return null;
			const proposed = stepPolicyValue('pricing', policy.pricing, -1);
			if (proposed === policy.pricing) return null;
			return {
				delegation,
				conflictKey: `pricing:${storeId}`,
				requiredAuthority: 'pricing',
				reason: 'market-position-low',
				change: {
					kind: 'pricing-policy',
					storeId,
					before: policy.pricing,
					proposed,
					applied: null
				}
			};
		}
		case 'stabilize-cash': {
			const selected = selectLowestUnitsSoldProduct(report.productReports ?? []);
			if (!selected) return null;
			const before = findProduct(game, storeId, selected.productId);
			if (!before) return null;
			const nextTarget = Math.max(1, Math.floor(before.targetStock * 0.9));
			const nextThreshold = Math.min(
				nextTarget,
				Math.max(0, Math.floor(before.reorderThreshold * 0.9))
			);
			const proposed = { reorderThreshold: nextThreshold, targetStock: nextTarget };
			if (sameInventoryValues(before, proposed)) return null;
			return {
				delegation,
				conflictKey: `inventory:${storeId}:${selected.productId}`,
				requiredAuthority: 'inventory',
				reason: 'negative-operating-cash-flow',
				change: {
					kind: 'inventory-targets',
					storeId,
					productId: selected.productId,
					before: {
						reorderThreshold: before.reorderThreshold,
						targetStock: before.targetStock
					},
					proposed,
					applied: null
				}
			};
		}
		case 'prefer-local-supply':
			return null;
	}
}

function buildLocalSupplyProposal(
	game: GameState,
	delegation: ManagerDelegation
): ManagerProposal[] {
	if (delegation.scope.kind !== 'city') return [];
	const retailCityId = delegation.scope.cityId;
	const bestSupplyCityId = findBestSupplyCity(game, retailCityId);
	if (!bestSupplyCityId) return [];

	const currentSupplyCityId =
		game.retailSupplyAssignments.find((assignment) => assignment.retailCityId === retailCityId)
			?.supplyCityId ?? null;
	if (currentSupplyCityId === bestSupplyCityId) return [];

	return [
		{
			delegation,
			conflictKey: `supply:${retailCityId}`,
			requiredAuthority: 'supply',
			reason: 'better-local-supply',
			change: {
				kind: 'supply-source',
				retailCityId,
				before: currentSupplyCityId,
				proposed: bestSupplyCityId,
				applied: null
			}
		}
	];
}

function getTargetStores(game: GameState, delegation: ManagerDelegation): GameState['stores'] {
	const stores = game.stores.filter((store) =>
		delegation.scope.kind === 'city'
			? store.cityId === delegation.scope.cityId
			: store.id === delegation.scope.storeId
	);
	return [...stores].sort((left, right) => compareIds(left.id, right.id));
}

function selectAvailabilityProduct(
	products: readonly DailyProductReport[]
): DailyProductReport | null {
	return (
		[...products].sort(
			(left, right) =>
				(right.stockoutLostDemand ?? 0) - (left.stockoutLostDemand ?? 0) ||
				(right.demandMissed ?? 0) - (left.demandMissed ?? 0) ||
				compareIds(left.productId, right.productId)
		)[0] ?? null
	);
}

function selectLowestUnitsSoldProduct(
	products: readonly DailyProductReport[]
): DailyProductReport | null {
	return (
		[...products].sort(
			(left, right) =>
				(left.unitsSold ?? 0) - (right.unitsSold ?? 0) ||
				compareIds(left.productId, right.productId)
		)[0] ?? null
	);
}

function hasAvailabilityPressure(product: DailyProductReport): boolean {
	return (product.stockoutLostDemand ?? 0) > 0 || (product.demandMissed ?? 0) > 0;
}

function hasNearStaffCapacity(report: DailyStoreReport): boolean {
	return report.warnings?.some((warning) => warning.code === 'nearStaffCapacity') ?? false;
}

function increaseStockValue(value: number): number {
	return Math.max(value + 1, Math.ceil(value * 1.1));
}

function findProduct(
	game: GameState,
	storeId: string,
	productId: ProductId
): StoreProduct | undefined {
	return game.stores
		.find((store) => store.id === storeId)
		?.products.find((product) => product.productId === productId);
}

function sameInventoryValues(
	product: Pick<StoreProduct, 'reorderThreshold' | 'targetStock'>,
	values: { reorderThreshold: number; targetStock: number }
): boolean {
	return (
		product.reorderThreshold === values.reorderThreshold &&
		product.targetStock === values.targetStock
	);
}

function compareProposalPriority(left: ManagerProposal, right: ManagerProposal): number {
	const leftSpecificity = left.delegation.scope.kind === 'store' ? 0 : 1;
	const rightSpecificity = right.delegation.scope.kind === 'store' ? 0 : 1;
	return (
		leftSpecificity - rightSpecificity ||
		compareIds(left.delegation.managerId, right.delegation.managerId)
	);
}

function applyProposal(game: GameState, proposal: ManagerProposal): AppliedProposal {
	switch (proposal.change.kind) {
		case 'pricing-policy': {
			const next = setPolicyOverride(
				game,
				{ kind: 'store', storeId: proposal.change.storeId },
				{ pricing: proposal.change.proposed }
			);
			const actual = resolveEffectivePolicy(next, {
				kind: 'store',
				storeId: proposal.change.storeId
			}).values.pricing;
			if (actual === proposal.change.before) {
				return rejectedProposal(game, proposal);
			}
			return {
				game: next,
				outcome: 'applied',
				reason: proposal.reason,
				change: { ...proposal.change, applied: actual }
			};
		}
		case 'staffing-policy': {
			const next = setPolicyOverride(
				game,
				{ kind: 'store', storeId: proposal.change.storeId },
				{ staffing: proposal.change.proposed }
			);
			const actual = resolveEffectivePolicy(next, {
				kind: 'store',
				storeId: proposal.change.storeId
			}).values.staffing;
			if (actual === proposal.change.before) {
				return rejectedProposal(game, proposal);
			}
			return {
				game: next,
				outcome: 'applied',
				reason: proposal.reason,
				change: { ...proposal.change, applied: actual }
			};
		}
		case 'inventory-targets': {
			const before = findProduct(game, proposal.change.storeId, proposal.change.productId);
			if (!before) return rejectedProposal(game, proposal);
			const next = updateStoreProduct(game, proposal.change.storeId, proposal.change.productId, {
				reorderThreshold: proposal.change.proposed.reorderThreshold,
				targetStock: proposal.change.proposed.targetStock
			});
			const stored = findProduct(next, proposal.change.storeId, proposal.change.productId);
			if (!stored) return rejectedProposal(game, proposal);
			const actual = {
				reorderThreshold: stored.reorderThreshold,
				targetStock: stored.targetStock
			};
			if (sameInventoryValues(before, actual)) {
				return rejectedProposal(game, proposal);
			}
			return {
				game: next,
				outcome: 'applied',
				reason: proposal.reason,
				change: { ...proposal.change, applied: actual }
			};
		}
		case 'supply-source': {
			const retailCityId = proposal.change.retailCityId;
			const result = setRetailSupplySource(game, retailCityId, proposal.change.proposed);
			if (!result.ok || !result.changed) return rejectedProposal(game, proposal);
			const actual =
				result.game.retailSupplyAssignments.find(
					(assignment) => assignment.retailCityId === retailCityId
				)?.supplyCityId ?? null;
			if (actual === proposal.change.before) return rejectedProposal(game, proposal);
			return {
				game: result.game,
				outcome: 'applied',
				reason: proposal.reason,
				change: { ...proposal.change, applied: actual }
			};
		}
	}
}

function rejectedProposal(game: GameState, proposal: ManagerProposal): AppliedProposal {
	return {
		game,
		outcome: 'rejected',
		reason: 'transition-rejected',
		change: { ...proposal.change, applied: null }
	};
}

function createRecord(
	game: GameState,
	proposal: ManagerProposal,
	outcome: ManagerActionRecord['outcome'],
	reason: ManagerActionReason
): ManagerActionRecord {
	return {
		id: `manager-action:${game.day}:${proposal.delegation.managerId}:${proposal.conflictKey}`,
		day: game.day,
		managerId: proposal.delegation.managerId,
		scope: proposal.delegation.scope,
		playbook: proposal.delegation.playbook,
		conflictKey: proposal.conflictKey,
		outcome,
		reason,
		change: proposal.change
	};
}

function findBestSupplyCity(game: GameState, retailCityId: WorldCityId): WorldCityId | null {
	const materialIds = new Set(
		game.stores
			.filter((store) => store.cityId === retailCityId)
			.flatMap((store) =>
				store.products.flatMap((product) => {
					if (!getArchetype(store.archetypeId).startingProductIds.includes(product.productId)) {
						return [];
					}
					const materialId = getProductDefinition(product.productId).productionMaterialId;
					return materialId ? [materialId] : [];
				})
			)
	);
	if (materialIds.size === 0) return null;

	const candidates = game.cityInventories.flatMap((inventory) => {
		const access = getCityInventory(game, inventory.cityId);
		if (!access.ok) return [];
		const compatibleUnits = [...materialIds].reduce(
			(total, materialId) => total + Math.max(0, access.inventory.materials[materialId] ?? 0),
			0
		);
		return compatibleUnits > 0 ? [{ cityId: access.inventory.cityId, compatibleUnits }] : [];
	});
	candidates.sort(
		(left, right) =>
			right.compatibleUnits - left.compatibleUnits || compareWorldCityIds(left.cityId, right.cityId)
	);
	return candidates[0]?.cityId ?? null;
}

function isValidDelegationScope(game: GameState, scope: ManagerDelegationScope): boolean {
	if (scope.kind === 'city') return isOpenedMaterializedRetailCity(game, scope.cityId);
	const store = game.stores.find((candidate) => candidate.id === scope.storeId);
	return store ? isOpenedMaterializedRetailCity(game, store.cityId) : false;
}

function isOpenedMaterializedRetailCity(game: GameState, cityId: string): boolean {
	const city = getWorldCityDefinition(cityId);
	return Boolean(
		city &&
		city.kind === 'retail' &&
		game.world.openedCityIds.includes(city.id) &&
		game.cities.some((candidate) => candidate.id === city.id)
	);
}

function compareIds(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
