import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync, type ComponentProps } from 'svelte';
import type { MapActivity } from '$lib/game/mapActivityFeedback';
import type { IndustryMapSnapshot } from '$lib/game/industryMapRender';
import { createI18n, type I18nBundle } from '$lib/i18n';

const i18n: I18nBundle = createI18n('en');

const mockUpdateSnapshot = vi.fn();
const mockSetEventHandler = vi.fn();
const mockSetKeyboardEnabled = vi.fn();
const mockSetParentSize = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockShowMapActivity = vi.fn();
let shouldFail = false;

vi.mock('phaser', () => {
	const mockCanvas = { dataset: {} as Record<string, string> };
	const FakeGame = vi.fn().mockImplementation(function () {
		if (shouldFail) throw new Error('Phaser unavailable');
		return {
			scale: { setParentSize: mockSetParentSize },
			destroy: vi.fn(),
			pause: mockPause,
			resume: mockResume,
			canvas: mockCanvas
		};
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
			setKeyboardEnabled: mockSetKeyboardEnabled,
			updateSnapshot: mockUpdateSnapshot,
			showMapActivity: mockShowMapActivity
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
	buildings: [],
	rails: [],
	railPreview: null
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

	it('resizes the canvas when its container changes while paused', async () => {
		render(IndustryMap, { snapshot: emptySnapshot, onTileSelected: vi.fn(), paused: true, i18n });
		const container = document.querySelector<HTMLDivElement>('.map-canvas')!;
		container.style.width = '800px';
		container.style.height = '600px';
		await expect.poll(() => mockSetParentSize.mock.lastCall).toEqual([800, 600]);
		container.style.width = '1100px';
		container.style.height = '720px';
		await expect.poll(() => mockSetParentSize.mock.lastCall).toEqual([1100, 720]);
		expect(mockPause).toHaveBeenCalled();
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

	it('forwards buildCancelled events to onBuildCancelled', async () => {
		expect.assertions(1);
		const onTileSelected = vi.fn();
		const onBuildCancelled = vi.fn();

		render(IndustryMap, { snapshot: emptySnapshot, onTileSelected, onBuildCancelled, i18n });

		await waitForMock(mockSetEventHandler);
		const handler = mockSetEventHandler.mock.calls.at(-1)![0] as (event: {
			type: string;
			tileId?: string;
		}) => void;
		handler({ type: 'buildCancelled' });

		expect(onBuildCancelled).toHaveBeenCalledTimes(1);
	});

	it('does not throw when buildCancelled fires without an onBuildCancelled handler', async () => {
		expect.assertions(1);
		const onTileSelected = vi.fn();

		render(IndustryMap, { snapshot: emptySnapshot, onTileSelected, i18n });

		await waitForMock(mockSetEventHandler);
		const handler = mockSetEventHandler.mock.calls.at(-1)![0] as (event: {
			type: string;
			tileId?: string;
		}) => void;

		expect(() => handler({ type: 'buildCancelled' })).not.toThrow();
	});
});

type IndustryMapProps = ComponentProps<typeof IndustryMap>;

const onTileSelected = vi.fn();

function mapProps(overrides: Partial<IndustryMapProps> = {}): IndustryMapProps {
	return { snapshot: emptySnapshot, onTileSelected, i18n, ...overrides };
}

function production(entityId: string, cityId = 'city-1'): MapActivity {
	return { kind: 'production', cityId, entityId, materialId: 'bottled-water' };
}

type SceneEventHandler = (event: { type: string; tileId?: string }) => void;

// Each mount hands its scene one handler through setEventHandler; onDestroy passes null, which is skipped.
function sceneHandlers(): SceneEventHandler[] {
	return mockSetEventHandler.mock.calls
		.map(([handler]) => handler as SceneEventHandler | null)
		.filter((handler): handler is SceneEventHandler => handler !== null);
}

// The scene reports readiness from create() through its event handler.
async function markSceneReady(sceneNumber = 1): Promise<void> {
	await expect.poll(() => sceneHandlers().length, { timeout: 5000 }).toBe(sceneNumber);
	sceneHandlers()[sceneNumber - 1]!({ type: 'sceneReady' });
	flushSync();
}

describe('IndustryMap map activity delivery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('forwards a new batch once when the view is active, unpaused and the scene is ready', async () => {
		const view = await render(IndustryMap, mapProps());
		await markSceneReady();

		await view.rerender(mapProps({ activity: { seq: 1, activities: [production('bldg-1')] } }));
		flushSync();

		expect(mockShowMapActivity).toHaveBeenCalledTimes(1);
		expect(mockShowMapActivity).toHaveBeenCalledWith({
			seq: 1,
			activities: [production('bldg-1')]
		});
	});

	it('consumes a batch while hidden and does not replay it once the view is shown', async () => {
		const view = await render(IndustryMap, mapProps({ active: false }));
		await markSceneReady();
		const batch = { seq: 1, activities: [production('bldg-1')] };

		await view.rerender(mapProps({ active: false, activity: batch }));
		await view.rerender(mapProps({ active: true, activity: batch }));
		flushSync();

		expect(mockShowMapActivity).not.toHaveBeenCalled();
	});

	it('consumes a batch while paused and does not replay it after resuming', async () => {
		const view = await render(IndustryMap, mapProps({ paused: true }));
		await markSceneReady();
		const batch = { seq: 1, activities: [production('bldg-1')] };

		await view.rerender(mapProps({ paused: true, activity: batch }));
		await view.rerender(mapProps({ paused: false, activity: batch }));
		flushSync();

		expect(mockShowMapActivity).not.toHaveBeenCalled();
	});

	it('drops activity for another city and does not re-forward it after a city switch', async () => {
		const view = await render(IndustryMap, mapProps());
		await markSceneReady();
		const batch = { seq: 1, activities: [production('bldg-2', 'city-2')] };

		await view.rerender(mapProps({ activity: batch }));
		await view.rerender(
			mapProps({ snapshot: { ...emptySnapshot, cityId: 'city-2' }, activity: batch })
		);
		flushSync();

		expect(mockShowMapActivity).not.toHaveBeenCalled();
	});

	it('forwards only the same-city activities of a mixed batch', async () => {
		const view = await render(IndustryMap, mapProps());
		await markSceneReady();

		await view.rerender(
			mapProps({
				activity: { seq: 1, activities: [production('bldg-2', 'city-2'), production('bldg-1')] }
			})
		);
		flushSync();

		expect(mockShowMapActivity).toHaveBeenCalledTimes(1);
		expect(mockShowMapActivity).toHaveBeenCalledWith({
			seq: 1,
			activities: [production('bldg-1')]
		});
	});

	it('does not forward the batch that was already current when the view mounted lazily', async () => {
		await render(
			IndustryMap,
			mapProps({ activity: { seq: 4, activities: [production('bldg-1')] } })
		);
		await markSceneReady();

		expect(mockShowMapActivity).not.toHaveBeenCalled();
	});

	it('consumes a batch that arrives before the scene is ready and does not replay it once ready', async () => {
		const view = await render(IndustryMap, mapProps());
		await expect.poll(() => sceneHandlers().length, { timeout: 5000 }).toBe(1);
		await view.rerender(mapProps({ activity: { seq: 1, activities: [production('bldg-1')] } }));
		flushSync();
		expect(mockShowMapActivity).not.toHaveBeenCalled();

		await markSceneReady();

		expect(mockShowMapActivity).not.toHaveBeenCalled();
	});

	it('forwards a batch whose building is not in the current snapshot yet, matching by city only', async () => {
		const view = await render(IndustryMap, mapProps());
		await markSceneReady();

		await view.rerender(mapProps({ activity: { seq: 1, activities: [production('bldg-new')] } }));
		flushSync();

		expect(mockShowMapActivity).toHaveBeenCalledWith({
			seq: 1,
			activities: [production('bldg-new')]
		});
	});

	it('forwards nothing more when the same batch rerenders with a newer snapshot', async () => {
		const view = await render(IndustryMap, mapProps());
		await markSceneReady();
		const batch = { seq: 1, activities: [production('bldg-1')] };

		await view.rerender(mapProps({ activity: batch }));
		await view.rerender(mapProps({ snapshot: { ...emptySnapshot }, activity: batch }));
		flushSync();

		expect(mockShowMapActivity).toHaveBeenCalledTimes(1);
	});

	it('does not replay a delivered batch after the view is destroyed and recreated', async () => {
		const batch = { seq: 1, activities: [production('bldg-1')] };
		const first = await render(IndustryMap, mapProps());
		await markSceneReady(1);
		await first.rerender(mapProps({ activity: batch }));
		flushSync();
		expect(mockShowMapActivity).toHaveBeenCalledTimes(1);

		await first.unmount();
		await render(IndustryMap, mapProps({ activity: batch }));
		await markSceneReady(2);

		expect(mockShowMapActivity).toHaveBeenCalledTimes(1);
	});
});
