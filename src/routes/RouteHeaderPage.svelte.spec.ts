import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_AUDIO_PREFERENCES } from '$lib/audio/audioPreferences';
import { createBrowserSaveRepository } from '$lib/persistence/browserSaveRepository';
import { createSaveRepository } from '$lib/persistence/saveRepositoryFactory';
import RetailSimulationPage from './+page.svelte';

// Production-connected coverage for the root-owned header overlay flags: the
// real route is mounted (not the header harness) so the bound `gameMenuOpen` /
// `alertsMenuOpen` flags only count through what the page actually consumes —
// overlaySnapshot, the map/simulation gates and the keyboard adapter. The
// RouteHeader harness spec keeps the live-input/snippet/audio coverage.

vi.mock('$lib/persistence/saveRepositoryFactory', () => ({ createSaveRepository: vi.fn() }));
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

/** Mounts the real route and settles the starter-city canvas first. */
async function mountRoute() {
	vi.mocked(createSaveRepository).mockResolvedValue(repository());
	await page.viewport(1280, 800);
	const view = render(RetailSimulationPage);
	await expect
		.poll(() => document.querySelector('canvas')?.getAttribute('data-map-paused'))
		.toBe('false');
	return view;
}

const menuTrigger = () => page.getByTestId('game-menu-trigger');
const menuDialog = () => page.getByRole('dialog', { name: 'Menu' });
const simulationBlocked = () =>
	document.querySelector('main')!.getAttribute('data-simulation-blocked');
const mapPaused = () => document.querySelector('canvas')!.getAttribute('data-map-paused');

it('menu actions hand focus to the modal and restore it to the trigger on dismissal', async () => {
	const view = await mountRoute();
	try {
		await menuTrigger().click();
		const menu = menuDialog();
		await expect.element(menu).toBeVisible();
		// Opening the popover traps focus inside it.
		expect((await menu.element())!.contains(document.activeElement)).toBe(true);

		// A management menu action unmounts the popover and opens the panel
		// modal, which must own focus (not leave it on <body> or the trigger).
		await menu.getByRole('button', { name: 'Staff', exact: true }).click();
		const panel = page.getByRole('dialog', { name: 'Staff' });
		await expect.element(panel).toBeVisible();
		await expect.element(menu).not.toBeInTheDocument();
		await vi.waitFor(async () =>
			expect((await panel.element())!.contains(document.activeElement)).toBe(true)
		);

		// Escape dismisses the modal and the focus chain restores focus to the
		// hamburger trigger that opened the menu.
		await userEvent.keyboard('[Escape]');
		await expect.element(panel).not.toBeInTheDocument();
		await vi.waitFor(async () =>
			expect(document.activeElement).toBe(await menuTrigger().element())
		);
	} finally {
		await view.unmount();
	}
});

it('bound menu/alerts flags drive the page gates with distinct map-pause policies and release on dismissal', async () => {
	const view = await mountRoute();
	try {
		// Hamburger open: a hard overlay — simulation blocked AND map paused.
		await menuTrigger().click();
		await expect.element(menuDialog()).toBeVisible();
		await expect.poll(simulationBlocked).toBe('true');
		await expect.poll(mapPaused).toBe('true');

		// The keyboard adapter reads the same snapshot: a hard overlay
		// suppresses every shortcut ('o' must not open the dashboard panel).
		await userEvent.keyboard('o');
		await new Promise((resolve) => setTimeout(resolve, 50));
		await expect.element(page.getByRole('dialog', { name: 'Dashboard' })).not.toBeInTheDocument();
		await expect.element(menuDialog()).toBeVisible();

		// Escape through the popover releases every gate.
		await userEvent.keyboard('[Escape]');
		await expect.element(menuDialog()).not.toBeInTheDocument();
		await expect.poll(simulationBlocked).toBe('false');
		await expect.poll(mapPaused).toBe('false');

		// Alerts popover: equally blocking for the simulation, but its distinct
		// policy keeps the map rendering.
		await page.getByRole('button', { name: /^alerts$/i }).click();
		await expect.element(page.getByRole('group', { name: /alerts list/i })).toBeVisible();
		await expect.poll(simulationBlocked).toBe('true');
		expect(mapPaused()).toBe('false');

		// Click-outside dismissal releases the gates again, and the keyboard
		// adapter routes shortcuts once more ('o' opens the dashboard panel).
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.element(page.getByRole('group', { name: /alerts list/i })).not.toBeInTheDocument();
		await expect.poll(simulationBlocked).toBe('false');
		await userEvent.keyboard('o');
		const dashboard = page.getByRole('dialog', { name: 'Dashboard' });
		await expect.element(dashboard).toBeVisible();
		await userEvent.keyboard('[Escape]');
		await expect.element(dashboard).not.toBeInTheDocument();
	} finally {
		await view.unmount();
	}
});
