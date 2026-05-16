<script lang="ts">
	import { asset } from '$app/paths';
	import { getIndustrialBuildingArt, getIndustryMaterialArt } from '$lib/assets/gameArt';
	import { INDUSTRIAL_BUILDING_TYPES, MATERIALS } from '$lib/game/industry';
	import { getWarehouseUsed } from '$lib/game/industryProduction';
	import type {
		DailyMaterialMovement,
		GameState,
		IndustrialBuilding,
		IndustryTile,
		MaterialId
	} from '$lib/game/types';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';

	interface Props {
		game: GameState;
		tile: IndustryTile | null;
		building: IndustrialBuilding | null;
		onClose: () => void;
	}

	interface WarehouseMaterialRow {
		id: MaterialId;
		name: string;
		quantity: number;
	}

	let { game, tile, building, onClose }: Props = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const buildingType = $derived(building ? INDUSTRIAL_BUILDING_TYPES[building.typeId] : null);
	const tileTerrain = $derived(tile ? label(tile.terrain) : 'Unknown');
	const tileResource = $derived(tile?.resource ? label(tile.resource) : 'None');
	const warehouseUsed = $derived(getWarehouseUsed(game.warehouse));
	const warehouseMaterials = $derived.by(() => getWarehouseMaterialRows());

	function label(value: string): string {
		return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
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

	function movementLabel(movement: DailyMaterialMovement): string {
		return `${materialName(movement.materialId)}: ${movement.quantity}`;
	}

	function materialName(materialId: MaterialId): string {
		return MATERIALS[materialId]?.name ?? label(materialId);
	}

	function materialArtSrc(materialId: MaterialId): string {
		return asset(getIndustryMaterialArt(materialId));
	}

	function buildingArtSrc(typeId: IndustrialBuilding['typeId']): string {
		return asset(getIndustrialBuildingArt(typeId));
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
	dt,
	small {
		color: #b7c3b2;
	}

	.heading p,
	.heading span,
	.building-heading span,
	dt,
	.muted,
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

	.building-thumbnail {
		display: block;
		width: 4.5rem;
		aspect-ratio: 1;
		border: 1px solid #3f4a42;
		border-radius: 6px;
		background: #e5eadb;
		object-fit: contain;
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

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		border-color: #b7d96e;
		background: #2d3d2a;
		outline: none;
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
</style>
