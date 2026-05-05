import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SavePanel from './SavePanel.svelte';
import type { GameState } from '$lib/game/types';
import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';

const game = { day: 5 } as GameState;

const autoSave: SaveSlotMetadata = {
	id: 'autosave',
	name: 'Auto-save',
	kind: 'auto',
	updatedAt: '2026-05-05T12:00:00.000Z',
	day: 5,
	cash: 12500,
	storeCount: 1,
	activeCityName: 'Harbor City'
};

const manualSlot: SaveSlotMetadata = {
	id: 'manual-harbor-run-1777982400000',
	name: 'Harbor Run',
	kind: 'manual',
	updatedAt: '2026-05-05T12:00:00.000Z',
	day: 5,
	cash: 12500,
	storeCount: 1,
	activeCityName: 'Harbor City'
};

function renderPanel(
	overrides: Partial<{
		activeGame: GameState | null;
		autoSave: SaveSlotMetadata | null;
		slots: SaveSlotMetadata[];
		status: string;
		error: string | null;
		onResumeAutoSave: () => void;
		onSaveSlot: (name: string, slotId?: string) => void;
		onLoadSlot: (slotId: string) => void;
		onDeleteSlot: (slotId: string) => void;
		onClose: () => void;
	}> = {}
) {
	const props = {
		activeGame: game,
		autoSave,
		slots: [manualSlot],
		status: '',
		error: null,
		onResumeAutoSave: vi.fn(),
		onSaveSlot: vi.fn(),
		onLoadSlot: vi.fn(),
		onDeleteSlot: vi.fn(),
		onClose: vi.fn(),
		...overrides
	};

	render(SavePanel, props);

	return props;
}

describe('SavePanel', () => {
	it('shows auto-save and manual slots', async () => {
		expect.assertions(4);

		renderPanel();

		await expect.element(page.getByRole('dialog', { name: 'Saves' })).toBeVisible();
		await expect.element(page.getByText('Day 5 · 1 stores')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Harbor Run' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Resume' })).toBeEnabled();
	});

	it('dispatches save actions', async () => {
		expect.assertions(3);
		const props = renderPanel();

		await page.getByRole('textbox', { name: 'Slot name' }).fill('Evening Run');
		await page.getByRole('button', { name: 'Save slot' }).click();
		await page.getByRole('button', { name: 'Overwrite' }).click();

		expect(props.onSaveSlot).toHaveBeenNthCalledWith(1, 'Evening Run');
		expect(props.onSaveSlot).toHaveBeenNthCalledWith(2, 'Harbor Run', manualSlot.id);
		expect(page.getByRole('textbox', { name: 'Slot name' })).toHaveValue('');
	});

	it('dispatches load, delete, resume, and close actions', async () => {
		expect.assertions(4);
		const props = renderPanel();

		await page.getByRole('button', { name: 'Resume' }).click();
		await page.getByRole('button', { name: 'Load' }).click();
		await page.getByRole('button', { name: 'Delete' }).click();
		await page.getByRole('button', { name: 'Close saves' }).click();

		expect(props.onResumeAutoSave).toHaveBeenCalledOnce();
		expect(props.onLoadSlot).toHaveBeenCalledWith(manualSlot.id);
		expect(props.onDeleteSlot).toHaveBeenCalledWith(manualSlot.id);
		expect(props.onClose).toHaveBeenCalledOnce();
	});

	it('disables save controls without an active game', async () => {
		expect.assertions(2);

		renderPanel({ activeGame: null, autoSave: null, slots: [] });

		await expect.element(page.getByRole('button', { name: 'Resume' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Save slot' })).toBeDisabled();
	});
});
