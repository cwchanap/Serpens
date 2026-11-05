import { describe, expect, it } from 'vitest';
import type { GameRouteCommitResult } from '$lib/game/commandResult';
import { createI18n } from '$lib/i18n';
import { currentScenarioDefinition } from '$lib/scenarios/catalog';
import type { ScenarioContentQuery } from '$lib/scenarios/capabilities';
import {
	isLiveScenarioContentAllowed,
	shouldResetScenarioView,
	toCatalogActionResult,
	type ScenarioRouteIdentity
} from './scenarioRoute';

const i18n = createI18n('en');

describe('toCatalogActionResult', () => {
	it.each([
		[
			'scenarioCatalog.startReplacementConfirmation',
			'Starting this challenge replaces the active run.'
		],
		[
			'scenarioCatalog.olderVersionConfirmation',
			'Starting the current version replaces the active older run.'
		],
		['scenarioCatalog.importReplacementConfirmation', 'Replace the active run?']
	] as const)('preserves confirmation copy and CAS tokens for %s', (key, message) => {
		expect(
			toCatalogActionResult(
				{ status: 'confirmation-required', expectedRunId: 'persisted-run', expectedRevision: 12 },
				key,
				null,
				i18n
			)
		).toEqual({
			status: 'confirmation-required',
			message,
			expectedRunId: 'persisted-run',
			expectedRevision: 12
		});
	});

	it.each([
		{ expectedRunId: null, expectedRevision: null },
		{ expectedRunId: undefined, expectedRevision: undefined },
		{ expectedRunId: 'initial-run', expectedRevision: 0 }
	])('does not coerce nullable, absent or zero CAS tokens: %j', (tokens) => {
		expect(
			toCatalogActionResult(
				{ status: 'confirmation-required', ...tokens },
				'scenarioCatalog.startReplacementConfirmation',
				null,
				i18n
			)
		).toEqual({
			status: 'confirmation-required',
			message: 'Starting this challenge replaces the active run.',
			...tokens
		});
	});

	it('maps a committed scenario to started even with an earlier operation error', () => {
		expect(
			toCatalogActionResult(
				{ status: 'committed' },
				'scenarioCatalog.startReplacementConfirmation',
				{ code: 'persistence-read-failed', diagnostics: [] },
				i18n
			)
		).toEqual({ status: 'started' });
	});

	it.each(['busy', 'rejected', 'unavailable', 'failed', 'unchanged', 'sandbox-committed'] as const)(
		'maps non-scenario-success %s to the fallback error',
		(status) => {
			const result: GameRouteCommitResult =
				status === 'sandbox-committed' ? { status, changed: true } : { status };
			expect(
				toCatalogActionResult(result, 'scenarioCatalog.startReplacementConfirmation', null, i18n)
			).toEqual({ status: 'error', message: 'The challenge could not be saved.' });
		}
	);

	it('localizes the confirmation and operation error using the current locale', () => {
		const ja = createI18n('ja');
		expect(
			toCatalogActionResult(
				{ status: 'confirmation-required' },
				'scenarioCatalog.importReplacementConfirmation',
				null,
				ja
			)
		).toEqual({
			status: 'confirmation-required',
			message: '進行中のランを置き換えますか？',
			expectedRunId: undefined,
			expectedRevision: undefined
		});
		expect(
			toCatalogActionResult(
				{ status: 'failed' },
				'scenarioCatalog.importReplacementConfirmation',
				{ code: 'persistence-read-failed', diagnostics: [] },
				ja
			)
		).toEqual({ status: 'error', message: 'チャレンジを読み込めませんでした。' });
	});
});

describe('isLiveScenarioContentAllowed', () => {
	const definition = currentScenarioDefinition('first-profit')!;
	it('allows sandbox content even without a definition', () => {
		expect(
			isLiveScenarioContentAllowed('sandbox', null, { kind: 'city', cityId: 'industry-city' })
		).toBe(true);
	});

	it('denies scenario content without a resolved definition', () => {
		expect(
			isLiveScenarioContentAllowed('scenario', null, { kind: 'city', cityId: 'harbor-city' })
		).toBe(false);
	});

	it.each([
		[{ kind: 'city', cityId: 'harbor-city' }, true],
		[{ kind: 'city', cityId: 'industry-city' }, true],
		[{ kind: 'city', cityId: 'campus-junction' }, false],
		[{ kind: 'archetype', archetypeId: 'convenience' }, true],
		[{ kind: 'building', buildingTypeId: 'water-pump' }, false],
		[{ kind: 'product', productId: 'bottled-water' }, true],
		[{ kind: 'product', productId: 'produce' }, false],
		[
			{
				kind: 'retail-placement',
				cityId: 'harbor-city',
				tileId: 'not-a-slot',
				archetypeId: 'convenience'
			},
			false
		],
		[
			{
				kind: 'industrial-placement',
				cityId: 'industry-city',
				tileId: 'not-a-slot',
				buildingTypeId: 'water-pump'
			},
			false
		]
	] satisfies Array<[ScenarioContentQuery, boolean]>)(
		'respects authored content %j',
		(query, allowed) => {
			expect(isLiveScenarioContentAllowed('scenario', definition, query)).toBe(allowed);
		}
	);
});

describe('shouldResetScenarioView', () => {
	const active: ScenarioRouteIdentity = {
		playMode: 'scenario',
		runId: 'run-1',
		status: 'active',
		scenarioRunSyncEpoch: 0
	};
	it('skips the initial publication', () => {
		expect(shouldResetScenarioView(undefined, active)).toBe(false);
	});

	it('preserves selections and running time for fresh same-run command publications', () => {
		const previous = { ...active, revision: 1, game: { day: 1 }, pending: true };
		const next = { ...active, revision: 2, game: { day: 2 }, pending: false };
		expect(shouldResetScenarioView(previous, next)).toBe(false);
	});

	it.each([
		{ ...active, playMode: 'sandbox' as const },
		{ ...active, runId: 'replacement-run' },
		{ ...active, status: 'completed' as const },
		{ ...active, status: 'failed' as const },
		{ ...active, runId: null, status: null },
		{ ...active, scenarioRunSyncEpoch: 1 }
	])('resets on a lifecycle/external-sync transition: %j', (next) => {
		expect(shouldResetScenarioView(active, next)).toBe(true);
	});

	it('does not reset on repeated no-run sandbox publications', () => {
		const sandbox: ScenarioRouteIdentity = {
			playMode: 'sandbox',
			runId: null,
			status: null,
			scenarioRunSyncEpoch: 0
		};
		expect(shouldResetScenarioView(sandbox, { ...sandbox })).toBe(false);
	});
});
