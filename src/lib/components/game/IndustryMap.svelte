<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { IndustryMapSnapshot } from '$lib/game/industryMapRender';
	import type { MapActivityBatch } from '$lib/game/mapActivityFeedback';
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		snapshot: IndustryMapSnapshot;
		onTileSelected: (tileId: string) => void;
		/**
		 * Fired when the player cancels an in-progress build (rail placement,
		 * etc.) via Escape or a right-click on the map.
		 */
		onBuildCancelled?: () => void;
		active?: boolean;
		/**
		 * When true, the Phaser game loop is paused so the heavy render loop
		 * stops competing for the main thread while overlays such as the map
		 * menu or management panels are open. Rendering resumes when false.
		 */
		paused?: boolean;
		/**
		 * When false, the scene's keyboard shortcuts (Escape-to-cancel-build)
		 * are suppressed so Escape that closes a page-level overlay does not
		 * also fire buildCancelled behind the overlay.
		 */
		keyboardEnabled?: boolean;
		/** Latest route batch. Each new seq is consumed once and forwarded only to an eligible scene. */
		activity?: MapActivityBatch;
		i18n: I18nBundle;
	}

	const NO_ACTIVITY: MapActivityBatch = { seq: 0, activities: [] };

	let {
		snapshot,
		onTileSelected,
		onBuildCancelled,
		active = true,
		paused = false,
		keyboardEnabled = true,
		activity = NO_ACTIVITY,
		i18n
	}: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let loadFailed = $state(false);
	let scene: import('$lib/phaser/industryMapScene').IndustryMapScene | undefined = $state();
	let game: import('phaser').Game | undefined = $state();
	let destroyed = false;
	// Set when the scene reports sceneReady from the end of create(), i.e. it can draw.
	let sceneReady = $state(false);
	// Consume-once bookkeeping, deliberately not reactive: a new seq counts as consumed on arrival.
	let lastActivitySeq = untrack(() => activity.seq);

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

	// Suppress the scene's Escape-to-cancel-build listener while a page-level
	// overlay is open so the same Escape press does not also pop a rail
	// waypoint or exit rail mode behind the overlay.
	$effect(() => {
		scene?.setKeyboardEnabled(keyboardEnabled);
	});

	// Follows the OS reduced-motion setting live. The scene stops its perpetual bob and draws
	// static rings instead of animated ones. Teardown removes the listener when the scene
	// changes or the view is destroyed; an absent matchMedia keeps normal motion.
	$effect(() => {
		const currentScene = scene;
		if (!currentScene) {
			return;
		}

		const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
		const apply = () => currentScene.setReducedMotion(query?.matches ?? false);
		apply();
		query?.addEventListener('change', apply);

		return () => query?.removeEventListener('change', apply);
	});

	$effect(() => {
		const currentGame = game;
		if (!currentGame || !active || !containerWidth || !containerHeight) {
			return;
		}

		// RESIZE mode reads parentSize during refresh; resize() alone restores stale dimensions.
		currentGame.scale?.setParentSize?.(containerWidth, Math.max(containerHeight, 520));
	});

	$effect(() => {
		const batch = activity;
		if (batch.seq === lastActivitySeq) {
			return;
		}
		lastActivitySeq = batch.seq;

		const currentScene = scene;
		if (!currentScene || !sceneReady || !active || paused) {
			return;
		}

		const cityId = snapshot.cityId;
		const eligible = batch.activities.filter((item) => item.cityId === cityId);
		if (eligible.length > 0) {
			currentScene.showMapActivity({ seq: batch.seq, activities: eligible });
		}
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
				} else if (event.type === 'buildCancelled') {
					onBuildCancelled?.();
				} else if (event.type === 'sceneReady') {
					sceneReady = true;
				}
			});
			scene = nextScene;
			game = new Phaser.Game({
				type: Phaser.AUTO,
				parent: container,
				// Match the resize path (below): the real container width from the
				// first frame — no 640px floor, which pinned the canvas wider than
				// a phone viewport and left edge tiles untappable until the first
				// resize settled. Only the 520px height floor is load-bearing.
				width: Math.max(container.clientWidth, 1),
				height: Math.max(container.clientHeight, 520),
				backgroundColor: '#14100A',
				scene: nextScene,
				// Right-click cancels an in-progress rail build; suppress the
				// native browser context menu so it does not flash on top.
				disableContextMenu: true,
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

<section class="map-shell" aria-label={i18n.t('mapRenderer.industryMapAriaLabel')}>
	<div
		class="map-canvas"
		bind:this={container}
		bind:clientWidth={containerWidth}
		bind:clientHeight={containerHeight}
	>
		{#if loadFailed}
			<p class="map-fallback">{i18n.t('mapRenderer.industryMapUnavailable')}</p>
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
