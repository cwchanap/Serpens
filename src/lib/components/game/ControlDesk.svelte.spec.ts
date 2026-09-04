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

// Mirrors the app's management panel menu config (nine destinations).
const nineManagementItems: ManagementPanelMenuItem[] = [
	{ id: 'dashboard', label: 'Dashboard', shortcut: 'O', icon: 'dashboard' },
	{ id: 'policies', label: 'Policies', shortcut: 'P', icon: 'policies' },
	{ id: 'staff', label: 'Staff', shortcut: 'S', icon: 'staff' },
	{ id: 'stores', label: 'Stores', shortcut: 'T', icon: 'stores' },
	{ id: 'decisions', label: 'Decisions', shortcut: 'D', icon: 'decisions' },
	{ id: 'reports', label: 'Reports', shortcut: 'R', icon: 'reports' },
	{ id: 'productChains', label: 'Product chains', shortcut: 'C', icon: 'productChains' },
	{ id: 'finance', label: 'Finance', shortcut: 'F', icon: 'finance' },
	{ id: 'logistics', label: 'Logistics', shortcut: 'L', icon: 'logistics' }
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

// Reveal a dock control by scrolling its overflowing scroll container the
// minimal amount (Chromium's native scrollIntoViewIfNeeded, the same engine
// primitive Playwright's locator method wraps). Scrolls every scrollable
// ancestor only as far as needed to bring the element into view.
function scrollDockTo(locator: ReturnType<typeof page.getByRole>) {
	const element = locator.element() as HTMLElement & { scrollIntoViewIfNeeded: () => void };
	element.scrollIntoViewIfNeeded();
}

// The dock is a horizontal scrollport: a control is reachable only when its
// box sits fully inside the dock's scrollport (toBeVisible is too weak —
// elements clipped by an overflowing ancestor still report visible).
function expectControlInsideDock(locator: ReturnType<typeof page.getByRole>, label: string) {
	const element = locator.element();
	const dock = document.querySelector<HTMLElement>('.control-desk');
	if (!element || !dock) throw new Error(`missing dock or control for ${label}`);
	const er = element.getBoundingClientRect();
	const dr = dock.getBoundingClientRect();
	expect(
		er.left >= dr.left - 1 && er.right <= dr.right + 1,
		`${label} must sit fully inside the dock scrollport`
	).toBe(true);
}

function expectControlClippedByDock(locator: ReturnType<typeof page.getByRole>, label: string) {
	const element = locator.element();
	const dock = document.querySelector<HTMLElement>('.control-desk');
	if (!element || !dock) throw new Error(`missing dock or control for ${label}`);
	const er = element.getBoundingClientRect();
	const dr = dock.getBoundingClientRect();
	expect(
		er.right > dr.right + 1,
		`${label} must start clipped past the dock's right edge (proving scrolling is needed)`
	).toBe(true);
}

describe('ControlDesk', () => {
	// The control desk is a full-width horizontal dock fixed to the bottom at
	// every viewport. This project's browser tests default to a ~414px viewport,
	// so widen it here to exercise the desktop arrangement the brief's tests
	// assert against.
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

	it('docks horizontally at the bottom with the time controls in one row', async () => {
		expect.assertions(10);
		// Component specs don't load layout.css, so pin the dock-height token the
		// app provides; without it the dock shrink-wraps to its content height.
		document.documentElement.style.setProperty('--control-desk-compact-height', '5.75rem');
		try {
			render(ControlDesk, baseProps());

			const desk = document.querySelector<HTMLElement>('.control-desk');
			// layout.css's global border-box is absent here, so restore the app's
			// sizing model before measuring (dock height is a border-box contract).
			desk?.style.setProperty('box-sizing', 'border-box');
			const deskBox = desk?.getBoundingClientRect();
			expect(deskBox, 'control desk has a box').toBeTruthy();
			if (!deskBox) return;
			// The dock spans the viewport width at the bottom edge.
			expect(deskBox.left).toBeLessThanOrEqual(2);
			expect(deskBox.right).toBeGreaterThanOrEqual(1280 - 2);
			expect(deskBox.y + deskBox.height).toBeGreaterThanOrEqual(800 - 2);
			expect(deskBox.height).toBeCloseTo(92, 0);
			expect(getComputedStyle(desk as HTMLElement).flexDirection).toBe('row');

			// Pause and the 1x/2x/5x speeds sit on one horizontal row inside the
			// dock (the old rail's vertical speed stack is gone).
			const pauseBox = page
				.getByRole('button', { name: /^pause$/i })
				.element()
				.getBoundingClientRect();
			const pauseCenter = pauseBox.top + pauseBox.height / 2;
			const speedBoxes = ['1×', '2×', '5×'].map((speed) =>
				page
					.getByRole('button', { name: new RegExp(`^${speed}$`, 'i') })
					.element()
					.getBoundingClientRect()
			);
			for (const box of speedBoxes) {
				expect(
					Math.abs(box.top + box.height / 2 - pauseCenter) <= 2,
					'speed button is not vertically centered with pause in the dock row'
				).toBe(true);
			}
			expect(
				speedBoxes[0]!.right <= deskBox.right && speedBoxes[2]!.left >= deskBox.left,
				'speed row overflows the control desk'
			).toBe(true);
		} finally {
			document.documentElement.style.removeProperty('--control-desk-compact-height');
		}
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

	it('keeps all nine management destinations reachable by scrolling the compact dock', async () => {
		// At 414px the centered medallion cluster (nine destinations + time
		// controls) is wider than the viewport. Overflow-safe centering must keep
		// the row left-anchored at scroll 0 and scrollable to its end, so every
		// destination is reachable — a justify-content: center dock would clip
		// the leading medallions past the scroll origin.
		expect.assertions(11);
		await page.viewport(414, 800);
		render(ControlDesk, { ...baseProps(), managementItems: nineManagementItems });

		const desk = document.querySelector<HTMLElement>('.control-desk');
		expect(desk, 'compact dock overflows the 414px viewport').toBeTruthy();
		expect(
			desk!.scrollWidth > desk!.clientWidth,
			'expected the nine-destination cluster to overflow the compact dock'
		).toBe(true);

		for (const item of nineManagementItems) {
			const destination = page.getByRole('button', { name: new RegExp(`^${item.label}$`, 'i') });
			scrollDockTo(destination);
			expectControlInsideDock(destination, item.label);
		}
	});

	it('reveals pause and the 5× speed by scrolling the compact dock', async () => {
		// The play control and speeds sit at the end of the overflowing cluster;
		// they must be reachable by scrolling the dock, never clipped past a
		// scroll origin. The 5× pill doubles as the tail sentinel: it starts
		// clipped and must end fully inside the dock scrollport.
		expect.assertions(6);
		await page.viewport(414, 800);
		render(ControlDesk, { ...baseProps(), managementItems: nineManagementItems });

		const desk = document.querySelector<HTMLElement>('.control-desk');
		expect(desk).toBeTruthy();
		expect(
			desk!.scrollWidth > desk!.clientWidth,
			'expected the nine-destination cluster to overflow the compact dock'
		).toBe(true);

		const fiveX = page.getByRole('button', { name: /^5×$/i });
		expectControlClippedByDock(fiveX, '5×');
		scrollDockTo(fiveX);
		expectControlInsideDock(fiveX, '5×');

		const pause = page.getByRole('button', { name: /^pause$/i });
		scrollDockTo(pause);
		expectControlInsideDock(pause, 'pause');

		// Both edges scrollable: after reaching the tail, the leading Build
		// medallion must scroll back into the scrollport.
		const build = page.getByRole('button', { name: /^build$/i });
		scrollDockTo(build);
		expectControlInsideDock(build, 'build');
	});

	it('reveals the resume control by scrolling the paused compact dock', async () => {
		expect.assertions(3);
		await page.viewport(414, 800);
		render(ControlDesk, {
			...baseProps(),
			managementItems: nineManagementItems,
			paused: true
		});

		const resume = page.getByRole('button', { name: /^resume$/i });
		expectControlClippedByDock(resume, 'resume');
		scrollDockTo(resume);
		expectControlInsideDock(resume, 'resume');

		const build = page.getByRole('button', { name: /^build$/i });
		scrollDockTo(build);
		expectControlInsideDock(build, 'build');
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
