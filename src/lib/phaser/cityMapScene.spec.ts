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
				roadVariant: null
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
		...overrides
	};
}

function makePointer(canvas: any, overrides?: Record<string, any>) {
	return {
		x: 0,
		y: 0,
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
		it('creates four graphics objects', () => {
			expect.assertions(1);
			scene.create();
			expect(s(scene).add.graphics).toHaveBeenCalledTimes(4);
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
			expect.assertions(3);
			scene.create();
			const ds = s(scene).game.canvas.dataset;
			expect(ds.placementPreviewMode).toBe('inactive');
			expect(ds.placementValidTileCount).toBe('0');
			expect(ds.placementInvalidTileCount).toBe('0');
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
		it('creates a zone for each tile', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			expect(s(scene).add.zone).toHaveBeenCalledTimes(9);
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
			const mapGraphics = s(scene).mapGraphics;
			const lineCalls = mapGraphics.lineStyle.mock.calls;
			const ownedLine = lineCalls.find(
				(c: any[]) => c[0] === 3 && c[1] === 0x1f8a70 && c[2] === 0.95
			);
			expect(ownedLine).toBeDefined();
		});
	});

	describe('drawTerrainFeatureFallback', () => {
		it('draws road horizontal fallback', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'road-h',
							x: 0,
							y: 0,
							terrain: 'transit',
							feature: 'road',
							roadVariant: 'horizontal'
						})
					]
				})
			);
			const mapGraphics = s(scene).mapGraphics;
			const roadFill = mapGraphics.fillStyle.mock.calls.find((c: any[]) => c[0] === 0x50545a);
			expect(roadFill).toBeDefined();
		});

		it('draws road vertical fallback', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'road-v',
							x: 0,
							y: 0,
							terrain: 'transit',
							feature: 'road',
							roadVariant: 'vertical'
						})
					]
				})
			);
			const mapGraphics = s(scene).mapGraphics;
			expect(mapGraphics.fillRect).toHaveBeenCalled();
		});

		it('draws road intersection fallback', () => {
			expect.assertions(2);
			scene.create();
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
						})
					]
				})
			);
			const mapGraphics = s(scene).mapGraphics;
			expect(mapGraphics.fillStyle).toHaveBeenCalledWith(0x50545a, 0.92);
			expect(mapGraphics.lineBetween).toHaveBeenCalled();
		});

		it('draws river fallback', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'river',
							x: 0,
							y: 0,
							terrain: 'green',
							feature: 'river',
							roadVariant: null
						})
					]
				})
			);
			const mapGraphics = s(scene).mapGraphics;
			const riverFill = mapGraphics.fillStyle.mock.calls.find((c: any[]) => c[0] === 0x3ca7d8);
			expect(riverFill).toBeDefined();
		});

		it('skips fallback when terrain texture exists', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [
						makeTile({
							id: 'road-tex',
							x: 0,
							y: 0,
							terrain: 'transit',
							feature: 'road',
							roadVariant: 'horizontal'
						})
					]
				})
			);
			const mapGraphics = s(scene).mapGraphics;
			const roadFill = mapGraphics.fillStyle.mock.calls.find((c: any[]) => c[0] === 0x50545a);
			expect(roadFill).toBeUndefined();
		});

		it('skips fallback when tile has no feature', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'plain', x: 0, y: 0, terrain: 'commercial' })]
				})
			);
			const mapGraphics = s(scene).mapGraphics;
			const roadFill = mapGraphics.fillStyle.mock.calls.find((c: any[]) => c[0] === 0x50545a);
			expect(roadFill).toBeUndefined();
		});
	});

	describe('tile zones', () => {
		it('pointerover sets hoverTileId', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(
				makeSnapshot({
					tiles: [makeTile({ id: 'zone-tile', x: 0, y: 0 })]
				})
			);
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const handler = onCalls.find((c: any[]) => c[0] === 'pointerover')?.[1];
			handler();
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
			const zone = s(scene).tileZones[0];
			const onCalls = (zone.on as Mock).mock.calls;
			const overHandler = onCalls.find((c: any[]) => c[0] === 'pointerover')?.[1];
			const outHandler = onCalls.find((c: any[]) => c[0] === 'pointerout')?.[1];
			overHandler();
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
			const pointer = makePointer(canvas, { x: 10, y: 10 });
			downHandler(pointer);
			upHandler(pointer);
			expect(handler).toHaveBeenCalledWith({ type: 'tileSelected', tileId: 'zone-tile' });
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
			const pointer = makePointer({});
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
			const downPointer = makePointer(canvas, { x: 10, y: 10 });
			downHandler(downPointer);
			const upPointer = makePointer(canvas, { x: 30, y: 30 });
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
			if ((resizeHandler as Mock).mockClear) {
				(s(scene).cameras.main.setZoom as Mock).mockClear();
			}
			resizeHandler.call(scene);
			expect(s(scene).cameras.main.zoom).toBe(zoomBefore);
		});
	});

	describe('drawStoreMarkers', () => {
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
							y: 0
						}
					]
				})
			);
			const storeSprites = s(scene).storeSprites;
			expect(storeSprites.length).toBe(1);
		});

		it('draws circle markers when no store sprites', () => {
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
							y: 0
						}
					]
				})
			);
			scene.update(1000);
			const markerGraphics = s(scene).markerGraphics;
			expect(markerGraphics.fillCircle).toHaveBeenCalled();
			expect(markerGraphics.strokeCircle).toHaveBeenCalled();
			expect(markerGraphics.fillStyle).toHaveBeenCalledWith(0xf97316, 1);
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
							y: 0
						}
					]
				})
			);
			const ds = s(scene).game.canvas.dataset;
			expect(ds.storeMarkerMode).toBe('image');
			expect(ds.storeSpriteCount).toBe('1');
		});

		it('uses circle mode when storefront textures are missing', () => {
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
							y: 0
						}
					]
				})
			);
			const ds = s(scene).game.canvas.dataset;
			expect(ds.storeMarkerMode).toBe('circle');
			expect(ds.storeSpriteCount).toBe('0');
		});

		it('sets circle mode with empty stores and no textures', () => {
			expect.assertions(2);
			scene.create();
			s(scene).textures.exists = vi.fn(() => false);
			scene.updateSnapshot(makeSnapshot());
			const ds = s(scene).game.canvas.dataset;
			expect(ds.storeMarkerMode).toBe('circle');
			expect(ds.storeSpriteCount).toBe('0');
		});
	});

	describe('createTerrainSprites', () => {
		it('uses fallback mode when no textures exist', () => {
			expect.assertions(4);
			scene.create();
			s(scene).textures.exists = vi.fn(() => false);
			scene.updateSnapshot(makeSnapshot());
			const ds = s(scene).game.canvas.dataset;
			expect(ds.terrainAssetMode).toBe('fallback');
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

		it('uses mixed mode when some feature textures are missing', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn((key: string) => {
				return !key.includes('road');
			});
			scene.updateSnapshot(makeSnapshot());
			const ds = s(scene).game.canvas.dataset;
			expect(ds.terrainAssetMode).toBe('mixed');
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

		it('sets fallback when all textures missing and features exist', () => {
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
			expect(ds.terrainAssetMode).toBe('fallback');
			expect(ds.terrainBaseSpriteCount).toBe('0');
			expect(ds.terrainFeatureSpriteCount).toBe('0');
			expect(ds.terrainDecorationSpriteCount).toBe('0');
		});

		it('sets angle 90 for horizontal road sprites', () => {
			expect.assertions(1);
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
						})
					]
				})
			);
			const imageCalls = (s(scene).add.image as Mock).mock.results;
			const horizontalSprite = imageCalls.find(
				(r: any) => r.value && (r.value.setAngle as Mock).mock.calls.length > 0
			);
			expect(horizontalSprite).toBeDefined();
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
	});

	describe('destroySceneObjects', () => {
		it('destroys all graphics and removes event listeners', () => {
			expect.assertions(10);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const mapGraphics = s(scene).mapGraphics;
			const placementPreviewGraphics = s(scene).placementPreviewGraphics;
			const outlineGraphics = s(scene).outlineGraphics;
			const markerGraphics = s(scene).markerGraphics;
			const shutdownHandler = getHandler(s(scene).events.once as Mock, 'shutdown');
			shutdownHandler.call(scene);
			expect(mapGraphics.destroy).toHaveBeenCalled();
			expect(placementPreviewGraphics.destroy).toHaveBeenCalled();
			expect(outlineGraphics.destroy).toHaveBeenCalled();
			expect(markerGraphics.destroy).toHaveBeenCalled();
			expect(s(scene).input.off).toHaveBeenCalledWith('pointermove', expect.any(Function), scene);
			expect(s(scene).input.off).toHaveBeenCalledWith('pointerup', expect.any(Function), scene);
			expect(s(scene).input.off).toHaveBeenCalledWith('wheel', expect.any(Function), scene);
			expect(s(scene).scale.off).toHaveBeenCalledWith('resize', expect.any(Function), scene);
			expect(s(scene).mapGraphics).toBeUndefined();
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
							y: 0
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
			expect(ds.storeMarkerMode).toBe('circle');
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
		it('destroys previous tile zones on re-render', () => {
			expect.assertions(1);
			scene.create();
			scene.updateSnapshot(makeSnapshot());
			const firstZones = [...s(scene).tileZones];
			scene.updateSnapshot(makeSnapshot());
			const allDestroyed = firstZones.every((z: any) => (z.destroy as Mock).mock.calls.length > 0);
			expect(allDestroyed).toBe(true);
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
							y: 0
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

		it('destroys previous terrain sprites on re-render', () => {
			expect.assertions(1);
			scene.create();
			s(scene).textures.exists = vi.fn(() => true);
			scene.updateSnapshot(makeSnapshot());
			const firstSprites = [...s(scene).terrainSprites];
			scene.updateSnapshot(makeSnapshot());
			const allDestroyed = firstSprites.every(
				(sp: any) => (sp.destroy as Mock).mock.calls.length > 0
			);
			expect(allDestroyed).toBe(true);
		});
	});
});
