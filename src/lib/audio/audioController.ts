import { asset } from '$app/paths';
import { getAudioCue, type AudioCueId, type BgmCueId, type SfxCueId } from './audioCatalog';
import {
	readAudioPreferences,
	saveAudioPreferences,
	sanitizeAudioPreferences,
	type AudioPreferences
} from './audioPreferences';

export interface ManagedAudioElement {
	src: string;
	loop: boolean;
	volume: number;
	currentTime: number;
	play(): Promise<void> | void;
	pause(): void;
}

export interface AudioBufferSourceLike {
	buffer: AudioBuffer | null;
	connect(destination: unknown): unknown;
	start(when?: number): void;
}

export interface GainNodeLike {
	gain: { value: number };
	connect(destination: unknown): unknown;
}

export interface AudioContextLike {
	state: AudioContextState;
	destination: unknown;
	resume(): Promise<void>;
	decodeAudioData(buffer: ArrayBuffer): Promise<AudioBuffer>;
	createBufferSource(): AudioBufferSourceLike;
	createGain(): GainNodeLike;
	close(): Promise<void>;
}

export interface AudioControllerEnvironment {
	createAudioElement(src: string): ManagedAudioElement;
	createAudioContext(): AudioContextLike | null;
	fetchArrayBuffer(path: string): Promise<ArrayBuffer>;
	resolveAssetPath(path: string): string;
	storage: Storage | null;
	warn(...data: unknown[]): void;
}

export interface GameAudioControllerOptions {
	environment?: Partial<AudioControllerEnvironment>;
	onPreferencesChanged?: (preferences: AudioPreferences) => void;
}

export interface GameAudioController {
	unlock(): Promise<void>;
	setActiveBgm(cueId: BgmCueId | null): void;
	playSfx(cueId: SfxCueId): Promise<void>;
	getPreferences(): AudioPreferences;
	updatePreferences(patch: Partial<AudioPreferences>): void;
	destroy(): Promise<void>;
}

function getBrowserStorage(): Storage | null {
	try {
		return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
	} catch {
		return null;
	}
}

function createNoopAudioElement(src: string): ManagedAudioElement {
	return {
		src,
		loop: false,
		volume: 0,
		currentTime: 0,
		play: () => undefined,
		pause: () => undefined
	};
}

function createDefaultAudioContext(): AudioContextLike | null {
	const audioGlobal = globalThis as typeof globalThis & {
		AudioContext?: typeof AudioContext;
		webkitAudioContext?: typeof AudioContext;
	};
	const AudioContextConstructor = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;

	return AudioContextConstructor ? new AudioContextConstructor() : null;
}

function hasEnvironmentOverride<Key extends keyof AudioControllerEnvironment>(
	environment: Partial<AudioControllerEnvironment>,
	key: Key
): environment is Partial<AudioControllerEnvironment> & Pick<AudioControllerEnvironment, Key> {
	return Object.prototype.hasOwnProperty.call(environment, key);
}

function createAudioControllerEnvironment(
	environment: Partial<AudioControllerEnvironment> = {}
): AudioControllerEnvironment {
	return {
		createAudioElement:
			environment.createAudioElement ??
			((src) => {
				if (typeof Audio === 'undefined') {
					return createNoopAudioElement(src);
				}

				return new Audio(src);
			}),
		createAudioContext: environment.createAudioContext ?? createDefaultAudioContext,
		fetchArrayBuffer:
			environment.fetchArrayBuffer ??
			(async (path) => {
				if (typeof fetch === 'undefined') {
					throw new Error('fetch is unavailable');
				}

				const response = await fetch(path);

				if (!response.ok) {
					throw new Error(`Audio request failed with ${response.status}`);
				}

				return response.arrayBuffer();
			}),
		resolveAssetPath: environment.resolveAssetPath ?? ((path) => asset(path)),
		storage: hasEnvironmentOverride(environment, 'storage')
			? environment.storage
			: getBrowserStorage(),
		warn:
			environment.warn ??
			((...data) => {
				console.warn(...data);
			})
	};
}

export function createGameAudioController(
	options: GameAudioControllerOptions = {}
): GameAudioController {
	return new BrowserGameAudioController({
		environment: createAudioControllerEnvironment(options.environment),
		onPreferencesChanged: options.onPreferencesChanged
	});
}

interface BrowserGameAudioControllerOptions {
	environment: AudioControllerEnvironment;
	onPreferencesChanged?: (preferences: AudioPreferences) => void;
}

class BrowserGameAudioController implements GameAudioController {
	private activeBgmCueId: BgmCueId | null = null;
	private audioContext: AudioContextLike | null = null;
	private currentBgm: ManagedAudioElement | null = null;
	private currentBgmCueId: BgmCueId | null = null;
	private readonly environment: AudioControllerEnvironment;
	private readonly failedCueIds = new Set<AudioCueId>();
	private preferences: AudioPreferences;
	private readonly sfxBuffers = new Map<SfxCueId, AudioBuffer>();
	private unlocked = false;
	private destroyed = false;
	private readonly onPreferencesChanged: ((preferences: AudioPreferences) => void) | undefined;

	constructor(options: BrowserGameAudioControllerOptions) {
		this.environment = options.environment;
		this.onPreferencesChanged = options.onPreferencesChanged;
		this.preferences = readAudioPreferences(this.environment.storage);
	}

	async unlock(): Promise<void> {
		if (this.destroyed) {
			return;
		}

		this.unlocked = true;

		if (this.audioContext?.state === 'suspended') {
			try {
				await this.audioContext.resume();
			} catch (error) {
				this.environment.warn('Unable to resume audio context', error);
			}
		}

		this.startActiveBgm();
	}

