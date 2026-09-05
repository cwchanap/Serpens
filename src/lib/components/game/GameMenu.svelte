<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import { SUPPORTED_LOCALE_METADATA, type I18nBundle, type SupportedLocale } from '$lib/i18n';
	import GameIcon from './GameIcon.svelte';

	interface Props {
		i18n: I18nBundle;
		activeLocale: SupportedLocale;
		onSelectLocale: (locale: SupportedLocale) => void;
		menuContent?: Snippet;
		open?: boolean;
	}

	let {
		i18n,
		activeLocale,
		onSelectLocale,
		menuContent,
		open = $bindable(false)
	}: Props = $props();

	function toggleMenu(): void {
		open = !open;
	}

	function handleLocaleChange(event: Event): void {
		onSelectLocale((event.currentTarget as HTMLSelectElement).value as SupportedLocale);
		open = false;
	}

	function handleMenuKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			open = false;
		}
	}

	// Standard dropdown behaviour: dismiss the popover on any pointer press outside it.
	// The attachment is only applied while `open` is true (conditional-attachment
	// pattern), so the global listener is registered on open and torn down on close — no
	// always-on window listener and no implicit re-run contract inside the body.
	const dismissMenuOnOutsidePointer: Attachment<HTMLElement> = (node) => {
		return on(window, 'pointerdown', (event) => {
			if (!node.contains(event.target as Node)) {
				open = false;
			}
		});
	};
</script>

<div class="game-menu" {@attach open && dismissMenuOnOutsidePointer}>
	<button
		type="button"
		class="btn-icon"
		aria-label={i18n.t('gameMenu.menu')}
		aria-expanded={open}
		data-testid="game-menu-trigger"
		onclick={toggleMenu}
	>
		<GameIcon name="menu" />
	</button>
	{#if open}
		<div
			class="menu-popover paper"
			role="dialog"
			aria-modal="true"
			aria-label={i18n.t('gameMenu.menu')}
			tabindex="-1"
			onkeydown={handleMenuKeydown}
			{@attach focusTrap}
		>
			<div class="menu-section">
				<label class="menu-label" for="language-selector">{i18n.t('gameMenu.language')}</label>
				<select
					id="language-selector"
					class="language-selector"
					aria-label={i18n.t('gameMenu.language')}
					data-testid="language-selector"
					value={activeLocale}
					onchange={handleLocaleChange}
				>
					{#each SUPPORTED_LOCALE_METADATA as locale (locale.id)}
						<option value={locale.id}>{locale.label}</option>
					{/each}
				</select>
			</div>
			{#if menuContent}
				{@render menuContent()}
			{/if}
		</div>
	{/if}
</div>

<style>
	.game-menu {
		position: relative;
	}

	.menu-popover {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		z-index: 31;
		display: grid;
		gap: 0.5rem;
		width: min(20rem, 80vw);
		max-height: calc(100dvh - 5rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.7rem;
	}

	.menu-label {
		margin: 0 0 0.4rem;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.language-selector {
		width: 100%;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		padding: 0.55rem 0.65rem;
	}
</style>
