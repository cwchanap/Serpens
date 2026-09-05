<script lang="ts">
	import { asset } from '$app/paths';
	import { getIndustrialBuildingArt, getIndustryMaterialArt } from '$lib/assets/gameArt';
	import { getCityInventoryStats } from '$lib/game/cityInventory';
	import { INDUSTRIAL_BUILDING_TYPES, PRODUCTION_RECIPES } from '$lib/game/industry';
	import {
		MAX_BUILDING_LEVEL,
		canUpgradeBuilding,
		getBuildingThroughputMultiplier,
		getBuildingUpgradeCost
	} from '$lib/game/leveling';
	import type { I18nBundle } from '$lib/i18n';
	import type { TranslationKey } from '$lib/i18n/translate';
	import type {
		DailyMaterialMovement,
		GameState,
		IndustrialBuilding,
		IndustrialBuildingStatus,
		IndustryTile,
		MaterialId
	} from '$lib/game/types';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';

	interface Props {
		game: GameState;
		tile: IndustryTile | null;
		building: IndustrialBuilding | null;
		i18n: I18nBundle;
		onClose: () => void;
		onUpgradeBuilding?: (buildingId: string) => void;
		canUpgradeBuilding?: boolean;
		disabledReason?: string | null;
	}

	interface CityInventoryMaterialRow {
		id: MaterialId;
		name: string;
		quantity: number;
	}

	let {
		game,
		tile,
		building,
		i18n,
		onClose,
		onUpgradeBuilding = () => {},
		canUpgradeBuilding: upgradeAllowed = true,
		disabledReason = null
	}: Props = $props();

	const buildingType = $derived(building ? INDUSTRIAL_BUILDING_TYPES[building.typeId] : null);
	const tileTerrain = $derived(
		tile ? i18n.labels.industryTerrain(tile.terrain) : i18n.t('industryTileInspector.unknown')
	);
	const tileResource = $derived(
		tile?.resource
			? i18n.labels.industryResource(tile.resource)
			: i18n.t('industryTileInspector.none')
	);
	const cityInventoryStats = $derived(
		building?.typeId === 'warehouse' ? getCityInventoryStats(game, building.cityId) : null
	);
	const cityInventoryMaterials = $derived.by(() => getCityInventoryMaterialRows());
	const cityInventoryCityName = $derived(
		building ? i18n.labels.worldCity(building.cityId).name : i18n.t('industryTileInspector.unknown')
	);
	const bufferMaterials = $derived.by(() => getBufferMaterialRows());
	const buildingUpgradeCost = $derived(building ? getBuildingUpgradeCost(building.level) : 0);
	const buildingCanUpgrade = $derived(
		building && buildingType?.recipeId ? canUpgradeBuilding(building.level) : false
	);
	const canAffordBuildingUpgrade = $derived(building ? game.cash >= buildingUpgradeCost : false);
	const throughput = $derived(building ? getBuildingThroughputMultiplier(building.level) : 1);
	const recipe = $derived(
		building && buildingType?.recipeId ? (PRODUCTION_RECIPES[buildingType.recipeId] ?? null) : null
	);
	const lastProductionUnits = $derived(
		building ? building.lastProduction.reduce((total, movement) => total + movement.quantity, 0) : 0
	);
	const bufferUnits = $derived(
		bufferMaterials.reduce((total, material) => total + material.quantity, 0)
	);
	const isWarningStatus = $derived(
		building ? building.status === 'stalled' || building.status === 'blocked' : false
	);

	function getCityInventoryMaterialRows(): CityInventoryMaterialRow[] {
		if (!building || building.typeId !== 'warehouse') {
			return [];
		}
		const cityInventory = game.cityInventories.find(
			(inventory) => inventory.cityId === building.cityId
		)!;

		return Object.entries(cityInventory.materials)
			.map(([materialId, quantity]) => ({
				id: materialId as MaterialId,
				name: i18n.labels.material(materialId),
				quantity: quantity ?? 0
			}))
			.filter((material) => material.quantity > 0)
			.sort((first, second) => first.name.localeCompare(second.name));
	}

	// The building's own production buffer (as opposed to the shared city
	// inventory). Sorted by material id (plain string comparison — not
	// localeCompare) to keep row order deterministic across locales.
	function getBufferMaterialRows(): CityInventoryMaterialRow[] {
		if (!building) {
			return [];
		}

		return Object.entries(building.inventory)
			.map(([materialId, quantity]) => ({
				id: materialId as MaterialId,
				name: i18n.labels.material(materialId),
				quantity: quantity ?? 0
			}))
			.filter((material) => material.quantity > 0)
			.sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
	}

	function movementLabel(movement: DailyMaterialMovement): string {
		return `${materialName(movement.materialId)}: ${i18n.format.integer(movement.quantity)}`;
	}

	function materialName(materialId: MaterialId): string {
		return i18n.labels.material(materialId);
	}

	function materialArtSrc(materialId: MaterialId): string {
		return asset(getIndustryMaterialArt(materialId));
	}

	function buildingArtSrc(typeId: IndustrialBuilding['typeId']): string {
		return asset(getIndustrialBuildingArt(typeId));
	}

	const INDUSTRIAL_BUILDING_STATUS_KEYS: Record<IndustrialBuildingStatus, TranslationKey> = {
		idle: 'industryTileInspector.status.idle',
		produced: 'industryTileInspector.status.produced',
		'imported-inputs': 'industryTileInspector.status.imported-inputs',
		stalled: 'industryTileInspector.status.stalled',
		blocked: 'industryTileInspector.status.blocked'
	};

	function buildingStatusLabel(status: IndustrialBuilding['status']): string {
		return i18n.t(INDUSTRIAL_BUILDING_STATUS_KEYS[status]);
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

<aside
	class="inspector"
	aria-label={i18n.t('industryTileInspector.ariaLabel')}
	{@attach blockMapInteraction}
>
	<button
		type="button"
		class="close"
		aria-label={i18n.t('industryTileInspector.close')}
		onclick={onClose}>×</button
	>

	{#if !tile}
		<h2>{i18n.t('industryTileInspector.emptyTitle')}</h2>
		<p class="muted">{i18n.t('industryTileInspector.noTileSelected')}</p>
	{:else}
		<div class="heading">
			<div>
				<p>{i18n.t('industryTileInspector.eyebrow')}</p>
				<h2>{i18n.t('industryTileInspector.heading', { x: tile.x, y: tile.y })}</h2>
			</div>
			<span>{tileTerrain}</span>
		</div>

		<section aria-label={i18n.t('industryTileInspector.statsAria')}>
			<dl>
				<div>
					<dt>{i18n.t('industryTileInspector.terrain')}</dt>
					<dd>{tileTerrain}</dd>
				</div>
				<div>
					<dt>{i18n.t('industryTileInspector.resource')}</dt>
					<dd>{tileResource}</dd>
				</div>
				<div>
					<dt>{i18n.t('industryTileInspector.coordinates')}</dt>
					<dd>{tile.x}, {tile.y}</dd>
				</div>
				<div>
					<dt>{i18n.t('industryTileInspector.access')}</dt>
					<dd>
						{tile.locked
							? i18n.t('industryTileInspector.locked')
							: i18n.t('industryTileInspector.open')}
					</dd>
				</div>
			</dl>
		</section>

		{#if building && buildingType}
			<section aria-label={i18n.t('industryTileInspector.detailsAria')}>
				<div class="ops-header">
					<img
						class="building-thumbnail"
						src={buildingArtSrc(building.typeId)}
						alt=""
						data-testid={`industry-building-thumbnail-${building.typeId}`}
						width="96"
						height="96"
						loading="lazy"
						decoding="async"
					/>
					<div>
						<p class="ops-eyebrow">{cityInventoryCityName} · {tile?.x},{tile?.y}</p>
						<h3 class="ops-name">{i18n.labels.industrialBuilding(building.typeId)}</h3>
						<span class="ops-status" class:warning={isWarningStatus}>
							{buildingStatusLabel(building.status)}
						</span>
					</div>
				</div>

				{#if recipe}
					<div class="recipe-strip">
						{#each recipe.inputs as input (input.materialId)}
							<span class="recipe-chip">
								<img src={materialArtSrc(input.materialId)} alt="" width="28" height="28" />
								{i18n.labels.material(input.materialId)} ×{i18n.format.integer(input.quantity)}
							</span>
							<span class="recipe-arrow" aria-hidden="true">→</span>
						{/each}
						{#each recipe.outputs as output (output.materialId)}
							<span class="recipe-chip out">
								<img src={materialArtSrc(output.materialId)} alt="" width="28" height="28" />
								{i18n.labels.material(output.materialId)} ×{i18n.format.integer(output.quantity)}
							</span>
						{/each}
					</div>
				{/if}

				<div class="gauge-row" aria-hidden="true">
					<div class="gauge">
						<span class="gauge-value">{i18n.format.integer(bufferUnits)}</span>
						<span class="gauge-label">{i18n.t('industryTileInspector.buffer')}</span>
					</div>
					<div class="gauge">
						<span class="gauge-value">{i18n.format.integer(lastProductionUnits)}</span>
						<span class="gauge-label">{i18n.t('industryTileInspector.lastProduction')}</span>
					</div>
					<div class="gauge" class:warning={building.blockedDays > 0}>
						<span class="gauge-value">{i18n.format.integer(building.blockedDays)}</span>
						<span class="gauge-label">{i18n.t('industryTileInspector.blockedDays')}</span>
					</div>
				</div>

				<dl>
					<div>
						<dt>{i18n.t('industryTileInspector.statusLabel')}</dt>
						<dd>{buildingStatusLabel(building.status)}</dd>
					</div>
					<div>
						<dt>{i18n.t('industryTileInspector.producedTotal')}</dt>
						<dd>{i18n.format.integer(building.producedTotal)}</dd>
					</div>
					<div>
						<dt>{i18n.t('industryTileInspector.importedInputs')}</dt>
						<dd>{i18n.format.integer(building.importedInputTotal)}</dd>
					</div>
					<div>
						<dt>{i18n.t('industryTileInspector.blockedDays')}</dt>
						<dd>{i18n.format.integer(building.blockedDays)}</dd>
					</div>
				</dl>

				<div class="building-level">
					<p class="level-label">
						{i18n.t('industryTileInspector.level', {
							level: i18n.format.integer(building.level),
							max: i18n.format.integer(MAX_BUILDING_LEVEL)
						})}
					</p>
					{#if buildingType.recipeId}
						<p class="level-next">
							{i18n.t('industryTileInspector.output', { multiplier: throughput.toFixed(1) })}
						</p>
						<button
							type="button"
							class="upgrade"
							disabled={!upgradeAllowed || !buildingCanUpgrade || !canAffordBuildingUpgrade}
							onclick={() => {
								if (upgradeAllowed) onUpgradeBuilding(building.id);
							}}
						>
							{buildingCanUpgrade
								? i18n.t('industryTileInspector.upgrade', {
										cost: i18n.format.currency(buildingUpgradeCost)
									})
								: i18n.t('industryTileInspector.maxLevel')}
						</button>
						{#if buildingCanUpgrade && !canAffordBuildingUpgrade}
							<p class="level-hint">{i18n.t('industryTileInspector.notEnoughCash')}</p>
						{/if}
						{#if !upgradeAllowed && disabledReason}
							<p class="level-hint">{disabledReason}</p>
						{/if}
					{/if}
				</div>

				{#if isWarningStatus}
					<p class="warning-strip" role="status">
						<span class="warning-dot" aria-hidden="true">!</span>
						{buildingStatusLabel(building.status)}
						{#if building.blockedDays > 0}
							· {i18n.t('industryTileInspector.blockedDays')}
							{i18n.format.integer(building.blockedDays)}
						{/if}
					</p>
				{/if}

				<div class="production-log">
					<h4>{i18n.t('industryTileInspector.lastProduction')}</h4>
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
									<small>{i18n.format.currency(movement.value)}</small>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="muted">{i18n.t('industryTileInspector.noOutputYet')}</p>
					{/if}
				</div>
			</section>

			<section aria-label={i18n.t('industryTileInspector.buffer')}>
				<h3>{i18n.t('industryTileInspector.buffer')}</h3>
				{#if bufferMaterials.length > 0}
					<ul class="warehouse-materials" aria-label={i18n.t('industryTileInspector.buffer')}>
						{#each bufferMaterials as material (material.id)}
							<li>
								<span class="material-line">
									<img
										src={materialArtSrc(material.id)}
										alt=""
										data-testid={`industry-buffer-material-${material.id}`}
										width="24"
										height="24"
										loading="lazy"
										decoding="async"
									/>
									<span>{material.name}: {i18n.format.integer(material.quantity)}</span>
								</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted">{i18n.t('industryTileInspector.noBufferMaterials')}</p>
				{/if}
			</section>

			{#if building.typeId === 'warehouse'}
				<section
					aria-label={i18n.t('industryTileInspector.cityInventorySummary', {
						cityName: cityInventoryCityName
					})}
				>
					<h3>{i18n.t('industryTileInspector.warehouseBuilding')}</h3>
					<p class="inventory-timing">{i18n.t('industryTileInspector.currentCityInventory')}</p>
					{#if cityInventoryStats}
						<dl>
							<div>
								<dt>{i18n.t('industryTileInspector.capacity')}</dt>
								<dd>{i18n.format.integer(cityInventoryStats.capacity)}</dd>
							</div>
							<div>
								<dt>{i18n.t('industryTileInspector.used')}</dt>
								<dd>{i18n.format.integer(cityInventoryStats.used)}</dd>
							</div>
							<div>
								<dt>{i18n.t('industryTileInspector.overflowUnits')}</dt>
								<dd>{i18n.format.integer(cityInventoryStats.overflowUnits)}</dd>
							</div>
							<div>
								<dt>{i18n.t('industryTileInspector.overflowCost')}</dt>
								<dd>{i18n.format.currency(cityInventoryStats.overflowCost)}</dd>
							</div>
						</dl>
						{#if cityInventoryStats.capacity === 0}
							<p class="inventory-state">
								{i18n.t('industryTileInspector.cityInventoryZeroCapacity')}
							</p>
						{/if}
						{#if cityInventoryStats.overflowUnits > 0}
							<p class="inventory-state">
								{i18n.t('industryTileInspector.cityInventoryOverflow', {
									units: i18n.format.integer(cityInventoryStats.overflowUnits)
								})}
							</p>
						{/if}
						{#if cityInventoryMaterials.length > 0}
							<ul
								class="warehouse-materials"
								aria-label={i18n.t('industryTileInspector.cityInventoryMaterials')}
							>
								{#each cityInventoryMaterials as material (material.id)}
									<li>
										<span class="material-line">
											<img
												src={materialArtSrc(material.id)}
												alt=""
												data-testid={`industry-city-inventory-material-${material.id}`}
												width="24"
												height="24"
												loading="lazy"
												decoding="async"
											/>
											<span>{material.name}: {i18n.format.integer(material.quantity)}</span>
										</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="muted">{i18n.t('industryTileInspector.cityInventoryEmpty')}</p>
						{/if}
					{/if}
				</section>
			{/if}
		{:else if building}
			<section aria-label={i18n.t('industryTileInspector.detailsAria')}>
				<h3>{i18n.labels.industrialBuilding(building.typeId)}</h3>
				<p class="muted">{i18n.t('industryTileInspector.unknownBuildingType')}</p>
			</section>
		{/if}
	{/if}
</aside>

<style>
	.inspector {
		position: relative;
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
		padding: 1rem 1.1rem 1.1rem;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background-color: var(--paper-100);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		color: var(--ink-700);
		box-shadow:
			inset 0 0 0 2px var(--paper-100),
			inset 0 0 0 3px var(--brass-500),
			var(--shadow-paper);
	}

	.close {
		position: absolute;
		top: 0.7rem;
		right: 0.7rem;
		width: 1.9rem;
		height: 1.9rem;
		padding: 0;
		border: 1px solid var(--ink-700);
		border-radius: 999px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
		text-align: center;
	}

	.close:hover {
		background: var(--paper-200);
	}

	.heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding-right: 2.2rem;
	}

	h2,
	h3,
	p,
	dl {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		line-height: 1.1;
		color: var(--ink-700);
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.heading p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	dt {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.heading span {
		flex: 0 0 auto;
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		color: var(--ink-700);
		background: var(--paper-50);
		padding: 0.2rem 0.55rem;
		font-family: var(--font-ui);
		font-size: 0.74rem;
		font-weight: 600;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.6rem;
	}

	dd {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.ops-header {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		column-gap: 0.7rem;
	}

	.ops-eyebrow {
		margin: 0;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.ops-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.45rem;
		font-weight: 400;
		color: var(--ink-900);
	}

	.ops-status {
		display: inline-block;
		margin-top: 0.15rem;
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		color: var(--brass-700);
		background: var(--paper-50);
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.ops-status.warning {
		border-color: var(--wax-red);
		color: var(--wax-red);
	}

	.recipe-strip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid color-mix(in srgb, var(--brass-500) 60%, transparent);
		background: var(--paper-50);
		padding: 0.45rem 0.55rem;
	}

	.recipe-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 700;
	}

	.recipe-chip img {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}

	.recipe-chip.out {
		color: var(--ink-900);
	}

	.recipe-arrow {
		color: var(--brass-700);
		font-family: var(--font-mono);
		font-weight: 700;
	}

	.gauge-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.gauge {
		display: grid;
		justify-items: center;
		gap: 0.15rem;
		border: 2px solid var(--brass-500);
		border-radius: 999px;
		background: var(--paper-50);
		padding: 0.6rem 0.3rem 0.45rem;
		box-shadow: var(--shadow-paper);
	}

	.gauge.warning {
		border-color: var(--wax-red);
	}

	.gauge-value {
		font-family: var(--font-mono);
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--ink-900);
	}

	.gauge.warning .gauge-value {
		color: var(--wax-red);
	}

	.gauge-label {
		max-width: 100%;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.warning-strip {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		border: 1px solid color-mix(in srgb, var(--wax-red) 55%, transparent);
		background: color-mix(in srgb, var(--wax-red) 10%, var(--paper-50));
		color: var(--ink-700);
		padding: 0.45rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.warning-dot {
		display: inline-grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 999px;
		background: var(--wax-red);
		color: var(--paper-50);
		font-size: 0.8rem;
	}

	h4 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.muted,
	small {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.82rem;
	}

	.inventory-timing,
	.inventory-state {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.82rem;
	}

	.inventory-state {
		color: var(--brass-700);
		font-weight: 600;
	}

	section,
	.production-log {
		display: grid;
		gap: 0.75rem;
	}

	.building-thumbnail {
		display: block;
		width: 4.5rem;
		aspect-ratio: 1;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		object-fit: contain;
	}

	button {
		width: 100%;
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		padding: 0.65rem 0.75rem;
		font-family: var(--font-ui);
		text-align: left;
	}

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		background: var(--paper-200);
		outline: none;
	}

	ul {
		display: grid;
		gap: 0.4rem;
		padding: 0;
		margin: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
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

	.building-level {
		display: grid;
		gap: 0.4rem;
	}

	.level-label {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--ink-700);
		margin: 0;
	}

	.level-next {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--ink-500);
		margin: 0;
	}

	.level-hint {
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--ink-500);
		margin: 0;
	}

	.upgrade {
		padding: 0.45rem 0.85rem;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}

	.upgrade:hover:not(:disabled) {
		background: var(--paper-200);
	}

	.upgrade:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