	setActiveBgm(cueId: BgmCueId | null): void {
		if (this.destroyed || this.activeBgmCueId === cueId) {
			return;
		}

		this.activeBgmCueId = cueId;

		if (cueId === null) {
			this.stopCurrentBgm();
			return;
		}

		this.startActiveBgm();
	}

	async playSfx(cueId: SfxCueId): Promise<void> {
		if (!this.canPlaySfx(cueId)) {
			return;
		}

		const context = await this.ensureAudioContext();

		if (context === null) {
			this.markCueFailed(cueId, new Error('Web Audio is unavailable'));
			return;
		}

		if (!this.canPlaySfx(cueId)) {
			return;
		}

		try {
			const buffer = await this.getSfxBuffer(cueId, context);

			if (!this.canPlaySfx(cueId)) {
				return;
			}

			const source = context.createBufferSource();
			const gain = context.createGain();

			source.buffer = buffer;
			gain.gain.value = this.preferences.sfxVolume;
			source.connect(gain);
			gain.connect(context.destination);
			source.start(0);
		} catch (error) {
			if (this.destroyed) {
				return;
			}

			this.markCueFailed(cueId, error);
		}
	}

	getPreferences(): AudioPreferences {
		return { ...this.preferences };
	}

	updatePreferences(patch: Partial<AudioPreferences>): void {
		if (this.destroyed) {
			return;
		}

		const nextPreferences = sanitizeAudioPreferences({ ...this.preferences, ...patch });
		this.preferences = saveAudioPreferences(nextPreferences, this.environment.storage);
		this.onPreferencesChanged?.(this.getPreferences());

		if (!this.preferences.bgmEnabled || this.preferences.bgmVolume <= 0) {
			this.stopCurrentBgm();
			return;
		}

		if (this.currentBgm !== null) {
			this.currentBgm.volume = this.preferences.bgmVolume;
		}

		if (this.unlocked) {
			this.startActiveBgm();
		}
	}

	async destroy(): Promise<void> {
		if (this.destroyed) {
			return;
		}

		this.destroyed = true;
		this.unlocked = false;
		this.stopCurrentBgm();
		this.sfxBuffers.clear();

		const context = this.audioContext;
		this.audioContext = null;

		if (context !== null) {
			try {
				await context.close();
			} catch (error) {
				this.environment.warn('Unable to close audio context', error);
			}
		}
	}

	private startActiveBgm(): void {
		const cueId = this.activeBgmCueId;

		if (
			this.destroyed ||
			cueId === null ||
			!this.preferences.bgmEnabled ||
			this.preferences.bgmVolume <= 0 ||
			this.failedCueIds.has(cueId)
		) {
			return;
		}

		if (this.currentBgmCueId === cueId && this.currentBgm !== null) {
			this.currentBgm.volume = this.preferences.bgmVolume;
			return;
		}

		const cue = getAudioCue(cueId);
		this.stopCurrentBgm();

		try {
			const audio = this.environment.createAudioElement(
				this.environment.resolveAssetPath(cue.path)
			);
			audio.loop = cue.loop;
			audio.volume = this.preferences.bgmVolume;
			audio.currentTime = 0;

			this.currentBgm = audio;
			this.currentBgmCueId = cueId;

			Promise.resolve(audio.play()).catch((error: unknown) => {
				if (this.currentBgm === audio) {
					this.environment.warn('Audio cue failed', cueId, error);
					this.stopCurrentBgm();
				}
			});
		} catch (error) {
			this.markCueFailed(cueId, error);
			this.stopCurrentBgm();
		}
	}

	private stopCurrentBgm(): void {
		const audio = this.currentBgm;
		this.currentBgm = null;
		this.currentBgmCueId = null;

		if (audio === null) {
			return;
		}

		try {
			audio.pause();
			audio.currentTime = 0;
		} catch (error) {
			this.environment.warn('Unable to stop BGM', error);
		}
	}

	private getAudioContext(): AudioContextLike | null {
		if (this.audioContext !== null) {
			return this.audioContext;
		}

		try {
			this.audioContext = this.environment.createAudioContext();
			return this.audioContext;
		} catch (error) {
			this.environment.warn('Unable to create audio context', error);
			return null;
		}
	}

	private async ensureAudioContext(): Promise<AudioContextLike | null> {
		const context = this.getAudioContext();

		if (context === null) {
			return null;
		}

		if (this.unlocked && context.state === 'suspended') {
			try {
				await context.resume();
			} catch (error) {
				this.environment.warn('Unable to resume audio context', error);
			}
		}

		return context;
	}

	private canPlaySfx(cueId: SfxCueId): boolean {
		return (
			!this.destroyed &&
			this.unlocked &&
			this.preferences.sfxEnabled &&
			this.preferences.sfxVolume > 0 &&
			!this.failedCueIds.has(cueId)
		);
	}

	private async getSfxBuffer(cueId: SfxCueId, context: AudioContextLike): Promise<AudioBuffer> {
		const cachedBuffer = this.sfxBuffers.get(cueId);

		if (cachedBuffer) {
			return cachedBuffer;
		}

		const cue = getAudioCue(cueId);
		const buffer = await this.environment.fetchArrayBuffer(
			this.environment.resolveAssetPath(cue.path)
		);
		if (this.destroyed) {
			throw new Error('AudioController destroyed during SFX load');
		}

		const decodedBuffer = await context.decodeAudioData(buffer);
		if (this.destroyed) {
			return decodedBuffer;
		}

		this.sfxBuffers.set(cueId, decodedBuffer);

		return decodedBuffer;
	}

	private markCueFailed(cueId: AudioCueId, error: unknown): void {
		this.failedCueIds.add(cueId);
		this.environment.warn('Audio cue failed', cueId, error);
	}
}
