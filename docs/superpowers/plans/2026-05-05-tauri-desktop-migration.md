# Tauri Desktop Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Serpens into a desktop-only Tauri app with static SvelteKit output and native auto-save plus manual in-app save slots.

**Architecture:** Keep `src/lib/game` as pure TypeScript simulation code, keep Svelte as the UI shell, keep Phaser as the browser-mounted map renderer, and add Tauri only at the shell and persistence boundaries. The save system is a repository abstraction with a shared snapshot format, a browser fallback repository for tests/dev, and a Tauri store repository for desktop production.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Phaser, Bun, Vitest, Playwright, Tauri 2, Rust, `@tauri-apps/plugin-store`.

---

## References

- Design spec: `docs/superpowers/specs/2026-05-05-tauri-desktop-migration-design.md`
- Tauri SvelteKit guide: `https://v2.tauri.app/start/frontend/sveltekit/`
- Tauri existing-project setup: `https://v2.tauri.app/start/create-project/`
- Tauri store plugin: `https://v2.tauri.app/plugin/store/`

## File Structure

- Modify `package.json`: add Tauri scripts and SvelteKit static/Tauri dependencies.
- Modify `bun.lock`: dependency lock update from Bun.
- Modify `svelte.config.js`: switch from `adapter-auto` to `adapter-static` with `fallback: 'index.html'`.
- Create `src/routes/+layout.ts`: disable app-level SSR for Tauri SPA behavior.
- Create `src/lib/persistence/saveTypes.ts`: save schema constants, metadata, records, and summary types.
- Create `src/lib/persistence/saveCodec.ts`: create and validate versioned save snapshots.
- Create `src/lib/persistence/saveRepository.ts`: repository interface used by UI code.
- Create `src/lib/persistence/saveStoreRepository.ts`: driver-backed repository implementation.
- Create `src/lib/persistence/browserSaveRepository.ts`: localStorage-backed repository for browser dev and e2e tests.
- Create `src/lib/persistence/tauriSaveRepository.ts`: Tauri store-backed repository for desktop.
- Create `src/lib/persistence/saveRepositoryFactory.ts`: runtime repository selection.
- Create `src/lib/persistence/saveRepository.spec.ts`: persistence core tests.
- Create `src/lib/persistence/tauriSaveRepository.spec.ts`: Tauri driver tests with a fake store.
- Create `src/lib/components/game/SavePanel.svelte`: save/load/delete UI.
- Create `src/lib/components/game/SavePanel.svelte.spec.ts`: browser component tests for save UI.
- Modify `src/routes/+page.svelte`: initialize save repository, autosave after meaningful actions, open save panel, load saved games.
- Modify `src/routes/retail-sim.e2e.ts`: save/load e2e coverage.
- Create `src-tauri/.gitignore`: ignore Rust build output.
- Create `src-tauri/Cargo.toml`: Tauri Rust package and dependencies.
- Create `src-tauri/build.rs`: Tauri build script.
- Create `src-tauri/src/main.rs`: desktop entrypoint.
- Create `src-tauri/src/lib.rs`: Tauri builder and store plugin registration.
- Create `src-tauri/tauri.conf.json`: desktop app config.
- Create `src-tauri/capabilities/default.json`: minimal Tauri permissions with `store:default`.

## Task 1: Static SvelteKit Desktop Build

**Files:**

- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `svelte.config.js`
- Create: `src/routes/+layout.ts`

- [ ] **Step 1: Add desktop build dependencies**

Run:

```bash
bun add -d @sveltejs/adapter-static @tauri-apps/cli
bun add @tauri-apps/api @tauri-apps/plugin-store
```

Expected: `package.json` includes `@sveltejs/adapter-static` and `@tauri-apps/cli` in `devDependencies`, includes `@tauri-apps/api` and `@tauri-apps/plugin-store` in dependencies, and `bun.lock` changes.

- [ ] **Step 2: Add Tauri scripts**

Modify `package.json` scripts so the scripts block includes these entries while keeping the existing test/check scripts:

```json
{
	"dev": "vite dev",
	"build": "vite build",
	"preview": "vite preview",
	"tauri": "tauri",
	"tauri:dev": "tauri dev",
	"tauri:build": "tauri build",
	"prepare": "svelte-kit sync || echo ''",
	"check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
	"check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
	"lint": "prettier --check . && eslint .",
	"format": "prettier --write .",
	"test:unit": "vitest",
	"test": "npm run test:unit -- --run && npm run test:e2e",
	"test:e2e": "playwright install && playwright test"
}
```

- [ ] **Step 3: Switch SvelteKit to static adapter**

Replace `svelte.config.js` with:

```js
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			fallback: 'index.html'
		})
	}
};

export default config;
```

- [ ] **Step 4: Disable app-level SSR**

Create `src/routes/+layout.ts`:

```ts
export const ssr = false;
```

- [ ] **Step 5: Verify static build**

Run:

```bash
bun run check
bun run build
```

Expected: `bun run check` passes with 0 errors and 0 warnings. `bun run build` produces `build/index.html` and does not print the previous `Using @sveltejs/adapter-auto` production-environment warning.

- [ ] **Step 6: Commit static build setup**

Run:

```bash
git add package.json bun.lock svelte.config.js src/routes/+layout.ts
git commit -m "build: configure SvelteKit for Tauri static output"
```

## Task 2: Save Snapshot Format and Browser Repository

**Files:**

- Create: `src/lib/persistence/saveTypes.ts`
- Create: `src/lib/persistence/saveCodec.ts`
- Create: `src/lib/persistence/saveRepository.ts`
- Create: `src/lib/persistence/saveStoreRepository.ts`
- Create: `src/lib/persistence/browserSaveRepository.ts`
- Create: `src/lib/persistence/saveRepository.spec.ts`

- [ ] **Step 1: Write persistence tests first**

