import { messagesByLocale } from './messages';
import type { LocaleMessages } from './messages';
import type { SupportedLocale } from './locales';

type PrimitiveMessageTree = {
	[key: string]: string | PrimitiveMessageTree;
};

type NestedKeys<T, Prefix extends string = ''> = {
	[K in keyof T & string]: T[K] extends string
		? `${Prefix}${K}`
		: T[K] extends PrimitiveMessageTree
			? NestedKeys<T[K], `${Prefix}${K}.`>
			: never;
}[keyof T & string];

export type TranslationKey = NestedKeys<(typeof messagesByLocale)['en']>;

export type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface CreateTranslatorOptions {
	warn?: (message: string) => void;
	dev?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function getMessage(messages: LocaleMessages, key: string): string | undefined {
	let current: unknown = messages;

	for (const part of key.split('.')) {
		if (!isRecord(current) || !(part in current)) {
			return undefined;
		}

		current = current[part];
	}

	return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
	return template.replace(/\{([^}]+)\}/g, (match, name: string) => {
		const value = params?.[name];
		return value === undefined ? match : String(value);
	});
}

export function createTranslator(
	locale: SupportedLocale,
	options: CreateTranslatorOptions = {}
): Translator {
	const warn = options.warn;
	const dev = options.dev ?? false;
	const localeMessages = messagesByLocale[locale];
	const englishMessages = messagesByLocale.en;
	const warnedKeys = new Set<string>();

	return (key, params) => {
		const localized = getMessage(localeMessages, key);

		if (localized !== undefined) {
			return interpolate(localized, params);
		}

		const fallback = getMessage(englishMessages, key);

		if (fallback !== undefined) {
			if (dev && warn !== undefined && locale !== 'en' && !warnedKeys.has(key)) {
				warnedKeys.add(key);
				warn(`Missing ${locale} translation for ${key}`);
			}

			return interpolate(fallback, params);
		}

		if (dev && warn !== undefined && !warnedKeys.has(key)) {
			warnedKeys.add(key);
			warn(`Missing translation for ${key}`);
		}

		return key;
	};
}
