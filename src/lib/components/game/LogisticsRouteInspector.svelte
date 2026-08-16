<script lang="ts">
	import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
	import type { I18nBundle } from '$lib/i18n';
	import { localizeEventSourceTitle, localizeRouteModifierImpact } from '$lib/i18n/gameCopy';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';

	interface Props {
		route: RouteOperationalSummary;
		i18n: I18nBundle;
		onManageRoute: (routeId: string) => void;
		onClose: () => void;
	}

	let { route, i18n, onManageRoute, onClose }: Props = $props();

	const originName = $derived(i18n.labels.worldCity(route.route.originCityId).name);
	const destinationName = $derived(i18n.labels.worldCity(route.route.destinationCityId).name);
	const materialName = $derived(i18n.labels.material(route.route.materialId));
	const stateLabel = $derived(i18n.t(`logisticsPanel.states.${route.route.state}` as never));
	const conditionLabel = $derived(i18n.t(`logisticsPanel.conditions.${route.condition}` as never));
	const leadTimeChanged = $derived(route.effective.leadTimeDays !== route.route.leadTimeDays);
	const transportCostChanged = $derived(
		route.effective.transportCostPerUnit !== route.route.transportCostPerUnit
	);

	function stopMapInteraction(event: Event): void {
		event.stopPropagation();
	}

	const blockMapInteraction: Attachment<HTMLElement> = (node) => {
		const cleanups = [
			on(node, 'pointerdown', stopMapInteraction),
			on(node, 'pointerup', stopMapInteraction),
			on(node, 'click', stopMapInteraction)
		];

		return () => {
			for (const cleanup of cleanups) cleanup();
		};
	};
</script>

<aside
	class="inspector"
	aria-label={i18n.t('logisticsRouteInspector.ariaLabel')}
	{@attach blockMapInteraction}
