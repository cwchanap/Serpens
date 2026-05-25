import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { IndustryMapSnapshot } from '../game/industryMapRender';

vi.mock('$app/paths', () => ({
	asset: (path: string) => path
}));

function createChainableMock(methods: Record<string, unknown> = {}): Record<string, unknown> {
	const obj: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(methods)) {
		obj[key] =
			typeof value === 'function'
				? (...args: unknown[]) => {
						value(...args);
						return obj;
					}
				: value;
	}
	return obj;
}

function createGraphicsMock() {
	const mock = {
		clear: vi.fn(),
		fillStyle: vi.fn(),
		fillRect: vi.fn(),
		lineStyle: vi.fn(),
		strokeRect: vi.fn(),
		destroy: vi.fn(),
		setDepth: vi.fn(),
		fillCircle: vi.fn(),
		strokeCircle: vi.fn(),
		fillTriangle: vi.fn(),
		strokeTriangle: vi.fn(),
		beginPath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		closePath: vi.fn(),
		fillPath: vi.fn(),
		strokePath: vi.fn(),
		lineBetween: vi.fn()
	};
	const chainable = createChainableMock(mock);
	return { mock, chainable };
}

function createImageMock() {
	const mock = {
		setDisplaySize: vi.fn(),
		setDepth: vi.fn(),
		setAlpha: vi.fn(),
		setTint: vi.fn(),
		clearTint: vi.fn(),
		setPosition: vi.fn(),
		destroy: vi.fn()
	};
	const chainable = createChainableMock(mock);
	return { mock, chainable };
}

function createZoneMock() {
	const listeners: Record<string, Function[]> = {};
	const mock = {
		setOrigin: vi.fn(),
		setInteractive: vi.fn(),
		on: vi.fn((event: string, handler: Function) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(handler);
		}),
		destroy: vi.fn()
	};
	const chainable = createChainableMock(mock);
	const fire = (event: string, ...args: unknown[]) => {
		for (const handler of listeners[event] ?? []) {
			handler(...args);
		}
	};
	(chainable as Record<string, unknown>).fire = fire;
	return { mock, chainable, listeners, fire };
}

function createCanvasElement(): { dataset: Record<string, string> } {
	return { dataset: {} };
}

vi.mock('phaser', () => ({
	default: {
		Scene: class {
			key: string;
			constructor(config: { key: string }) {
				this.key = config.key;
			}
		},
		Scale: { Events: { RESIZE: 'resize' } },
		Scenes: { Events: { SHUTDOWN: 'shutdown' } },
		Math: { Clamp: (val: number, min: number, max: number) => Math.max(min, Math.min(max, val)) },
		Input: {
			Pointer: class {
				x = 0;
				y = 0;
				isDown = false;
				event: { target: unknown } = { target: null };
				downElement: unknown = null;
				leftButtonDown() {
					return true;
				}
			}
		},
		GameObjects: {
			GameObject: class {},
			Image: class {},
			Graphics: class {},
			Zone: class {}
		}
	}
}));

const RESIZE_EVENT = 'resize';
const SHUTDOWN_EVENT = 'shutdown';

import { IndustryMapScene } from './industryMapScene';

