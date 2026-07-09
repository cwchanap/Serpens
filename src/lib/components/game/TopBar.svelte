<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import type { GameAlert } from '$lib/game/alerts';
	import { localizeAlert } from '$lib/i18n/gameCopy';
	import type { GameState } from '$lib/game/types';
	import type { I18nBundle, SupportedLocale } from '$lib/i18n';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';
	import GameMenu from './GameMenu.svelte';

	interface Props {
		eyebrow: string;
		title: string;
		day: number | null;
		cash: number | null;
		alerts: GameAlert[];
		alertGame: GameState;
		i18n: I18nBundle;
		activeLocale: SupportedLocale;
		onSelectAlert: (alert: GameAlert) => void;
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
		alerts,
		alertGame,
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

	function selectAlert(alert: GameAlert): void {
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
		return i18n.t((count === 1 ? 'topBar.alertCount.one' : 'topBar.alertCount.other') as never, {
			count
		});
	}
</script>

<header class="top-bar" aria-label="Status bar">
	<div class="location plaque">
		<p class="eyebrow">{eyebrow}</p>
		<h1>{title}</h1>
	</div>

	<div class="readouts plaque">
		{#if day !== null}
			<span class="ticker" aria-label={i18n.t('topBar.day', { day })}>
				{i18n.t('topBar.day', { day })}
			</span>
		{/if}
		{#if cash !== null}
			<span class="ticker" aria-label={i18n.t('topBar.cash')} data-testid="cash-readout">
				{i18n.format.currency(cash)}
			</span>
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
								{localizeAlert(alert, alertGame, i18n)}
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
	.top-bar {
		position: fixed;
		top: 0.75rem;
		left: 0.75rem;
		right: 0.75rem;
		z-index: 30;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		pointer-events: none;
	}

	.location,
	.readouts {
		padding: 0.5rem 0.85rem;
	}

	.location {
		pointer-events: none;
	}

	.location h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		line-height: 1.05;
		color: var(--ink-700);
	}

	.location .eyebrow {
		margin: 0;
	}

	.readouts {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.ticker {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 0.9rem;
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
</style>