Create `src/lib/persistence/saveRepository.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import type { GameState } from '$lib/game/types';
import { SAVE_SCHEMA_VERSION } from './saveTypes';
import { SaveDataError, createSaveRecord, validateSaveStoreSnapshot } from './saveCodec';
import { createBrowserSaveRepository, type StorageLike } from './browserSaveRepository';

class FakeStorage implements StorageLike {
	private values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}
}

function createGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 20260505,
		rngState: 99,
		day: 3,
		cash: 12500,
		debt: 2000,
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		cities: [
			{
				id: 'harbor-city',
				name: 'Harbor City',
				width: 1,
				height: 1,
				tiles: []
			}
		],
		activeCityId: 'harbor-city',
		stores: [
			{
				id: 'store-1',
				name: 'Founding Store',
				archetypeId: 'boutique',
				location: 'Downtown (1, 1)',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1',
				mapX: 1,
				mapY: 1,
				daysOpen: 2,
				reputation: 60,
				stockHealth: 70,
				staffMorale: 65,
				staffCapacity: 66,
				localDemand: 72,
				competition: 40,
				managerQuality: 58
			}
		],
		decisions: [],
		reports: [],
		...overrides
	};
}

describe('save records', () => {
	test('creates versioned metadata from game state', () => {
		expect.assertions(8);
		const record = createSaveRecord(createGame(), {
			id: 'manual-test-run',
			name: 'Test Run',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});

		expect(record.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(record.metadata.id).toBe('manual-test-run');
		expect(record.metadata.name).toBe('Test Run');
		expect(record.metadata.kind).toBe('manual');
		expect(record.metadata.day).toBe(3);
		expect(record.metadata.cash).toBe(12500);
		expect(record.metadata.storeCount).toBe(1);
		expect(record.metadata.activeCityName).toBe('Harbor City');
	});

	test('rejects unsupported snapshot schema versions', () => {
		expect.assertions(2);

		expect(() =>
			validateSaveStoreSnapshot({
				schemaVersion: 99,
				autoSave: null,
				manualSlots: []
			})
		).toThrow(SaveDataError);

		expect(() =>
			validateSaveStoreSnapshot({
				schemaVersion: 99,
				autoSave: null,
				manualSlots: []
			})
		).toThrow('Unsupported save schema version: 99');
	});
});

describe('browser save repository', () => {
	test('saves and loads auto-save records', async () => {
		expect.assertions(4);
		const repository = createBrowserSaveRepository(
			new FakeStorage(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);
		const game = createGame();

		const metadata = await repository.saveAuto(game);
		const loaded = await repository.getAutoSave();
		const summary = await repository.getSummary();

		expect(metadata.kind).toBe('auto');
		expect(loaded?.game.day).toBe(3);
		expect(summary.autoSave?.id).toBe('autosave');
		expect(summary.manualSlots).toEqual([]);
	});

	test('creates, overwrites, loads, and deletes manual slots', async () => {
		expect.assertions(8);
		const repository = createBrowserSaveRepository(
			new FakeStorage(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);
		const firstGame = createGame({ day: 4, cash: 15000 });
		const secondGame = createGame({ day: 8, cash: 22000 });

		const created = await repository.createManualSlot('Harbor Run', firstGame);
		let loaded = await repository.loadManualSlot(created.id);

		expect(created.id).toBe('manual-harbor-run-1777982400000');
		expect(loaded?.game.day).toBe(4);

		const overwritten = await repository.overwriteManualSlot(created.id, 'Harbor Run', secondGame);
		loaded = await repository.loadManualSlot(created.id);
		const summary = await repository.getSummary();

		expect(overwritten.day).toBe(8);
		expect(loaded?.game.cash).toBe(22000);
		expect(summary.manualSlots).toHaveLength(1);
		expect(summary.manualSlots[0]?.name).toBe('Harbor Run');

		await repository.deleteManualSlot(created.id);
		loaded = await repository.loadManualSlot(created.id);

		expect(loaded).toBeNull();
		expect((await repository.getSummary()).manualSlots).toEqual([]);
	});

	test('throws when overwriting a missing manual slot', async () => {
		expect.assertions(2);
		const repository = createBrowserSaveRepository(
			new FakeStorage(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		await expect(
			repository.overwriteManualSlot('missing-slot', 'Missing', createGame())
		).rejects.toThrow(SaveDataError);
		await expect(
			repository.overwriteManualSlot('missing-slot', 'Missing', createGame())
		).rejects.toThrow('Manual save slot not found: missing-slot');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun run test:unit -- --run src/lib/persistence/saveRepository.spec.ts
```

Expected: FAIL because the `src/lib/persistence` modules do not exist.

- [ ] **Step 3: Add save types**

Create `src/lib/persistence/saveTypes.ts`:

```ts
import type { GameState } from '$lib/game/types';

export const SAVE_SCHEMA_VERSION = 1;
export const AUTO_SAVE_SLOT_ID = 'autosave';

export type SaveSlotKind = 'auto' | 'manual';

export interface SaveSlotMetadata {
	id: string;
	name: string;
	kind: SaveSlotKind;
	updatedAt: string;
	day: number;
	cash: number;
	storeCount: number;
	activeCityName: string;
}

export interface SaveRecord {
	schemaVersion: typeof SAVE_SCHEMA_VERSION;
	metadata: SaveSlotMetadata;
	game: GameState;
}

export interface SaveStoreSnapshot {
	schemaVersion: typeof SAVE_SCHEMA_VERSION;
	autoSave: SaveRecord | null;
	manualSlots: SaveRecord[];
}

export interface SaveSummary {
	autoSave: SaveSlotMetadata | null;
	manualSlots: SaveSlotMetadata[];
}
```

- [ ] **Step 4: Add save codec**

Create `src/lib/persistence/saveCodec.ts`:

