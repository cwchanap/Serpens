<script lang="ts">
	import { chainNodeArt } from '$lib/assets/gameArt';
	import { formatQuantity, type ProductChainNode } from '$lib/game/productChainGraph';

	interface Props {
		node: ProductChainNode;
		selected: boolean;
		compact: boolean;
		position: { x: number; y: number };
		onSelect: (nodeId: string) => void;
	}

	let { node, selected, compact, position, onSelect }: Props = $props();

	const art = $derived(chainNodeArt(node));
	const ariaLabel = $derived(`${node.label}, ${node.healthLabel}`);
	const statLine = $derived.by(() => {
		if (node.kind === 'recipe') {
			return `${node.capacity.buildingCount} bldg · ${formatQuantity(node.actual.produced)}/d`;
		}
		return `stock ${formatQuantity(node.warehouseStock)}`;
	});

	function handleClick(): void {
		onSelect(node.id);
	}
</script>

<button
	type="button"
	class={[
		'chain-node',
		`chain-node-${node.kind}`,
		`chain-node-${node.health}`,
		selected && 'is-selected',
		compact && 'is-compact'
	]}
	style:left={`${position.x}px`}
	style:top={`${position.y}px`}
	data-node-id={node.id}
	data-node-kind={node.kind}
	data-node-health={node.health}
	aria-pressed={selected}
	aria-label={ariaLabel}
	onclick={handleClick}
>
	<span class="frame">
		{#if art.src}
			<img src={art.src} alt={art.alt} class="icon" />
		{:else}
			<span class="glyph" aria-hidden="true">{node.label.charAt(0)}</span>
		{/if}
		<span class={['pin', `pin-${node.health}`]}>{node.healthLabel}</span>
	</span>
	<span class="cartouche">{node.label}</span>
	<span class="stat">{statLine}</span>
</button>

<style>
	.chain-node {
		position: absolute;
		display: grid;
		justify-items: center;
		gap: 6px;
		width: 132px;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--ink-700);
		text-align: center;
		cursor: pointer;
		font: inherit;
	}

	.chain-node.is-compact {
		width: 104px;
	}

	.frame {
		position: relative;
		width: 90px;
		height: 90px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: radial-gradient(
			circle at 50% 38%,
			color-mix(in srgb, var(--paper-50) 99%, white) 0%,
			var(--paper-50) 60%,
			color-mix(in srgb, var(--paper-50) 86%, var(--brass-100)) 100%
		);
		border: 2px solid var(--ink-700);
		box-shadow:
			0 3px 0 var(--paper-edge),
			0 6px 14px rgba(20, 12, 4, 0.18);
	}

	.is-compact .frame {
		width: 60px;
		height: 60px;
	}

	.chain-node-material .frame {
		border-radius: 50%;
	}

	.chain-node-material .frame::after {
		content: '';
		position: absolute;
		inset: 5px;
		border: 1px dashed color-mix(in srgb, var(--brass-700) 60%, transparent);
		border-radius: 50%;
		pointer-events: none;
	}

	.chain-node-recipe .frame {
		width: 100px;
		height: 100px;
		clip-path: polygon(28% 0, 72% 0, 100% 28%, 100% 72%, 72% 100%, 28% 100%, 0 72%, 0 28%);
		background: radial-gradient(
			circle at 50% 35%,
			color-mix(in srgb, var(--brass-100) 80%, var(--paper-50)) 0%,
			color-mix(in srgb, var(--paper-50) 90%, var(--brass-100)) 75%
		);
	}

	.is-compact.chain-node-recipe .frame {
		width: 64px;
		height: 64px;
	}

	.chain-node-warehouse .frame {
		width: 98px;
		height: 82px;
		border-radius: 4px;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--brass-100) 75%, var(--paper-50)) 0%,
			color-mix(in srgb, var(--paper-50) 85%, var(--brass-100)) 100%
		);
	}

	.is-compact.chain-node-warehouse .frame {
		width: 64px;
		height: 52px;
	}

	.icon {
		width: 64px;
		height: 64px;
		image-rendering: pixelated;
		position: relative;
		z-index: 1;
	}

	.is-compact .icon {
		width: 40px;
		height: 40px;
	}

	.chain-node-recipe .icon {
		width: 60px;
		height: 60px;
	}

	.is-compact.chain-node-recipe .icon {
		width: 36px;
		height: 36px;
	}

	.chain-node-warehouse .icon {
		width: 64px;
		height: 56px;
	}

	.is-compact.chain-node-warehouse .icon {
		width: 40px;
		height: 34px;
	}

	.glyph {
		font-family: var(--font-display);
		font-size: 32px;
		color: var(--ink-500);
	}

	.pin {
		position: absolute;
		top: -7px;
		right: -7px;
		padding: 2px 6px;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--paper-50);
		background: var(--moss);
		border-radius: 1px;
		transform: rotate(3deg);
		box-shadow: 1px 1px 0 rgba(15, 10, 3, 0.25);
	}

	.pin-watch,
	.pin-no-report {
		background: var(--brass-700);
	}

	.pin-shortage,
	.pin-no-local-capacity {
		background: var(--wax-red);
		transform: rotate(-3deg);
	}

	.chain-node-shortage .frame,
	.chain-node-no-local-capacity .frame {
		border-color: var(--wax-red);
	}

	.chain-node-watch .frame {
		border-color: var(--brass-700);
	}

	.cartouche {
		max-width: 120px;
		padding: 3px 8px;
		font-family: var(--font-display);
		font-size: 14px;
		line-height: 1.05;
		color: var(--ink-700);
		background: var(--paper-50);
		border-top: 1px solid var(--brass-700);
		border-bottom: 2px double var(--brass-700);
		overflow-wrap: anywhere;
	}

	.is-compact .cartouche {
		font-size: 11px;
		padding: 2px 6px;
	}

	.chain-node-shortage .cartouche,
	.chain-node-no-local-capacity .cartouche {
		border-color: var(--wax-red);
		color: var(--wax-red);
	}

	.stat {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--brass-700);
	}

	.is-compact .stat {
		font-size: 9.5px;
	}

	.chain-node-shortage .stat,
	.chain-node-no-local-capacity .stat {
		color: var(--wax-red);
	}

	.chain-node.is-selected .frame {
		outline: 3px solid var(--brass-300);
		outline-offset: 4px;
	}

	.chain-node:focus-visible .frame {
		outline: 3px solid var(--brass-300);
		outline-offset: 4px;
	}
</style>
