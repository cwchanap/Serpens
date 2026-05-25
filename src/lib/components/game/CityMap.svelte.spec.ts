import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CityMapSnapshot } from '$lib/game/mapRender';
import CityMap from './CityMap.svelte';

const mockUpdateSnapshot = vi.fn();
const mockSetEventHandler = vi.fn();

let shouldFail = false;

vi.mock('phaser', () => {
	return {
		default: {
			AUTO: 0,
			Game: vi.fn().mockImplementation(function () {
				if (shouldFail) throw new Error('Phaser unavailable');
				return { destroy: vi.fn() };
			}),
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
	it('renders the city map section and initializes the scene', async () => {
		expect.assertions(2);

		render(CityMap, {
			snapshot: stubSnapshot,
			onTileSelected: vi.fn()
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
			onTileSelected: vi.fn()
		});

		await expect.element(page.getByText('Map renderer unavailable.')).toBeVisible();
	});
});
