<script lang="ts">
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		i18n: I18nBundle;
		title: string;
		versionLabel: string;
		pending: boolean;
		onDetails: () => void | Promise<void>;
		onRestart: () => void | Promise<void>;
		onCatalog: () => void | Promise<void>;
		onSandbox: () => void | Promise<void>;
		onAbandon: () => void | Promise<void>;
	}

	let {
		i18n,
		title,
		versionLabel,
		pending,
		onDetails,
		onRestart,
		onCatalog,
		onSandbox,
		onAbandon
	}: Props = $props();
	let confirmingAbandon = $state(false);
</script>

<div class="scenario-menu">
	<p class="title">{title}</p>
	<p>{versionLabel}</p>
	<button type="button" disabled={pending} onclick={() => void onDetails()}>
		{i18n.t('scenarioCatalog.challengeDetails')}
	</button>
	<button type="button" disabled={pending} onclick={() => void onRestart()}>
		{i18n.t('scenarioCatalog.restartChallenge')}
	</button>
	<button type="button" disabled={pending} onclick={() => void onCatalog()}>
		{i18n.t('scenarioCatalog.catalog')}
	</button>
	<button type="button" disabled={pending} onclick={() => void onSandbox()}>
		{i18n.t('scenarioCatalog.returnSandbox')}
	</button>
	<button type="button" disabled={pending} onclick={() => (confirmingAbandon = true)}>
		{i18n.t('scenarioCatalog.abandon')}
	</button>
	{#if confirmingAbandon}
		<button
			type="button"
			disabled={pending}
			onclick={() => {
				confirmingAbandon = false;
				void onAbandon();
			}}
		>
			{i18n.t('scenarioCatalog.confirmAbandon')}
		</button>
	{/if}
</div>

<style>
	.scenario-menu {
		display: grid;
		gap: 0.45rem;
	}
	.scenario-menu p {
		margin: 0;
	}
	.title {
		font-weight: 700;
	}
</style>
