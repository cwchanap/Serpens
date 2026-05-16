<script lang="ts">
	import { asset } from '$app/paths';
	import { getIndustrialBuildingArt, getStoreArt } from '$lib/assets/gameArt';
	import { ARCHETYPES, getArchetype } from '$lib/game/archetypes';
	import {
		INDUSTRIAL_BUILDING_TYPES,
		getIndustrialBuildingTypesForProductChain
	} from '$lib/game/industry';
	import type { RetailBuildMenuOption } from '$lib/game/placementPreview';
	import type { ArchetypeId, IndustrialBuildingTypeId } from '$lib/game/types';
	import type { Attachment } from 'svelte/attachments';

	interface ProductChainFilter {
		id: string;
		name: string;
		buildingCount: number;
	}

	interface Props {
		activeMapView: 'retail' | 'industry';
		retailOptions: RetailBuildMenuOption[];
		industryLockedReason: string | null;
		onChooseRetail: (archetypeId: ArchetypeId) => void;
		onChooseIndustry: (buildingTypeId: IndustrialBuildingTypeId) => void;
		onClose: () => void;
	}

	let {
		activeMapView,
		retailOptions,
		industryLockedReason,
		onChooseRetail,
		onChooseIndustry,
		onClose
	}: Props = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});
	const focusableSelector = [
		'button:not([disabled]):not([tabindex="-1"])',
		'input:not([disabled]):not([tabindex="-1"])',
		'select:not([disabled]):not([tabindex="-1"])',
		'textarea:not([disabled]):not([tabindex="-1"])',
		'a[href]:not([tabindex="-1"])',
		'[tabindex]:not([tabindex="-1"])'
	].join(',');

	let dialogElement: HTMLElement | null = null;
	let selectedProductFilterId = $state<string | null>(null);
	let productFilterOpen = $state(false);
	let productFilterSearch = $state('');
	const productFilters = $derived.by(() => getProductChainFilters());
	const selectedProductFilter = $derived(
		selectedProductFilterId
			? (productFilters.find((filter) => filter.id === selectedProductFilterId) ?? null)
			: null
	);
	const filterButtonLabel = $derived(
		selectedProductFilter ? `Filter: ${selectedProductFilter.name}` : 'Filter: All products'
	);
	const filteredProductFilters = $derived.by(() => {
		const query = productFilterSearch.trim().toLowerCase();

		if (!query) {
			return productFilters;
		}

		return productFilters.filter(
			(filter) =>
				filter.name.toLowerCase().includes(query) || filter.id.toLowerCase().includes(query)
		);
	});
	const visibleIndustryBuildingTypes = $derived.by(() =>
		selectedProductFilterId
			? getIndustrialBuildingTypesForProductChain(selectedProductFilterId)
			: Object.values(INDUSTRIAL_BUILDING_TYPES)
	);

	const focusDialogOnMount: Attachment<HTMLElement> = (node) => {
		dialogElement = node;
		queueMicrotask(() => {
			getDialogFocusableElements(node)[0]?.focus();
		});

		return () => {
			if (dialogElement === node) {
				dialogElement = null;
			}
		};
	};

	function formatRange(range: { min: number; max: number }): string {
		if (range.min === range.max) {
			return currency.format(range.min);
		}

		return `${currency.format(range.min)}-${currency.format(range.max)}`;
	}

	function validTileLabel(validTileCount: number): string {
		return `${validTileCount} valid tile${validTileCount === 1 ? '' : 's'}`;
	}

	function getProductChainFilters(): ProductChainFilter[] {
		const categories: Array<{ id: string; name: string }> = [];

		for (const archetype of ARCHETYPES) {
			for (const category of archetype.startingCategories) {
				if (!categories.some((candidate) => candidate.id === category.id)) {
					categories.push({ id: category.id, name: category.name });
				}
			}
		}

		return categories
			.map((category) => ({
				id: category.id,
				name: category.name,
				buildingCount: getIndustrialBuildingTypesForProductChain(category.id).length
			}))
			.sort((first, second) => first.name.localeCompare(second.name));
	}

	function toggleProductFilter(): void {
		productFilterOpen = !productFilterOpen;
	}

	function closeProductFilter(): void {
		productFilterOpen = false;
	}

	function selectProductFilter(filterId: string | null): void {
		selectedProductFilterId = filterId;
		productFilterOpen = false;
		productFilterSearch = '';
	}

	function chooseRetail(archetypeId: ArchetypeId): void {
		onChooseRetail(archetypeId);
	}

	function chooseIndustry(buildingTypeId: IndustrialBuildingTypeId): void {
		if (industryLockedReason) {
			return;
		}

		onChooseIndustry(buildingTypeId);
	}

	function handleDialogKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();

			if (productFilterOpen) {
				closeProductFilter();
				return;
			}

			onClose();
			return;
		}

		if (event.key === 'Tab') {
			trapDialogFocus(event);
		}
	}

	function trapDialogFocus(event: KeyboardEvent): void {
		const focusableElements = getDialogFocusableElements();
		const firstElement = focusableElements[0];
		const lastElement = focusableElements.at(-1);

		if (!dialogElement || !firstElement || !lastElement) {
			event.preventDefault();
			dialogElement?.focus();
			return;
		}

		const activeElement = document.activeElement;

		if (
			event.shiftKey &&
			(activeElement === firstElement || !dialogElement.contains(activeElement))
		) {
			event.preventDefault();
			lastElement.focus();
			return;
		}

		if (!event.shiftKey && activeElement === lastElement) {
			event.preventDefault();
			firstElement.focus();
		}
	}

	function getDialogFocusableElements(root: HTMLElement | null = dialogElement): HTMLElement[] {
		if (!root) {
			return [];
		}

		return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
			(element) =>
				!element.hasAttribute('disabled') &&
				(element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0)
		);
	}
