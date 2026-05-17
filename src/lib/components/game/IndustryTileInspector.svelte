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
</style>
