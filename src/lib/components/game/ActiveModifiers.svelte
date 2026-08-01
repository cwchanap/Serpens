<script lang="ts">
	import type { ActiveEventModifier } from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';
	import { localizeEventSourceTitle, localizeStructuredCopy } from '$lib/i18n/gameCopy';

	let {
		modifiers,
		day,
		i18n
	}: { modifiers: ActiveEventModifier[]; day: number; i18n: I18nBundle } = $props();

	const sortedModifiers = $derived(
		[...modifiers].sort(
			(left, right) =>
				left.expiresOnDay - right.expiresOnDay ||
				(left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
		)
	);

	function discountPercent(modifier: ActiveEventModifier): number {
		return Math.round((1 - modifier.effect.multiplier) * 100);
	}

	function remainingDays(modifier: ActiveEventModifier): number {
		return Math.max(0, modifier.expiresOnDay - day);
	}
</script>

<section class="panel paper" aria-labelledby="active-modifiers-heading">
	<h2 id="active-modifiers-heading">{i18n.t('activeModifiers.title')}</h2>

	{#if sortedModifiers.length === 0}
		<p class="empty">{i18n.t('activeModifiers.empty')}</p>
	{:else}
		<div class="modifier-list">
			{#each sortedModifiers as modifier (modifier.id)}
				{@const title = localizeEventSourceTitle(modifier.source.eventId, i18n)}
				{@const daysRemaining = remainingDays(modifier)}
				<article aria-label={title}>
					<div class="modifier-heading">
						<h3>{title}</h3>
						{#if modifier.importance === 'important'}
							<span class="seal" data-urgent="true">{i18n.t('copy.modifiers.important')}</span>
						{/if}
					</div>
					<p>{localizeStructuredCopy(modifier.explanation, i18n)}</p>
					<dl>
						<div>
							<dt>{i18n.t('copy.modifiers.companyTarget')}</dt>
							<dd>
								{i18n.t('copy.modifiers.importCostDiscount', {
									percent: i18n.format.integer(discountPercent(modifier))
								})}
							</dd>
						</div>
						<div>
							<dt>
								{i18n.t('copy.modifiers.startsOnDay', {
									day: i18n.format.integer(modifier.startsOnDay)
								})}
							</dt>
							<dd>
								{i18n.t('copy.modifiers.expiresAfterDay', {
									day: i18n.format.integer(modifier.expiresOnDay - 1)
								})}
							</dd>
						</div>
					</dl>
					<p class="remaining">
						{i18n.t(
							daysRemaining === 1
								? 'activeModifiers.remainingDays.one'
								: 'activeModifiers.remainingDays.other',
							{ days: i18n.format.integer(daysRemaining) }
						)}
					</p>
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2,
	h3,
	p,
	dl,
	dd {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.modifier-list,
	article,
	dl {
		display: grid;
		gap: 0.65rem;
	}

	article {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.85rem;
	}

	.modifier-heading,
	dl div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	p,
	dt,
	dd {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.88rem;
	}

	dt {
		font-weight: 700;
	}

	.remaining {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
</style>