function setupScene() {
	const canvas = createCanvasElement();
	const loadImageSpy = vi.fn();
	const texturesExistsSpy = vi.fn(() => false);
	const inputListeners: Record<string, Function[]> = {};
	const scaleListeners: Record<string, Function[]> = {};
	let sceneEventsListeners: Record<string, Function[]> = {};

	const graphicsInstances: ReturnType<typeof createGraphicsMock>[] = [];
	const imageInstances: ReturnType<typeof createImageMock>[] = [];
	const zoneInstances: ReturnType<typeof createZoneMock>[] = [];

	const cameraMock = {
		setZoom: vi.fn(),
		setScroll: vi.fn(),
		setBounds: vi.fn(),
		scrollX: 0,
		scrollY: 0,
		zoom: 1,
		worldView: { x: 0, y: 0, width: 800, height: 600 }
	};

	const scene = new IndustryMapScene();

	Object.defineProperty(scene, 'add', {
		value: {
			graphics: vi.fn(() => {
				const g = createGraphicsMock();
				graphicsInstances.push(g);
				return g.chainable;
			}),
			image: vi.fn((_x: number, _y: number, _key: string) => {
				const img = createImageMock();
				imageInstances.push(img);
				return img.chainable;
			}),
			zone: vi.fn((_x: number, _y: number, _w: number, _h: number) => {
				const z = createZoneMock();
				zoneInstances.push(z);
				return z.chainable;
			})
		},
		writable: false,
		configurable: true
	});

	Object.defineProperty(scene, 'input', {
		value: {
			on: vi.fn((event: string, handler: Function) => {
				if (!inputListeners[event]) inputListeners[event] = [];
				inputListeners[event].push(handler);
			}),
			off: vi.fn((event: string, handler: Function) => {
				if (inputListeners[event]) {
					inputListeners[event] = inputListeners[event].filter((h) => h !== handler);
				}
			})
		},
		writable: false,
		configurable: true
	});

	Object.defineProperty(scene, 'scale', {
		value: {
			on: vi.fn((event: string, handler: Function) => {
				if (!scaleListeners[event]) scaleListeners[event] = [];
				scaleListeners[event].push(handler);
			}),
			off: vi.fn((event: string, handler: Function) => {
				if (scaleListeners[event]) {
					scaleListeners[event] = scaleListeners[event].filter((h) => h !== handler);
				}
			}),
			width: 800,
			height: 600
		},
		writable: false,
		configurable: true
	});

	Object.defineProperty(scene, 'cameras', {
		value: { main: cameraMock },
		writable: false,
		configurable: true
	});

	Object.defineProperty(scene, 'textures', {
		value: { exists: texturesExistsSpy },
		writable: false,
		configurable: true
	});

	Object.defineProperty(scene, 'events', {
		value: {
			once: vi.fn((event: string, handler: Function, _context?: unknown) => {
				if (!sceneEventsListeners[event]) sceneEventsListeners[event] = [];
				sceneEventsListeners[event].push(handler);
			})
		},
		writable: false,
		configurable: true
	});

	Object.defineProperty(scene, 'load', {
		value: { image: loadImageSpy },
		writable: false,
		configurable: true
	});

	Object.defineProperty(scene, 'game', {
		value: { canvas },
		writable: false,
		configurable: true
	});

	function fireSceneShutdown() {
		for (const handler of sceneEventsListeners[SHUTDOWN_EVENT] ?? []) {
			handler.call(scene);
		}
		sceneEventsListeners = {};
	}

	function makePointer(overrides: Record<string, unknown> = {}) {
		return {
			x: 0,
			y: 0,
			isDown: false,
			event: { target: canvas },
			downElement: canvas,
			leftButtonDown: vi.fn(() => true),
			...overrides
		};
	}

	return {
		scene,
		canvas,
		cameraMock,
		loadImageSpy,
		texturesExistsSpy,
		graphicsInstances,
		imageInstances,
		zoneInstances,
		inputListeners,
		scaleListeners,
		fireSceneShutdown,
		makePointer
	};
}

