import { browser } from '$app/environment';
import { isTauri } from '@tauri-apps/api/core';
import { createBrowserScenarioRepository } from './browserScenarioRepository';
import type { ScenarioRepository } from './scenarioRepository';

type TauriRuntimeWindow = Window & {
	__TAURI_INTERNALS__?: unknown;
};

export async function createScenarioRepository(): Promise<ScenarioRepository> {
	if (browser && isTauriRuntime()) {
		const { createTauriScenarioRepository } = await import('./tauriScenarioRepository');
		return createTauriScenarioRepository();
	}

	return createBrowserScenarioRepository();
}

function isTauriRuntime(): boolean {
	return (
		isTauri() ||
		(typeof window !== 'undefined' && (window as TauriRuntimeWindow).__TAURI_INTERNALS__ != null)
	);
}
