<script lang="ts">
	import { asset } from '$app/paths';
	import { getIndustrialBuildingArt, getIndustryMaterialArt } from '$lib/assets/gameArt';
	import { ARCHETYPES } from '$lib/game/archetypes';
	import {
		INDUSTRIAL_BUILDING_TYPES,
		MATERIALS,
		PRODUCTION_RECIPES,
		getIndustrialBuildingTypesForProductChain
	} from '$lib/game/industry';
	import {
		getAllowedIndustrialBuildingTypes,
		getIndustrialPlacementBlockReason
	} from '$lib/game/industryPlacement';
	import { getWarehouseUsed } from '$lib/game/industryProduction';
	import type {
		DailyMaterialMovement,
		GameState,
		IndustrialBuilding,
		IndustrialBuildingType,
		IndustrialBuildingTypeId,
		IndustryTile,
		MaterialId
	} from '$lib/game/types';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';

	interface Props {
		game: GameState;
		tile: IndustryTile | null;
		building: IndustrialBuilding | null;
		constructionDisabledReason?: string | null;
		onBuild: (buildingTypeId: IndustrialBuildingTypeId, tileId: string) => void;
		onClose: () => void;
	}

	interface WarehouseMaterialRow {
		id: MaterialId;
		name: string;
		quantity: number;
	}

	interface ProductChainFilter {
		id: string;
		name: string;
		buildingCount: number;
	}

	let { game, tile, building, constructionDisabledReason = null, onBuild, onClose }: Props =
		$props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const allowedBuildingTypes = $derived.by(() =>
		tile ? getAllowedIndustrialBuildingTypes(game, tile.id) : []
	);
	const productFilters = $derived.by(() => getProductChainFilters());
	let selectedProductFilterId = $state<string | null>(null);
	let productFilterOpen = $state(false);
	let productFilterSearch = $state('');
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
	const visibleBuildingTypes = $derived.by(() => {
		if (!tile) {
			return [];
		}

		if (!selectedProductFilterId) {
			return allowedBuildingTypes;
		}

		return getIndustrialBuildingTypesForProductChain(selectedProductFilterId);
	});
	const constructionDisabled = $derived(constructionDisabledReason !== null);
	const buildingType = $derived(building ? INDUSTRIAL_BUILDING_TYPES[building.typeId] : null);
	const tileTerrain = $derived(tile ? label(tile.terrain) : 'Unknown');
	const tileResource = $derived(tile?.resource ? label(tile.resource) : 'None');
	const warehouseUsed = $derived(getWarehouseUsed(game.warehouse));
	const warehouseMaterials = $derived.by(() => getWarehouseMaterialRows());
	let pendingBuilding = $state<IndustrialBuildingType | null>(null);
	let pendingTileId = $state<string | null>(null);
	let lastTileId = $state<string | null>(null);
	let lastBuildingId = $state<string | null>(null);
	const pendingIsCurrent = $derived(Boolean(pendingBuilding && tile && pendingTileId === tile.id));
	const pendingIsAllowed = $derived(
		Boolean(
			pendingBuilding &&
				pendingTileId &&
				!constructionDisabled &&
				getIndustrialPlacementBlockReason(game, pendingTileId, pendingBuilding.id) === null
		)
	);
	const pendingBuildingArtSrc = $derived(
		pendingBuilding ? asset(getIndustrialBuildingArt(pendingBuilding.id)) : ''
	);
	const pendingRecipe = $derived(
		pendingBuilding?.recipeId ? PRODUCTION_RECIPES[pendingBuilding.recipeId] : null
	);

	$effect(() => {
		const currentTileId = tile?.id ?? null;
		const currentBuildingId = building && building.tileId === currentTileId ? building.id : null;

		if (lastTileId !== currentTileId || lastBuildingId !== currentBuildingId) {
			pendingBuilding = null;
			pendingTileId = null;
			productFilterOpen = false;
			productFilterSearch = '';
			lastTileId = currentTileId;
			lastBuildingId = currentBuildingId;
		}
	});

	function label(value: string): string {
		return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
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

	function handleProductFilterKeydown(event: KeyboardEvent): void {
		if (!productFilterOpen || event.key !== 'Escape') {
			return;
		}

		event.stopPropagation();
		productFilterOpen = false;
	}

	function selectProductFilter(filterId: string | null): void {
		selectedProductFilterId = filterId;
		productFilterOpen = false;
		productFilterSearch = '';
	}

	function chooseBuilding(type: IndustrialBuildingType): void {
		if (!tile || constructionDisabled || getBuildingPlacementBlockReason(type) !== null) {
			return;
		}

		productFilterOpen = false;
		pendingBuilding = type;
		pendingTileId = tile.id;
	}

	function cancelBuild(): void {
		pendingBuilding = null;
		pendingTileId = null;
	}

	function confirmBuild(): void {
		if (!pendingBuilding || !pendingTileId || !pendingIsCurrent || building || !pendingIsAllowed) {
			cancelBuild();
			return;
		}

		const buildingTypeId = pendingBuilding.id;
		const tileId = pendingTileId;
		cancelBuild();
		onBuild(buildingTypeId, tileId);
		onClose();
	}

	function getWarehouseMaterialRows(): WarehouseMaterialRow[] {
		return Object.entries(game.warehouse.materials)
			.map(([materialId, quantity]) => ({
				id: materialId as MaterialId,
				name: MATERIALS[materialId as MaterialId]?.name ?? label(materialId),
				quantity: quantity ?? 0
			}))
			.filter((material) => material.quantity > 0)
			.sort((first, second) => first.name.localeCompare(second.name));
	}

	function getBuildingPlacementBlockReason(type: IndustrialBuildingType): string | null {
		if (!tile) {
			return 'No industrial tile selected';
		}

		return getIndustrialPlacementBlockReason(game, tile.id, type.id);
	}

	function movementLabel(movement: DailyMaterialMovement): string {
		return `${materialName(movement.materialId)}: ${movement.quantity}`;
	}

	function materialName(materialId: MaterialId): string {
		return MATERIALS[materialId]?.name ?? label(materialId);
	}

	function materialArtSrc(materialId: MaterialId): string {
		return asset(getIndustryMaterialArt(materialId));
	}

	function buildingArtSrc(typeId: IndustrialBuildingTypeId): string {
		return asset(getIndustrialBuildingArt(typeId));
	}

	function recipeSummary(
		materials: readonly {
			materialId: MaterialId;
			quantity: number;
		}[]
	): string {
		if (materials.length === 0) {
			return 'None';
		}

		return materials
			.map((material) => `${material.quantity} ${materialName(material.materialId)}`)
			.join(', ');
	}

	function stopMapInteraction(event: Event): void {
		event.stopPropagation();
	}

	const blockMapInteraction: Attachment<HTMLElement> = (node) => {
		const cleanups = [
			on(node, 'pointerdown', stopMapInteraction),
			on(node, 'pointerup', stopMapInteraction),
			on(node, 'click', stopMapInteraction)
		];

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	};
</script>

<svelte:document onkeydown={handleProductFilterKeydown} />

<aside class="inspector" aria-label="Industry tile inspector" {@attach blockMapInteraction}>
	<button type="button" class="close" aria-label="Close industry tile inspector" onclick={onClose}
		>×</button
	>

	{#if !tile}
		<h2>Industry tile</h2>
		<p class="muted">No tile selected</p>
	{:else}
		<div class="heading">
			<div>
				<p>Industry tile</p>
				<h2>Industry Tile {tile.x}, {tile.y}</h2>
			</div>
			<span>{tileTerrain}</span>
		</div>

		<section aria-label="Industry tile stats">
			<dl>
				<div>
					<dt>Terrain</dt>
					<dd>{tileTerrain}</dd>
				</div>
				<div>
					<dt>Resource</dt>
					<dd>{tileResource}</dd>
				</div>
				<div>
					<dt>Coordinates</dt>
					<dd>{tile.x}, {tile.y}</dd>
				</div>
				<div>
					<dt>Access</dt>
					<dd>{tile.locked ? 'Locked' : 'Open'}</dd>
				</div>
			</dl>
		</section>

		{#if building && buildingType}
			<section aria-label="Industrial building details">
				<div class="building-heading">
					<h3>{buildingType.name}</h3>
					<span>{label(building.status)}</span>
				</div>
				<dl>
					<div>
						<dt>Status</dt>
						<dd>{label(building.status)}</dd>
					</div>
					<div>
						<dt>Produced total</dt>
						<dd>{building.producedTotal}</dd>
					</div>
					<div>
						<dt>Imported inputs</dt>
						<dd>{building.importedInputTotal}</dd>
					</div>
					<div>
						<dt>Blocked days</dt>
						<dd>{building.blockedDays}</dd>
					</div>
				</dl>

				<div class="production-log">
					<h4>Last production</h4>
					{#if building.lastProduction.length > 0}
						<ul>
							{#each building.lastProduction as movement (`${movement.materialId}-${movement.source}`)}
								<li>
									<span class="material-line">
										<img
											src={materialArtSrc(movement.materialId)}
											alt=""
											data-testid={`industry-production-material-${movement.materialId}`}
											width="24"
											height="24"
											loading="lazy"
											decoding="async"
										/>
										<span>{movementLabel(movement)}</span>
									</span>
									<small>{currency.format(movement.value)}</small>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="muted">No output yet</p>
					{/if}
				</div>
			</section>

			{#if building.typeId === 'warehouse'}
				<section aria-label="Warehouse summary">
					<h3>Warehouse</h3>
					<dl>
						<div>
							<dt>Capacity</dt>
							<dd>{game.warehouse.capacity}</dd>
						</div>
						<div>
							<dt>Used</dt>
							<dd>{warehouseUsed}</dd>
						</div>
						<div>
							<dt>Overflow units</dt>
							<dd>{game.warehouse.overflowUnits}</dd>
						</div>
						<div>
							<dt>Overflow cost</dt>
							<dd>{currency.format(game.warehouse.overflowCost)}</dd>
						</div>
					</dl>
					{#if warehouseMaterials.length > 0}
						<ul class="warehouse-materials" aria-label="Warehouse materials">
							{#each warehouseMaterials as material (material.id)}
								<li>
									<span class="material-line">
										<img
											src={materialArtSrc(material.id)}
											alt=""
											data-testid={`industry-warehouse-material-${material.id}`}
											width="24"
											height="24"
											loading="lazy"
											decoding="async"
										/>
										<span>{material.name}: {material.quantity}</span>
									</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="muted">No materials stored</p>
					{/if}
				</section>
			{/if}
		{:else if building}
			<section aria-label="Industrial building details">
				<h3>{label(building.typeId)}</h3>
				<p class="muted">Unknown building type</p>
			</section>
		{:else}
			<section aria-label="Industrial building choices">
				<h3>Build</h3>
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
				{#if constructionDisabledReason}
					<p class="disabled-copy">{constructionDisabledReason}</p>
				{/if}
				{#if visibleBuildingTypes.length > 0}
					<div class="build-actions">
						{#each visibleBuildingTypes as type (type.id)}
							{@const placementBlockReason = getBuildingPlacementBlockReason(type)}
							{@const isBuildDisabled = constructionDisabled || placementBlockReason !== null}
							<button
								type="button"
								disabled={isBuildDisabled}
								onclick={() => chooseBuilding(type)}
							>
								<img
									src={buildingArtSrc(type.id)}
									alt=""
									data-testid={`industry-building-option-${type.id}`}
									width="32"
									height="32"
									loading="lazy"
									decoding="async"
								/>
								<span>
									<span>Build {type.name}</span>
									<small>
										Cost {currency.format(type.buildCost)} · Operating {currency.format(
											type.dailyOperatingCost
										)}/day
									</small>
									{#if placementBlockReason && !constructionDisabledReason}
										<small class="block-reason">{placementBlockReason}</small>
									{/if}
								</span>
							</button>
						{/each}
					</div>
				{:else}
					<p class="muted">No industrial buildings available</p>
				{/if}
			</section>
		{/if}
	{/if}

	{#if pendingBuilding && pendingIsCurrent}
		<div class="confirm-backdrop" {@attach blockMapInteraction}>
			<div class="confirm-popup" role="dialog" aria-label="Confirm industrial build">
				<div class="confirm-heading">
					<div>
						<p>Confirm build</p>
						<h3>Build {pendingBuilding.name}?</h3>
					</div>
					<button
						type="button"
						class="confirm-close"
						aria-label="Cancel industrial build"
						onclick={cancelBuild}
					>
						×
					</button>
				</div>
				<div class="confirm-building">
					<span class="confirm-thumb">
						<img
							src={pendingBuildingArtSrc}
							alt=""
							data-testid={`industry-confirm-building-${pendingBuilding.id}`}
							width="96"
							height="96"
							loading="lazy"
							decoding="async"
						/>
					</span>
					<div>
						<p>{tileTerrain} · {tileResource}</p>
						<dl>
							<div>
								<dt>Cost</dt>
								<dd>{currency.format(pendingBuilding.buildCost)}</dd>
							</div>
							<div>
								<dt>Operating</dt>
								<dd>{currency.format(pendingBuilding.dailyOperatingCost)}/day</dd>
							</div>
							<div>
								<dt>Inputs</dt>
								<dd>{pendingRecipe ? recipeSummary(pendingRecipe.inputs) : 'None'}</dd>
							</div>
							<div>
								<dt>Output</dt>
								<dd>{pendingRecipe ? recipeSummary(pendingRecipe.outputs) : 'Storage capacity'}</dd>
							</div>
						</dl>
					</div>
				</div>
				<div class="confirm-actions">
					<button type="button" class="secondary" onclick={cancelBuild}>Cancel</button>
					<button type="button" class="primary" onclick={confirmBuild}>Confirm build</button>
				</div>
			</div>
		</div>
	{/if}
</aside>

{#if productFilterOpen}
	<button
		type="button"
		class="product-filter-backdrop"
		aria-label="Dismiss product chain filter"
		onclick={closeProductFilter}
	></button>
	<div
		class="product-filter-popup"
		role="dialog"
		aria-modal="true"
		aria-label="Product chain filter"
		{@attach blockMapInteraction}
	>
		<div class="filter-popup-heading">
			<h4>Product filter</h4>
			<button
				type="button"
				class="filter-close"
				aria-label="Close product chain filter"
				onclick={closeProductFilter}
			>
				×
			</button>
		</div>
		<label class="filter-search">
			<span>Search products</span>
			<input type="search" bind:value={productFilterSearch} />
		</label>
		<div class="filter-list">
			<button
				type="button"
				class:selected-filter={selectedProductFilterId === null}
				aria-pressed={selectedProductFilterId === null}
				onclick={() => selectProductFilter(null)}
			>
				<span>All products</span>
				<small>Buildable here</small>
			</button>
			{#each filteredProductFilters as filter (filter.id)}
				<button
					type="button"
					class:selected-filter={selectedProductFilterId === filter.id}
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

<style>
	.inspector {
		position: relative;
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
		height: min(37rem, calc(100dvh - 6.9rem));
		overflow: auto;
		border: 1px solid #33423a;
		border-radius: 8px;
		background: #17211b;
		padding: 1rem;
		box-shadow: 0 24px 70px rgb(0 0 0 / 0.38);
	}

	.close {
		position: absolute;
		top: 0.65rem;
		right: 0.65rem;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		padding: 0;
		text-align: center;
	}

	.heading,
	.building-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h2,
	h3,
	h4,
	p,
	dl,
	ul {
		margin: 0;
	}

	h2 {
		font-size: 1.2rem;
		line-height: 1.15;
	}

	h3 {
		font-size: 0.94rem;
	}

	h4 {
		font-size: 0.82rem;
	}

	.heading p,
	.muted,
	.disabled-copy,
	dt,
	small {
		color: #b7c3b2;
	}

	.heading p,
	.heading span,
	.building-heading span,
	dt,
	.muted,
	.disabled-copy,
	small {
		font-size: 0.78rem;
	}

	.heading span,
	.building-heading span {
		flex: 0 0 auto;
		border: 1px solid #53633d;
		border-radius: 999px;
		color: #d8ef9f;
		padding: 0.2rem 0.45rem;
	}

	section,
	.production-log {
		display: grid;
		gap: 0.75rem;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	dd {
		margin: 0.18rem 0 0;
		font-weight: 750;
	}

	.build-actions {
		display: grid;
		gap: 0.5rem;
	}

	.product-filter {
		display: flex;
		gap: 0.4rem;
		align-items: stretch;
	}

	.filter-trigger {
		min-width: 0;
	}

	.filter-clear,
	.filter-close {
		flex: 0 0 auto;
		width: 2rem;
		padding: 0;
		text-align: center;
	}

	.product-filter-backdrop {
		position: fixed;
		inset: 0;
		z-index: 70;
		width: auto;
		border: 0;
		border-radius: 0;
		background: rgb(8 12 10 / 0.58);
		padding: 0;
		text-align: initial;
		backdrop-filter: blur(3px);
	}

	.product-filter-popup {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 80;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		gap: 0.65rem;
		width: min(28rem, calc(100vw - 2rem));
		max-height: min(32rem, calc(100dvh - 2rem));
		overflow: hidden;
		border: 1px solid #53633d;
		border-radius: 8px;
		background: #17211b;
		padding: 0.75rem;
		box-shadow: 0 18px 50px rgb(0 0 0 / 0.45);
		transform: translate(-50%, -50%);
	}

	.filter-popup-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.filter-search {
		display: grid;
		gap: 0.3rem;
	}

	.filter-search span {
		color: #b7c3b2;
		font-size: 0.78rem;
	}

	.filter-search input {
		width: 100%;
		border: 1px solid #4c5a50;
		border-radius: 6px;
		background: #101811;
		color: #f3f8ea;
		padding: 0.55rem 0.65rem;
		font: inherit;
	}

	.filter-search input:focus {
		border-color: #b7d96e;
		outline: none;
	}

	.filter-list {
		display: grid;
		gap: 0.4rem;
		min-height: 0;
		overflow: auto;
	}

	.filter-list button {
		display: grid;
		gap: 0.2rem;
		padding: 0.55rem 0.65rem;
	}

	.selected-filter {
		border-color: #b7d96e;
		background: #3a4f2a;
		color: #f6ffd8;
	}

	button {
		width: 100%;
		border: 1px solid #4c5a50;
		border-radius: 6px;
		background: #223027;
		color: #f3f8ea;
		padding: 0.65rem 0.75rem;
		text-align: left;
	}

	.build-actions button {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.build-actions img {
		flex: 0 0 auto;
		width: 2rem;
		height: 2rem;
		object-fit: contain;
	}

	.build-actions button > span {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}

	.block-reason {
		color: #efc1a4;
	}

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		border-color: #b7d96e;
		background: #2d3d2a;
		outline: none;
	}

	.product-filter-backdrop:hover:not(:disabled),
	.product-filter-backdrop:focus-visible:not(:disabled) {
		border-color: transparent;
		background: rgb(8 12 10 / 0.58);
		outline: none;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	ul {
		display: grid;
		gap: 0.4rem;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
		border: 1px solid #304236;
		border-radius: 6px;
		background: #1d2922;
		padding: 0.48rem 0.55rem;
	}

	.warehouse-materials li {
		justify-content: flex-start;
	}

	.material-line {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}

	.material-line img {
		flex: 0 0 auto;
		width: 1.5rem;
		height: 1.5rem;
		object-fit: contain;
	}

	.confirm-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(8 12 10 / 0.72);
		z-index: 60;
	}

	.confirm-popup {
		display: grid;
		gap: 0.75rem;
		width: min(100%, 24rem);
		border: 1px solid #53633d;
		border-radius: 8px;
		background: #17211b;
		padding: 0.85rem;
		box-shadow: 0 18px 50px rgb(0 0 0 / 0.45);
	}

	.confirm-heading,
	.confirm-building,
	.confirm-actions {
		display: flex;
		gap: 0.75rem;
	}

	.confirm-heading {
		align-items: flex-start;
		justify-content: space-between;
	}

	.confirm-heading p,
	.confirm-building p {
		margin: 0 0 0.2rem;
		color: #b7c3b2;
		font-size: 0.76rem;
	}

	.confirm-close {
		flex: 0 0 auto;
		width: 1.9rem;
		height: 1.9rem;
		border-radius: 999px;
		padding: 0;
		text-align: center;
	}

	.confirm-building {
		align-items: center;
	}

	.confirm-thumb {
		display: block;
		flex: 0 0 5rem;
		aspect-ratio: 1;
		overflow: hidden;
		border: 1px solid #3f4a42;
		border-radius: 6px;
		background: #e5eadb;
	}

	.confirm-thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.confirm-building dl {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.confirm-actions {
		justify-content: flex-end;
	}

	.confirm-actions button {
		width: auto;
		min-width: 7rem;
		text-align: center;
	}

	.confirm-actions .primary {
		border-color: #b7d96e;
		background: #455d2a;
	}
</style>
