export interface AudioPreferences {
	bgmEnabled: boolean;
	bgmVolume: number;
	sfxEnabled: boolean;
	sfxVolume: number;
}

export const AUDIO_PREFERENCES_STORAGE_KEY = 'serpens.audioPreferences.v1';

export const DEFAULT_AUDIO_PREFERENCES: Readonly<AudioPreferences> = Object.freeze({
	bgmEnabled: true,
	bgmVolume: 0.45,
	sfxEnabled: true,
	sfxVolume: 0.65
});

function getDefaultAudioPreferencesStorage(): Storage | null {
	try {
		return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function sanitizeVolume(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(1, Math.max(0, value))
		: fallback;
}

export function sanitizeAudioPreferences(value: unknown): AudioPreferences {
	const source = isRecord(value) ? value : {};

	return {
		bgmEnabled: sanitizeBoolean(source.bgmEnabled, DEFAULT_AUDIO_PREFERENCES.bgmEnabled),
		bgmVolume: sanitizeVolume(source.bgmVolume, DEFAULT_AUDIO_PREFERENCES.bgmVolume),
		sfxEnabled: sanitizeBoolean(source.sfxEnabled, DEFAULT_AUDIO_PREFERENCES.sfxEnabled),
		sfxVolume: sanitizeVolume(source.sfxVolume, DEFAULT_AUDIO_PREFERENCES.sfxVolume)
	};
}

export function readAudioPreferences(
	storage: Storage | null = getDefaultAudioPreferencesStorage()
): AudioPreferences {
	if (storage === null) {
		return sanitizeAudioPreferences(DEFAULT_AUDIO_PREFERENCES);
	}

	try {
		const storedPreferences = storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY);

		if (storedPreferences === null) {
			return sanitizeAudioPreferences(DEFAULT_AUDIO_PREFERENCES);
		}

		return sanitizeAudioPreferences(JSON.parse(storedPreferences));
	} catch {
		return sanitizeAudioPreferences(DEFAULT_AUDIO_PREFERENCES);
	}
}

export function saveAudioPreferences(
	preferences: unknown,
	storage: Storage | null = getDefaultAudioPreferencesStorage()
): AudioPreferences {
	const sanitizedPreferences = sanitizeAudioPreferences(preferences);

	if (storage === null) {
		return sanitizedPreferences;
	}

	try {
		storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(sanitizedPreferences));
	} catch {
		// Audio settings are optional local preferences; gameplay must continue if storage fails.
	}

	return sanitizedPreferences;
}
