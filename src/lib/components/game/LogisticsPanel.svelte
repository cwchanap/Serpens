<script lang="ts">
	import { asset } from '$app/paths';
	import HudIcon from './HudIcon.svelte';
	import { getIndustryMaterialArt } from '$lib/assets/gameArt';
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

	const dispatchMaterials: readonly MaterialId[] = ['grain', 'flour', 'snacks', 'packaging'];
	const quickMaterials = $derived(
		dispatchMaterials.flatMap((id) =>
			view.materialOptions.filter((material) => material.materialId === id)
		)
	);

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
	let routeEditorOpen = $state(false);
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
		routeEditorOpen = true;
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
		routeEditorOpen = true;
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

<section class="panel logistics-panel" aria-labelledby="logistics-heading">
	<h2 id="logistics-heading">{i18n.t('logisticsPanel.title')}</h2>
	<p>{i18n.t('logisticsPanel.subtitle')}</p>
	{#if disabledReason && !canMutate}<p class="disabled-copy">{disabledReason}</p>{/if}
	<p class="live-status" aria-live="polite" role="status">{statusMessage}</p>

	<section class="surface dispatch-surface" aria-labelledby="manual-transfer-heading">
		<h3 id="manual-transfer-heading" class="sr-only">
			{i18n.t('logisticsPanel.sections.manualTransfer')}
		</h3>
		<form class="dispatch-form" onsubmit={submitManualTransfer}>
			<span class="dispatch-label">{i18n.t('logisticsPanel.ui.dispatch')}</span>
			<div
				class="material-strip"
				role="group"
				aria-label={i18n.t('logisticsPanel.sections.manualTransfer')}
			>
				{#each quickMaterials as material (material.materialId)}
					<button
						type="button"
						aria-label={material.label}
						title={`${material.label} · ${material.stock}`}
						aria-pressed={manualMaterialId === material.materialId}
						disabled={!canMutate || submitting}
						onclick={() => (manualMaterialId = material.materialId)}
					>
						<img
							src={asset(getIndustryMaterialArt(material.materialId))}
							alt=""
							width="36"
							height="36"
						/>
					</button>
				{/each}
				<div class="dispatch-field material-select">
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
				</div>
			</div>
			<div class="dispatch-field">
				<label for="logistics-manual-origin">{i18n.t('logisticsPanel.ui.from')}</label>
				<select
					id="logistics-manual-origin"
					aria-label={i18n.t('logisticsPanel.fields.origin')}
					bind:value={manualOriginCityId}
					disabled={!canMutate || submitting}
				>
					{#each cityOptionsForSelect() as city (city.cityId)}
						<option value={city.cityId} title={city.inventorySummary}>{city.label}</option>
					{/each}
				</select>
			</div>
			<svg class="dispatch-arrow" viewBox="0 0 24 24" aria-hidden="true"
				><path d="M4 12h15 M14 7l5 5-5 5" /></svg
			>
			<div class="dispatch-field">
				<label for="logistics-manual-destination">{i18n.t('logisticsPanel.ui.to')}</label>
				<select
					id="logistics-manual-destination"
					aria-label={i18n.t('logisticsPanel.fields.destination')}
					bind:value={manualDestinationCityId}
					disabled={!canMutate || submitting}
				>
					{#each cityOptionsForSelect() as city (city.cityId)}
						<option value={city.cityId}>{city.label}</option>
					{/each}
				</select>
			</div>
			<div class="dispatch-field">
				<label for="logistics-manual-quantity">{i18n.t('logisticsPanel.ui.qty')}</label>
				<input
					id="logistics-manual-quantity"
					aria-label={i18n.t('logisticsPanel.fields.quantity')}
					type="number"
					min="1"
					step="1"
					bind:value={manualQuantity}
					disabled={!canMutate || submitting}
				/>
			</div>
			<button
				type="submit"
				disabled={!canMutate || submitting}
				aria-label={i18n.t('logisticsPanel.actions.dispatchTransfer')}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"
					><path d="M3 16V8h10v8z M13 11h4l3 3v2h-7z" /></svg
				>
				{i18n.t('logisticsPanel.ui.send')}
			</button>
		</form>
		<details class="route-editor" bind:open={routeEditorOpen}>
			<summary
				data-testid="route-editor-toggle"
				aria-label={i18n.t('logisticsPanel.sections.recurringRoutes')}
				title={i18n.t('logisticsPanel.sections.recurringRoutes')}>+</summary
			>
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
				<label for="logistics-route-destination"
					>{i18n.t('logisticsPanel.fields.destination')}</label
				>
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
				<label for="logistics-route-frequency"
					>{i18n.t('logisticsPanel.fields.frequencyDays')}</label
				>
				<input
					id="logistics-route-frequency"
					type="number"
					min="1"
					step="1"
					bind:value={routeFrequencyDays}
					disabled={!canMutate || submitting}
				/>
				<label for="logistics-route-lead-time">{i18n.t('logisticsPanel.fields.leadTimeDays')}</label
				>
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
		</details>
	</section>

	<section class="surface" aria-labelledby="recurring-routes-heading">
		<h3 id="recurring-routes-heading" class="sr-only">
			{i18n.t('logisticsPanel.sections.recurringRoutes')}
		</h3>

		{#if view.routes.length === 0}
			<p>{i18n.t('logisticsPanel.ui.noRoutes')}</p>
		{:else}
			<div class="route-list">
				{#each view.routes as route (route.routeId)}
					<article
						id={`logistics-route-${route.routeId}`}
						class="route"
						class:paused-route={route.state === 'paused'}
						tabindex="-1"
					>
						<img
							class="cargo-art"
							src={asset(getIndustryMaterialArt(route.materialId))}
							alt={route.materialLabel}
							width="56"
							height="56"
						/>
						<h4>
							{route.originLabel} → {route.destinationLabel}
							<span class="route-badge">{route.stateLabel}</span>
						</h4>
						<p class="route-state sr-only">{route.stateLabel} · {route.conditionLabel}</p>
						<div
							class="route-utilization"
							style:--fill={`${Math.max(0, Math.min(1, route.utilization ?? 0)) * 100}%`}
						>
							<meter
								class="sr-only"
								min="0"
								max="1"
								value={route.utilization ?? 0}
								aria-label={i18n.t('logisticsPanel.ui.utilization', {
									value: i18n.format.percent(route.utilization ?? 0)
								})}
							></meter>
							<span class="route-track" aria-hidden="true"><span class="route-fill"></span></span>
						</div>
						<p class="sr-only">
							{i18n.t('logisticsPanel.ui.inTransit', {
								quantity: i18n.format.integer(route.inTransitQuantity)
							})} · {i18n.t('logisticsPanel.ui.delivered')}
							{i18n.format.integer(route.deliveredUnits)} · {i18n.t(
								'logisticsPanel.ui.transferCost'
							)}
							{i18n.format.currency(route.transportCost)}
						</p>
						<p>
							{i18n.t('logisticsPanel.ui.routeSchedule', {
								capacity: i18n.format.integer(route.capacity),
								days: i18n.format.integer(route.frequencyDays),
								cost: i18n.format.currency(route.transportCostPerUnit)
							})}
						</p>
						<div class="route-actions">
							<button
								type="button"
								disabled={!canMutate || submitting}
								onclick={() => changeRouteState(route)}
								aria-label={i18n.t(
									route.state === 'active'
										? 'logisticsPanel.actions.pauseRoute'
										: 'logisticsPanel.actions.resumeRoute'
								)}
								title={i18n.t(
									route.state === 'active'
										? 'logisticsPanel.actions.pauseRoute'
										: 'logisticsPanel.actions.resumeRoute'
								)}><HudIcon name={route.state === 'active' ? 'pause' : 'resume'} /></button
							>
							<button
								type="button"
								disabled={!canMutate || submitting}
								onclick={() => beginEdit(route)}
								aria-label={i18n.t('logisticsPanel.actions.editRoute')}
								title={i18n.t('logisticsPanel.actions.editRoute')}><HudIcon name="edit" /></button
							>
							<details class="route-priority">
								<summary title={i18n.t('logisticsPanel.fields.priority')}>⋯</summary>
								<div>
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
								</div>
							</details>
							<button
								type="button"
								disabled={!canMutate || submitting}
								onclick={() => removeRoute(route)}
								aria-label={i18n.t('logisticsPanel.actions.removeRoute')}
								title={i18n.t('logisticsPanel.actions.removeRoute')}
								><HudIcon name="demolish" /></button
							>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<div class="shipment-columns">
		<section class="surface" aria-labelledby="in-transit-heading">
			<h3 id="in-transit-heading">{i18n.t('logisticsPanel.sections.inTransit')}</h3>
			{#if view.inTransit.length === 0}
				<p>{i18n.t('logisticsPanel.ui.noInTransit')}</p>
			{:else}
				<ul>
					{#each view.inTransit as shipment (`${shipment.destinationCityId}-${shipment.materialId}`)}
						<li title={`${shipment.materialLabel} → ${shipment.destinationLabel}`}>
							<img
								class="shipment-art"
								src={asset(getIndustryMaterialArt(shipment.materialId))}
								alt=""
								width="32"
								height="32"
							/>
							<span class="sr-only">{shipment.materialLabel} → {shipment.destinationLabel}:</span>
							<strong>{i18n.format.integer(shipment.quantity)}</strong>
							<small
								>{i18n.t('logisticsPanel.ui.arrives', {
									day: i18n.format.integer(shipment.earliestArrivalOnDay)
								})}</small
							>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="surface" aria-labelledby="recent-transfers-heading">
			<h3
				id="recent-transfers-heading"
				aria-label={i18n.t('logisticsPanel.sections.recentTransfers')}
			>
				{i18n.t('logisticsPanel.ui.recent')}
			</h3>
			{#if view.recentTransfers.length === 0}
				<p>{i18n.t('logisticsPanel.ui.noTransfers')}</p>
			{:else}
				<ol aria-labelledby="recent-transfers-heading">
					{#each view.recentTransfers as transfer (transfer.id)}
						<li title={`${transfer.id} · ${transfer.statusLabel}`}>
							<span class="transfer-mark" aria-hidden="true"
								>{transfer.status === 'delivered' ? '✓' : '→'}</span
							>
							<span class="sr-only">{transfer.id} · </span>{transfer.originLabel} → {transfer.destinationLabel}
							· {transfer.materialLabel}
							· {i18n.format.integer(transfer.quantity)}<span class="sr-only">
								· {transfer.statusLabel}</span
							>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	</div>
	<section class="totals sr-only" aria-labelledby="logistics-totals-heading">
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
		gap: 16px;
		min-width: 0;
		padding: 0;
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
	.route {
		border-left: 4px solid var(--wax-red);
		background: var(--paper-50);
	}
	.cargo-art {
		object-fit: contain;
		padding: 0.25rem;
		border: 1px solid var(--brass-500);
		background: var(--paper-200);
	}
	.shipment-art {
		display: inline-block;
		vertical-align: middle;
		object-fit: contain;
		margin-right: 0.4rem;
	}

	.panel > h2,
	.panel > h2 + p {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.live-status:empty {
		display: none;
	}
	.dispatch-form {
		grid-template-columns: auto auto minmax(0, 1fr) 22px minmax(0, 1fr) 90px auto;
	}
	.dispatch-field {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}
	.dispatch-field select,
	.dispatch-field input {
		width: 100%;
		min-width: 0;
	}
	.dispatch-form > button {
		grid-column: auto;
	}
	.route-editor {
		border: 1px solid var(--paper-edge);
		padding: 0.65rem;
	}
	.route-editor summary {
		cursor: pointer;
		color: var(--moss);
		font-weight: 600;
	}
	.route-editor form {
		margin-top: 0.75rem;
	}
	.route {
		position: relative;
		padding-left: 5.5rem;
		min-height: 6rem;
	}
	.route > .cargo-art {
		position: absolute;
		left: 0.65rem;
		top: 0.65rem;
	}
	.shipment-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	@media (max-width: 700px) {
		.dispatch-form {
			grid-template-columns: 1fr 1fr;
		}
		.shipment-columns {
			grid-template-columns: 1fr;
		}
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.material-strip {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.material-strip button {
		padding: 3px;
		border-color: var(--paper-edge);
		background: var(--paper-100);
		grid-column: auto;
		width: 48px;
		height: 48px;
	}
	.material-strip button[aria-pressed='true'] {
		border-color: var(--brass-500);
		background: var(--paper-200);
	}
	.material-strip img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.dispatch-surface {
		position: relative;
		border: 0;
		padding: 0;
	}
	.dispatch-form {
		position: relative;
		background: var(--paper-50);
		border: 1px solid var(--brass-500);
		padding: 12px 62px 12px 12px;
		gap: 10px;
		align-items: end;
	}
	.dispatch-field select,
	.dispatch-field input,
	.dispatch-form > button {
		font-size: 13px;
		padding: 8px 10px;
	}
	.material-select {
		width: 2rem;
	}
	.material-select label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.material-select select {
		width: 2rem;
		height: 2.5rem;
		padding: 0;
		font-size: 0;
	}
	.material-select option {
		font-size: 0.85rem;
	}
	.dispatch-form > button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 42px;
		padding: 11px 14px;
		background: var(--moss);
		color: var(--paper-50);
		font: 700 14px var(--font-ui);
		box-shadow: inset 0 0 0 1px var(--moss-2);
	}
	.dispatch-label,
	.dispatch-field label {
		color: var(--brass-700);
		font: 700 10px var(--font-ui);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.dispatch-label {
		padding-bottom: 11px;
	}
	.dispatch-form svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.dispatch-form .dispatch-arrow {
		width: 22px;
		height: 22px;
		margin-bottom: 9px;
		color: var(--brass-700);
	}
	.dispatch-field input {
		font-family: var(--font-mono);
	}
	.dispatch-field select:not(#logistics-manual-material) {
		padding: 8px 0;
		border-color: transparent;
		background: transparent;
		font-family: var(--font-ui);
	}
	@media (max-width: 700px) {
		.material-strip {
			grid-column: 1 / -1;
			flex-wrap: wrap;
		}
		.dispatch-label {
			grid-column: 1 / -1;
		}
		.dispatch-form {
			grid-template-columns: 1fr 1fr;
			padding-right: 12px;
		}
		.dispatch-form .dispatch-arrow {
			display: none;
		}
	}

	.route {
		padding: 12px 176px 12px 84px;
		gap: 4px;
		min-height: 90px;
		border-left-color: var(--moss);
	}
	.route.paused-route {
		border-left-color: var(--brass-500);
		opacity: 0.8;
	}
	.route > .cargo-art {
		width: 56px;
		height: 56px;
		padding: 0;
		border: 0;
		background: none;
	}
	.route h4 {
		font-size: 18px;
	}
	.route p {
		font: 12px var(--font-mono);
	}
	.route-utilization {
		display: flex;
		align-items: center;
		height: 16px;
	}
	.route-track {
		display: block;
		width: 100%;
		height: 10px;
		border-radius: 8px;
		background: var(--paper-300);
	}
	.route-fill {
		display: block;
		position: relative;
		width: var(--fill);
		height: 100%;
		border-radius: inherit;
		background: var(--moss);
	}
	.route-fill::after {
		content: '';
		position: absolute;
		right: -8px;
		top: -3px;
		width: 16px;
		height: 16px;
		border: 2px solid var(--paper-50);
		border-radius: 50%;
		background: var(--ink-900);
	}
	.paused-route .route-fill::after {
		display: none;
	}

	.route-actions {
		position: absolute;
		right: 14px;
		top: 26px;
		gap: 4px;
		align-items: center;
	}
	.route-actions > button {
		display: grid;
		place-items: center;
		width: 40px;
		height: 36px;
		padding: 2px;
		border-color: var(--brass-500);
	}
	.route-actions > button:last-child {
		color: var(--wax-red);
		border-color: var(--wax-red);
	}
	.route-actions :global(svg) {
		width: 18px;
		height: 18px;
	}
	.route-priority {
		order: 1;
	}
	.route-priority summary {
		cursor: pointer;
		list-style: none;
	}
	.route-priority > div {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 3;
		display: grid;
		gap: 5px;
		padding: 12px;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
	}
	.shipment-columns p,
	.shipment-columns li {
		font-size: 0.7rem;
	}
	.shipment-columns .surface {
		align-content: start;
		border: 0;
		padding-top: 0;
	}
	.surface[aria-labelledby='recurring-routes-heading'] {
		border: 0;
		padding: 0;
	}
	.route-editor {
		border: 0;
		padding: 0;
	}
	.route-editor summary {
		position: absolute;
		top: 20px;
		right: 12px;
		display: grid;
		place-items: center;
		width: 36px;
		height: 40px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-100);
		font: 20px var(--font-ui);
		list-style: none;
	}
	.route-editor summary::-webkit-details-marker {
		display: none;
	}
	.route-editor:not([open]) {
		height: 0;
	}
	.dispatch-surface:has(.route-editor:not([open])) {
		gap: 0;
	}
	.route-editor[open] form {
		padding: 12px;
		background: var(--paper-50);
	}
	.dispatch-form :focus-visible,
	.route-editor summary:focus-visible {
		outline: 2px solid var(--wax-red);
		outline-offset: 2px;
	}
	@media (max-width: 700px) {
		.route {
			padding-right: 10px;
			padding-top: 60px;
		}
		.route-actions {
			top: 12px;
		}
	}

	.route-badge {
		display: inline-block;
		vertical-align: middle;
		padding: 3px 7px;
		margin-left: 6px;
		border-radius: 12px;
		background: var(--moss);
		color: var(--paper-50);
		font: 700 10px var(--font-ui);
		text-transform: uppercase;
	}
	.paused-route .route-badge {
		background: var(--brass-700);
	}
	.route > .cargo-art {
		left: 14px;
		top: 16px;
	}
	.surface[aria-labelledby='in-transit-heading'] ul {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 0;
		list-style: none;
	}
	.surface[aria-labelledby='in-transit-heading'] li {
		display: grid;
		grid-template-columns: 40px auto;
		column-gap: 6px;
		max-width: 220px;
		padding: 8px;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		font: 11px var(--font-mono);
	}
	.shipment-art {
		width: 40px;
		height: 40px;
		grid-row: 1 / span 2;
	}
	.surface[aria-labelledby='recent-transfers-heading'] ol {
		padding: 0;
		list-style: none;
	}
	.surface[aria-labelledby='recent-transfers-heading'] li {
		font: 11px var(--font-mono);
	}
	.transfer-mark {
		color: var(--moss);
		margin-right: 6px;
	}
	.surface[aria-labelledby='in-transit-heading'] strong {
		display: block;
		font-size: 16px;
	}
	.surface[aria-labelledby='in-transit-heading'] small {
		display: block;
	}
	.route.paused-route {
		border-left-style: dashed;
		background: var(--paper-200);
	}
</style>
