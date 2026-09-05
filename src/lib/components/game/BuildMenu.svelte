<script lang="ts">
	import { asset } from '$app/paths';
	import {
		getIndustrialBuildingArt,
		getIndustryMaterialArt,
		getStoreArt
	} from '$lib/assets/gameArt';
	import { ARCHETYPES } from '$lib/game/archetypes';
	import {
		INDUSTRIAL_BUILDING_TYPES,
		PRODUCTION_RECIPES,
		getIndustrialBuildingTypesForProductChain
	} from '$lib/game/industry';
	import { MATERIAL_PRODUCER_RECIPES } from '$lib/game/productChainGraph';
	import { getProductDefinition } from '$lib/game/products';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import { formatPlacementBlockReason } from '$lib/i18n/gameCopy';
	import type { I18nBundle } from '$lib/i18n/index';
	import type {
		IndustrialBuildMenuDisabledReason,
		IndustrialBuildMenuOption,
		PlacementBlockReason,
		RetailBuildMenuOption
	} from '$lib/game/placementPreview';
	import type {
		ArchetypeId,
		IndustrialBuildingTypeId,
		MaterialId,
		ProductId
	} from '$lib/game/types';

	interface ProductChainFilter {
		id: ProductId;
		name: string;
		artSrc: string | null;
		buildingCount: number;
	}

	interface Props {
		activeMapView: 'retail' | 'industry';
		i18n: I18nBundle;
		retailOptions: RetailBuildMenuOption[];
		industryOptions?: IndustrialBuildMenuOption[];
		industryLockedReason: PlacementBlockReason | null;
		availableMaterialIds?: string[];
		canOpenStore?: boolean;
		canFinanceRetailStore?: boolean;
		canBuildIndustrialBuilding?: boolean;
		canFinanceIndustrialBuilding?: boolean;
		allowedRetailArchetypeIds?: ArchetypeId[];
		allowedIndustryBuildingTypeIds?: IndustrialBuildingTypeId[];
		disabledReason?: string | null;
		onChooseRetail: (archetypeId: ArchetypeId) => void;
		onChooseIndustry: (buildingTypeId: IndustrialBuildingTypeId) => void;
		onOpenAdvisor?: () => void;
		onClose: () => void;
	}

	let {
		activeMapView,
		i18n,
		retailOptions,
		industryOptions = Object.keys(INDUSTRIAL_BUILDING_TYPES).map((buildingTypeId) => ({
			buildingTypeId: buildingTypeId as IndustrialBuildingTypeId,
			disabledReason: null,
			financeOffer: null
		})),
		industryLockedReason,
		availableMaterialIds = [],
		canOpenStore = true,
		canFinanceRetailStore = false,
		canBuildIndustrialBuilding = true,
		canFinanceIndustrialBuilding = false,
		allowedRetailArchetypeIds = retailOptions.map((option) => option.archetypeId),
		allowedIndustryBuildingTypeIds = Object.keys(
			INDUSTRIAL_BUILDING_TYPES
		) as IndustrialBuildingTypeId[],
		disabledReason = null,
		onChooseRetail,
		onChooseIndustry,
		onOpenAdvisor = () => {},
		onClose
	}: Props = $props();

	let selectedProductFilterId = $state<ProductId | null>(null);
	const productFilters = $derived.by(() => getProductChainFilters());
	const filteredProductFilters = $derived(
		productFilters.filter(
			(filter) => filter.buildingCount > 0 || filter.id === selectedProductFilterId
		)
	);
	const visibleIndustryBuildingTypes = $derived.by(() => {
		const productionMaterialId = selectedProductFilterId
			? getProductDefinition(selectedProductFilterId).productionMaterialId
			: null;
		const types = selectedProductFilterId
			? productionMaterialId
				? getIndustrialBuildingTypesForProductChain(productionMaterialId)
				: []
			: Object.values(INDUSTRIAL_BUILDING_TYPES);
		return [...types].sort(
			(first, second) =>
				first.tier - second.tier ||
				first.buildCost - second.buildCost ||
				first.name.localeCompare(second.name)
		);
	});
	const availableSet = $derived(new Set(availableMaterialIds));
	const allowedRetailSet = $derived(new Set(allowedRetailArchetypeIds));
	const allowedIndustrySet = $derived(new Set(allowedIndustryBuildingTypeIds));
	const industryOptionById = $derived(
		new Map(industryOptions.map((option) => [option.buildingTypeId, option]))
	);
	const canStartRetailExpansion = $derived(canOpenStore || canFinanceRetailStore);
	const canStartIndustryExpansion = $derived(
		canBuildIndustrialBuilding || canFinanceIndustrialBuilding
	);

	function formatRange(range: { min: number; max: number }): string {
		if (range.min === range.max) {
			return i18n.format.currency(range.min);
		}

		return i18n.t('buildMenu.retail.rangeFormat', {
			min: i18n.format.currency(range.min),
			max: i18n.format.currency(range.max)
		});
	}

	function validTileLabel(validTileCount: number): string {
		return i18n.t(
			(validTileCount === 1
				? 'buildMenu.retail.validTiles.one'
				: 'buildMenu.retail.validTiles.other') as never,
			{
				count: i18n.format.integer(validTileCount)
			}
		);
	}

	function formatPlacementReason(reason: PlacementBlockReason | null): string | null {
		return formatPlacementBlockReason(reason, i18n);
	}

	function formatIndustryDisabledReason(
		reason: IndustrialBuildMenuDisabledReason | null
	): string | null {
		return reason?.code === 'industry.commandUnavailable'
			? disabledReason
			: formatPlacementReason(reason);
	}

	function industryDisabledReason(
		buildingTypeId: IndustrialBuildingTypeId
	): IndustrialBuildMenuDisabledReason | null {
		return industryOptionById.get(buildingTypeId)?.disabledReason ?? null;
	}

	function recipeForType(typeId: IndustrialBuildingTypeId) {
		const type = INDUSTRIAL_BUILDING_TYPES[typeId];
		return type.recipeId ? PRODUCTION_RECIPES[type.recipeId] : null;
	}

	function materialName(materialId: MaterialId): string {
		return i18n.labels.material(materialId);
	}

	function materialArt(materialId: MaterialId): string {
		return asset(getIndustryMaterialArt(materialId));
	}

	function isAvailable(materialId: MaterialId): boolean {
		return availableSet.has(materialId);
	}

	function neededProducerName(materialId: MaterialId): string {
		const producerRecipeId = MATERIAL_PRODUCER_RECIPES.get(materialId);
		const producer = producerRecipeId
			? Object.values(INDUSTRIAL_BUILDING_TYPES).find(
					(buildingType) => buildingType.recipeId === producerRecipeId
				)
			: null;
		return producer ? i18n.labels.industrialBuilding(producer.id) : materialName(materialId);
	}

	function productArt(productId: ProductId): string | null {
		const materialId = getProductDefinition(productId).productionMaterialId;
		return materialId ? (getIndustryMaterialArt(materialId as MaterialId) ?? null) : null;
	}

	function getProductChainFilters(): ProductChainFilter[] {
		const products: Array<{ id: ProductId; name: string }> = [];

		for (const archetype of ARCHETYPES) {
			for (const productId of archetype.startingProductIds) {
				const product = getProductDefinition(productId);
				if (!products.some((candidate) => candidate.id === product.id)) {
					products.push({ id: product.id, name: product.name });
				}
			}
		}

		return products
			.map((product) => {
				const productionMaterialId = getProductDefinition(product.id).productionMaterialId;
				return {
					id: product.id,
					name: i18n.labels.productCategory(product.id),
					artSrc: productArt(product.id),
					buildingCount: productionMaterialId
						? getIndustrialBuildingTypesForProductChain(productionMaterialId).length
						: 0
				};
			})
			.sort((first, second) => first.name.localeCompare(second.name));
	}

	function selectProductFilter(filterId: ProductId | null): void {
		selectedProductFilterId = filterId;
	}

	function chooseRetail(archetypeId: ArchetypeId): void {
		if (!canStartRetailExpansion || !allowedRetailSet.has(archetypeId)) return;
		onChooseRetail(archetypeId);
	}

	function chooseIndustry(buildingTypeId: IndustrialBuildingTypeId): void {
		if (
			industryLockedReason ||
			!canStartIndustryExpansion ||
			industryDisabledReason(buildingTypeId) !== null ||
			!allowedIndustrySet.has(buildingTypeId)
		) {
			return;
		}

		onChooseIndustry(buildingTypeId);
	}

	function handleDialogKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
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
		aria-label={i18n.t('buildMenu.close')}
		onclick={onClose}
	></button>

	<div
		{@attach focusTrap}
		class="build-menu paper"
		role="dialog"
		aria-modal="true"
		aria-label={i18n.t('buildMenu.dialog')}
		tabindex="-1"
		onkeydown={handleDialogKeydown}
	>
		<header>
			<div>
				<p>
					{i18n.t(
						`buildMenu.cityEyebrow.${activeMapView === 'retail' ? 'retail' : 'industry'}` as never
					)}
				</p>
				<h2>
					{i18n.t(`buildMenu.title.${activeMapView === 'retail' ? 'retail' : 'industry'}` as never)}
				</h2>
			</div>
			<button
				type="button"
				class="close btn-danger"
				aria-label={i18n.t('buildMenu.close')}
				onclick={onClose}
			>
				×
			</button>
		</header>

		{#if activeMapView === 'retail'}
			<div class="option-grid">
				{#each retailOptions as option (option.archetypeId)}
					{@const art = getStoreArt(option.archetypeId)}
					{@const disabled =
						option.disabledReason !== null ||
						!canStartRetailExpansion ||
						!allowedRetailSet.has(option.archetypeId)}
					<button
						type="button"
						class="build-option"
						class:is-disabled={disabled}
						{disabled}
						onclick={() => chooseRetail(option.archetypeId)}
					>
						<span class="art-frame">
							<img src={asset(art.path)} alt="" />
						</span>
						<strong>
							{i18n.t('buildMenu.retail.buildArchetype' as never, {
								name: i18n.labels.archetype(option.archetypeId).name
							})}
						</strong>
						<small>
							{i18n.t('buildMenu.retail.setupRevenue' as never, {
								setup: formatRange(option.setupCostRange),
								revenue: formatRange(option.projectedDailyRevenueRange)
							})}
						</small>
						<small>{validTileLabel(option.validTileCount)}</small>
						{#if option.disabledReason}
							<small class="disabled-copy">
								{formatPlacementReason(option.disabledReason)}
							</small>
						{/if}
						{#if !canStartRetailExpansion || !allowedRetailSet.has(option.archetypeId)}
							<small class="disabled-copy">{disabledReason}</small>
						{/if}
						{#if disabled}
							<span class="disabled-badge">{i18n.t('buildMenu.unavailable')}</span>
						{/if}
					</button>
				{:else}
					<p class="muted">{i18n.t('buildMenu.retail.noOptions')}</p>
				{/each}
			</div>
		{:else}
			<div class="filter-band">
				<span class="band-label">{i18n.t('buildMenu.industry.filter.chainLabel')}</span>
				<div
					class="chain-filters"
					role="group"
					aria-label={i18n.t('buildMenu.industry.filter.title')}
				>
					<button
						type="button"
						class="chain-filter"
						class:is-active={selectedProductFilterId === null}
						aria-pressed={selectedProductFilterId === null}
						aria-label={i18n.t('buildMenu.industry.filter.allProducts')}
						title={i18n.t('buildMenu.industry.filter.allProducts')}
						onclick={() => selectProductFilter(null)}
					>
						{i18n.t('buildMenu.industry.filter.allShortLabel')}
					</button>
					{#each filteredProductFilters as filter (filter.id)}
						{@const filterDisabled = filter.buildingCount === 0}
						<button
							type="button"
							class="chain-filter"
							class:is-active={selectedProductFilterId === filter.id}
							aria-pressed={selectedProductFilterId === filter.id}
							aria-label={filterDisabled
								? `${i18n.t('buildMenu.industry.filter.selected' as never, { name: filter.name })} — ${i18n.t('buildMenu.industry.filter.noChain')}`
								: i18n.t('buildMenu.industry.filter.selected' as never, { name: filter.name })}
							title={filterDisabled
								? i18n.t('buildMenu.industry.filter.noChain')
								: i18n.t('buildMenu.industry.filter.selected' as never, { name: filter.name })}
							disabled={filterDisabled}
							onclick={() => selectProductFilter(filter.id)}
						>
							{#if filter.artSrc}
								<img src={filter.artSrc} alt="" />
							{:else}
								<span class="dash" aria-hidden="true">—</span>
							{/if}
						</button>
					{/each}
				</div>
				<button
					type="button"
					class="advisor-open"
					disabled={industryLockedReason !== null}
					onclick={onOpenAdvisor}
				>
					{i18n.t('buildMenu.industry.supplyAdvisor')}
				</button>
			</div>

			{#if industryLockedReason}
				<p class="disabled-copy">{formatPlacementReason(industryLockedReason)}</p>
			{/if}

			<div class="option-grid">
				{#each visibleIndustryBuildingTypes as type (type.id)}
					{@const recipe = recipeForType(type.id)}
					{@const optionDisabledReason = industryDisabledReason(type.id)}
					{@const disabled =
						industryLockedReason !== null ||
						!canStartIndustryExpansion ||
						optionDisabledReason !== null ||
						!allowedIndustrySet.has(type.id)}
					<button
						type="button"
						class="build-option"
						class:is-disabled={disabled}
						{disabled}
						onclick={() => chooseIndustry(type.id)}
					>
						<span class="art-frame">
							<img src={asset(getIndustrialBuildingArt(type.id))} alt="" />
						</span>
						<strong>
							{i18n.t('buildMenu.industry.buildType' as never, {
								name: i18n.labels.industrialBuilding(type.id)
							})}
							{#if type.tier === 1}
								<em class="starter">{i18n.t('buildMenu.industry.starter')}</em>
							{/if}
						</strong>
						<small>
							{i18n.t('buildMenu.industry.costOperating' as never, {
								cost: i18n.format.currency(type.buildCost),
								operating: i18n.format.currency(type.dailyOperatingCost)
							})}
						</small>
						{#if recipe}
							<span class="recipe" aria-label={i18n.t('buildMenu.industry.recipe')}>
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
								<small class="need">
									{i18n.t('buildMenu.industry.needsProducer' as never, {
										producer: neededProducerName(missing.materialId)
									})}
								</small>
							{/each}
						{/if}
						{#if type.requiredResource}
							<small class="need resource">
								{i18n.t('buildMenu.industry.needsResource' as never, {
									resource: i18n.labels.industryResource(type.requiredResource)
								})}
							</small>
						{/if}
						{#if !canStartIndustryExpansion || !allowedIndustrySet.has(type.id)}
							<small class="disabled-copy">{disabledReason}</small>
						{/if}
						{#if optionDisabledReason}
							<small class="disabled-copy">
								{formatIndustryDisabledReason(optionDisabledReason)}
							</small>
						{/if}
						{#if disabled}
							<span class="disabled-badge">{i18n.t('buildMenu.unavailable')}</span>
						{/if}
					</button>
				{:else}
					<p class="muted">{i18n.t('buildMenu.industry.noOptions')}</p>
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
		background: rgba(16, 12, 7, 0.88);
		backdrop-filter: blur(3px);
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
		width: min(900px, 100%);
		max-height: min(680px, calc(100dvh - 2rem));
		overflow: auto;
		padding: 1.1rem 1.2rem;
		color: var(--ink-700);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2,
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
		display: block;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--ink-500);
	}

	.disabled-copy,
	.muted {
		font-family: var(--font-body);
		font-size: 0.86rem;
	}

	.close {
		flex: 0 0 auto;
		width: 2rem;
		height: 2rem;
		padding: 0;
		text-align: center;
	}

	/* Chain filter band */
	.filter-band {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
	}

	.band-label {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.chain-filters {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
	}

	.chain-filter {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-700);
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 50%;
		cursor: pointer;
	}

	.chain-filter:hover:not(:disabled) {
		border-color: var(--brass-700);
	}

	.chain-filter.is-active {
		background: color-mix(in srgb, var(--brass-100) 78%, var(--paper-50));
		border: 2px solid var(--brass-700);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--brass-700) 16%, transparent);
	}

	.chain-filter:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.chain-filter img {
		width: 28px;
		height: 28px;
		image-rendering: pixelated;
	}

	.chain-filter .dash {
		color: var(--ink-500);
	}

	.advisor-open {
		margin-left: auto;
		border: 1px solid var(--brass-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		padding: 0.42rem 0.65rem;
	}

	.advisor-open:hover,
	.advisor-open:focus-visible {
		background: var(--paper-200);
	}

	.advisor-open:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	/* Card grid */
	.option-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.build-option {
		position: relative;
		display: grid;
		align-content: start;
		gap: 0.3rem;
		min-width: 0;
		padding: 0.55rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font: inherit;
		text-align: left;
	}

	.build-option:hover:not(:disabled),
	.build-option:focus-visible:not(:disabled) {
		background: var(--paper-200);
		border-color: var(--brass-500);
		box-shadow: inset 0 2px 0 var(--brass-700);
		outline: none;
	}

	.build-option:disabled {
		cursor: not-allowed;
	}

	.build-option.is-disabled img {
		filter: grayscale(0.7);
		opacity: 0.8;
	}

	.art-frame {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 135px;
		margin-bottom: 0.2rem;
		background: radial-gradient(
			circle at 50% 40%,
			color-mix(in srgb, var(--paper-50) 97%, white) 0%,
			color-mix(in srgb, var(--paper-50) 88%, var(--brass-100)) 100%
		);
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
	}

	.art-frame img {
		max-width: 90%;
		max-height: 90%;
		image-rendering: pixelated;
	}

	.build-option strong {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.disabled-badge {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		color: var(--wax-red);
		border: 1px solid var(--wax-red);
		background: var(--paper-50);
		padding: 0.1rem 0.3rem;
		transform: rotate(-4deg);
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
		vertical-align: middle;
	}

	.recipe {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
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

	.need.resource {
		color: var(--ink-500);
	}

	@media (max-width: 860px) {
		.option-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 560px) {
		.option-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
