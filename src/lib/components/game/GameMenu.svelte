<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';
	import type { I18nBundle, SupportedLocale } from '$lib/i18n';

	interface Props {
		activeMapView: MapViewId;
		i18n: I18nBundle;
		activeLocale: SupportedLocale;
		onSelectView: (view: MapViewId) => void;
		onSelectLocale: (locale: SupportedLocale) => void;
		menuContent?: Snippet;
		open?: boolean;
	}

	let {
		activeMapView,
		i18n,
		activeLocale,
		onSelectView,
		onSelectLocale,
		menuContent,
		open = $bindable(false)
	}: Props = $props();

	const views: Array<{
		id: MapViewId;
		eyebrowKey: 'route.mapEyebrow.retail' | 'route.mapEyebrow.industry' | 'route.mapEyebrow.world';
	}> = [
		{ id: 'retail', eyebrowKey: 'route.mapEyebrow.retail' },
		{ id: 'industry', eyebrowKey: 'route.mapEyebrow.industry' },
		{ id: 'world', eyebrowKey: 'route.mapEyebrow.world' }
	];
	const localeOptions: Array<{ value: SupportedLocale; label: string }> = [
		{ value: 'en', label: 'English' },
		{ value: 'zh-Hant', label: '繁體中文' },
		{ value: 'ja', label: '日本語' }
	];

	function toggleMenu(): void {
		open = !open;
	}

	function selectView(view: MapViewId): void {
		onSelectView(view);
		open = false;
	}

	function handleLocaleChange(event: Event): void {
		onSelectLocale((event.currentTarget as HTMLSelectElement).value as SupportedLocale);
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
		<svg aria-hidden="true" viewBox="0 0 24 24">
			<path d="M4 7h16" />
			<path d="M4 12h16" />
			<path d="M4 17h16" />
		</svg>
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
				<p class="menu-label">{i18n.t('gameMenu.mapView')}</p>
				<div class="views" role="group" aria-label={i18n.t('gameMenu.mapView')}>
					{#each views as view (view.id)}
						<button
							type="button"
							class="view-tab"
							class:active-view={activeMapView === view.id}
							aria-label={i18n.t(view.eyebrowKey)}
							aria-pressed={activeMapView === view.id}
							onclick={() => selectView(view.id)}
						>
							{i18n.labels.mapView(view.id)}
						</button>
					{/each}
				</div>
			</div>
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
					{#each localeOptions as locale (locale.value)}
						<option value={locale.value}>{locale.label}</option>
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

	.views {
		display: flex;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		overflow: hidden;
	}

	.view-tab {
		flex: 1;
		border: 0;
		border-right: 1px solid var(--brass-500);
		background: var(--paper-50);
		color: var(--ink-500);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.5rem 0.85rem;
	}

	.views .view-tab:last-child {
		border-right: 0;
	}

	.view-tab.active-view {
		background: var(--paper-300);
		color: var(--ink-900);
		font-weight: 700;
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
