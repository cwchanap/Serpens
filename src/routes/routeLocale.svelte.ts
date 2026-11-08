import {
	createI18n,
	readLocalePreference,
	saveLocalePreference,
	type StorageLike
} from '$lib/i18n';
import type { SupportedLocale } from '$lib/i18n/locales';

/**
 * Returns `globalThis.localStorage` when accessible, or `null` when the
 * browser blocks storage access (e.g. privacy-restricted origins, sandboxed
 * iframes). Accessing the property itself can throw, so the try/catch must
 * wrap the property access — not just the `getItem`/`setItem` calls that
 * `readLocalePreference` / `saveLocalePreference` already guard internally.
 */
function safeLocalStorage(): StorageLike | null {
	try {
		return globalThis.localStorage;
	} catch {
		return null;
	}
}

/**
 * Returns `navigator.languages` with `navigator.language` appended as a
 * fallback candidate. Some webviews expose only `navigator.language` or an
 * empty `navigator.languages` array; without this fallback a `ja-JP` or
 * `zh-TW` user would start in English despite the browser preference.
 */
function collectNavigatorLocaleCandidates(): readonly string[] {
	const languages = globalThis.navigator.languages ?? [];
	const language = globalThis.navigator.language;

	if (language && !languages.includes(language)) {
		return [...languages, language];
	}

	return languages;
}

/**
 * Route locale owner: the active locale, its live i18n bundle and the
 * document language effect. Initialization reads the guarded storage
 * preference first and then the navigator candidates (with the
 * `navigator.language` fallback); changing the locale persists the
 * preference when storage allows and touches no other route state.
 */
export function createRouteLocale() {
	let activeLocale = $state<SupportedLocale>(
		readLocalePreference(safeLocalStorage(), collectNavigatorLocaleCandidates())
	);
	const i18n = $derived(createI18n(activeLocale));

	$effect(() => {
		document.documentElement.lang = activeLocale;
	});

	function change(locale: SupportedLocale): void {
		activeLocale = saveLocalePreference(locale, safeLocalStorage());
	}

	return {
		get locale() {
			return activeLocale;
		},
		get i18n() {
			return i18n;
		},
		change
	};
}
