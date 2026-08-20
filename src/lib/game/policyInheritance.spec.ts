import { describe, expect, test } from 'vitest';
import { createNewGame, openStore } from './state';
import { openWorldCity } from './world';
import {
	clearPolicyOverrideField,
	isValidPolicyScope,
	POLICY_FIELD_OPTIONS,
	resetPolicyOverrideScope,
	resolveEffectivePolicy,
	setPolicyOverride,
	stepPolicyValue
} from './policyInheritance';
import type { GameState } from './types';

function openCampusCity(game: GameState): GameState {
	return openWorldCity(
		{
			...game,
			cash: 100_000,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
			}
		},
		'campus-junction'
	);
}

describe('policy inheritance', () => {
	test('resolves company values to a city override with provenance', () => {
		const game = createNewGame('convenience', 101);
		const scope = { kind: 'city', cityId: 'harbor-city' } as const;
		const updated = setPolicyOverride(game, scope, { pricing: 'premium' });
		const effective = resolveEffectivePolicy(updated, scope);

		expect(effective.values.pricing).toBe('premium');
		expect(effective.provenance.pricing).toEqual(scope);
		expect(effective.provenance.inventory).toEqual({ kind: 'company' });
	});

	test('resolves company to city to store in order', () => {
		const game = createNewGame('convenience', 102);
		const cityScope = { kind: 'city', cityId: 'harbor-city' } as const;
		const storeScope = { kind: 'store', storeId: game.stores[0]!.id } as const;
		const updated = setPolicyOverride(
			setPolicyOverride(game, cityScope, { pricing: 'premium', marketing: 'loyalty' }),
			storeScope,
			{ pricing: 'discount', service: 'highTouch' }
		);
		const effective = resolveEffectivePolicy(updated, storeScope);

		expect(effective.values.pricing).toBe('discount');
		expect(effective.provenance.pricing).toEqual(storeScope);
		expect(effective.values.marketing).toBe('loyalty');
		expect(effective.provenance.marketing).toEqual(cityScope);
		expect(effective.provenance.service).toEqual(storeScope);
	});

	test('keeps an explicit value when it equals its parent', () => {
		const game = createNewGame('convenience', 103);
		const cityScope = { kind: 'city', cityId: 'harbor-city' } as const;
		const storeScope = { kind: 'store', storeId: game.stores[0]!.id } as const;
		const updated = setPolicyOverride(
			setPolicyOverride(game, cityScope, { pricing: 'premium' }),
			storeScope,
			{ pricing: 'premium' }
		);
		const effective = resolveEffectivePolicy(updated, storeScope);

		expect(effective.values.pricing).toBe('premium');
		expect(effective.provenance.pricing).toEqual(storeScope);
		expect(updated.policyOverrides).toContainEqual({
			scope: storeScope,
			values: { pricing: 'premium' }
		});
	});

	test('clearing one field restores its parent value', () => {
		const game = createNewGame('convenience', 104);
		const scope = { kind: 'city', cityId: 'harbor-city' } as const;
		const updated = setPolicyOverride(game, scope, {
			pricing: 'premium',
			service: 'highTouch'
		});
		const cleared = clearPolicyOverrideField(updated, scope, 'pricing');
		const effective = resolveEffectivePolicy(cleared, scope);

		expect(effective.values.pricing).toBe(game.policy.pricing);
		expect(effective.provenance.pricing).toEqual({ kind: 'company' });
		expect(effective.values.service).toBe('highTouch');
		expect(cleared.policyOverrides).toEqual([{ scope, values: { service: 'highTouch' } }]);
	});

	test('resetting a scope removes its whole override record', () => {
		const game = createNewGame('convenience', 105);
		const scope = { kind: 'city', cityId: 'harbor-city' } as const;
		const updated = setPolicyOverride(game, scope, { pricing: 'premium', service: 'highTouch' });
		const reset = resetPolicyOverrideScope(updated, scope);

		expect(reset.policyOverrides).toEqual([]);
		expect(resolveEffectivePolicy(reset, scope).values).toEqual(game.policy);
	});

	test('keeps overrides in canonical city and store id order', () => {
		const gameWithCampus = openCampusCity(createNewGame('convenience', 106));
		const game = openStore(
			{ ...gameWithCampus, cash: 100_000 },
			{
				archetypeId: 'convenience',
				location: { neighborhoodId: 'downtown', x: 0, y: 0 }
			}
		);
		const storeOne = { kind: 'store', storeId: 'store-1' } as const;
		const storeTwo = { kind: 'store', storeId: 'store-2' } as const;
		const campus = { kind: 'city', cityId: 'campus-junction' } as const;
		const harbor = { kind: 'city', cityId: 'harbor-city' } as const;
		const updated = setPolicyOverride(
			setPolicyOverride(
				setPolicyOverride(setPolicyOverride(game, storeTwo, { pricing: 'premium' }), campus, {
					pricing: 'discount'
				}),
				harbor,
				{ pricing: 'competitive' }
			),
			storeOne,
			{ pricing: 'standard' }
		);

		expect(updated.policyOverrides.map((override) => override.scope)).toEqual([
			harbor,
			campus,
			storeOne,
			storeTwo
		]);
	});

	test('copies reactive scope objects into a cloneable persisted override', () => {
		const game = createNewGame('convenience', 107);
		const scope = new Proxy({ kind: 'store', storeId: game.stores[0]!.id } as const, {});
		const updated = setPolicyOverride(game, scope, { pricing: 'premium' });

		expect(updated.policyOverrides[0]?.scope).not.toBe(scope);
		expect(() => structuredClone(updated)).not.toThrow();
	});

	test('returns the original game for invalid mutation scopes', () => {
		const game = createNewGame('convenience', 107);
		const invalidScope = { kind: 'city', cityId: 'campus-junction' } as const;

		expect(setPolicyOverride(game, invalidScope, { pricing: 'premium' })).toBe(game);
		expect(clearPolicyOverrideField(game, invalidScope, 'pricing')).toBe(game);
		expect(resetPolicyOverrideScope(game, invalidScope)).toBe(game);
		expect(() => resolveEffectivePolicy(game, invalidScope)).toThrow(/invariant/i);
	});

	test('steps policy values without wrapping at option boundaries', () => {
		expect(stepPolicyValue('pricing', POLICY_FIELD_OPTIONS.pricing[0], -1)).toBe(
			POLICY_FIELD_OPTIONS.pricing[0]
		);
		expect(stepPolicyValue('pricing', POLICY_FIELD_OPTIONS.pricing.at(-1)!, 1)).toBe(
			POLICY_FIELD_OPTIONS.pricing.at(-1)
		);
		expect(stepPolicyValue('inventory', 'balanced', -1)).toBe('lean');
		expect(stepPolicyValue('inventory', 'balanced', 1)).toBe('generous');
	});
});

