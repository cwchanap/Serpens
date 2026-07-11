<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { CityMapSnapshot } from '$lib/game/mapRender';
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		snapshot: CityMapSnapshot;
		onTileSelected: (tileId: string) => void;
		active?: boolean;
		/**
		 * When true, the Phaser game loop is paused so the heavy render loop
		 * (thousands of terrain sprites on large cities) stops competing for
		 * the main thread while overlays such as the map menu or management
		 * panels are open. Rendering resumes automatically when this is false.
		 */
		paused?: boolean;
		i18n: I18nBundle;
	}

	let { snapshot, onTileSelected, active = true, paused = false, i18n }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let loadFailed = $state(false);
	let scene: import('$lib/phaser/cityMapScene').CityMapScene | undefined = $state();
	let game: import('phaser').Game | undefined = $state();
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

	// Pause/resume the render loop with the overlay state. The game instance is
	// created asynchronously, so this effect re-runs once it is available and
	// applies the current paused state. `pause`/`resume` are optional-chained so
	// tests with a stub Game do not have to implement them.
	$effect(() => {
		const currentGame = game;
		if (!currentGame) {
			return;
		}

		const shouldPause = !active || paused;
		if (currentGame.canvas) {
			currentGame.canvas.dataset.mapPaused = shouldPause ? 'true' : 'false';
		}

		if (shouldPause) {
			currentGame.pause?.();
		} else {
			currentGame.resume?.();
		}
	});

	$effect(() => {
		const currentGame = game;
		const currentContainer = container;
		if (!currentGame || !currentContainer || !active) {
			return;
		}

		currentGame.scale?.resize?.(
			Math.max(currentContainer.clientWidth, 640),
			Math.max(currentContainer.clientHeight, 520)
		);
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
				backgroundColor: '#14100A',
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
			<p class="map-fallback">{i18n.t('mapRenderer.cityMapUnavailable')}</p>
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