</script>

<div class="build-backdrop">
	<button
		type="button"
		class="backdrop-button"
		tabindex="-1"
		aria-label="Close build menu"
		onclick={onClose}
	></button>

	<div
		{@attach focusDialogOnMount}
		class="build-menu"
		role="dialog"
		aria-modal="true"
		aria-label="Build menu"
		tabindex="-1"
		onkeydown={handleDialogKeydown}
	>
		<header>
			<div>
				<p>{activeMapView === 'retail' ? 'Retail city' : 'Industry city'}</p>
				<h2>{activeMapView === 'retail' ? 'Build Retail' : 'Build Industry'}</h2>
			</div>
			<button type="button" class="close" aria-label="Close build menu" onclick={onClose}>x</button>
		</header>

		{#if activeMapView === 'retail'}
			<div class="option-list">
				{#each retailOptions as option (option.archetypeId)}
					{@const archetype = getArchetype(option.archetypeId)}
					{@const art = getStoreArt(option.archetypeId)}
					<button
						type="button"
						class="build-option"
						disabled={option.disabledReason !== null}
						onclick={() => chooseRetail(option.archetypeId)}
					>
						<img src={asset(art.path)} alt="" width="64" height="48" />
						<span>
							<strong>Build {archetype.name}</strong>
							<small>
								Setup {formatRange(option.setupCostRange)} | Revenue {formatRange(
									option.projectedDailyRevenueRange
								)}/day
							</small>
							<small>{validTileLabel(option.validTileCount)}</small>
							{#if option.disabledReason}
								<small class="disabled-copy">{option.disabledReason}</small>
							{/if}
						</span>
					</button>
				{:else}
					<p class="muted">No retail buildings available</p>
				{/each}
			</div>
		{:else}
			<div class="product-filter">
				<button
					type="button"
					class="filter-trigger"
					aria-expanded={productFilterOpen}
					onclick={toggleProductFilter}
				>
					{filterButtonLabel}
				</button>
				{#if selectedProductFilterId}
					<button
						type="button"
						class="filter-clear"
						aria-label="Clear product filter"
						onclick={() => selectProductFilter(null)}
					>
						x
					</button>
				{/if}
			</div>

			{#if industryLockedReason}
				<p class="disabled-copy">{industryLockedReason}</p>
			{/if}

			{#if productFilterOpen}
				<div class="filter-popup" role="dialog" aria-label="Product chain filter">
					<div class="filter-popup-heading">
						<h3>Product filter</h3>
						<button
							type="button"
							class="filter-close"
							aria-label="Close product chain filter"
							onclick={closeProductFilter}
						>
							x
						</button>
					</div>
					<label>
						<span>Search products</span>
						<input type="search" bind:value={productFilterSearch} />
					</label>
					<div class="filter-list">
						<button
							type="button"
							aria-pressed={selectedProductFilterId === null}
							onclick={() => selectProductFilter(null)}
						>
							<span>All products</span>
							<small>All industrial buildings</small>
						</button>
						{#each filteredProductFilters as filter (filter.id)}
							<button
								type="button"
								aria-pressed={selectedProductFilterId === filter.id}
								disabled={filter.buildingCount === 0}
								onclick={() => selectProductFilter(filter.id)}
							>
								<span>{filter.name}</span>
								<small>
									{filter.buildingCount > 0
										? `${filter.buildingCount} chain buildings`
										: 'No industry chain yet'}
								</small>
							</button>
						{:else}
							<p class="muted">No matching products</p>
						{/each}
					</div>
				</div>
			{/if}

			<div class="option-list">
				{#each visibleIndustryBuildingTypes as type (type.id)}
					<button
						type="button"
						class="build-option"
						disabled={industryLockedReason !== null}
						onclick={() => chooseIndustry(type.id)}
					>
						<img src={asset(getIndustrialBuildingArt(type.id))} alt="" width="44" height="44" />
						<span>
							<strong>Build {type.name}</strong>
							<small>
								Cost {currency.format(type.buildCost)} | Operating {currency.format(
									type.dailyOperatingCost
								)}/day
							</small>
						</span>
					</button>
				{:else}
					<p class="muted">No industrial buildings available</p>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.build-backdrop {
		position: fixed;
		inset: 0;
		z-index: 45;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(5 8 10 / 0.58);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
	}

	.build-menu {
		position: relative;
		z-index: 1;
		display: grid;
		gap: 0.8rem;
		width: min(31rem, 100%);
		max-height: calc(100dvh - 2rem);
		overflow: auto;
		border: 1px solid #33423a;
		border-radius: 8px;
		background: #121a16;
		color: #edf3ec;
		padding: 1rem;
		box-shadow: 0 24px 80px rgb(0 0 0 / 0.45);
	}

	header,
	.build-option,
	.product-filter {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	header {
		justify-content: space-between;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-size: 1.2rem;
		line-height: 1.15;
	}

	header p,
	small,
	.disabled-copy,
	.muted {
		color: #b7c3b2;
	}

	header p,
	small,
	.disabled-copy,
	.muted,
	label span {
		font-size: 0.78rem;
	}

	.option-list,
	.filter-popup,
	.filter-list,
	label {
		display: grid;
		gap: 0.55rem;
	}

	button {
		border: 1px solid #3a4d43;
		border-radius: 8px;
		background: #1a261f;
		color: inherit;
		font: inherit;
	}

	button:hover,
	button:focus-visible {
		border-color: #87a759;
		background: #233227;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.close,
	.filter-close,
	.filter-clear {
		flex: 0 0 auto;
		width: 2rem;
		height: 2rem;
		padding: 0;
		text-align: center;
	}

	.build-option {
		width: 100%;
		padding: 0.65rem;
		text-align: left;
	}

	.build-option img {
		flex: 0 0 auto;
		border-radius: 6px;
		object-fit: cover;
	}

	.build-option > span {
		display: grid;
		gap: 0.18rem;
		min-width: 0;
	}

	.filter-trigger {
		flex: 1 1 auto;
		padding: 0.6rem 0.7rem;
		text-align: left;
	}

	.filter-popup {
		border: 1px solid #3a4d43;
		border-radius: 8px;
		background: #0d1511;
		padding: 0.7rem;
	}

	.filter-popup-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h3 {
		margin: 0;
		font-size: 0.86rem;
	}

	input {
		min-width: 0;
		border: 1px solid #3a4d43;
		border-radius: 6px;
		background: #09100c;
		color: #edf3ec;
		padding: 0.55rem;
		font: inherit;
	}

	.filter-list button {
		display: grid;
		gap: 0.15rem;
		padding: 0.55rem 0.65rem;
		text-align: left;
	}
</style>
