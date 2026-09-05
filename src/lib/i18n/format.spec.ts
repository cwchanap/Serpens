import { describe, expect, it } from 'vitest';
import { createLocaleFormatters } from './format';

describe('createLocaleFormatters', () => {
	it('formats USD currency with the requested locale', () => {
		expect.assertions(2);
		expect(createLocaleFormatters('en').currency(12345)).toBe('$12,345');
		expect(createLocaleFormatters('ja').currency(12345)).toContain('$');
	});

	it('formats integers, percents, dates, and lists', () => {
		expect.assertions(6);
		const format = createLocaleFormatters('en');
		expect(format.integer(12345)).toBe('12,345');
		expect(format.decimal(1234.5)).toBe('1,234.5');
		expect(format.percent(0.42)).toBe('42%');
		expect(format.percent1(0.062)).toBe('6.2%');
		expect(format.dateTime('2026-07-08T12:30:00.000Z')).toContain('2026');
		expect(format.list(['Retail', 'World'])).toContain('Retail');
	});
});
