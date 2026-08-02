import { describe, expect, it, vi } from 'vitest';
import type { EventDefinition } from '$lib/game/eventDefinitions';
import { localizeEventSourceTitle } from './gameCopy';
import { createI18n, type I18nBundle } from './index';
import type { SupportedLocale } from './locales';
import type { Translator } from './translate';

const { testEvent } = vi.hoisted(() => {
	const event: EventDefinition = {
		id: 'test-params-event',
		version: 1,
		selection: { kind: 'forced', priority: 1 },
		condition: { kind: 'always' },
		target: { kind: 'company' },
		expiresAfterDays: 2,
		cooldownDays: 1,
		copy: { key: 'events.testParams', params: { storeName: 'TestStore' } },
		options: [
			{
				id: 'pass',
				effects: [{ kind: 'cash-adjust', amount: 0 }],
				modifiers: []
			}
		]
	};
	return { testEvent: event };
});

vi.mock('$lib/game/eventCatalog', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/game/eventCatalog')>();
	const { validateAndNormalizeEventCatalog } = await import('$lib/game/eventDefinitions');
	return {
		...actual,
		PRODUCTION_EVENT_CATALOG: validateAndNormalizeEventCatalog([testEvent])
	};
});

function createTestI18n(locale: SupportedLocale = 'en'): I18nBundle {
	const base = createI18n(locale);
	const t: Translator = (key, params) => {
		if ((key as string) === 'copy.events.testParams.title') {
			return `Event at ${params?.storeName ?? ''}`.trim();
		}
		return base.t(key, params);
	};
	return { ...base, t };
}

describe('localizeEventSourceTitle', () => {
	it('forwards definition.copy.params to the title translation', () => {
		const result = localizeEventSourceTitle('test-params-event', createTestI18n());
		expect(result).toBe('Event at TestStore');
	});

	it('falls back to the raw eventId for unknown events', () => {
		expect(localizeEventSourceTitle('unknown-event', createTestI18n())).toBe('unknown-event');
	});
});
