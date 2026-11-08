<script lang="ts">
	import AudioSettings from '$lib/components/game/AudioSettings.svelte';
	import TopBar from '$lib/components/game/TopBar.svelte';
	import type { AudioPreferences } from '$lib/audio/audioPreferences';
	import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';
	import type { GameState } from '$lib/game/types';
	import type { I18nBundle, SupportedLocale } from '$lib/i18n';
	import type { LocalizedGameAlert } from '$lib/i18n/localizedTypes';
	import type { Snippet } from 'svelte';
	import type { ManagementPanelMenuItem } from './managementUi.svelte';

	interface Props {
		game: GameState | null;
		industryCityId: string;
		eyebrow: string;
		title: string;
		i18n: I18nBundle;
		activeLocale: SupportedLocale;
		alerts: LocalizedGameAlert[];
		activeMapView: MapViewId;
		managementMenu: ManagementPanelMenuItem[];
		audioPreferences: AudioPreferences;
		onOpenManagementPanel: (id: ManagementPanelId) => void;
		onSelectAlert: (alert: LocalizedGameAlert) => void;
		onSelectView: (view: MapViewId) => void;
		onSelectLocale: (locale: SupportedLocale) => void;
		onUpdateAudioPreferences: (patch: Partial<AudioPreferences>) => void;
		/** Root-composed scenario/save actions rendered at their existing spot. */
		menuActions: Snippet;
		/** Root-owned overlay flags; the header owns no mirrored atoms. */
		gameMenuOpen?: boolean;
		alertsMenuOpen?: boolean;
	}

	let {
		game,
		industryCityId,
		eyebrow,
		title,
		i18n,
		activeLocale,
		alerts,
		activeMapView,
		managementMenu,
		audioPreferences,
		onOpenManagementPanel,
		onSelectAlert,
		onSelectView,
		onSelectLocale,
		onUpdateAudioPreferences,
		menuActions,
		gameMenuOpen = $bindable(false),
		alertsMenuOpen = $bindable(false)
	}: Props = $props();

	const industryInventory = $derived(
		game?.cityInventories.find((inventory) => inventory.cityId === industryCityId)?.materials ?? {}
	);
</script>

<TopBar
	{eyebrow}
	{title}
	day={game?.day ?? null}
	cash={game?.cash ?? null}
	cashHistory={game?.reports.slice(-14).map((report) => report.cashAfter) ?? []}
	{industryInventory}
	{alerts}
	{i18n}
	{activeLocale}
	{onSelectAlert}
	{activeMapView}
	{onSelectView}
	{onSelectLocale}
	bind:menuOpen={gameMenuOpen}
	bind:alertsOpen={alertsMenuOpen}
>
	{#snippet menuContent()}
		<div class="menu-section">
			<p class="menu-label">{i18n.t('route.menu.management')}</p>
			<div class="menu-management" role="group" aria-label={i18n.t('route.menu.managementPanels')}>
				{#each managementMenu as item (item.id)}
					<button type="button" onclick={() => onOpenManagementPanel(item.id)}>
						{item.label}
					</button>
				{/each}
			</div>
		</div>
		{@render menuActions()}
		<AudioSettings {i18n} preferences={audioPreferences} onChange={onUpdateAudioPreferences} />
	{/snippet}
</TopBar>

<style>
	/* Management launchers surfaced inside the hamburger menu so they remain
	   reachable on narrow viewports where the control desk hides the .manage
	   cluster. Mirrors GameMenu's .menu-label and .view-tab look. */
	.menu-section {
		display: grid;
		gap: 0.4rem;
	}

	.menu-label {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.menu-management {
		display: grid;
		gap: 0.3rem;
	}

	.menu-management button {
		width: 100%;
		text-align: left;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		padding: 0.45rem 0.6rem;
	}

	.menu-management button:hover,
	.menu-management button:focus-visible {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}
</style>
