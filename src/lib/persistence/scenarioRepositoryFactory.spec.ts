import { beforeEach, describe, expect, it, vi } from 'vitest';

const factoryMocks = vi.hoisted(() => ({
	browser: false,
	isTauri: false,
	tauriModuleLoaded: false,
	createBrowserScenarioRepository: vi.fn(),
	createTauriScenarioRepository: vi.fn()
}));

vi.mock('$app/environment', () => ({
	get browser() {
		return factoryMocks.browser;
	}
}));

vi.mock('@tauri-apps/api/core', () => ({
	isTauri: () => factoryMocks.isTauri
}));

vi.mock('./browserScenarioRepository', () => ({
	createBrowserScenarioRepository: factoryMocks.createBrowserScenarioRepository
}));

vi.mock('./tauriScenarioRepository', () => {
	factoryMocks.tauriModuleLoaded = true;
	return {
		createTauriScenarioRepository: factoryMocks.createTauriScenarioRepository
	};
});

async function importFactory() {
	return import('./scenarioRepositoryFactory');
}

describe('scenarioRepositoryFactory', () => {
	beforeEach(() => {
		vi.resetModules();
		factoryMocks.browser = false;
		factoryMocks.isTauri = false;
		factoryMocks.tauriModuleLoaded = false;
		factoryMocks.createBrowserScenarioRepository.mockReset();
		factoryMocks.createTauriScenarioRepository.mockReset();
	});

	it('uses the browser repository by default without loading the Tauri repository module', async () => {
		const fakeRepository = { kind: 'browser' };
		factoryMocks.createBrowserScenarioRepository.mockReturnValue(fakeRepository);
		const { createScenarioRepository } = await importFactory();

		const repository = await createScenarioRepository();

		expect(repository).toBe(fakeRepository);
		expect(factoryMocks.createBrowserScenarioRepository).toHaveBeenCalledTimes(1);
		expect(factoryMocks.createTauriScenarioRepository).not.toHaveBeenCalled();
		expect(factoryMocks.tauriModuleLoaded).toBe(false);
	});

	it('uses the browser repository in a browser outside Tauri', async () => {
		factoryMocks.browser = true;
		const fakeRepository = { kind: 'browser' };
		factoryMocks.createBrowserScenarioRepository.mockReturnValue(fakeRepository);
		const { createScenarioRepository } = await importFactory();

		const repository = await createScenarioRepository();

		expect(repository).toBe(fakeRepository);
		expect(factoryMocks.createBrowserScenarioRepository).toHaveBeenCalledTimes(1);
		expect(factoryMocks.tauriModuleLoaded).toBe(false);
	});

	it('dynamically loads the Tauri repository only when Tauri is detected', async () => {
		factoryMocks.browser = true;
		factoryMocks.isTauri = true;
		const fakeRepository = { kind: 'tauri' };
		factoryMocks.createTauriScenarioRepository.mockReturnValue(fakeRepository);
		const { createScenarioRepository } = await importFactory();

		expect(factoryMocks.tauriModuleLoaded).toBe(false);

		const repository = await createScenarioRepository();

		expect(repository).toBe(fakeRepository);
		expect(factoryMocks.tauriModuleLoaded).toBe(true);
		expect(factoryMocks.createTauriScenarioRepository).toHaveBeenCalledTimes(1);
		expect(factoryMocks.createBrowserScenarioRepository).not.toHaveBeenCalled();
	});

	it('detects Tauri through __TAURI_INTERNALS__', async () => {
		factoryMocks.browser = true;
		const originalWindow = globalThis.window;
		const fakeRepository = { kind: 'tauri' };
		factoryMocks.createTauriScenarioRepository.mockReturnValue(fakeRepository);

		try {
			(globalThis as Record<string, unknown>).window = { __TAURI_INTERNALS__: {} };
			const { createScenarioRepository } = await importFactory();

			const repository = await createScenarioRepository();

			expect(repository).toBe(fakeRepository);
			expect(factoryMocks.createTauriScenarioRepository).toHaveBeenCalledTimes(1);
		} finally {
			if (originalWindow === undefined) {
				delete (globalThis as Record<string, unknown>).window;
			} else {
				(globalThis as Record<string, unknown>).window = originalWindow;
			}
		}
	});
});
