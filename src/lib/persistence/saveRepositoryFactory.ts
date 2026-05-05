import { browser } from '$app/environment';
import { isTauri } from '@tauri-apps/api/core';
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
	return (
		isTauri() ||
		(typeof window !== 'undefined' && (window as TauriRuntimeWindow).__TAURI_INTERNALS__ != null)
	);
}
