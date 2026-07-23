import { describe, expect, it } from 'vitest';

import { decodeScenarioShareCode, encodeScenarioShareCode } from './shareCode';
import {
	MAX_SCENARIO_SEED,
	type ScenarioDefinition,
	type ScenarioDefinitionRef,
	type ScenarioId
} from './types';

const fixtureDefinitions = [
	{ id: 'first-profit', version: 1, officialSeed: 280_001 },
	{ id: 'import-squeeze', version: 1, officialSeed: 280_002 },
	{ id: 'local-lifeline', version: 1, officialSeed: 2_147_483_646 }
] as const;

function resolveFixtureDefinition(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined {
	const definition = fixtureDefinitions.find(
		(candidate) => candidate.id === ref.scenarioId && candidate.version === ref.version
	);
	return definition as ScenarioDefinition | undefined;
}

function independentlyComputedFnv1a32(value: string): number {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(value)) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

function checksumFor(preimage: string): string {
	return independentlyComputedFnv1a32(preimage).toString(36).padStart(7, '0');
}

describe('scenario share codes', () => {
	it('matches an independent FNV-1a vector and checksum calculation', () => {
		expect(independentlyComputedFnv1a32('hello')).toBe(0x4f9f2cab);
		expect(encodeScenarioShareCode({ scenarioId: 'first-profit', version: 1 }, 280_001)).toBe(
			'SC1.first-profit.1.601t.04d9xyn'
		);
	});

	it.each([
		['first-profit', 1, 280_001],
		['import-squeeze', 1, 280_002],
		['local-lifeline', 1, 2_147_483_646]
	])('round-trips %s version %i seed %i', (scenarioId, version, seed) => {
		const code = encodeScenarioShareCode({ scenarioId: scenarioId as ScenarioId, version }, seed);
		const decoded = decodeScenarioShareCode(code, resolveFixtureDefinition);

		expect(decoded).toEqual({
			ok: true,
			value: {
				definition: { scenarioId, version },
				seed,
				eligibility:
					seed ===
					resolveFixtureDefinition({ scenarioId: scenarioId as ScenarioId, version })!.officialSeed
						? 'ranked'
						: 'unranked',
				canonicalCode: code
			}
		});
	});

	it('enforces the shared canonical seed maximum for encoding and external decoding', () => {
		const definition = { scenarioId: 'local-lifeline' as const, version: 1 };
		const maximumCode = encodeScenarioShareCode(definition, MAX_SCENARIO_SEED);
		const oversizedSeed = MAX_SCENARIO_SEED + 1;
		const oversizedPreimage = `SC1.local-lifeline.1.${oversizedSeed.toString(36)}`;
		const externallyChecksummedOversizedCode = `${oversizedPreimage}.${checksumFor(oversizedPreimage)}`;

		expect(decodeScenarioShareCode(maximumCode, resolveFixtureDefinition)).toMatchObject({
			ok: true,
			value: { seed: 2_147_483_646 }
		});
		expect(() => encodeScenarioShareCode(definition, oversizedSeed)).toThrow(
			'Scenario seed must be an integer from 1 through 2147483646.'
		);
		expect(
			decodeScenarioShareCode(externallyChecksummedOversizedCode, resolveFixtureDefinition)
		).toEqual({
			ok: false,
			code: 'invalid-seed'
		});
	});

	it('canonicalizes mixed case and surrounding whitespace', () => {
		const code = encodeScenarioShareCode({ scenarioId: 'first-profit', version: 1 }, 280_001);
		expect(decodeScenarioShareCode(`  ${code.toLowerCase()}  `, resolveFixtureDefinition)).toEqual({
			ok: true,
			value: {
				definition: { scenarioId: 'first-profit', version: 1 },
				seed: 280_001,
				eligibility: 'ranked',
				canonicalCode: code
			}
		});
	});

	it('marks a non-official seed as unranked', () => {
		const code = encodeScenarioShareCode({ scenarioId: 'first-profit', version: 1 }, 280_002);
		expect(decodeScenarioShareCode(code, resolveFixtureDefinition)).toMatchObject({
			ok: true,
			value: { eligibility: 'unranked' }
		});
	});

	it.each([
		['SC1.first.profit.1.1.0000000'],
		['SC1.first-profit.01.1.0000000'],
		['SC1.first-profit.1.01.0000000'],
		['SC1.first-profit.1.1.0000000.extra'],
		['SC1.first-profit.1.1'],
		['SC1.first-profit.1.1.0000000.extra.field']
	])('rejects malformed code %s', (input) => {
		expect(decodeScenarioShareCode(input, resolveFixtureDefinition)).toEqual({
			ok: false,
			code: 'malformed'
		});
	});

	it('rejects seed zero and a seed above the signed 32-bit maximum', () => {
		const zero = `SC1.first-profit.1.0.${checksumFor('SC1.first-profit.1.0')}`;
		const aboveMaximum = `SC1.first-profit.1.zik0zk.${checksumFor('SC1.first-profit.1.zik0zk')}`;
		const huge = `SC1.first-profit.1.zzzzzzzzzzzzzzzz.${checksumFor('SC1.first-profit.1.zzzzzzzzzzzzzzzz')}`;

		expect(decodeScenarioShareCode(zero, resolveFixtureDefinition)).toEqual({
			ok: false,
			code: 'invalid-seed'
		});
		expect(decodeScenarioShareCode(aboveMaximum, resolveFixtureDefinition)).toEqual({
			ok: false,
			code: 'invalid-seed'
		});
		expect(decodeScenarioShareCode(huge, resolveFixtureDefinition)).toEqual({
			ok: false,
			code: 'invalid-seed'
		});
	});

	it('rejects an unsupported version after recognizing the scenario', () => {
		const input = `SC1.first-profit.2.1.${checksumFor('SC1.first-profit.2.1')}`;
		expect(decodeScenarioShareCode(input, resolveFixtureDefinition)).toEqual({
			ok: false,
			code: 'unsupported-version'
		});
	});

	it('rejects an unknown scenario after validating its code shape', () => {
		const input = `SC1.unknown.1.1.${checksumFor('SC1.unknown.1.1')}`;
		expect(decodeScenarioShareCode(input, resolveFixtureDefinition)).toEqual({
			ok: false,
			code: 'unknown-scenario'
		});
	});

	it('uses the catalog resolver by default after recognizing a closed scenario ID', () => {
		const code = encodeScenarioShareCode({ scenarioId: 'first-profit', version: 1 }, 280_001);
		expect(decodeScenarioShareCode(code)).toEqual({
			ok: false,
			code: 'unsupported-version'
		});
	});

	it('rejects an altered checksum', () => {
		const code = encodeScenarioShareCode({ scenarioId: 'first-profit', version: 1 }, 280_001);
		const altered = `${code.slice(0, -1)}${code.endsWith('0') ? '1' : '0'}`;
		expect(decodeScenarioShareCode(altered, resolveFixtureDefinition)).toEqual({
			ok: false,
			code: 'checksum-mismatch'
		});
	});
});
