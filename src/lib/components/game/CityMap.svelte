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
			<p class="map-fallback">Map renderer unavailable.</p>
		{/if}
	</div>
</section>

<style>
	.map-shell {
		min-width: 0;
		min-height: 620px;
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

	@media (max-width: 820px) {
		.map-shell {
			min-height: 460px;
		}

		.map-canvas {
			min-height: 420px;
		}
	}
</style>
