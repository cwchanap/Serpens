/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { IndustryMapBuildingRender, IndustryMapSnapshot } from '../game/industryMapRender';
import type { MapActivity, MapActivityBatch } from '../game/mapActivityFeedback';
import { INDUSTRY_MATERIAL_ART_LIST, getIndustryMaterialArt } from '../assets/gameArt';

type Listener = (...args: unknown[]) => void;

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
		setAngle: vi.fn(),
		destroy: vi.fn()
	};
	const chainable = createChainableMock(mock);
	return { mock, chainable };
}

function createZoneMock() {
	const listeners: Record<string, Listener[]> = {};
	const mock = {
		setOrigin: vi.fn(),
		setInteractive: vi.fn(),
		on: vi.fn((event: string, handler: Listener) => {
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
				button = 0;
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

import { IndustryMapScene, railArtForConnections } from './industryMapScene';

const s = (scene: IndustryMapScene) => scene as unknown as Record<string, any>;

function setupScene() {
	const canvas = createCanvasElement();
	const loadImageSpy = vi.fn();
	const texturesExistsSpy = vi.fn<(key: string) => boolean>(() => false);
	const inputListeners: Record<string, Listener[]> = {};
	const keyboardListeners: Record<string, Listener[]> = {};
	const scaleListeners: Record<string, Listener[]> = {};
	let sceneEventsListeners: Record<string, Listener[]> = {};

	const graphicsInstances: ReturnType<typeof createGraphicsMock>[] = [];
	const imageInstances: ReturnType<typeof createImageMock>[] = [];
	const zoneInstances: ReturnType<typeof createZoneMock>[] = [];

	const cameraMock = {
		setZoom: vi.fn(),
		setScroll: vi.fn(),
		centerOn: vi.fn(),
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
			image: vi.fn(() => {
				const img = createImageMock();
				imageInstances.push(img);
				return img.chainable;
			}),
			zone: vi.fn(() => {
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
			on: vi.fn((event: string, handler: Listener) => {
				if (!inputListeners[event]) inputListeners[event] = [];
				inputListeners[event].push(handler);
			}),
			off: vi.fn((event: string, handler: Listener) => {
				if (inputListeners[event]) {
					inputListeners[event] = inputListeners[event].filter((h) => h !== handler);
				}
			}),
			keyboard: {
				on: vi.fn((event: string, handler: Listener) => {
					if (!keyboardListeners[event]) keyboardListeners[event] = [];
					keyboardListeners[event].push(handler);
				}),
				off: vi.fn((event: string, handler: Listener) => {
					if (keyboardListeners[event]) {
						keyboardListeners[event] = keyboardListeners[event].filter((h) => h !== handler);
					}
				})
			}
		},
		writable: false,
		configurable: true
	});

	Object.defineProperty(scene, 'scale', {
		value: {
			on: vi.fn((event: string, handler: Listener) => {
				if (!scaleListeners[event]) scaleListeners[event] = [];
				scaleListeners[event].push(handler);
			}),
			off: vi.fn((event: string, handler: Listener) => {
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
			once: vi.fn((event: string, handler: Listener) => {
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

	function fireKeydownEscape() {
		for (const handler of keyboardListeners['keydown-ESC'] ?? []) {
			handler.call(scene);
		}
	}

	function makePointer(overrides: Record<string, unknown> = {}) {
		return {
			x: 0,
			y: 0,
			worldX: 0,
			worldY: 0,
			isDown: false,
			button: 0,
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
		keyboardListeners,
		scaleListeners,
		fireSceneShutdown,
		fireKeydownEscape,
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
		rails: [],
		railPreview: null,
		...overrides
	};
}

// create() reports sceneReady through the handler; interaction assertions ignore that event.
function interactionEvents(handler: ReturnType<typeof vi.fn>): unknown[] {
	return handler.mock.calls
		.map(([event]) => event as { type: string })
		.filter((event) => event.type !== 'sceneReady');
}

describe('IndustryMapScene', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		test('sets scene key to IndustryMapScene', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			expect((scene as unknown as { key: string }).key).toBe('IndustryMapScene');
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
		test('creates five graphics objects at correct depths', () => {
			expect.assertions(4);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			expect(graphicsInstances.length).toBe(5);
			expect(graphicsInstances[0].mock.setDepth).toHaveBeenCalled();
			expect(graphicsInstances[1].mock.setDepth).toHaveBeenCalled();
			expect(graphicsInstances[4].mock.setDepth).toHaveBeenCalled();
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
			const eventsOnce = (scene.events as unknown as Record<string, unknown>).once as ReturnType<
				typeof vi.fn
			>;
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
			expect((scene as unknown as { eventHandler: typeof handler }).eventHandler).toBe(handler);
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
			expect.assertions(2);
			const { scene, inputListeners, makePointer } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 5, y: 5, worldX: 5, worldY: 5 });
			inputListeners['pointermove'][0].call(scene, pointer);
			expect((scene as unknown as { hoverTileId: string | null }).hoverTileId).toBe(
				snapshot.tiles[0].id
			);
			const snapshotWithoutTile = makeSnapshot({
				tiles: [
					{
						id: 't-1-0',
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
			scene.updateSnapshot(snapshotWithoutTile);
			expect((scene as unknown as { hoverTileId: string | null }).hoverTileId).toBeNull();
		});

		test('does not throw when called before create() with rails in the snapshot', () => {
			// Reproduces the pre-boot path in IndustryMap.svelte's startPhaser:
			// `new Phaser.Game()` does not inject scene services synchronously,
			// so updateSnapshot runs before textures/add exist. A snapshot with
			// rails must not crash (it would mark the map unavailable) and must
			// be stored so create() can render it once the scene boots.
			expect.assertions(2);
			const scene = new IndustryMapScene();
			const snapshot = makeSnapshot({
				rails: [{ x: 0, y: 0, level: 1, connections: 5, utilization: 0 }]
			});
			expect(() => scene.updateSnapshot(snapshot)).not.toThrow();
			expect((scene as unknown as { snapshot: IndustryMapSnapshot }).snapshot).toBe(snapshot);
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
			expect(graphicsInstances[3].mock.clear).toHaveBeenCalled();
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

	describe('keyboard pan', () => {
		// `addKeys?.` is the hardened optional-chained lookup; exercise each leg:
		// keyboard missing, keyboard present but addKeys missing, and addKeys callable.
		function makePanKeys(
			overrides: Partial<Record<'W' | 'A' | 'S' | 'D', { isDown: boolean }>> = {}
		) {
			return {
				W: { isDown: false },
				A: { isDown: false },
				S: { isDown: false },
				D: { isDown: false },
				...overrides
			};
		}

		test('sets panKeys to null when keyboard input is unavailable', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			s(scene).input.keyboard = undefined;
			scene.create();
			expect(s(scene).panKeys).toBeNull();
		});

		test('sets panKeys to null when keyboard has no addKeys method', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			expect(s(scene).panKeys).toBeNull();
		});

		test('registers panKeys from keyboard.addKeys when available', () => {
			expect.assertions(2);
			const { scene } = setupScene();
			const keys = makePanKeys();
			const addKeys = vi.fn(() => keys);
			s(scene).input.keyboard.addKeys = addKeys;
			scene.create();
			expect(addKeys).toHaveBeenCalledWith('W,A,S,D', false);
			expect(s(scene).panKeys).toBe(keys);
		});

		test('updateKeyboardPan scrolls the camera when a pan key is held', () => {
			expect.assertions(3);
			const { scene, cameraMock } = setupScene();
			s(scene).input.keyboard.addKeys = vi.fn(() => makePanKeys({ D: { isDown: true } }));
			scene.create();
			scene.update(0, 1000);
			expect(cameraMock.scrollX).toBe(420);
			expect(cameraMock.scrollY).toBe(0);
			expect(s(scene).hasUserAdjustedCamera).toBe(true);
		});

		test('updateKeyboardPan is a no-op when keyboard pan is disabled', () => {
			expect.assertions(2);
			const { scene, cameraMock } = setupScene();
			s(scene).input.keyboard.addKeys = vi.fn(() => makePanKeys({ D: { isDown: true } }));
			scene.create();
			scene.setKeyboardEnabled(false);
			scene.update(0, 1000);
			expect(cameraMock.scrollX).toBe(0);
			expect(s(scene).hasUserAdjustedCamera).toBe(false);
		});

		test('updateKeyboardPan is a no-op when no pan keys are held', () => {
			expect.assertions(2);
			const { scene, cameraMock } = setupScene();
			s(scene).input.keyboard.addKeys = vi.fn(() => makePanKeys());
			scene.create();
			scene.update(0, 1000);
			expect(cameraMock.scrollX).toBe(0);
			expect(s(scene).hasUserAdjustedCamera).toBe(false);
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

		test('draws occupied building footprint as a 2x2 outline during placement', () => {
			expect.assertions(2);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const footprintTileIds = new Set(['t-0-0', 't-1-0', 't-0-1', 't-1-1']);
			const snapshot = makeSnapshot({
				placementPreview: { validTileIds: [], invalidTileIds: [] },
				tiles: makeSnapshot().tiles.map((tile) => ({
					...tile,
					occupied: footprintTileIds.has(tile.id)
				})),
				buildings: [
					{
						id: 'b-1',
						name: 'Warehouse',
						typeId: 'warehouse',
						tileId: 't-0-0',
						x: 0,
						y: 0,
						width: 2,
						height: 2,
						status: 'idle'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[1].mock.strokeRect).toHaveBeenCalledWith(3, 3, 58, 58);
			expect(graphicsInstances[1].mock.strokeRect).not.toHaveBeenCalledWith(3, 3, 26, 26);
		});
	});

	describe('sceneReady', () => {
		test('emits sceneReady once from create() and still emits tileSelected on a tap', () => {
			expect.assertions(1);
			const { scene, zoneInstances, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const zone = zoneInstances[0];
			const pointer = makePointer({ x: 5, y: 5, worldX: 5, worldY: 5, isDown: true });
			zone.fire('pointerdown', pointer);
			zone.fire('pointerup', pointer);
			expect(handler.mock.calls.map(([event]) => event)).toEqual([
				{ type: 'sceneReady' },
				{ type: 'tileSelected', tileId: snapshot.tiles[0].id }
			]);
		});
	});

	describe('tile zones', () => {
		test('creates a single map interaction zone', () => {
			expect.assertions(1);
			const { scene, zoneInstances } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			expect(zoneInstances.length).toBe(1);
		});

		test('zone pointerup triggers tileSelected event on handler', () => {
			expect.assertions(1);
			const { scene, zoneInstances, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const zone = zoneInstances[0];
			const pointer = makePointer({ x: 5, y: 5, worldX: 5, worldY: 5, isDown: true });
			zone.fire('pointerdown', pointer);
			zone.fire('pointerup', pointer);
			expect(handler).toHaveBeenCalledWith({ type: 'tileSelected', tileId: snapshot.tiles[0].id });
		});

		test('pointermove sets hoverTileId and draws outlines', () => {
			expect.assertions(1);
			const { scene, inputListeners, graphicsInstances, makePointer } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			graphicsInstances[4].mock.clear.mockClear();
			const pointer = makePointer({ x: 5, y: 5, worldX: 5, worldY: 5 });
			inputListeners['pointermove'][0].call(scene, pointer);
			expect(graphicsInstances[4].mock.strokeRect).toHaveBeenCalled();
		});

		test('zone pointerout clears hoverTileId', () => {
			expect.assertions(1);
			const { scene, zoneInstances, inputListeners, graphicsInstances, makePointer } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 5, y: 5, worldX: 5, worldY: 5 });
			inputListeners['pointermove'][0].call(scene, pointer);
			graphicsInstances[4].mock.clear.mockClear();
			zoneInstances[0].fire('pointerout');
			expect(graphicsInstances[4].mock.clear).toHaveBeenCalled();
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
			expect((scene as unknown as { isDragging: boolean }).isDragging).toBe(true);
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
			expect.assertions(2);
			const { scene, zoneInstances, inputListeners, makePointer } = setupScene();
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 100, y: 100, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			inputListeners['pointerup'][0].call(scene);
			expect((scene as unknown as { isDragging: boolean }).isDragging).toBe(false);
			expect(
				(scene as unknown as { lastDragPoint: { x: number; y: number } | null }).lastDragPoint
			).toBeNull();
		});

		test('tile selection is suppressed after drag', () => {
			expect.assertions(1);
			const { scene, zoneInstances, inputListeners, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({ x: 100, y: 100, worldX: 100, worldY: 100, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			const movePointer = makePointer({ x: 200, y: 200, worldX: 200, worldY: 200, isDown: true });
			inputListeners['pointermove'][0].call(scene, movePointer);
			const upPointer = makePointer({ x: 200, y: 200, worldX: 200, worldY: 200 });
			zoneInstances[0].fire('pointerup', upPointer);
			expect(interactionEvents(handler)).toEqual([]);
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
			expect(graphicsInstances[2].mock.fillRect).toHaveBeenCalled();
			expect(graphicsInstances[2].mock.fillStyle).toHaveBeenCalled();
			expect(graphicsInstances[2].mock.strokeRect).toHaveBeenCalled();
		});

		test('draws placement preview as 2x2 footprints', () => {
			expect.assertions(2);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t-0-0'],
						invalidTileIds: []
					}
				})
			);
			expect(graphicsInstances[2].mock.fillRect).toHaveBeenCalledWith(2, 2, 60, 60);
			expect(graphicsInstances[2].mock.fillRect).not.toHaveBeenCalledWith(2, 2, 28, 28);
		});

		test('merges contiguous same-row placement tiles into a single run', () => {
			// Mirrors the retail scene's run-span optimization: 3 contiguous
			// valid tiles in row 0 + 2 contiguous invalid tiles in row 1 should
			// produce exactly 2 fillRect calls (one per run), not 5.
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t-0-0', 't-1-0', 't-2-0'],
						invalidTileIds: ['t-0-1', 't-1-1']
					}
				})
			);
			expect(graphicsInstances[2].mock.fillRect).toHaveBeenCalledTimes(2);
		});

		test('breaks placement preview spans across non-contiguous tiles', () => {
			// t-0-0 (0,0) and t-0-1 (0,1) are on different rows -> two runs.
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t-0-0', 't-0-1'],
						invalidTileIds: []
					}
				})
			);
			expect(graphicsInstances[2].mock.fillRect).toHaveBeenCalledTimes(2);
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

		test('emphasizes resource-anchored previews with a brighter valid fill', () => {
			expect.assertions(3);
			const { scene, canvas, graphicsInstances } = setupScene();
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t-0-0'],
						invalidTileIds: ['t-1-0'],
						requiredResource: 'water-source'
					}
				})
			);
			expect(canvas.dataset.placementPreviewEmphasis).toBe('resource');
			expect(graphicsInstances[2].mock.fillStyle).toHaveBeenCalledWith(0xf2c14e, 0.55);
			expect(graphicsInstances[2].mock.fillStyle).toHaveBeenCalledWith(0x8e2a1f, 0.1);
		});

		test('keeps the standard preview for buildings without a required resource', () => {
			expect.assertions(2);
			const { scene, canvas, cameraMock } = setupScene();
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({ placementPreview: { validTileIds: ['t-0-0'], invalidTileIds: [] } })
			);
			expect(canvas.dataset.placementPreviewEmphasis).toBe('none');
			expect(cameraMock.centerOn).not.toHaveBeenCalled();
		});

		test('pans once to the nearest resource anchor when none is on screen', () => {
			expect.assertions(3);
			const { scene, cameraMock } = setupScene();
			scene.create();
			cameraMock.worldView = { x: 2000, y: 2000, width: 400, height: 300 };
			const resourceSnapshot = makeSnapshot({
				placementPreview: {
					validTileIds: ['t-0-0', 't-1-0'],
					invalidTileIds: [],
					requiredResource: 'water-source'
				}
			});
			scene.updateSnapshot(resourceSnapshot);
			// Nearest anchor to the (2200, 2150) view center is t-1-0 at (1, 0).
			expect(cameraMock.centerOn).toHaveBeenCalledWith(64, 32);
			scene.updateSnapshot(resourceSnapshot);
			expect(cameraMock.centerOn).toHaveBeenCalledTimes(1);
			scene.updateSnapshot(makeSnapshot({ placementPreview: null }));
			scene.updateSnapshot(resourceSnapshot);
			expect(cameraMock.centerOn).toHaveBeenCalledTimes(2);
		});

		test('does not pan when a resource anchor is already visible', () => {
			expect.assertions(1);
			const { scene, cameraMock } = setupScene();
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t-0-0'],
						invalidTileIds: [],
						requiredResource: 'water-source'
					}
				})
			);
			expect(cameraMock.centerOn).not.toHaveBeenCalled();
		});
	});

	describe('resource markers', () => {
		test('does not draw resource marker fallbacks when no texture exists', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			scene.update(500);
			expect(graphicsInstances[2].mock.fillStyle).not.toHaveBeenCalled();
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
		test('does not draw building marker fallbacks when no texture exists', () => {
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
						width: 2,
						height: 2,
						status: 'idle'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.fillStyle).not.toHaveBeenCalled();
		});

		test('creates building sprite when texture exists', () => {
			expect.assertions(3);
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
						width: 2,
						height: 2,
						status: 'produced'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(imageInstances.length).toBeGreaterThan(0);
			const buildingImg = imageInstances[imageInstances.length - 1]!;
			expect(buildingImg.mock.setDisplaySize).toHaveBeenCalledWith(64, 64);
			expect(s(scene).getBuildingMarkerPosition(snapshot.buildings[0], 0, 0)).toMatchObject({
				x: 32,
				y: 32
			});
		});

		test('keeps a 24 pixel status dot above the building artwork as the camera zooms', () => {
			expect.assertions(4);
			const { scene, cameraMock, texturesExistsSpy, graphicsInstances } = setupScene();
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
						width: 2,
						height: 2,
						status: 'produced'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			scene.update(100);
			expect(graphicsInstances[3].mock.strokeCircle).toHaveBeenLastCalledWith(
				32,
				expect.any(Number),
				12
			);
			cameraMock.zoom = 2.2;
			scene.update(200);
			expect(
				graphicsInstances[3].mock.strokeCircle.mock.lastCall?.[2] * cameraMock.zoom
			).toBeCloseTo(12);
			expect(graphicsInstances[3].mock.strokeCircle.mock.lastCall?.[1]).toBeLessThan(0);
			expect(graphicsInstances[3].mock.fillStyle).toHaveBeenLastCalledWith(0x4b5a2b, 0.98);
		});

		test('does not draw process-stage marker fallbacks without texture', () => {
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
						width: 2,
						height: 2,
						status: 'imported-inputs'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.strokeCircle).not.toHaveBeenCalled();
		});

		test('does not draw warehouse marker fallback shapes without texture', () => {
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
						width: 2,
						height: 2,
						status: 'blocked'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.lineBetween).not.toHaveBeenCalled();
		});

		test('does not draw final-stage marker fallback shapes without texture', () => {
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
						width: 2,
						height: 2,
						status: 'idle'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			expect(graphicsInstances[2].mock.fillRect).not.toHaveBeenCalled();
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
						width: 2,
						height: 2,
						status: 'idle'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			const buildingImg = imageInstances[imageInstances.length - 1];
			expect(buildingImg.mock.setAlpha).not.toHaveBeenCalled();
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
						width: 2,
						height: 2,
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

	describe('canvas attributes', () => {
		test('updates industry attributes on render', () => {
			expect.assertions(4);
			const { scene, canvas } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			expect(canvas.dataset.industryTerrainAssetMode).toBe('missing');
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
							width: 2,
							height: 2,
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
			const { scene, inputListeners, graphicsInstances, makePointer } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			graphicsInstances[4].mock.clear.mockClear();
			const pointer = makePointer({ x: 5, y: 5, worldX: 5, worldY: 5 });
			inputListeners['pointermove'][0].call(scene, pointer);
			expect(graphicsInstances[4].mock.strokeRect).toHaveBeenCalled();
		});

		test('draws selected tile outline', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const selectedCalls = graphicsInstances[4].mock.lineStyle.mock.calls.filter(
				(c: unknown[]) => (c as [number, number, number])[1] === 0xd4a852
			);
			expect(selectedCalls.length).toBeGreaterThan(0);
		});

		test('draws selected occupied building as a 2x2 outline', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					selectedTileId: 't-1-1',
					tiles: makeSnapshot().tiles.map((tile) => ({
						...tile,
						selected: tile.id === 't-1-1'
					})),
					buildings: [
						{
							id: 'b-1',
							name: 'Warehouse',
							typeId: 'warehouse',
							tileId: 't-0-0',
							x: 0,
							y: 0,
							width: 2,
							height: 2,
							status: 'idle'
						}
					]
				})
			);
			expect(graphicsInstances[4].mock.strokeRect).toHaveBeenCalledWith(1, 1, 62, 62);
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
			const input = scene.input as unknown as Record<string, unknown>;
			const offCalls = (input.off as ReturnType<typeof vi.fn>).mock.calls.length;
			expect(offCalls).toBeGreaterThanOrEqual(3);
		});
	});

	describe('camera fitting', () => {
		test('frames initial buildings near the mock 144 pixel scale on a wide viewport', () => {
			const { scene, cameraMock } = setupScene();
			Object.assign(scene.scale, { width: 1920, height: 1080 });
			scene.create();
			scene.updateSnapshot(makeSnapshot({ width: 56, height: 48 }));
			expect(cameraMock.setZoom).toHaveBeenLastCalledWith(2.2);
		});

		test('retains a wider initial building view on a narrow viewport', () => {
			const { scene, cameraMock } = setupScene();
			Object.assign(scene.scale, { width: 1104, height: 1000 });
			scene.create();
			scene.updateSnapshot(makeSnapshot({ width: 56, height: 48 }));
			expect(cameraMock.setZoom).toHaveBeenLastCalledWith(1.5);
		});

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

		test('reframes the camera when the active city changes after a user adjustment', () => {
			// A city swap (different cityId in the terrain key) must reset the
			// user's pan/zoom so the new city auto-frames, while a same-city
			// re-render still honors the adjustment.
			expect.assertions(3);
			const { scene, cameraMock, inputListeners, zoneInstances, makePointer } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot()); // city-1
			const pointer = makePointer({ x: 100, y: 100, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			inputListeners['pointermove'][0].call(scene, makePointer({ x: 140, y: 150, isDown: true }));
			expect(s(scene).hasUserAdjustedCamera).toBe(true);
			cameraMock.setZoom.mockClear();
			scene.updateSnapshot(makeSnapshot()); // same city, no terrain change
			expect(cameraMock.setZoom).not.toHaveBeenCalled();
			scene.updateSnapshot(makeSnapshot({ cityId: 'city-2' })); // city swap
			expect(cameraMock.setZoom).toHaveBeenCalled();
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
			const pointer = makePointer({ x: 100, y: 100, worldX: 5, worldY: 5, isDown: true });
			zoneInstances[0].fire('pointerdown', pointer);
			const movePointer = makePointer({ x: 101, y: 101, worldX: 5, worldY: 5, isDown: true });
			inputListeners['pointermove'][0].call(scene, movePointer);
			const upPointer = makePointer({ x: 101, y: 101, worldX: 5, worldY: 5 });
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
			expect(interactionEvents(handler)).toEqual([]);
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
			expect(interactionEvents(handler)).toEqual([]);
		});
	});

	describe('branch coverage', () => {
		test('re-renders without rebuilding terrain when terrain key is unchanged', () => {
			expect.assertions(1);
			const { scene, zoneInstances } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const firstZones = [...zoneInstances];
			scene.updateSnapshot(makeSnapshot());
			const allSurvived = firstZones.every((z) => z.mock.destroy.mock.calls.length === 0);
			expect(allSurvived).toBe(true);
		});

		test('re-renders without rebuilding terrain when only tile occupancy changes after building placement', () => {
			expect.assertions(2);
			const { scene, imageInstances, zoneInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						{
							id: 't-0-0',
							x: 0,
							y: 0,
							terrain: 'industrial',
							resource: null,
							locked: false,
							selected: false,
							occupied: false
						}
					]
				})
			);
			const firstImages = [...imageInstances];
			const firstZones = [...zoneInstances];
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						{
							id: 't-0-0',
							x: 0,
							y: 0,
							terrain: 'industrial',
							resource: null,
							locked: false,
							selected: false,
							occupied: true
						}
					],
					buildings: [
						{
							id: 'b1',
							name: 'Warehouse',
							typeId: 'warehouse',
							tileId: 't-0-0',
							x: 0,
							y: 0,
							width: 2,
							height: 2,
							status: 'idle'
						}
					]
				})
			);
			expect(firstImages.every((image) => image.mock.destroy.mock.calls.length === 0)).toBe(true);
			expect(firstZones.every((zone) => zone.mock.destroy.mock.calls.length === 0)).toBe(true);
		});

		test('updates selectedTile from selectedTileId on re-render with unchanged terrain', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			scene.updateSnapshot(makeSnapshot({ selectedTileId: 't-0-0' }));
			expect(s(scene).selectedTile?.id).toBe('t-0-0');
		});

		test('sets selectedTile to null when selectedTileId references a missing tile on re-render', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			scene.updateSnapshot(makeSnapshot({ selectedTileId: 'missing' }));
			expect(s(scene).selectedTile).toBeNull();
		});

		test('computeTerrainKey returns empty string when no snapshot', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			expect(s(scene).computeTerrainKey()).toBe('');
		});

		test('drawTile returns early when mapGraphics is missing', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			s(scene).mapGraphics = undefined;
			expect(() => s(scene).drawTile(makeSnapshot().tiles[0])).not.toThrow();
		});

		test('createMapInteractionZone returns early when no snapshot', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			const before = s(scene).tileZones.length;
			s(scene).createMapInteractionZone();
			expect(s(scene).tileZones.length).toBe(before);
		});

		test('pointerup does not fire tileSelected when pointer is outside the grid', () => {
			expect.assertions(1);
			const { scene, zoneInstances, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const zone = zoneInstances[0];
			const pointer = makePointer({ x: 5, y: 5, worldX: 5, worldY: 5, isDown: true });
			zone.fire('pointerdown', pointer);
			const upPointer = makePointer({ x: 5, y: 5, worldX: 9999, worldY: 9999 });
			zone.fire('pointerup', upPointer);
			expect(interactionEvents(handler)).toEqual([]);
		});

		test('pointerout does nothing when hoverTileId is already null', () => {
			expect.assertions(1);
			const { scene, zoneInstances, graphicsInstances } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			s(scene).hoverTileId = null;
			graphicsInstances[3].mock.clear.mockClear();
			zoneInstances[0].fire('pointerout');
			expect(graphicsInstances[3].mock.clear).not.toHaveBeenCalled();
		});

		test('getTileAtPointer falls back to pointer.x/y when worldX/worldY are undefined', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const tile = s(scene).getTileAtPointer({ x: 5, y: 5, worldX: undefined, worldY: undefined });
			expect(tile?.id).toBe('t-0-0');
		});

		test('rebuildMarkerSprites updates attributes and returns when snapshot is null', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			s(scene).snapshot = null;
			expect(() => s(scene).rebuildMarkerSprites()).not.toThrow();
		});

		test('drawMarkerGraphics returns early when markerGraphics is missing', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			s(scene).markerGraphics = undefined;
			expect(() => s(scene).drawMarkerGraphics(0)).not.toThrow();
		});

		test('createResourceSprite returns early when tile has no resource', () => {
			expect.assertions(1);
			const { scene, imageInstances } = setupScene();
			scene.create();
			const before = imageInstances.length;
			s(scene).createResourceSprite(makeSnapshot().tiles[0]);
			expect(imageInstances.length).toBe(before);
		});

		test('drawBuildingStatusDot returns early when markerGraphics is missing', () => {
			expect.assertions(1);
			const { scene } = setupScene();
			scene.create();
			s(scene).markerGraphics = undefined;
			const building = {
				id: 'b',
				name: 'B',
				typeId: 'grain-farm',
				tileId: 't',
				x: 0,
				y: 0,
				status: 'idle'
			};
			expect(() => s(scene).drawBuildingStatusDot(building, 0, 0)).not.toThrow();
		});

		test('drawInteractionOutlines returns early when snapshot is null', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			s(scene).snapshot = null;
			graphicsInstances[3].mock.clear.mockClear();
			s(scene).drawInteractionOutlines();
			expect(graphicsInstances[3].mock.clear).not.toHaveBeenCalled();
		});

		test('handlePointerMove uses zoom fallback of 1 when camera zoom is 0 during drag', () => {
			expect.assertions(1);
			const { scene, inputListeners, cameraMock, makePointer } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			cameraMock.zoom = 0;
			s(scene).isDragging = true;
			s(scene).lastDragPoint = { x: 10, y: 10 };
			s(scene).dragStartPoint = { x: 10, y: 10 };
			const pointer = makePointer({ x: 20, y: 20, isDown: true });
			inputListeners['pointermove'][0].call(scene, pointer);
			expect(cameraMock.scrollX).toBe(-10);
		});

		test('handlePointerMove does not update hover when pointer is not on canvas', () => {
			expect.assertions(1);
			const { scene, inputListeners, makePointer } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			s(scene).hoverTileId = null;
			const pointer = makePointer({
				event: { target: 'not-canvas' },
				x: 5,
				y: 5,
				worldX: 5,
				worldY: 5
			});
			inputListeners['pointermove'][0].call(scene, pointer);
			expect(s(scene).hoverTileId).toBeNull();
		});

		test('didDrag returns false when dragStartPoint is null', () => {
			expect.assertions(1);
			const { scene, makePointer } = setupScene();
			scene.create();
			s(scene).hasDragged = false;
			s(scene).dragStartPoint = null;
			const pointer = makePointer({ x: 100, y: 100 });
			expect(s(scene).didDrag(pointer)).toBe(false);
		});

		test('setCameraBounds uses minimum tile size when snapshot is null', () => {
			expect.assertions(1);
			const { scene, cameraMock } = setupScene();
			scene.create();
			s(scene).snapshot = null;
			s(scene).setCameraBounds();
			expect(cameraMock.setBounds).toHaveBeenCalledWith(0, 0, 32, 32);
		});

		test('updateCanvasCameraAttributes uses zoom fallback of 1 when zoom is 0', () => {
			expect.assertions(1);
			const { scene, canvas, cameraMock } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			cameraMock.zoom = 0;
			s(scene).lastCameraKey = null;
			s(scene).updateCanvasCameraAttributes();
			expect(Number(canvas.dataset.mapZoom)).toBe(1);
		});

		test('updateCanvasCameraAttributes falls back to scale dimensions when worldView is zero', () => {
			expect.assertions(2);
			const { scene, canvas, cameraMock } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			cameraMock.zoom = 1;
			cameraMock.worldView = { x: 0, y: 0, width: 0, height: 0 };
			s(scene).lastCameraKey = null;
			s(scene).updateCanvasCameraAttributes();
			expect(Number(canvas.dataset.mapViewWidth)).toBe(800);
			expect(Number(canvas.dataset.mapViewHeight)).toBe(600);
		});

		test('clears occupancy borders outside placement mode', () => {
			const { scene, graphicsInstances } = setupScene();
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
						width: 2,
						height: 2,
						status: 'idle'
					}
				]
			});
			scene.updateSnapshot(snapshot);
			const graphics = graphicsInstances[1].mock;
			expect(graphics.strokeRect).not.toHaveBeenCalled();
			scene.updateSnapshot({
				...snapshot,
				placementPreview: { validTileIds: [], invalidTileIds: [] }
			});
			expect(graphics.strokeRect).toHaveBeenCalledWith(3, 3, 58, 58);
			graphics.clear.mockClear();
			graphics.strokeRect.mockClear();
			scene.updateSnapshot(snapshot);
			expect(graphics.clear).toHaveBeenCalled();
			expect(graphics.strokeRect).not.toHaveBeenCalled();
		});

		test('drawOccupancyOutlines returns early when occupancyGraphics is missing', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			s(scene).occupancyGraphics = undefined;
			graphicsInstances[1].mock.clear.mockClear();
			expect(() => s(scene).drawOccupancyOutlines()).not.toThrow();
		});

		test('drawPlacementPreview skips tile ids that are not in the tile map', () => {
			expect.assertions(1);
			const { scene, graphicsInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['unknown-tile'],
						invalidTileIds: ['also-unknown']
					}
				})
			);
			expect(graphicsInstances[2].mock.fillRect).not.toHaveBeenCalled();
		});

		test('drawPlacementPreview draws invalid spans before valid spans so shared footprint cells stay valid', () => {
			expect.assertions(2);
			const { scene } = setupScene();
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t-0-0'],
						invalidTileIds: ['t-1-0']
					}
				})
			);
			const spy = vi.spyOn(s(scene), 'drawPlacementPreviewSpans');
			s(scene).drawPlacementPreview();
			expect(spy.mock.calls[0]![1]).toBe(0x8e2a1f);
			expect(spy.mock.calls[1]![1]).toBe(0x6b7e3a);
			spy.mockRestore();
		});
	});

	describe('rail rendering', () => {
		test('does not create rail sprites when no rail texture exists', () => {
			expect.assertions(1);
			const { scene, imageInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({ rails: [{ x: 0, y: 0, level: 1, connections: 10, utilization: 0 }] })
			);
			expect(imageInstances.length).toBe(0);
		});

		test('creates a rail sprite sized, depthed, and rotated per connection mask', () => {
			expect.assertions(3);
			const { scene, imageInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({ rails: [{ x: 1, y: 2, level: 1, connections: 10, utilization: 0 }] })
			);
			const railSprite = imageInstances[imageInstances.length - 1]!;
			expect(railSprite.mock.setDisplaySize).toHaveBeenCalledWith(32, 32);
			// OCCUPANCY_OUTLINE_DEPTH + 1 = 3
			expect(railSprite.mock.setDepth).toHaveBeenCalledWith(3);
			// connections=10 (E+W) -> straight rotated 0 degrees
			expect(railSprite.mock.setAngle).toHaveBeenCalledWith(0);
		});

		test('leaves rail sprite untinted below the medium utilization threshold', () => {
			expect.assertions(2);
			const { scene, imageInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({ rails: [{ x: 0, y: 0, level: 1, connections: 10, utilization: 0.5 }] })
			);
			const railSprite = imageInstances[imageInstances.length - 1]!;
			expect(railSprite.mock.clearTint).toHaveBeenCalled();
			expect(railSprite.mock.setTint).not.toHaveBeenCalled();
		});

		test('tints rail sprite amber at or above the 0.75 utilization threshold', () => {
			expect.assertions(1);
			const { scene, imageInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({ rails: [{ x: 0, y: 0, level: 1, connections: 10, utilization: 0.75 }] })
			);
			const railSprite = imageInstances[imageInstances.length - 1]!;
			expect(railSprite.mock.setTint).toHaveBeenCalledWith(0xf59e0b);
		});

		test('tints rail sprite red at or above the 1.0 utilization threshold', () => {
			expect.assertions(1);
			const { scene, imageInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({ rails: [{ x: 0, y: 0, level: 1, connections: 10, utilization: 1 }] })
			);
			const railSprite = imageInstances[imageInstances.length - 1]!;
			expect(railSprite.mock.setTint).toHaveBeenCalledWith(0xef4444);
		});

		test('updates rail canvas data attributes with cell and sprite counts', () => {
			expect.assertions(2);
			const { scene, canvas, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					rails: [
						{ x: 0, y: 0, level: 1, connections: 10, utilization: 0 },
						{ x: 1, y: 0, level: 1, connections: 10, utilization: 0 }
					]
				})
			);
			expect(canvas.dataset.railCellCount).toBe('2');
			expect(canvas.dataset.railSpriteCount).toBe('2');
		});

		test('sets rail attributes to zero when there is no snapshot', () => {
			expect.assertions(2);
			const { scene, canvas } = setupScene();
			scene.create();
			expect(canvas.dataset.railCellCount).toBe('0');
			expect(canvas.dataset.railSpriteCount).toBe('0');
		});

		test('destroys previous rail sprites when re-rendering', () => {
			expect.assertions(1);
			const { scene, imageInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({ rails: [{ x: 0, y: 0, level: 1, connections: 10, utilization: 0 }] })
			);
			const firstRailSprite = imageInstances[imageInstances.length - 1]!;
			scene.updateSnapshot(
				makeSnapshot({ rails: [{ x: 0, y: 0, level: 1, connections: 15, utilization: 0 }] })
			);
			expect(firstRailSprite.mock.destroy).toHaveBeenCalled();
		});

		test('destroys rail sprites on shutdown', () => {
			expect.assertions(1);
			const { scene, imageInstances, texturesExistsSpy, fireSceneShutdown } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({ rails: [{ x: 0, y: 0, level: 1, connections: 10, utilization: 0 }] })
			);
			const railSprite = imageInstances[imageInstances.length - 1]!;
			fireSceneShutdown();
			expect(railSprite.mock.destroy).toHaveBeenCalled();
		});
	});

	describe('rail build preview', () => {
		test('draws new preview cells with the valid placement color', () => {
			expect.assertions(2);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot({ railPreview: { cells: [{ x: 0, y: 0, isNew: true }] } }));
			expect(graphicsInstances[2].mock.fillStyle).toHaveBeenCalledWith(0x6b7e3a, 0.28);
			expect(graphicsInstances[2].mock.fillRect).toHaveBeenCalledWith(6, 6, 20, 20);
		});

		test('draws reused preview cells with the neutral gray color', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({ railPreview: { cells: [{ x: 0, y: 0, isNew: false }] } })
			);
			expect(graphicsInstances[2].mock.fillStyle).toHaveBeenCalledWith(0x94a3b8, 0.28);
		});

		test('draws nothing when there is no rail preview', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = setupScene();
			scene.create();
			graphicsInstances[2].mock.fillStyle.mockClear();
			scene.updateSnapshot(makeSnapshot({ railPreview: null }));
			expect(graphicsInstances[2].mock.fillStyle).not.toHaveBeenCalled();
		});
	});

	describe('build cancel events', () => {
		test('emits buildCancelled when Escape is pressed', () => {
			expect.assertions(1);
			const { scene, fireKeydownEscape } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			fireKeydownEscape();
			expect(handler).toHaveBeenCalledWith({ type: 'buildCancelled' });
		});

		test('suppresses buildCancelled when keyboard is disabled', () => {
			expect.assertions(1);
			const { scene, fireKeydownEscape } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.setKeyboardEnabled(false);
			fireKeydownEscape();
			expect(interactionEvents(handler)).toEqual([]);
		});

		test('emits buildCancelled on right-click within the canvas', () => {
			expect.assertions(1);
			const { scene, zoneInstances, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const pointer = makePointer({ x: 10, y: 10, button: 2 });
			zoneInstances[0].fire('pointerdown', pointer);
			expect(handler).toHaveBeenCalledWith({ type: 'buildCancelled' });
		});

		test('right-click down/up sequence never emits tileSelected', () => {
			expect.assertions(2);
			const { scene, zoneInstances, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			const snapshot = makeSnapshot();
			scene.updateSnapshot(snapshot);
			const pointer = makePointer({
				x: 5,
				y: 5,
				worldX: 5,
				worldY: 5,
				button: 2,
				isDown: true
			});
			zoneInstances[0].fire('pointerdown', pointer);
			zoneInstances[0].fire('pointerup', pointer);
			expect(handler).toHaveBeenCalledWith({ type: 'buildCancelled' });
			expect(handler).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'tileSelected' }));
		});

		test('does not start a drag on right-click', () => {
			expect.assertions(1);
			const { scene, zoneInstances, makePointer } = setupScene();
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const pointer = makePointer({ x: 10, y: 10, button: 2 });
			zoneInstances[0].fire('pointerdown', pointer);
			expect(s(scene).isDragging).toBe(false);
		});

		test('ignores right-click that did not originate on the canvas', () => {
			expect.assertions(1);
			const { scene, zoneInstances, makePointer } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const pointer = makePointer({
				x: 10,
				y: 10,
				button: 2,
				event: { target: 'not-canvas' }
			});
			zoneInstances[0].fire('pointerdown', pointer);
			expect(interactionEvents(handler)).toEqual([]);
		});

		test('unregisters the Escape keydown handler on shutdown', () => {
			expect.assertions(1);
			const { scene, fireSceneShutdown, fireKeydownEscape } = setupScene();
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			fireSceneShutdown();
			fireKeydownEscape();
			expect(interactionEvents(handler)).toEqual([]);
		});
	});

	describe('map activity pulses', () => {
		type GraphicsMock = ReturnType<typeof createGraphicsMock>['mock'];
		const MATERIAL_TEXTURE_PREFIX = 'industry:/assets/game/industry/materials/';
		const GRAIN_TEXTURE = `industry:${getIndustryMaterialArt('grain')}`;
		// A 2x2 building at (0, 0) on its first frame: the ring sits 3px outside the footprint.
		const FIRST_FRAME_RING = [-3, -3, 70, 70];

		function materialTexturesOnly(key: string): boolean {
			return key.startsWith(MATERIAL_TEXTURE_PREFIX);
		}

		function buildingAt(id: string, x: number, y: number): IndustryMapBuildingRender {
			return {
				id,
				name: id,
				typeId: 'grain-farm',
				tileId: `${id}-tile`,
				x,
				y,
				width: 2,
				height: 2,
				status: 'produced'
			};
		}

		function producedBatch(seq: number, ...entityIds: string[]): MapActivityBatch {
			return {
				seq,
				activities: entityIds.map(
					(entityId): MapActivity => ({
						kind: 'production',
						cityId: 'city-1',
						entityId,
						materialId: 'grain'
					})
				)
			};
		}

		function startScene(
			buildings: IndustryMapBuildingRender[],
			textures: (key: string) => boolean = materialTexturesOnly
		) {
			const harness = setupScene();
			harness.texturesExistsSpy.mockImplementation(textures);
			harness.scene.create();
			harness.scene.updateSnapshot(makeSnapshot({ buildings }));
			return harness;
		}

		function materialImageCount(scene: IndustryMapScene): number {
			return (s(scene).add.image.mock.calls as unknown[][]).filter(
				(call) => call[2] === GRAIN_TEXTURE
			).length;
		}

		// Draws one frame and returns the ring calls made during it.
		function drawFrame(scene: IndustryMapScene, marker: GraphicsMock, time: number) {
			marker.strokeRect.mockClear();
			marker.lineStyle.mockClear();
			scene.update(time);
			return { rings: [...marker.strokeRect.mock.calls], styles: [...marker.lineStyle.mock.calls] };
		}

		test('preloads the industry material art alongside the other industry assets', () => {
			expect.assertions(1);
			const { scene, loadImageSpy, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(false);
			scene.preload();
			const loadedKeys = loadImageSpy.mock.calls.map(([key]) => key);
			expect(
				INDUSTRY_MATERIAL_ART_LIST.every((path) => loadedKeys.includes(`industry:${path}`))
			).toBe(true);
		});

		test('draws the produced material beside the building with the standard industry texture key', () => {
			expect.assertions(1);
			const { scene } = startScene([buildingAt('b-1', 0, 0)]);
			scene.showMapActivity(producedBatch(1, 'b-1'));
			scene.update(1000);
			expect(materialImageCount(scene)).toBe(1);
		});

		test('keeps one material image per producing building across frames', () => {
			expect.assertions(1);
			const { scene } = startScene([buildingAt('b-1', 0, 0)]);
			scene.showMapActivity(producedBatch(1, 'b-1'));
			scene.update(1000);
			scene.update(1100);
			scene.update(1200);
			expect(materialImageCount(scene)).toBe(1);
		});

		test('draws the ring without an image when the material texture is missing', () => {
			expect.assertions(2);
			const { scene, graphicsInstances } = startScene([buildingAt('b-1', 0, 0)], () => false);
			scene.showMapActivity(producedBatch(1, 'b-1'));
			scene.update(1000);
			expect(graphicsInstances[3]!.mock.strokeRect).toHaveBeenCalledTimes(1);
			expect(materialImageCount(scene)).toBe(0);
		});

		test('draws every producer in a batch with more than eight entries', () => {
			expect.assertions(2);
			const buildings = Array.from({ length: 10 }, (_, index) =>
				buildingAt(`b-${index}`, index * 2, 0)
			);
			const { scene, graphicsInstances } = startScene(buildings);
			scene.showMapActivity(producedBatch(1, ...buildings.map((building) => building.id)));
			scene.update(1000);
			expect(graphicsInstances[3]!.mock.strokeRect).toHaveBeenCalledTimes(10);
			expect(materialImageCount(scene)).toBe(10);
		});

		test('adds no zones and leaves the building sprite count unchanged for a pulse', () => {
			expect.assertions(3);
			const { scene, canvas, zoneInstances, texturesExistsSpy } = setupScene();
			texturesExistsSpy.mockReturnValue(true);
			scene.create();
			scene.updateSnapshot(makeSnapshot({ buildings: [buildingAt('b-1', 0, 0)] }));
			const zoneCount = zoneInstances.length;
			scene.showMapActivity(producedBatch(1, 'b-1'));
			scene.update(1000);
			expect(canvas.dataset.industryBuildingSpriteCount).toBe('1');
			expect(zoneInstances.length).toBe(zoneCount);
			expect(materialImageCount(scene)).toBe(1);
		});

		test('rings a producer missing at show time once a later snapshot contains it', () => {
			expect.assertions(2);
			const { scene, graphicsInstances } = startScene([]);
			const marker = graphicsInstances[3]!.mock;
			scene.showMapActivity(producedBatch(1, 'b-new'));
			expect(drawFrame(scene, marker, 1000).rings).toHaveLength(0);
			scene.updateSnapshot(makeSnapshot({ buildings: [buildingAt('b-new', 0, 0)] }));
			expect(marker.strokeRect.mock.calls).toEqual([FIRST_FRAME_RING]);
		});

		test('expires a producer that never appears in a snapshot without error', () => {
			expect.assertions(2);
			const { scene } = startScene([]);
			scene.showMapActivity(producedBatch(1, 'b-ghost'));
			expect(() => {
				scene.update(1000);
				scene.update(1700);
			}).not.toThrow();
			expect(s(scene).activityPulses.size).toBe(0);
		});

		test('does not re-arm an expired pulse on later renders or draws', () => {
			expect.assertions(3);
			const { scene, graphicsInstances, imageInstances } = startScene([buildingAt('b-1', 0, 0)]);
			const marker = graphicsInstances[3]!.mock;
			scene.showMapActivity(producedBatch(1, 'b-1'));
			scene.update(1000);
			const materialImage = imageInstances.at(-1)!;
			scene.update(1600);
			marker.strokeRect.mockClear();
			scene.updateSnapshot(makeSnapshot({ buildings: [buildingAt('b-1', 0, 0)] }));
			expect(marker.strokeRect).not.toHaveBeenCalled();
			expect(drawFrame(scene, marker, 1700).rings).toHaveLength(0);
			expect(materialImage.mock.destroy).toHaveBeenCalled();
		});

		test('coalesces repeated shows for an in-flight producer and keeps its original start time', () => {
			expect.assertions(3);
			const { scene, graphicsInstances } = startScene([buildingAt('b-1', 0, 0)]);
			const marker = graphicsInstances[3]!.mock;
			scene.showMapActivity(producedBatch(1, 'b-1'));
			scene.update(1000);
			scene.showMapActivity(producedBatch(2, 'b-1'));
			expect(s(scene).activityPulses.size).toBe(1);
			expect(drawFrame(scene, marker, 1300).rings).toHaveLength(1);
			expect(drawFrame(scene, marker, 1600).rings).toHaveLength(0);
		});

		test('drops in-flight pulses and destroys their images when the snapshot switches city', () => {
			expect.assertions(2);
			const { scene, graphicsInstances, imageInstances } = startScene([buildingAt('b-1', 0, 0)]);
			const marker = graphicsInstances[3]!.mock;
			scene.showMapActivity(producedBatch(1, 'b-1'));
			scene.update(1000);
			const materialImage = imageInstances.at(-1)!;
			scene.updateSnapshot(
				makeSnapshot({ cityId: 'other-city', buildings: [buildingAt('b-1', 0, 0)] })
			);
			expect(materialImage.mock.destroy).toHaveBeenCalled();
			expect(drawFrame(scene, marker, 1100).rings).toHaveLength(0);
		});

		test('shutdown drops in-flight pulses, destroys their images and clears the batch attributes', () => {
			expect.assertions(4);
			const { scene, canvas, imageInstances, fireSceneShutdown } = startScene([
				buildingAt('b-1', 0, 0)
			]);
			scene.showMapActivity(producedBatch(4, 'b-1'));
			scene.update(1000);
			const materialImage = imageInstances.at(-1)!;
			fireSceneShutdown();
			expect(materialImage.mock.destroy).toHaveBeenCalled();
			expect(s(scene).activityPulses.size).toBe(0);
			expect(canvas.dataset.mapActivitySequence).toBeUndefined();
			expect(canvas.dataset.mapActivityTargetIds).toBeUndefined();
		});

		test('records the last received batch on the canvas and keeps it after pulses expire', () => {
			expect.assertions(4);
			const { scene, canvas } = startScene([buildingAt('b-1', 0, 0), buildingAt('b-2', 2, 0)]);
			scene.showMapActivity(producedBatch(7, 'b-1', 'b-2'));
			expect(canvas.dataset.mapActivitySequence).toBe('7');
			expect(canvas.dataset.mapActivityTargetIds).toBe('b-1,b-2');
			scene.update(1000);
			scene.update(2000);
			expect(canvas.dataset.mapActivitySequence).toBe('7');
			expect(canvas.dataset.mapActivityTargetIds).toBe('b-1,b-2');
		});

		test('does not start a pulse from a snapshot redraw before the first frame', () => {
			expect.assertions(4);
			const { scene, graphicsInstances } = startScene([]);
			const marker = graphicsInstances[3]!.mock;
			scene.showMapActivity(producedBatch(1, 'b-1'));
			scene.updateSnapshot(makeSnapshot({ buildings: [buildingAt('b-1', 0, 0)] }));
			expect(marker.strokeRect).not.toHaveBeenCalled();
			expect(drawFrame(scene, marker, 5000).rings).toHaveLength(1);
			expect(drawFrame(scene, marker, 5300).rings).toHaveLength(1);
			expect(drawFrame(scene, marker, 5600).rings).toHaveLength(0);
		});

		test('draws an identical static ring for the whole lifetime under reduced motion', () => {
			expect.assertions(2);
			const { scene, graphicsInstances } = startScene([buildingAt('b-1', 0, 0)]);
			const marker = graphicsInstances[3]!.mock;
			scene.setReducedMotion(true);
			scene.showMapActivity(producedBatch(1, 'b-1'));
			const frames = [1000, 1200, 1400, 1599].map((time) => drawFrame(scene, marker, time));
			expect(frames[0]!.rings).toHaveLength(1);
			expect(new Set(frames.map((frame) => JSON.stringify(frame))).size).toBe(1);
		});

		test('animates the ring under normal motion', () => {
			expect.assertions(1);
			const { scene, graphicsInstances } = startScene([buildingAt('b-1', 0, 0)]);
			const marker = graphicsInstances[3]!.mock;
			scene.showMapActivity(producedBatch(1, 'b-1'));
			const first = drawFrame(scene, marker, 1000);
			const later = drawFrame(scene, marker, 1300);
			expect(later).not.toEqual(first);
		});

		test('holds the building sprite and status dot still under reduced motion', () => {
			expect.assertions(3);
			const { scene, graphicsInstances, imageInstances } = startScene(
				[buildingAt('b-1', 0, 0)],
				() => true
			);
			const sprite = s(scene).buildingSpriteById.get('b-1');
			const spriteMock = imageInstances.find((image) => image.chainable === sprite)!.mock;
			const marker = graphicsInstances[3]!.mock;
			const sampleFrames = () =>
				[0, 90, 175, 400].map((time) => {
					scene.update(time);
					return {
						spriteY: spriteMock.setPosition.mock.lastCall?.[1],
						dot: marker.strokeCircle.mock.lastCall
					};
				});
			scene.setReducedMotion(true);
			const reduced = sampleFrames();
			expect(reduced.map((frame) => frame.spriteY)).toEqual([32, 32, 32, 32]);
			expect(new Set(reduced.map((frame) => JSON.stringify(frame.dot))).size).toBe(1);
			scene.setReducedMotion(false);
			expect(new Set(sampleFrames().map((frame) => frame.spriteY)).size).toBeGreaterThan(1);
		});
	});

	describe('status dot glyphs', () => {
		type GraphicsMock = ReturnType<typeof createGraphicsMock>['mock'];
		type DrawnCalls = Record<string, unknown[][]>;
		type Segment = [number, number, number, number];

		const MARKER_GRAPHICS_INDEX = 3;
		const PLAIN_DOT_METHODS = ['clear', 'fillCircle', 'fillStyle', 'lineStyle', 'strokeCircle'];
		const DOT_STROKE_COLOR = 0x4a3b27;
		const STATUS_FILL_COLORS = {
			idle: 0xb8a271,
			produced: 0x4b5a2b,
			'imported-inputs': 0xb8862f,
			blocked: 0x8e2a1f,
			stalled: 0xa855f7
		};
		const SAMPLE_TIMES = [0, 90, 500, 1234];

		function statusBuilding(
			id: string,
			status: IndustryMapBuildingRender['status'],
			x = 0,
			y = 0
		): IndustryMapBuildingRender {
			return {
				id,
				name: id,
				typeId: 'grain-farm',
				tileId: `t-${x}-${y}`,
				x,
				y,
				width: 2,
				height: 2,
				status
			};
		}

		function startStatusScene(
			buildings: IndustryMapBuildingRender[],
			overrides: Partial<IndustryMapSnapshot> = {}
		) {
			const harness = setupScene();
			harness.texturesExistsSpy.mockReturnValue(true);
			harness.scene.create();
			harness.scene.updateSnapshot(makeSnapshot({ buildings, ...overrides }));
			return harness;
		}

		function clearCalls(graphics: GraphicsMock): void {
			for (const fn of Object.values(graphics)) {
				if (vi.isMockFunction(fn)) {
					fn.mockClear();
				}
			}
		}

		function recordedCalls(graphics: GraphicsMock): DrawnCalls {
			const recorded: DrawnCalls = {};
			for (const [name, fn] of Object.entries(graphics)) {
				if (vi.isMockFunction(fn) && fn.mock.calls.length > 0) {
					recorded[name] = fn.mock.calls;
				}
			}
			return recorded;
		}

		function drawMarkerFrame(
			scene: IndustryMapScene,
			marker: GraphicsMock,
			time: number
		): DrawnCalls {
			clearCalls(marker);
			scene.update(time);
			return recordedCalls(marker);
		}

		function callsTo(frame: DrawnCalls, method: string): number[][] {
			return (frame[method] ?? []) as number[][];
		}

		function dotCenter(frame: DrawnCalls): { x: number; y: number; radius: number } {
			const [x, y, radius] = callsTo(frame, 'strokeCircle').at(-1)!;
			return { x, y, radius };
		}

		function near(a: number, b: number): boolean {
			return Math.abs(a - b) < 1e-6;
		}

		function relativeLuminance(color: number): number {
			const channel = (value: number) => {
				const srgb = value / 255;
				return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
			};
			return (
				0.2126 * channel((color >> 16) & 0xff) +
				0.7152 * channel((color >> 8) & 0xff) +
				0.0722 * channel(color & 0xff)
			);
		}

		function contrastRatio(a: number, b: number): number {
			const [luminanceA, luminanceB] = [relativeLuminance(a), relativeLuminance(b)];
			return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05);
		}

		function sampleFrames(status: IndustryMapBuildingRender['status'], reducedMotion: boolean) {
			const { scene, graphicsInstances, imageInstances } = startStatusScene([
				statusBuilding('b-1', status)
			]);
			const sprite = s(scene).buildingSpriteById.get('b-1');
			const spriteMock = imageInstances.find((image) => image.chainable === sprite)!.mock;
			scene.setReducedMotion(reducedMotion);
			return SAMPLE_TIMES.map((time) => ({
				frame: JSON.stringify(
					drawMarkerFrame(scene, graphicsInstances[MARKER_GRAPHICS_INDEX]!.mock, time)
				),
				spriteY: spriteMock.setPosition.mock.lastCall?.[1]
			}));
		}

		function tapTiles(
			harness: ReturnType<typeof startStatusScene>,
			points: Array<[number, number]>
		): unknown[] {
			const handler = vi.fn();
			harness.scene.setEventHandler(handler);
			const zone = harness.zoneInstances[0]!;
			for (const [x, y] of points) {
				const pointer = harness.makePointer({ x, y, worldX: x, worldY: y, isDown: true });
				zone.fire('pointerdown', pointer);
				zone.fire('pointerup', pointer);
			}
			return interactionEvents(handler);
		}

		test.each(['blocked', 'stalled'] as const)(
			'the %s dot and glyph hold a fixed center while the sprite bobs, with reduced motion off and on',
			(status) => {
				expect.assertions(4);
				const normal = sampleFrames(status, false);
				expect(new Set(normal.map((sample) => sample.frame)).size).toBe(1);
				expect(new Set(normal.map((sample) => sample.spriteY)).size).toBeGreaterThan(1);
				const reduced = sampleFrames(status, true);
				expect(new Set(reduced.map((sample) => sample.frame)).size).toBe(1);
				expect(new Set(reduced.map((sample) => sample.spriteY)).size).toBe(1);
			}
		);

		test.each(['idle', 'produced', 'imported-inputs'] as const)(
			'the %s status draws only the plain status dot',
			(status) => {
				expect.assertions(1);
				const { scene, graphicsInstances } = startStatusScene([statusBuilding('b-1', status)]);
				const frame = drawMarkerFrame(scene, graphicsInstances[MARKER_GRAPHICS_INDEX]!.mock, 500);
				expect(frame).toEqual({
					clear: [[]],
					fillStyle: [[STATUS_FILL_COLORS[status], 0.98]],
					fillCircle: [[32, -15, 12]],
					lineStyle: [[1, DOT_STROKE_COLOR, 0.9]],
					strokeCircle: [[32, -15, 12]]
				});
			}
		);

		test('blocked draws a crossed X centered inside the dot', () => {
			expect.assertions(2);
			const { scene, graphicsInstances } = startStatusScene([statusBuilding('b-1', 'blocked')]);
			const frame = drawMarkerFrame(scene, graphicsInstances[MARKER_GRAPHICS_INDEX]!.mock, 500);
			const { x: cx, y: cy, radius } = dotCenter(frame);
			const segments = callsTo(frame, 'lineBetween') as Segment[];
			expect(
				segments.map(([x1, y1, x2, y2]) => ({
					diagonal: x1 !== x2 && y1 !== y2,
					centered: near((x1 + x2) / 2, cx) && near((y1 + y2) / 2, cy),
					inside: [
						[x1, y1],
						[x2, y2]
					].every(([px, py]) => Math.hypot(px - cx, py - cy) <= radius)
				}))
			).toEqual([
				{ diagonal: true, centered: true, inside: true },
				{ diagonal: true, centered: true, inside: true }
			]);
			expect(
				new Set(segments.map(([x1, y1, x2, y2]) => Math.sign((x2 - x1) * (y2 - y1)))).size
			).toBe(2);
		});

		test('stalled draws two vertical bars centered inside the dot', () => {
			expect.assertions(3);
			const { scene, graphicsInstances } = startStatusScene([statusBuilding('b-1', 'stalled')]);
			const frame = drawMarkerFrame(scene, graphicsInstances[MARKER_GRAPHICS_INDEX]!.mock, 500);
			const { x: cx, y: cy, radius } = dotCenter(frame);
			const bars = callsTo(frame, 'fillRect') as Segment[];
			expect(
				bars.map(([x, y, width, height]) => ({
					vertical: height > width,
					inside: [
						[x, y],
						[x + width, y],
						[x, y + height],
						[x + width, y + height]
					].every(([px, py]) => Math.hypot(px - cx, py - cy) <= radius)
				}))
			).toEqual([
				{ vertical: true, inside: true },
				{ vertical: true, inside: true }
			]);
			const offsets = bars.map(([x, , width]) => x + width / 2 - cx);
			expect(offsets[0]! + offsets[1]!).toBeCloseTo(0);
			expect(offsets[0]!).toBeLessThan(0);
		});

		test('blocked and stalled add different glyph methods while idle adds none', () => {
			expect.assertions(3);
			const addedMethods = (status: IndustryMapBuildingRender['status']) => {
				const { scene, graphicsInstances } = startStatusScene([statusBuilding('b-1', status)]);
				const frame = drawMarkerFrame(scene, graphicsInstances[MARKER_GRAPHICS_INDEX]!.mock, 500);
				return Object.keys(frame).filter((name) => !PLAIN_DOT_METHODS.includes(name));
			};
			expect(addedMethods('blocked')).toEqual(['lineBetween']);
			expect(addedMethods('stalled')).toEqual(['fillRect']);
			expect(addedMethods('idle')).toEqual([]);
		});

		test.each(['blocked', 'stalled'] as const)(
			'the %s glyph contrasts with its status fill and the dot stroke',
			(status) => {
				expect.assertions(2);
				const fill = STATUS_FILL_COLORS[status];
				const { scene, graphicsInstances } = startStatusScene([statusBuilding('b-1', status)]);
				const frame = drawMarkerFrame(scene, graphicsInstances[MARKER_GRAPHICS_INDEX]!.mock, 500);
				const glyphColors = [
					...callsTo(frame, 'fillStyle').map(([color]) => color),
					...callsTo(frame, 'lineStyle').map(([, color]) => color)
				].filter((color) => color !== fill && color !== DOT_STROKE_COLOR);
				expect(glyphColors.length).toBeGreaterThan(0);
				expect(
					Math.min(...glyphColors.map((color) => contrastRatio(color, fill)))
				).toBeGreaterThanOrEqual(3);
			}
		);

		test('the glyph adds no interactive objects, images, zones or canvas counters', () => {
			expect.assertions(6);
			const interactiveCalls = (zones: ReturnType<typeof createZoneMock>[]) =>
				zones.reduce((total, zone) => total + zone.mock.setInteractive.mock.calls.length, 0);
			const plain = startStatusScene([statusBuilding('b-1', 'idle')]);
			const blocked = startStatusScene([statusBuilding('b-1', 'blocked')]);
			for (const harness of [plain, blocked]) {
				harness.graphicsInstances.forEach((graphics) => clearCalls(graphics.mock));
				harness.scene.update(500);
			}
			expect(
				blocked.graphicsInstances
					.filter((_, index) => index !== MARKER_GRAPHICS_INDEX)
					.map((graphics) => recordedCalls(graphics.mock))
			).toEqual([{}, {}, {}, {}]);
			expect(blocked.graphicsInstances).toHaveLength(plain.graphicsInstances.length);
			expect(blocked.imageInstances).toHaveLength(plain.imageInstances.length);
			expect(blocked.zoneInstances).toHaveLength(plain.zoneInstances.length);
			expect(interactiveCalls(blocked.zoneInstances)).toBe(interactiveCalls(plain.zoneInstances));
			expect(blocked.canvas.dataset).toEqual(plain.canvas.dataset);
		});

		test('a tap on a tile under a blocked marker still selects that tile', () => {
			expect.assertions(1);
			const harness = startStatusScene([statusBuilding('b-1', 'blocked', 0, 1)]);
			expect(
				tapTiles(harness, [
					[30, 17],
					[40, 50]
				])
			).toEqual([
				{ type: 'tileSelected', tileId: 't-0-0' },
				{ type: 'tileSelected', tileId: 't-1-1' }
			]);
		});

		test('a tap on a placement-valid tile under a stalled marker still selects that tile', () => {
			expect.assertions(1);
			const harness = startStatusScene([statusBuilding('b-1', 'stalled', 0, 1)], {
				placementPreview: { validTileIds: ['t-0-0'], invalidTileIds: [] }
			});
			expect(tapTiles(harness, [[30, 17]])).toEqual([{ type: 'tileSelected', tileId: 't-0-0' }]);
		});
	});
});

