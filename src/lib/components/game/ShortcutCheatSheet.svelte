<!-- src/lib/components/game/ShortcutCheatSheet.svelte -->
<script lang="ts">
	interface Shortcut {
		keys: string;
		action: string;
	}

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	const shortcuts: Shortcut[] = [
		{ keys: 'B', action: 'Toggle build menu' },
		{ keys: '1 / 2 / 3', action: 'Retail / Industry / World view' },
		{ keys: 'D', action: 'Toggle Dashboard' },
		{ keys: 'P', action: 'Toggle Policies' },
		{ keys: 'S', action: 'Toggle Staff' },
		{ keys: 'T', action: 'Toggle Stores' },
		{ keys: 'C', action: 'Toggle Decisions' },
		{ keys: 'R', action: 'Toggle Reports' },
		{ keys: 'G', action: 'Toggle Product Chains' },
		{ keys: 'Space', action: 'Advance day' },
		{ keys: 'Esc', action: 'Open menu, or close / cancel' },
		{ keys: '?', action: 'Toggle this cheat sheet' }
	];
</script>

<div class="cheat-backdrop">
	<button type="button" class="backdrop-button" aria-label="Dismiss shortcuts" onclick={onClose}
	></button>
	<div class="cheat-sheet paper" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
		<header>
			<h2>Keyboard Shortcuts</h2>
			<button type="button" class="btn-danger" aria-label="Close shortcuts" onclick={onClose}
				>×</button
			>
		</header>
		<dl>
			{#each shortcuts as shortcut (shortcut.keys)}
				<div class="row">
					<dt><kbd class="keycap">{shortcut.keys}</kbd></dt>
					<dd>{shortcut.action}</dd>
				</div>
			{/each}
		</dl>
	</div>
</div>

<style>
	.cheat-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.7);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		background: transparent;
		padding: 0;
	}

	.cheat-sheet {
		position: relative;
		z-index: 1;
		width: min(26rem, 100%);
		padding: 1.1rem 1.2rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.6rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.btn-danger {
		width: 2rem;
		height: 2rem;
		padding: 0;
	}

	dl {
		display: grid;
		gap: 0.5rem;
		margin: 0.85rem 0 0;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	dt {
		flex: 0 0 6rem;
	}

	dd {
		margin: 0;
		font-family: var(--font-body);
		color: var(--ink-500);
	}
</style>