```ts
import type { GameState } from '$lib/game/types';
import {
	AUTO_SAVE_SLOT_ID,
	SAVE_SCHEMA_VERSION,
	type SaveRecord,
	type SaveSlotKind,
	type SaveStoreSnapshot,
	type SaveSummary
} from './saveTypes';

export class SaveDataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SaveDataError';
	}
}

export function createEmptySaveStore(): SaveStoreSnapshot {
	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: null,
		manualSlots: []
	};
}

export function createSaveRecord(
	game: GameState,
	input: { id: string; name: string; kind: SaveSlotKind; updatedAt: Date }
): SaveRecord {
	const updatedAt = input.updatedAt.toISOString();
	const activeCity = game.cities.find((city) => city.id === game.activeCityId);

	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		metadata: {
			id: input.id,
			name: input.name,
			kind: input.kind,
			updatedAt,
			day: game.day,
			cash: game.cash,
			storeCount: game.stores.length,
			activeCityName: activeCity?.name ?? 'No active city'
		},
		game
	};
}

export function createAutoSaveRecord(game: GameState, updatedAt: Date): SaveRecord {
	return createSaveRecord(game, {
		id: AUTO_SAVE_SLOT_ID,
		name: 'Auto-save',
		kind: 'auto',
		updatedAt
	});
}

export function createManualSlotId(name: string, updatedAt: Date): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	return `manual-${slug || 'slot'}-${updatedAt.getTime()}`;
}

export function createSaveSummary(snapshot: SaveStoreSnapshot): SaveSummary {
	return {
		autoSave: snapshot.autoSave?.metadata ?? null,
		manualSlots: snapshot.manualSlots.map((record) => record.metadata)
	};
}

export function parseSaveStoreSnapshot(serialized: string): SaveStoreSnapshot {
	try {
		return validateSaveStoreSnapshot(JSON.parse(serialized));
	} catch (error) {
		if (error instanceof SaveDataError) {
			throw error;
		}

		throw new SaveDataError('Save data is not valid JSON');
	}
}

export function validateSaveStoreSnapshot(value: unknown): SaveStoreSnapshot {
	const record = requireRecord(value, 'Save store');
	const schemaVersion = requireNumber(record.schemaVersion, 'Save store schemaVersion');

	if (schemaVersion !== SAVE_SCHEMA_VERSION) {
		throw new SaveDataError(`Unsupported save schema version: ${schemaVersion}`);
	}

	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: record.autoSave === null ? null : validateSaveRecord(record.autoSave),
		manualSlots: requireArray(record.manualSlots, 'manualSlots').map(validateSaveRecord)
	};
}

export function validateSaveRecord(value: unknown): SaveRecord {
	const record = requireRecord(value, 'Save record');
	const schemaVersion = requireNumber(record.schemaVersion, 'Save record schemaVersion');

	if (schemaVersion !== SAVE_SCHEMA_VERSION) {
		throw new SaveDataError(`Unsupported save schema version: ${schemaVersion}`);
	}

	const metadata = requireRecord(record.metadata, 'Save metadata');
	const game = requireRecord(record.game, 'Saved game');
	const kind = requireString(metadata.kind, 'Save metadata kind');

	if (kind !== 'auto' && kind !== 'manual') {
		throw new SaveDataError(`Unsupported save slot kind: ${kind}`);
	}

	requireString(metadata.id, 'Save metadata id');
	requireString(metadata.name, 'Save metadata name');
	requireString(metadata.updatedAt, 'Save metadata updatedAt');
	requireNumber(metadata.day, 'Save metadata day');
	requireNumber(metadata.cash, 'Save metadata cash');
	requireNumber(metadata.storeCount, 'Save metadata storeCount');
	requireString(metadata.activeCityName, 'Save metadata activeCityName');
	requireNumber(game.day, 'Saved game day');
	requireNumber(game.cash, 'Saved game cash');
	requireArray(game.stores, 'Saved game stores');
	requireArray(game.cities, 'Saved game cities');

	return record as SaveRecord;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new SaveDataError(`${label} must be an object`);
	}

	return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) {
		throw new SaveDataError(`${label} must be an array`);
	}

	return value;
}

function requireString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new SaveDataError(`${label} must be a non-empty string`);
	}

	return value;
}

function requireNumber(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new SaveDataError(`${label} must be a finite number`);
	}

	return value;
}
```

- [ ] **Step 5: Add repository interface**

Create `src/lib/persistence/saveRepository.ts`:

```ts
import type { GameState } from '$lib/game/types';
import type { SaveRecord, SaveSlotMetadata, SaveSummary } from './saveTypes';

export interface SaveRepository {
	getSummary(): Promise<SaveSummary>;
	getAutoSave(): Promise<SaveRecord | null>;
	saveAuto(game: GameState): Promise<SaveSlotMetadata>;
	createManualSlot(name: string, game: GameState): Promise<SaveSlotMetadata>;
	overwriteManualSlot(slotId: string, name: string, game: GameState): Promise<SaveSlotMetadata>;
	loadManualSlot(slotId: string): Promise<SaveRecord | null>;
	deleteManualSlot(slotId: string): Promise<void>;
}
```

- [ ] **Step 6: Add driver-backed repository**

Create `src/lib/persistence/saveStoreRepository.ts`:

