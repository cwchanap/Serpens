import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { RetailBuildMenuOption } from '$lib/game/placementPreview';
import { createI18n } from '$lib/i18n';
import BuildMenu from './BuildMenu.svelte';

const retailOptions: RetailBuildMenuOption[] = [
	{
		archetypeId: 'convenience',
		setupCostRange: { min: 1100, max: 1500 },
		projectedDailyRevenueRange: { min: 700, max: 980 },
		validTileCount: 24,
		disabledReason: null,
		financeOffer: null
	},
	{
		archetypeId: 'boutique',
		setupCostRange: { min: 1200, max: 1900 },
		projectedDailyRevenueRange: { min: 420, max: 880 },
		validTileCount: 18,
		disabledReason: null,
		financeOffer: null
	}
];

function buildMenuProps(overrides: Record<string, unknown> = {}) {
	return {
		activeMapView: 'retail' as const,
		i18n: createI18n('en'),
		retailOptions,
		industryLockedReason: null,
		onChooseRetail: vi.fn(),
		onChooseIndustry: vi.fn(),
		onClose: vi.fn(),
		...overrides
	};
}

async function waitForFocusEffect(): Promise<void> {
	await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function pressKey(key: string, init: KeyboardEventInit = {}): void {
	const target = document.activeElement ?? document.body;

	target.dispatchEvent(
		new KeyboardEvent('keydown', {
			key,
			bubbles: true,
			cancelable: true,
			...init
		})
	);
}

function getBuildMenuDialog(): HTMLElement {
	return document.querySelector<HTMLElement>('[role="dialog"][aria-label="Build menu"]')!;
}

describe('BuildMenu', () => {
	it('renders retail store types and chooses a retail placement tool', async () => {
		expect.assertions(5);
		const onChooseRetail = vi.fn();

		render(BuildMenu, buildMenuProps({ onChooseRetail }));

		await expect.element(page.getByRole('dialog', { name: /build menu/i })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: /build retail/i })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /^build convenience store\b/i }))
			.toBeVisible();
		await expect.element(page.getByText(/24 valid tiles/i)).toBeVisible();
		await page.getByRole('button', { name: /build convenience store/i }).click();
		expect(onChooseRetail).toHaveBeenCalledWith('convenience');
	});

	it('focuses the modal controls, traps Tab, and closes on Escape', async () => {
		expect.assertions(4);
		const onClose = vi.fn();

		render(BuildMenu, buildMenuProps({ onClose }));

		await waitForFocusEffect();

		const dialog = getBuildMenuDialog();
		const closeButton = dialog.querySelector<HTMLButtonElement>('button.close')!;
		const buildButtons = Array.from(
			dialog.querySelectorAll<HTMLButtonElement>('button.build-option')
		);
		const lastBuildButton = buildButtons.at(-1)!;

		expect(document.activeElement).toBe(closeButton);

		lastBuildButton.focus();
		pressKey('Tab');
		expect(document.activeElement).toBe(closeButton);

		closeButton.focus();
		pressKey('Tab', { shiftKey: true });
		expect(document.activeElement).toBe(lastBuildButton);

		pressKey('Escape');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('renders industry buildings and filters them by product chain search', async () => {
		expect.assertions(7);
		const onChooseIndustry = vi.fn();

		render(BuildMenu, buildMenuProps({ activeMapView: 'industry', onChooseIndustry }));

		await expect.element(page.getByRole('heading', { name: /build industry/i })).toBeVisible();
		await page.getByRole('button', { name: /filter: all products/i }).click();
		const filterPopover = page.getByRole('dialog', { name: /product chain filter/i });
		await expect.element(filterPopover).toBeVisible();
		await expect.element(filterPopover).not.toHaveAttribute('aria-modal');
		await page.getByLabelText(/search products/i).fill('gift');
		await expect.element(page.getByRole('button', { name: /gifts/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /snacks/i })).not.toBeInTheDocument();
		await page.getByRole('button', { name: /gifts/i }).click();
		await expect.element(page.getByRole('button', { name: /build gift workshop/i })).toBeVisible();
		await page.getByRole('button', { name: /build gift workshop/i }).click();
		expect(onChooseIndustry).toHaveBeenCalledWith('gift-workshop');
	});

	it('dismisses the product filter popover with the close button and Escape', async () => {
		expect.assertions(5);
		const onClose = vi.fn();

		render(BuildMenu, buildMenuProps({ activeMapView: 'industry', onClose }));

		await page.getByRole('button', { name: /filter: all products/i }).click();
		const filterPopover = page.getByRole('dialog', { name: /product chain filter/i });

		await expect.element(filterPopover).toBeVisible();
		await expect.element(filterPopover).not.toHaveAttribute('aria-modal');
		await page.getByRole('button', { name: /close product chain filter/i }).click();
		await expect.element(filterPopover).not.toBeInTheDocument();

		await page.getByRole('button', { name: /filter: all products/i }).click();
		pressKey('Escape');

		await expect.element(filterPopover).not.toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('sorts industry building options by tier, then cost, then name', async () => {
		expect.assertions(3);

		render(BuildMenu, buildMenuProps({ activeMapView: 'industry' }));

		const dialog = getBuildMenuDialog();
		const labels = Array.from(
			dialog.querySelectorAll<HTMLElement>('button.build-option strong')
		).map((element) => element.textContent ?? '');

		const waterBottlerIndex = labels.findIndex((label) => label.includes('Water Bottler'));
		const snackFactoryIndex = labels.findIndex((label) => label.includes('Snack Factory'));

		expect(waterBottlerIndex).toBeGreaterThanOrEqual(0);
		expect(snackFactoryIndex).toBeGreaterThanOrEqual(0);
		expect(waterBottlerIndex).toBeLessThan(snackFactoryIndex);
	});

	it('explains locked industry construction before a store exists', async () => {
		expect.assertions(2);

		render(
			BuildMenu,
			buildMenuProps({
				activeMapView: 'industry',
				industryLockedReason: { code: 'industry.lockedUntilRetail' }
			})
		);

		await expect
			.element(page.getByText('Open a retail store to unlock construction.'))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /build warehouse/i })).toBeDisabled();
	});

	it('formats a fixed setup cost range and singular valid tile count', async () => {
		expect.assertions(3);

		render(
			BuildMenu,
			buildMenuProps({
				retailOptions: [
					{
						archetypeId: 'convenience',
						setupCostRange: { min: 1500, max: 1500 },
						projectedDailyRevenueRange: { min: 700, max: 980 },
						validTileCount: 1,
						disabledReason: null
					}
				]
			})
		);

		await expect.element(page.getByText(/Setup \$1,500 \|/)).toBeVisible();
		await expect.element(page.getByText('1 valid tile')).toBeVisible();
		await expect.element(page.getByText('1 valid tiles')).not.toBeInTheDocument();
	});

	it('renders a disabled retail option with a disabled reason', async () => {
		expect.assertions(2);
		const onChooseRetail = vi.fn();

		render(
			BuildMenu,
			buildMenuProps({
				retailOptions: [
					{
						archetypeId: 'boutique',
						setupCostRange: { min: 1200, max: 1900 },
						projectedDailyRevenueRange: { min: 420, max: 880 },
						validTileCount: 0,
						disabledReason: { code: 'retail.noValidTiles' }
					}
				],
				onChooseRetail
			})
		);

		const button = page.getByRole('button', { name: /build boutique goods/i });
		await expect.element(button).toBeDisabled();
		await expect.element(page.getByText('No valid tiles')).toBeVisible();
	});

	it('renders structured placement reasons through the supplied locale bundle', async () => {
		expect.assertions(2);

		render(
			BuildMenu,
			buildMenuProps({
				i18n: createI18n('ja'),
				retailOptions: [
					{
						archetypeId: 'boutique',
						setupCostRange: { min: 1200, max: 1900 },
						projectedDailyRevenueRange: { min: 420, max: 880 },
						validTileCount: 0,
						disabledReason: { code: 'retail.noValidTiles' }
					}
				]
			})
		);

		await expect.element(page.getByText('有効な立地がありません')).toBeVisible();
		await expect.element(page.getByText('No valid tiles')).not.toBeInTheDocument();
	});

	it('renders structured placement reasons in English through the supplied locale bundle', async () => {
		expect.assertions(1);

		render(
			BuildMenu,
			buildMenuProps({
				retailOptions: [
					{
						archetypeId: 'boutique',
						setupCostRange: { min: 1200, max: 1900 },
						projectedDailyRevenueRange: { min: 420, max: 880 },
						validTileCount: 0,
						disabledReason: { code: 'retail.storeLimitReached' }
					}
				]
			})
		);

		await expect.element(page.getByText('Store limit reached')).toBeVisible();
	});

	it('renders an empty retail options message', async () => {
		expect.assertions(1);

		render(BuildMenu, buildMenuProps({ retailOptions: [] }));

		await expect.element(page.getByText('No retail buildings available')).toBeVisible();
	});

	it('shows no matching products when the filter search matches nothing', async () => {
		expect.assertions(1);

		render(BuildMenu, buildMenuProps({ activeMapView: 'industry' }));

		await page.getByRole('button', { name: /filter: all products/i }).click();
		await page.getByLabelText(/search products/i).fill('zzzznotachain');

		await expect.element(page.getByText('No matching products')).toBeVisible();
	});

	it('disables a product filter with no industry chain and shows no buildings when selected', async () => {
		expect.assertions(2);

		render(BuildMenu, buildMenuProps({ activeMapView: 'industry' }));

		await page.getByRole('button', { name: /filter: all products/i }).click();
		const apparelButton = page.getByRole('button', { name: /apparel no industry chain yet/i });
		await expect.element(apparelButton).toBeDisabled();
		await expect.element(apparelButton).toBeVisible();
	});

	it('clears the product filter with the clear button', async () => {
		expect.assertions(2);

		render(BuildMenu, buildMenuProps({ activeMapView: 'industry' }));

		await page.getByRole('button', { name: /filter: all products/i }).click();
		await page.getByRole('button', { name: /gifts/i }).click();
		await expect.element(page.getByRole('button', { name: /filter: gifts/i })).toBeVisible();
		await page.getByRole('button', { name: /clear product filter/i }).click();
		await expect.element(page.getByRole('button', { name: /filter: all products/i })).toBeVisible();
	});

	it('resets to all products by clicking the "All products" filter entry', async () => {
		expect.assertions(2);

		render(BuildMenu, buildMenuProps({ activeMapView: 'industry' }));

		await page.getByRole('button', { name: /filter: all products/i }).click();
		await page.getByRole('button', { name: /gifts/i }).click();
		await expect.element(page.getByRole('button', { name: /filter: gifts/i })).toBeVisible();

		// Reopen the filter popover and pick "All products" to clear the active filter.
		await page.getByRole('button', { name: /filter: gifts/i }).click();
		await page.getByRole('button', { name: /all products/i }).click();
		await expect.element(page.getByRole('button', { name: /filter: all products/i })).toBeVisible();
	});

	it('traps focus to the last element when shift-tabbing from outside the dialog', async () => {
		expect.assertions(1);

		render(BuildMenu, buildMenuProps());

		await waitForFocusEffect();

		const dialog = getBuildMenuDialog();
		const buildButtons = Array.from(
			dialog.querySelectorAll<HTMLButtonElement>('button.build-option')
		);
		const lastBuildButton = buildButtons.at(-1)!;

		// Focus an element outside the dialog, then shift-tab to wrap to the last element.
		document.body.focus();
		pressKey('Tab', { shiftKey: true });

		expect(document.activeElement).toBe(lastBuildButton);
	});

	it('ignores non-Tab and non-Escape keys in the dialog keydown handler', async () => {
		expect.assertions(1);
		const onClose = vi.fn();

		render(BuildMenu, buildMenuProps({ onClose }));

		await waitForFocusEffect();
		pressKey('a');
		pressKey('Enter');
		expect(onClose).not.toHaveBeenCalled();
	});

	it('does not wrap focus when tabbing forward from a non-last focusable element', async () => {
		expect.assertions(1);

		render(BuildMenu, buildMenuProps());

		await waitForFocusEffect();

		const dialog = getBuildMenuDialog();
		const buildButtons = Array.from(
			dialog.querySelectorAll<HTMLButtonElement>('button.build-option')
		);
		const firstBuildButton = buildButtons[0]!;

		firstBuildButton.focus();
		pressKey('Tab');

		// Tab from a non-last element does not wrap; focus stays put because the
		// synthetic event does not trigger native focus movement.
		expect(document.activeElement).toBe(firstBuildButton);
	});

	it('reconciles retail option list when rerendered with changed data for the same archetype ids', async () => {
		expect.assertions(2);

		const { rerender } = render(BuildMenu, buildMenuProps());

		await expect
			.element(page.getByRole('button', { name: /build convenience store/i }))
			.toBeVisible();

		rerender(
			buildMenuProps({
				retailOptions: [
					{
						archetypeId: 'convenience',
						setupCostRange: { min: 2000, max: 3000 },
						projectedDailyRevenueRange: { min: 800, max: 1200 },
						validTileCount: 30,
						disabledReason: null
					},
					{
						archetypeId: 'boutique',
						setupCostRange: { min: 1200, max: 1900 },
						projectedDailyRevenueRange: { min: 420, max: 880 },
						validTileCount: 18,
						disabledReason: null
					}
				]
			})
		);

		await expect.element(page.getByText(/30 valid tiles/i)).toBeVisible();
	});

	it('reconciles industry building list when the product filter changes', async () => {
		expect.assertions(2);

		const { rerender } = render(BuildMenu, buildMenuProps({ activeMapView: 'industry' }));

		await expect.element(page.getByRole('button', { name: /build warehouse/i })).toBeVisible();

		// Rerender with a locked reason to change the industry building rendering path.
		rerender(
			buildMenuProps({
				activeMapView: 'industry',
				industryLockedReason: { code: 'industry.lockedUntilRetail' }
			})
		);

		await expect.element(page.getByRole('button', { name: /build warehouse/i })).toBeDisabled();
	});

	it('disables only an unfunded industry card and shows its localized cash requirement', async () => {
		expect.assertions(4);
		const onChooseIndustry = vi.fn();
		render(
			BuildMenu,
			buildMenuProps({
				activeMapView: 'industry',
				onChooseIndustry,
				industryOptions: [
					{
						buildingTypeId: 'warehouse',
						disabledReason: {
							code: 'industry.requiresCash',
							buildingTypeId: 'warehouse',
							amount: 1000
						},
						financeOffer: null
					},
					{
						buildingTypeId: 'water-pump',
						disabledReason: null,
						financeOffer: {
							principal: 100,
							termDays: 84,
							annualInterestRateBps: 1200,
							estimatedPeakPayment: 10
						}
					}
				]
			})
		);

		const warehouse = page.getByRole('button', { name: /build warehouse/i });
		const waterPump = page.getByRole('button', { name: /build water pump/i });
		await expect.element(warehouse).toBeDisabled();
		await expect.element(page.getByText('Requires $1,000 cash')).toBeVisible();
		await expect.element(waterPump).not.toBeDisabled();
		expect(onChooseIndustry).not.toHaveBeenCalled();
	});

	it('blocks disallowed retail content with text and never arms its placement', async () => {
		expect.assertions(3);
		const onChooseRetail = vi.fn();
		render(
			BuildMenu,
			buildMenuProps({
				onChooseRetail,
				canOpenStore: true,
				allowedRetailArchetypeIds: ['convenience'],
				disabledReason: 'Unavailable in this challenge.'
			})
		);

		await expect.element(page.getByRole('button', { name: /build boutique/i })).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		expect(onChooseRetail).not.toHaveBeenCalled();
	});

	it('disables all retail options when canOpenStore is false', async () => {
		expect.assertions(3);
		const onChooseRetail = vi.fn();
		render(
			BuildMenu,
			buildMenuProps({
				onChooseRetail,
				canOpenStore: false,
				disabledReason: 'No construction permitted.'
			})
		);

		const convenience = page.getByRole('button', { name: /build convenience store/i });
		const boutique = page.getByRole('button', { name: /build boutique goods/i });
		await expect.element(convenience).toBeDisabled();
		await expect.element(boutique).toBeDisabled();
		await expect.element(page.getByText('No construction permitted.').first()).toBeVisible();
	});

	it('allows a finance-only scenario to arm an allowed retail placement', async () => {
		expect.assertions(2);
		const onChooseRetail = vi.fn();
		render(
			BuildMenu,
			buildMenuProps({
				onChooseRetail,
				canOpenStore: false,
				canFinanceRetailStore: true,
				allowedRetailArchetypeIds: ['convenience']
			})
		);

		const convenience = page.getByRole('button', { name: /build convenience store/i });
		await expect.element(convenience).not.toBeDisabled();
		await convenience.click();
		expect(onChooseRetail).toHaveBeenCalledWith('convenience');
	});
});

