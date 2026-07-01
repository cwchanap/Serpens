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
	load: ReturnType<typeof vi.fn<() => void>>;
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
					pause: vi.fn(),
					load: vi.fn()
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
	it('attempts BGM when the active cue is set before unlock', () => {
		const { audioElements, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		controller.setActiveBgm('bgm.retail-map');

		expect(audioElements).toHaveLength(1);
		expect(audioElements[0]?.src).toBe('/base/assets/game/audio/bgm/retail-map.mp3');
		expect(audioElements[0]?.play).toHaveBeenCalledTimes(1);
	});

	it('retries BGM on unlock after an autoplay rejection', async () => {
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
				pause: vi.fn(),
				load: vi.fn()
			};

			audioElements.push(element);
			return element;
		};
		const controller = createGameAudioController({ environment });

		controller.setActiveBgm('bgm.retail-map');
		await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));

		await controller.unlock();

		expect(audioElements).toHaveLength(2);
		expect(audioElements[1]?.src).toBe('/base/assets/game/audio/bgm/retail-map.mp3');
		expect(audioElements[1]?.play).toHaveBeenCalledTimes(1);
	});

	it('retries BGM on unlock when a pre-unlock play attempt is still pending', async () => {
		const { audioElements, environment } = createFakeEnvironment();
		const firstPlayDeferred = createDeferred<void>();
		let playAttempts = 0;
		environment.createAudioElement = (src) => {
			playAttempts += 1;
			const element: MockManagedAudioElement = {
				src,
				loop: false,
				volume: 0,
				currentTime: 0,
				play: vi.fn<() => Promise<void>>(() =>
					playAttempts === 1 ? firstPlayDeferred.promise : Promise.resolve()
				),
				pause: vi.fn(),
				load: vi.fn()
			};

			audioElements.push(element);
			return element;
		};
		const controller = createGameAudioController({ environment });

		controller.setActiveBgm('bgm.retail-map');
		expect(audioElements).toHaveLength(1);

		await controller.unlock();

		// Unlock should have stopped the pending element and created a new one
		// whose play() runs inside the user activation.
		expect(audioElements).toHaveLength(2);
		expect(audioElements[0]?.pause).toHaveBeenCalledTimes(1);
		expect(audioElements[1]?.play).toHaveBeenCalledTimes(1);

		// A late rejection from the original pending attempt must not stop the
		// retried BGM.
		firstPlayDeferred.reject(new Error('Autoplay blocked'));
		await Promise.resolve();
		await Promise.resolve();
		expect(audioElements[1]?.pause).not.toHaveBeenCalled();
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
				pause: vi.fn(),
				load: vi.fn()
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

	it('does nothing when unlock is called on a destroyed controller', async () => {
		expect.assertions(1);
		const { environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.destroy();
		await controller.unlock();

		expect(controller.getPreferences()).toBeDefined();
	});

	it('warns when resuming a suspended audio context during unlock fails', async () => {
		const { bufferSources, environment, warn } = createFakeEnvironment();
		environment.createAudioContext = () => ({
			state: 'suspended',
			destination: {},
			resume: vi.fn(async () => {
				throw new Error('resume failed');
			}),
			decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
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

		// Create the audio context via SFX playback (the only path that lazily creates
		// it). ensureAudioContext will attempt to resume and warn once. The context
		// stays suspended because resume throws.
		await controller.unlock();
		await controller.playSfx('sfx.ui.click');
		// Calling unlock again now hits the unlock-path resume catch since the
		// context already exists and is still suspended.
		await controller.unlock();

		expect(warn).toHaveBeenCalledWith('Unable to resume audio context', expect.any(Error));
	});

	it('marks an SFX cue as failed when Web Audio is unavailable', async () => {
		expect.assertions(1);
		const { environment, warn } = createFakeEnvironment();
		environment.createAudioContext = () => null;
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		await controller.playSfx('sfx.ui.click');

		expect(warn).toHaveBeenCalledWith('Audio cue failed', 'sfx.ui.click', expect.any(Error));
	});

	it('marks an SFX cue as failed when fetching the buffer rejects', async () => {
		expect.assertions(1);
		const { environment, fetchArrayBuffer, warn } = createFakeEnvironment();
		fetchArrayBuffer.mockRejectedValueOnce(new Error('network down'));
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		await controller.playSfx('sfx.ui.click');

		expect(warn).toHaveBeenCalledWith('Audio cue failed', 'sfx.ui.click', expect.any(Error));
	});

	it('marks an SFX cue as failed when decoding the buffer rejects', async () => {
		expect.assertions(2);
		const { decodeAudioData, environment, warn } = createFakeEnvironment();
		decodeAudioData.mockRejectedValueOnce(new Error('corrupt audio'));
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		await controller.playSfx('sfx.ui.click');

		expect(decodeAudioData).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith('Audio cue failed', 'sfx.ui.click', expect.any(Error));
	});

	it('does not warn when an in-flight SFX is destroyed before fetch resolves', async () => {
		const { environment, fetchArrayBuffer, warn } = createFakeEnvironment();
		const fetchDeferred = createDeferred<ArrayBuffer>();
		fetchArrayBuffer.mockReturnValueOnce(fetchDeferred.promise);
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		const playPromise = controller.playSfx('sfx.ui.click');
		await vi.waitFor(() => expect(fetchArrayBuffer).toHaveBeenCalledTimes(1));
		await controller.destroy();
		fetchDeferred.reject(new Error('network down'));
		await playPromise;

		expect(warn).not.toHaveBeenCalled();
	});

	it('does not decode or cache SFX when destroyed after fetch resolves', async () => {
		const { decodeAudioData, environment, fetchArrayBuffer, warn } = createFakeEnvironment();
		const fetchDeferred = createDeferred<ArrayBuffer>();
		fetchArrayBuffer.mockReturnValueOnce(fetchDeferred.promise);
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		const playPromise = controller.playSfx('sfx.ui.click');
		await vi.waitFor(() => expect(fetchArrayBuffer).toHaveBeenCalledTimes(1));
		await controller.destroy();
		fetchDeferred.resolve(new ArrayBuffer(8));
		await playPromise;

		expect(decodeAudioData).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
	});

	it('aborts SFX playback when destroyed while resuming the audio context', async () => {
		const { bufferSources, environment } = createFakeEnvironment();
		const resumeDeferred = createDeferred<void>();
		const resume = vi.fn(() => resumeDeferred.promise);
		const contextState: AudioContextState = 'suspended';
		environment.createAudioContext = () => ({
			get state() {
				return contextState;
			},
			destination: {},
			resume,
			decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
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
		await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
		await controller.destroy();
		resumeDeferred.resolve();
		await playPromise;

		expect(bufferSources.every((source) => source.start.mock.calls.length === 0)).toBe(true);
	});

	it('reuses a cached decoded buffer for repeated SFX cues', async () => {
		expect.assertions(2);
		const { decodeAudioData, environment, fetchArrayBuffer } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		await controller.playSfx('sfx.ui.click');
		await controller.playSfx('sfx.ui.click');

		expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
		expect(decodeAudioData).toHaveBeenCalledTimes(1);
	});

	it('dedupes concurrent in-flight SFX loads for the same cue', async () => {
		const { decodeAudioData, environment, fetchArrayBuffer } = createFakeEnvironment();
		const fetchDeferred = createDeferred<ArrayBuffer>();
		fetchArrayBuffer.mockReturnValueOnce(fetchDeferred.promise);
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		const firstPlay = controller.playSfx('sfx.ui.click');
		const secondPlay = controller.playSfx('sfx.ui.click');
		await vi.waitFor(() => expect(fetchArrayBuffer).toHaveBeenCalledTimes(1));
		fetchDeferred.resolve(new ArrayBuffer(8));
		await Promise.all([firstPlay, secondPlay]);

		expect(fetchArrayBuffer).toHaveBeenCalledTimes(1);
		expect(decodeAudioData).toHaveBeenCalledTimes(1);
	});

	it('does not apply preference updates after destroy', () => {
		expect.assertions(1);
		const { environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		controller.updatePreferences({ bgmEnabled: true, bgmVolume: 0.5 });
		const before = controller.getPreferences();
		void controller.destroy();
		controller.updatePreferences({ bgmEnabled: false });

		expect(controller.getPreferences()).toEqual(before);
	});

	it('stops the current BGM when preferences disable it', async () => {
		expect.assertions(2);
		const { audioElements, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		controller.setActiveBgm('bgm.retail-map');
		controller.updatePreferences({ bgmEnabled: false });

		expect(audioElements[0]?.pause).toHaveBeenCalledTimes(1);
		expect(audioElements).toHaveLength(1);
	});

	it('updates the running BGM volume without restarting when volume changes', async () => {
		expect.assertions(2);
		const { audioElements, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		controller.setActiveBgm('bgm.retail-map');
		controller.updatePreferences({ bgmVolume: 0.3 });

		expect(audioElements).toHaveLength(1);
		expect(audioElements[0]?.volume).toBe(0.3);
	});

	it('does not restart BGM on preference update when not unlocked', () => {
		expect.assertions(1);
		const { audioElements, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		controller.setActiveBgm('bgm.retail-map');
		controller.updatePreferences({ bgmVolume: 0.3 });

		expect(audioElements).toHaveLength(1);
	});

	it('ignores destroy when already destroyed', async () => {
		expect.assertions(1);
		const { environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.destroy();
		await expect(controller.destroy()).resolves.toBeUndefined();
	});

	it('warns when closing the audio context fails during destroy', async () => {
		expect.assertions(1);
		const { environment, warn } = createFakeEnvironment();
		environment.createAudioContext = () => ({
			state: 'running',
			destination: {},
			resume: vi.fn(async () => undefined),
			decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
			createBufferSource: () => ({
				buffer: null,
				connect: vi.fn(),
				start: vi.fn()
			}),
			createGain: () => ({
				gain: { value: 0 },
				connect: vi.fn()
			}),
			close: vi.fn(async () => {
				throw new Error('close failed');
			})
		});
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		// Trigger lazy audio context creation so destroy has a context to close.
		await controller.playSfx('sfx.ui.click');
		await controller.destroy();

		expect(warn).toHaveBeenCalledWith('Unable to close audio context', expect.any(Error));
	});

	it('does not start BGM when bgm is disabled', () => {
		expect.assertions(1);
		const { audioElements, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		controller.updatePreferences({ bgmEnabled: false });
		controller.setActiveBgm('bgm.retail-map');

		expect(audioElements).toHaveLength(0);
	});

	it('does not start BGM when the cue previously failed', async () => {
		expect.assertions(1);
		const { audioElements, environment } = createFakeEnvironment();
		environment.createAudioElement = () => {
			throw new Error('element creation failed');
		};
		const controller = createGameAudioController({ environment });

		controller.setActiveBgm('bgm.retail-map');
		controller.setActiveBgm('bgm.retail-map');

		expect(audioElements).toHaveLength(0);
	});

	it('warns when createAudioElement throws while starting BGM', () => {
		expect.assertions(1);
		const { environment, warn } = createFakeEnvironment();
		environment.createAudioElement = () => {
			throw new Error('element creation failed');
		};
		const controller = createGameAudioController({ environment });

		controller.setActiveBgm('bgm.retail-map');

		expect(warn).toHaveBeenCalledWith('Audio cue failed', 'bgm.retail-map', expect.any(Error));
	});

	it('stops and warns when pausing the current BGM throws', async () => {
		expect.assertions(1);
		const { audioElements, environment, warn } = createFakeEnvironment();
		environment.createAudioElement = (src) => {
			const element: MockManagedAudioElement = {
				src,
				loop: false,
				volume: 0,
				currentTime: 0,
				play: vi.fn(async () => undefined),
				pause: vi.fn(() => {
					throw new Error('pause failed');
				}),
				load: vi.fn()
			};
			audioElements.push(element);
			return element;
		};
		const controller = createGameAudioController({ environment });

		controller.setActiveBgm('bgm.retail-map');
		controller.setActiveBgm(null);

		expect(warn).toHaveBeenCalledWith('Unable to stop BGM', expect.any(Error));
	});

	it('warns when createAudioContext throws', async () => {
		expect.assertions(1);
		const { environment, warn } = createFakeEnvironment();
		environment.createAudioContext = () => {
			throw new Error('context creation failed');
		};
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		await controller.playSfx('sfx.ui.click');

		expect(warn).toHaveBeenCalledWith('Unable to create audio context', expect.any(Error));
	});

	it('warns when resuming a suspended context during SFX playback fails', async () => {
		expect.assertions(1);
		const { bufferSources, decodeAudioData, environment, warn } = createFakeEnvironment();
		const contextState: AudioContextState = 'suspended';
		environment.createAudioContext = () => ({
			get state() {
				return contextState;
			},
			destination: {},
			resume: vi.fn(async () => {
				throw new Error('resume failed');
			}),
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

		expect(warn).toHaveBeenCalledWith('Unable to resume audio context', expect.any(Error));
	});

	it('gates SFX when sfxVolume is zero', async () => {
		expect.assertions(1);
		const { bufferSources, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		controller.updatePreferences({ sfxVolume: 0 });
		await controller.playSfx('sfx.ui.click');

		expect(bufferSources).toHaveLength(0);
	});

	it('gates SFX when not unlocked', async () => {
		expect.assertions(1);
		const { bufferSources, environment } = createFakeEnvironment();
		const controller = createGameAudioController({ environment });

		await controller.playSfx('sfx.ui.click');

		expect(bufferSources).toHaveLength(0);
	});

	it('does not play an SFX cue that previously failed', async () => {
		expect.assertions(1);
		const { bufferSources, environment, fetchArrayBuffer } = createFakeEnvironment();
		fetchArrayBuffer.mockRejectedValueOnce(new Error('network down'));
		const controller = createGameAudioController({ environment });

		await controller.unlock();
		await controller.playSfx('sfx.ui.click');
		await controller.playSfx('sfx.ui.click');

		expect(bufferSources).toHaveLength(0);
	});

	it('uses default environment helpers when no overrides are supplied', async () => {
		expect.assertions(2);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		try {
			const controller = createGameAudioController();

			// In the node test environment Audio/AudioContext are undefined, so the
			// default helpers return noop elements / null contexts. Operations should
			// not throw and should fall back to defaults.
			controller.setActiveBgm('bgm.retail-map');
			await controller.unlock();
			await controller.playSfx('sfx.ui.click');
			// Stop the BGM so the noop element's pause() is exercised too.
			controller.setActiveBgm(null);
			await controller.destroy();

			expect(controller.getPreferences()).toBeDefined();
			expect(warnSpy).toHaveBeenCalled();
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('uses the default createAudioElement when Audio is available', () => {
		expect.assertions(1);
		const fakeAudioInstances: { src: string; pause: () => void }[] = [];
		class FakeAudio {
			src: string;
			loop = false;
			volume = 0;
			currentTime = 0;
			constructor(src: string) {
				this.src = src;
				fakeAudioInstances.push(this);
			}
			play() {
				return Promise.resolve();
			}
			pause() {}
		}
		const originalAudio = (globalThis as { Audio?: unknown }).Audio;
		(globalThis as { Audio?: unknown }).Audio = FakeAudio;
		try {
			const controller = createGameAudioController({
				environment: { storage: null }
			});
			controller.setActiveBgm('bgm.retail-map');

			expect(fakeAudioInstances).toHaveLength(1);
		} finally {
			if (originalAudio === undefined) {
				delete (globalThis as { Audio?: unknown }).Audio;
			} else {
				(globalThis as { Audio?: unknown }).Audio = originalAudio;
			}
		}
	});

	it('uses the default fetchArrayBuffer success path to decode and play SFX', async () => {
		expect.assertions(1);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const decodedBuffer = {} as AudioBuffer;
		const decodeAudioData = vi.fn(async () => decodedBuffer);
		const bufferSources: MockAudioSource[] = [];
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }) as Response);
		try {
			const controller = createGameAudioController({
				environment: {
					createAudioContext: () => ({
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
					})
				}
			});

			await controller.unlock();
			await controller.playSfx('sfx.ui.click');

			expect(bufferSources[0]?.start).toHaveBeenCalledWith(0);
		} finally {
			fetchSpy.mockRestore();
			warnSpy.mockRestore();
		}
	});

	it('surfaces a non-ok fetch response as a failed SFX cue', async () => {
		expect.assertions(1);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 404 }) as Response);
		try {
			const controller = createGameAudioController({
				environment: {
					createAudioContext: () => ({
						state: 'running',
						destination: {},
						resume: vi.fn(async () => undefined),
						decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
						createBufferSource: () => ({
							buffer: null,
							connect: vi.fn(),
							start: vi.fn()
						}),
						createGain: () => ({
							gain: { value: 0 },
							connect: vi.fn()
						}),
						close: vi.fn(async () => undefined)
					})
				}
			});

			await controller.unlock();
			await controller.playSfx('sfx.ui.click');

			expect(warnSpy).toHaveBeenCalledWith('Audio cue failed', 'sfx.ui.click', expect.any(Error));
		} finally {
			fetchSpy.mockRestore();
			warnSpy.mockRestore();
		}
	});

	it('falls back to default storage when globalThis.localStorage access throws', () => {
		expect.assertions(1);
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('access denied');
			}
		});

		try {
			const controller = createGameAudioController();
			expect(controller.getPreferences()).toBeDefined();
		} finally {
			if (descriptor) {
				Object.defineProperty(globalThis, 'localStorage', descriptor);
			} else {
				delete (globalThis as { localStorage?: unknown }).localStorage;
			}
		}
	});

	it('uses the default fetchArrayBuffer and surfaces a fetch failure as a failed cue', async () => {
		expect.assertions(1);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
		try {
			const controller = createGameAudioController({
				environment: {
					createAudioContext: () => ({
						state: 'running',
						destination: {},
						resume: vi.fn(async () => undefined),
						decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
						createBufferSource: () => ({
							buffer: null,
							connect: vi.fn(),
							start: vi.fn()
						}),
						createGain: () => ({
							gain: { value: 0 },
							connect: vi.fn()
						}),
						close: vi.fn(async () => undefined)
					})
				}
			});

			await controller.unlock();
			await controller.playSfx('sfx.ui.click');

			expect(warnSpy).toHaveBeenCalledWith('Audio cue failed', 'sfx.ui.click', expect.any(Error));
		} finally {
			fetchSpy.mockRestore();
			warnSpy.mockRestore();
		}
	});

	it('uses the default fetchArrayBuffer when fetch is undefined', async () => {
		expect.assertions(1);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const originalFetch = globalThis.fetch;
		Object.defineProperty(globalThis, 'fetch', {
			configurable: true,
			value: undefined,
			writable: true
		});
		try {
			const controller = createGameAudioController({
				environment: {
					createAudioContext: () => ({
						state: 'running',
						destination: {},
						resume: vi.fn(async () => undefined),
						decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
						createBufferSource: () => ({
							buffer: null,
							connect: vi.fn(),
							start: vi.fn()
						}),
						createGain: () => ({
							gain: { value: 0 },
							connect: vi.fn()
						}),
						close: vi.fn(async () => undefined)
					})
				}
			});

			await controller.unlock();
			await controller.playSfx('sfx.ui.click');

			expect(warnSpy).toHaveBeenCalledWith('Audio cue failed', 'sfx.ui.click', expect.any(Error));
		} finally {
			Object.defineProperty(globalThis, 'fetch', {
				configurable: true,
				value: originalFetch,
				writable: true
			});
			warnSpy.mockRestore();
		}
	});
});
