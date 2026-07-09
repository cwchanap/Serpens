export {
	LANGUAGE_PREFERENCE_STORAGE_KEY,
	readLocalePreference,
	resolveSupportedLocale,
	saveLocalePreference,
	type StorageLike,
	type SupportedLocale
} from './locales';
export { messagesByLocale, type LocaleMessages, type MessagesByLocale } from './messages';
export {
	createTranslator,
	type CreateTranslatorOptions,
	type TranslationKey,
	type Translator
} from './translate';
export { createLocaleFormatters, type LocaleFormatters } from './format';

import { messagesByLocale } from './messages';
import { createLocaleFormatters } from './format';
import { createTranslator } from './translate';
import type { LocaleMessages } from './messages';
import type { SupportedLocale } from './locales';

export interface I18nBundle {
	locale: SupportedLocale;
	messages: LocaleMessages;
	t: ReturnType<typeof createTranslator>;
	formatters: ReturnType<typeof createLocaleFormatters>;
	format: ReturnType<typeof createLocaleFormatters>;
}

export function createI18n(locale: SupportedLocale): I18nBundle {
	const t = createTranslator(locale);
	const formatters = createLocaleFormatters(locale);

	return {
		locale,
		messages: messagesByLocale[locale],
		t,
		formatters,
		format: formatters
	};
}
