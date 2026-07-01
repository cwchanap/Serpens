import { describe, expect, it, vi } from 'vitest';
import {
	AUDIO_PREFERENCES_STORAGE_KEY,
	DEFAULT_AUDIO_PREFERENCES,
	readAudioPreferences,
	saveAudioPreferences,
	sanitizeAudioPreferences
} from './audioPreferences';

class MemoryStorage implements Storage {
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

describe('audio preferences', () => {
	it('uses safe defaults when storage is unavailable', () => {
		expect.assertions(1);

		expect(readAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES);
	});

	it('persists and reads preferences from storage', () => {
		expect.assertions(2);
		const storage = new MemoryStorage();

		const saved = saveAudioPreferences(
			{ bgmEnabled: false, bgmVolume: 0.25, sfxEnabled: true, sfxVolume: 0.7 },
			storage
		);

		expect(saved).toEqual({
			bgmEnabled: false,
			bgmVolume: 0.25,
			sfxEnabled: true,
			sfxVolume: 0.7
		});
		expect(readAudioPreferences(storage)).toEqual(saved);
	});

	it('falls back for invalid stored json', () => {
		expect.assertions(1);
		const storage = new MemoryStorage();
		storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, '{not-json');

		expect(readAudioPreferences(storage)).toEqual(DEFAULT_AUDIO_PREFERENCES);
	});

	it('sanitizes invalid fields and clamps volumes', () => {
		expect.assertions(1);

		expect(
			sanitizeAudioPreferences({
				bgmEnabled: 'yes',
				bgmVolume: 2,
				sfxEnabled: false,
				sfxVolume: -1
			})
		).toEqual({
			...DEFAULT_AUDIO_PREFERENCES,
			bgmVolume: 1,
			sfxEnabled: false,
			sfxVolume: 0
		});
	});

	it('falls back to defaults when sanitizing a non-record value', () => {
		expect.assertions(1);

		expect(sanitizeAudioPreferences('not-an-object')).toEqual(DEFAULT_AUDIO_PREFERENCES);
	});

	it('falls back to defaults for non-boolean and non-finite volume fields', () => {
		expect.assertions(1);

		expect(
			sanitizeAudioPreferences({
				bgmEnabled: 'true',
				bgmVolume: Number.NaN,
				sfxEnabled: 1,
				sfxVolume: Infinity
			})
		).toEqual(DEFAULT_AUDIO_PREFERENCES);
	});

	it('readAudioPreferences returns defaults when storage.getItem throws', () => {
		expect.assertions(1);
		const storage = new MemoryStorage();
		vi.spyOn(storage, 'getItem').mockImplementation(() => {
			throw new Error('storage unavailable');
		});

		expect(readAudioPreferences(storage)).toEqual(DEFAULT_AUDIO_PREFERENCES);
	});

	it('saveAudioPreferences returns sanitized preferences when storage.setItem throws', () => {
		expect.assertions(2);
		const storage = new MemoryStorage();
		vi.spyOn(storage, 'setItem').mockImplementation(() => {
			throw new Error('storage unavailable');
		});

		const saved = saveAudioPreferences(
			{ bgmEnabled: false, bgmVolume: 0.25, sfxEnabled: true, sfxVolume: 0.7 },
			storage
		);

		expect(saved).toEqual({
			bgmEnabled: false,
			bgmVolume: 0.25,
			sfxEnabled: true,
			sfxVolume: 0.7
		});
		expect(storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)).toBeNull();
	});

	it('saveAudioPreferences returns sanitized preferences when storage is null', () => {
		expect.assertions(1);

		expect(
			saveAudioPreferences(
				{ bgmEnabled: false, bgmVolume: 0.25, sfxEnabled: true, sfxVolume: 0.7 },
				null
			)
		).toEqual({
			bgmEnabled: false,
			bgmVolume: 0.25,
			sfxEnabled: true,
			sfxVolume: 0.7
		});
	});

	it('readAudioPreferences falls back when globalThis.localStorage access throws', () => {
		expect.assertions(1);
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('access denied');
			}
		});

		try {
			expect(readAudioPreferences()).toEqual(DEFAULT_AUDIO_PREFERENCES);
		} finally {
			if (descriptor) {
				Object.defineProperty(globalThis, 'localStorage', descriptor);
			} else {
				delete (globalThis as { localStorage?: unknown }).localStorage;
			}
		}
	});
});
