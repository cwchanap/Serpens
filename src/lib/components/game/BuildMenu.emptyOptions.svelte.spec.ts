import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { RetailBuildMenuOption } from '$lib/game/placementPreview';
import { createI18n } from '$lib/i18n';
import BuildMenu from './BuildMenu.svelte';

// Mock the industry module so no industrial building types exist.
// This forces `visibleIndustryBuildingTypes` to be empty and exercises
// the `{:else}` branch that renders the "no options" message.
vi.mock('$lib/game/industry', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/game/industry')>();
	return {
		...actual,
		INDUSTRIAL_BUILDING_TYPES: {},
		getIndustrialBuildingTypesForProductChain: () => []
	};
});

const retailOptions: RetailBuildMenuOption[] = [
	{
		archetypeId: 'convenience',
		setupCostRange: { min: 1100, max: 1500 },
		projectedDailyRevenueRange: { min: 700, max: 980 },
		validTileCount: 24,
		disabledReason: null,
		financeOffer: null
	}
];

describe('BuildMenu empty industry options', () => {
	it('renders the no-options message when no industrial building types exist', async () => {
		expect.assertions(1);
		render(BuildMenu, {
			activeMapView: 'industry' as const,
			i18n: createI18n('en'),
			retailOptions,
			industryLockedReason: null,
			onChooseRetail: vi.fn(),
			onChooseIndustry: vi.fn(),
			onClose: vi.fn()
		});
		await expect.element(page.getByText(/no industrial buildings available/i)).toBeVisible();
	});
});
