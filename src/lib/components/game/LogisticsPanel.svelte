<script lang="ts">
	import { tick, untrack } from 'svelte';
	import {
		quoteInterCityRates,
		quoteInterCityTransfer,
		type ManualTransferInput,
		type RecurringRouteInput,
		type RecurringRouteUpdateInput
	} from '$lib/game/interCityLogistics';
	import type { GameState, MaterialId, WorldCityId } from '$lib/game/types';
	import type { GameRouteCommitResult } from '$lib/game/commandResult';
	import { localizeLogisticsFailure } from '$lib/i18n/gameCopy';
	import type { I18nBundle } from '$lib/i18n';
	import {
		applyRoutePreset,
		type LogisticsPanelView,
		type LogisticsRouteFormValues,
		type LogisticsRouteView
	} from './logisticsPanel';

	interface Props {
		game: GameState;
		view: LogisticsPanelView;
		i18n: I18nBundle;
		canMutate: boolean;
		disabledReason: string | null;
		focusedRouteId: string | null;
		routePreset?: RecurringRouteInput | null;
		onDispatchManualTransfer: (input: ManualTransferInput) => Promise<GameRouteCommitResult>;
		onCreateRecurringRoute: (input: RecurringRouteInput) => Promise<GameRouteCommitResult>;
		onUpdateRecurringRoute: (
			routeId: string,
			input: RecurringRouteUpdateInput
		) => Promise<GameRouteCommitResult>;
		onPauseRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
		onResumeRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
		onReprioritizeRecurringRoute: (
			routeId: string,
			priority: number
		) => Promise<GameRouteCommitResult>;
		onRemoveRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
	}

	let {
		game,
		view,
		i18n,
		canMutate,
		disabledReason,
		focusedRouteId,
		routePreset = null,
		onDispatchManualTransfer,
		onCreateRecurringRoute,
		onUpdateRecurringRoute,
		onPauseRecurringRoute,
		onResumeRecurringRoute,
		onReprioritizeRecurringRoute,
		onRemoveRecurringRoute
	}: Props = $props();

	const firstCityId = untrack(() => view.cityOptions[0]?.cityId ?? '');
	const initialRouteQuote = untrack(() =>
		quoteInterCityRates(
			view.cityOptions[0]?.cityId ?? '',
			view.cityOptions[1]?.cityId ?? view.cityOptions[0]?.cityId ?? ''
		)
	);

	let manualOriginCityId = $state(untrack(() => view.cityOptions[0]?.cityId ?? ''));
	let manualDestinationCityId = $state(untrack(() => view.cityOptions[1]?.cityId ?? firstCityId));
	let manualMaterialId = $state(untrack(() => view.materialOptions[0]?.materialId ?? ''));
	let manualQuantity = $state('1');

	let routeOriginCityId = $state(untrack(() => view.cityOptions[0]?.cityId ?? ''));
	let routeDestinationCityId = $state(untrack(() => view.cityOptions[1]?.cityId ?? firstCityId));
	let routeMaterialId = $state(untrack(() => view.materialOptions[0]?.materialId ?? ''));
	let routeCapacity = $state('1');
	let routeFrequencyDays = $state('1');
	let routeLeadTimeDays = $state(initialRouteQuote ? String(initialRouteQuote.leadTimeDays) : '');
	let routeTransportCostPerUnit = $state(
		initialRouteQuote ? String(initialRouteQuote.transportCostPerUnit) : ''
	);
	let routePriority = $state('0');
	let appliedRoutePresetKey = $state<string | null>(null);
	let editingRouteId = $state<string | null>(null);
	let priorityValues = $state<Record<string, string>>({});
	let statusMessage = $state('');
	let submitting = $state(false);

	function seedRouteQuote(originCityId: string, destinationCityId: string): void {
		const quote = quoteInterCityRates(originCityId, destinationCityId);
		if (!quote) {
			routeLeadTimeDays = '';
			routeTransportCostPerUnit = '';
			return;
		}
		routeLeadTimeDays = String(quote.leadTimeDays);
		routeTransportCostPerUnit = String(quote.transportCostPerUnit);
	}

	function changeRouteOrigin(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		routeOriginCityId = value as WorldCityId;
		seedRouteQuote(value, routeDestinationCityId);
	}

	function changeRouteDestination(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		routeDestinationCityId = value as WorldCityId;
		seedRouteQuote(routeOriginCityId, value);
	}

	function currentRouteFormValues(): LogisticsRouteFormValues {
		return {
			originCityId: routeOriginCityId,
			destinationCityId: routeDestinationCityId,
			materialId: routeMaterialId,
			capacity: routeCapacity,
			frequencyDays: routeFrequencyDays,
			leadTimeDays: routeLeadTimeDays,
			transportCostPerUnit: routeTransportCostPerUnit,
			priority: routePriority
		};
	}

	function setRouteFormValues(values: LogisticsRouteFormValues): void {
		routeOriginCityId = values.originCityId as WorldCityId;
		routeDestinationCityId = values.destinationCityId as WorldCityId;
		routeMaterialId = values.materialId as MaterialId;
		routeCapacity = values.capacity;
		routeFrequencyDays = values.frequencyDays;
		routeLeadTimeDays = values.leadTimeDays;
		routeTransportCostPerUnit = values.transportCostPerUnit;
		routePriority = values.priority;
	}

	$effect(() => {
		const preset = routePreset;
		if (!preset) {
			untrack(() => (appliedRoutePresetKey = null));
			return;
		}
		const currentKey = untrack(() => appliedRoutePresetKey);
		const applied = untrack(() => applyRoutePreset(currentRouteFormValues(), preset, currentKey));
		if (applied.appliedKey === currentKey) return;
		setRouteFormValues(applied.values);
		untrack(() => (appliedRoutePresetKey = applied.appliedKey));
		let cancelled = false;
		void tick().then(() => {
			if (cancelled) return;
			document.getElementById('logistics-route-form')?.focus();
		});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const routeId = focusedRouteId;
		if (!routeId) return;
		let cancelled = false;
		void tick().then(() => {
			if (cancelled) return;
			const row = document.getElementById(`logistics-route-${routeId}`);
			row?.scrollIntoView({ block: 'nearest' });
			row?.focus();
		});
		return () => {
			cancelled = true;
		};
	});

	function parsePositiveInteger(value: string | number): number | null {
		const text = String(value);
		if (!/^\d+$/.test(text.trim())) return null;
		const parsed = Number(text);
		return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
	}

	function parseNonNegativeInteger(value: string | number): number | null {
		const text = String(value);
		if (!/^\d+$/.test(text.trim())) return null;
		const parsed = Number(text);
		return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
	}

	function isCommitted(result: GameRouteCommitResult): boolean {
		return (
			result.status === 'committed' || (result.status === 'sandbox-committed' && result.changed)
		);
	}

	function describeResult(result: GameRouteCommitResult): string {
		if (result.status === 'logistics-rejected')
			return localizeLogisticsFailure(result.reason, i18n);
		if (result.status === 'busy') return i18n.t('logisticsPanel.ui.busy');
		if (result.status === 'unavailable') return i18n.t('logisticsPanel.ui.unavailable');
		if (result.status === 'unchanged' || result.status === 'sandbox-committed') {
			return i18n.t('logisticsPanel.ui.unchanged');
		}
		return i18n.t('logisticsPanel.ui.failed');
	}

	function setFailure(reason: Parameters<typeof localizeLogisticsFailure>[0]): void {
		statusMessage = localizeLogisticsFailure(reason, i18n);
	}

	function quoteMessage(leadTimeDays: number, transportCost: number): string {
		return i18n.t('logisticsPanel.ui.quote', {
			leadTime: i18n.format.integer(leadTimeDays),
			cost: i18n.format.currency(transportCost)
		});
	}

	async function submitManualTransfer(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!canMutate || submitting) return;

		const quantity = parsePositiveInteger(manualQuantity);
		if (quantity === null) {
			setFailure('invalid-quantity');
			return;
		}

		const input: ManualTransferInput = {
			originCityId: manualOriginCityId,
			destinationCityId: manualDestinationCityId,
			materialId: manualMaterialId,
			quantity
		};
		const quote = quoteInterCityTransfer(game, input);
		if (!quote.ok) {
			setFailure(quote.reason);
			return;
		}

		const quoteText = quoteMessage(quote.quote.leadTimeDays, quote.quote.transportCost);
		submitting = true;
		try {
			const result = await onDispatchManualTransfer(input);
			if (!isCommitted(result)) {
				statusMessage = describeResult(result);
				return;
			}
			statusMessage = `${quoteText} ${i18n.t('logisticsPanel.ui.transferSubmitted')}`;
			manualQuantity = '';
		} finally {
			submitting = false;
		}
	}

	function routeInput(): RecurringRouteInput | null {
		if (!routeOriginCityId || !routeDestinationCityId || !routeMaterialId) return null;

		if (routeOriginCityId === routeDestinationCityId) {
			setFailure('same-city');
			return null;
		}

		const capacity = parsePositiveInteger(routeCapacity);
		const frequencyDays = parsePositiveInteger(routeFrequencyDays);
		const leadTimeDays = parsePositiveInteger(routeLeadTimeDays);
		const transportCostPerUnit = parsePositiveInteger(routeTransportCostPerUnit);
		const priority = parseNonNegativeInteger(routePriority);
		if (capacity === null) {
			setFailure('invalid-capacity');
			return null;
		}
		if (frequencyDays === null) {
			setFailure('invalid-frequency-days');
			return null;
		}
		if (leadTimeDays === null) {
			setFailure('invalid-lead-time-days');
			return null;
		}
		if (transportCostPerUnit === null) {
			setFailure('invalid-transport-cost-per-unit');
			return null;
		}
		if (priority === null) {
			setFailure('invalid-priority');
			return null;
		}

		return {
			originCityId: routeOriginCityId,
			destinationCityId: routeDestinationCityId,
			materialId: routeMaterialId,
			capacity,
			frequencyDays,
			leadTimeDays,
			transportCostPerUnit,
			priority
		};
	}

	async function submitRoute(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!canMutate || submitting) return;
		const input = routeInput();
		if (!input) return;

		submitting = true;
		try {
			const updateInput: RecurringRouteUpdateInput = {
				originCityId: input.originCityId,
				destinationCityId: input.destinationCityId,
				materialId: input.materialId,
				capacity: input.capacity,
				frequencyDays: input.frequencyDays,
				leadTimeDays: input.leadTimeDays,
				transportCostPerUnit: input.transportCostPerUnit
			};
			const result = editingRouteId
				? await onUpdateRecurringRoute(editingRouteId, updateInput)
				: await onCreateRecurringRoute(input);
			if (!isCommitted(result)) {
				statusMessage = describeResult(result);
				return;
			}
			statusMessage = i18n.t(
				editingRouteId ? 'logisticsPanel.ui.routeUpdated' : 'logisticsPanel.ui.routeCreated'
			);
			editingRouteId = null;
		} finally {
			submitting = false;
		}
	}

	function beginEdit(route: LogisticsRouteView): void {
		routeOriginCityId = route.originCityId;
		routeDestinationCityId = route.destinationCityId;
		routeMaterialId = route.materialId;
		routeCapacity = String(route.capacity);
		routeFrequencyDays = String(route.frequencyDays);
		routeLeadTimeDays = String(route.leadTimeDays);
		routeTransportCostPerUnit = String(route.transportCostPerUnit);
		routePriority = String(route.priority);
		editingRouteId = route.routeId;
	}

	function cancelEdit(): void {
		editingRouteId = null;
		routePriority = '0';
	}

	async function changeRouteState(route: LogisticsRouteView): Promise<void> {
		if (!canMutate || submitting) return;
		submitting = true;
		try {
			const result =
				route.state === 'active'
					? await onPauseRecurringRoute(route.routeId)
					: await onResumeRecurringRoute(route.routeId);
			if (!isCommitted(result)) {
				statusMessage = describeResult(result);
				return;
			}
			statusMessage = i18n.t(
				route.state === 'active'
					? 'logisticsPanel.ui.routePaused'
					: 'logisticsPanel.ui.routeResumed'
			);
		} finally {
			submitting = false;
		}
	}

	async function reprioritizeRoute(route: LogisticsRouteView): Promise<void> {
		if (!canMutate || submitting) return;
		const priority = parseNonNegativeInteger(
			priorityValues[route.routeId] ?? String(route.priority)
		);
		if (priority === null) {
			setFailure('invalid-priority');
			return;
		}
		submitting = true;
		try {
			const result = await onReprioritizeRecurringRoute(route.routeId, priority);
			statusMessage = isCommitted(result)
				? i18n.t('logisticsPanel.ui.routeReprioritized')
				: describeResult(result);
		} finally {
			submitting = false;
		}
	}

	async function removeRoute(route: LogisticsRouteView): Promise<void> {
		if (!canMutate || submitting) return;
		submitting = true;
		try {
			const result = await onRemoveRecurringRoute(route.routeId);
			if (!isCommitted(result)) {
				statusMessage = describeResult(result);
				return;
			}
			statusMessage = i18n.t('logisticsPanel.ui.routeRemoved');
			if (editingRouteId === route.routeId) {
				editingRouteId = null;
			}
			if (priorityValues[route.routeId] !== undefined) {
				const nextPriorityValues = { ...priorityValues };
				delete nextPriorityValues[route.routeId];
				priorityValues = nextPriorityValues;
			}
		} finally {
			submitting = false;
		}
	}

	function cityOptionsForSelect(): readonly LogisticsPanelView['cityOptions'][number][] {
		return view.cityOptions;
	}
