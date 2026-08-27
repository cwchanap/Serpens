<!-- src/lib/components/game/ShortcutCheatSheet.svelte -->
<script lang="ts">
	import { focusTrap } from '$lib/a11y/focusTrap';
	import type { I18nBundle } from '$lib/i18n';

	type ShortcutActionKey =
		| 'build'
		| 'cameraPan'
		| 'mapViews'
		| 'dashboard'
		| 'policies'
		| 'staff'
		| 'stores'
		| 'decisions'
		| 'reports'
		| 'productChains'
		| 'finance'
		| 'logistics'
		| 'pauseResume'
		| 'escape'
		| 'cheatSheet';

	interface Props {
		i18n: I18nBundle;
		onClose: () => void;
	}

	let { i18n, onClose }: Props = $props();

	const shortcuts: Array<{ keys: string; actionKey: ShortcutActionKey }> = [
		{ keys: 'B', actionKey: 'build' },
		{ keys: 'W / A / S / D', actionKey: 'cameraPan' },
		{ keys: '1 / 2 / 3', actionKey: 'mapViews' },
		{ keys: 'O', actionKey: 'dashboard' },
		{ keys: 'P', actionKey: 'policies' },
		{ keys: 'H', actionKey: 'staff' },
		{ keys: 'T', actionKey: 'stores' },
		{ keys: 'C', actionKey: 'decisions' },
		{ keys: 'R', actionKey: 'reports' },
		{ keys: 'G', actionKey: 'productChains' },
		{ keys: 'F', actionKey: 'finance' },
		{ keys: 'L', actionKey: 'logistics' },
		{ keys: 'Space', actionKey: 'pauseResume' },
		{ keys: 'Esc', actionKey: 'escape' },
		{ keys: '?', actionKey: 'cheatSheet' }
	];
</script>

<div class="cheat-backdrop">
	<button
		type="button"
		class="backdrop-button"
		tabindex="-1"
		aria-label={i18n.t('shortcutCheatSheet.dismiss')}
		onclick={onClose}
	></button>
	<div
		class="cheat-sheet paper"
		role="dialog"
		aria-modal="true"
		aria-label={i18n.t('shortcutCheatSheet.dialog')}
		{@attach focusTrap}
	>
		<header>
			<h2>{i18n.t('shortcutCheatSheet.title')}</h2>
			<button
				type="button"
				class="btn-danger"
				aria-label={i18n.t('shortcutCheatSheet.close')}
				onclick={onClose}>×</button
			>
		</header>
		<dl>
			{#each shortcuts as shortcut (shortcut.keys)}
				<div class="row">
					<dt><kbd class="keycap">{shortcut.keys}</kbd></dt>
					<dd>{i18n.t(`shortcutCheatSheet.actions.${shortcut.actionKey}`)}</dd>
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
