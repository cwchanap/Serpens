import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { IndustryMapSnapshot } from '$lib/game/industryMapRender';

const mockUpdateSnapshot = vi.fn();
const mockSetEventHandler = vi.fn();

vi.mock('phaser', () => {
	const FakeGame = vi.fn().mockImplementation(function () {
		return { destroy: vi.fn() };
	});
	return {
		default: {
			Game: FakeGame,
			AUTO: 0,
			Scale: { RESIZE: 0, CENTER_BOTH: 0 }
		}
	};
});

vi.mock('$lib/phaser/industryMapScene', () => {
	function FakeIndustryMapScene(this: object) {
		return {
			setEventHandler: mockSetEventHandler,
			updateSnapshot: mockUpdateSnapshot
		};
	}
	return { IndustryMapScene: FakeIndustryMapScene };
});

import IndustryMap from './IndustryMap.svelte';

const emptySnapshot: IndustryMapSnapshot = {
	cityId: 'city-1',
	width: 2,
	height: 2,
	selectedTileId: null,
	placementPreview: null,
	tiles: [],
	buildings: []
};

describe('IndustryMap', () => {
	it('renders the industry map section', async () => {
		expect.assertions(1);

		render(IndustryMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn()
		});

		await expect
			.element(page.getByRole('region', { name: 'Industry map' }))
			.toBeInTheDocument();
	});

	it('shows fallback message when phaser import fails', async () => {
		expect.assertions(1);

		vi.resetModules();
		vi.doMock('phaser', () => ({ default: undefined }));
		vi.doMock('$lib/phaser/industryMapScene', () => ({
			IndustryMapScene: undefined
		}));

		const { default: IndustryMapFresh } = await import('./IndustryMap.svelte');

		render(IndustryMapFresh, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn()
		});

		await expect
			.element(page.getByText('Industry map renderer unavailable.'))
			.toBeInTheDocument();
	});
});
