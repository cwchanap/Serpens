import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RetailSupplySources from './RetailSupplySources.svelte';
import { RETAIL_SUPPLY_IMPORTS_ONLY_VALUE } from './retailSupplySources';
import type { RetailCitySupplyView } from './retailSupplySources';

const availableSources = [
	{
		supplyCityId: 'industry-city',
		label: 'Industry City',
		inventorySummary: '9 / 10 city inventory used.',
		overflowSummary: 'No overflow.'
	},
	{
		supplyCityId: 'breadbasket-basin',
		label: 'Breadbasket Basin',
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

	it('reconciles an uncommitted changed source to the prop-derived selection', async () => {
		expect.assertions(3);
		const onChange = vi.fn();
		renderSources({ onChange });
		const select = page.getByLabelText('Local supply source for Harbor City');

		await select.selectOptions('industry-city');

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenLastCalledWith('harbor-city', 'industry-city');
		await expect.element(select).toHaveValue('breadbasket-basin');
	});

	it('reconciles an uncommitted Imports-only choice back to its prop-derived source', async () => {
		expect.assertions(3);
		const onChange = vi.fn();
		renderSources({ onChange });
		const select = page.getByLabelText('Local supply source for Harbor City');

		await select.selectOptions(RETAIL_SUPPLY_IMPORTS_ONLY_VALUE);

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenLastCalledWith('harbor-city', null);
		await expect.element(select).toHaveValue('breadbasket-basin');
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

	it('renders nothing when there are no retail cities', async () => {
		expect.assertions(1);
		renderSources({ retailCities: [] });

		await expect
			.element(page.getByRole('region', { name: 'Retail supply sources' }))
			.not.toBeInTheDocument();
	});

	it('renders source options with empty inventory and overflow summaries', async () => {
		expect.assertions(2);
		renderSources({
			retailCities: [
				cityView({
					currentSelection: 'industry-city',
					currentSummary: '',
					sourceOptions: [
						{
							supplyCityId: 'industry-city',
							label: 'Empty Source',
							inventorySummary: '',
							overflowSummary: ''
						}
					]
				})
			]
		});

		const select = page.getByLabelText('Local supply source for Harbor City');
		const options = Array.from(select.element().querySelectorAll('option'));
		const emptyOption = options.find((o) => o.value === 'industry-city');
		expect(emptyOption?.textContent).toBe('Empty Source');
		expect(emptyOption?.disabled).toBe(false);
	});
});