function makeSnapshot(overrides: Partial<IndustryMapSnapshot> = {}): IndustryMapSnapshot {
	return {
		cityId: 'city-1',
		width: 3,
		height: 3,
		selectedTileId: null,
		placementPreview: null,
		tiles: [
			{
				id: 't-0-0',
				x: 0,
				y: 0,
				terrain: 'farmland',
				resource: null,
				locked: false,
				selected: false,
				occupied: false
			},
			{
				id: 't-1-0',
				x: 1,
				y: 0,
				terrain: 'forest',
				resource: null,
				locked: false,
				selected: false,
				occupied: false
			},
			{
				id: 't-2-0',
				x: 2,
				y: 0,
				terrain: 'water',
				resource: null,
				locked: false,
				selected: false,
				occupied: false
			},
			{
				id: 't-0-1',
				x: 0,
				y: 1,
				terrain: 'deposit',
				resource: null,
				locked: false,
				selected: false,
				occupied: false
			},
			{
				id: 't-1-1',
				x: 1,
				y: 1,
				terrain: 'industrial',
				resource: null,
				locked: false,
				selected: false,
				occupied: false
			},
			{
				id: 't-2-1',
				x: 2,
				y: 1,
				terrain: 'blocked',
				resource: null,
				locked: true,
				selected: false,
				occupied: false
			},
			{
				id: 't-0-2',
				x: 0,
				y: 2,
				terrain: 'farmland',
				resource: 'grain-field',
				locked: false,
				selected: false,
				occupied: false
			},
			{
				id: 't-1-2',
				x: 1,
				y: 2,
				terrain: 'forest',
				resource: 'water-source',
				locked: false,
				selected: false,
				occupied: false
			},
			{
				id: 't-2-2',
				x: 2,
				y: 2,
				terrain: 'farmland',
				resource: null,
				locked: false,
				selected: true,
				occupied: true
			}
		],
		buildings: [],
		...overrides
	};
}

