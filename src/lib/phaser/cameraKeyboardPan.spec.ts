/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/paths', () => ({ asset: (path: string) => path }));

const keyboardKeys = {
	W: { isDown: false },
	A: { isDown: false },
	S: { isDown: false },
	D: { isDown: false }
};
const addKeys = vi.fn(() => keyboardKeys);

vi.mock('phaser', () => {
	function chainable(): Record<string, any> {
		const object: Record<string, any> = {};
		for (const method of [
			'setDepth',
			'setOrigin',
			'setInteractive',
			'setDisplaySize',
			'setAlpha',
			'setTint',
			'setAngle',
			'setPosition',
			'clear',
			'fillStyle',
			'fillRect',
			'lineStyle',
			'strokeRect',
			'lineBetween',
			'fillCircle',
			'strokeCircle'
		]) {
			object[method] = vi.fn(() => object);
		}
		object.on = vi.fn(() => object);
		object.off = vi.fn();
		object.destroy = vi.fn();
		return object;
	}

	class MockScene {
		add = {
			graphics: vi.fn(() => chainable()),
			image: vi.fn(() => chainable()),
			zone: vi.fn(() => chainable())
		};
		input = {
			on: vi.fn(),
			off: vi.fn(),
			keyboard: { addKeys, on: vi.fn(), off: vi.fn() }
		};
		scale = { on: vi.fn(), off: vi.fn(), width: 800, height: 600 };
		cameras = {
			main: {
				zoom: 1,
				scrollX: 100,
				scrollY: 100,
				worldView: { x: 0, y: 0, width: 800, height: 600 },
				setZoom: vi.fn(function (this: any, zoom: number) {
					this.zoom = zoom;
					return this;
				}),
				setScroll: vi.fn(function (this: any, x: number, y: number) {
					this.scrollX = x;
					this.scrollY = y;
					return this;
				}),
				setBounds: vi.fn(function (this: any) {
					return this;
				})
			}
		};
		textures = { exists: vi.fn(() => false) };
		events = { once: vi.fn() };
		load = { image: vi.fn() };
		game = { canvas: { dataset: {} as Record<string, string> } };

		constructor() {}
	}

	return {
		default: {
			Scene: MockScene,
			Math: {
				Clamp: (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
			},
			Scale: { Events: { RESIZE: 'resize' } },
			Scenes: { Events: { SHUTDOWN: 'shutdown' } },
			Input: { Pointer: class {} },
			GameObjects: {
				GameObject: class {},
				Graphics: class {},
				Image: class {},
				Zone: class {}
			}
		}
	};
});

import { CityMapScene } from './cityMapScene';
import { IndustryMapScene } from './industryMapScene';

describe.each([
	['retail', () => new CityMapScene()],
	['industry', () => new IndustryMapScene()]
] as const)('%s map WASD camera pan', (_name, createScene) => {
	beforeEach(() => {
		for (const key of Object.values(keyboardKeys)) key.isDown = false;
		addKeys.mockClear();
	});

	it('registers WASD keys when the scene starts', () => {
		expect.assertions(1);
		const scene = createScene() as any;
		scene.create();
		expect(addKeys).toHaveBeenCalledWith('W,A,S,D');
	});

	it('pans continuously while D is held', () => {
		expect.assertions(2);
		const scene = createScene() as any;
		scene.create();
		const before = scene.cameras.main.scrollX;
		keyboardKeys.D.isDown = true;

		scene.update(0, 1000);

		expect(scene.cameras.main.scrollX).toBeGreaterThan(before);
		expect(scene.hasUserAdjustedCamera).toBe(true);
	});
});
