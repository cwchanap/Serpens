<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { CityMapSnapshot } from '$lib/game/mapRender';

	interface Props {
		snapshot: CityMapSnapshot;
		onTileSelected: (tileId: string) => void;
	}

	let { snapshot, onTileSelected }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let loadFailed = $state(false);
	let scene: import('$lib/phaser/cityMapScene').CityMapScene | undefined = $state();
	let game: import('phaser').Game | undefined;
	let destroyed = false;

	const keyboardTiles = $derived(snapshot.tiles.filter((tile) => !tile.locked));

	onMount(() => {
		void startPhaser();
	});

	onDestroy(() => {
		destroyed = true;
		scene?.setEventHandler(null);
		game?.destroy(true);
		game = undefined;
		scene = undefined;
	});

	$effect(() => {
		scene?.updateSnapshot(snapshot);
	});

	async function startPhaser() {
		if (!container || game) {
			return;
		}

		try {
			const [{ default: Phaser }, { CityMapScene }] = await Promise.all([
				import('phaser'),
				import('$lib/phaser/cityMapScene')
			]);

			if (destroyed || !container) {
				return;
			}

			const nextScene = new CityMapScene();
			nextScene.setEventHandler((event) => {
				if (event.type === 'tileSelected') {
					onTileSelected(event.tileId);
				}
			});

			scene = nextScene;
			game = new Phaser.Game({
				type: Phaser.AUTO,
				parent: container,
				width: Math.max(container.clientWidth, 640),
				height: Math.max(container.clientHeight, 520),
				backgroundColor: '#101418',
				scene: nextScene,
				scale: {
					mode: Phaser.Scale.RESIZE,
					autoCenter: Phaser.Scale.CENTER_BOTH
				}
			});
			nextScene.updateSnapshot(snapshot);
		} catch (error) {
			console.error('Unable to load city map renderer', error);
			loadFailed = true;
		}
	}
</script>

<section class="map-shell" aria-label="City map">
	<div class="map-canvas" bind:this={container}>
		{#if loadFailed}
			<p class="map-fallback">Map renderer unavailable. Use the tile picker below.</p>
		{/if}
	</div>

	<div class="tile-picker" aria-label="Keyboard tile picker">
		{#each keyboardTiles as tile (tile.id)}
			<button
				type="button"
				class:selected={tile.id === snapshot.selectedTileId}
				aria-pressed={tile.id === snapshot.selectedTileId}
				onclick={() => onTileSelected(tile.id)}
			>
				Select tile {tile.x}, {tile.y}
			</button>
		{/each}
	</div>
</section>

<style>
	.map-shell {
		display: grid;
		min-width: 0;
		min-height: 680px;
		grid-template-rows: minmax(520px, 1fr) auto;
		overflow: hidden;
		border: 1px solid #343434;
		border-radius: 8px;
		background: #151514;
	}

	.map-canvas {
		position: relative;
		min-height: 520px;
		background: #101418;
	}

	.map-canvas :global(canvas) {
		display: block;
	}

	.map-fallback {
		position: absolute;
		inset: 1rem auto auto 1rem;
		margin: 0;
		border: 1px solid #6f5130;
		border-radius: 6px;
		background: #211b14;
		color: #f4c56f;
		padding: 0.65rem 0.8rem;
		font-size: 0.86rem;
	}

	.tile-picker {
		display: grid;
		max-height: 8.5rem;
		grid-template-columns: repeat(auto-fill, minmax(7.4rem, 1fr));
		gap: 0.4rem;
		overflow: auto;
		border-top: 1px solid #343434;
		background: #1d1d1b;
		padding: 0.55rem;
	}

	button {
		border: 1px solid #3f3f3c;
		border-radius: 6px;
		background: #282724;
		color: #f2efe8;
		padding: 0.45rem 0.6rem;
		font-size: 0.78rem;
		white-space: nowrap;
	}

	button:hover,
	button:focus-visible {
		border-color: #c28a3a;
		background: #332a1d;
		outline: none;
	}

	button.selected {
		border-color: #d9a441;
		background: #4a3418;
		color: #fff6dd;
	}

	@media (max-width: 820px) {
		.map-shell {
			min-height: 560px;
			grid-template-rows: minmax(420px, 1fr) auto;
		}

		.map-canvas {
			min-height: 420px;
		}
	}
</style>