>
	<button
		type="button"
		class="close"
		aria-label={i18n.t('logisticsRouteInspector.close')}
		onclick={onClose}>×</button
	>

	<div class="heading">
		<div>
			<p>{i18n.t('logisticsRouteInspector.eyebrow')}</p>
			<h2>{originName} → {destinationName}</h2>
		</div>
		<span>{materialName}</span>
	</div>

	<section aria-label={i18n.t('logisticsRouteInspector.summary')}>
		<dl>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.endpoints')}</dt>
				<dd>{originName} → {destinationName}</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.material')}</dt>
				<dd>{materialName}</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.state')}</dt>
				<dd>{stateLabel}</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.condition')}</dt>
				<dd>{conditionLabel}</dd>
			</div>
			{#if route.effective.dispatchSuspended}
				<div>
					<dt>{i18n.t('logisticsRouteInspector.dispatchSuspension')}</dt>
					<dd data-testid="route-dispatch-suspended">
						{i18n.t('logisticsRouteInspector.dispatchSuspended')}
					</dd>
				</div>
			{/if}
		</dl>
	</section>

	<section aria-label={i18n.t('logisticsRouteInspector.schedule')}>
		<h3>{i18n.t('logisticsRouteInspector.schedule')}</h3>
		<dl>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.frequency')}</dt>
				<dd>
					{i18n.t('logisticsRouteInspector.everyDays', {
						days: i18n.format.integer(route.route.frequencyDays)
					})}
				</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.leadTime')}</dt>
				<dd>
					{#if leadTimeChanged}
						{i18n.t('logisticsRouteInspector.daysChanged', {
							from: i18n.format.integer(route.route.leadTimeDays),
							to: i18n.format.integer(route.effective.leadTimeDays)
						})}
					{:else}
						{i18n.t('logisticsRouteInspector.days', {
							days: i18n.format.integer(route.route.leadTimeDays)
						})}
					{/if}
				</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.nextDispatch')}</dt>
				<dd>
					{i18n.t('logisticsRouteInspector.day', {
						day: i18n.format.integer(route.route.nextDispatchOnDay)
					})}
				</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.capacity')}</dt>
				<dd data-testid="route-configured-capacity">
					{i18n.format.integer(route.route.capacity)}
				</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.effectiveCapacity')}</dt>
				<dd data-testid="route-effective-capacity">
					{i18n.format.integer(route.effective.capacity)}
				</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.transportCostPerUnit')}</dt>
				<dd>
					{#if transportCostChanged}
						{i18n.t('logisticsRouteInspector.currencyRange', {
							from: i18n.format.currency(route.route.transportCostPerUnit),
							to: i18n.format.currency(route.effective.transportCostPerUnit)
						})}
					{:else}
						{i18n.format.currency(route.route.transportCostPerUnit)}
					{/if}
				</dd>
			</div>
		</dl>
	</section>

	<section aria-label={i18n.t('logisticsRouteInspector.latestAttempt')}>
		<h3>{i18n.t('logisticsRouteInspector.latestAttempt')}</h3>
		{#if route.latestAttempt}
			<dl>
				<div>
					<dt>{i18n.t('logisticsRouteInspector.destinationNeed')}</dt>
					<dd data-testid="route-attempt-destination-need">
						{i18n.format.integer(route.latestAttempt.destinationNeed)}
					</dd>
				</div>
				<div>
					<dt>{i18n.t('logisticsRouteInspector.attemptCapacity')}</dt>
					<dd data-testid="route-attempt-capacity">
						{i18n.format.integer(route.latestAttempt.capacity)}
					</dd>
				</div>
				<div>
					<dt>{i18n.t('logisticsRouteInspector.dispatchedQuantity')}</dt>
					<dd data-testid="route-attempt-dispatched">
						{i18n.format.integer(route.latestAttempt.dispatchedQuantity)}
					</dd>
				</div>
				<div>
					<dt>{i18n.t('logisticsRouteInspector.unusedCapacity')}</dt>
					<dd data-testid="route-attempt-unused-capacity">
						{i18n.format.integer(route.latestAttempt.unusedCapacity)}
					</dd>
				</div>
				<div>
					<dt>{i18n.t('logisticsRouteInspector.unmetDestinationNeed')}</dt>
					<dd data-testid="route-attempt-unmet-need">
						{i18n.format.integer(route.latestAttempt.unmetDestinationNeed)}
					</dd>
				</div>
				<div>
					<dt>{i18n.t('logisticsRouteInspector.attemptTransportCost')}</dt>
					<dd>{i18n.format.currency(route.latestAttempt.transportCost)}</dd>
				</div>
			</dl>
			{#if route.latestAttempt.modifierImpacts.length > 0}
				<p class="muted">{i18n.t('logisticsRouteInspector.modifierImpactsTitle')}</p>
				<ul class="impact-list">
					{#each route.latestAttempt.modifierImpacts as impact, index (`${impact.effectKind}-${index}`)}
						<li>
							<span>{localizeRouteModifierImpact(impact, i18n)}</span>
							{#each impact.contributors as contributor (contributor.modifierId)}
								<span>
									{i18n.t('copy.modifiers.impactSource', {
										source: localizeEventSourceTitle(contributor.source.eventId, i18n)
									})}
								</span>
							{/each}
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<p class="muted">{i18n.t('logisticsRouteInspector.noLatestAttempt')}</p>
		{/if}
	</section>

	<section aria-label={i18n.t('logisticsRouteInspector.operationalTotals')}>
		<h3>{i18n.t('logisticsRouteInspector.operationalTotals')}</h3>
		<dl>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.utilization')}</dt>
				<dd data-testid="route-utilization">
					{route.utilization === null ? '—' : i18n.format.percent(route.utilization)}
				</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.delivered')}</dt>
				<dd data-testid="route-delivered-total">{i18n.format.integer(route.deliveredUnits)}</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.inTransit')}</dt>
				<dd data-testid="route-in-transit-total">
					{i18n.format.integer(route.inTransitQuantity)}
				</dd>
			</div>
			<div>
				<dt>{i18n.t('logisticsRouteInspector.transportCost')}</dt>
				<dd>{i18n.format.currency(route.transportCost)}</dd>
			</div>
		</dl>
		<p class="muted">{i18n.t('logisticsRouteInspector.utilizationNote')}</p>
	</section>

	<div class="actions">
		<button type="button" class="manage" onclick={() => onManageRoute(route.route.id)}>
			{i18n.t('logisticsRouteInspector.manageRoute')}
		</button>
	</div>
</aside>

<style>
	.inspector {
		position: relative;
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
		padding: 1rem 1.1rem 1.1rem;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background-color: var(--paper-100);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		color: var(--ink-700);
		box-shadow:
			inset 0 0 0 2px var(--paper-100),
			inset 0 0 0 3px var(--brass-500),
			var(--shadow-paper);
	}

	.close {
		position: absolute;
		top: 0.7rem;
		right: 0.7rem;
		width: 1.9rem;
		height: 1.9rem;
		padding: 0;
		border: 1px solid var(--ink-700);
		border-radius: 999px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
		text-align: center;
	}

	.close:hover {
		background: var(--paper-200);
	}

	.heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding-right: 2.2rem;
	}

	h2,
	h3,
	p,
	dl {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		line-height: 1.1;
		color: var(--ink-700);
	}

	h3 {
		margin-bottom: 0.6rem;
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.heading p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.heading span {
		flex: 0 0 auto;
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		color: var(--ink-700);
		background: var(--paper-50);
		padding: 0.2rem 0.55rem;
		font-family: var(--font-ui);
		font-size: 0.74rem;
		font-weight: 600;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.6rem;
	}

	dt {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	dd {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.85rem;
	}

	.impact-list {
		display: grid;
		gap: 0.4rem;
		margin: 0.6rem 0 0;
		padding: 0;
		list-style: none;
	}

	.impact-list li {
		display: grid;
		gap: 0.2rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.5rem 0.6rem;
	}

	.impact-list span {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.85rem;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}

	.manage {
		padding: 0.45rem 0.85rem;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
	}

	.manage:hover {
		background: var(--paper-200);
	}
</style>
