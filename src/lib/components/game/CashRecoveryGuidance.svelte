<script lang="ts">
	import type { CashRecoveryPlan, CashRecoveryStep } from '$lib/game/cashRecovery';
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		plan: CashRecoveryPlan;
		i18n: I18nBundle;
		onStep: (step: CashRecoveryStep) => void;
		onDismiss?: () => void;
	}

	let { plan, i18n, onStep, onDismiss }: Props = $props();

	function stepLabel(step: CashRecoveryStep): string {
		switch (step.kind) {
			case 'restock':
				return i18n.t('cashRecovery.steps.restock');
			case 'finance':
				return i18n.t('cashRecovery.steps.finance');
			case 'release-idle-staff':
				return i18n.t(
					(step.count === 1
						? 'cashRecovery.steps.releaseIdleStaff.one'
						: 'cashRecovery.steps.releaseIdleStaff.other') as never,
					{ count: i18n.format.integer(step.count) }
				);
			case 'review-payroll':
				return i18n.t('cashRecovery.steps.reviewPayroll');
			case 'pause-routes':
				return i18n.t(
					(step.count === 1
						? 'cashRecovery.steps.pauseRoutes.one'
						: 'cashRecovery.steps.pauseRoutes.other') as never,
					{ count: i18n.format.integer(step.count) }
				);
		}
	}
</script>

<section
	class="panel paper"
	aria-labelledby="cash-recovery-heading"
	data-testid="cash-recovery-guidance"
>
	<h2 id="cash-recovery-heading">{i18n.t('cashRecovery.heading')}</h2>
	<p>{i18n.t('cashRecovery.reason')}</p>
	<div class="actions">
		<ol class="steps">
			{#each plan.steps as step, index (step.kind)}
				<li>
					<button
						type="button"
						class={index === 0 ? 'btn-primary' : undefined}
						data-testid="cash-recovery-step-{step.kind}"
						onclick={() => onStep(step)}
					>
						{stepLabel(step)}
					</button>
				</li>
			{/each}
		</ol>
		{#if onDismiss}
			<button type="button" class="dismiss" data-testid="cash-recovery-dismiss" onclick={onDismiss}>
				{i18n.t('cashRecovery.dismiss')}
			</button>
		{/if}
	</div>
</section>

<style>
	.panel {
		display: grid;
		gap: 0.55rem;
		padding: 0.9rem 1rem;
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-700);
	}

	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.dismiss {
		margin-left: auto;
	}
</style>
