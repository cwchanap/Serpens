<script lang="ts">
	import { focusTrap } from '$lib/a11y/focusTrap';
	import type { I18nBundle } from '$lib/i18n';
	import type { AdvisorChain } from '$lib/game/supplyAdvisor';
	import type { IndustrialBuildingTypeId } from '$lib/game/types';

	interface Props {
		chains: AdvisorChain[];
		i18n: I18nBundle;
		onBuild: (buildingTypeId: IndustrialBuildingTypeId) => void;
		onClose: () => void;
	}

	let { chains, i18n, onBuild, onClose }: Props = $props();

	function stateMark(state: AdvisorChain['steps'][number]['state']): string {
		if (state === 'built') return '✓';
		if (state === 'buildable') return '→';
		return '·';
	}
</script>

<div class="advisor-backdrop">
	<button
		type="button"
		class="backdrop-button"
		tabindex="-1"
		aria-label={i18n.t('supplyAdvisor.dismiss')}
		onclick={onClose}
	></button>
	<div
		class="advisor paper"
		role="dialog"
		aria-modal="true"
		aria-label={i18n.t('supplyAdvisor.dialog')}
		{@attach focusTrap}
	>
		<header>
			<div>
				<p class="eyebrow">{i18n.t('supplyAdvisor.eyebrow')}</p>
				<h2>{i18n.t('supplyAdvisor.title')}</h2>
			</div>
			<button
				type="button"
				class="btn-danger"
				aria-label={i18n.t('supplyAdvisor.closeLabel')}
				onclick={onClose}>{i18n.t('supplyAdvisor.close')}</button
			>
		</header>

		{#if chains.length === 0}
			<p class="muted">{i18n.t('supplyAdvisor.empty')}</p>
		{:else}
			<div class="chains">
				{#each chains as chain (chain.finishedMaterialId)}
					{@const categoryName = i18n.labels.material(chain.finishedMaterialId)}
					<section class="chain" aria-label={i18n.t('supplyAdvisor.chainLabel', { categoryName })}>
						<div class="chain-heading">
							<h3>{categoryName}</h3>
							{#if chain.tier === 1}<span class="starter">{i18n.t('supplyAdvisor.starter')}</span
								>{/if}
							{#if chain.complete}<span class="done">{i18n.t('supplyAdvisor.supplied')}</span>{/if}
						</div>
						<ol class="steps">
							{#each chain.steps as step (step.buildingTypeId)}
								{@const buildingName = i18n.labels.industrialBuilding(step.buildingTypeId)}
								<li class={`step ${step.state}`}>
									<span class="mark" aria-hidden="true">{stateMark(step.state)}</span>
									<span class="step-name">{buildingName}</span>
									{#if step.isNextBuild}
										<button
											type="button"
											class="build-next"
											onclick={() => onBuild(step.buildingTypeId)}
										>
											{i18n.t('supplyAdvisor.build', { buildingName })}
										</button>
									{/if}
								</li>
							{/each}
						</ol>
					</section>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.advisor-backdrop {
		position: fixed;
		inset: 0;
		z-index: 46;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.72);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		background: transparent;
		padding: 0;
	}

	.advisor {
		position: relative;
		z-index: 1;
		width: min(40rem, 100%);
		max-height: calc(100vh - 2rem);
		overflow: auto;
		padding: 1.2rem;
		display: grid;
		gap: 1rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.chains {
		display: grid;
		gap: 0.85rem;
	}

	.chain {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.8rem;
		display: grid;
		gap: 0.6rem;
	}

	.chain-heading {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.starter {
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		background: var(--brass-100);
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.1rem 0.5rem;
	}

	.done {
		color: var(--moss);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
	}

	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.88rem;
		color: var(--ink-700);
	}

	.step.blocked .step-name {
		color: var(--ink-400);
	}

	.mark {
		width: 1.2rem;
		text-align: center;
		font-family: var(--font-mono);
		color: var(--brass-700);
	}

	.step.built .mark {
		color: var(--moss);
	}

	.build-next {
		margin-left: auto;
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		background: var(--moss);
		color: var(--paper-50);
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 0.78rem;
		padding: 0.35rem 0.7rem;
	}

	.build-next:hover,
	.build-next:focus-visible {
		background: var(--moss-2);
	}

	.muted {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
	}
</style>
