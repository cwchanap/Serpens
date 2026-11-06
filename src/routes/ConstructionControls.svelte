<script lang="ts">
	import BuildMenu from '$lib/components/game/BuildMenu.svelte';
	import FinancePurchaseReviewHost from './FinancePurchaseReviewHost.svelte';
	import type { ProductId } from '$lib/game/types';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';
	import type { I18nBundle } from '$lib/i18n';
	import type { createConstructionUi } from './constructionUi.svelte';

	interface Props {
		ui: ReturnType<typeof createConstructionUi>;
		i18n: I18nBundle;
		cash: number;
		view: MapViewId;
		/** True while the guidance card owns the bottom strip: the plaque slots above it. */
		guidanceVisible: boolean;
		onOpenAdvisor(productId?: ProductId): void;
	}

	let { ui, i18n, cash, view, guidanceVisible, onOpenAdvisor }: Props = $props();
</script>

{#if ui.isPlacementModeActive}
	<div
		class="placement-status plaque z-[26]"
		class:opening-guidance-visible={guidanceVisible}
		role="status"
		aria-label={i18n.t('route.placement.status')}
	>
		<span>{ui.placementStatusText}</span>
		<button type="button" class="btn-danger" onclick={ui.cancel}>
			{i18n.t('route.placement.cancel')}
		</button>
	</div>
{/if}
<FinancePurchaseReviewHost
	review={ui.purchaseReview}
	{cash}
	{i18n}
	formatApr={i18n.format.apr}
	onConfirm={ui.confirmReview}
	onDismiss={ui.closeReview}
/>
{#if ui.isMenuOpen && view !== 'world'}
	<BuildMenu
		activeMapView={view === 'industry' ? 'industry' : 'retail'}
		{i18n}
		retailOptions={ui.retailBuildOptions}
		industryOptions={ui.industrialBuildOptions}
		industryLockedReason={ui.industryLockedReason}
		availableMaterialIds={ui.availableMaterialIds}
		canOpenStore={ui.canOpenStore}
		canFinanceRetailStore={ui.canFinanceRetailStore}
		canBuildIndustrialBuilding={ui.canBuildIndustrialBuilding}
		canFinanceIndustrialBuilding={ui.canFinanceIndustrialBuilding}
		allowedRetailArchetypeIds={ui.allowedRetailArchetypeIds}
		allowedIndustryBuildingTypeIds={ui.allowedIndustryBuildingTypeIds}
		disabledReason={ui.menuDisabledReason}
		onChooseRetail={ui.armRetail}
		onChooseIndustry={ui.armIndustry}
		{onOpenAdvisor}
		onClose={ui.closeMenu}
	/>
{/if}

<style>
	.placement-status {
		position: absolute;
		left: 6rem;
		bottom: 4.5rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		max-width: min(32rem, calc(100vw - 2rem));
		padding: 0.65rem 0.8rem;
	}

	/* While the guidance card owns the bottom strip, the plaque takes the
	   non-overlapping slot directly above the measured card — the default
	   4.5rem bottom edge sits inside the card's band, so the opaque plaque
	   would otherwise paint over the card's reason text. The measured card
	   height is inherited through --og-card-h from the root layout. */
	.placement-status.opening-guidance-visible {
		bottom: calc(5.75rem + var(--og-card-h, 0px) + 0.5rem);
	}

	.placement-status span {
		min-width: 0;
		color: var(--ink-700);
		font-family: var(--font-body);
		font-size: 0.9rem;
		font-style: italic;
	}

	@media (max-width: 600px) {
		.placement-status {
			left: 0.5rem;
			bottom: 8.6rem;
		}

		/* Mobile mirror of the desktop slot: the card holds 8.6rem off the
		   bottom, so the plaque clears the measured card top instead of
		   landing on its bottom edge. */
		.placement-status.opening-guidance-visible {
			bottom: calc(8.6rem + var(--og-card-h, 0px) + 0.5rem);
		}
	}
</style>
