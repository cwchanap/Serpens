export type SupportedLocale = 'en' | 'zh-Hant' | 'ja';

export const LANGUAGE_PREFERENCE_STORAGE_KEY = 'serpens.languagePreference.v1';

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

function isSupportedLocale(value: unknown): value is SupportedLocale {
	return value === 'en' || value === 'zh-Hant' || value === 'ja';
}

function normalizeLocaleCandidate(candidate: string): string {
	return candidate.toLowerCase();
}

function resolveLocaleCandidate(candidate: string): SupportedLocale | null {
	const normalized = normalizeLocaleCandidate(candidate);

	if (
		normalized === 'zh-hant' ||
		normalized === 'zh-tw' ||
		normalized === 'zh-hk' ||
		normalized === 'zh-mo'
	) {
		return 'zh-Hant';
	}

	if (normalized === 'ja' || normalized.startsWith('ja-')) {
		return 'ja';
	}

	if (normalized === 'en' || normalized.startsWith('en-')) {
		return 'en';
	}

	return null;
}

function readStoredLocale(storage: StorageLike | null): unknown {
	if (storage === null) {
		return undefined;
	}

	try {
		return storage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
	} catch {
		return undefined;
	}
}

function readNavigatorLocale(navigatorLanguages: readonly string[] | undefined): SupportedLocale {
	for (const language of navigatorLanguages ?? []) {
		const resolved = resolveLocaleCandidate(language);

		if (resolved !== null) {
			return resolved;
		}
	}

	return 'en';
}

export function resolveSupportedLocale(input?: {
	storedLocale?: unknown;
	navigatorLanguages?: readonly string[];
}): SupportedLocale {
	const storedLocale = input?.storedLocale;

	if (typeof storedLocale === 'string') {
		const resolvedStoredLocale = resolveLocaleCandidate(storedLocale);

		if (resolvedStoredLocale !== null) {
			return resolvedStoredLocale;
		}
	}

	return readNavigatorLocale(input?.navigatorLanguages);
}

export function readLocalePreference(
	storage: StorageLike | null = null,
	navigatorLanguages: readonly string[] = []
): SupportedLocale {
	const storedLocale = readStoredLocale(storage);

	return resolveSupportedLocale({ storedLocale, navigatorLanguages });
}

export function saveLocalePreference(
	locale: SupportedLocale,
	storage: StorageLike | null = null
): SupportedLocale {
	if (storage !== null) {
		try {
			storage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, locale);
		} catch {
			// Locale preference is optional; gameplay must continue if storage fails.
		}
	}

	return locale;
}

export function isSupportedLocaleValue(value: unknown): value is SupportedLocale {
	return isSupportedLocale(value);
}