```ts
import type { GameState } from '$lib/game/types';
import {
	SaveDataError,
	createAutoSaveRecord,
	createManualSlotId,
	createSaveRecord,
	createSaveSummary
} from './saveCodec';
import type { SaveRepository } from './saveRepository';
import type { SaveRecord, SaveSlotMetadata, SaveStoreSnapshot, SaveSummary } from './saveTypes';

export interface SaveStoreDriver {
	read(): Promise<SaveStoreSnapshot>;
	write(snapshot: SaveStoreSnapshot): Promise<void>;
}

export class SaveRepositoryFromDriver implements SaveRepository {
	constructor(
		private readonly driver: SaveStoreDriver,
		private readonly now: () => Date = () => new Date()
	) {}

	async getSummary(): Promise<SaveSummary> {
		return createSaveSummary(await this.driver.read());
	}

	async getAutoSave(): Promise<SaveRecord | null> {
		return (await this.driver.read()).autoSave;
	}

	async saveAuto(game: GameState): Promise<SaveSlotMetadata> {
		const snapshot = await this.driver.read();
		const autoSave = createAutoSaveRecord(game, this.now());
		await this.driver.write({ ...snapshot, autoSave });
		return autoSave.metadata;
	}

	async createManualSlot(name: string, game: GameState): Promise<SaveSlotMetadata> {
		const updatedAt = this.now();
		const slot = createSaveRecord(game, {
			id: createManualSlotId(name, updatedAt),
			name,
			kind: 'manual',
			updatedAt
		});
		const snapshot = await this.driver.read();
		await this.driver.write({
			...snapshot,
			manualSlots: sortSlots([slot, ...snapshot.manualSlots])
		});
		return slot.metadata;
	}

	async overwriteManualSlot(
		slotId: string,
		name: string,
		game: GameState
	): Promise<SaveSlotMetadata> {
		const snapshot = await this.driver.read();

		if (!snapshot.manualSlots.some((slot) => slot.metadata.id === slotId)) {
			throw new SaveDataError(`Manual save slot not found: ${slotId}`);
		}

		const replacement = createSaveRecord(game, {
			id: slotId,
			name,
			kind: 'manual',
			updatedAt: this.now()
		});
		await this.driver.write({
			...snapshot,
			manualSlots: sortSlots(
				snapshot.manualSlots.map((slot) => (slot.metadata.id === slotId ? replacement : slot))
			)
		});
		return replacement.metadata;
	}

	async loadManualSlot(slotId: string): Promise<SaveRecord | null> {
		const snapshot = await this.driver.read();
		return snapshot.manualSlots.find((slot) => slot.metadata.id === slotId) ?? null;
	}

	async deleteManualSlot(slotId: string): Promise<void> {
		const snapshot = await this.driver.read();
		await this.driver.write({
			...snapshot,
			manualSlots: snapshot.manualSlots.filter((slot) => slot.metadata.id !== slotId)
		});
	}
}

function sortSlots(slots: SaveRecord[]): SaveRecord[] {
	return [...slots].sort((left, right) =>
		right.metadata.updatedAt.localeCompare(left.metadata.updatedAt)
	);
}
```

- [ ] **Step 7: Add browser repository**

Create `src/lib/persistence/browserSaveRepository.ts`:

```ts
import {
	createEmptySaveStore,
	parseSaveStoreSnapshot,
	validateSaveStoreSnapshot
} from './saveCodec';
import type { SaveRepository } from './saveRepository';
import { SaveRepositoryFromDriver, type SaveStoreDriver } from './saveStoreRepository';
import type { SaveStoreSnapshot } from './saveTypes';

export const BROWSER_SAVE_STORAGE_KEY = 'serpens.saves.v1';

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

class BrowserSaveStoreDriver implements SaveStoreDriver {
	constructor(private readonly storage: StorageLike) {}

	async read(): Promise<SaveStoreSnapshot> {
		const serialized = this.storage.getItem(BROWSER_SAVE_STORAGE_KEY);
		return serialized ? parseSaveStoreSnapshot(serialized) : createEmptySaveStore();
	}

	async write(snapshot: SaveStoreSnapshot): Promise<void> {
		const cleanSnapshot = validateSaveStoreSnapshot(snapshot);
		this.storage.setItem(BROWSER_SAVE_STORAGE_KEY, JSON.stringify(cleanSnapshot));
	}
}

export function createBrowserSaveRepository(
	storage: StorageLike = globalThis.localStorage,
	now: () => Date = () => new Date()
): SaveRepository {
	return new SaveRepositoryFromDriver(new BrowserSaveStoreDriver(storage), now);
}
```

- [ ] **Step 8: Run persistence tests**

Run:

```bash
bun run test:unit -- --run src/lib/persistence/saveRepository.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit persistence core**

Run:

```bash
git add src/lib/persistence/saveTypes.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveRepository.ts src/lib/persistence/saveStoreRepository.ts src/lib/persistence/browserSaveRepository.ts src/lib/persistence/saveRepository.spec.ts
git commit -m "feat: add desktop save repository core"
```

## Task 3: Tauri Store Repository

**Files:**

- Create: `src/lib/persistence/tauriSaveRepository.ts`
- Create: `src/lib/persistence/tauriSaveRepository.spec.ts`
- Create: `src/lib/persistence/saveRepositoryFactory.ts`

- [ ] **Step 1: Write Tauri repository tests**

Create `src/lib/persistence/tauriSaveRepository.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import type { GameState } from '$lib/game/types';
import {
	createTauriSaveRepositoryFromStore,
	SAVE_STORE_KEY,
	type StoreLike
} from './tauriSaveRepository';

class FakeStore implements StoreLike {
	readonly values = new Map<string, unknown>();
	saveCount = 0;

	async get<T>(key: string): Promise<T | null> {
		return (this.values.get(key) as T | undefined) ?? null;
	}

	async set(key: string, value: unknown): Promise<void> {
		this.values.set(key, value);
	}

	async save(): Promise<void> {
		this.saveCount += 1;
	}
}

function createGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 20260505,
		rngState: 99,
		day: 2,
		cash: 11000,
		debt: 1000,
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		cities: [{ id: 'harbor-city', name: 'Harbor City', width: 1, height: 1, tiles: [] }],
		activeCityId: 'harbor-city',
		stores: [],
		decisions: [],
		reports: [],
		...overrides
	};
}

