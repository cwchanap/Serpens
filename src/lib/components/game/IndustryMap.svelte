<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { IndustryMapSnapshot } from '$lib/game/industryMapRender';

	interface Props {
		snapshot: IndustryMapSnapshot;
		onTileSelected: (tileId: string) => void;
	}

	let { snapshot, onTileSelected }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let loadFailed = $state(false);
	let scene: import('$lib/phaser/industryMapScene').IndustryMapScene | undefined = $state();
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
			const [{ default: Phaser }, { IndustryMapScene }] = await Promise.all([
				import('phaser'),
				import('$lib/phaser/industryMapScene')
			]);

			if (destroyed || !container) {
				return;
			}

			const nextScene = new IndustryMapScene();
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
				backgroundColor: '#14100A',
				scene: nextScene,
				scale: {
					mode: Phaser.Scale.RESIZE,
					autoCenter: Phaser.Scale.CENTER_BOTH
				}
			});
			nextScene.updateSnapshot(snapshot);
		} catch (error) {
			console.error('Unable to load industry map renderer', error);
			loadFailed = true;
		}
	}
</script>

<section class="map-shell" aria-label="Industry map">
	<div class="map-canvas" bind:this={container}>
		{#if loadFailed}
			<p class="map-fallback">Industry map renderer unavailable.</p>
		{/if}
	</div>
</section>

<style>
	.map-shell {
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		border: 0;
		background: var(--walnut-900);
	}

	.map-canvas {
		position: relative;
		height: 100%;
		min-height: 0;
		background: var(--walnut-900);
	}

	.map-canvas :global(canvas) {
		display: block;
	}

	.map-fallback {
		position: absolute;
		inset: 1rem auto auto 1rem;
		margin: 0;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		padding: 0.65rem 0.8rem;
		font-family: var(--font-body);
		font-size: 0.86rem;
		box-shadow: var(--shadow-paper);
	}

	@media (max-width: 820px) {
		.map-shell,
		.map-canvas {
			min-height: 0;
		}
	}
</style>
