<script lang="ts">
	import type { GameState, ProductId } from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';
	import type { MutationAvailability } from './gameRouteController';
	import type { ManagementUi, ManagementUiCommands } from './managementUi.svelte';
	import ManagementPanelHost from './ManagementPanelHost.svelte';

	interface Props {
		ui: ManagementUi;
		game: GameState | null;
		fallback: GameState;
		mode: 'sandbox' | 'scenario';
		i18n: I18nBundle;
		availability: MutationAvailability;
		disabledReason: string | null;
		commands: ManagementUiCommands;
		plannerProductIds?: readonly ProductId[];
		onPlanProduct?: (productId: ProductId) => void;
		/** Seeds the map's route selection the way a focused-route handoff does. */
		initialSelectedRouteId?: string | null;
	}

	let {
		ui,
		game,
		fallback,
		mode,
		i18n,
		availability,
		disabledReason,
		commands,
		plannerProductIds = [],
		onPlanProduct = () => {},
		initialSelectedRouteId = null
	}: Props = $props();

	// Mirrors +page.svelte: the host mounts only while a panel is active, and
	// the root receipt clears the map's route selection only on a match.
	function createInitialSelection(): string | null {
		return initialSelectedRouteId;
	}

	let selectedRouteId = $state(createInitialSelection());
	let removalNotifications = $state(0);

	function handleRouteRemoved(routeId: string): void {
		removalNotifications += 1;
		if (selectedRouteId === routeId) selectedRouteId = null;
	}
</script>

{#if ui.activePanelId}
	<ManagementPanelHost
		{ui}
		{game}
		{fallback}
		{mode}
		{i18n}
		{availability}
		{disabledReason}
		{commands}
		{plannerProductIds}
		{onPlanProduct}
		onRouteRemoved={handleRouteRemoved}
	/>
{/if}

<div data-testid="root-selected-route">{selectedRouteId ?? 'none'}</div>
<div data-testid="root-removal-notifications">{removalNotifications}</div>
<div data-testid="host-mounted">{ui.activePanelId ?? 'none'}</div>
