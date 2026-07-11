import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { IndustryMapSnapshot } from '$lib/game/industryMapRender';
import { createI18n, type I18nBundle } from '$lib/i18n';

const i18n: I18nBundle = createI18n('en');

const mockUpdateSnapshot = vi.fn();
const mockSetEventHandler = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
let shouldFail = false;

vi.mock('phaser', () => {
	const mockCanvas = { dataset: {} as Record<string, string> };
	const FakeGame = vi.fn().mockImplementation(function () {
		if (shouldFail) throw new Error('Phaser unavailable');
		return { destroy: vi.fn(), pause: mockPause, resume: mockResume, canvas: mockCanvas };
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

async function waitForMock(fn: ReturnType<typeof vi.fn>): Promise<void> {
	const deadline = Date.now() + 5000;
	while (!fn.mock.calls.length && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 50));
	}
}

describe('IndustryMap', () => {
	beforeEach(() => {
		shouldFail = false;
		vi.clearAllMocks();
	});

	it('renders the industry map section', async () => {
		expect.assertions(1);

		render(IndustryMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn(),
			i18n
		});

		await expect.element(page.getByRole('region', { name: 'Industry map' })).toBeInTheDocument();
	});

	it('shows fallback message when phaser import fails', async () => {
		expect.assertions(1);
		shouldFail = true;

		render(IndustryMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn(),
			i18n
		});

		await expect.element(page.getByText('Industry map renderer unavailable.')).toBeInTheDocument();
	});

	it('pauses the game loop when paused prop is true', async () => {
		expect.assertions(1);

		render(IndustryMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn(),
			paused: true,
			i18n
		});

		await waitForMock(mockPause);
		expect(mockPause).toHaveBeenCalled();
	});

	it('pauses the game loop when active prop is false', async () => {
		expect.assertions(1);

		render(IndustryMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn(),
			active: false,
			i18n
		});

		await waitForMock(mockPause);
		expect(mockPause).toHaveBeenCalled();
	});

	it('resumes the game loop when not paused', async () => {
		expect.assertions(1);

		render(IndustryMap, {
			snapshot: emptySnapshot,
			onTileSelected: vi.fn(),
			i18n
		});

		await waitForMock(mockResume);
		expect(mockResume).toHaveBeenCalled();
	});

	it('forwards tileSelected events to onTileSelected with the tile id', async () => {
		expect.assertions(1);
		const onTileSelected = vi.fn();

		render(IndustryMap, { snapshot: emptySnapshot, onTileSelected, i18n });

		await waitForMock(mockSetEventHandler);
		const handler = mockSetEventHandler.mock.calls.at(-1)![0] as (event: {
			type: string;
			tileId?: string;
		}) => void;
		handler({ type: 'tileSelected', tileId: 'ind-tile-7' });

		expect(onTileSelected).toHaveBeenCalledWith('ind-tile-7');
	});
});