</script>

<section class="panel logistics-panel paper" aria-labelledby="logistics-heading">
	<h2 id="logistics-heading">{i18n.t('logisticsPanel.title')}</h2>
	<p>{i18n.t('logisticsPanel.subtitle')}</p>
	{#if disabledReason && !canMutate}<p class="disabled-copy">{disabledReason}</p>{/if}
	<p class="live-status" aria-live="polite" role="status">{statusMessage}</p>

	<section class="surface" aria-labelledby="manual-transfer-heading">
		<h3 id="manual-transfer-heading">{i18n.t('logisticsPanel.sections.manualTransfer')}</h3>
		<form onsubmit={submitManualTransfer}>
			<label for="logistics-manual-origin">{i18n.t('logisticsPanel.fields.origin')}</label>
			<select
				id="logistics-manual-origin"
				bind:value={manualOriginCityId}
				disabled={!canMutate || submitting}
			>
				{#each cityOptionsForSelect() as city (city.cityId)}
					<option value={city.cityId}>{city.label} — {city.inventorySummary}</option>
				{/each}
			</select>
			<label for="logistics-manual-destination">{i18n.t('logisticsPanel.fields.destination')}</label
			>
			<select
				id="logistics-manual-destination"
				bind:value={manualDestinationCityId}
				disabled={!canMutate || submitting}
			>
				{#each cityOptionsForSelect() as city (city.cityId)}
					<option value={city.cityId}>{city.label}</option>
				{/each}
			</select>
			<label for="logistics-manual-material">{i18n.t('logisticsPanel.fields.material')}</label>
			<select
				id="logistics-manual-material"
				bind:value={manualMaterialId}
				disabled={!canMutate || submitting}
			>
				{#each view.materialOptions as material (material.materialId)}
					<option value={material.materialId}
						>{material.label} — {i18n.t('logisticsPanel.ui.stock', {
							stock: i18n.format.integer(material.stock)
						})}</option
					>
				{/each}
			</select>
			<label for="logistics-manual-quantity">{i18n.t('logisticsPanel.fields.quantity')}</label>
			<input
				id="logistics-manual-quantity"
				type="number"
				min="1"
				step="1"
				bind:value={manualQuantity}
				disabled={!canMutate || submitting}
			/>
			<button type="submit" disabled={!canMutate || submitting}
				>{i18n.t('logisticsPanel.actions.dispatchTransfer')}</button
			>
		</form>
	</section>

	<section class="surface" aria-labelledby="recurring-routes-heading">
		<h3 id="recurring-routes-heading">{i18n.t('logisticsPanel.sections.recurringRoutes')}</h3>
		<form id="logistics-route-form" tabindex="-1" onsubmit={submitRoute}>
			<label for="logistics-route-origin">{i18n.t('logisticsPanel.fields.origin')}</label>
			<select
				id="logistics-route-origin"
				value={routeOriginCityId}
				onchange={changeRouteOrigin}
				disabled={!canMutate || submitting}
			>
				{#each cityOptionsForSelect() as city (city.cityId)}<option value={city.cityId}
						>{city.label}</option
					>{/each}
			</select>
			<label for="logistics-route-destination">{i18n.t('logisticsPanel.fields.destination')}</label>
			<select
				id="logistics-route-destination"
				value={routeDestinationCityId}
				onchange={changeRouteDestination}
				disabled={!canMutate || submitting}
			>
				{#each cityOptionsForSelect() as city (city.cityId)}<option value={city.cityId}
						>{city.label}</option
					>{/each}
			</select>
			<label for="logistics-route-material">{i18n.t('logisticsPanel.fields.material')}</label>
			<select
				id="logistics-route-material"
				bind:value={routeMaterialId}
				disabled={!canMutate || submitting}
			>
				{#each view.materialOptions as material (material.materialId)}<option
						value={material.materialId}>{material.label}</option
					>{/each}
			</select>
			<label for="logistics-route-capacity">{i18n.t('logisticsPanel.fields.capacity')}</label>
			<input
				id="logistics-route-capacity"
				type="number"
				min="1"
				step="1"
				bind:value={routeCapacity}
				disabled={!canMutate || submitting}
			/>
			<label for="logistics-route-frequency">{i18n.t('logisticsPanel.fields.frequencyDays')}</label>
			<input
				id="logistics-route-frequency"
				type="number"
				min="1"
				step="1"
				bind:value={routeFrequencyDays}
				disabled={!canMutate || submitting}
			/>
			<label for="logistics-route-lead-time">{i18n.t('logisticsPanel.fields.leadTimeDays')}</label>
			<input
				id="logistics-route-lead-time"
				type="number"
				min="1"
				step="1"
				bind:value={routeLeadTimeDays}
				disabled={!canMutate || submitting}
			/>
			<label for="logistics-route-cost"
				>{i18n.t('logisticsPanel.fields.transportCostPerUnit')}</label
			>
			<input
				id="logistics-route-cost"
				type="number"
				min="1"
				step="1"
				bind:value={routeTransportCostPerUnit}
				disabled={!canMutate || submitting}
			/>
			{#if !editingRouteId}
				<label for="logistics-route-priority">{i18n.t('logisticsPanel.fields.priority')}</label>
				<input
					id="logistics-route-priority"
					type="number"
					min="0"
					step="1"
					bind:value={routePriority}
					disabled={!canMutate || submitting}
				/>
			{/if}
			<div class="form-actions">
				<button type="submit" disabled={!canMutate || submitting}
					>{i18n.t(
						editingRouteId
							? 'logisticsPanel.actions.updateRoute'
							: 'logisticsPanel.actions.createRoute'
					)}</button
				>
				{#if editingRouteId}<button type="button" disabled={submitting} onclick={cancelEdit}
						>{i18n.t('logisticsPanel.actions.cancelEdit')}</button
					>{/if}
			</div>
		</form>

		{#if view.routes.length === 0}
			<p>{i18n.t('logisticsPanel.ui.noRoutes')}</p>
		{:else}
			<div class="route-list">
				{#each view.routes as route (route.routeId)}
					<article id={`logistics-route-${route.routeId}`} class="route" tabindex="-1">
						<h4>{route.originLabel} → {route.destinationLabel}</h4>
						<p>{route.materialLabel} · {route.stateLabel} · {route.conditionLabel}</p>
						<p>
							{i18n.t('logisticsPanel.ui.inTransit', {
								quantity: i18n.format.integer(route.inTransitQuantity)
							})} · {i18n.t('logisticsPanel.ui.delivered')}
							{i18n.format.integer(route.deliveredUnits)} · {i18n.t(
								'logisticsPanel.ui.transferCost'
							)}
							{i18n.format.currency(route.transportCost)}
						</p>
						<div class="route-actions">
							<button
								type="button"
								disabled={!canMutate || submitting}
								onclick={() => beginEdit(route)}
								>{i18n.t('logisticsPanel.actions.editRoute')}</button
							>
							<button
								type="button"
								disabled={!canMutate || submitting}
								onclick={() => changeRouteState(route)}
								>{i18n.t(
									route.state === 'active'
										? 'logisticsPanel.actions.pauseRoute'
										: 'logisticsPanel.actions.resumeRoute'
								)}</button
							>
							<label for={`logistics-priority-${route.routeId}`}
								>{i18n.t('logisticsPanel.fields.priority')}</label
							>
							<input
								id={`logistics-priority-${route.routeId}`}
								type="number"
								min="0"
								step="1"
								value={priorityValues[route.routeId] ?? String(route.priority)}
								oninput={(event) =>
									(priorityValues = {
										...priorityValues,
										[route.routeId]: event.currentTarget.value
									})}
								disabled={!canMutate || submitting}
							/>
							<button
								type="button"
								disabled={!canMutate || submitting}
								onclick={() => reprioritizeRoute(route)}
								>{i18n.t('logisticsPanel.actions.reprioritizeRoute')}</button
							>
							<button
								type="button"
								disabled={!canMutate || submitting}
								onclick={() => removeRoute(route)}
								>{i18n.t('logisticsPanel.actions.removeRoute')}</button
							>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<section class="surface" aria-labelledby="in-transit-heading">
		<h3 id="in-transit-heading">{i18n.t('logisticsPanel.sections.inTransit')}</h3>
		{#if view.inTransit.length === 0}
			<p>{i18n.t('logisticsPanel.ui.noInTransit')}</p>
		{:else}
			<ul>
				{#each view.inTransit as shipment (`${shipment.destinationCityId}-${shipment.materialId}`)}
					<li>
						{shipment.materialLabel} → {shipment.destinationLabel}: {i18n.format.integer(
							shipment.quantity
						)} · {i18n.t('logisticsPanel.ui.arrives', {
							day: i18n.format.integer(shipment.earliestArrivalOnDay)
						})}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="surface" aria-labelledby="recent-transfers-heading">
		<h3 id="recent-transfers-heading">{i18n.t('logisticsPanel.sections.recentTransfers')}</h3>
		{#if view.recentTransfers.length === 0}
			<p>{i18n.t('logisticsPanel.ui.noTransfers')}</p>
		{:else}
			<ol aria-labelledby="recent-transfers-heading">
				{#each view.recentTransfers as transfer (transfer.id)}
					<li>
						{transfer.id} · {transfer.originLabel} → {transfer.destinationLabel} · {transfer.materialLabel}
						· {i18n.format.integer(transfer.quantity)} · {transfer.statusLabel}
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<section class="surface totals" aria-labelledby="logistics-totals-heading">
		<h3 id="logistics-totals-heading">{i18n.t('logisticsPanel.sections.totals')}</h3>
		<p>
			{i18n.t('logisticsPanel.ui.delivered')}: {i18n.format.integer(view.totals.deliveredUnits)} · {i18n.t(
				'logisticsPanel.ui.transferCost'
			)}: {i18n.format.currency(view.totals.transportCost)}
		</p>
	</section>
</section>

<style>
	.panel {
		display: grid;
		gap: 1rem;
		min-width: 0;
		padding: 1.1rem 1.2rem;
		color: var(--ink-700);
	}
	h2,
	h3,
	h4,
	p {
		margin: 0;
	}
	h2,
	h3,
	h4 {
		font-family: var(--font-display);
		font-weight: 400;
	}
	h2 {
		font-size: 1.1rem;
	}
	h3 {
		font-size: 1rem;
	}
	h4 {
		font-size: 0.95rem;
	}
	p,
	li {
		font-family: var(--font-body);
		line-height: 1.35;
		overflow-wrap: anywhere;
	}
	.surface {
		display: grid;
		gap: 0.65rem;
		border-top: 1px solid var(--brass-300);
		padding-top: 0.9rem;
	}
	form {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
		gap: 0.45rem 0.65rem;
	}
	label {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--brass-700);
	}
	select,
	input,
	button {
		max-width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font: inherit;
		padding: 0.45rem 0.6rem;
	}
	select,
	input {
		width: 100%;
	}
	button {
		cursor: pointer;
	}
	button:disabled,
	input:disabled,
	select:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	form button,
	.form-actions {
		grid-column: 1 / -1;
	}
	.form-actions,
	.route-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.45rem;
	}
	.route-list {
		display: grid;
		gap: 0.65rem;
	}
	.route {
		display: grid;
		gap: 0.5rem;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
		padding: 0.75rem;
	}
	.route:focus {
		outline: 3px solid var(--brass-500);
		outline-offset: 2px;
	}
	.route-actions label {
		margin-left: auto;
	}
	.route-actions input {
		width: 5rem;
	}
	ul,
	ol {
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding-left: 1.25rem;
	}
	.live-status:empty {
		display: none;
	}
	.disabled-copy,
	.live-status {
		font-weight: 700;
		color: var(--wax-red);
	}
	@media (max-width: 620px) {
		form {
			grid-template-columns: 1fr;
		}
		form button,
		.form-actions {
			grid-column: auto;
		}
	}
</style>
