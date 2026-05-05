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
