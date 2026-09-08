<script lang="ts">
	import { asset } from '$app/paths';
	import HudIcon from './HudIcon.svelte';
	import { quoteInterCityRates, type RecurringRouteInput } from '$lib/game/interCityLogistics';
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
		onAddRoute?: (preset: RecurringRouteInput) => void;
		onDemolishBuilding?: (buildingId: string) => void;
		canDemolishBuilding?: boolean;
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
		onAddRoute,
		onDemolishBuilding,
		canDemolishBuilding = false,
		canUpgradeBuilding: upgradeAllowed = true,
		disabledReason = null
	}: Props = $props();

	const buildingType = $derived(building ? INDUSTRIAL_BUILDING_TYPES[building.typeId] : null);
	const recipe = $derived(
		buildingType?.recipeId ? PRODUCTION_RECIPES[buildingType.recipeId] : null
	);
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
	const outputCapacity = $derived(
		recipe?.outputs.reduce((sum, output) => sum + Math.round(output.quantity * throughput), 0) ?? 0
	);
	const recentOutput = $derived(
		building?.lastProduction.reduce((sum, output) => sum + output.quantity, 0) ?? 0
	);
	const utilization = $derived(outputCapacity > 0 ? Math.min(1, recentOutput / outputCapacity) : 0);
	const shippingRoutes = $derived(
		game.logistics.recurringRoutes.filter(
			(route) =>
				route.originCityId === building?.cityId &&
				recipe?.outputs.some((output) => output.materialId === route.materialId)
		)
	);
	const routePreset = $derived.by((): RecurringRouteInput | null => {
		const output = recipe?.outputs[0];
		const origin = game.cityInventories.find((city) => city.cityId === building?.cityId);
		const destination = game.cityInventories.find(
			(city) => origin && city.cityId !== origin.cityId
		);
		if (!origin || !destination || !output) return null;
		const quote = quoteInterCityRates(origin.cityId, destination.cityId);
		return quote
			? {
					originCityId: origin.cityId,
					destinationCityId: destination.cityId,
					materialId: output.materialId,
					capacity: Math.max(1, Math.round(output.quantity * throughput)),
					frequencyDays: 1,
					priority: 0,
					...quote
				}
			: null;
	});
	const gauges = $derived([
		{
			label: i18n.t('industryTileInspector.utilization'),
			value: i18n.format.percent(utilization),
			ratio: utilization,
			icon: 'dashboard' as const
		},
		{
			label: i18n.t('industryTileInspector.recentOutput'),
			value: i18n.format.integer(recentOutput),
			ratio: utilization,
			icon: 'inventory' as const
		},
		{
			label: i18n.t('industryTileInspector.baseUpkeep'),
			value: i18n.format.currency(buildingType?.dailyOperatingCost ?? 0),
			ratio: 1,
			icon: 'finance' as const
		}
	]);

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
	class:occupied={!!building}
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

		<details class="tile-facts" open={!building}>
			<summary>{tileTerrain} · {tile.x}, {tile.y}</summary>
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
		</details>
		{#if building && buildingType}
			<section aria-label={i18n.t('industryTileInspector.detailsAria')}>
				<div class="building-heading">
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
					<h3>{i18n.labels.industrialBuilding(building.typeId)}</h3>
					<span class="building-status">{buildingStatusLabel(building.status)}</span>
					<span
						class="level-seal"
						style:--building-level={building.level}
						role="img"
						aria-label={i18n.t('industryTileInspector.level', {
							level: i18n.format.integer(building.level),
							max: i18n.format.integer(MAX_BUILDING_LEVEL)
						})}
					></span>
				</div>

				{#if recipe}<div class="recipe-strip">
						{#each recipe.inputs as input (input.materialId)}<div>
								<img
									src={materialArtSrc(input.materialId)}
									alt={materialName(input.materialId)}
									width="44"
									height="44"
								/><small>{Math.round(input.quantity * throughput)}</small>
							</div>{/each}
						<span aria-hidden="true">→</span>
						{#each recipe.outputs as output (output.materialId)}<div>
								<img
									src={materialArtSrc(output.materialId)}
									alt={materialName(output.materialId)}
									width="44"
									height="44"
								/><small>{Math.round(output.quantity * throughput)}</small>
							</div>{/each}
					</div>{/if}

				{#if recipe}
					<div class="factory-gauges">
						{#each gauges as gauge (gauge.icon)}
							<div
								class="factory-gauge"
								title={`${gauge.label}: ${gauge.value}`}
								aria-label={`${gauge.label}: ${gauge.value}`}
							>
								<svg viewBox="0 0 72 46" aria-hidden="true">
									<path class="gauge-track" d="M8 40a28 28 0 0 1 56 0" />
									{#if gauge.ratio > 0}<path
											class="gauge-value"
											d="M8 40a28 28 0 0 1 56 0"
											pathLength="100"
											stroke-dasharray={`${gauge.ratio * 100} 100`}
										/>{/if}
									<text x="36" y="38">{gauge.value}</text>
								</svg>
								<HudIcon name={gauge.icon} />
							</div>
						{/each}
					</div>
					<div class="shipping-summary">
						<span>{i18n.t('industryTileInspector.cityShipping')}</span>
						<div class="shipping-destinations">
							<img
								src={buildingArtSrc('warehouse')}
								alt={i18n.labels.industrialBuilding('warehouse')}
								width="34"
								height="34"
							/>
							{#each shippingRoutes as route (route.id)}<span
									class="destination"
									title={`${i18n.labels.worldCity(route.destinationCityId).name} · ${i18n.labels.material(route.materialId)} · ${route.state}`}
									><HudIcon name="world" /></span
								>{/each}
						</div>
						<small
							>{i18n.t('industryTileInspector.routeCount', {
								count: i18n.format.integer(shippingRoutes.length)
							})}</small
						>
					</div>
				{/if}

				<div class="building-level">
					{#if buildingType.recipeId}
						<div class="factory-actions">
							<button
								type="button"
								class="upgrade"
								aria-label={buildingCanUpgrade
									? i18n.t('industryTileInspector.upgrade', {
											cost: i18n.format.currency(buildingUpgradeCost)
										})
									: i18n.t('industryTileInspector.maxLevel')}
								disabled={!upgradeAllowed || !buildingCanUpgrade || !canAffordBuildingUpgrade}
								onclick={() => {
									if (upgradeAllowed) onUpgradeBuilding(building.id);
								}}
							>
								{#if buildingCanUpgrade}
									<svg viewBox="0 0 24 24" aria-hidden="true"
										><path d="M12 19V5 M5 12l7-7 7 7" /></svg
									>
									{i18n.format.currency(buildingUpgradeCost)}
								{:else}{i18n.t('industryTileInspector.maxLevel')}{/if}
							</button>
							<button
								type="button"
								class="add-route"
								aria-label={i18n.t('industryTileInspector.addRoute')}
								title={i18n.t(
									routePreset
										? 'industryTileInspector.addRoute'
										: 'industryTileInspector.routeNeedsCity'
								)}
								disabled={!routePreset || !onAddRoute}
								onclick={() => {
									if (routePreset) onAddRoute?.(routePreset);
								}}><HudIcon name="logistics" /></button
							>
							<button
								type="button"
								class="demolish"
								aria-label={i18n.t('industryTileInspector.demolish')}
								title={i18n.t('industryTileInspector.demolish')}
								disabled={!canDemolishBuilding || !onDemolishBuilding}
								onclick={() => {
									if (
										canDemolishBuilding &&
										onDemolishBuilding &&
										window.confirm(i18n.t('industryTileInspector.confirmDemolish'))
									)
										onDemolishBuilding(building.id);
								}}><HudIcon name="demolish" /></button
							>
						</div>
						{#if buildingCanUpgrade && !canAffordBuildingUpgrade}
							<p class="level-hint">{i18n.t('industryTileInspector.notEnoughCash')}</p>
						{/if}
						{#if !upgradeAllowed && disabledReason}
							<p class="level-hint">{disabledReason}</p>
						{/if}
					{/if}
				</div>

				<details class="production-log">
					<summary title={i18n.t('industryTileInspector.lastProduction')}
						><span>{i18n.t('industryTileInspector.lastProduction')}</span></summary
					>

					<p class="level-label">
						{i18n.t('industryTileInspector.level', {
							level: i18n.format.integer(building.level),
							max: i18n.format.integer(MAX_BUILDING_LEVEL)
						})}
					</p>
					{#if recipe}<p class="level-next">
							{i18n.t('industryTileInspector.output', { multiplier: throughput.toFixed(1) })}
						</p>{/if}
					<dl class="production-metrics">
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
				</details>
			</section>

			<details class="buffer-details">
				<summary title={i18n.t('industryTileInspector.buffer')}
					><span>{i18n.t('industryTileInspector.buffer')}</span></summary
				>
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
			</details>

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

	.building-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.building-heading span {
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
	.tile-facts summary {
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--brass-700);
	}
	.tile-facts section {
		margin-top: 0.7rem;
	}
	.building-thumbnail {
		width: 100%;
		height: 8rem;
		object-fit: contain;
		background-color: var(--paper-200);
	}
	.building-heading h3 {
		font-size: 1.4rem;
	}
	.upgrade {
		background: var(--moss);
		color: var(--paper-50);
	}
	.upgrade:hover:not(:disabled) {
		background: var(--moss-2);
	}
	dl > div {
		border-bottom: 2px solid var(--paper-300);
		padding: 0.4rem;
		background: var(--paper-50);
	}

	.occupied {
		gap: 0.65rem;
		padding: 0.9rem;
	}
	.occupied > .heading {
		display: none;
	}
	.occupied .building-heading {
		display: flex;
		align-items: center;
		gap: 0.25rem 0.65rem;
	}
	.occupied .building-heading h3 {
		flex: 1;
		padding-top: 18px;
		font-size: 24px;
		line-height: 1.1;
	}
	.occupied .building-status {
		grid-column: 2;
		justify-self: start;
	}
	.occupied .level-seal {
		grid-column: 3;
		grid-row: 1 / span 2;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		background: var(--wax-red);
		color: var(--paper-50);
		font: 17px var(--font-display);
		counter-reset: building-level var(--building-level);
	}
	.level-seal::after {
		content: counter(building-level, upper-roman);
	}
	.occupied .building-thumbnail {
		grid-row: 1 / span 2;
		width: 68px;
		height: 68px;
		border-radius: 50%;
		padding: 0;
	}
	.recipe-strip {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin: 4px 0;
		padding: 0.6rem;
		background: var(--paper-50);
	}
	.recipe-strip > div {
		position: relative;
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-200);
	}
	.recipe-strip small {
		position: absolute;
		right: -4px;
		bottom: -4px;
		min-width: 20px;
		height: 20px;
		padding: 0 3px;
		border-radius: 20px;
		background: var(--moss);
		color: var(--paper-50);
		font: 700 11px/20px var(--font-mono);
		text-align: center;
	}
	.recipe-strip img {
		object-fit: contain;
		width: 2.75rem;
		height: 2.75rem;
	}
	.occupied .building-level {
		padding: 0;
	}
	.occupied .production-log {
		font-size: 0.8rem;
	}
	.occupied {
		gap: 0.5rem;
		padding: 0.7rem;
	}
	.occupied > section {
		gap: 0.5rem;
	}
	.production-metrics {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.3rem;
	}
	.production-metrics > div:first-child {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.production-metrics > div {
		padding: 0.4rem;
		text-align: center;
	}
	.production-metrics dt {
		font-size: 0.55rem;
		letter-spacing: 0.05em;
	}
	.production-metrics dd {
		margin: 0.4rem auto 0;
		width: 2.6rem;
		height: 2.6rem;
		display: grid;
		place-items: center;
		border: 2px solid var(--brass-500);
		border-radius: 50%;
	}
	.occupied .recipe-strip {
		padding: 12px;
		gap: 10px;
		border: 1px solid var(--brass-500);
	}
	.building-level {
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: 0.25rem;
	}
	.factory-actions,
	.level-hint {
		grid-column: 1 / -1;
	}
	.production-log summary,
	.buffer-details summary {
		cursor: pointer;
		color: var(--brass-700);
		font: 0.75rem var(--font-ui);
		padding: 0.25rem 0;
	}
	.production-log[open] > *,
	.buffer-details[open] > * {
		margin-bottom: 0.5rem;
	}
	.factory-gauges {
		display: flex;
		gap: 10px;
	}
	.factory-gauge {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 10px 6px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
	}
	.factory-gauge > svg {
		width: 72px;
		height: 46px;
		max-width: 100%;
	}
	.factory-gauge :global(svg:not(:first-child)) {
		width: 16px;
		height: 16px;
		color: var(--brass-700);
	}
	.factory-gauge path {
		fill: none;
		stroke-width: 7px;
		stroke-linecap: round;
	}
	.gauge-track {
		stroke: var(--paper-300);
	}
	.gauge-value {
		stroke: var(--moss);
	}
	.factory-gauge:first-child .gauge-value {
		stroke: var(--brass-700);
	}
	.factory-gauge:last-child .gauge-value {
		stroke: var(--wax-red);
	}
	.factory-gauge text {
		fill: var(--ink-700);
		text-anchor: middle;
		font: 400 16px var(--font-mono);
	}
	.shipping-summary {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		min-width: 0;
		align-items: center;
		gap: 10px;
		padding: 9px 11px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
	}
	.shipping-summary > span:first-child {
		font: 700 10px var(--font-ui);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--brass-700);
	}
	.shipping-destinations {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		overflow-x: auto;
	}
	.shipping-destinations > * {
		flex-shrink: 0;
	}
	.shipping-summary img {
		object-fit: contain;
	}
	.shipping-summary small {
		white-space: nowrap;
		font: 12px var(--font-mono);
	}
	.destination {
		color: var(--brass-700);
	}
	.factory-actions {
		display: flex;
		gap: 8px;
	}
	.factory-actions .upgrade {
		flex: 1;
		min-height: 40px;
		padding: 10px 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font: 700 13px var(--font-mono);
		text-align: center;
	}
	.factory-actions .upgrade svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.factory-actions .add-route {
		width: 52px;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.add-route:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.occupied {
		padding: 14px;
	}
	.occupied > section {
		gap: 12px;
	}
	.occupied > .tile-facts {
		position: absolute;
		left: 94px;
		top: 28px;
		z-index: 1;
	}
	.occupied > .tile-facts summary {
		font: 700 10px var(--font-ui);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.occupied > .tile-facts[open] {
		left: 14px;
		right: 14px;
		top: 14px;
		padding: 12px;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		z-index: 4;
	}
	.occupied .building-heading {
		min-height: 68px;
		padding-top: 0;
	}
	.occupied .building-status {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.occupied .building-thumbnail {
		align-self: center;
		margin-top: 0;
	}
	.occupied .level-seal {
		flex-shrink: 0;
		margin-top: 0;
	}
	.occupied .recipe-strip {
		margin: 0;
	}
	.recipe-strip > div:last-child {
		width: 60px;
		height: 60px;
	}
	.occupied .production-log,
	.occupied > .buffer-details {
		position: absolute;
		right: 48px;
		top: 8px;
		z-index: 3;
	}
	.occupied > .buffer-details {
		right: 74px;
	}
	.occupied .production-log summary,
	.occupied > .buffer-details summary {
		list-style: none;
		width: 22px;
		height: 24px;
		padding: 0;
		text-align: center;
	}
	.occupied .production-log summary span,
	.occupied > .buffer-details summary span {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.occupied .production-log summary::after {
		content: 'ⓘ';
		font: 18px var(--font-ui);
	}
	.occupied > .buffer-details summary::after {
		content: '▣';
		font: 18px var(--font-ui);
	}
	.occupied .production-log[open],
	.occupied > .buffer-details[open] {
		top: 38px;
		right: 12px;
		width: calc(100% - 24px);
		max-height: 360px;
		overflow: auto;
		padding: 12px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
		box-shadow: var(--shadow-panel);
	}
	.occupied > .close {
		width: 24px;
		height: 24px;
		padding: 0;
		top: 0;
		right: 0;
		font-size: 14px;
	}
	.factory-actions .demolish {
		width: 52px;
		display: grid;
		place-items: center;
		cursor: pointer;
		color: var(--wax-red);
		border-color: var(--wax-red);
	}
	.demolish:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
