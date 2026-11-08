<script lang="ts">
	import type { AudioPreferences } from '$lib/audio/audioPreferences';
	import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';
	import type { GameState } from '$lib/game/types';
	import type { I18nBundle, SupportedLocale } from '$lib/i18n';
	import type { LocalizedGameAlert } from '$lib/i18n/localizedTypes';
	import type { ManagementPanelMenuItem } from './managementUi.svelte';
	import RouteHeader from './RouteHeader.svelte';
	import ScenarioMenuActions from './ScenarioMenuActions.svelte';
	import { createScenarioUi } from './scenarioUi.svelte';

	// Test fixture mirroring +page.svelte's header composition: the root owns
	// the menu/alerts overlay flags and the scenario snippet; the header only
	// binds them. Same pattern as ManagementPanelHostHarness.
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
		scenarioUi: ReturnType<typeof createScenarioUi>;
		playMode: 'sandbox' | 'scenario';
		onOpenManagementPanel: (id: ManagementPanelId) => void;
		onSelectAlert: (alert: LocalizedGameAlert) => void;
		onSelectView: (view: MapViewId) => void;
		onSelectLocale: (locale: SupportedLocale) => void;
		onUpdateAudioPreferences: (patch: Partial<AudioPreferences>) => void;
		onOpenSaves: () => void;
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
		scenarioUi,
		playMode,
		onOpenManagementPanel,
		onSelectAlert,
		onSelectView,
		onSelectLocale,
		onUpdateAudioPreferences,
		onOpenSaves
	}: Props = $props();

	// Root-owned overlay flags — exactly as +page.svelte owns them.
	let gameMenuOpen = $state(false);
	let alertsMenuOpen = $state(false);

	// Root-side fresh-open semantics: opening a panel or the save panel from
	// the menu closes the hamburger menu first (openManagementEntry / saves
	// .open onOpen chains in the page).
	function openManagement(id: ManagementPanelId): void {
		gameMenuOpen = false;
		onOpenManagementPanel(id);
	}

	function openSaves(): void {
		gameMenuOpen = false;
		onOpenSaves();
	}
</script>

<RouteHeader
	{game}
	{industryCityId}
	{eyebrow}
	{title}
	{i18n}
	{activeLocale}
	{alerts}
	{activeMapView}
	{managementMenu}
	{audioPreferences}
	onOpenManagementPanel={openManagement}
	{onSelectAlert}
	{onSelectView}
	{onSelectLocale}
	{onUpdateAudioPreferences}
	bind:gameMenuOpen
	bind:alertsMenuOpen
>
	{#snippet menuActions()}
		<ScenarioMenuActions ui={scenarioUi} {playMode} {i18n} onOpenSaves={openSaves} />
	{/snippet}
</RouteHeader>

<div data-testid="root-game-menu-open">{String(gameMenuOpen)}</div>
<div data-testid="root-alerts-menu-open">{String(alertsMenuOpen)}</div>
