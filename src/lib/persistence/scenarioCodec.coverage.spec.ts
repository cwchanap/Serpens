import { describe, expect, it } from 'vitest';
import {
	SCENARIO_STORE_SCHEMA_VERSION,
	ScenarioCodecError,
	cloneScenarioStoreSnapshot,
	createEmptyScenarioStore,
	decodeScenarioStoreSnapshot,
	parseScenarioStoreSnapshot,
	validateScenarioStoreSnapshot
} from './scenarioCodec';

describe('scenario codec defensive coverage', () => {
	it('returns a clone-safe diagnostic for invalid JSON', () => {
		const decoded = parseScenarioStoreSnapshot('{not-json');

		expect(decoded.snapshot).toEqual(createEmptyScenarioStore());
		expect(decoded.diagnostics).toMatchObject([
			{ code: 'invalid-json', path: 'scenarioStore', detail: 'Scenario store is not valid JSON.' }
		]);
		expect(() => structuredClone(decoded.diagnostics)).not.toThrow();
	});

	it.each([
		['missing', undefined],
		['null', null],
		['boolean', true],
		['string', 'future'],
		['non-finite', Number.POSITIVE_INFINITY],
		['bigint', 1n],
		['symbol', Symbol('schema')],
		['function', () => undefined]
	] as const)('sanitizes an unsupported %s schema version', (_name, schemaVersion) => {
		const decoded = decodeScenarioStoreSnapshot({
			schemaVersion,
			activeRunsByScenarioId: {},
			bestResultsByDefinitionKey: {}
		});

		expect(decoded.snapshot).toEqual(createEmptyScenarioStore());
		expect(decoded.diagnostics[0]).toMatchObject({
			code: 'unsupported-store-schema',
			path: 'scenarioStore.schemaVersion'
		});
		expect(() => structuredClone(decoded.diagnostics)).not.toThrow();
	});

	it('rejects non-plain store envelopes without invoking getters', () => {
		let getterCalls = 0;
		const envelope = Object.create({ inherited: true });
		Object.defineProperty(envelope, 'schemaVersion', {
			enumerable: true,
			get() {
				getterCalls += 1;
				return SCENARIO_STORE_SCHEMA_VERSION;
			}
		});

		const decoded = decodeScenarioStoreSnapshot(envelope);

		expect(getterCalls).toBe(0);
		expect(decoded.snapshot).toEqual(createEmptyScenarioStore());
		expect(decoded.diagnostics[0]?.code).toBe('invalid-store');
	});

	it('isolates malformed envelope fields and map entry descriptors', () => {
		const activeRunsByScenarioId = Object.create(null) as Record<PropertyKey, unknown>;
		Object.defineProperty(activeRunsByScenarioId, 'first-profit', {
			enumerable: true,
			get: () => ({})
		});
		Object.defineProperty(activeRunsByScenarioId, 'hidden', {
			enumerable: false,
			value: {}
		});
		Object.defineProperty(activeRunsByScenarioId, Symbol('entry'), {
			enumerable: true,
			value: {}
		});

		const envelope = Object.create(null);
		Object.defineProperties(envelope, {
			schemaVersion: { enumerable: true, value: SCENARIO_STORE_SCHEMA_VERSION },
			activeRunsByScenarioId: { enumerable: true, value: activeRunsByScenarioId },
			bestResultsByDefinitionKey: { enumerable: true, get: () => ({}) }
		});

		const decoded = decodeScenarioStoreSnapshot(envelope);
		const codes = decoded.diagnostics.map((diagnostic) => diagnostic.code);

		expect(decoded.snapshot).toEqual(createEmptyScenarioStore());
		expect(codes).toContain('invalid-entry-descriptor');
		expect(codes).toContain('invalid-envelope-property');
		expect(decoded.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
			[...decoded.diagnostics.map((diagnostic) => diagnostic.path)].sort()
		);
	});

	it('throws ScenarioCodecError from strict validation and preserves diagnostics', () => {
		let thrown: unknown;
		try {
			validateScenarioStoreSnapshot({
				schemaVersion: SCENARIO_STORE_SCHEMA_VERSION,
				activeRunsByScenarioId: [],
				bestResultsByDefinitionKey: {}
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(ScenarioCodecError);
		expect((thrown as ScenarioCodecError).diagnostics).toMatchObject([
			{ code: 'invalid-map', path: 'scenarioStore.activeRunsByScenarioId' }
		]);
	});

	it('clones a valid empty snapshot rather than returning the input object', () => {
		const snapshot = createEmptyScenarioStore();
		const cloned = cloneScenarioStoreSnapshot(snapshot);

		expect(cloned).toEqual(snapshot);
		expect(cloned).not.toBe(snapshot);
		expect(cloned.activeRunsByScenarioId).not.toBe(snapshot.activeRunsByScenarioId);
		expect(cloned.bestResultsByDefinitionKey).not.toBe(snapshot.bestResultsByDefinitionKey);
	});
});
