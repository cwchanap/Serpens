import { describe, expect, it, vi } from 'vitest';
import { AUDIO_PREFERENCES_STORAGE_KEY } from './audioPreferences';
import { createGameAudioController, type AudioControllerEnvironment } from './audioController';

class FakeStorage implements Storage {
	private values = new Map<string, string>();

	get length(): number {
		return this.values.size;
	}

	clear(): void {
		this.values.clear();
	}

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	key(index: number): string | null {
		return Array.from(this.values.keys())[index] ?? null;
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

interface MockManagedAudioElement {
	src: string;
	loop: boolean;
	volume: number;
	currentTime: number;
	play: ReturnType<typeof vi.fn<() => Promise<void>>>;
	pause: ReturnType<typeof vi.fn<() => void>>;
}

interface MockAudioSource {
	buffer: AudioBuffer | null;
	connect: ReturnType<typeof vi.fn<(destination: unknown) => void>>;
	start: ReturnType<typeof vi.fn<(when?: number) => void>>;
}

function createDeferred<Value>(): {
	promise: Promise<Value>;
	resolve(value: Value): void;
	reject(reason?: unknown): void;
} {
	let resolve: (value: Value) => void = () => undefined;
	let reject: (reason?: unknown) => void = () => undefined;
	const promise = new Promise<Value>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return { promise, resolve, reject };
}

function createFakeEnvironment(): {
	audioElements: MockManagedAudioElement[];
	bufferSources: MockAudioSource[];
	decodeAudioData: ReturnType<typeof vi.fn<(buffer: ArrayBuffer) => Promise<AudioBuffer>>>;
	environment: AudioControllerEnvironment;
	fetchArrayBuffer: ReturnType<typeof vi.fn<(path: string) => Promise<ArrayBuffer>>>;
	storage: FakeStorage;
	warn: ReturnType<typeof vi.fn<(...data: unknown[]) => void>>;
} {
	const audioElements: MockManagedAudioElement[] = [];
	const bufferSources: MockAudioSource[] = [];
	const storage = new FakeStorage();
	const destination = {};
	const fakeBuffer = {} as AudioBuffer;
	const decodeAudioData = vi.fn(async () => fakeBuffer);
	const fetchArrayBuffer = vi.fn(async () => new ArrayBuffer(8));
	const warn = vi.fn();

	return {
		audioElements,
		bufferSources,
		decodeAudioData,
		environment: {
			createAudioElement: (src) => {
				const element: MockManagedAudioElement = {
					src,
					loop: false,
					volume: 0,
					currentTime: 0,
					play: vi.fn(async () => undefined),
					pause: vi.fn()
				};

				audioElements.push(element);
				return element;
			},
			createAudioContext: () => ({
				state: 'running',
				destination,
				resume: vi.fn(async () => undefined),
				decodeAudioData,
				createBufferSource: () => {
					const source: MockAudioSource = {
						buffer: null,
						connect: vi.fn(),
						start: vi.fn()
					};

					bufferSources.push(source);
					return source;
				},
				createGain: () => ({
					gain: { value: 0 },
					connect: vi.fn()
				}),
				close: vi.fn(async () => undefined)
			}),
			fetchArrayBuffer,
			resolveAssetPath: (path) => `/base${path}`,
			storage,
			warn
		},
		fetchArrayBuffer,
		storage,
		warn
	};
}

describe('createGameAudioController', () => {
	it('waits for unlock before starting BGM', async () => {
		const { audioElements, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		controller.setActiveBgm('bgm.retail-map');

		expect(audioElements).toHaveLength(0);

		await controller.unlock();

		expect(audioElements).toHaveLength(1);
		expect(audioElements[0]?.src).toBe('/base/assets/game/audio/bgm/retail-map.mp3');
		expect(audioElements[0]?.play).toHaveBeenCalledTimes(1);
	});

	it('switches BGM when active cue changes', async () => {
		const { audioElements, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		controller.setActiveBgm('bgm.retail-map');
		controller.setActiveBgm('bgm.world-map');

		expect(audioElements).toHaveLength(2);
		expect(audioElements[0]?.pause).toHaveBeenCalledTimes(1);
		expect(audioElements[1]?.src).toBe('/base/assets/game/audio/bgm/world-map.mp3');
		expect(audioElements[1]?.play).toHaveBeenCalledTimes(1);
	});

	it('persists preference updates and notifies listener', () => {
		const { environment, storage } = createFakeEnvironment();
		const onPreferencesChanged = vi.fn();
		const controller = createGameAudioController({ environment, onPreferencesChanged });

		controller.updatePreferences({ bgmEnabled: false, sfxVolume: 0.2 });

		expect(controller.getPreferences()).toMatchObject({ bgmEnabled: false, sfxVolume: 0.2 });
		expect(onPreferencesChanged).toHaveBeenCalledWith(controller.getPreferences());
		expect(storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)).toBe(
			JSON.stringify(controller.getPreferences())
		);
	});

	it('plays SFX through decoded Web Audio buffer after unlock', async () => {
		const { bufferSources, decodeAudioData, environment, fetchArrayBuffer } =
			createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		await controller.playSfx('sfx.ui.click');

		expect(fetchArrayBuffer).toHaveBeenCalledWith('/base/assets/game/audio/sfx/ui-click.mp3');
		expect(decodeAudioData).toHaveBeenCalledTimes(1);
		expect(bufferSources).toHaveLength(1);
		expect(bufferSources[0]?.connect).toHaveBeenCalledTimes(1);
		expect(bufferSources[0]?.start).toHaveBeenCalledWith(0);
	});

	it('gates SFX when disabled', async () => {
		const { bufferSources, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		controller.updatePreferences({ sfxEnabled: false });
		await controller.playSfx('sfx.ui.click');

		expect(bufferSources).toHaveLength(0);
	});

	it('does not start pending SFX after destroy', async () => {
		const { bufferSources, environment, warn } = createFakeEnvironment();
		const decodeDeferred = createDeferred<AudioBuffer>();
		const fakeBuffer = {} as AudioBuffer;
		const decodeAudioData = vi.fn(() => decodeDeferred.promise);
		environment.createAudioContext = () => ({
			state: 'running',
			destination: {},
			resume: vi.fn(async () => undefined),
			decodeAudioData,
			createBufferSource: () => {
				const source: MockAudioSource = {
					buffer: null,
					connect: vi.fn(),
					start: vi.fn()
				};

				bufferSources.push(source);
				return source;
			},
			createGain: () => ({
				gain: { value: 0 },
				connect: vi.fn()
			}),
			close: vi.fn(async () => undefined)
		});
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		const playPromise = controller.playSfx('sfx.ui.click');
		await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));
		await controller.destroy();
		decodeDeferred.resolve(fakeBuffer);
		await playPromise;

		expect(bufferSources.every((source) => source.start.mock.calls.length === 0)).toBe(true);
		expect(warn).not.toHaveBeenCalled();
	});

	it('resumes a suspended audio context created during SFX playback', async () => {
		const { bufferSources, decodeAudioData, environment } = createFakeEnvironment();
		let contextState: AudioContextState = 'suspended';
		const resume = vi.fn(async () => {
			contextState = 'running';
		});
		environment.createAudioContext = () => ({
			get state() {
				return contextState;
			},
			destination: {},
			resume,
			decodeAudioData,
			createBufferSource: () => {
				const source: MockAudioSource = {
					buffer: null,
					connect: vi.fn(),
					start: vi.fn()
				};

				bufferSources.push(source);
				return source;
			},
			createGain: () => ({
				gain: { value: 0 },
				connect: vi.fn()
			}),
			close: vi.fn(async () => undefined)
		});
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		await controller.playSfx('sfx.ui.click');

		expect(resume).toHaveBeenCalledTimes(1);
		expect(bufferSources[0]?.start).toHaveBeenCalledWith(0);
		expect(resume.mock.invocationCallOrder[0]).toBeLessThan(
			bufferSources[0]?.start.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
		);
	});

	it('allows BGM to retry after a generic play rejection', async () => {
		const { audioElements, environment, warn } = createFakeEnvironment();
		let playAttempts = 0;
		environment.createAudioElement = (src) => {
			const element: MockManagedAudioElement = {
				src,
				loop: false,
				volume: 0,
				currentTime: 0,
				play: vi.fn(async () => {
					playAttempts += 1;

					if (playAttempts === 1) {
						throw new Error('Autoplay blocked');
					}
				}),
				pause: vi.fn()
			};

			audioElements.push(element);
			return element;
		};
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		controller.setActiveBgm('bgm.retail-map');
		await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));

		controller.updatePreferences({ bgmEnabled: false });
		controller.updatePreferences({ bgmEnabled: true });

		expect(audioElements).toHaveLength(2);
		expect(audioElements[1]?.src).toBe('/base/assets/game/audio/bgm/retail-map.mp3');
		expect(audioElements[1]?.play).toHaveBeenCalledTimes(1);
	});
});
