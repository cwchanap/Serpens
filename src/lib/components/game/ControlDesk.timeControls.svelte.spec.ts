import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import ControlDesk from './ControlDesk.svelte';

describe('ControlDesk time controls', () => {
	beforeEach(async () => {
		await page.viewport(1280, 800);
	});

	it('replaces manual day advancement with pause and simulation speeds', async () => {
		expect.assertions(5);
		render(ControlDesk, {
			managementItems: [],
			buildDisabled: false,
			advanceDisabled: false,
			i18n: createI18n('en'),
			onBuild: vi.fn(),
			onOpenManagement: vi.fn(),
			paused: false,
			simulationSpeed: 1,
			onTogglePause: vi.fn(),
			onSelectSpeed: vi.fn(),
			onOpenShortcuts: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^1×$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^2×$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^5×$/i })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /^advance day$/i }))
			.not.toBeInTheDocument();
	});

	it('keeps pause responsive while a day advance is pending', async () => {
		expect.assertions(2);
		render(ControlDesk, {
			managementItems: [],
			buildDisabled: false,
			advanceDisabled: true,
			pauseDisabled: false,
			i18n: createI18n('en'),
			onBuild: vi.fn(),
			onOpenManagement: vi.fn(),
			paused: false,
			simulationSpeed: 1,
			onTogglePause: vi.fn(),
			onSelectSpeed: vi.fn(),
			onOpenShortcuts: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /^pause$/i })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: /^5×$/i })).toBeDisabled();
	});

	it('selects a simulation speed when a speed button is clicked', async () => {
		expect.assertions(1);
		const onSelectSpeed = vi.fn();
		render(ControlDesk, {
			managementItems: [],
			buildDisabled: false,
			advanceDisabled: false,
			i18n: createI18n('en'),
			onBuild: vi.fn(),
			onOpenManagement: vi.fn(),
			paused: false,
			simulationSpeed: 1,
			onTogglePause: vi.fn(),
			onSelectSpeed,
			onOpenShortcuts: vi.fn()
		});

		await page.getByRole('button', { name: /^2×$/i }).click();
		expect(onSelectSpeed).toHaveBeenCalledWith(2);
	});

	it('shows the resume label while paused', async () => {
		expect.assertions(2);
		render(ControlDesk, {
			managementItems: [],
			buildDisabled: false,
			advanceDisabled: false,
			i18n: createI18n('en'),
			onBuild: vi.fn(),
			onOpenManagement: vi.fn(),
			paused: true,
			simulationSpeed: 1,
			onTogglePause: vi.fn(),
			onSelectSpeed: vi.fn(),
			onOpenShortcuts: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /^resume$/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /^pause$/i })).not.toBeInTheDocument();
	});

	it('falls back to defaults when optional time props are omitted', async () => {
		expect.assertions(2);
		render(ControlDesk, {
			managementItems: [],
			buildDisabled: false,
			advanceDisabled: false,
			i18n: createI18n('en'),
			onBuild: vi.fn(),
			onOpenManagement: vi.fn(),
			onOpenShortcuts: vi.fn()
		});

		// paused defaults to false -> Pause label (default-taken branch).
		await expect.element(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
		// simulationSpeed defaults to 1 -> the 1× button is pressed (default-taken branch).
		await expect
			.element(page.getByRole('button', { name: /^1×$/i }))
			.toHaveAttribute('aria-pressed', 'true');
		// onTogglePause/onSelectSpeed default to no-op stubs; clicking through them
		// exercises the default-taken branches (and the speed-button onclick) without
		// throwing.
		await page.getByRole('button', { name: /^pause$/i }).click();
		await page.getByRole('button', { name: /^2×$/i }).click();
	});

	it('reconciles speed buttons when rerendered with a changed simulation speed', async () => {
		expect.assertions(2);
		const props = {
			managementItems: [],
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
		const { rerender } = render(ControlDesk, props);

		// Rerender with the SAME keyed speed items [1, 2, 5] but a changed active
		// speed so Svelte's keyed-each reconciliation takes the "reuse existing
		// block" path instead of remounting the buttons.
		await rerender({ ...props, simulationSpeed: 2 as const });
		await expect
			.element(page.getByRole('button', { name: /^2×$/i }))
			.toHaveAttribute('aria-pressed', 'true');
		await expect
			.element(page.getByRole('button', { name: /^1×$/i }))
			.toHaveAttribute('aria-pressed', 'false');
	});
});
