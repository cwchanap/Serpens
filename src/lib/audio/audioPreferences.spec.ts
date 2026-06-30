import { describe, expect, it } from 'vitest';
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
});
