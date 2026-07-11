import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CityMapSnapshot } from '$lib/game/mapRender';
import { createI18n, type I18nBundle } from '$lib/i18n';
import CityMap from './CityMap.svelte';

const i18n: I18nBundle = createI18n('en');

const mockUpdateSnapshot = vi.fn();
const mockSetEventHandler = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockCanvas = { dataset: {} as Record<string, string> };
const MockGame = vi.fn().mockImplementation(function () {
	if (shouldFail) throw new Error('Phaser unavailable');
	return { destroy: vi.fn(), pause: mockPause, resume: mockResume, canvas: mockCanvas };
});

let shouldFail = false;

vi.mock('phaser', () => {
	return {
		default: {
			AUTO: 0,
			Game: MockGame,
			Scale: { RESIZE: 0, CENTER_BOTH: 0 }
		}
	};
});

vi.mock('$lib/phaser/cityMapScene', () => {
	return {
		CityMapScene: vi.fn().mockImplementation(function () {
			return {
				setEventHandler: mockSetEventHandler,
				updateSnapshot: mockUpdateSnapshot
			};
		})
	};
});

const stubSnapshot: CityMapSnapshot = {
	cityId: 'city-1',
	width: 10,
	height: 10,
	selectedTileId: null,
	placementPreview: null,
	tiles: [],
	stores: []
};

async function waitForMock(fn: ReturnType<typeof vi.fn>): Promise<void> {
	const deadline = Date.now() + 5000;
	while (!fn.mock.calls.length && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 50));
	}
}

describe('CityMap', () => {
	beforeEach(() => {
		shouldFail = false;
		vi.clearAllMocks();
		mockCanvas.dataset = {};
	});

	it('renders the city map section and initializes the scene', async () => {
		expect.assertions(2);

		render(CityMap, {
			snapshot: stubSnapshot,
			onTileSelected: vi.fn(),
			i18n
		});

		await waitForMock(mockSetEventHandler);
		expect(mockUpdateSnapshot).toHaveBeenCalledWith(stubSnapshot);
		expect(page.getByText('Map renderer unavailable.')).not.toBeInTheDocument();
	});

	it('shows fallback message when Phaser game creation fails', async () => {
		expect.assertions(1);
		shouldFail = true;

		render(CityMap, {
			snapshot: stubSnapshot,
			onTileSelected: vi.fn(),
			i18n
		});

		await expect.element(page.getByText('Map renderer unavailable.')).toBeVisible();
	});

	it('pauses the game loop when paused prop is true', async () => {
		expect.assertions(1);

		render(CityMap, {
			snapshot: stubSnapshot,
			onTileSelected: vi.fn(),
			paused: true,
			i18n
		});

		await waitForMock(MockGame);
		await waitForMock(mockPause);
		expect(mockPause).toHaveBeenCalled();
	});

	it('resumes the game loop when paused prop toggles back to false', async () => {
		expect.assertions(1);

		const { rerender } = render(CityMap, {
			snapshot: stubSnapshot,
			onTileSelected: vi.fn(),
			paused: true,
			i18n
		});

		await waitForMock(mockPause);
		rerender({ snapshot: stubSnapshot, onTileSelected: vi.fn(), paused: false, i18n });
		await waitForMock(mockResume);
		expect(mockResume).toHaveBeenCalled();
	});

	it('does not call onTileSelected for non-tileSelected scene events', async () => {
		expect.assertions(1);
		const onTileSelected = vi.fn();

		render(CityMap, { snapshot: stubSnapshot, onTileSelected, i18n });

		await waitForMock(mockSetEventHandler);
		const handler = mockSetEventHandler.mock.calls.at(-1)![0] as (event: { type: string }) => void;
		handler({ type: 'pan' });

		expect(onTileSelected).not.toHaveBeenCalled();
	});

	it('forwards tileSelected events to onTileSelected with the tile id', async () => {
		expect.assertions(1);
		const onTileSelected = vi.fn();

		render(CityMap, { snapshot: stubSnapshot, onTileSelected, i18n });

		await waitForMock(mockSetEventHandler);
		const handler = mockSetEventHandler.mock.calls.at(-1)![0] as (event: {
			type: string;
			tileId?: string;
		}) => void;
		handler({ type: 'tileSelected', tileId: 'tile-42' });

		expect(onTileSelected).toHaveBeenCalledWith('tile-42');
	});

	it('pauses the game loop when active prop is false', async () => {
		expect.assertions(1);

		render(CityMap, {
			snapshot: stubSnapshot,
			onTileSelected: vi.fn(),
			active: false,
			i18n
		});

		await waitForMock(MockGame);
		await waitForMock(mockPause);
		expect(mockPause).toHaveBeenCalled();
	});
});
