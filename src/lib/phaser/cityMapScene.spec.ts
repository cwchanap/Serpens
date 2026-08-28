/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('$app/paths', () => ({
	asset: (p: string) => p
}));

vi.mock('phaser', () => {
	const RESIZE = 'resize';
	const SHUTDOWN = 'shutdown';

	function chainable(): Record<string, any> {
		const obj: Record<string, any> = {};
		obj.setDepth = vi.fn(() => obj);
		obj.setOrigin = vi.fn(() => obj);
		obj.setDisplaySize = vi.fn(() => obj);
		obj.setInteractive = vi.fn(() => obj);
		obj.setPosition = vi.fn(() => obj);
		obj.setAngle = vi.fn(() => obj);
		obj.clear = vi.fn(() => obj);
		obj.destroy = vi.fn(() => {});
		obj.fillStyle = vi.fn(() => obj);
		obj.fillRect = vi.fn(() => obj);
		obj.lineStyle = vi.fn(() => obj);
		obj.strokeRect = vi.fn(() => obj);
		obj.lineBetween = vi.fn(() => obj);
		obj.fillCircle = vi.fn(() => obj);
		obj.strokeCircle = vi.fn(() => obj);
		obj.on = vi.fn(() => obj);
		obj.off = vi.fn(() => {});
		return obj;
	}

	class MockScene {
		scene: { key: string };
		add: any;
		input: any;
		scale: any;
		cameras: any;
		textures: any;
		events: any;
		load: any;
		game: any;

		constructor(config: any) {
			this.scene = { key: config?.key };
			this.add = {
				graphics: vi.fn(() => chainable()),
				image: vi.fn(() => chainable()),
				zone: vi.fn(() => chainable())
			};
			this.input = { on: vi.fn(), off: vi.fn() };
			this.scale = { on: vi.fn(), off: vi.fn(), width: 800, height: 600 };
			const cam: Record<string, any> = {
				zoom: 1,
				scrollX: 0,
				scrollY: 0,
				worldView: { x: 0, y: 0, width: 800, height: 600 }
			};
			cam.setZoom = vi.fn((z: number) => {
				cam.zoom = z;
				return cam;
			});
			cam.setScroll = vi.fn((x: number, y: number) => {
				cam.scrollX = x;
				cam.scrollY = y;
				return cam;
			});
			cam.setBounds = vi.fn(() => cam);
			this.cameras = { main: cam };
			this.textures = { exists: vi.fn(() => false) };
			this.events = { once: vi.fn() };
			this.load = { image: vi.fn() };
			this.game = { canvas: { dataset: {} as Record<string, string> } };
		}
	}

	return {
		default: {
			Scene: MockScene,
			Math: {
				Clamp: (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)
			},
			Scale: { Events: { RESIZE } },
			Scenes: { Events: { SHUTDOWN } },
			Input: { Pointer: class {} },
			GameObjects: {
				GameObject: class {},
				Image: class {},
				Graphics: class {},
				Zone: class {}
			}
		}
	};
});

import { CityMapScene } from './cityMapScene';
import type { CityMapSnapshot, CityMapTileRender } from '../game/mapRender';
import { STORE_ART_LIST, TERRAIN_ART_LIST } from '../assets/gameArt';

function makeTile(overrides?: Partial<CityMapTileRender>): CityMapTileRender {
	return {
		id: 'tile',
		x: 0,
		y: 0,
		neighborhood: 'downtown',
		terrain: 'commercial',
		feature: null,
		roadVariant: null,
		riverVariant: null,
		locked: false,
		owned: false,
		selected: false,
		demand: 50,
		rent: 100,
		footTraffic: 60,
		customerFit: 70,
		...overrides
	};
}

function makeSnapshot(overrides?: Partial<CityMapSnapshot>): CityMapSnapshot {
	return {
		cityId: 'test-city',
		width: 3,
		height: 3,
		selectedTileId: null,
		placementPreview: null,
		tiles: [
			makeTile({ id: 't0', x: 0, y: 0, terrain: 'commercial' }),
			makeTile({ id: 't1', x: 1, y: 0, terrain: 'residential' }),
			makeTile({ id: 't2', x: 2, y: 0, terrain: 'green' }),
			makeTile({
				id: 't3',
				x: 0,
				y: 1,
				terrain: 'transit',
				feature: 'road',
				roadVariant: 'horizontal'
			}),
			makeTile({
				id: 't4',
				x: 1,
				y: 1,
				terrain: 'industrial',
				feature: 'river',
				roadVariant: null,
				riverVariant: 'vertical'
			}),
			makeTile({
				id: 't5',
				x: 2,
				y: 1,
				terrain: 'commercial',
				feature: 'road',
				roadVariant: 'intersection'
			}),
			makeTile({ id: 't6', x: 0, y: 2, terrain: 'green' }),
			makeTile({ id: 't7', x: 1, y: 2, terrain: 'commercial', locked: true }),
			makeTile({
				id: 't8',
				x: 2,
				y: 2,
				terrain: 'residential',
				owned: true,
				feature: 'road',
				roadVariant: 'vertical'
			})
		],
		stores: [],
		competitors: [],
		...overrides
	};
}

function makePointer(canvas: any, overrides?: Record<string, any>) {
	return {
		x: 0,
		y: 0,
		worldX: 0,
		worldY: 0,
		isDown: true,
		event: { target: canvas },
		downElement: canvas,
		leftButtonDown: vi.fn(() => true),
		...overrides
	};
}

function getHandler(mockFn: Mock, event: string): (...args: any[]) => void {
	const call = mockFn.mock.calls.find((c: any[]) => c[0] === event);
	return call?.[1];
}

const s = (scene: CityMapScene) => scene as any;

