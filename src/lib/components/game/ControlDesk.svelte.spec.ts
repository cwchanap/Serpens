import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
import ControlDesk from './ControlDesk.svelte';

const managementItems: { id: ManagementPanelId; label: string; shortcut: string }[] = [
	{ id: 'dashboard', label: 'Dashboard', shortcut: 'D' },
	{ id: 'policies', label: 'Policies', shortcut: 'P' }
];

function baseProps() {
	return {
		managementItems,
		buildDisabled: false,
		advanceDisabled: false,
		i18n: createI18n('en'),
		onBuild: vi.fn(),
		onOpenManagement: vi.fn(),
		onAdvanceDay: vi.fn(),
		onOpenShortcuts: vi.fn()
	};
}

describe('ControlDesk', () => {
	// The `.manage` cluster (management launchers) is hidden below the component's
	// 980px breakpoint. This project's browser tests default to a ~414px viewport, so
	// widen it here to exercise the desktop layout the brief's tests assert against.
	beforeEach(async () => {
		await page.viewport(1280, 800);
	});

	it('renders build, management launchers, and advance day', async () => {
		expect.assertions(3);
		render(ControlDesk, baseProps());
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /dashboard/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^advance day$/i })).toBeVisible();
	});

	it('shows each management panel with its hotkey', async () => {
		expect.assertions(2);
		render(ControlDesk, baseProps());
		await expect.element(page.getByRole('button', { name: /dashboard\s*d/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /policies\s*p/i })).toBeVisible();
	});

	it('no longer hosts the map-view menu (moved to the top bar)', async () => {
		expect.assertions(1);
		render(ControlDesk, baseProps());
		await expect.element(page.getByRole('button', { name: /^menu$/i })).not.toBeInTheDocument();
	});

	it('invokes build, management and advance callbacks on interaction', async () => {
		expect.assertions(3);
		const props = baseProps();
		render(ControlDesk, props);
		await page.getByRole('button', { name: /^build$/i }).click();
		await page.getByRole('button', { name: /dashboard/i }).click();
		await page.getByRole('button', { name: /^advance day$/i }).click();
		expect(props.onBuild).toHaveBeenCalledTimes(1);
		expect(props.onOpenManagement).toHaveBeenCalledWith('dashboard');
		expect(props.onAdvanceDay).toHaveBeenCalledTimes(1);
	});

	it('disables build when buildDisabled is set', async () => {
		expect.assertions(1);
		render(ControlDesk, { ...baseProps(), buildDisabled: true });
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeDisabled();
	});

	it('renders a shortcuts launcher with the ? keycap that opens the cheat sheet', async () => {
		expect.assertions(3);
		const props = baseProps();
		render(ControlDesk, props);
		const shortcuts = page.getByRole('button', { name: /^shortcuts$/i });
		await expect.element(shortcuts).toBeVisible();
		await expect.element(page.getByText('?', { exact: true })).toBeVisible();
		await shortcuts.click();
		expect(props.onOpenShortcuts).toHaveBeenCalledTimes(1);
	});

	it('disables advance day when advanceDisabled is set', async () => {
		expect.assertions(1);
		render(ControlDesk, { ...baseProps(), advanceDisabled: true });
		await expect.element(page.getByRole('button', { name: /^advance day$/i })).toBeDisabled();
	});

	it('omits the keycap for management items that have no shortcut', async () => {
		expect.assertions(2);
		render(ControlDesk, {
			...baseProps(),
			managementItems: [{ id: 'dashboard', label: 'Dashboard' }]
		});
		await expect.element(page.getByRole('button', { name: /^dashboard$/i })).toBeVisible();
		await expect.element(page.getByText('D', { exact: true })).not.toBeInTheDocument();
	});

	it('renders an empty management cluster without launchers', async () => {
		expect.assertions(3);
		render(ControlDesk, { ...baseProps(), managementItems: [] });
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeVisible();
		// With no management items, the `{#each}` renders nothing — no launcher
		// buttons should be present (exercises the empty-iteration branch).
		await expect
			.element(page.getByRole('button', { name: /dashboard|policies/i }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('group', { name: /management/i })).toBeInTheDocument();
	});

	it('shows the rail-build toggle and fires onToggleRailBuild when showRailBuild is set', async () => {
		expect.assertions(3);
		const onToggleRailBuild = vi.fn();
		render(ControlDesk, {
			...baseProps(),
			showRailBuild: true,
			railBuildActive: true,
			onToggleRailBuild
		});

		const toggle = page.getByRole('button', { name: /build rail/i });
		await expect.element(toggle).toBeVisible();
		await expect.element(toggle).toHaveAttribute('aria-pressed', 'true');
		await toggle.click();
		expect(onToggleRailBuild).toHaveBeenCalledTimes(1);
	});
});
