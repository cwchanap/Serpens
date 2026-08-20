import { compareWorldCityIds } from './cityInventory';
import { getWorldCityDefinition } from './worldCatalog';
import type {
	CompanyPolicy,
	GameState,
	PolicyOverride,
	PolicyOverrideScope,
	WorldCityId
} from './types';

export type { PolicyOverride, PolicyOverrideScope } from './types';

export const POLICY_FIELD_OPTIONS = {
	pricing: ['discount', 'competitive', 'standard', 'premium'],
	inventory: ['lean', 'balanced', 'generous'],
	staffing: ['minimal', 'efficient', 'service'],
	marketing: ['none', 'awareness', 'promotions', 'loyalty'],
	service: ['speed', 'balanced', 'highTouch']
} as const satisfies {
	[K in keyof CompanyPolicy]: readonly CompanyPolicy[K][];
};

export type PolicyValueSource = { kind: 'company' } | PolicyOverrideScope;

export interface EffectivePolicy {
	values: CompanyPolicy;
	provenance: { [K in keyof CompanyPolicy]: PolicyValueSource };
}

const POLICY_FIELDS = Object.keys(POLICY_FIELD_OPTIONS) as (keyof CompanyPolicy)[];

function compareStoreIds(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function compareScopes(left: PolicyOverrideScope, right: PolicyOverrideScope): number {
	if (left.kind !== right.kind) return left.kind === 'city' ? -1 : 1;
	if (left.kind === 'city' && right.kind === 'city') {
		return compareWorldCityIds(left.cityId, right.cityId);
	}
	if (left.kind === 'store' && right.kind === 'store') {
		return compareStoreIds(left.storeId, right.storeId);
	}
	return 0;
}

function isOpenedMaterializedRetailCity(game: GameState, cityId: WorldCityId): boolean {
	const city = getWorldCityDefinition(cityId);
	return (
		city?.kind === 'retail' &&
		game.world.openedCityIds.includes(cityId) &&
		game.cities.some((candidate) => candidate.id === cityId)
	);
}

function resolveStoreCityId(game: GameState, storeId: string): WorldCityId | null {
	const store = game.stores.find((candidate) => candidate.id === storeId);
	if (!store) return null;

	const city = getWorldCityDefinition(store.cityId);
	if (!city || !isOpenedMaterializedRetailCity(game, city.id)) return null;
	return city.id;
}

function isValidScope(game: GameState, scope: PolicyOverrideScope): boolean {
	if (scope.kind === 'city') return isOpenedMaterializedRetailCity(game, scope.cityId);
	return resolveStoreCityId(game, scope.storeId) !== null;
}

export function isValidPolicyScope(game: GameState, scope: PolicyOverrideScope): boolean {
	return isValidScope(game, scope);
}

function assertValidScope(game: GameState, scope: PolicyOverrideScope): void {
	if (!isValidScope(game, scope)) {
		throw new Error(`Policy inheritance invariant: invalid ${scope.kind} scope`);
	}
}

function sameScope(left: PolicyOverrideScope, right: PolicyOverrideScope): boolean {
	return (
		left.kind === right.kind &&
		(left.kind === 'city'
			? right.kind === 'city' && left.cityId === right.cityId
			: right.kind === 'store' && left.storeId === right.storeId)
	);
}

function findOverride(game: GameState, scope: PolicyOverrideScope): PolicyOverride | undefined {
	return game.policyOverrides.find((override) => sameScope(override.scope, scope));
}

function applyOverride(
	values: CompanyPolicy,
	provenance: EffectivePolicy['provenance'],
	override: PolicyOverride | undefined,
	source: PolicyOverrideScope
): void {
	if (!override) return;

	const definedEntries = Object.entries(override.values).filter(([, value]) => value !== undefined);
	Object.assign(values, Object.fromEntries(definedEntries));
	for (const field of POLICY_FIELDS) {
		if (override.values[field] !== undefined) provenance[field] = source;
	}
}

export function resolveEffectivePolicy(
	game: GameState,
	scope: PolicyOverrideScope
): EffectivePolicy {
	assertValidScope(game, scope);

	const values = { ...game.policy };
	const provenance: EffectivePolicy['provenance'] = {
		pricing: { kind: 'company' },
		inventory: { kind: 'company' },
		staffing: { kind: 'company' },
		marketing: { kind: 'company' },
		service: { kind: 'company' }
	};

	if (scope.kind === 'city') {
		applyOverride(values, provenance, findOverride(game, scope), scope);
		return { values, provenance };
	}

	const cityId = resolveStoreCityId(game, scope.storeId);
	if (!cityId) {
		throw new Error('Policy inheritance invariant: store city could not be resolved');
	}

	const cityScope: PolicyOverrideScope = { kind: 'city', cityId };
	applyOverride(values, provenance, findOverride(game, cityScope), cityScope);
	applyOverride(values, provenance, findOverride(game, scope), scope);
	return { values, provenance };
}

function sortedOverrides(overrides: PolicyOverride[]): PolicyOverride[] {
	return [...overrides].sort((left, right) => compareScopes(left.scope, right.scope));
}

function copyPolicyOverrideScope(scope: PolicyOverrideScope): PolicyOverrideScope {
	return scope.kind === 'city'
		? { kind: 'city', cityId: scope.cityId }
		: { kind: 'store', storeId: scope.storeId };
}

export function setPolicyOverride(
	game: GameState,
	scope: PolicyOverrideScope,
	patch: Partial<CompanyPolicy>
): GameState {
	const persistedScope = copyPolicyOverrideScope(scope);
	if (!isValidScope(game, persistedScope)) return game;

	const index = game.policyOverrides.findIndex((override) =>
		sameScope(override.scope, persistedScope)
	);
	const existing = index === -1 ? undefined : game.policyOverrides[index];
	const definedPatch = Object.fromEntries(
		Object.entries(patch).filter(([, value]) => value !== undefined)
	);
	const values = { ...(existing?.values ?? {}), ...definedPatch };
	if (Object.keys(values).length === 0) return game;

	const nextOverride: PolicyOverride = { scope: persistedScope, values };
	const policyOverrides =
		index === -1
			? sortedOverrides([...game.policyOverrides, nextOverride])
			: sortedOverrides(
					game.policyOverrides.map((override, overrideIndex) =>
						overrideIndex === index ? nextOverride : override
					)
				);

	return { ...game, policyOverrides };
}

export function clearPolicyOverrideField(
	game: GameState,
	scope: PolicyOverrideScope,
	field: keyof CompanyPolicy
): GameState {
	const persistedScope = copyPolicyOverrideScope(scope);
	if (!isValidScope(game, persistedScope)) return game;

	const index = game.policyOverrides.findIndex((override) =>
		sameScope(override.scope, persistedScope)
	);
	if (index === -1) return game;

	const existing = game.policyOverrides[index]!;
	const values = { ...existing.values };
	if (!(field in values)) return game;
	delete values[field];

	if (Object.keys(values).length === 0) {
		return {
			...game,
			policyOverrides: sortedOverrides(
				game.policyOverrides.filter((_, overrideIndex) => overrideIndex !== index)
			)
		};
	}

	return {
		...game,
		policyOverrides: sortedOverrides(
			game.policyOverrides.map((override, overrideIndex) =>
				overrideIndex === index ? { scope: persistedScope, values } : override
			)
		)
	};
}

export function resetPolicyOverrideScope(game: GameState, scope: PolicyOverrideScope): GameState {
	if (!isValidScope(game, scope)) return game;

	const policyOverrides = game.policyOverrides.filter(
		(override) => !sameScope(override.scope, scope)
	);
	if (policyOverrides.length === game.policyOverrides.length) return game;

	return { ...game, policyOverrides: sortedOverrides(policyOverrides) };
}

export function stepPolicyValue<K extends keyof CompanyPolicy>(
	field: K,
	current: CompanyPolicy[K],
	direction: -1 | 1
): CompanyPolicy[K] {
	const options = POLICY_FIELD_OPTIONS[field] as unknown as readonly CompanyPolicy[K][];
	const currentIndex = options.indexOf(current);
	const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + direction));
	return options[nextIndex]!;
}