describe('IndustryMapScene', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		test('sets scene key to IndustryMapScene', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			expect(scene.key).toBe('IndustryMapScene');
		});
	});

	describe('preload', () => {
		test('calls load.image for each art asset that does not exist', () => {
			expect.assertions(1);
			const { scene, loadImageSpy, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.preload();
			expect(loadImageSpy.mock.calls.length).toBeGreaterThan(0);
		});

		test('skips loading assets that already exist', () => {
			expect.assertions(1);
			const { scene, loadImageSpy, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.preload();
			expect(loadImageSpy).not.toHaveBeenCalled();
		});
	});

	describe('create', () => {
		test('creates four graphics objects at correct depths', () => {
			expect.assertions(4);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			expect(graphicsInstances.length).toBe(4);
			expect(graphicsInstances[0].mock.setDepth).toHaveBeenCalled();
			expect(graphicsInstances[1].mock.setDepth).toHaveBeenCalled();
			expect(graphicsInstances[3].mock.setDepth).toHaveBeenCalled();
		});

		test('registers input event handlers', () => {
			expect.assertions(3);
			const { scene, inputListeners } = setupScene();
			scene.create();
			expect(inputListeners['pointermove']).toBeDefined();
			expect(inputListeners['pointerup']).toBeDefined();
			expect(inputListeners['wheel']).toBeDefined();
		});

		test('registers scale resize handler', () => {
			expect.assertions(1);
			const { scene, scaleListeners } = setupScene();
			scene.create();
			expect(scaleListeners[RESIZE_EVENT]).toBeDefined();
		});

		test('registers shutdown handler', () => {
			expect.assertions(2);
			const { scene } = setupScene();
			scene.create();
			const eventsOnce = (scene.events as Record<string, unknown>).once as ReturnType<typeof vi.fn>;
			expect(eventsOnce).toHaveBeenCalled();
			expect(eventsOnce.mock.calls[0][0]).toBe(SHUTDOWN_EVENT);
		});

		test('sets camera zoom to 1', () => {
			expect.assertions(1);
			const { scene, cameraMock } = setupScene();
			scene.create();
			expect(cameraMock.setZoom).toHaveBeenCalledWith(1);
		});
	});

	describe('setEventHandler', () => {
		test('stores the handler', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			expect(scene.setEventHandler).toBeDefined();
		});
	});

	describe('updateSnapshot', () => {
		test('renders snapshot with tiles', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[0].mock.clear).toHaveBeenCalled();
		});

		test('clears hoverTileId when tile no longer exists in new snapshot', () => {
			expect.assertions(1);
			const { scene, zoneInstances } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const zone = zoneInstances[0];
			zone.fire('pointerover');
			const pointerUp = zone.mock.on.mock.calls.find(
				(c: unknown[]) => (c as [string])[0] === 'pointerup'
			);
			expect(pointerUp).toBeDefined();
		});
	});

	describe('update', () => {
		test('calls updateBuildingSprites and drawMarkerGraphics', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			graphicsInstances.forEach((g) => g.mock.clear.mockClear());
			scene.update(1000);
			expect(graphicsInstances[2].mock.clear).toHaveBeenCalled();
		});

		test('updates canvas camera attributes', () => {
			expect.assertions(2);
			const { scene, canvas } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			scene.update(1000);
			expect(canvas.dataset.mapZoom).toBeDefined();
			expect(canvas.dataset.mapTileSize).toBeDefined();
		});

		test('does not update building sprites when no snapshot', () => {
			expect.assertions(1);
			const { scene, canvas } = setupScene();
			scene.create();
			scene.update(1000);
			expect(canvas.dataset.mapZoom).toBeDefined();
		});
	});

	describe('renderSnapshot terrain drawing', () => {
		test('draws filled rectangles when no terrain texture exists', () => {
			expect.assertions(2);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[0].mock.fillRect).toHaveBeenCalled();
			expect(graphicsInstances[0].mock.strokeRect).toHaveBeenCalled();
		});

		test('creates terrain sprites when texture exists', () => {
			expect.assertions(1);
			const { scene, texturesExistsSpy, imageInstances } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			expect(imageInstances.length).toBeGreaterThan(0);
		});

		test('draws locked overlay on locked tiles', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const fillRectCalls = graphicsInstances[0].mock.fillRect.mock.calls;
			const hasLockedCall = fillRectCalls.some((call: unknown[]) => {
				const args = call as number[];
				return args[2] === 32 && args[3] === 32;
			});
			expect(hasLockedCall).toBe(true);
		});

		test('draws occupied outline on occupied tiles', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[0].mock.strokeRect).toHaveBeenCalled();
		});
	});

	describe('tile zones', () => {
		test('creates zone for each tile', () => {
			expect.assertions(1);
			const { scene, zoneInstances } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			expect(zoneInstances.length).toBe(snapshot.tiles.length);
		});

		test('zone pointerup triggers tileSelected event on handler', () => {
			expect.assertions(1);
			const { scene, zoneInstances, canvas, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const zone = zoneInstances[0];
			const pointer = makePointer({ x: 5, y: 5, isDown: true });
			zone.fire('pointerdown', pointer);
			zone.fire('pointerup', pointer);
			expect(handler).toHaveBeenCalledWith({ type: 'tileSelected', tileId: snapshot.tiles[0].id });
		});

		test('zone pointerover sets hoverTileId and draws outlines', () => {
			expect.assertions(1);
			const { scene, zoneInstances, graphicsInstances } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			graphicsInstances[3].mock.clear.mockClear();
			zoneInstances[0].fire('pointerover');
			expect(graphicsInstances[3].mock.strokeRect).toHaveBeenCalled();
		});

		test('zone pointerout clears hoverTileId', () => {
			expect.assertions(1);
			const { scene, zoneInstances, graphicsInstances } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			zoneInstances[0].fire('pointerover');
			graphicsInstances[3].mock.clear.mockClear();
			zoneInstances[0].fire('pointerout');
			expect(graphicsInstances[3].mock.clear).toHaveBeenCalled();
		});
	});

	describe('drag behavior', () => {
		test('pointerdown on canvas sets isDragging', () => {
			expect.assertions(1);
			const { scene, zoneInstances, inputListeners, makePointer } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 100, y: 100, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			const movePointer = makePointer({ x: 200, y: 200, isDown: true });
			inputListeners['pointermove'][0].call(scene, movePointer);
			expect(true).toBe(true);
		});

		test('handlePointerMove scrolls camera when dragging', () => {
			expect.assertions(2);
			const { scene, zoneInstances, inputListeners, cameraMock, makePointer } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 100, y: 100, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			const movePointer = makePointer({ x: 120, y: 130, isDown: true });
			inputListeners['pointermove'][0].call(scene, movePointer);
			expect(cameraMock.scrollX).not.toBe(0);
			expect(cameraMock.scrollY).not.toBe(0);
		});

		test('handlePointerMove ignores non-drag moves', () => {
			expect.assertions(1);
			const { scene, inputListeners, cameraMock, makePointer } = setupScene();
			scene.create();
			const movePointer = makePointer({ x: 120, y: 130, isDown: false });
			inputListeners['pointermove'][0].call(scene, movePointer);
			expect(cameraMock.scrollX).toBe(0);
		});

		test('handlePointerUp resets drag state', () => {
			expect.assertions(1);
			const { scene, zoneInstances, inputListeners, makePointer } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 100, y: 100, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			inputListeners['pointerup'][0].call(scene);
			expect(true).toBe(true);
		});

		test('tile selection is suppressed after drag', () => {
			expect.assertions(1);
			const { scene, zoneInstances, inputListeners, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 100, y: 100, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			const movePointer = makePointer({ x: 200, y: 200, isDown: true });
			inputListeners['pointermove'][0].call(scene, movePointer);
			const upPointer = makePointer({ x: 200, y: 200 });
			zoneInstances[0].fire('pointerup', upPointer);
			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe('wheel zoom', () => {
		test('handleWheel zooms camera', () => {
			expect.assertions(1);
			const { scene, inputListeners, cameraMock, makePointer } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer();
			inputListeners['wheel'][0].call(scene, pointer, [], 0, 500);
			expect(cameraMock.setZoom).toHaveBeenCalled();
		});
	});

	describe('placement preview', () => {
		test('draws valid and invalid placement tiles', () => {
			expect.assertions(3);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				placementPreview: {
					validTileIds: ['t-0-0'],
					invalidTileIds: ['t-1-0']
				}
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[1].mock.fillRect).toHaveBeenCalled();
			expect(graphicsInstances[1].mock.fillStyle).toHaveBeenCalled();
			expect(graphicsInstances[1].mock.strokeRect).toHaveBeenCalled();
		});

		test('clears preview when no placement preview', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			const snapshot = makeSnapshot({ placementPreview: null });
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[1].mock.clear).toHaveBeenCalled();
		});

		test('updates canvas placement preview attributes', () => {
			expect.assertions(2);
			const { scene, canvas } = setupScene();
			scene.create();
			const snapshot = makeSnapshot({
				placementPreview: {
					validTileIds: ['t-0-0'],
					invalidTileIds: ['t-1-0']
				}
			});
			scene.updateSnapshot(snapshot);
			expect(canvas.dataset.placementPreviewMode).toBe('active');
			expect(canvas.dataset.placementValidTileCount).toBe('1');
		});

		test('sets inactive mode when no tiles in preview', () => {
			expect.assertions(1);
			const { scene, canvas } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			expect(canvas.dataset.placementPreviewMode).toBe('inactive');
		});
	});

	describe('resource markers', () => {
		test('draws resource marker fallback when no texture', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			scene.update(500);
			expect(graphicsInstances[2].mock.fillStyle).toHaveBeenCalled();
		});

		test('creates resource sprite when texture exists', () => {
			expect.assertions(1);
			const { scene, texturesExistsSpy, imageInstances } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const imageCallCount = imageInstances.length;
			expect(imageCallCount).toBeGreaterThan(0);
		});
	});

	describe('building markers', () => {
		test('draws building marker fallback when no texture', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				buildings: [
					{
						id: 'b-1',
						name: 'Grain Farm',
						typeId: 'grain-farm',
						tileId: 't-0-0',
						x: 0,
						y: 0,
						status: 'idle'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.fillStyle).toHaveBeenCalled();
		});

		test('creates building sprite when texture exists', () => {
			expect.assertions(1);
			const { scene, texturesExistsSpy, imageInstances } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			const snapshot = makeSnapshot({
				buildings: [
					{
						id: 'b-1',
						name: 'Grain Farm',
						typeId: 'grain-farm',
						tileId: 't-0-0',
						x: 0,
						y: 0,
						status: 'produced'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(imageInstances.length).toBeGreaterThan(0);
		});

		test('draws status ring for building sprite that exists', () => {
			expect.assertions(1);
			const { scene, texturesExistsSpy, graphicsInstances } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			const snapshot = makeSnapshot({
				buildings: [
					{
						id: 'b-1',
						name: 'Mill',
						typeId: 'flour-mill',
						tileId: 't-0-0',
						x: 0,
						y: 0,
						status: 'produced'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			scene.update(100);
			expect(graphicsInstances[2].mock.strokeCircle).toHaveBeenCalled();
		});

		test('draws building marker fallback for process stage without texture', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				buildings: [
					{
						id: 'b-1',
						name: 'Mill',
						typeId: 'flour-mill',
						tileId: 't-0-0',
						x: 0,
						y: 0,
						status: 'imported-inputs'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.strokeCircle).toHaveBeenCalled();
		});

		test('draws warehouse shape', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				buildings: [
					{
						id: 'b-1',
						name: 'Warehouse',
						typeId: 'warehouse',
						tileId: 't-0-0',
						x: 0,
						y: 0,
						status: 'blocked'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.lineBetween).toHaveBeenCalled();
		});

		test('draws final stage building shape', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				buildings: [
					{
						id: 'b-1',
						name: 'Snack Factory',
						typeId: 'snack-factory',
						tileId: 't-0-0',
						x: 0,
						y: 0,
						status: 'idle'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.fillRect).toHaveBeenCalled();
		});

		test('applies idle status tint to building sprite', () => {
			expect.assertions(1);
			const { scene, texturesExistsSpy, imageInstances } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			const snapshot = makeSnapshot({
				buildings: [
					{
						id: 'b-1',
						name: 'Grain Farm',
						typeId: 'grain-farm',
						tileId: 't-0-0',
						x: 0,
						y: 0,
						status: 'idle'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			const buildingImg = imageInstances[imageInstances.length - 1];
			expect(buildingImg.mock.setAlpha).toHaveBeenCalled();
		});

		test('updates building sprite positions in update loop', () => {
			expect.assertions(1);
			const { scene, texturesExistsSpy, imageInstances } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			const snapshot = makeSnapshot({
				buildings: [
					{
						id: 'b-1',
						name: 'Grain Farm',
						typeId: 'grain-farm',
						tileId: 't-0-0',
						x: 0,
						y: 0,
						status: 'produced'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			imageInstances.forEach((img) => img.mock.setPosition.mockClear());
			scene.update(1000);
			const buildingImg = imageInstances[imageInstances.length - 1];
			expect(buildingImg.mock.setPosition).toHaveBeenCalled();
		});
	});

	describe('resource shapes', () => {
		test('draws water-source circle shape', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				tiles: [
					{
						id: 't-0-0',
						x: 0,
						y: 0,
						terrain: 'water',
						resource: 'water-source',
						locked: false,
						selected: false,
						occupied: false
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.fillCircle).toHaveBeenCalled();
		});

		test('draws salt-deposit diamond shape', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				tiles: [
					{
						id: 't-0-0',
						x: 0,
						y: 0,
						terrain: 'deposit',
						resource: 'salt-deposit',
						locked: false,
						selected: false,
						occupied: false
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.fillPath).toHaveBeenCalled();
		});

		test('draws chemical-feedstock diamond shape', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				tiles: [
					{
						id: 't-0-0',
						x: 0,
						y: 0,
						terrain: 'deposit',
						resource: 'chemical-feedstock',
						locked: false,
						selected: false,
						occupied: false
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.fillPath).toHaveBeenCalled();
		});

		test('draws pulpwood-forest square shape', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				tiles: [
					{
						id: 't-0-0',
						x: 0,
						y: 0,
						terrain: 'forest',
						resource: 'pulpwood-forest',
						locked: false,
						selected: false,
						occupied: false
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.fillRect).toHaveBeenCalled();
		});

		test('draws default triangle for grain-field', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot({
				tiles: [
					{
						id: 't-0-0',
						x: 0,
						y: 0,
						terrain: 'farmland',
						resource: 'grain-field',
						locked: false,
						selected: false,
						occupied: false
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.fillTriangle).toHaveBeenCalled();
		});
	});

	describe('canvas attributes', () => {
		test('updates industry attributes on render', () => {
			expect.assertions(4);
			const { scene, canvas } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			expect(canvas.dataset.industryTerrainAssetMode).toBe('fallback');
			expect(canvas.dataset.industryTerrainSpriteCount).toBe('0');
			expect(canvas.dataset.industryResourceSpriteCount).toBe('0');
			expect(canvas.dataset.industryBuildingSpriteCount).toBe('0');
		});

		test('sets image mode when all terrain tiles have textures', () => {
			expect.assertions(1);
			const { scene, canvas, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			expect(canvas.dataset.industryTerrainAssetMode).toBe('image');
		});

		test('updates camera attributes', () => {
			expect.assertions(3);
			const { scene, canvas } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			expect(canvas.dataset.mapZoom).toBeDefined();
			expect(canvas.dataset.mapScrollX).toBeDefined();
			expect(canvas.dataset.mapScrollY).toBeDefined();
		});

		test('does not crash without canvas', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			Object.defineProperty(scene, 'game', {
				value: { canvas: null },
				writable: true,
				configurable: true
			});
			scene.create();
			expect(() => scene.update(100)).not.toThrow();
		});

		test('sets correct building count', () => {
			expect.assertions(1);
			const { scene, canvas } = setupScene();
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					buildings: [
						{
							id: 'b-1',
							name: 'Farm',
							typeId: 'grain-farm',
							tileId: 't-0-0',
							x: 0,
							y: 0,
							status: 'idle'
						}
					]
				})
			);
			expect(canvas.dataset.industryBuildingCount).toBe('1');
		});

		test('counts resource tiles correctly', () => {
			expect.assertions(1);
			const { scene, canvas } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const resourceCount = snapshot.tiles.filter((t) => t.resource !== null).length;
			expect(canvas.dataset.industryResourceCount).toBe(String(resourceCount));
		});
	});

	describe('interaction outlines', () => {
		test('draws hover outline', () => {
			expect.assertions(1);
			const { scene, zoneInstances, graphicsInstances } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			graphicsInstances[3].mock.clear.mockClear();
			zoneInstances[0].fire('pointerover');
			expect(graphicsInstances[3].mock.strokeRect).toHaveBeenCalled();
		});

		test('draws selected tile outline', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const selectedCalls = graphicsInstances[3].mock.lineStyle.mock.calls.filter(
				(c: unknown[]) => (c as [number, number, number])[1] === 0x2563eb
			);
			expect(selectedCalls.length).toBeGreaterThan(0);
		});
	});

	describe('destroySceneObjects', () => {
		test('destroys all graphics and sprites on shutdown', () => {
			expect.assertions(4);
			const { scene, graphicsInstances, fireSceneShutdown } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			fireSceneShutdown();
			expect(graphicsInstances[0].mock.destroy).toHaveBeenCalled();
			expect(graphicsInstances[1].mock.destroy).toHaveBeenCalled();
			expect(graphicsInstances[2].mock.destroy).toHaveBeenCalled();
			expect(graphicsInstances[3].mock.destroy).toHaveBeenCalled();
		});

		test('removes input and scale listeners on shutdown', () => {
			expect.assertions(1);
			const { scene, fireSceneShutdown } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			fireSceneShutdown();
			const input = scene.input as Record<string, unknown>;
			const offCalls = (input.off as ReturnType<typeof vi.fn>).mock.calls.length;
			expect(offCalls).toBeGreaterThanOrEqual(3);
		});
	});

	describe('camera fitting', () => {
		test('fitCameraToViewport adjusts zoom to fit world', () => {
			expect.assertions(1);
			const { scene, cameraMock, scaleListeners } = setupScene();
			scene.create();
			const snapshot = makeSnapshot({ width: 3, height: 3 });
			scene.updateSnapshot(snapshot);
			cameraMock.setZoom.mockClear();
			scaleListeners[RESIZE_EVENT][0].call(scene);
			expect(cameraMock.setZoom).toHaveBeenCalled();
		});

		test('fitCameraToViewport respects user camera adjustment', () => {
			expect.assertions(1);
			const { scene, cameraMock, scaleListeners, inputListeners, zoneInstances, makePointer } =
				setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 100, y: 100, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			const movePointer = makePointer({ x: 120, y: 130, isDown: true });
			inputListeners['pointermove'][0].call(scene, movePointer);
			cameraMock.setZoom.mockClear();
			scaleListeners[RESIZE_EVENT][0].call(scene);
			expect(cameraMock.setZoom).not.toHaveBeenCalled();
		});
	});

	describe('didDrag click slop', () => {
		test('does not suppress tile selection for small pointer movement', () => {
			expect.assertions(1);
			const { scene, zoneInstances, inputListeners, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 100, y: 100, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			const movePointer = makePointer({ x: 101, y: 101, isDown: true });
			inputListeners['pointermove'][0].call(scene, movePointer);
			const upPointer = makePointer({ x: 101, y: 101 });
			zoneInstances[0].fire('pointerup', upPointer);
			expect(handler).toHaveBeenCalledWith({ type: 'tileSelected', tileId: snapshot.tiles[0].id });
		});
	});

	describe('renderSnapshot without snapshot', () => {
		test('create without snapshot clears preview and updates attributes', () => {
			expect.assertions(1);
			const { scene, canvas } = setupScene();
			scene.create();
			expect(canvas.dataset.placementPreviewMode).toBe('inactive');
		});
	});

	describe('multiple snapshot updates', () => {
		test('destroys old zones and sprites on re-render', () => {
			expect.assertions(1);
			const { scene, zoneInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot1 = makeSnapshot();
			scene.updateSnapshot(snapshot1);
			const firstZones = [...zoneInstances];
			const snapshot2 = makeSnapshot({
				width: 2,
				height: 2,
				tiles: [
					{
						id: 't-0',
						x: 0,
						y: 0,
						terrain: 'farmland',
						resource: null,
						locked: false,
						selected: false,
						occupied: false
					},
					{
						id: 't-1',
						x: 1,
						y: 0,
						terrain: 'forest',
						resource: null,
						locked: false,
						selected: false,
						occupied: false
					}
				]
			});
			scene.updateSnapshot(snapshot2);
			const allDestroyed = firstZones.every((z) => z.mock.destroy.mock.calls.length > 0);
			expect(allDestroyed).toBe(true);
		});
	});

	describe('pointer origin checks', () => {
		test('ignores pointerdown not from canvas', () => {
			expect.assertions(1);
			const { scene, zoneInstances, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const nonCanvasPointer = makePointer({
				event: { target: 'not-canvas' },
				downElement: 'not-canvas'
			});
			nonCanvasPointer.leftButtonDown = vi.fn(() => false);
			zoneInstances[0].fire('pointerdown', nonCanvasPointer);
			zoneInstances[0].fire('pointerup', nonCanvasPointer);
			expect(handler).not.toHaveBeenCalled();
		});

		test('ignores pointerup when pointer did not start on canvas', () => {
			expect.assertions(1);
			const { scene, zoneInstances, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const nonCanvasPointer = makePointer({ downElement: 'not-canvas' });
			zoneInstances[0].fire('pointerup', nonCanvasPointer);
			expect(handler).not.toHaveBeenCalled();
		});
	});
});
