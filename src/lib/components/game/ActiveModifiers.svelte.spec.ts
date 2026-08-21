import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ActiveEventModifier, MarketCompetitor, RecurringRoute } from '$lib/game/types';
import { createI18n } from '$lib/i18n';
import ActiveModifiers from './ActiveModifiers.svelte';

const route: RecurringRoute = {
	id: 'route-1',
	originCityId: 'industry-city',
	destinationCityId: 'breadbasket-basin',
	materialId: 'water',
	capacity: 30,
	frequencyDays: 3,
	leadTimeDays: 2,
	transportCostPerUnit: 2,
	priority: 1,
	state: 'active',
	nextDispatchOnDay: 11
};

const competitor: MarketCompetitor = {
	id: 'competitor-harbor-city-1',
	name: 'Harborline Market',
	cityId: 'harbor-city',
	location: { neighborhoodId: 'downtown', x: 1, y: 1 },
	archetypeId: 'boutique',
	reputation: 60,
	pricePosture: 'competitive',
	productFocus: ['fashion'],
	brandIds: ['common-ground'],
	status: 'active'
};

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

function routeModifier(
	effect: ActiveEventModifier['effect'],
	overrides: Partial<ActiveEventModifier> = {}
): ActiveEventModifier {
	return modifier({
		id: `event-modifier-${effect.kind}`,
		target: { kind: 'recurring-route', routeId: route.id },
		stackingKey: `${effect.kind}:${route.id}`,
		effect,
		explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} },
		...overrides
	});
}

describe('ActiveModifiers', () => {
	it('renders an accessible localized card with exclusive expiry and current-day-inclusive remaining days', async () => {
		expect.assertions(9);
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 5,
			modifiers: [modifier()],
			routes: []
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

	it('shows a localized competitor target, structured explanation, and attraction multiplier', async () => {
		expect.assertions(5);
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 5,
			modifiers: [
				modifier({
					source: {
						eventId: 'rival-promotion',
						instanceId: 'event-instance-2',
						optionId: 'counter-promote'
					},
					target: { kind: 'competitor', competitorId: competitor.id },
					stackingKey: 'rival-promotion:market-attraction',
					effect: { kind: 'competitor-attraction-multiplier', multiplier: 1.18 },
					explanation: { key: 'events.rivalPromotion.modifier', params: {} }
				})
			],
			routes: [],
			competitors: [competitor]
		});

		const region = page.getByRole('region', { name: 'Active modifiers' });
		const article = region.getByRole('article', { name: 'Rival promotion' });
		await expect.element(article).toBeVisible();
		await expect
			.element(article.getByText('Rival: Harborline Market', { exact: true }))
			.toBeVisible();
		await expect
			.element(
				article.getByText('Harborline Market gains 18% attraction for three days.', { exact: true })
			)
			.toBeVisible();
		await expect.element(article.getByText('Attraction ×1.18', { exact: true })).toBeVisible();
		await expect.element(article.getByText('Company-wide retail imports')).not.toBeInTheDocument();
	});

	it('shows all four route effects with route, material, base → effective value, and remaining duration', async () => {
		expect.assertions(9);
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 5,
			modifiers: [
				routeModifier({ kind: 'route-capacity-multiplier', multiplier: 0.75 }),
				routeModifier({ kind: 'route-lead-time-adjustment', days: 1 }),
				routeModifier({ kind: 'route-transport-cost-multiplier', multiplier: 1.5 }),
				routeModifier({ kind: 'route-dispatch-suspension' })
			],
			routes: [route]
		});

		const region = page.getByRole('region', { name: 'Active modifiers' });
		await expect
			.element(
				region
					.getByText('Route: Industry City → Breadbasket Basin · Water', { exact: true })
					.first()
			)
			.toBeVisible();
		await expect
			.element(region.getByText('Capacity: 30 → 22 units', { exact: true }))
			.toBeVisible();
		await expect.element(region.getByText('Lead time: 2 → 3 days', { exact: true })).toBeVisible();
		await expect
			.element(region.getByText('Transport cost per unit: $2 → $3', { exact: true }))
			.toBeVisible();
		await expect.element(region.getByText('Dispatch suspended', { exact: true })).toBeVisible();
		await expect
			.element(region.getByText('3 days remaining', { exact: true }).first())
			.toBeVisible();
		// Source titles still attribute every route card.
		expect(await region.getByRole('article', { name: 'Supplier terms' }).all()).toHaveLength(4);
		// Company copy stays off route cards.
		await expect.element(region.getByText('Company-wide retail imports')).not.toBeInTheDocument();
		await expect.element(region.getByText('% retail import discount')).not.toBeInTheDocument();
	});

	it('falls back to the raw route id when the modifier target no longer exists', async () => {
		expect.assertions(2);
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 5,
			modifiers: [routeModifier({ kind: 'route-capacity-multiplier', multiplier: 0.5 })],
			routes: []
		});

		const region = page.getByRole('region', { name: 'Active modifiers' });
		await expect
			.element(region.getByText('Route: route-1 (removed)', { exact: true }))
			.toBeVisible();
		await expect.element(region.getByText('Capacity: 30 → 15 units')).not.toBeInTheDocument();
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
			],
			routes: []
		});

		expect(
			Array.from(document.querySelectorAll('article h3'), (heading) => heading.textContent)
		).toEqual(['event-z', 'event-a', 'event-b']);
	});

	it('shows a localized empty state', async () => {
		expect.assertions(2);
		render(ActiveModifiers, { i18n: createI18n('ja'), day: 5, modifiers: [], routes: [] });

		const region = page.getByRole('region', { name: '有効な修正効果' });
		await expect.element(region.getByText('有効な修正効果はありません。')).toBeVisible();
		await expect.element(region.getByText('No active modifiers.')).not.toBeInTheDocument();
	});

	it('uses the singular remaining-days copy when exactly one day remains', async () => {
		expect.assertions(1);
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 7,
			modifiers: [modifier({ expiresOnDay: 8 })],
			routes: []
		});

		const region = page.getByRole('region', { name: 'Active modifiers' });
		await expect.element(region.getByText('1 day remaining', { exact: true })).toBeVisible();
	});

	it('omits the urgent seal for normal-importance modifiers', async () => {
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 5,
			modifiers: [modifier({ importance: 'normal' })],
			routes: []
		});

		const region = page.getByRole('region', { name: 'Active modifiers' });
		await expect.element(region.getByText('Important')).not.toBeInTheDocument();
	});

	it('clamps remaining days to zero when the current day exceeds expiry', async () => {
		render(ActiveModifiers, {
			i18n: createI18n('en'),
			day: 10,
			modifiers: [modifier({ expiresOnDay: 8 })],
			routes: []
		});

		const region = page.getByRole('region', { name: 'Active modifiers' });
		await expect.element(region.getByText('0 days remaining', { exact: true })).toBeVisible();
	});
});