describe('CityMapScene', () => {
	let scene: CityMapScene;

	beforeEach(() => {
		scene = new CityMapScene();
	});

	describe('constructor', () => {
		it('sets scene key to CityMapScene', () => {
			expect.assertions(1);
			expect(s(scene).scene.key).toBe('CityMapScene');
		});
	});

	describe('setEventHandler', () => {
		it('stores the handler', () => {
			expect.assertions(1);
			const handler = vi.fn();
			scene.setEventHandler(handler);
			expect(s(scene).eventHandler).toBe(handler);
		});

		it('accepts null handler', () => {
			expect.assertions(1);
			scene.setEventHandler(null);
			expect(s(scene).eventHandler).toBeNull();
		});
	});

	describe('preload', () => {
		it('calls load.image for each store and terrain art entry', () => {
			expect.assertions(1);
			scene.preload();
			const loadImage = s(scene).load.image as Mock;
			expect(loadImage).toHaveBeenCalledTimes(STORE_ART_LIST.length + TERRAIN_ART_LIST.length);
		});

		it('passes textureKey and asset(path) to load.image', () => {
			expect.assertions(2);
			scene.preload();
			const loadImage = s(scene).load.image as Mock;
			expect(loadImage).toHaveBeenCalledWith(STORE_ART_LIST[0].textureKey, STORE_ART_LIST[0].path);
			expect(loadImage).toHaveBeenCalledWith(
				TERRAIN_ART_LIST[0].textureKey,
				TERRAIN_ART_LIST[0].path
			);
		});
	});

	describe('create', () => {
		it('creates five graphics objects', () => {
			expect.assertions(1);
			scene.create();
			expect(s(scene).add.graphics).toHaveBeenCalledTimes(5);
		});

		it('sets camera zoom to 1', () => {
			expect.assertions(1);
			scene.create();
			expect(s(scene).cameras.main.setZoom).toHaveBeenCalledWith(1);
		});

		it('registers pointer input handlers', () => {
			expect.assertions(3);
			scene.create();
			const inputOn = s(scene).input.on as Mock;
			expect(inputOn).toHaveBeenCalledWith('pointermove', expect.any(Function), scene);
			expect(inputOn).toHaveBeenCalledWith('pointerup', expect.any(Function), scene);
			expect(inputOn).toHaveBeenCalledWith('wheel', expect.any(Function), scene);
		});

		it('registers scale resize handler', () => {
			expect.assertions(1);
			scene.create();
			expect(s(scene).scale.on).toHaveBeenCalledWith('resize', expect.any(Function), scene);
		});

		it('registers shutdown handler', () => {
			expect.assertions(1);
			scene.create();
			expect(s(scene).events.once).toHaveBeenCalledWith('shutdown', expect.any(Function), scene);
		});

		it('sets placement preview attributes to inactive when no snapshot', () => {
			expect.assertions(4);
			scene.create();
			const ds = s(scene).game.canvas.dataset;
			expect(ds.placementPreviewMode).toBe('inactive');
			expect(ds.placementValidTileCount).toBe('0');
			expect(ds.placementInvalidTileCount).toBe('0');
			expect(ds.competitorMarkerCount).toBe('0');
		});
	});

	describe('update', () => {
		it('sets canvas camera attributes', () => {
			expect.assertions(3);
			scene.create();
			scene.update(1000);
			const ds = s(scene).game.canvas.dataset;
			expect(ds.mapZoom).toBeDefined();
			expect(ds.mapScrollX).toBeDefined();
			expect(ds.mapScrollY).toBeDefined();
		});

		it('writes numeric zoom and tile size', () => {
			expect.assertions(2);
			scene.create();
			scene.update(0);
			const ds = s(scene).game.canvas.dataset;
			expect(Number(ds.mapZoom)).toBeGreaterThan(0);
			expect(Number(ds.mapTileSize)).toBeGreaterThan(0);
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

		it('sets panKeys to null when keyboard has no addKeys method', () => {
			expect.assertions(1);
			s(scene).input.keyboard = {};
			scene.create();
			expect(s(scene).panKeys).toBeNull();
		});

		it('registers panKeys from keyboard.addKeys when available', () => {
			expect.assertions(2);
			const keys = makePanKeys();
			const addKeys = vi.fn(() => keys);
			s(scene).input.keyboard = { addKeys };
			scene.create();
			expect(addKeys).toHaveBeenCalledWith('W,A,S,D');
			expect(s(scene).panKeys).toBe(keys);
		});

		it('setKeyboardEnabled toggles keyboard pan', () => {
			expect.assertions(2);
			scene.create();
			scene.setKeyboardEnabled(false);
			expect(s(scene).keyboardEnabled).toBe(false);
			scene.setKeyboardEnabled(true);
			expect(s(scene).keyboardEnabled).toBe(true);
		});

		it('updateKeyboardPan scrolls the camera when a pan key is held', () => {
			expect.assertions(3);
			const keys = makePanKeys({ D: { isDown: true } });
			s(scene).input.keyboard = { addKeys: vi.fn(() => keys) };
			scene.create();
			scene.update(0, 1000);
			expect(s(scene).cameras.main.scrollX).toBe(420);
			expect(s(scene).cameras.main.scrollY).toBe(0);
			expect(s(scene).hasUserAdjustedCamera).toBe(true);
		});

		it('updateKeyboardPan is a no-op when keyboard pan is disabled', () => {
			expect.assertions(2);
			const keys = makePanKeys({ D: { isDown: true } });
			s(scene).input.keyboard = { addKeys: vi.fn(() => keys) };
			scene.create();
			scene.setKeyboardEnabled(false);
			scene.update(0, 1000);
			expect(s(scene).cameras.main.scrollX).toBe(0);
			expect(s(scene).hasUserAdjustedCamera).toBe(false);
		});

		it('updateKeyboardPan is a no-op when delta is zero even with pan keys held', () => {
			expect.assertions(2);
			const keys = makePanKeys({ D: { isDown: true } });
			s(scene).input.keyboard = { addKeys: vi.fn(() => keys) };
			scene.create();
			scene.update(0, 0);
			expect(s(scene).cameras.main.scrollX).toBe(0);
			expect(s(scene).hasUserAdjustedCamera).toBe(false);
		});

		it('updateKeyboardPan is a no-op when no pan keys are held', () => {
			expect.assertions(2);
			const keys = makePanKeys();
			s(scene).input.keyboard = { addKeys: vi.fn(() => keys) };
			scene.create();
			scene.update(0, 1000);
			expect(s(scene).cameras.main.scrollX).toBe(0);
			expect(s(scene).hasUserAdjustedCamera).toBe(false);
		});
	});

	describe('updateSnapshot', () => {
		it('stores the snapshot and renders', () => {
			expect.assertions(2);
			scene.create();
			const snap = makeSnapshot();
			scene.updateSnapshot(snap);
			expect(s(scene).snapshot).toBe(snap);
			const ds = s(scene).game.canvas.dataset;
			expect(ds.terrainAssetMode).toBeDefined();
		});

		it('clears hover tile id when tile is not in new snapshot', () => {
			expect.assertions(1);
			scene.create();
			s(scene).hoverTileId = 'nonexistent';
			scene.updateSnapshot(makeSnapshot());
			expect(s(scene).hoverTileId).toBeNull();
		});

		it('keeps hover tile id when tile is in new snapshot', () => {
			expect.assertions(1);
			scene.create();
			s(scene).hoverTileId = 't0';
			scene.updateSnapshot(makeSnapshot());
			expect(s(scene).hoverTileId).toBe('t0');
		});
	});

	describe('renderSnapshot (via updateSnapshot)', () => {
		it('creates a single map interaction zone', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			expect(s(scene).add.zone).toHaveBeenCalledTimes(1);
		});

		it('sets camera bounds based on snapshot dimensions', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			expect(s(scene).cameras.main.setBounds).toHaveBeenCalledWith(0, 0, 96, 96);
		});

		it('draws placement preview attributes as inactive when no preview', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			expect(s(scene).game.canvas.dataset.placementPreviewMode).toBe('inactive');
		});

		it('draws placement preview with valid and invalid tiles', () => {
			expect.assertions(3);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t0', 't1'],
						invalidTileIds: ['t2']
					}
				})
			);
			const ds = s(scene).game.canvas.dataset;
			expect(ds.placementPreviewMode).toBe('active');
			expect(ds.placementValidTileCount).toBe('2');
			expect(ds.placementInvalidTileCount).toBe('1');
		});

		it('coalesces adjacent placement preview tiles into row spans', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t0', 't1', 't2'],
						invalidTileIds: ['t3', 't4']
					}
				})
			);
			const placementPreviewGraphics = s(scene).placementPreviewGraphics;
			expect(placementPreviewGraphics.fillRect).toHaveBeenCalledTimes(2);
		});

		it('draws invalid placement spans before valid spans so shared footprint cells stay valid', () => {
			expect.assertions(2);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t0'],
						invalidTileIds: ['t1']
					}
				})
			);
			const spy = vi.spyOn(s(scene), 'drawPlacementPreviewSpans');
			s(scene).drawPlacementPreview();
			expect(spy.mock.calls[0]![1]).toBe(0x8e2a1f);
			expect(spy.mock.calls[1]![1]).toBe(0x6b7e3a);
			spy.mockRestore();
		});

		it('draws placement preview tiles as 2x2 store footprints', () => {
			expect.assertions(2);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t0'],
						invalidTileIds: []
					}
				})
			);
			const placementPreviewGraphics = s(scene).placementPreviewGraphics;
			expect(placementPreviewGraphics.fillRect).toHaveBeenCalledWith(2, 2, 60, 60);
			expect(placementPreviewGraphics.fillRect).not.toHaveBeenCalledWith(2, 2, 28, 28);
		});
	});

	describe('drawTile', () => {
		it('draws tile border for every tile', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const mapGraphics = s(scene).mapGraphics;
			expect(mapGraphics.strokeRect.mock.calls.length).toBeGreaterThanOrEqual(9);
		});

		it('renders locked tile with dark overlay', () => {
			expect.assertions(1);
			scene.create();
			const snap = makeSnapshot({
				tiles: [makeTile({ id: 'locked', x: 0, y: 0, locked: true })]
			});
			scene.updateSnapshot(snap);
			const mapGraphics = s(scene).mapGraphics;
			const fillCalls = mapGraphics.fillStyle.mock.calls;
			const darkFill = fillCalls.find((c: any[]) => c[0] === 0x1f2933 && c[1] === 0.24);
			expect(darkFill).toBeDefined();
		});

		it('renders owned tile with green border', () => {
			expect.assertions(1);
			scene.create();
			const snap = makeSnapshot({
				tiles: [makeTile({ id: 'owned', x: 0, y: 0, owned: true })]
			});
			scene.updateSnapshot(snap);
			const ownershipGraphics = s(scene).ownershipGraphics;
			const lineCalls = ownershipGraphics.lineStyle.mock.calls;
			const ownedLine = lineCalls.find(
				(c: any[]) => c[0] === 3 && c[1] === 0x1f8a70 && c[2] === 0.95
			);
			expect(ownedLine).toBeDefined();
		});

		it('renders store ownership as a 2x2 footprint border', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			const ownershipGraphics = s(scene).ownershipGraphics;
			expect(ownershipGraphics.strokeRect).toHaveBeenCalledWith(3, 3, 58, 58);
		});
	});

	describe('tile zones', () => {
		it('pointermove sets hoverTileId when pointer is over a tile', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			const canvas = s(scene).game.canvas;
			const pointer = makePointer(canvas, { x: 10, y: 10, worldX: 10, worldY: 10 });
			const handler = getHandler(s(scene).input.on as Mock, 'pointermove');
			handler.call(scene, pointer);
			expect(s(scene).hoverTileId).toBe('zone-tile');
		});

		it('pointerout clears hoverTileId', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			s(scene).hoverTileId = 'zone-tile';
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const outHandler = onCalls.find((c: any[]) => c[0] === 'pointerout')?.[1];
			outHandler();
			expect(s(scene).hoverTileId).toBeNull();
		});

		it('pointerdown starts drag on canvas pointer with left button', () => {
			expect.assertions(3);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const handler = onCalls.find((c: any[]) => c[0] === 'pointerdown')?.[1];
			const pointer = makePointer(s(scene).game.canvas, { x: 10, y: 10 });
			handler(pointer);
			expect(s(scene).isDragging).toBe(true);
			expect(s(scene).hasDragged).toBe(false);
			expect(s(scene).dragStartPoint).toEqual({ x: 10, y: 10 });
		});

		it('pointerdown does not start drag when pointer is not on canvas', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const handler = onCalls.find((c: any[]) => c[0] === 'pointerdown')?.[1];
			const pointer = makePointer({});
			handler(pointer);
			expect(s(scene).isDragging).toBe(false);
		});

		it('pointerup fires tileSelected when not dragged', () => {
			expect.assertions(1);
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const downHandler = onCalls.find((c: any[]) => c[0] === 'pointerdown')?.[1];
			const upHandler = onCalls.find((c: any[]) => c[0] === 'pointerup')?.[1];
			const canvas = s(scene).game.canvas;
			const pointer = makePointer(canvas, { x: 10, y: 10, worldX: 10, worldY: 10 });
			downHandler(pointer);
			upHandler(pointer);
			expect(handler).toHaveBeenCalledWith({ type: 'tileSelected', tileId: 'zone-tile' });
		});

		it('pointerup fires tileSelected for the clicked cell inside a 2x2 store footprint', () => {
			expect.assertions(1);
			// The scene emits the raw clicked tile id; the Svelte component
			// resolves it to the store anchor via resolveSelectionAnchorTileId.
			// This test verifies the scene correctly identifies the clicked
			// cell (1,1) even when a store sprite covers the 2x2 footprint at
			// (0,0). The anchor resolution is covered by placementPreview.spec.
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const downHandler = onCalls.find((c: any[]) => c[0] === 'pointerdown')?.[1];
			const upHandler = onCalls.find((c: any[]) => c[0] === 'pointerup')?.[1];
			const canvas = s(scene).game.canvas;
			// Tile (1,1) is t4 in the default 3x3 snapshot; worldX/worldY of 48
			// maps to Math.floor(48 / 32) = 1.
			const pointer = makePointer(canvas, { x: 48, y: 48, worldX: 48, worldY: 48 });
			downHandler(pointer);
			upHandler(pointer);
			expect(handler).toHaveBeenCalledWith({ type: 'tileSelected', tileId: 't4' });
		});

		it('pointerup does not fire when pointer did not start on canvas', () => {
			expect.assertions(1);
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const upHandler = onCalls.find((c: any[]) => c[0] === 'pointerup')?.[1];
			const pointer = makePointer({}, { worldX: 10, worldY: 10 });
			upHandler(pointer);
			expect(handler).not.toHaveBeenCalled();
		});

		it('pointerup does not fire when pointer was dragged beyond click slop', () => {
			expect.assertions(1);
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const downHandler = onCalls.find((c: any[]) => c[0] === 'pointerdown')?.[1];
			const upHandler = onCalls.find((c: any[]) => c[0] === 'pointerup')?.[1];
			const canvas = s(scene).game.canvas;
			const downPointer = makePointer(canvas, { x: 10, y: 10, worldX: 10, worldY: 10 });
			downHandler(downPointer);
			const upPointer = makePointer(canvas, { x: 30, y: 30, worldX: 30, worldY: 30 });
			upHandler(upPointer);
			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe('handlePointerMove', () => {
		it('scrolls camera when dragging', () => {
			expect.assertions(3);
			scene.create();
			const canvas = s(scene).game.canvas;
			const pointer = makePointer(canvas, { x: 20, y: 20, isDown: true });
			s(scene).isDragging = true;
			s(scene).lastDragPoint = { x: 10, y: 10 };
			s(scene).dragStartPoint = { x: 10, y: 10 };
			const handler = getHandler(s(scene).input.on as Mock, 'pointermove');
			handler.call(scene, pointer);
			expect(s(scene).cameras.main.scrollX).toBe(-10);
			expect(s(scene).cameras.main.scrollY).toBe(-10);
			expect(s(scene).hasUserAdjustedCamera).toBe(true);
		});

		it('does not scroll when not dragging', () => {
			expect.assertions(1);
			scene.create();
			const pointer = makePointer(s(scene).game.canvas, { x: 20, y: 20 });
			s(scene).isDragging = false;
			const initialScrollX = s(scene).cameras.main.scrollX;
			const handler = getHandler(s(scene).input.on as Mock, 'pointermove');
			handler.call(scene, pointer);
			expect(s(scene).cameras.main.scrollX).toBe(initialScrollX);
		});

		it('sets hasDragged when pointer moves beyond click slop', () => {
			expect.assertions(1);
			scene.create();
			const canvas = s(scene).game.canvas;
			const pointer = makePointer(canvas, { x: 20, y: 20, isDown: true });
			s(scene).isDragging = true;
			s(scene).lastDragPoint = { x: 15, y: 15 };
			s(scene).dragStartPoint = { x: 5, y: 5 };
			const handler = getHandler(s(scene).input.on as Mock, 'pointermove');
			handler.call(scene, pointer);
			expect(s(scene).hasDragged).toBe(true);
		});
	});

	describe('handlePointerUp', () => {
		it('resets drag state', () => {
			expect.assertions(3);
			scene.create();
			s(scene).isDragging = true;
			s(scene).dragStartPoint = { x: 0, y: 0 };
			s(scene).lastDragPoint = { x: 0, y: 0 };
			const handler = getHandler(s(scene).input.on as Mock, 'pointerup');
			handler.call(scene);
			expect(s(scene).isDragging).toBe(false);
			expect(s(scene).dragStartPoint).toBeNull();
			expect(s(scene).lastDragPoint).toBeNull();
		});
	});

	describe('handleWheel', () => {
		it('zooms camera based on wheel delta', () => {
			expect.assertions(2);
			scene.create();
			const canvas = s(scene).game.canvas;
			const pointer = makePointer(canvas);
			s(scene).cameras.main.zoom = 1;
			const handler = getHandler(s(scene).input.on as Mock, 'wheel');
			handler.call(scene, pointer, [], 0, 500);
			expect(s(scene).cameras.main.zoom).toBeLessThan(1);
			expect(s(scene).hasUserAdjustedCamera).toBe(true);
		});

		it('clamps zoom to MIN_ZOOM', () => {
			expect.assertions(1);
			scene.create();
			const canvas = s(scene).game.canvas;
			const pointer = makePointer(canvas);
			s(scene).cameras.main.zoom = 0.6;
			const handler = getHandler(s(scene).input.on as Mock, 'wheel');
			handler.call(scene, pointer, [], 0, 1000);
			expect(s(scene).cameras.main.zoom).toBeGreaterThanOrEqual(0.6);
		});

		it('clamps zoom to MAX_ZOOM', () => {
			expect.assertions(1);
			scene.create();
			const canvas = s(scene).game.canvas;
			const pointer = makePointer(canvas);
			s(scene).cameras.main.zoom = 2.2;
			const handler = getHandler(s(scene).input.on as Mock, 'wheel');
			handler.call(scene, pointer, [], 0, -1000);
			expect(s(scene).cameras.main.zoom).toBeLessThanOrEqual(2.2);
		});
	});

	describe('handleResize', () => {
		it('fits camera to viewport', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			s(scene).hasUserAdjustedCamera = false;
			const resizeHandler = getHandler(s(scene).scale.on as Mock, 'resize');
			resizeHandler.call(scene);
			expect(s(scene).cameras.main.setZoom).toHaveBeenCalled();
		});

		it('skips fit when user has adjusted camera', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const zoomBefore = s(scene).cameras.main.zoom;
			s(scene).hasUserAdjustedCamera = true;
			const resizeHandler = getHandler(s(scene).scale.on as Mock, 'resize');
			(s(scene).cameras.main.setZoom as Mock).mockClear();
			resizeHandler.call(scene);
			expect(s(scene).cameras.main.zoom).toBe(zoomBefore);
		});
	});

	describe('drawStoreMarkers', () => {
		it('draws active rivals as non-interactive markers and exposes their count', () => {
			expect.assertions(5);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					competitors: [
						{
							id: 'rival-1',
							name: 'Rival One',
							archetypeId: 'convenience',
							x: 1,
							y: 1
						},
						{
							id: 'rival-2',
							name: 'Rival Two',
							archetypeId: 'grocery',
							x: 2,
							y: 2
						}
					]
				})
			);
			const markerGraphics = s(scene).markerGraphics;
			const ds = s(scene).game.canvas.dataset;

			expect(ds.competitorMarkerCount).toBe('2');
			expect(markerGraphics.fillCircle).toHaveBeenCalledWith(48, 48, 8);
			expect(markerGraphics.strokeCircle).toHaveBeenCalledWith(48, 48, 8);
			expect(markerGraphics.fillCircle).toHaveBeenCalledWith(80, 80, 8);
			expect(markerGraphics.setInteractive).not.toHaveBeenCalled();
		});

		it('draws no rival markers when the snapshot has no rivals', () => {
			expect.assertions(3);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					competitors: []
				})
			);
			const markerGraphics = s(scene).markerGraphics;
			expect(s(scene).game.canvas.dataset.competitorMarkerCount).toBe('0');
			expect(markerGraphics.fillCircle).not.toHaveBeenCalled();
			expect(markerGraphics.strokeCircle).not.toHaveBeenCalled();
		});

		it('counts a single remaining rival marker', () => {
			expect.assertions(3);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					competitors: [
						{
							id: 'rival-active',
							name: 'Active Rival',
							archetypeId: 'convenience',
							x: 1,
							y: 1
						}
					]
				})
			);
			const markerGraphics = s(scene).markerGraphics;
			expect(s(scene).game.canvas.dataset.competitorMarkerCount).toBe('1');
			expect(markerGraphics.fillCircle).toHaveBeenCalledTimes(1);
			expect(markerGraphics.fillCircle).toHaveBeenCalledWith(48, 48, 8);
		});

		it('transitions one scene from two rivals to one and then zero', () => {
			expect.assertions(3);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					competitors: [
						{
							id: 'rival-1',
							name: 'Rival One',
							archetypeId: 'convenience',
							x: 1,
							y: 1
						},
						{
							id: 'rival-2',
							name: 'Rival Two',
							archetypeId: 'grocery',
							x: 2,
							y: 2
						}
					]
				})
			);
			expect(s(scene).game.canvas.dataset.competitorMarkerCount).toBe('2');

			scene.updateSnapshot(
				makeSnapshot({
					competitors: [
						{
							id: 'rival-1',
							name: 'Rival One',
							archetypeId: 'convenience',
							x: 1,
							y: 1
						}
					]
				})
			);
			expect(s(scene).game.canvas.dataset.competitorMarkerCount).toBe('1');

			scene.updateSnapshot(makeSnapshot());
			expect(s(scene).game.canvas.dataset.competitorMarkerCount).toBe('0');
		});

		it('animates store sprite positions when sprites exist', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn((key: string) => key === 'shop-storefront-convenience');
			scene.updateSnapshot(
				makeSnapshot({
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			const storeSprites = s(scene).storeSprites;
			expect(storeSprites.length).toBe(1);
		});

		it('sizes store sprites to the 2x2 footprint', () => {
			expect.assertions(2);
			scene.create();
			s(scene).textures.exists = vi.fn((key: string) => key === 'shop-storefront-convenience');
			scene.updateSnapshot(
				makeSnapshot({
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			const storeSprite = s(scene).storeSprites[0];
			expect(storeSprite.sprite.setDisplaySize).toHaveBeenCalledWith(64, 64);
			expect(storeSprite).toMatchObject({ baseX: 32, baseY: 32 });
		});

		it('does not draw marker fallbacks when store textures are missing', () => {
			expect.assertions(3);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			scene.update(1000);
			const markerGraphics = s(scene).markerGraphics;
			const ds = s(scene).game.canvas.dataset;
			expect(markerGraphics.fillCircle).not.toHaveBeenCalled();
			expect(markerGraphics.strokeCircle).not.toHaveBeenCalled();
			expect(ds.storeMarkerMode).toBe('missing');
		});

		it('returns early when no snapshot', () => {
			expect.assertions(1);
			scene.create();
			const markerGraphics = s(scene).markerGraphics;
			(markerGraphics.clear as Mock).mockClear();
			scene.update(0);
			expect(markerGraphics.clear).not.toHaveBeenCalled();
		});
	});

	describe('drawInteractionOutlines', () => {
		it('draws hover outline on hovered tile', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			s(scene).hoverTileId = 't0';
			s(scene).drawInteractionOutlines();
			const outlineGraphics = s(scene).outlineGraphics;
			const hoverLine = outlineGraphics.lineStyle.mock.calls.find((c: any[]) => c[1] === 0xf5c542);
			expect(hoverLine).toBeDefined();
		});

		it('draws selection outline on selected tile', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					selectedTileId: 't0',
					tiles: [makeTile({ id: 't0', x: 0, y: 0, selected: true })]
				})
			);
			s(scene).drawInteractionOutlines();
			const outlineGraphics = s(scene).outlineGraphics;
			const selectedLine = outlineGraphics.lineStyle.mock.calls.find(
				(c: any[]) => c[1] === 0x2563eb
			);
			expect(selectedLine).toBeDefined();
		});

		it('draws selected occupied store as a 2x2 outline', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					selectedTileId: 't1',
					tiles: [
						makeTile({ id: 't0', x: 0, y: 0 }),
						makeTile({ id: 't1', x: 1, y: 0, selected: true }),
						makeTile({ id: 't3', x: 0, y: 1 }),
						makeTile({ id: 't4', x: 1, y: 1 })
					],
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			s(scene).drawInteractionOutlines();
			const outlineGraphics = s(scene).outlineGraphics;
			expect(outlineGraphics.strokeRect).toHaveBeenCalledWith(1, 1, 62, 62);
		});

		it('returns early when no snapshot', () => {
			expect.assertions(1);
			scene.create();
			const outlineGraphics = s(scene).outlineGraphics;
			(outlineGraphics.clear as Mock).mockClear();
			s(scene).drawInteractionOutlines();
			expect(outlineGraphics.clear).not.toHaveBeenCalled();
		});
	});

	describe('createStoreSprites', () => {
		it('creates image sprites when all storefront textures exist', () => {
			expect.assertions(2);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			const ds = s(scene).game.canvas.dataset;
			expect(ds.storeMarkerMode).toBe('image');
			expect(ds.storeSpriteCount).toBe('1');
		});

		it('uses missing mode when storefront textures are missing', () => {
			expect.assertions(2);
			scene.create();
			s(scene).textures.exists = vi.fn(() => false);
			scene.updateSnapshot(
				makeSnapshot({
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			const ds = s(scene).game.canvas.dataset;
			expect(ds.storeMarkerMode).toBe('missing');
			expect(ds.storeSpriteCount).toBe('0');
		});

		it('sets empty mode with empty stores and no textures', () => {
			expect.assertions(2);
			scene.create();
			s(scene).textures.exists = vi.fn(() => false);
			scene.updateSnapshot(makeSnapshot());
			const ds = s(scene).game.canvas.dataset;
			expect(ds.storeMarkerMode).toBe('empty');
			expect(ds.storeSpriteCount).toBe('0');
		});
	});

	describe('createTerrainSprites', () => {
		it('uses missing mode when no textures exist', () => {
			expect.assertions(4);
			scene.create();
			s(scene).textures.exists = vi.fn(() => false);
			scene.updateSnapshot(makeSnapshot());
			const ds = s(scene).game.canvas.dataset;
			expect(ds.terrainAssetMode).toBe('missing');
			expect(ds.terrainBaseSpriteCount).toBe('0');
			expect(ds.terrainFeatureSpriteCount).toBe('0');
			expect(ds.terrainDecorationSpriteCount).toBe('0');
		});

		it('creates base terrain sprites when textures exist', () => {
			expect.assertions(2);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(makeSnapshot());
			const ds = s(scene).game.canvas.dataset;
			expect(Number(ds.terrainBaseSpriteCount)).toBe(9);
			expect(ds.terrainAssetMode).toBe('image');
		});

		it('varies base terrain art by neighborhood and tile coordinate', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({ id: 'downtown-1', x: 0, y: 0, neighborhood: 'downtown' }),
						makeTile({ id: 'downtown-2', x: 1, y: 0, neighborhood: 'downtown' }),
						makeTile({ id: 'downtown-3', x: 2, y: 0, neighborhood: 'downtown' }),
						makeTile({ id: 'campus', x: 0, y: 1, neighborhood: 'campus' }),
						makeTile({ id: 'mall', x: 0, y: 2, neighborhood: 'mall' }),
						makeTile({ id: 'green-1', x: 0, y: 0, neighborhood: 'parkEdge', terrain: 'green' }),
						makeTile({ id: 'green-2', x: 1, y: 0, neighborhood: 'parkEdge', terrain: 'green' }),
						makeTile({ id: 'green-3', x: 2, y: 0, neighborhood: 'parkEdge', terrain: 'green' })
					]
				})
			);

			const textureKeys = (s(scene).add.image as Mock).mock.calls
				.map((call: any[]) => call[2])
				.filter((textureKey: string) => textureKey !== 'terrain-tree');

			expect(textureKeys).toEqual([
				'terrain-downtown',
				'terrain-downtown-2',
				'terrain-downtown-3',
				'terrain-campus-2',
				'terrain-mall-3',
				'terrain-green',
				'terrain-green-2',
				'terrain-green-3'
			]);
		});

		it('selects residential terrain variants by tile coordinate', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({ id: 'r0', x: 0, y: 0, terrain: 'residential' }),
						makeTile({ id: 'r1', x: 1, y: 0, terrain: 'residential' }),
						makeTile({ id: 'r2', x: 2, y: 0, terrain: 'residential' }),
						makeTile({ id: 'r3', x: 3, y: 0, terrain: 'residential' }),
						makeTile({ id: 'r4', x: 4, y: 0, terrain: 'residential' }),
						makeTile({ id: 'r5', x: 5, y: 0, terrain: 'residential' })
					]
				})
			);
			const textureKeys = (s(scene).add.image as Mock).mock.calls.map((call: any[]) => call[2]);
			expect(textureKeys).toEqual([
				'terrain-residential',
				'terrain-residential-2',
				'terrain-residential-3',
				'terrain-residential-4',
				'terrain-residential-5',
				'terrain-residential-6'
			]);
		});

		it('falls back to plain terrain art for neighborhoods without variant sets', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'suburb-commercial',
							x: 0,
							y: 0,
							neighborhood: 'suburb',
							terrain: 'commercial'
						}),
						makeTile({
							id: 'transit-commercial',
							x: 1,
							y: 0,
							neighborhood: 'transit',
							terrain: 'commercial'
						}),
						makeTile({
							id: 'parkedge-commercial',
							x: 2,
							y: 0,
							neighborhood: 'parkEdge',
							terrain: 'commercial'
						})
					]
				})
			);
			const textureKeys = (s(scene).add.image as Mock).mock.calls.map((call: any[]) => call[2]);
			// downtown/campus/mall have variant sets; other neighborhoods fall
			// back to the plain commercial terrain art for commercial tiles.
			expect(textureKeys).toEqual([
				'terrain-commercial',
				'terrain-commercial',
				'terrain-commercial'
			]);
		});

		it('rotates horizontal and end-e/end-w river sprites to match the native vertical river art', () => {
			expect.assertions(3);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'river-h',
							x: 0,
							y: 0,
							terrain: 'green',
							feature: 'river',
							riverVariant: 'horizontal'
						}),
						makeTile({
							id: 'river-end-e',
							x: 1,
							y: 0,
							terrain: 'green',
							feature: 'river',
							riverVariant: 'end-e'
						}),
						makeTile({
							id: 'river-end-w',
							x: 2,
							y: 0,
							terrain: 'green',
							feature: 'river',
							riverVariant: 'end-w'
						})
					]
				})
			);
			const featureSprites = (s(scene).add.image as Mock).mock.results.filter(
				(result: any) => result.value && (result.value.setAngle as Mock).mock.calls.length > 0
			);

			expect(featureSprites[0].value.setAngle).toHaveBeenCalledWith(90);
			expect(featureSprites[1].value.setAngle).toHaveBeenCalledWith(90);
			expect(featureSprites[2].value.setAngle).toHaveBeenCalledWith(90);
		});

		it('uses connector textures for complex road and river variants', () => {
			expect.assertions(4);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'road-i',
							x: 0,
							y: 0,
							terrain: 'transit',
							feature: 'road',
							roadVariant: 'intersection'
						}),
						makeTile({
							id: 'river-corner',
							x: 1,
							y: 0,
							terrain: 'green',
							feature: 'river',
							riverVariant: 'corner-ne'
						})
					]
				})
			);
			const textureKeys = (s(scene).add.image as Mock).mock.calls.map((call: any[]) => call[2]);
			const mapGraphics = s(scene).mapGraphics;

			expect(textureKeys).toContain('terrain-road-connector-intersection');
			expect(textureKeys).toContain('terrain-river-connector-corner-ne');
			expect(
				mapGraphics.fillStyle.mock.calls.find((c: any[]) => c[0] === 0x50545a)
			).toBeUndefined();
			expect(
				mapGraphics.fillStyle.mock.calls.find((c: any[]) => c[0] === 0x3ca7d8)
			).toBeUndefined();
		});

		it('uses missing mode when some feature textures are missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn((key: string) => {
				return !key.includes('road');
			});
			scene.updateSnapshot(makeSnapshot());
			const ds = s(scene).game.canvas.dataset;
			expect(ds.terrainAssetMode).toBe('missing');
		});

		it('creates tree decorations on green tiles at valid positions', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn((key: string) => key === 'terrain-tree');
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'tree-tile', x: 0, y: 0, terrain: 'green' })]
				})
			);
			const ds = s(scene).game.canvas.dataset;
			expect(Number(ds.terrainDecorationSpriteCount)).toBe(1);
		});

		it('skips tree decoration when tree texture missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => false);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'tree-tile', x: 0, y: 0, terrain: 'green' })]
				})
			);
			const ds = s(scene).game.canvas.dataset;
			expect(Number(ds.terrainDecorationSpriteCount)).toBe(0);
		});

		it('sets missing mode when all textures are missing and features exist', () => {
			expect.assertions(4);
			scene.create();
			s(scene).textures.exists = vi.fn(() => false);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'f1',
							x: 0,
							y: 0,
							feature: 'road',
							roadVariant: 'horizontal'
						})
					]
				})
			);
			const ds = s(scene).game.canvas.dataset;
			expect(ds.terrainAssetMode).toBe('missing');
			expect(ds.terrainBaseSpriteCount).toBe('0');
			expect(ds.terrainFeatureSpriteCount).toBe('0');
			expect(ds.terrainDecorationSpriteCount).toBe('0');
		});

		it('uses road sprite native horizontal orientation and rotates vertical roads', () => {
			expect.assertions(2);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'hr',
							x: 0,
							y: 0,
							terrain: 'transit',
							feature: 'road',
							roadVariant: 'horizontal'
						}),
						makeTile({
							id: 'vr',
							x: 1,
							y: 0,
							terrain: 'transit',
							feature: 'road',
							roadVariant: 'vertical'
						})
					]
				})
			);
			const featureSprites = (s(scene).add.image as Mock).mock.results.filter(
				(result: any) => result.value && (result.value.setAngle as Mock).mock.calls.length > 0
			);
			expect(featureSprites[0].value.setAngle).toHaveBeenCalledWith(0);
			expect(featureSprites[1].value.setAngle).toHaveBeenCalledWith(90);
		});

		it('handles corner-es river connector variant', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'river-corner-es',
							x: 0,
							y: 0,
							terrain: 'green',
							feature: 'river',
							riverVariant: 'corner-es'
						})
					]
				})
			);
			const textureKeys = (s(scene).add.image as Mock).mock.calls.map((call: any[]) => call[2]);
			expect(textureKeys).toContain('terrain-river-connector-corner-es');
		});

		it('handles corner-sw river connector variant', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'river-corner-sw',
							x: 0,
							y: 0,
							terrain: 'green',
							feature: 'river',
							riverVariant: 'corner-sw'
						})
					]
				})
			);
			const textureKeys = (s(scene).add.image as Mock).mock.calls.map((call: any[]) => call[2]);
			expect(textureKeys).toContain('terrain-river-connector-corner-sw');
		});

		it('handles corner-wn river connector variant', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'river-corner-wn',
							x: 0,
							y: 0,
							terrain: 'green',
							feature: 'river',
							riverVariant: 'corner-wn'
						})
					]
				})
			);
			const textureKeys = (s(scene).add.image as Mock).mock.calls.map((call: any[]) => call[2]);
			expect(textureKeys).toContain('terrain-river-connector-corner-wn');
		});

		it('handles tee-esw road connector variant', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'road-tee-esw',
							x: 0,
							y: 0,
							terrain: 'transit',
							feature: 'road',
							roadVariant: 'tee-esw'
						})
					]
				})
			);
			const textureKeys = (s(scene).add.image as Mock).mock.calls.map((call: any[]) => call[2]);
			expect(textureKeys).toContain('terrain-road-connector-tee-esw');
		});

		it('handles tee-nsw road connector variant', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'road-tee-nsw',
							x: 0,
							y: 0,
							terrain: 'transit',
							feature: 'road',
							roadVariant: 'tee-nsw'
						})
					]
				})
			);
			const textureKeys = (s(scene).add.image as Mock).mock.calls.map((call: any[]) => call[2]);
			expect(textureKeys).toContain('terrain-road-connector-tee-nsw');
		});

		it('handles tee-new road connector variant', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'road-tee-new',
							x: 0,
							y: 0,
							terrain: 'transit',
							feature: 'road',
							roadVariant: 'tee-new'
						})
					]
				})
			);
			const textureKeys = (s(scene).add.image as Mock).mock.calls.map((call: any[]) => call[2]);
			expect(textureKeys).toContain('terrain-road-connector-tee-new');
		});
	});

	describe('fitCameraToViewport', () => {
		it('fits zoom to show entire world', () => {
			expect.assertions(1);
			scene.create();
			s(scene).scale.width = 100;
			s(scene).scale.height = 100;
			s(scene).hasUserAdjustedCamera = false;
			scene.updateSnapshot(makeSnapshot({ width: 3, height: 3 }));
			const zoom = s(scene).cameras.main.zoom;
			expect(zoom).toBeGreaterThan(0);
		});

		it('reframes the camera when the active city changes after a user adjustment', () => {
			// A city swap (different cityId in the terrain key) must reset the
			// user's pan/zoom so the new city auto-frames, while a same-city
			// re-render still honors the adjustment.
			expect.assertions(3);
			scene.create();
			scene.updateSnapshot(makeSnapshot()); // test-city
			s(scene).isDragging = true;
			s(scene).lastDragPoint = { x: 10, y: 10 };
			s(scene).dragStartPoint = { x: 10, y: 10 };
			const moveHandler = getHandler(s(scene).input.on as Mock, 'pointermove');
			moveHandler.call(scene, makePointer(s(scene).game.canvas, { x: 40, y: 40, isDown: true }));
			expect(s(scene).hasUserAdjustedCamera).toBe(true);
			const setZoom = s(scene).cameras.main.setZoom as Mock;
			setZoom.mockClear();
			scene.updateSnapshot(makeSnapshot()); // same city, no terrain change
			expect(setZoom).not.toHaveBeenCalled();
			scene.updateSnapshot(makeSnapshot({ cityId: 'other-city' })); // city swap
			expect(setZoom).toHaveBeenCalled();
		});

		it('does not change terrain or camera framing when only rivals change', () => {
			expect.assertions(3);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const initialTerrainKey = s(scene).terrainKey;
			const setZoom = s(scene).cameras.main.setZoom as Mock;
			setZoom.mockClear();
			scene.updateSnapshot(
				makeSnapshot({
					competitors: [
						{
							id: 'rival-1',
							name: 'Rival One',
							archetypeId: 'convenience',
							x: 1,
							y: 1
						}
					]
				})
			);
			expect(s(scene).terrainKey).toBe(initialTerrainKey);
			expect(setZoom).not.toHaveBeenCalled();
			expect(s(scene).game.canvas.dataset.competitorMarkerCount).toBe('1');
		});
	});

	describe('destroySceneObjects', () => {
		it('destroys all graphics and removes event listeners', () => {
			expect.assertions(12);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const mapGraphics = s(scene).mapGraphics;
			const ownershipGraphics = s(scene).ownershipGraphics;
			const placementPreviewGraphics = s(scene).placementPreviewGraphics;
			const outlineGraphics = s(scene).outlineGraphics;
			const markerGraphics = s(scene).markerGraphics;
			const shutdownHandler = getHandler(s(scene).events.once as Mock, 'shutdown');
			shutdownHandler.call(scene);
			expect(mapGraphics.destroy).toHaveBeenCalled();
			expect(ownershipGraphics.destroy).toHaveBeenCalled();
			expect(placementPreviewGraphics.destroy).toHaveBeenCalled();
			expect(outlineGraphics.destroy).toHaveBeenCalled();
			expect(markerGraphics.destroy).toHaveBeenCalled();
			expect(s(scene).input.off).toHaveBeenCalledWith('pointermove', expect.any(Function), scene);
			expect(s(scene).input.off).toHaveBeenCalledWith('pointerup', expect.any(Function), scene);
			expect(s(scene).input.off).toHaveBeenCalledWith('wheel', expect.any(Function), scene);
			expect(s(scene).scale.off).toHaveBeenCalledWith('resize', expect.any(Function), scene);
			expect(s(scene).mapGraphics).toBeUndefined();
			expect(s(scene).ownershipGraphics).toBeUndefined();
			expect(s(scene).tileZones.length).toBe(0);
		});

		it('destroys store sprites', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			const sprite = s(scene).storeSprites[0].sprite;
			const shutdownHandler = getHandler(s(scene).events.once as Mock, 'shutdown');
			shutdownHandler.call(scene);
			expect(sprite.destroy).toHaveBeenCalled();
		});

		it('destroys terrain sprites', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(makeSnapshot());
			const spritesCopy = [...s(scene).terrainSprites];
			const shutdownHandler = getHandler(s(scene).events.once as Mock, 'shutdown');
			shutdownHandler.call(scene);
			const allDestroyed = spritesCopy.every(
				(sp: any) => (sp.destroy as Mock).mock.calls.length > 0
			);
			expect(allDestroyed).toBe(true);
		});
	});

	describe('canvas attributes', () => {
		it('updateCanvasCameraAttributes writes all camera dataset fields', () => {
			expect.assertions(10);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			scene.update(0);
			const ds = s(scene).game.canvas.dataset;
			expect(ds.mapZoom).toBeDefined();
			expect(ds.mapTileSize).toBeDefined();
			expect(ds.mapScrollX).toBeDefined();
			expect(ds.mapScrollY).toBeDefined();
			expect(ds.mapWorldWidth).toBeDefined();
			expect(ds.mapWorldHeight).toBeDefined();
			expect(ds.mapViewX).toBeDefined();
			expect(ds.mapViewY).toBeDefined();
			expect(ds.mapViewWidth).toBeDefined();
			expect(ds.mapViewHeight).toBeDefined();
		});

		it('updateCanvasCameraAttributes does not crash when canvas is missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).game = {};
			expect(() => scene.update(0)).not.toThrow();
		});

		it('updateCanvasStoreMarkerAttributes writes mode and count', () => {
			expect.assertions(2);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const ds = s(scene).game.canvas.dataset;
			expect(ds.storeMarkerMode).toBe('empty');
			expect(ds.storeSpriteCount).toBe('0');
		});

		it('updateCanvasTerrainAttributes writes all fields', () => {
			expect.assertions(4);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const ds = s(scene).game.canvas.dataset;
			expect(ds.terrainAssetMode).toBeDefined();
			expect(ds.terrainBaseSpriteCount).toBeDefined();
			expect(ds.terrainFeatureSpriteCount).toBeDefined();
			expect(ds.terrainDecorationSpriteCount).toBeDefined();
		});
	});

	describe('re-rendering', () => {
		it('destroys previous tile zones when terrain changes on re-render', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const firstZones = [...s(scene).tileZones];
			scene.updateSnapshot(
				makeSnapshot({
					cityId: 'different-city',
					tiles: [makeTile({ id: 't0', x: 0, y: 0, terrain: 'green' })]
				})
			);
			const allDestroyed = firstZones.every((z: any) => (z.destroy as Mock).mock.calls.length > 0);
			expect(allDestroyed).toBe(true);
		});

		it('caches tile zones when terrain is unchanged on re-render', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const firstZones = [...s(scene).tileZones];
			scene.updateSnapshot(makeSnapshot());
			const allSurvived = firstZones.every((z: any) => (z.destroy as Mock).mock.calls.length === 0);
			expect(allSurvived).toBe(true);
		});

		it('destroys previous store sprites on re-render', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			const firstSprites = [...s(scene).storeSprites];
			scene.updateSnapshot(makeSnapshot());
			const allDestroyed = firstSprites.every(
				(ss: any) => (ss.sprite.destroy as Mock).mock.calls.length > 0
			);
			expect(allDestroyed).toBe(true);
		});

		it('destroys previous terrain sprites when terrain changes on re-render', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(makeSnapshot());
			const firstSprites = [...s(scene).terrainSprites];
			scene.updateSnapshot(
				makeSnapshot({
					cityId: 'different-city',
					tiles: [makeTile({ id: 't0', x: 0, y: 0, terrain: 'green' })]
				})
			);
			const allDestroyed = firstSprites.every(
				(sp: any) => (sp.destroy as Mock).mock.calls.length > 0
			);
			expect(allDestroyed).toBe(true);
		});

		it('caches terrain sprites when terrain is unchanged on re-render', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(makeSnapshot());
			const firstSprites = [...s(scene).terrainSprites];
			scene.updateSnapshot(makeSnapshot());
			const allSurvived = firstSprites.every(
				(sp: any) => (sp.destroy as Mock).mock.calls.length === 0
			);
			expect(allSurvived).toBe(true);
		});

		it('caches terrain sprites when only tile ownership changes after store placement', () => {
			expect.assertions(2);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(makeSnapshot({ tiles: [makeTile({ id: 't0', x: 0, y: 0 })] }));
			const firstSprites = [...s(scene).terrainSprites];
			const firstZones = [...s(scene).tileZones];
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 't0', x: 0, y: 0, owned: true })],
					stores: [
						{
							id: 's1',
							name: 'Store',
							archetypeId: 'convenience',
							tileId: 't0',
							x: 0,
							y: 0,
							width: 2,
							height: 2
						}
					]
				})
			);
			expect(firstSprites.every((sp: any) => (sp.destroy as Mock).mock.calls.length === 0)).toBe(
				true
			);
			expect(firstZones.every((z: any) => (z.destroy as Mock).mock.calls.length === 0)).toBe(true);
		});
	});

	describe('branch coverage', () => {
		it('updates selectedTile from selectedTileId on re-render with unchanged terrain', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			scene.updateSnapshot(makeSnapshot({ selectedTileId: 't0' }));
			expect(s(scene).selectedTile?.id).toBe('t0');
		});

		it('sets selectedTile to null when selectedTileId references a missing tile on re-render', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			scene.updateSnapshot(makeSnapshot({ selectedTileId: 'missing' }));
			expect(s(scene).selectedTile).toBeNull();
		});

		it('computeTerrainKey returns empty string when no snapshot', () => {
			expect.assertions(1);
			scene.create();
			expect(s(scene).computeTerrainKey()).toBe('');
		});

		it('drawTile returns early when mapGraphics is missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).mapGraphics = undefined;
			expect(() => s(scene).drawTile(makeTile())).not.toThrow();
		});

		it('createMapInteractionZone returns early when no snapshot', () => {
			expect.assertions(1);
			scene.create();
			const zoneCountBefore = s(scene).tileZones.length;
			s(scene).createMapInteractionZone();
			expect(s(scene).tileZones.length).toBe(zoneCountBefore);
		});

		it('pointerup does not fire tileSelected when pointer is outside the grid', () => {
			expect.assertions(1);
			const handler = vi.fn();
			scene.setEventHandler(handler);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const downHandler = onCalls.find((c: any[]) => c[0] === 'pointerdown')?.[1];
			const upHandler = onCalls.find((c: any[]) => c[0] === 'pointerup')?.[1];
			const canvas = s(scene).game.canvas;
			const downPointer = makePointer(canvas, { x: 5, y: 5, worldX: 5, worldY: 5 });
			downHandler(downPointer);
			const upPointer = makePointer(canvas, { x: 5, y: 5, worldX: 9999, worldY: 9999 });
			upHandler(upPointer);
			expect(handler).not.toHaveBeenCalled();
		});

		it('pointerout does nothing when hoverTileId is already null', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			s(scene).hoverTileId = null;
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const outHandler = onCalls.find((c: any[]) => c[0] === 'pointerout')?.[1];
			const outlineGraphics = s(scene).outlineGraphics;
			(outlineGraphics.clear as Mock).mockClear();
			outHandler();
			expect(outlineGraphics.clear).not.toHaveBeenCalled();
		});

		it('getTileAtPointer falls back to pointer.x/y when worldX/worldY are undefined', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			const pointer = { x: 10, y: 10, worldX: undefined, worldY: undefined };
			expect(s(scene).getTileAtPointer(pointer)?.id).toBe('zone-tile');
		});

		it('uses zoom fallback of 1 when camera zoom is 0 during drag', () => {
			expect.assertions(1);
			scene.create();
			s(scene).cameras.main.zoom = 0;
			s(scene).isDragging = true;
			s(scene).lastDragPoint = { x: 10, y: 10 };
			s(scene).dragStartPoint = { x: 10, y: 10 };
			const canvas = s(scene).game.canvas;
			const pointer = makePointer(canvas, { x: 20, y: 20, isDown: true });
			const handler = getHandler(s(scene).input.on as Mock, 'pointermove');
			handler.call(scene, pointer);
			expect(s(scene).cameras.main.scrollX).toBe(-10);
		});

		it('does not set hasDragged when dragStartPoint is null during drag move', () => {
			expect.assertions(1);
			scene.create();
			s(scene).isDragging = true;
			s(scene).lastDragPoint = { x: 10, y: 10 };
			s(scene).dragStartPoint = null;
			s(scene).hasDragged = false;
			const canvas = s(scene).game.canvas;
			const pointer = makePointer(canvas, { x: 200, y: 200, isDown: true });
			const handler = getHandler(s(scene).input.on as Mock, 'pointermove');
			handler.call(scene, pointer);
			expect(s(scene).hasDragged).toBe(false);
		});

		it('does not update hover when pointer is not on canvas', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			s(scene).hoverTileId = null;
			const pointer = makePointer({}, { x: 10, y: 10, worldX: 10, worldY: 10 });
			const handler = getHandler(s(scene).input.on as Mock, 'pointermove');
			handler.call(scene, pointer);
			expect(s(scene).hoverTileId).toBeNull();
		});

		it('didDrag returns false when dragStartPoint is null', () => {
			expect.assertions(1);
			scene.create();
			s(scene).hasDragged = false;
			s(scene).dragStartPoint = null;
			const pointer = makePointer(s(scene).game.canvas, { x: 100, y: 100 });
			expect(s(scene).didDrag(pointer)).toBe(false);
		});

		it('setCameraBounds uses minimum tile size when snapshot is null', () => {
			expect.assertions(1);
			scene.create();
			s(scene).snapshot = null;
			s(scene).setCameraBounds();
			expect(s(scene).cameras.main.setBounds).toHaveBeenCalledWith(0, 0, 32, 32);
		});

		it('createStoreSprites sets missing mode when snapshot is null', () => {
			expect.assertions(2);
			scene.create();
			s(scene).snapshot = null;
			s(scene).createStoreSprites();
			const ds = s(scene).game.canvas.dataset;
			expect(ds.storeMarkerMode).toBe('missing');
			expect(ds.storeSpriteCount).toBe('0');
		});

		it('createTerrainSprites sets missing mode when snapshot is null', () => {
			expect.assertions(1);
			scene.create();
			s(scene).snapshot = null;
			s(scene).createTerrainSprites();
			const ds = s(scene).game.canvas.dataset;
			expect(ds.terrainAssetMode).toBe('missing');
		});

		it('updateCanvasStoreMarkerAttributes does not throw when canvas is missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).game = {};
			expect(() => s(scene).updateCanvasStoreMarkerAttributes('empty', 0)).not.toThrow();
		});

		it('updateCanvasTerrainAttributes does not throw when canvas is missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).game = {};
			expect(() => s(scene).updateCanvasTerrainAttributes('missing', 0, 0, 0)).not.toThrow();
		});

		it('updateCanvasPlacementPreviewAttributes does not throw when canvas is missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).game = {};
			expect(() => s(scene).updateCanvasPlacementPreviewAttributes(0, 0)).not.toThrow();
		});

		it('updateCanvasCameraAttributes uses zoom fallback of 1 when zoom is 0', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			s(scene).cameras.main.zoom = 0;
			s(scene).lastCameraKey = null;
			s(scene).updateCanvasCameraAttributes();
			const ds = s(scene).game.canvas.dataset;
			expect(Number(ds.mapZoom)).toBe(1);
		});

		it('updateCanvasCameraAttributes falls back to scale dimensions when worldView is zero', () => {
			expect.assertions(2);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			s(scene).cameras.main.zoom = 1;
			s(scene).cameras.main.worldView = { x: 0, y: 0, width: 0, height: 0 };
			s(scene).lastCameraKey = null;
			s(scene).updateCanvasCameraAttributes();
			const ds = s(scene).game.canvas.dataset;
			expect(Number(ds.mapViewWidth)).toBe(800);
			expect(Number(ds.mapViewHeight)).toBe(600);
		});

		it('draws a 2x2 placement footprint outline for a selected tile during placement preview', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					selectedTileId: 't0',
					placementPreview: { validTileIds: ['t0'], invalidTileIds: [] },
					tiles: [makeTile({ id: 't0', x: 0, y: 0, selected: true })]
				})
			);
			s(scene).drawInteractionOutlines();
			const outlineGraphics = s(scene).outlineGraphics;
			expect(outlineGraphics.strokeRect).toHaveBeenCalledWith(1, 1, 62, 62);
		});

		it('draws a 2x2 placement footprint outline for a hovered tile during placement preview', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: { validTileIds: ['t0'], invalidTileIds: [] },
					tiles: [makeTile({ id: 't0', x: 0, y: 0 })]
				})
			);
			s(scene).hoverTileId = 't0';
			s(scene).drawInteractionOutlines();
			const outlineGraphics = s(scene).outlineGraphics;
			expect(outlineGraphics.strokeRect).toHaveBeenCalledWith(2, 2, 60, 60);
		});

		it('breaks placement preview spans across non-contiguous tiles', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					placementPreview: {
						validTileIds: ['t0', 't3'],
						invalidTileIds: []
					}
				})
			);
			const placementPreviewGraphics = s(scene).placementPreviewGraphics;
			(placementPreviewGraphics.fillRect as Mock).mockClear();
			s(scene).drawPlacementPreview();
			expect(placementPreviewGraphics.fillRect).toHaveBeenCalledTimes(2);
		});

		it('drawPlacementPreviewSpans returns early when every tile id is unknown', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const placementPreviewGraphics = s(scene).placementPreviewGraphics;
			(placementPreviewGraphics.fillRect as Mock).mockClear();
			s(scene).drawPlacementPreviewSpans(new Set(['unknown-tile']), 0x1f8a70);
			expect(placementPreviewGraphics.fillRect).not.toHaveBeenCalled();
		});

		it('drawPlacementPreviewSpan returns early when placementPreviewGraphics is missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).placementPreviewGraphics = undefined;
			expect(() => s(scene).drawPlacementPreviewSpan(makeTile(), makeTile())).not.toThrow();
		});

		it('drawOwnershipOutlines returns early when ownershipGraphics is missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).ownershipGraphics = undefined;
			expect(() => s(scene).drawOwnershipOutlines()).not.toThrow();
		});
	});
});