describe('railArtForConnections', () => {
	test('four bits set (mask 15) -> cross rotated 0 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(15)).toEqual({ kind: 'cross', rotationDeg: 0 });
	});

	test('three bits missing N (mask 14) -> tee rotated 0 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(14)).toEqual({ kind: 'tee', rotationDeg: 0 });
	});

	test('three bits missing E (mask 13) -> tee rotated 90 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(13)).toEqual({ kind: 'tee', rotationDeg: 90 });
	});

	test('three bits missing S (mask 11) -> tee rotated 180 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(11)).toEqual({ kind: 'tee', rotationDeg: 180 });
	});

	test('three bits missing W (mask 7) -> tee rotated 270 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(7)).toEqual({ kind: 'tee', rotationDeg: 270 });
	});

	test('opposite bits E+W (mask 10) -> straight rotated 0 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(10)).toEqual({ kind: 'straight', rotationDeg: 0 });
	});

	test('opposite bits N+S (mask 5) -> straight rotated 90 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(5)).toEqual({ kind: 'straight', rotationDeg: 90 });
	});

	test('adjacent bits E+S (mask 6) -> corner rotated 0 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(6)).toEqual({ kind: 'corner', rotationDeg: 0 });
	});

	test('adjacent bits S+W (mask 12) -> corner rotated 90 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(12)).toEqual({ kind: 'corner', rotationDeg: 90 });
	});

	test('adjacent bits W+N (mask 9) -> corner rotated 180 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(9)).toEqual({ kind: 'corner', rotationDeg: 180 });
	});

	test('adjacent bits N+E (mask 3) -> corner rotated 270 degrees', () => {
		expect.assertions(1);
		expect(railArtForConnections(3)).toEqual({ kind: 'corner', rotationDeg: 270 });
	});

	test('isolated/end masks 0, 2, 8 -> straight rotated 0 degrees (horizontal)', () => {
		expect.assertions(3);
		expect(railArtForConnections(0)).toEqual({ kind: 'straight', rotationDeg: 0 });
		expect(railArtForConnections(2)).toEqual({ kind: 'straight', rotationDeg: 0 });
		expect(railArtForConnections(8)).toEqual({ kind: 'straight', rotationDeg: 0 });
	});

	test('isolated/end masks 1, 4 -> straight rotated 90 degrees (vertical)', () => {
		expect.assertions(2);
		expect(railArtForConnections(1)).toEqual({ kind: 'straight', rotationDeg: 90 });
		expect(railArtForConnections(4)).toEqual({ kind: 'straight', rotationDeg: 90 });
	});
});
