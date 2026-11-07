import { flushSync } from 'svelte';
import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createBrowserSaveRepository } from '$lib/persistence/browserSaveRepository';
import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
import MapInspectorHost from './MapInspectorHost.svelte';
import ManagementPanelHost from './ManagementPanelHost.svelte';
import RetailSimulationPage from './+page.svelte';

vi.mock('$lib/persistence/saveRepositoryFactory', () => ({ createSaveRepository: vi.fn() }));
vi.mock('./saveUi.svelte', { spy: true });
vi.mock('./MapInspectorHost.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('./MapInspectorHost.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('./ManagementPanelHost.svelte', async (importOriginal) => {
	const original = await importOriginal<typeof import('./ManagementPanelHost.svelte')>();
	return { ...original, default: vi.fn(original.default) };
});
vi.mock('$lib/audio/audioController', () => ({
	createGameAudioController: () => ({
		unlock: async () => {},
		setActiveBgm: () => {},
		playSfx: async () => {},
		getPreferences: () => DEFAULT_AUDIO_PREFERENCES,
		updatePreferences: () => {},
		destroy: async () => {}
	})
}));
afterEach(() => vi.restoreAllMocks());

function repository() {
	const storage = new Map<string, string>();
	return createBrowserSaveRepository({
		getItem: (key) => storage.get(key) ?? null,
		setItem: (key, value) => void storage.set(key, value),
		removeItem: (key) => void storage.delete(key)
	});
}

function routePreset(): RecurringRouteInput {
	return {
		originCityId: 'breadbasket-basin',
		destinationCityId: 'industry-city',
		materialId: 'grain',
		capacity: 12,
		frequencyDays: 1,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 0
	};
}

/** The live management owner the page handed to its (mocked) panel host. */
function managementUi() {
	return vi.mocked(ManagementPanelHost).mock.calls.at(-1)![1].ui;
}

/** Seeds logistics handoff state through the real page wiring. */
function seedInspectorHandoff(handoff: { routeId: string } | RecurringRouteInput): void {
	const props = vi.mocked(MapInspectorHost).mock.calls.at(-1)![1];
	flushSync(() => {
		if ('routeId' in handoff) props.onManageLogisticsRoute!(handoff.routeId);
		else props.onAddIndustryRoute!(handoff);
	});
}

/** Hides management through Saves — the hide that keeps the focus atoms. */
async function hideThroughSaves(): Promise<void> {
	const { createSaveUi } = await import('./saveUi.svelte');
	const ui = vi.mocked(createSaveUi).mock.results.at(-1)!.value;
	flushSync(() => ui.open());
	flushSync(() => ui.close());
}

it('reopens logistics fresh from the hamburger, ControlDesk, and keyboard after a hide', async () => {
	expect.assertions(9);
	vi.mocked(createSaveRepository).mockResolvedValue(repository());
	await page.viewport(1280, 800);
	const view = render(RetailSimulationPage);
	try {
		// Hamburger: a planner preset must not survive the saves hide.
		seedInspectorHandoff(routePreset());
		expect(managementUi().logisticsRoutePreset).toEqual(routePreset());
		await hideThroughSaves();
		expect(managementUi().logisticsRoutePreset).toEqual(routePreset());
		await page.getByRole('button', { name: /^menu$/i }).click();
		await page
			.getByRole('dialog', { name: 'Menu' })
			.getByRole('button', { name: /logistics/i })
			.click();
		expect(managementUi().activePanelId).toBe('logistics');
		expect(managementUi().logisticsRoutePreset).toBeNull();

		// ControlDesk: a focused-route handoff must not survive the hide either.
		seedInspectorHandoff({ routeId: 'stale-route' });
		expect(managementUi().focusedLogisticsRouteId).toBe('stale-route');
		await hideThroughSaves();
		await page
			.getByRole('group', { name: /management/i })
			.getByRole('button', { name: /logistics/i })
			.click();
		expect(managementUi().focusedLogisticsRouteId).toBeNull();

		// Keyboard 'l': same fresh-open contract.
		seedInspectorHandoff({ routeId: 'stale-route' });
		await hideThroughSaves();
		await userEvent.keyboard('l');
		expect(managementUi().activePanelId).toBe('logistics');
		expect(managementUi().focusedLogisticsRouteId).toBeNull();
		expect(managementUi().logisticsRoutePreset).toBeNull();
	} finally {
		await view.unmount();
	}
});
