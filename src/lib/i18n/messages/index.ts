import { en } from './en';
import { ja } from './ja';
import { zhHant } from './zh-Hant';

export const messagesByLocale = {
	en,
	'zh-Hant': zhHant,
	ja
} as const;

export type MessagesByLocale = typeof messagesByLocale;
export type LocaleMessages = (typeof messagesByLocale)[keyof typeof messagesByLocale];
