<script lang="ts">
	import { asset } from '$app/paths';
	import {
		getIndustrialBuildingArt,
		getIndustryMaterialArt,
		getStoreArt
	} from '$lib/assets/gameArt';
	import { ARCHETYPES, getArchetype } from '$lib/game/archetypes';
	import {
		INDUSTRIAL_BUILDING_TYPES,
		MATERIALS,
		PRODUCTION_RECIPES,
		getIndustrialBuildingTypesForProductChain
	} from '$lib/game/industry';
	import { getBuildingTypeProducing } from '$lib/game/supplyAdvisor';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import { formatPlacementBlockReason } from '$lib/i18n/gameCopy';
	import type { I18nBundle } from '$lib/i18n/index';
	import type { PlacementBlockReason, RetailBuildMenuOption } from '$lib/game/placementPreview';
	import type {
		ArchetypeId,
		IndustrialBuildingTypeId,
		IndustryResourceId,
		MaterialId
	} from '$lib/game/types';

	interface ProductChainFilter {
		id: string;
		name: string;
		buildingCount: number;
	}

	interface Props {
		activeMapView: 'retail' | 'industry';
		i18n: I18nBundle;
		retailOptions: RetailBuildMenuOption[];
		industryLockedReason: PlacementBlockReason | null;
		availableMaterialIds?: string[];
		onChooseRetail: (archetypeId: ArchetypeId) => void;
		onChooseIndustry: (buildingTypeId: IndustrialBuildingTypeId) => void;
		onOpenAdvisor?: () => void;
		onClose: () => void;
	}

	let {
		activeMapView,
		i18n,
		retailOptions,
		industryLockedReason,
		availableMaterialIds = [],
		onChooseRetail,
		onChooseIndustry,
		onOpenAdvisor = () => {},
		onClose
	}: Props = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

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
	const visibleIndustryBuildingTypes = $derived.by(() => {
		const types = selectedProductFilterId
			? getIndustrialBuildingTypesForProductChain(selectedProductFilterId)
			: Object.values(INDUSTRIAL_BUILDING_TYPES);
		return [...types].sort(
			(first, second) =>
				first.tier - second.tier ||
				first.buildCost - second.buildCost ||
				first.name.localeCompare(second.name)
		);
	});
	const availableSet = $derived(new Set(availableMaterialIds));

	function formatRange(range: { min: number; max: number }): string {
		if (range.min === range.max) {
			return currency.format(range.min);
		}

		return `${currency.format(range.min)}-${currency.format(range.max)}`;
	}

	function validTileLabel(validTileCount: number): string {
		return `${validTileCount} valid tile${validTileCount === 1 ? '' : 's'}`;
	}

	function formatPlacementReason(reason: PlacementBlockReason | null): string | null {
		return formatPlacementBlockReason(reason, i18n);
	}

	function recipeForType(typeId: IndustrialBuildingTypeId) {
		const type = INDUSTRIAL_BUILDING_TYPES[typeId];
		return type.recipeId ? PRODUCTION_RECIPES[type.recipeId] : null;
	}

	function materialName(materialId: MaterialId): string {
		return MATERIALS[materialId]?.name ?? materialId;
	}

	function materialArt(materialId: MaterialId): string {
		return asset(getIndustryMaterialArt(materialId));
	}

	function isAvailable(materialId: MaterialId): boolean {
		return availableSet.has(materialId);
	}

	function neededProducerName(materialId: MaterialId): string {
		return getBuildingTypeProducing(materialId)?.name ?? materialName(materialId);
	}

	function resourceLabel(resource: IndustryResourceId): string {
		return resource
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
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
		// Tab/Shift+Tab wrapping is handled by the shared `focusTrap` attachment.
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
		{@attach focusTrap}
		class="build-menu paper"
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
			<button type="button" class="close btn-danger" aria-label="Close build menu" onclick={onClose}
				>×</button
			>
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
								<small class="disabled-copy">
									{formatPlacementReason(option.disabledReason)}
								</small>
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
						×
					</button>
				{/if}
			</div>

			{#if industryLockedReason}
				<p class="disabled-copy">{formatPlacementReason(industryLockedReason)}</p>
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
							×
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

			<button
				type="button"
				class="advisor-open"
				disabled={industryLockedReason !== null}
				onclick={onOpenAdvisor}
			>
				Supply Advisor — what should I build?
			</button>

			<div class="option-list">
				{#each visibleIndustryBuildingTypes as type (type.id)}
					{@const recipe = recipeForType(type.id)}
					<button
						type="button"
						class="build-option"
						disabled={industryLockedReason !== null}
						onclick={() => chooseIndustry(type.id)}
					>
						<img src={asset(getIndustrialBuildingArt(type.id))} alt="" width="44" height="44" />
						<span>
							<strong>
								Build {type.name}
								{#if type.tier === 1}<em class="starter">Starter</em>{/if}
							</strong>
							<small>
								Cost {currency.format(type.buildCost)} | Operating {currency.format(
									type.dailyOperatingCost
								)}/day
							</small>
							{#if recipe}
								<span class="recipe" aria-label="Recipe">
									{#each recipe.inputs as input (input.materialId)}
										<span class="chip" class:missing={!isAvailable(input.materialId)}>
											<img
												src={materialArt(input.materialId)}
												alt={materialName(input.materialId)}
												width="18"
												height="18"
											/>
											{input.quantity}
										</span>
									{/each}
									<span class="arrow" aria-hidden="true">→</span>
									{#each recipe.outputs as output (output.materialId)}
										<span class="chip out">
											<img
												src={materialArt(output.materialId)}
												alt={materialName(output.materialId)}
												width="18"
												height="18"
											/>
											{output.quantity}
										</span>
									{/each}
								</span>
								{#each recipe.inputs.filter((input) => !isAvailable(input.materialId)) as missing (missing.materialId)}
									<small class="need">Needs {neededProducerName(missing.materialId)}</small>
								{/each}
							{/if}
							{#if type.requiredResource}
								<small class="need">
									Needs a {resourceLabel(type.requiredResource)} resource tile
								</small>
							{/if}
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
		background: rgba(20, 16, 10, 0.7);
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
		gap: 0.85rem;
		width: min(36rem, 100%);
		max-height: calc(100dvh - 2rem);
		overflow: auto;
		padding: 1.1rem 1.2rem;
		color: var(--ink-700);
	}

	header,
	.product-filter {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	header {
		justify-content: space-between;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	header p,
	small,
	.disabled-copy,
	.muted {
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	header p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	small {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--ink-500);
	}

	.disabled-copy,
	.muted {
		font-family: var(--font-body);
		font-size: 0.86rem;
	}

	.option-list,
	.filter-popup,
	.filter-list,
	label {
		display: grid;
		gap: 0.55rem;
	}

	.build-option {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--paper-edge);
		border-left: 0;
		border-radius: 0 2px 2px 0;
		background: var(--paper-50);
		color: var(--ink-700);
		font: inherit;
		text-align: left;
		position: relative;
	}

	.build-option:hover:not(:disabled),
	.build-option:focus-visible:not(:disabled) {
		background: var(--paper-200);
		border-color: var(--brass-500);
		box-shadow: inset 3px 0 0 var(--wax-red);
		outline: none;
	}

	.build-option:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.build-option:disabled::after {
		content: 'UNAVAILABLE';
		position: absolute;
		top: 0.3rem;
		right: 0.5rem;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		color: var(--wax-red);
		border: 1px solid var(--wax-red);
		padding: 0.1rem 0.3rem;
		transform: rotate(-3deg);
	}

	.build-option img {
		flex: 0 0 auto;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-200);
		padding: 0.2rem;
		object-fit: cover;
	}

	.build-option > span {
		display: grid;
		gap: 0.22rem;
		min-width: 0;
	}

	.build-option strong {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.close {
		flex: 0 0 auto;
		width: 2rem;
		height: 2rem;
		padding: 0;
		text-align: center;
	}

	.filter-clear,
	.filter-close {
		flex: 0 0 auto;
		width: 2rem;
		height: 2rem;
		padding: 0;
		text-align: center;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
	}

	.filter-trigger {
		flex: 1 1 auto;
		padding: 0.6rem 0.75rem;
		text-align: left;
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
	}

	.filter-trigger:hover,
	.filter-trigger:focus-visible {
		background: var(--paper-200);
	}

	.filter-popup {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.8rem;
	}

	.filter-popup-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h3 {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	input {
		min-width: 0;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0.55rem 0.7rem;
		font-family: var(--font-ui);
	}

	label span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.filter-list button {
		display: grid;
		gap: 0.18rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		text-align: left;
	}

	.filter-list button:hover:not(:disabled) {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.filter-list button[aria-pressed='true'] {
		background: var(--paper-200);
		border-color: var(--brass-500);
		box-shadow: inset 3px 0 0 var(--wax-red);
	}

	.filter-list button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.advisor-open {
		width: 100%;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
		padding: 0.6rem 0.75rem;
		text-align: left;
	}

	.advisor-open:hover,
	.advisor-open:focus-visible {
		background: var(--paper-200);
	}

	.advisor-open:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.starter {
		margin-left: 0.4rem;
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		background: var(--brass-100);
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 700;
		font-style: normal;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.05rem 0.4rem;
	}

	.recipe {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.15rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-100);
		padding: 0.1rem 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--ink-700);
	}

	.chip.missing {
		border-color: var(--wax-red);
		color: var(--wax-red);
	}

	.chip.out {
		border-color: var(--moss);
	}

	.arrow {
		color: var(--brass-700);
		font-family: var(--font-mono);
	}

	.need {
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.76rem;
	}
</style>