describe('Tauri save repository', () => {
	test('persists save snapshot through the Tauri store key', async () => {
		expect.assertions(5);
		const store = new FakeStore();
		const repository = createTauriSaveRepositoryFromStore(
			Promise.resolve(store),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		await repository.saveAuto(createGame({ day: 6 }));
		const slot = await repository.createManualSlot('Desktop Run', createGame({ day: 7 }));
		const summary = await repository.getSummary();

		expect(store.saveCount).toBe(2);
		expect(store.values.has(SAVE_STORE_KEY)).toBe(true);
		expect(summary.autoSave?.day).toBe(6);
		expect(summary.manualSlots[0]?.id).toBe(slot.id);
		expect((await repository.loadManualSlot(slot.id))?.game.day).toBe(7);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun run test:unit -- --run src/lib/persistence/tauriSaveRepository.spec.ts
```

Expected: FAIL because `tauriSaveRepository.ts` does not exist.

- [ ] **Step 3: Add Tauri repository**

Create `src/lib/persistence/tauriSaveRepository.ts`:

```ts
import { load } from '@tauri-apps/plugin-store';
import { createEmptySaveStore, validateSaveStoreSnapshot } from './saveCodec';
import type { SaveRepository } from './saveRepository';
import { SaveRepositoryFromDriver, type SaveStoreDriver } from './saveStoreRepository';
import type { SaveStoreSnapshot } from './saveTypes';

export const SAVE_STORE_FILE = 'serpens-saves.json';
export const SAVE_STORE_KEY = 'saves';

export interface StoreLike {
	get<T>(key: string): Promise<T | null>;
	set(key: string, value: unknown): Promise<void>;
	save(): Promise<void>;
}

class TauriSaveStoreDriver implements SaveStoreDriver {
	constructor(private readonly storePromise: Promise<StoreLike>) {}

	async read(): Promise<SaveStoreSnapshot> {
		const store = await this.storePromise;
		const snapshot = await store.get<unknown>(SAVE_STORE_KEY);
		return snapshot ? validateSaveStoreSnapshot(snapshot) : createEmptySaveStore();
	}

	async write(snapshot: SaveStoreSnapshot): Promise<void> {
		const store = await this.storePromise;
		await store.set(SAVE_STORE_KEY, validateSaveStoreSnapshot(snapshot));
		await store.save();
	}
}

export function createTauriSaveRepository(now: () => Date = () => new Date()): SaveRepository {
	return createTauriSaveRepositoryFromStore(load(SAVE_STORE_FILE, { autoSave: false }), now);
}

export function createTauriSaveRepositoryFromStore(
	storePromise: Promise<StoreLike>,
	now: () => Date = () => new Date()
): SaveRepository {
	return new SaveRepositoryFromDriver(new TauriSaveStoreDriver(storePromise), now);
}
```

- [ ] **Step 4: Add runtime repository factory**

Create `src/lib/persistence/saveRepositoryFactory.ts`:

```ts
import { browser } from '$app/environment';
import { createBrowserSaveRepository } from './browserSaveRepository';
import type { SaveRepository } from './saveRepository';

type TauriRuntimeWindow = Window & {
	__TAURI_INTERNALS__?: unknown;
};

export async function createSaveRepository(): Promise<SaveRepository> {
	if (browser && isTauriRuntime()) {
		const { createTauriSaveRepository } = await import('./tauriSaveRepository');
		return createTauriSaveRepository();
	}

	return createBrowserSaveRepository();
}

function isTauriRuntime(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as TauriRuntimeWindow);
}
```

- [ ] **Step 5: Run persistence tests**

Run:

```bash
bun run test:unit -- --run src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Tauri repository**

Run:

```bash
git add src/lib/persistence/tauriSaveRepository.ts src/lib/persistence/tauriSaveRepository.spec.ts src/lib/persistence/saveRepositoryFactory.ts
git commit -m "feat: add Tauri save repository"
```

## Task 4: Minimal Tauri Shell

**Files:**

- Create: `src-tauri/.gitignore`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Create Rust package manifest**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "serpens"
version = "0.0.1"
description = "Serpens retail simulation desktop app"
authors = ["Serpens"]
edition = "2021"
rust-version = "1.77.2"

[lib]
name = "serpens_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }
tauri-plugin-store = "2"
```

- [ ] **Step 2: Create Tauri build script**

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build();
}
```

- [ ] **Step 3: Create Tauri Rust entrypoints**

Create `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    serpens_lib::run();
}
```

Create `src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Add Tauri config**

Create `src-tauri/tauri.conf.json`:

```json
{
	"$schema": "https://schema.tauri.app/config/2",
	"productName": "Serpens",
	"version": "0.0.1",
	"identifier": "com.serpens.game",
	"build": {
		"beforeDevCommand": "bun run dev",
		"beforeBuildCommand": "bun run build",
		"devUrl": "http://localhost:5173",
		"frontendDist": "../build"
	},
	"app": {
		"windows": [
			{
				"title": "Serpens",
				"width": 1280,
				"height": 820,
				"minWidth": 960,
				"minHeight": 640
			}
		],
		"security": {
			"csp": null
		}
	},
	"bundle": {
		"active": true,
		"targets": "all"
	}
}
```

- [ ] **Step 5: Add Tauri capability**

Create `src-tauri/capabilities/default.json`:

```json
{
	"$schema": "../gen/schemas/desktop-schema.json",
	"identifier": "default",
	"description": "Default Serpens desktop capability",
	"windows": ["main"],
	"permissions": ["core:default", "store:default"]
}
```

- [ ] **Step 6: Ignore Rust build output**

Create `src-tauri/.gitignore`:

```gitignore
/target
```

- [ ] **Step 7: Check Rust shell wiring**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS. If Rust dependencies need to be downloaded and the sandbox blocks network access, rerun the same command with escalation and record the exact result in the final implementation report.

- [ ] **Step 8: Commit Tauri shell**

Run:

```bash
git add src-tauri/.gitignore src-tauri/Cargo.toml src-tauri/build.rs src-tauri/src/main.rs src-tauri/src/lib.rs src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat: add Tauri desktop shell"
```

## Task 5: Save Panel Component

**Files:**

- Create: `src/lib/components/game/SavePanel.svelte`
- Create: `src/lib/components/game/SavePanel.svelte.spec.ts`

- [ ] **Step 1: Write save panel component tests**

Create `src/lib/components/game/SavePanel.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SavePanel from './SavePanel.svelte';
import type { GameState } from '$lib/game/types';
import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';

const game = { day: 5 } as GameState;

const autoSave: SaveSlotMetadata = {
	id: 'autosave',
	name: 'Auto-save',
	kind: 'auto',
	updatedAt: '2026-05-05T12:00:00.000Z',
	day: 5,
	cash: 12500,
	storeCount: 1,
	activeCityName: 'Harbor City'
};

const manualSlot: SaveSlotMetadata = {
	id: 'manual-harbor-run-1777982400000',
	name: 'Harbor Run',
	kind: 'manual',
	updatedAt: '2026-05-05T12:00:00.000Z',
	day: 5,
	cash: 12500,
	storeCount: 1,
	activeCityName: 'Harbor City'
};

function renderPanel(
	overrides: Partial<{
		activeGame: GameState | null;
		autoSave: SaveSlotMetadata | null;
		slots: SaveSlotMetadata[];
		status: string;
		error: string | null;
		onResumeAutoSave: () => void;
		onSaveSlot: (name: string, slotId?: string) => void;
		onLoadSlot: (slotId: string) => void;
		onDeleteSlot: (slotId: string) => void;
		onClose: () => void;
	}> = {}
) {
	const props = {
		activeGame: game,
		autoSave,
		slots: [manualSlot],
		status: '',
		error: null,
		onResumeAutoSave: vi.fn(),
		onSaveSlot: vi.fn(),
		onLoadSlot: vi.fn(),
		onDeleteSlot: vi.fn(),
		onClose: vi.fn(),
		...overrides
	};

	render(SavePanel, props);

	return props;
}

describe('SavePanel', () => {
	it('shows auto-save and manual slots', async () => {
		expect.assertions(4);

		renderPanel();

		await expect.element(page.getByRole('dialog', { name: 'Saves' })).toBeVisible();
		await expect.element(page.getByText('Day 5 · 1 stores')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Harbor Run' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Resume' })).toBeEnabled();
	});

	it('dispatches save actions', async () => {
		expect.assertions(3);
		const props = renderPanel();

		await page.getByRole('textbox', { name: 'Slot name' }).fill('Evening Run');
		await page.getByRole('button', { name: 'Save slot' }).click();
		await page.getByRole('button', { name: 'Overwrite' }).click();

		expect(props.onSaveSlot).toHaveBeenNthCalledWith(1, 'Evening Run');
		expect(props.onSaveSlot).toHaveBeenNthCalledWith(2, 'Harbor Run', manualSlot.id);
		expect(page.getByRole('textbox', { name: 'Slot name' })).toHaveValue('');
	});

	it('dispatches load, delete, resume, and close actions', async () => {
		expect.assertions(4);
		const props = renderPanel();

		await page.getByRole('button', { name: 'Resume' }).click();
		await page.getByRole('button', { name: 'Load' }).click();
		await page.getByRole('button', { name: 'Delete' }).click();
		await page.getByRole('button', { name: 'Close saves' }).click();

		expect(props.onResumeAutoSave).toHaveBeenCalledOnce();
		expect(props.onLoadSlot).toHaveBeenCalledWith(manualSlot.id);
		expect(props.onDeleteSlot).toHaveBeenCalledWith(manualSlot.id);
		expect(props.onClose).toHaveBeenCalledOnce();
	});

	it('disables save controls without an active game', async () => {
		expect.assertions(2);

		renderPanel({ activeGame: null, autoSave: null, slots: [] });

		await expect.element(page.getByRole('button', { name: 'Resume' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Save slot' })).toBeDisabled();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/SavePanel.svelte.spec.ts
```

Expected: FAIL because `SavePanel.svelte` does not exist.

- [ ] **Step 3: Add save panel component**

Create `src/lib/components/game/SavePanel.svelte`. This component code was checked with `svelte-autofixer` during plan creation and returned no issues:

```svelte
<script lang="ts">
	import type { GameState } from '$lib/game/types';
	import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';

	interface Props {
		activeGame: GameState | null;
		autoSave: SaveSlotMetadata | null;
		slots: SaveSlotMetadata[];
		status: string;
		error: string | null;
		onResumeAutoSave: () => void | Promise<void>;
		onSaveSlot: (name: string, slotId?: string) => void | Promise<void>;
		onLoadSlot: (slotId: string) => void | Promise<void>;
		onDeleteSlot: (slotId: string) => void | Promise<void>;
		onClose: () => void;
	}

	let {
		activeGame,
		autoSave,
		slots,
		status,
		error,
		onResumeAutoSave,
		onSaveSlot,
		onLoadSlot,
		onDeleteSlot,
		onClose
	}: Props = $props();

	let slotName = $state('');
	const canSaveNewSlot = $derived(Boolean(activeGame && slotName.trim().length > 0));

	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	function formatUpdatedAt(value: string): string {
		const date = new Date(value);

		if (Number.isNaN(date.getTime())) {
			return value;
		}

		return dateFormatter.format(date);
	}

	function saveNewSlot(): void {
		const name = slotName.trim();

		if (!activeGame || name.length === 0) {
			return;
		}

		void onSaveSlot(name);
		slotName = '';
	}
</script>

<div class="save-backdrop">
	<button type="button" class="save-backdrop-button" aria-label="Close saves" onclick={onClose}
	></button>
	<div class="save-panel" role="dialog" aria-modal="true" aria-label="Saves">
		<header>
			<div>
				<p class="eyebrow">Saves</p>
				<h2>Desktop Saves</h2>
			</div>
			<button type="button" class="close" aria-label="Close saves" onclick={onClose}>Close</button>
		</header>

		<section class="auto-save" aria-label="Auto-save">
			<div>
				<h3>Auto-save</h3>
				{#if autoSave}
					<p>
						Day {autoSave.day} · {autoSave.storeCount} stores · {formatUpdatedAt(
							autoSave.updatedAt
						)}
					</p>
				{:else}
					<p>No auto-save yet.</p>
				{/if}
			</div>
			<button type="button" disabled={!autoSave} onclick={() => void onResumeAutoSave()}
				>Resume</button
			>
		</section>

		<section aria-label="Create save slot">
			<h3>New slot</h3>
			<div class="new-slot">
				<label>
					<span>Slot name</span>
					<input bind:value={slotName} />
				</label>
				<button type="button" disabled={!canSaveNewSlot} onclick={saveNewSlot}>Save slot</button>
			</div>
		</section>

		<section aria-label="Manual save slots">
			<h3>Manual slots</h3>
			{#if slots.length > 0}
				<div class="slots">
					{#each slots as slot (slot.id)}
						<article>
							<div>
								<h4>{slot.name}</h4>
								<p>Day {slot.day} · {slot.storeCount} stores · {formatUpdatedAt(slot.updatedAt)}</p>
							</div>
							<div class="slot-actions">
								<button type="button" onclick={() => void onLoadSlot(slot.id)}>Load</button>
								<button
									type="button"
									disabled={!activeGame}
									onclick={() => void onSaveSlot(slot.name, slot.id)}
								>
									Overwrite
								</button>
								<button type="button" onclick={() => void onDeleteSlot(slot.id)}>Delete</button>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<p class="empty">No manual slots yet.</p>
			{/if}
		</section>

		{#if status}
			<p class="status" role="status">{status}</p>
		{/if}
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</div>
</div>

<style>
	.save-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(4 8 13 / 0.72);
	}

	.save-backdrop-button {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.save-panel {
		position: relative;
		z-index: 1;
		width: min(760px, 100%);
		max-height: calc(100vh - 2rem);
		overflow: auto;
		display: grid;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #0b111b;
		box-shadow: 0 24px 80px rgb(0 0 0 / 0.45);
	}

	header,
	.auto-save,
	article,
	.slot-actions,
	.new-slot {
		display: flex;
		gap: 0.75rem;
	}

	header,
	.auto-save,
	article {
		align-items: center;
		justify-content: space-between;
	}

	h2,
	h3,
	h4,
	p {
		margin: 0;
	}

	section,
	article {
		border: 1px solid #253244;
		border-radius: 8px;
		background: #111823;
		padding: 0.85rem;
	}

	section {
		display: grid;
		gap: 0.75rem;
	}

	.slots {
		display: grid;
		gap: 0.65rem;
	}

	.new-slot {
		align-items: end;
	}

	label {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
		flex: 1;
	}

	input,
	button {
		font: inherit;
	}

	input {
		width: 100%;
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #0f1724;
		color: #edf2f7;
		padding: 0.65rem 0.75rem;
	}

	button {
		border: 1px solid #31445c;
		border-radius: 8px;
		background: #151f2d;
		color: #edf2f7;
		padding: 0.65rem 0.85rem;
		white-space: nowrap;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		border-color: #5f8fd0;
		background: #1b2a3d;
	}

	.eyebrow {
		color: #f0bd68;
		font-size: 0.76rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.status {
		color: #a7d8b8;
	}

	.error {
		color: #f4a6a6;
	}

	.empty,
	section p,
	article p,
	label span {
		color: #a7b4c8;
	}

	@media (max-width: 700px) {
		header,
		.auto-save,
		article,
		.slot-actions,
		.new-slot {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
```

- [ ] **Step 4: Run Svelte autofixer**

Run the Svelte MCP `svelte-autofixer` on `SavePanel.svelte`.

Expected: no issues and no suggestions. If it reports issues, apply the reported changes and rerun until clean.

- [ ] **Step 5: Run save panel tests**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/SavePanel.svelte.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit save panel**

Run:

```bash
git add src/lib/components/game/SavePanel.svelte src/lib/components/game/SavePanel.svelte.spec.ts
git commit -m "feat: add save slot panel"
```

## Task 6: Route Save Integration and E2E Coverage

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Add failing e2e coverage**

Append this test to `src/routes/retail-sim.e2e.ts`:

```ts
test('player can save to a manual slot and load it after reload', async ({ page }) => {
	await page.goto('/');

	await clickMapTile(page, 1, 1);
	await chooseStoreType(page, /open .* here/i);
	await page.getByRole('button', { name: /saves/i }).click();
	await expect(page.getByRole('dialog', { name: /saves/i })).toBeVisible();
	await expect(page.getByText(/Day 1 · 1 stores/i)).toBeVisible();

	await page.getByRole('textbox', { name: /slot name/i }).fill('Harbor test');
	await page.getByRole('button', { name: /save slot/i }).click();
	await expect(page.getByText(/Saved Harbor test/i)).toBeVisible();
	await page.getByRole('button', { name: /close saves/i }).click();

	await page.reload();
	await page.getByRole('button', { name: /saves/i }).click();
	await expect(page.getByRole('heading', { name: /Harbor test/i })).toBeVisible();
	await page.getByRole('button', { name: /^Load$/i }).click();
	await expect(page.locator('.map-canvas canvas')).toHaveAttribute('data-store-sprite-count', '1');
	await expect(page.getByText(/Loaded Harbor test/i)).toBeVisible();
});
```

- [ ] **Step 2: Run e2e to verify it fails**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: FAIL because the `Saves` button and save dialog do not exist.

- [ ] **Step 3: Add route imports and save state**

In `src/routes/+page.svelte`, add these imports:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import SavePanel from '$lib/components/game/SavePanel.svelte';
	import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
	import type { SaveRepository } from '$lib/persistence/saveRepository';
	import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';
</script>
```

Merge them with the existing `<script>` imports instead of creating a second `<script>`.

Add these state declarations after the existing menu state:

```ts
let saveRepository: SaveRepository | null = $state(null);
let autoSave = $state<SaveSlotMetadata | null>(null);
let manualSaveSlots = $state<SaveSlotMetadata[]>([]);
let isSavePanelOpen = $state(false);
let saveStatus = $state('');
let saveError = $state<string | null>(null);
```

- [ ] **Step 4: Add save initialization helpers**

Add these functions inside `src/routes/+page.svelte`:

```ts
onMount(() => {
	void initializeSaves();
});

async function initializeSaves(): Promise<void> {
	try {
		saveRepository = await createSaveRepository();
		await refreshSaveSummary();
	} catch (error) {
		saveError = describeSaveError(error);
	}
}

async function refreshSaveSummary(): Promise<void> {
	if (!saveRepository) {
		return;
	}

	const summary = await saveRepository.getSummary();
	autoSave = summary.autoSave;
	manualSaveSlots = summary.manualSlots;
}

function openSavePanel(): void {
	isViewMenuOpen = false;
	isSavePanelOpen = true;
	saveStatus = '';
	saveError = null;
	void refreshSaveSummary().catch((error) => {
		saveError = describeSaveError(error);
	});
}

function closeSavePanel(): void {
	isSavePanelOpen = false;
}

function describeSaveError(error: unknown): string {
	return error instanceof Error ? error.message : 'Save operation failed';
}
```

- [ ] **Step 5: Add save action helpers**

Add these functions inside `src/routes/+page.svelte`:

```ts
function setGameAndAutosave(nextGame: GameState): void {
	game = nextGame;
	void writeAutoSave(nextGame);
}

async function writeAutoSave(nextGame: GameState): Promise<void> {
	if (!saveRepository) {
		return;
	}

	try {
		const metadata = await saveRepository.saveAuto(nextGame);
		autoSave = metadata;
		saveStatus = `Auto-saved day ${metadata.day}`;
		saveError = null;
	} catch (error) {
		saveError = describeSaveError(error);
	}
}

async function resumeAutoSave(): Promise<void> {
	if (!saveRepository) {
		return;
	}

	try {
		const record = await saveRepository.getAutoSave();

		if (!record) {
			saveStatus = 'No auto-save found';
			return;
		}

		game = record.game;
		selectedTileId = null;
		saveStatus = 'Loaded auto-save';
		saveError = null;
		await refreshSaveSummary();
	} catch (error) {
		saveError = describeSaveError(error);
	}
}

async function saveManualSlot(name: string, slotId?: string): Promise<void> {
	if (!saveRepository || !game) {
		return;
	}

	try {
		const metadata = slotId
			? await saveRepository.overwriteManualSlot(slotId, name, game)
			: await saveRepository.createManualSlot(name, game);
		saveStatus = `Saved ${metadata.name}`;
		saveError = null;
		await refreshSaveSummary();
	} catch (error) {
		saveError = describeSaveError(error);
	}
}

async function loadManualSlot(slotId: string): Promise<void> {
	if (!saveRepository) {
		return;
	}

	try {
		const record = await saveRepository.loadManualSlot(slotId);

		if (!record) {
			saveStatus = 'Manual save slot not found';
			return;
		}

		game = record.game;
		selectedTileId = null;
		saveStatus = `Loaded ${record.metadata.name}`;
		saveError = null;
		await refreshSaveSummary();
	} catch (error) {
		saveError = describeSaveError(error);
	}
}

async function deleteManualSlot(slotId: string): Promise<void> {
	if (!saveRepository) {
		return;
	}

	try {
		await saveRepository.deleteManualSlot(slotId);
		saveStatus = 'Deleted save slot';
		saveError = null;
		await refreshSaveSummary();
	} catch (error) {
		saveError = describeSaveError(error);
	}
}
```

- [ ] **Step 6: Route game mutations through autosave helper**

In `src/routes/+page.svelte`, replace game assignments in these functions:

```ts
function foundStore(archetypeId: ArchetypeId) {
	if (!selectedTileId || !selectedTile || selectedTile.locked) {
		return;
	}

	setGameAndAutosave(
		createFoundingGameAtTile({
			archetypeId,
			city: starterCity,
			tileId: selectedTileId,
			seed: 20260503
		})
	);
}

function advanceDay() {
	if (game) {
		setGameAndAutosave(simulateDay(game));
	}
}

function changePolicy(patch: Partial<CompanyPolicy>) {
	if (game) {
		setGameAndAutosave(updatePolicy(game, patch));
	}
}

function chooseDecision(decisionId: string, optionId: string) {
	if (game) {
		setGameAndAutosave(resolveDecision(game, decisionId, optionId));
	}
}

function addStoreAtSelectedTile(archetypeId: ArchetypeId) {
	if (!game || !selectedTileId) {
		return;
	}

	const next = game.stores.length + 1;
	setGameAndAutosave(
		openStoreAtTile(game, {
			tileId: selectedTileId,
			name: `Store #${next}`,
			archetypeId
		})
	);
}
```

- [ ] **Step 7: Add Saves button and panel markup**

In the route header, add a `Saves` button to both started and not-started states.

Inside the `{#if game}` top actions, place this button before `Views`:

```svelte
<button type="button" onclick={openSavePanel}>Saves</button>
```

In the `{:else}` branch, replace the single status paragraph with:

```svelte
<div class="top-actions">
	<button type="button" onclick={openSavePanel}>Saves</button>
	<p class="status">Select an unlocked tile to found your first store.</p>
</div>
```

Before the closing `</main>`, add:

```svelte
{#if isSavePanelOpen}
	<SavePanel
		activeGame={game}
		{autoSave}
		slots={manualSaveSlots}
		status={saveStatus}
		error={saveError}
		onResumeAutoSave={resumeAutoSave}
		onSaveSlot={saveManualSlot}
		onLoadSlot={loadManualSlot}
		onDeleteSlot={deleteManualSlot}
		onClose={closeSavePanel}
	/>
{/if}
```

- [ ] **Step 8: Include save panel in Escape handling**

Update the first branch in `handleKeydown`:

```ts
if (isSavePanelOpen) {
	isSavePanelOpen = false;
	isViewMenuOpen = false;
	return;
}
```

This branch must run before the Control Tower branch.

- [ ] **Step 9: Run Svelte autofixer on the modified route**

Run the Svelte MCP `svelte-autofixer` on the full updated `src/routes/+page.svelte` content.

Expected: no issues and no suggestions. If it reports issues, apply the reported changes and rerun until clean.

- [ ] **Step 10: Run route and save e2e tests**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/SavePanel.svelte.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 11: Commit route integration**

Run:

```bash
git add src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat: wire save slots into game route"
```

## Task 7: Final Verification

**Files:**

- No planned code changes.

- [ ] **Step 1: Run full Svelte and TypeScript checks**

Run:

```bash
bun run check
```

Expected: PASS with 0 errors and 0 warnings.

- [ ] **Step 2: Run full unit tests**

Run:

```bash
bun run test:unit -- --run
```

Expected: PASS.

- [ ] **Step 3: Run full e2e tests**

Run:

```bash
bun run test:e2e
```

Expected: PASS.

- [ ] **Step 4: Run static production build**

Run:

```bash
bun run build
```

Expected: PASS and `build/index.html` exists. The output must not include the old adapter-auto environment warning.

- [ ] **Step 5: Run Tauri Rust check**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 6: Run Tauri desktop build smoke test**

Run:

```bash
bun run tauri:build
```

Expected: PASS if local Rust and platform prerequisites are installed. If the machine lacks Tauri prerequisites, capture the exact missing tool or compiler error and report it as a verification blocker.

- [ ] **Step 7: Inspect git state**

Run:

```bash
git status --short
```

Expected: only intentional changes are present. The pre-existing `.gitignore` edit may remain unstaged if it is still unrelated to this migration.
