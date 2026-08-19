import { describe, expect, test } from 'vitest';
import { createNewGame, openStore } from './state';
import { openWorldCity } from './world';
import {
	clearPolicyOverrideField,
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
