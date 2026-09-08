<script lang="ts">
	import { asset } from '$app/paths';
	import { getIndustryMaterialArt } from '$lib/assets/gameArt';
	import type { CityInventory, MaterialId } from '$lib/game/types';
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import type { LocalizedGameAlert } from '$lib/i18n/localizedTypes';
	import type { I18nBundle, SupportedLocale } from '$lib/i18n';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';
	import HudIcon from './HudIcon.svelte';
	import GameMenu from './GameMenu.svelte';

	interface Props {
		eyebrow: string;
		title: string;
		day: number | null;
		cash: number | null;
		cashHistory?: number[];
		industryInventory?: CityInventory['materials'];
		alerts: LocalizedGameAlert[];
		i18n: I18nBundle;
		activeLocale: SupportedLocale;
		onSelectAlert: (alert: LocalizedGameAlert) => void;
		activeMapView: MapViewId;
		onSelectView: (view: MapViewId) => void;
		onSelectLocale: (locale: SupportedLocale) => void;
		menuContent?: Snippet;
		menuOpen?: boolean;
		alertsOpen?: boolean;
	}

	let {
		eyebrow,
		title,
		day,
		cash,
		cashHistory = [],
		industryInventory = {},
		alerts,
		i18n,
		activeLocale,
		onSelectAlert,
		activeMapView,
		onSelectView,
		onSelectLocale,
		menuContent,
		menuOpen = $bindable(false),
		alertsOpen = $bindable(false)
	}: Props = $props();

	const inventoryReadouts = $derived(
		[
			...new Set<MaterialId>([
				...(Object.keys(industryInventory) as MaterialId[]).sort(
					(a, b) => (industryInventory[b] ?? 0) - (industryInventory[a] ?? 0) || a.localeCompare(b)
				),
				'grain',
				'flour',
				'oilseeds'
			])
		].slice(0, 3)
	);
	const cashFloor = $derived(Math.min(...cashHistory));
	const cashRange = $derived(Math.max(1, Math.max(...cashHistory) - cashFloor));
	const cashPoints = $derived(
		cashHistory
			.map(
				(value, index) =>
					`${2 + (index * 96) / Math.max(1, cashHistory.length - 1)},${26 - ((value - cashFloor) / cashRange) * 24}`
			)
			.join(' ')
	);
	function toggleAlerts(): void {
		alertsOpen = !alertsOpen;
	}

	function selectAlert(alert: LocalizedGameAlert): void {
		alertsOpen = false;
		onSelectAlert(alert);
	}

	// Standard dropdown behaviour: dismiss the popover on any pointer press outside it.
	// (Escape is handled centrally in the page keydown chain via the bound `alertsOpen`.)
	// The attachment is only applied while `alertsOpen` is true (conditional-attachment
	// pattern), so the global listener is registered on open and torn down on close — no
	// always-on window listener and no implicit re-run contract inside the body.
	const dismissAlertsOnOutsidePointer: Attachment<HTMLElement> = (node) => {
		return on(window, 'pointerdown', (event) => {
			if (!node.contains(event.target as Node)) {
				alertsOpen = false;
			}
		});
	};

	function formatAlertCount(count: number): string {
		return i18n.t(count === 1 ? 'topBar.alertCount.one' : 'topBar.alertCount.other', {
			count
		});
	}
</script>

<header
	class="top-bar plaque"
	class:world-view={activeMapView === 'world'}
	aria-label={i18n.t('topBar.statusBar')}
