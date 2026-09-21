import { describe, expect, it } from 'vitest';
import { createLocaleFormatters } from './format';

describe('createLocaleFormatters', () => {
	it('formats USD currency with the requested locale', () => {
		expect.assertions(2);
		expect(createLocaleFormatters('en').currency(12345)).toBe('$12,345');
		expect(createLocaleFormatters('ja').currency(12345)).toContain('$');
	});

	it('formats signed currency with an explicit sign except at zero', () => {
		expect.assertions(9);
		expect(createLocaleFormatters('en').signedCurrency(120)).toBe('+$120');
		expect(createLocaleFormatters('en').signedCurrency(-45)).toBe('-$45');
		expect(createLocaleFormatters('en').signedCurrency(0)).toBe('$0');
		expect(createLocaleFormatters('ja').signedCurrency(120)).toBe('+$120');
		expect(createLocaleFormatters('ja').signedCurrency(-45)).toBe('-$45');
		expect(createLocaleFormatters('ja').signedCurrency(0)).toBe('$0');
		expect(createLocaleFormatters('zh-Hant').signedCurrency(120)).toBe('+$120');
		expect(createLocaleFormatters('zh-Hant').signedCurrency(-45)).toBe('-$45');
		expect(createLocaleFormatters('zh-Hant').signedCurrency(0)).toBe('$0');
	});

	it('formats integers, percents, dates, and lists', () => {
		expect.assertions(5);
		const format = createLocaleFormatters('en');
		expect(format.integer(12345)).toBe('12,345');
		expect(format.decimal(1234.5)).toBe('1,234.5');
		expect(format.percent(0.42)).toBe('42%');
		expect(format.dateTime('2026-07-08T12:30:00.000Z')).toContain('2026');
		expect(format.list(['Retail', 'World'])).toContain('Retail');
	});
});
