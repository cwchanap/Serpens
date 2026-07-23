import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '$lib/game/state';
import { simulateDay } from '$lib/game/simulateDay';
import {
	ScenarioCommandGate,
	runImmediateSandboxOperation,
	runPersistenceGatedOperation
} from '$lib/scenarios/commandGate';
import routeSource from './+page.svelte?raw';

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

const MUTATION_INVENTORY = [
	'founding placement',
	'autosave resume',
	'manual load',
	'advance day',
	'policy',
	'decision',
	'hire staff',
	'assign staff',
	'unassign staff',
	'promote staff',
	'selling price',
	'inventory targets',
	'store upgrade',
	'industry placement',
	'industry upgrade',
	'rail build',
	'rail upgrade',
	'rail demolition',
	'world selection',
	'world opening',
	'alert retail selection',
	'alert industry selection'
] as const;

const SCENARIO_COMMAND_KINDS = [
	'advanceDay',
	'resolveDecision',
	'updatePolicy',
	'openWorldCity',
	'selectWorldCity',
	'openStore',
	'upgradeStore',
	'hireStaff',
	'assignStaff',
	'unassignStaff',
	'promoteStaff',
	'updateStoreSellingPrice',
	'updateStoreInventoryTargets',
	'buildIndustrialBuilding',
	'upgradeIndustrialBuilding',
	'buildRail',
	'upgradeRail',
	'demolishRail'
] as const;

const SANDBOX_TRANSITION_CALLS = [
	'createFoundingGameAtTile({',
	'simulateDay(currentGame!)',
	'updatePolicy(currentGame!, patch)',
	'resolveDecision(currentGame!, decisionId, optionId)',
	'hireCandidate(currentGame!, candidateId)',
	'assignStaffToStore(currentGame!, staffId, storeId)',
	'unassignStaff(currentGame!, staffId)',
	'promoteStaff(currentGame!, staffId)',
	'updateStoreProduct(currentGame!, storeId, categoryId, patch)',
	'upgradeStore(currentGame!, storeId)',
	'openStoreAtTile(currentGame!, {',
	'buildIndustrialBuilding(currentGame!, { tileId, buildingTypeId })',
	'upgradeBuilding(currentGame!, buildingId)',
	'buildRail(currentGame!, input)',
	'upgradeRailSegment(currentGame!, industryCity.id, segmentId)',
	'demolishRailSegment(currentGame!, industryCity.id, segmentId)',
	'openWorldCity(currentGame!, cityId)',
	'selectWorldCity(currentGame!, status.city.id)'
] as const;

describe('route game commit foundation', () => {
	it('publishes every sandbox mutation immediately and starts autosave', () => {
		let visible = createNewGame('convenience', 12_001);
		const autosave = vi.fn();
		const sfx = vi.fn();

		for (const [index, label] of MUTATION_INVENTORY.entries()) {
			const previous = visible;
			const expectedCash = previous.cash + index + 1;

			const result = runImmediateSandboxOperation({
				current: previous,
				transition: (game) => ({ ...game!, cash: expectedCash }),
				publish: (game) => {
					visible = game;
				},
				autosave,
				afterPublish: sfx
			});

			expect(result.changed, label).toBe(true);
			expect(visible.cash, label).toBe(expectedCash);
			expect(autosave, label).toHaveBeenLastCalledWith(visible);
		}

		expect(autosave).toHaveBeenCalledTimes(MUTATION_INVENTORY.length);
		expect(sfx).toHaveBeenCalledTimes(MUTATION_INVENTORY.length);
	});

	it('keeps scenario publication and SFX behind persistence while selection remains callable', async () => {
		const gate = new ScenarioCommandGate();
		const write = deferred<{ game: ReturnType<typeof createNewGame> }>();
		const committed = createNewGame('convenience', 12_002);
		const next = simulateDay(committed);
		let visible = committed;
		const selectTile = vi.fn<(tileId: string) => void>();
		const publish = vi.fn((outcome: { game: typeof committed }) => {
			visible = outcome.game;
		});
		const sfx = vi.fn();

		const first = runPersistenceGatedOperation(gate, {
			prepare: () => ({ status: 'changed' as const, value: next }),
			persist: () => write.promise,
			publish,
			afterPublish: sfx
		});
		const second = await runPersistenceGatedOperation(gate, {
			prepare: () => ({ status: 'changed' as const, value: next }),
			persist: async () => ({ game: next }),
			publish,
			afterPublish: sfx
		});

		const tileId = committed.cities[0]!.tiles[0]!.id;
		selectTile(tileId);

		expect(second).toEqual({ status: 'busy' });
		expect(selectTile).toHaveBeenCalledWith(tileId);
		expect(visible).toBe(committed);
		expect(publish).not.toHaveBeenCalled();
		expect(sfx).not.toHaveBeenCalled();

		write.resolve({ game: next });
		expect(await first).toEqual({ status: 'committed', value: { game: next } });
		expect(visible).toBe(next);
		expect(publish).toHaveBeenCalledOnce();
		expect(sfx).toHaveBeenCalledOnce();
	});

	it('keeps the previously committed scenario visible when persistence fails', async () => {
		const gate = new ScenarioCommandGate();
		const committed = createNewGame('convenience', 12_003);
		const next = simulateDay(committed);
		const writeError = new Error('disk unavailable');
		let visible = committed;
		const publish = vi.fn((outcome: { game: typeof committed }) => {
			visible = outcome.game;
		});

		await expect(
			runPersistenceGatedOperation(gate, {
				prepare: () => ({ status: 'changed' as const, value: next }),
				persist: async () => Promise.reject(writeError),
				publish
			})
		).rejects.toBe(writeError);

		expect(visible).toBe(committed);
		expect(publish).not.toHaveBeenCalled();
		expect(gate.busy).toBe(false);
	});

	it('declares one read-only derived game and maps every scenario mutation kind', () => {
		const scriptSource = routeSource.slice(
			routeSource.indexOf('<script lang="ts">'),
			routeSource.indexOf('</script>')
		);
		const gameAssignments = scriptSource.match(/\bgame\s*=/g) ?? [];

		expect(gameAssignments).toHaveLength(1);
		expect(scriptSource).toMatch(
			/let game = \$derived\(playMode === 'scenario' \? \(activeScenarioRun\?\.game \?\? null\) : sandboxGame\)/
		);
		for (const kind of SCENARIO_COMMAND_KINDS) {
			expect(routeSource).toContain(`kind: '${kind}'`);
		}
		for (const transitionCall of SANDBOX_TRANSITION_CALLS) {
			expect(scriptSource).toContain(transitionCall);
		}
		expect(scriptSource.match(/kind: 'sandbox-load'/g)).toHaveLength(3);
		expect(scriptSource.match(/kind: 'selectWorldCity'/g)).toHaveLength(3);
		expect(scriptSource).toContain('runImmediateSandboxOperation({');
		expect(scriptSource).toContain('void writeAutoSave(nextGame)');
		expect(scriptSource).not.toContain('setGameAndAutosave');
		expect(routeSource).toContain('createSaveRepository()');
		expect(routeSource).toContain('createScenarioRepository()');
	});
});
