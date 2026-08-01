import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ActiveEventModifier } from '$lib/game/types';
import { createI18n } from '$lib/i18n';
import ActiveModifiers from './ActiveModifiers.svelte';

function modifier(overrides: Partial<ActiveEventModifier> = {}): ActiveEventModifier {
	return {
		id: 'event-modifier-1',
		source: {
			eventId: 'supplier-terms',
			instanceId: 'event-instance-1',
			optionId: 'bulk-discount'
		},
		target: { kind: 'company' },
		startsOnDay: 5,
		expiresOnDay: 8,
		stackingKey: 'supplier-bulk-discount:retail-product',
		stackingRule: 'replace',
		effect: {
			kind: 'import-cost-multiplier',
			scope: 'retail-product',
			target: { kind: 'all' },
			multiplier: 0.9
		},
		explanation: { key: 'events.supplierTerms.bulkDiscount.modifier', params: {} },
		importance: 'important',
		...overrides
	};
}

describe('ActiveModifiers', () => {
	it('renders an accessible localized card with exclusive expiry and current-day-inclusive remaining days', async () => {
		expect.assertions(9);
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 5,
			modifiers: [modifier()]
		});

		const region = page.getByRole('region', { name: 'Active modifiers' });
		const article = region.getByRole('article', { name: 'Supplier terms' });
		await expect.element(article).toBeVisible();
		await expect
			.element(article.getByText('Company-wide retail imports', { exact: true }))
			.toBeVisible();
		await expect
			.element(article.getByText('10% retail import discount', { exact: true }))
			.toBeVisible();
		await expect.element(article.getByText('Starts day 5', { exact: true })).toBeVisible();
		await expect.element(article.getByText('Expires after day 7', { exact: true })).toBeVisible();
		await expect.element(article.getByText('3 days remaining', { exact: true })).toBeVisible();
		await expect.element(article.getByText('Important')).toBeVisible();
		await expect.element(article.getByText('Expires after day 8')).not.toBeInTheDocument();
		await expect.element(article.getByText(/three days/i)).toBeVisible();
	});

	it('sorts modifiers by exclusive expiry then locale-independent ID order', () => {
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 5,
			modifiers: [
				modifier({
					id: 'event-modifier-b',
					source: { ...modifier().source, eventId: 'event-b' }
				}),
				modifier({
					id: 'event-modifier-z',
					expiresOnDay: 7,
					source: { ...modifier().source, eventId: 'event-z' }
				}),
				modifier({
					id: 'event-modifier-a',
					source: { ...modifier().source, eventId: 'event-a' }
				})
			]
		});

		expect(
			Array.from(document.querySelectorAll('article h3'), (heading) => heading.textContent)
		).toEqual(['event-z', 'event-a', 'event-b']);
	});

	it('shows a localized empty state', async () => {
		expect.assertions(2);
		render(ActiveModifiers, { i18n: createI18n('ja'), day: 5, modifiers: [] });

		const region = page.getByRole('region', { name: '有効な修正効果' });
		await expect.element(region.getByText('有効な修正効果はありません。')).toBeVisible();
		await expect.element(region.getByText('No active modifiers.')).not.toBeInTheDocument();
	});

	it('uses the singular remaining-days copy when exactly one day remains', async () => {
		expect.assertions(1);
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 7,
			modifiers: [modifier({ expiresOnDay: 8 })]
		});

		const region = page.getByRole('region', { name: 'Active modifiers' });
		await expect.element(region.getByText('1 day remaining', { exact: true })).toBeVisible();
	});
});
