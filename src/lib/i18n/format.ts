import type { SupportedLocale } from './locales';

export interface LocaleFormatters {
	currency(value: number): string;
	integer(value: number): string;
	decimal(value: number): string;
	percent(value: number): string;
	dateTime(value: string | number | Date): string;
	list(values: readonly string[]): string;
}

export function createLocaleFormatters(locale: SupportedLocale): LocaleFormatters {
	const currencyFormatter = new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: 'USD',
		currencyDisplay: 'narrowSymbol',
		maximumFractionDigits: 0
	});
	const integerFormatter = new Intl.NumberFormat(locale, {
		maximumFractionDigits: 0
	});
	const decimalFormatter = new Intl.NumberFormat(locale, {
		maximumFractionDigits: 2
	});
	const percentFormatter = new Intl.NumberFormat(locale, {
		style: 'percent',
		maximumFractionDigits: 0
	});
	const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});
	const listFormatter = new Intl.ListFormat(locale, {
		style: 'long',
		type: 'conjunction'
	});

	return {
		currency: (value) => currencyFormatter.format(value),
		integer: (value) => integerFormatter.format(value),
		decimal: (value) => decimalFormatter.format(value),
		percent: (value) => percentFormatter.format(value),
		dateTime: (value) => dateTimeFormatter.format(new Date(value)),
		list: (values) => listFormatter.format([...values])
	};
}
