import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ControlDesk from './ControlDesk.svelte';

const managementItems = [
	{ id: 'dashboard', label: 'Dashboard' },
	{ id: 'policies', label: 'Policies' }
];

function baseProps() {
	return {
		activeMapView: 'retail' as const,
		managementItems,
		buildDisabled: false,
		advanceDisabled: false,
		onBuild: vi.fn(),
		onSelectView: vi.fn(),
		onOpenManagement: vi.fn(),
		onAdvanceDay: vi.fn()
	};
}

describe('ControlDesk', () => {
	// The `.manage` cluster (management launchers) is hidden below the component's
	// 980px breakpoint. This project's browser tests default to a ~414px viewport, so
	// widen it here to exercise the desktop layout the brief's tests assert against.
	beforeEach(async () => {
		await page.viewport(1280, 800);
	});

	it('renders build, view tabs, management launchers, and advance day', async () => {
		expect.assertions(4);
		render(ControlDesk, baseProps());
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /industry city map/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /dashboard/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^advance day$/i })).toBeVisible();
	});

	it('invokes callbacks on interaction', async () => {
		expect.assertions(3);
		const props = baseProps();
		render(ControlDesk, props);
		await page.getByRole('button', { name: /^build$/i }).click();
		await page.getByRole('button', { name: /industry city map/i }).click();
		await page.getByRole('button', { name: /^advance day$/i }).click();
		expect(props.onBuild).toHaveBeenCalledTimes(1);
		expect(props.onSelectView).toHaveBeenCalledWith('industry');
		expect(props.onAdvanceDay).toHaveBeenCalledTimes(1);
	});

	it('disables build on the world view and marks the active view', async () => {
		expect.assertions(2);
		render(ControlDesk, { ...baseProps(), activeMapView: 'world', buildDisabled: true });
		await expect.element(page.getByRole('button', { name: /^build$/i })).toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: /world map/i }))
			.toHaveAttribute('aria-pressed', 'true');
	});
});