describe('policy inheritance edge cases', () => {
	test('isValidPolicyScope distinguishes valid and invalid store scopes', () => {
		const game = createNewGame('convenience', 200);
		const validStore = { kind: 'store' as const, storeId: game.stores[0]!.id };
		const missingStore = { kind: 'store' as const, storeId: 'missing-store' };
		const validCity = { kind: 'city' as const, cityId: 'harbor-city' as const };
		const invalidCity = { kind: 'city' as const, cityId: 'campus-junction' as const };

		expect(isValidPolicyScope(game, validStore)).toBe(true);
		expect(isValidPolicyScope(game, missingStore)).toBe(false);
		expect(isValidPolicyScope(game, validCity)).toBe(true);
		expect(isValidPolicyScope(game, invalidCity)).toBe(false);
	});

	test('setPolicyOverride returns the original game for a missing store scope', () => {
		const game = createNewGame('convenience', 201);
		const missingStore = { kind: 'store' as const, storeId: 'missing-store' };

		expect(setPolicyOverride(game, missingStore, { pricing: 'premium' })).toBe(game);
	});

	test('setPolicyOverride returns the original game when the patch has no defined values', () => {
		const game = createNewGame('convenience', 202);
		const scope = { kind: 'city', cityId: 'harbor-city' } as const;

		expect(setPolicyOverride(game, scope, { pricing: undefined })).toBe(game);
	});

	test('setPolicyOverride merges a new field into an existing override', () => {
		const game = createNewGame('convenience', 203);
		const scope = { kind: 'city', cityId: 'harbor-city' } as const;
		const first = setPolicyOverride(game, scope, { pricing: 'premium' });
		const updated = setPolicyOverride(first, scope, { service: 'highTouch' });

		expect(updated.policyOverrides).toEqual([
			{ scope, values: { pricing: 'premium', service: 'highTouch' } }
		]);
	});

	test('clearPolicyOverrideField is a no-op when no override exists for the scope', () => {
		const game = createNewGame('convenience', 204);
		const scope = { kind: 'city', cityId: 'harbor-city' } as const;

		expect(clearPolicyOverrideField(game, scope, 'pricing')).toBe(game);
	});

	test('clearPolicyOverrideField is a no-op when the field is not in the override', () => {
		const game = createNewGame('convenience', 205);
		const scope = { kind: 'city', cityId: 'harbor-city' } as const;
		const withOverride = setPolicyOverride(game, scope, { pricing: 'premium' });

		expect(clearPolicyOverrideField(withOverride, scope, 'service')).toBe(withOverride);
	});

	test('clearPolicyOverrideField removes the whole override when the last field is cleared', () => {
		const game = createNewGame('convenience', 206);
		const scope = { kind: 'city', cityId: 'harbor-city' } as const;
		const withOverride = setPolicyOverride(game, scope, { pricing: 'premium' });
		const cleared = clearPolicyOverrideField(withOverride, scope, 'pricing');

		expect(cleared.policyOverrides).toEqual([]);
	});

	test('resetPolicyOverrideScope is a no-op when no override exists for the scope', () => {
		const game = createNewGame('convenience', 207);
		const scope = { kind: 'city', cityId: 'harbor-city' } as const;

		expect(resetPolicyOverrideScope(game, scope)).toBe(game);
	});

	test('resolveStoreCityId returns null for a store in an unopened city', () => {
		const base = createNewGame('convenience', 208);
		const game: GameState = {
			...base,
			stores: [
				...base.stores,
				{ ...base.stores[0]!, id: 'store-campus', cityId: 'campus-junction', name: 'Campus' }
			]
		};
		const scope = { kind: 'store' as const, storeId: 'store-campus' };

		expect(isValidPolicyScope(game, scope)).toBe(false);
		expect(setPolicyOverride(game, scope, { pricing: 'premium' })).toBe(game);
	});

	test('setPolicyOverride replaces an existing field value while other overrides remain', () => {
		const gameWithCampus = openCampusCity(createNewGame('convenience', 209));
		const game = openStore(
			{ ...gameWithCampus, cash: 100_000 },
			{
				archetypeId: 'convenience',
				location: { neighborhoodId: 'downtown', x: 0, y: 0 }
			}
		);
		const harbor = { kind: 'city', cityId: 'harbor-city' } as const;
		const storeOne = { kind: 'store', storeId: 'store-1' } as const;
		const withOverrides = setPolicyOverride(
			setPolicyOverride(game, harbor, { pricing: 'premium' }),
			storeOne,
			{ pricing: 'discount' }
		);

		const updated = setPolicyOverride(withOverrides, storeOne, { pricing: 'standard' });

		expect(updated.policyOverrides).toEqual([
			{ scope: harbor, values: { pricing: 'premium' } },
			{ scope: storeOne, values: { pricing: 'standard' } }
		]);
	});

	test('clearPolicyOverrideField keeps other overrides when clearing one field', () => {
		const gameWithCampus = openCampusCity(createNewGame('convenience', 210));
		const game = openStore(
			{ ...gameWithCampus, cash: 100_000 },
			{
				archetypeId: 'convenience',
				location: { neighborhoodId: 'downtown', x: 0, y: 0 }
			}
		);
		const harbor = { kind: 'city', cityId: 'harbor-city' } as const;
		const storeOne = { kind: 'store', storeId: 'store-1' } as const;
		const withOverrides = setPolicyOverride(
			setPolicyOverride(game, harbor, { pricing: 'premium' }),
			storeOne,
			{ pricing: 'discount', service: 'highTouch' }
		);

		const cleared = clearPolicyOverrideField(withOverrides, storeOne, 'pricing');

		expect(cleared.policyOverrides).toEqual([
			{ scope: harbor, values: { pricing: 'premium' } },
			{ scope: storeOne, values: { service: 'highTouch' } }
		]);
	});
});
