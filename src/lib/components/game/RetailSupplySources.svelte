<script lang="ts">
	import { tick } from 'svelte';
	import {
		RETAIL_SUPPLY_IMPORTS_ONLY_VALUE,
		type RetailCitySupplyView,
		type RetailSupplySelection,
		type RetailSupplySourceOption
	} from './retailSupplySources';

	interface Props {
		retailCities: readonly RetailCitySupplyView[];
		disabled: boolean;
		focusedRetailCityId?: string | null;
		onChange: (retailCityId: string, supplyCityId: string | null) => void;
	}

	let { retailCities, disabled, focusedRetailCityId = null, onChange }: Props = $props();

	$effect(() => {
		const retailCityId = focusedRetailCityId;
		if (!retailCityId) return;
		const city = retailCities.find((candidate) => candidate.retailCityId === retailCityId);
		if (!city) return;
		let cancelled = false;
		void tick().then(() => {
			if (cancelled) return;
			const select = document.getElementById(city.selectId) as HTMLSelectElement | null;
			select?.scrollIntoView({ block: 'nearest' });
			select?.focus();
		});
		return () => {
			cancelled = true;
		};
	});

	function headingId(city: RetailCitySupplyView): string {
		return `${city.selectId}-heading`;
	}

	function selectValue(selection: RetailSupplySelection): string {
		if (selection === null) return RETAIL_SUPPLY_IMPORTS_ONLY_VALUE;
		return selection;
	}

	function optionText(option: RetailSupplySourceOption): string {
		return [
			option.label,
			[option.inventorySummary, option.overflowSummary].filter(Boolean).join(' ')
		]
			.filter(Boolean)
			.join(' — ');
	}

	function changeSource(city: RetailCitySupplyView, select: HTMLSelectElement): void {
		const value = select.value;
		const nextSelection = value === RETAIL_SUPPLY_IMPORTS_ONLY_VALUE ? null : value;
		if (city.currentSelection === nextSelection) {
			return;
		}

		try {
			onChange(city.retailCityId, nextSelection);
		} finally {
			select.value = selectValue(city.currentSelection);
		}
	}
</script>

{#if retailCities.length > 0}
	<section
		class="panel paper retail-supply-sources"
		aria-labelledby="retail-supply-sources-heading"
	>
		<h2 id="retail-supply-sources-heading">{retailCities[0]!.panelTitle}</h2>

		<div class="city-sources">
			{#each retailCities as city (city.retailCityId)}
				<article aria-labelledby={headingId(city)}>
					<h3 id={headingId(city)}>{city.sectionHeading}</h3>
					<p id={city.descriptionId} class="source-status" role="status">
						{city.controlDescription}
						{city.currentSummary}
					</p>

					<label for={city.selectId}>{city.selectLabel}</label>
					<select
						id={city.selectId}
						aria-describedby={city.descriptionId}
						{disabled}
						value={selectValue(city.currentSelection)}
						onchange={(event) => changeSource(city, event.currentTarget)}
					>
						<option value={RETAIL_SUPPLY_IMPORTS_ONLY_VALUE}>{city.importsOnlyLabel}</option>
						{#each city.sourceOptions as source (source.supplyCityId)}
							<option value={source.supplyCityId}>
								{optionText(source)}
							</option>
						{/each}
					</select>
				</article>
			{/each}
		</div>
	</section>
{/if}

<style>
	.retail-supply-sources {
		display: grid;
		gap: 0.8rem;
		padding: 1.1rem 1.2rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2,
	h3 {
		font-family: var(--font-display);
		font-weight: 400;
		color: var(--ink-700);
	}

	h2 {
		font-size: 1.1rem;
	}

	h3 {
		font-size: 1rem;
	}

	.city-sources {
		display: grid;
		gap: 0.8rem;
	}

	article {
		display: grid;
		gap: 0.45rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.9rem;
	}

	.source-status {
		font-family: var(--font-body);
		font-size: 0.9rem;
		line-height: 1.35;
		color: var(--ink-500);
	}

	label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	select {
		width: 100%;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-100);
		padding: 0.5rem 0.6rem;
		color: var(--ink-700);
		font-family: var(--font-body);
	}

	select:disabled {
		color: var(--ink-500);
		opacity: 1;
	}
</style>
