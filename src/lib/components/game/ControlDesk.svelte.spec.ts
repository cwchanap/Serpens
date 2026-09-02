import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import type { ManagementPanelMenuItem } from './gameNavigation';
import ControlDesk from './ControlDesk.svelte';

const managementItems: ManagementPanelMenuItem[] = [
	{ id: 'dashboard', label: 'Dashboard', shortcut: 'O', icon: 'dashboard' },
	{ id: 'policies', label: 'Policies', shortcut: 'P', icon: 'policies' },
	{ id: 'finance', label: 'Finance', shortcut: 'F', icon: 'finance' }
];

function baseProps() {
	return {
		managementItems,
		buildDisabled: false,
		advanceDisabled: false,
		i18n: createI18n('en'),
		onBuild: vi.fn(),
		onOpenManagement: vi.fn(),
		paused: false,
		simulationSpeed: 1 as const,
		onTogglePause: vi.fn(),
		onSelectSpeed: vi.fn(),
		onOpenShortcuts: vi.fn()
	};
}

describe('ControlDesk', () => {
	// The control desk renders as a left rail on wide screens. This project's
	// browser tests default to a ~414px viewport, so widen it here to exercise
	// the desktop rail the brief's tests assert against.
	beforeEach(async () => {
		await page.viewport(1280, 800);
	});

	it('renders build, management launchers, and time controls', async () => {
		expect.assertions(3);
		render(ControlDesk, baseProps());
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /dashboard/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
	});

	it('keeps management labels accessible and exposes their hotkeys in titles', async () => {
		expect.assertions(4);
		render(ControlDesk, baseProps());

		const dashboard = page.getByRole('button', { name: /^dashboard$/i });
		const policies = page.getByRole('button', { name: /^policies$/i });

		await expect.element(dashboard).toBeVisible();
		await expect.element(dashboard).toHaveAttribute('title', 'Dashboard (O)');
		await expect.element(policies).toBeVisible();
		await expect.element(policies).toHaveAttribute('title', 'Policies (P)');
	});

	it('keeps management destinations reachable in the compact dock', async () => {
		expect.assertions(3);
		await page.viewport(414, 800);
		render(ControlDesk, baseProps());

		await expect.element(page.getByRole('button', { name: /^dashboard$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^policies$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^finance$/i })).toBeVisible();
	});

	it('no longer hosts the map-view menu (moved to the top bar)', async () => {
		expect.assertions(1);
		render(ControlDesk, baseProps());
		await expect.element(page.getByRole('button', { name: /^menu$/i })).not.toBeInTheDocument();
	});

	it('invokes build, management and pause callbacks on interaction', async () => {
		expect.assertions(3);
		const props = baseProps();
		render(ControlDesk, props);
		await page.getByRole('button', { name: /^build$/i }).click();
		await page.getByRole('button', { name: /dashboard/i }).click();
		await page.getByRole('button', { name: /^pause$/i }).click();
		expect(props.onBuild).toHaveBeenCalledTimes(1);
		expect(props.onOpenManagement).toHaveBeenCalledWith('dashboard');
		expect(props.onTogglePause).toHaveBeenCalledTimes(1);
	});

	it('disables build when buildDisabled is set', async () => {
		expect.assertions(1);
		render(ControlDesk, { ...baseProps(), buildDisabled: true });
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeDisabled();
	});

	it('opens shortcut help from the icon launcher', async () => {
		expect.assertions(2);
		const onOpenShortcuts = vi.fn();
		render(ControlDesk, { ...baseProps(), onOpenShortcuts });

		const button = page.getByRole('button', { name: /shortcuts/i });
		await expect
			.element(document.querySelector<SVGElement>('svg[data-icon="shortcuts"]'))
			.toBeVisible();
		await button.click();
		expect(onOpenShortcuts).toHaveBeenCalledOnce();
	});

	it('disables time controls when advanceDisabled is set', async () => {
		expect.assertions(1);
		render(ControlDesk, { ...baseProps(), advanceDisabled: true });
		await expect.element(page.getByRole('button', { name: /^pause$/i })).toBeDisabled();
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

	it('renders the rail-build toggle as not pressed when railBuildActive is false', async () => {
		expect.assertions(2);
		render(ControlDesk, {
			...baseProps(),
			showRailBuild: true,
			railBuildActive: false,
			onToggleRailBuild: vi.fn()
		});

		const toggle = page.getByRole('button', { name: /build rail/i });
		await expect.element(toggle).toBeVisible();
		await expect.element(toggle).toHaveAttribute('aria-pressed', 'false');
	});

	it('does not show the disabled reason when no desk action is disabled', async () => {
		expect.assertions(2);
		render(ControlDesk, {
			...baseProps(),
			buildDisabled: false,
			advanceDisabled: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByRole('status')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeEnabled();
	});

	it('disables advance, build, and rail independently without blocking navigation callbacks', async () => {
		expect.assertions(7);
		const props = baseProps();
		const onToggleRailBuild = vi.fn();
		render(ControlDesk, {
			...props,
			buildDisabled: true,
			advanceDisabled: true,
			showRailBuild: true,
			railBuildDisabled: true,
			disabledReason: 'Unavailable in this challenge.',
			onToggleRailBuild
		});

		const build = page.getByRole('button', { name: /^build$/i });
		const pause = page.getByRole('button', { name: /^pause$/i });
		const rail = page.getByRole('button', { name: /build rail/i });
		await expect.element(build).toBeDisabled();
		await expect.element(pause).toBeDisabled();
		await expect.element(rail).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		await page.getByRole('button', { name: /dashboard/i }).click();
		expect(props.onOpenManagement).toHaveBeenCalledWith('dashboard');
		expect(props.onBuild).not.toHaveBeenCalled();
		expect(onToggleRailBuild).not.toHaveBeenCalled();
	});
});
