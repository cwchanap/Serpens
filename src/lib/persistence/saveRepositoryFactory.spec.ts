import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest';

let mockBrowser = false;
let mockIsTauri = false;

vi.mock('$app/environment', () => ({
	get browser() {
		return mockBrowser;
	}
}));

vi.mock('@tauri-apps/api/core', () => ({
	isTauri: () => mockIsTauri
}));

vi.mock('./tauriSaveRepository', () => ({
	createTauriSaveRepository: vi.fn()
}));

vi.mock('./browserSaveRepository', () => ({
	createBrowserSaveRepository: vi.fn()
}));

import { createSaveRepository } from './saveRepositoryFactory';
import { createBrowserSaveRepository } from './browserSaveRepository';
import { createTauriSaveRepository } from './tauriSaveRepository';

describe('saveRepositoryFactory', () => {
	beforeEach(() => {
		mockBrowser = false;
		mockIsTauri = false;
		vi.clearAllMocks();
	});

	test('returns browser repository when not in browser environment', async () => {
		expect.assertions(2);
		mockBrowser = false;
		mockIsTauri = false;
		const fakeRepo = { kind: 'browser' } as unknown as ReturnType<
			typeof createBrowserSaveRepository
		>;
		(createBrowserSaveRepository as Mock).mockReturnValue(fakeRepo);

		const repo = await createSaveRepository();

		expect(repo).toBe(fakeRepo);
		expect(createBrowserSaveRepository).toHaveBeenCalledTimes(1);
	});

	test('returns browser repository when in browser but not Tauri', async () => {
		expect.assertions(2);
		mockBrowser = true;
		mockIsTauri = false;
		const fakeRepo = { kind: 'browser' } as unknown as ReturnType<
			typeof createBrowserSaveRepository
		>;
		(createBrowserSaveRepository as Mock).mockReturnValue(fakeRepo);

		const repo = await createSaveRepository();

		expect(repo).toBe(fakeRepo);
		expect(createBrowserSaveRepository).toHaveBeenCalledTimes(1);
	});

	test('returns tauri repository when in browser and Tauri runtime', async () => {
		expect.assertions(2);
		mockBrowser = true;
		mockIsTauri = true;
		const fakeRepo = { kind: 'tauri' } as unknown as ReturnType<typeof createTauriSaveRepository>;
		(createTauriSaveRepository as Mock).mockReturnValue(fakeRepo);

		const repo = await createSaveRepository();

		expect(repo).toBe(fakeRepo);
		expect(createTauriSaveRepository).toHaveBeenCalledTimes(1);
	});

	test('returns tauri repository when __TAURI_INTERNALS__ is present', async () => {
		expect.assertions(2);
		mockBrowser = true;
		mockIsTauri = false;
		const originalWindow = globalThis.window;
		const fakeRepo = { kind: 'tauri' } as unknown as ReturnType<typeof createTauriSaveRepository>;
		(createTauriSaveRepository as Mock).mockReturnValue(fakeRepo);

		try {
			(globalThis as Record<string, unknown>).window = { __TAURI_INTERNALS__: {} };

			const repo = await createSaveRepository();

			expect(repo).toBe(fakeRepo);
			expect(createTauriSaveRepository).toHaveBeenCalledTimes(1);
		} finally {
			if (originalWindow === undefined) {
				delete (globalThis as Record<string, unknown>).window;
			} else {
				(globalThis as Record<string, unknown>).window = originalWindow;
			}
		}
	});
});
