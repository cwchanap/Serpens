import type {
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioEligibility,
	ScenarioId
} from './types';

const SHARE_CODE_PREFIX = 'SC1';
const MAX_SEED = 2_147_483_647;

export interface DecodedScenarioShareCode {
	definition: ScenarioDefinitionRef;
	seed: number;
	eligibility: ScenarioEligibility;
	canonicalCode: string;
}

export type ShareCodeDecodeResult =
	| { ok: true; value: DecodedScenarioShareCode }
	| {
			ok: false;
			code:
				| 'malformed'
				| 'unknown-scenario'
				| 'unsupported-version'
				| 'invalid-seed'
				| 'checksum-mismatch';
	  };

function fnv1a32(value: string): number {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(value)) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

function checksumFor(preimage: string): string {
	return fnv1a32(preimage).toString(36).padStart(7, '0');
}

function isCanonicalDecimal(value: string): boolean {
	return /^(?:0|[1-9][0-9]*)$/.test(value);
}

function parseVersion(value: string): number | undefined {
	if (!isCanonicalDecimal(value)) return undefined;
	const version = Number(value);
	return Number.isSafeInteger(version) && version > 0 ? version : undefined;
}

function parseSeed(value: string): number | undefined {
	if (!/^[0-9a-z]+$/.test(value)) return undefined;
	const seed = Number.parseInt(value, 36);
	if (!Number.isSafeInteger(seed) || seed < 1 || seed > MAX_SEED) return undefined;
	return seed.toString(36) === value ? seed : undefined;
}

function assertEncodableDefinition(definition: ScenarioDefinitionRef): void {
	if (!definition.scenarioId || !parseVersion(String(definition.version))) {
		throw new RangeError('Scenario definition must have a positive safe-integer version.');
	}
}

export function encodeScenarioShareCode(definition: ScenarioDefinitionRef, seed: number): string {
	assertEncodableDefinition(definition);
	if (!Number.isSafeInteger(seed) || seed < 1 || seed > MAX_SEED) {
		throw new RangeError(`Scenario seed must be an integer from 1 through ${MAX_SEED}.`);
	}

	const preimage = `${SHARE_CODE_PREFIX}.${definition.scenarioId.toLowerCase()}.${definition.version}.${seed.toString(36)}`;
	return `${preimage}.${checksumFor(preimage)}`;
}

export function decodeScenarioShareCode(
	input: string,
	resolveDefinition?: (ref: ScenarioDefinitionRef) => ScenarioDefinition | undefined
): ShareCodeDecodeResult {
	const fields = input.trim().split('.');
	if (fields.length !== 5) return { ok: false, code: 'malformed' };

	const [prefix, rawScenarioId, rawVersion, rawSeed, rawChecksum] = fields.map((field) =>
		field.toLowerCase()
	);
	if (
		prefix !== SHARE_CODE_PREFIX.toLowerCase() ||
		!rawScenarioId ||
		!isCanonicalDecimal(rawVersion) ||
		!/^[0-9a-z]{7}$/.test(rawChecksum)
	) {
		return { ok: false, code: 'malformed' };
	}

	const version = parseVersion(rawVersion);
	if (version === undefined) return { ok: false, code: 'malformed' };

	if (rawSeed === '0') return { ok: false, code: 'invalid-seed' };
	if (!/^[0-9a-z]+$/.test(rawSeed) || Number.parseInt(rawSeed, 36).toString(36) !== rawSeed) {
		return { ok: false, code: 'malformed' };
	}
	const seed = parseSeed(rawSeed);
	if (seed === undefined) return { ok: false, code: 'invalid-seed' };

	const definition = { scenarioId: rawScenarioId as ScenarioId, version };
	const canonicalCode = encodeScenarioShareCode(definition, seed);
	if (rawChecksum !== canonicalCode.split('.')[4]) {
		return { ok: false, code: 'checksum-mismatch' };
	}

	const resolved = resolveDefinition?.(definition);
	if (!resolved) {
		return { ok: false, code: 'unknown-scenario' };
	}
	if (resolved.version !== version) {
		return { ok: false, code: 'unsupported-version' };
	}

	return {
		ok: true,
		value: {
			definition,
			seed,
			eligibility: seed === resolved.officialSeed ? 'ranked' : 'unranked',
			canonicalCode
		}
	};
}