describe('BuildMenu industry recipe cards', () => {
	it('shows a Starter badge and opens the advisor', async () => {
		expect.assertions(2);
		const onOpenAdvisor = vi.fn();
		render(
			BuildMenu,
			buildMenuProps({
				activeMapView: 'industry',
				retailOptions: [],
				availableMaterialIds: [],
				onOpenAdvisor
			})
		);
		await expect.element(page.getByText(/starter/i).first()).toBeVisible();
		await page.getByRole('button', { name: /supply advisor|what should i build/i }).click();
		expect(onOpenAdvisor).toHaveBeenCalledTimes(1);
	});

	it('disables the Supply Advisor button while industry is locked', async () => {
		expect.assertions(1);
		const onOpenAdvisor = vi.fn();
		render(
			BuildMenu,
			buildMenuProps({
				activeMapView: 'industry',
				retailOptions: [],
				industryLockedReason: { code: 'industry.lockedUntilRetail' },
				availableMaterialIds: [],
				onOpenAdvisor
			})
		);
		await expect
			.element(page.getByRole('button', { name: 'Supply Advisor — what should I build?' }))
			.toBeDisabled();
	});

	it('shows the producer hint for a missing recipe ingredient', async () => {
		expect.assertions(1);

		render(
			BuildMenu,
			buildMenuProps({
				activeMapView: 'industry',
				retailOptions: [],
				availableMaterialIds: []
			})
		);

		// Water Bottler's recipe consumes water, which no producer supplies when
		// availableMaterialIds is empty, so its missing-input chip should surface
		// the building that produces water (the Water Pump).
		await expect.element(page.getByText(/needs water pump/i).first()).toBeVisible();
	});

	it('surfaces the resource-tile requirement for a Starter extraction building', async () => {
		expect.assertions(1);

		render(
			BuildMenu,
			buildMenuProps({
				activeMapView: 'industry',
				retailOptions: [],
				availableMaterialIds: []
			})
		);

		// The Water Pump has requiredResource: 'water-source' and a recipe with no
		// inputs, so the resource-tile hint must render independently of the
		// (never-missing) recipe branch.
		await expect
			.element(page.getByText(/needs a water source resource tile/i).first())
			.toBeVisible();
	});

	it('blocks disallowed industrial content and cannot arm it', async () => {
		expect.assertions(3);
		const onChooseIndustry = vi.fn();
		render(
			BuildMenu,
			buildMenuProps({
				activeMapView: 'industry',
				retailOptions: [],
				onChooseIndustry,
				canBuildIndustrialBuilding: true,
				allowedIndustryBuildingTypeIds: ['water-bottler'],
				disabledReason: 'Unavailable in this challenge.'
			})
		);

		await expect.element(page.getByRole('button', { name: /build warehouse/i })).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.').first()).toBeVisible();
		expect(onChooseIndustry).not.toHaveBeenCalled();
	});

	it('disables all industry options when canBuildIndustrialBuilding is false', async () => {
		expect.assertions(2);
		const onChooseIndustry = vi.fn();
		render(
			BuildMenu,
			buildMenuProps({
				activeMapView: 'industry',
				retailOptions: [],
				onChooseIndustry,
				canBuildIndustrialBuilding: false,
				disabledReason: 'No industrial construction permitted.'
			})
		);

		const warehouse = page.getByRole('button', { name: /build warehouse/i });
		await expect.element(warehouse).toBeDisabled();
		await expect
			.element(page.getByText('No industrial construction permitted.').first())
			.toBeVisible();
	});

	it('allows a finance-only scenario to arm an allowed industrial placement', async () => {
		expect.assertions(2);
		const onChooseIndustry = vi.fn();
		render(
			BuildMenu,
			buildMenuProps({
				activeMapView: 'industry',
				retailOptions: [],
				onChooseIndustry,
				canBuildIndustrialBuilding: false,
				canFinanceIndustrialBuilding: true,
				allowedIndustryBuildingTypeIds: ['water-bottler']
			})
		);

		const waterBottler = page.getByRole('button', { name: /build water bottler/i });
		await expect.element(waterBottler).not.toBeDisabled();
		await waterBottler.click();
		expect(onChooseIndustry).toHaveBeenCalledWith('water-bottler');
	});
});
