import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RetailSupplySources from './RetailSupplySources.svelte';
import {
	RETAIL_SUPPLY_IMPORTS_ONLY_VALUE,
	RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE
} from './retailSupplySources';
import type { RetailCitySupplyView } from './retailSupplySources';

const availableSources = [
	{
		supplyCityId: 'industry-city',
		label: 'Industry City',
		available: true,
		disabled: false,
		inventorySummary: '9 / 10 city inventory used.',
		overflowSummary: 'No overflow.'
	},
	{
		supplyCityId: 'breadbasket-basin',
		label: 'Breadbasket Basin',
		available: true,
		disabled: false,
		inventorySummary: '3 / 40 city inventory used.',
		overflowSummary: 'Overflow: 1 unit ($2).'
	}
] as const;

function cityView(overrides: Partial<RetailCitySupplyView> = {}): RetailCitySupplyView {
	const view: RetailCitySupplyView = {
		panelTitle: 'Retail supply sources',
		retailCityId: 'harbor-city',
		sectionHeading: 'Harbor City supply source',
		selectId: 'retail-supply-source-harbor-city',
		selectLabel: 'Local supply source for Harbor City',
		descriptionId: 'retail-supply-source-harbor-city-description',
		controlDescription: 'Choose how Harbor City receives local supply.',
		currentSelection: 'breadbasket-basin',
		currentSummary: 'Breadbasket Basin supplies Harbor City.',
		importsOnlyLabel: 'Imports only',
		missingConfigurationLabel: 'Supply configuration unavailable.',
		sourceOptions: availableSources.map((source) => ({ ...source }))
	};

	return Object.assign(view, overrides);
}

function renderSources(
	overrides: Partial<{
		retailCities: readonly RetailCitySupplyView[];
		disabled: boolean;
		onChange: (retailCityId: string, supplyCityId: string | null) => void;
	}> = {}
) {
	const props = {
		retailCities: [cityView()],
		disabled: false,
		onChange: vi.fn(),
		...overrides
	};

	render(RetailSupplySources, props);
	return props;
}

describe('RetailSupplySources', () => {
	it('renders stable section names, descriptions, and source options', async () => {
		expect.assertions(7);
		renderSources();

		const region = page.getByRole('region', { name: 'Retail supply sources' });
		const select = page.getByLabelText('Local supply source for Harbor City');
		const options = Array.from(select.element().querySelectorAll('option'));

		await expect
			.element(region.getByRole('heading', { name: 'Harbor City supply source' }))
			.toBeVisible();
		await expect
			.element(select)
			.toHaveAttribute('aria-describedby', 'retail-supply-source-harbor-city-description');
		await expect.element(select).toHaveValue('breadbasket-basin');
		await expect.element(region.getByText('Breadbasket Basin supplies Harbor City.')).toBeVisible();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(
				'Choose how Harbor City receives local supply. Breadbasket Basin supplies Harbor City.'
			);
		expect(options.map((option) => option.value)).toEqual([
			RETAIL_SUPPLY_IMPORTS_ONLY_VALUE,
			'industry-city',
			'breadbasket-basin'
		]);
		expect(options.map((option) => option.textContent)).toEqual([
			'Imports only',
			'Industry City — 9 / 10 city inventory used. No overflow.',
			'Breadbasket Basin — 3 / 40 city inventory used. Overflow: 1 unit ($2).'
		]);
	});

	it('keeps stale and missing selections visible but unavailable', async () => {
		expect.assertions(7);
		renderSources({
			retailCities: [
				cityView({
					currentSelection: 'quarry-works',
					currentSummary: 'Quarry Works is unavailable.',
					sourceOptions: [
						...availableSources.map((source) => ({ ...source })),
						{
							supplyCityId: 'quarry-works',
							label: 'Quarry Works',
							available: false,
							disabled: true,
							inventorySummary: 'Quarry Works is unavailable.',
							overflowSummary: ''
						}
					]
				}),
				cityView({
					retailCityId: 'campus-junction',
					sectionHeading: 'Campus Junction supply source',
					selectId: 'retail-supply-source-campus-junction',
					selectLabel: 'Local supply source for Campus Junction',
					descriptionId: 'retail-supply-source-campus-junction-description',
					currentSelection: 'missing',
					currentSummary: 'Supply configuration unavailable.'
				})
			]
		});

		const staleSelect = page.getByLabelText('Local supply source for Harbor City');
		const missingSelect = page.getByLabelText('Local supply source for Campus Junction');
		const staleOption = Array.from(staleSelect.element().querySelectorAll('option')).find(
			(option) => option.value === 'quarry-works'
		);
		const missingOption = Array.from(missingSelect.element().querySelectorAll('option')).find(
			(option) => option.value === RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE
		);

		await expect.element(staleSelect).toHaveValue('quarry-works');
		await expect.element(missingSelect).toHaveValue(RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE);
		expect(staleOption?.disabled).toBe(true);
		expect(staleOption?.textContent).toBe('Quarry Works — Quarry Works is unavailable.');
		expect(missingOption?.disabled).toBe(true);
		expect(missingOption?.textContent).toBe('Supply configuration unavailable.');
		await expect
			.element(page.getByRole('status').first())
			.toHaveTextContent('Quarry Works is unavailable.');
	});

	it('disables every select without hiding its current selection', async () => {
		expect.assertions(3);
		renderSources({
			disabled: true,
			retailCities: [
				cityView(),
				cityView({
					retailCityId: 'campus-junction',
					sectionHeading: 'Campus Junction supply source',
					selectId: 'retail-supply-source-campus-junction',
					selectLabel: 'Local supply source for Campus Junction',
					descriptionId: 'retail-supply-source-campus-junction-description'
				})
			]
		});

		const harbor = page.getByLabelText('Local supply source for Harbor City');
		const campus = page.getByLabelText('Local supply source for Campus Junction');
		await expect.element(harbor).toBeDisabled();
		await expect.element(campus).toBeDisabled();
		await expect.element(harbor).toHaveValue('breadbasket-basin');
	});

	it('suppresses unchanged selections and sends changed source and Imports-only selections once', async () => {
		expect.assertions(4);
		const onChange = vi.fn();
		renderSources({ onChange });
		const select = page.getByLabelText('Local supply source for Harbor City');

		await select.selectOptions('breadbasket-basin');
		expect(onChange).not.toHaveBeenCalled();

		await select.selectOptions('industry-city');
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenLastCalledWith('harbor-city', 'industry-city');

		await select.selectOptions(RETAIL_SUPPLY_IMPORTS_ONLY_VALUE);
		expect(onChange).toHaveBeenLastCalledWith('harbor-city', null);
	});

	it('allows a missing assignment to recover by choosing an available source', async () => {
		expect.assertions(1);
		const onChange = vi.fn();
		renderSources({ onChange, retailCities: [cityView({ currentSelection: 'missing' })] });

		await page.getByLabelText('Local supply source for Harbor City').selectOptions('industry-city');

		expect(onChange).toHaveBeenCalledWith('harbor-city', 'industry-city');
	});

	it('suppresses selecting the already configured Imports-only mode', async () => {
		expect.assertions(1);
		const onChange = vi.fn();
		renderSources({
			onChange,
			retailCities: [
				cityView({
					currentSelection: null,
					currentSummary: 'Imports only. All replenishment is covered by external imports.'
				})
			]
		});

		await page
			.getByLabelText('Local supply source for Harbor City')
			.selectOptions(RETAIL_SUPPLY_IMPORTS_ONLY_VALUE);

		expect(onChange).not.toHaveBeenCalled();
	});
});
