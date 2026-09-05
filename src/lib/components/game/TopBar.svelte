<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import type { LocalizedGameAlert } from '$lib/i18n/localizedTypes';
	import type { I18nBundle, SupportedLocale } from '$lib/i18n';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';
	import type { CashTrend } from '$lib/game/reports';
	import GameIcon from './GameIcon.svelte';
	import GameMenu from './GameMenu.svelte';

	interface Props {
		eyebrow: string;
		title: string;
		day: number | null;
		cash: number | null;
		cashTrend?: CashTrend | null;
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
		cashTrend = null,
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

	const mapViews = $derived([
		{ id: 'retail', icon: 'retail', label: i18n.t('route.mapEyebrow.retail') },
		{ id: 'industry', icon: 'industry', label: i18n.t('route.mapEyebrow.industry') },
		{ id: 'world', icon: 'world', label: i18n.t('route.mapEyebrow.world') }
	] as const);
</script>

<header class="top-bar" aria-label={i18n.t('topBar.statusBar')}>
	<div class="location-stack">
		<div class="location plaque">
			<span class="medallion" aria-hidden="true">
				<GameIcon name={activeMapView} />
			</span>
			<span class="plaque-divider" aria-hidden="true"></span>
			<div>
				<p class="eyebrow">{eyebrow}</p>
				<h1>{title}</h1>
			</div>
		</div>

		<div class="map-controls" role="group" aria-label={i18n.t('gameMenu.mapView')}>
			{#each mapViews as view (view.id)}
				<button
					type="button"
					class="btn-icon map-button"
					class:active={activeMapView === view.id}
					aria-label={view.label}
					aria-pressed={activeMapView === view.id}
					onclick={() => onSelectView(view.id)}
				>
					<GameIcon name={view.icon} />
				</button>
			{/each}
		</div>
	</div>

	<div class="readouts plaque">
		<span class="ticker">
			<GameIcon name="day" />
			{#if day !== null}
				<span aria-label={i18n.t('topBar.day', { day: i18n.format.integer(day) })}>
					{i18n.t('topBar.day', { day: i18n.format.integer(day) })}
				</span>
			{:else}
				<span class="placeholder">{i18n.t('topBar.day', { day: '—' })}</span>
			{/if}
		</span>
		<span class="ticker" data-testid="cash-readout">
			<GameIcon name="cash" />
			{#if cash !== null}
				<span aria-label={i18n.t('topBar.cash')}>{i18n.format.currency(cash)}</span>
			{:else}
				<span class="placeholder" aria-label={i18n.t('topBar.cash')}>—</span>
			{/if}
			{#if cashTrend}
				<span
					class="trend-chip"
					class:up={cashTrend.direction === 'up'}
					class:down={cashTrend.direction === 'down'}
					data-testid="cash-trend"
					aria-label={cashTrend.percent !== null
						? i18n.t(
								cashTrend.direction === 'up' ? 'topBar.cashTrend.up' : 'topBar.cashTrend.down',
								{ percent: i18n.format.percent1(cashTrend.percent) }
							)
						: i18n.t(
								cashTrend.direction === 'up'
									? 'topBar.cashTrend.upOnly'
									: 'topBar.cashTrend.downOnly'
							)}
				>
					{cashTrend.direction === 'up' ? '▲' : '▼'}
					{cashTrend.percent !== null ? i18n.format.percent1(cashTrend.percent) : ''}
				</span>
			{/if}
		</span>

		<div class="alerts" {@attach alertsOpen && dismissAlertsOnOutsidePointer}>
			<button
				type="button"
				class="btn-icon alerts-bell"
				aria-label={alerts.length > 0 ? formatAlertCount(alerts.length) : i18n.t('topBar.alerts')}
				aria-expanded={alertsOpen}
				onclick={toggleAlerts}
			>
				<GameIcon name="alerts" />
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

		<GameMenu {i18n} {activeLocale} {onSelectLocale} {menuContent} bind:open={menuOpen} />
	</div>
</header>

<style>
	.top-bar {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		right: 0.75rem;
		z-index: 30;
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		pointer-events: none;
	}

	.location,
	.readouts {
		padding: 0.5rem 0.85rem;
	}

	.location-stack {
		pointer-events: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		/* >=1.5rem column gap keeps the floating map-view medallions clear of
		   the location plaque (mock: the cluster breathes beside the plaque). */
		gap: 0.5rem 1.5rem;
	}

	.location {
		pointer-events: none;
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	/* Slim vertical divider between the brass medallion and the copy. */
	.plaque-divider {
		flex: none;
		align-self: stretch;
		width: 1px;
		background: linear-gradient(
			to bottom,
			transparent,
			var(--brass-500) 22%,
			var(--brass-500) 78%,
			transparent
		);
	}

	.medallion {
		flex: none;
		display: grid;
		place-items: center;
		width: 3.5rem;
		height: 3.5rem;
		color: var(--walnut-900);
		background: radial-gradient(
			circle at 32% 28%,
			var(--brass-100) 0%,
			var(--brass-500) 62%,
			var(--brass-700) 100%
		);
		border: 1.5px solid var(--brass-700);
		border-radius: 999px;
		box-shadow: inset 0 0 0 2px var(--brass-100);
	}

	.location h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.7rem;
		font-weight: 400;
		line-height: 1.05;
		color: var(--ink-700);
	}

	.location .eyebrow {
		margin: 0;
	}

	.map-controls {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.map-button.active {
		background: var(--brass-500);
		color: var(--paper-50);
	}

	.readouts {
		pointer-events: auto;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 0.85rem;
	}

	.ticker {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 0.9rem;
		color: var(--ink-700);
		white-space: nowrap;
	}

	.placeholder {
		color: var(--ink-400);
	}

	.trend-chip {
		padding: 0.12rem 0.45rem;
		border: 1px solid var(--ink-900);
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums lining-nums;
		line-height: 1.1;
		color: var(--paper-50);
	}

	.trend-chip.up {
		background: var(--moss);
		box-shadow: inset 0 0 0 1px var(--moss-2);
	}

	.trend-chip.down {
		background: var(--wax-red);
		box-shadow: inset 0 0 0 1px var(--wax-red-2);
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
</style>