>
	<div class="location">
		<p class="eyebrow">{eyebrow}</p>
		<h1>{title}</h1>
	</div>

	<nav
		aria-hidden={menuOpen}
		inert={menuOpen}
		class="map-tabs"
		aria-label={i18n.t('gameMenu.menu')}
	>
		{#each ['retail', 'industry', 'world'] as view (view)}
			<button
				type="button"
				aria-label={i18n.t(`route.mapEyebrow.${view}` as 'route.mapEyebrow.retail')}
				title={i18n.t(`route.mapEyebrow.${view}` as 'route.mapEyebrow.retail')}
				aria-pressed={activeMapView === view}
				onclick={() => onSelectView(view as MapViewId)}><HudIcon name={view as MapViewId} /></button
			>
		{/each}
	</nav>
	<div class="readouts">
		{#if activeMapView === 'industry'}
			<div
				class="inventory-readouts"
				aria-label={i18n.t('industryTileInspector.cityInventoryMaterials')}
			>
				{#each inventoryReadouts as materialId (materialId)}
					<span
						class="inventory-count"
						title={i18n.labels.material(materialId)}
						aria-label={`${i18n.labels.material(materialId)}: ${i18n.format.integer(industryInventory[materialId] ?? 0)}`}
					>
						<img
							src={asset(getIndustryMaterialArt(materialId))}
							alt=""
							width="32"
							height="32"
						/>{i18n.format.integer(industryInventory[materialId] ?? 0)}
					</span>
				{/each}
			</div>
		{:else if day !== null}
			<span
				class="ticker day-ticker"
				aria-label={i18n.t('topBar.day', { day: i18n.format.integer(day) })}
			>
				<HudIcon name="clock" />{i18n.format.integer(day)}
			</span>
		{/if}
		{#if cash !== null}
			<span class="ticker" aria-label={i18n.t('topBar.cash')} data-testid="cash-readout">
				{i18n.format.currency(cash)}
			</span>
		{/if}

		{#if activeMapView !== 'industry' && cashHistory.length > 1}
			<svg class="cash-trend" viewBox="0 0 100 28" aria-hidden="true"
				><polyline points={cashPoints} fill="none" stroke="var(--moss)" stroke-width="2" /></svg
			>
		{/if}
		<div class="alerts" {@attach alertsOpen && dismissAlertsOnOutsidePointer}>
			<button
				type="button"
				class="btn-icon alerts-bell"
				aria-label={alerts.length > 0 ? formatAlertCount(alerts.length) : i18n.t('topBar.alerts')}
				aria-expanded={alertsOpen}
				onclick={toggleAlerts}
			>
				<svg aria-hidden="true" viewBox="0 0 24 24">
					<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
					<path d="M10 20a2 2 0 0 0 4 0" />
				</svg>
				{#if alerts.length > 0}
					<span class="seal alert-count" data-urgent="true">{alerts.length}</span>
				{/if}
			</button>
			<p class="alerts-announce" aria-live="polite" role="status">
				{#if alerts.length > 0}
					{formatAlertCount(alerts.length)}
				{/if}
			</p>

			{#if alertsOpen}
				<div class="alerts-popover paper" role="group" aria-label={i18n.t('topBar.alertsList')}>
					{#if alerts.length === 0}
						<p class="muted">{i18n.t('topBar.noAlerts')}</p>
					{:else}
						{#each alerts as alert (alert.id)}
							<button type="button" class="alert-row" onclick={() => selectAlert(alert)}>
								{alert.message}
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>

		<GameMenu
			{activeMapView}
			{i18n}
			{activeLocale}
			{onSelectView}
			{onSelectLocale}
			{menuContent}
			bind:open={menuOpen}
		/>
	</div>
</header>

<style>
	.inventory-readouts {
		display: flex;
		align-items: center;
		gap: 14px;
		padding-right: 16px;
		border-right: 1px solid var(--brass-500);
	}
	.inventory-count {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
		font: 700 18px var(--font-mono);
	}
	.inventory-count img {
		object-fit: contain;
	}
	@media (max-width: 900px) {
		.inventory-readouts {
			gap: 6px;
			padding-right: 8px;
		}
		.inventory-count {
			font-size: 12px;
		}
		.inventory-count img {
			width: 24px;
			height: 24px;
		}
	}
	.top-bar {
		position: fixed;
		top: 0.75rem;
		left: 6.75rem;
		right: 0.75rem;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		gap: 1rem;
		pointer-events: auto;
	}

	.location,
	.readouts {
		padding: 0;
	}

	.location {
		pointer-events: none;
	}

	.location h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 400;
		line-height: 1.05;
		color: var(--ink-700);
	}

	.location .eyebrow {
		margin: 0;
		display: none;
	}

	.readouts {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.day-ticker {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.day-ticker :global(svg) {
		width: 18px;
		height: 18px;
		color: var(--brass-700);
	}
	.ticker {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 20px;
		font-weight: 700;
		color: var(--ink-700);
		white-space: nowrap;
	}

	.alerts {
		position: relative;
	}

	.alerts-announce {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.alerts-bell {
		width: 2.4rem;
		height: 2.4rem;
	}

	.alert-count {
		position: absolute;
		top: -0.35rem;
		right: -0.35rem;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.3rem;
	}

	.alerts-popover {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		z-index: 31;
		display: grid;
		gap: 0.35rem;
		width: min(20rem, 80vw);
		max-height: 60vh;
		overflow: auto;
		padding: 0.6rem;
	}

	.alert-row {
		width: 100%;
		text-align: left;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 0.5rem 0.6rem;
	}

	.alert-row:hover,
	.alert-row:focus-visible {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.muted {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.85rem;
	}
	.map-tabs {
		display: flex;
		margin-right: auto;
	}
	.map-tabs button {
		display: grid;
		place-items: center;
		width: 2.8rem;
		height: 2.6rem;
		border: 1px solid var(--brass-500);
		background: var(--paper-50);
		color: var(--ink-700);
	}
	.map-tabs button[aria-pressed='true'] {
		background: var(--paper-300);
	}
	.map-tabs button:focus-visible {
		outline: 2px solid var(--wax-red);
		outline-offset: 2px;
	}
	@media (max-width: 760px) {
		.top-bar {
			gap: 0.3rem;
		}
		.location,
		.readouts {
			padding: 0.3rem;
		}
		.location h1 {
			font-size: 1rem;
		}
		.readouts {
			gap: 0.4rem;
		}
		.ticker {
			font-size: 0.75rem;
		}
	}
	@media (max-width: 600px) {
		.top-bar {
			left: 0.5rem;
			right: 0.5rem;
			top: 0.5rem;
			flex-wrap: wrap;
		}
		.location {
			flex: 1;
		}
		.readouts {
			width: 100%;
			justify-content: flex-end;
			border-top: 1px solid var(--paper-edge);
		}
		.map-tabs {
			margin-right: 0;
		}
	}
	.cash-trend {
		width: 6rem;
		height: 1.75rem;
	}
	@media (max-width: 900px) {
		.cash-trend {
			display: none;
		}
	}
	.world-view {
		left: 0.75rem;
	}
</style>
