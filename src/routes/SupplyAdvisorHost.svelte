<script lang="ts">
	import SupplyAdvisor from '$lib/components/game/SupplyAdvisor.svelte';
	import type { I18nBundle } from '$lib/i18n';
	import type { createSupplyPlannerUi } from './supplyPlannerUi.svelte';

	interface Props {
		ui: ReturnType<typeof createSupplyPlannerUi>;
		i18n: I18nBundle;
	}

	let { ui, i18n }: Props = $props();
</script>

{#if ui.isOpen}
	<SupplyAdvisor
		result={ui.result}
		productIds={ui.productIds}
		selectedProductId={ui.effectiveProductId}
		horizonDays={ui.context.horizonDays}
		{i18n}
		onSelectProduct={ui.selectProduct}
		onSelectHorizon={ui.selectHorizon}
		onAction={ui.handleAction}
		onClose={ui.close}
	/>
{/if}
