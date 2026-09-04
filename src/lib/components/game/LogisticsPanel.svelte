<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { asset } from '$app/paths';
	import GameIcon from './GameIcon.svelte';
	import { getIndustryMaterialArt } from '$lib/assets/gameArt';
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
		type LogisticsRouteView,
		type LogisticsMaterialOption
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

	/**
	 * Material swatch pool: materials that currently have stock anywhere a
	 * dispatch could source from (the honest dispatchable set). The full
	 * material catalog stays reachable through the accessible select, which is
	 * kept in the DOM purely as the form's value channel; zero-stock materials
	 * can never quote, so they add no valid dispatch the swatches hide.
	 */
	let dispatchableMaterials = $derived.by((): readonly LogisticsMaterialOption[] => {
		const pool = view.materialOptions.filter((option) => option.stock > 0);
		if (pool.some((option) => option.materialId === manualMaterialId)) return pool;
		const selected = view.materialOptions.find((option) => option.materialId === manualMaterialId);
		return selected ? [...pool, selected] : pool;
	});

	function materialArtUrl(materialId: MaterialId): string | null {
		const art = getIndustryMaterialArt(materialId);
		return art ? asset(art) : null;
	}

	/**
	 * Route progress: share of the real dispatch cycle already elapsed since
	 * the previous scheduled dispatch day (nextDispatchOnDay - frequency).
	 * Paused routes have no active cadence, so their marker rests at the
	 * start on the muted track. Presentational mapping on real schedule
	 * fields only.
	 */
	function progressPercent(route: LogisticsRouteView): number {
		if (route.state !== 'active' || route.frequencyDays <= 0) return 0;
		const fraction = 1 - (route.nextDispatchOnDay - game.day) / route.frequencyDays;
		return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
	}

	/** Scheduled arrival of the next dispatch, when a dispatch is actually due. */
	function nextArrivalDay(route: LogisticsRouteView): number | null {
		if (route.state !== 'active') return null;
		return Math.max(route.nextDispatchOnDay, game.day) + route.leadTimeDays;
	}

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

	function fieldLabel(key: string): string {
		return i18n.t(`logisticsPanel.fields.${key}` as never);
	}
</script>

<section class="logistics-panel" aria-labelledby="logistics-heading">
	<h2 id="logistics-heading" class="visually-hidden">{i18n.t('logisticsPanel.title')}</h2>
	{#if disabledReason && !canMutate}<p class="disabled-copy">{disabledReason}</p>{/if}
	<p class="live-status" aria-live="polite" role="status">{statusMessage}</p>

	<!-- Dispatch composer: one horizontal row that drives the manual transfer. -->
	<section class="desk dispatch-desk" aria-labelledby="dispatch-heading">
		<h3 id="dispatch-heading" class="visually-hidden">
			{i18n.t('logisticsPanel.sections.manualTransfer')}
		</h3>
		<form class="composer-row" onsubmit={submitManualTransfer}>
			<span class="desk-label" aria-hidden="true"
				>{i18n.t('logisticsPanel.sections.manualTransfer')}</span
			>
			<span class="swatches">
				{#each dispatchableMaterials as material (material.materialId)}
					{@const art = materialArtUrl(material.materialId)}
					<button
						type="button"
						class="swatch"
						class:selected={manualMaterialId === material.materialId}
						aria-label={material.label}
						title={material.label}
						aria-pressed={manualMaterialId === material.materialId}
						disabled={!canMutate || submitting}
						onclick={() => (manualMaterialId = material.materialId)}
					>
						{#if art}
							<img src={art} alt="" />
						{:else}
							<span class="swatch-fallback" aria-hidden="true">◇</span>
						{/if}
					</button>
				{/each}
			</span>
			<select
				id="logistics-manual-material"
				class="sr-control"
				aria-label={fieldLabel('material')}
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
			<label class="field" for="logistics-manual-origin">
				<span class="field-label">{fieldLabel('origin')}</span>
				<select
					id="logistics-manual-origin"
					bind:value={manualOriginCityId}
					disabled={!canMutate || submitting}
				>
					{#each cityOptionsForSelect() as city (city.cityId)}
						<option value={city.cityId}>{city.label} — {city.inventorySummary}</option>
					{/each}
				</select>
			</label>
			<span class="route-arrow" aria-hidden="true">→</span>
			<label class="field" for="logistics-manual-destination">
				<span class="field-label">{fieldLabel('destination')}</span>
				<select
					id="logistics-manual-destination"
					bind:value={manualDestinationCityId}
					disabled={!canMutate || submitting}
				>
					{#each cityOptionsForSelect() as city (city.cityId)}
						<option value={city.cityId}>{city.label}</option>
					{/each}
				</select>
			</label>
			<label class="field qty-field" for="logistics-manual-quantity">
				<span class="field-label">{fieldLabel('quantity')}</span>
				<input
					id="logistics-manual-quantity"
					type="number"
					min="1"
					step="1"
					bind:value={manualQuantity}
					disabled={!canMutate || submitting}
				/>
			</label>
			<button class="send-btn" type="submit" disabled={!canMutate || submitting}>
				<GameIcon name="logistics" />
				<span>{i18n.t('logisticsPanel.actions.dispatchTransfer')}</span>
			</button>
		</form>
	</section>

	<!-- Recurring route composer: the same desk, one inline row of route fields. -->
	<section class="desk route-desk" aria-labelledby="recurring-heading">
		<h3 id="recurring-heading" class="visually-hidden">
			{i18n.t('logisticsPanel.sections.recurringRoutes')}
		</h3>
		<form id="logistics-route-form" class="route-form" tabindex="-1" onsubmit={submitRoute}>
			<span class="desk-label" aria-hidden="true">
				{i18n.t(
					editingRouteId
						? 'logisticsPanel.actions.updateRoute'
						: 'logisticsPanel.sections.recurringRoutes'
				)}
			</span>
			<label class="field" for="logistics-route-origin">
				<span class="field-label">{fieldLabel('origin')}</span>
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
			</label>
			<label class="field" for="logistics-route-destination">
				<span class="field-label">{fieldLabel('destination')}</span>
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
			</label>
			<label class="field" for="logistics-route-material">
				<span class="field-label">{fieldLabel('material')}</span>
				<select
					id="logistics-route-material"
					bind:value={routeMaterialId}
					disabled={!canMutate || submitting}
				>
					{#each view.materialOptions as material (material.materialId)}<option
							value={material.materialId}>{material.label}</option
						>{/each}
				</select>
			</label>
			<label class="field" for="logistics-route-capacity">
				<span class="field-label">{fieldLabel('capacity')}</span>
				<input
					id="logistics-route-capacity"
					type="number"
					min="1"
					step="1"
					bind:value={routeCapacity}
					disabled={!canMutate || submitting}
				/>
			</label>
			<label class="field" for="logistics-route-frequency">
				<span class="field-label">{fieldLabel('frequencyDays')}</span>
				<input
					id="logistics-route-frequency"
					type="number"
					min="1"
					step="1"
					bind:value={routeFrequencyDays}
					disabled={!canMutate || submitting}
				/>
			</label>
			<label class="field" for="logistics-route-lead-time">
				<span class="field-label">{fieldLabel('leadTimeDays')}</span>
				<input
					id="logistics-route-lead-time"
					type="number"
					min="1"
					step="1"
					bind:value={routeLeadTimeDays}
					disabled={!canMutate || submitting}
				/>
			</label>
			<label class="field" for="logistics-route-cost">
				<span class="field-label">{fieldLabel('transportCostPerUnit')}</span>
				<input
					id="logistics-route-cost"
					type="number"
					min="1"
					step="1"
					bind:value={routeTransportCostPerUnit}
					disabled={!canMutate || submitting}
				/>
			</label>
			{#if !editingRouteId}
				<label class="field" for="logistics-route-priority">
					<span class="field-label">{fieldLabel('priority')}</span>
					<input
						id="logistics-route-priority"
						type="number"
						min="0"
						step="1"
						bind:value={routePriority}
						disabled={!canMutate || submitting}
					/>
				</label>
			{/if}
			<span class="route-form-actions">
				{#if editingRouteId}
					<button type="button" class="cancel-btn" disabled={submitting} onclick={cancelEdit}>
						{i18n.t('logisticsPanel.actions.cancelEdit')}
					</button>
				{/if}
				<button type="submit" class="route-submit" disabled={!canMutate || submitting}>
					{i18n.t(
						editingRouteId
							? 'logisticsPanel.actions.updateRoute'
							: 'logisticsPanel.actions.createRoute'
					)}
				</button>
			</span>
		</form>
	</section>

	<section class="routes-zone" aria-labelledby="recurring-list-heading">
		<h3 id="recurring-list-heading" class="eyebrow zone-heading">
			{i18n.t('logisticsPanel.sections.recurringRoutes')}
		</h3>
		{#if view.routes.length === 0}
			<p class="empty-copy">{i18n.t('logisticsPanel.ui.noRoutes')}</p>
		{:else}
			<div class="route-list">
				{#each view.routes as route (route.routeId)}
					{@const art = materialArtUrl(route.materialId)}
					{@const paused = route.state !== 'active'}
					{@const pct = progressPercent(route)}
					<article
						id={`logistics-route-${route.routeId}`}
						class="route-card"
						class:paused
						tabindex="-1"
					>
						<span class="route-accent" aria-hidden="true"></span>
						{#if art}
							<img class="route-art" src={art} alt="" />
						{:else}
							<span class="route-art route-art-fallback" aria-hidden="true">◇</span>
						{/if}
						<div class="route-main">
							<div class="route-title-row">
								<h4 class="route-title">{route.originLabel} → {route.destinationLabel}</h4>
								<span class="route-pill" class:moss={!paused}>{route.stateLabel}</span>
								<span
									class="route-condition"
									class:wax={route.condition !== 'normal' && route.condition !== 'awaiting-dispatch'
										? true
										: false}
									title={route.conditionLabel}>{route.conditionLabel}</span
								>
							</div>
							<div class="route-track" aria-hidden="true">
								<span class="route-fill" class:paused style:width={`${pct}%`}></span>
								<span class="route-marker" style:left={`${pct}%`}></span>
							</div>
							<p class="route-facts">
								{i18n.format.integer(route.capacity)} / trip · every
								{i18n.format.integer(route.frequencyDays)}d
								{#if !paused && nextArrivalDay(route) !== null}
									· {i18n.t('logisticsPanel.ui.arrives', {
										day: i18n.format.integer(nextArrivalDay(route) ?? 0)
									})}
								{/if}
								· {i18n.format.currency(route.transportCostPerUnit)} / unit
							</p>
							<p class="route-ops">
								<span>
									{i18n.t('logisticsPanel.ui.inTransit', {
										quantity: i18n.format.integer(route.inTransitQuantity)
									})}
								</span>
								<span>
									{i18n.t('logisticsPanel.ui.delivered')}
									{i18n.format.integer(route.deliveredUnits)}
								</span>
								<span>
									{i18n.t('logisticsPanel.ui.transferCost')}
									{i18n.format.currency(route.transportCost)}
								</span>
							</p>
						</div>
						<div class="route-side">
							<span class="route-actions" role="group">
								<button
									type="button"
									class="icon-btn pause-cta"
									disabled={!canMutate || submitting}
									aria-label={i18n.t(
										paused
											? 'logisticsPanel.actions.resumeRoute'
											: 'logisticsPanel.actions.pauseRoute'
									)}
									title={i18n.t(
										paused
											? 'logisticsPanel.actions.resumeRoute'
											: 'logisticsPanel.actions.pauseRoute'
									)}
									onclick={() => changeRouteState(route)}
								>
									<GameIcon name={paused ? 'resume' : 'pause'} />
								</button>
								<button
									type="button"
									class="icon-btn"
									disabled={!canMutate || submitting}
									aria-label={i18n.t('logisticsPanel.actions.editRoute')}
									title={i18n.t('logisticsPanel.actions.editRoute')}
									onclick={() => beginEdit(route)}
								>
									<svg viewBox="0 0 24 24" aria-hidden="true">
										<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
									</svg>
								</button>
								<button
									type="button"
									class="icon-btn danger"
									disabled={!canMutate || submitting}
									aria-label={i18n.t('logisticsPanel.actions.removeRoute')}
									title={i18n.t('logisticsPanel.actions.removeRoute')}
									onclick={() => removeRoute(route)}
								>
									<svg viewBox="0 0 24 24" aria-hidden="true">
										<path d="M3 6h18" />
										<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
										<path d="M10 11v6" />
										<path d="M14 11v6" />
									</svg>
								</button>
							</span>
							<span class="priority-cluster">
								<input
									id={`logistics-priority-${route.routeId}`}
									class="priority-input"
									type="number"
									min="0"
									step="1"
									aria-label={i18n.t('logisticsPanel.fields.priority')}
									title={i18n.t('logisticsPanel.fields.priority')}
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
									class="priority-save"
									disabled={!canMutate || submitting}
									aria-label={i18n.t('logisticsPanel.actions.reprioritizeRoute')}
									title={i18n.t('logisticsPanel.actions.reprioritizeRoute')}
									onclick={() => reprioritizeRoute(route)}
								>
									{i18n.t('logisticsPanel.actions.reprioritizeRoute')}
								</button>
							</span>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<div class="split">
		<section class="split-col" aria-labelledby="in-transit-heading">
			<h3 id="in-transit-heading" class="eyebrow zone-heading">
				{i18n.t('logisticsPanel.sections.inTransit')}
			</h3>
			{#if view.inTransit.length === 0}
				<p class="empty-copy">{i18n.t('logisticsPanel.ui.noInTransit')}</p>
			{:else}
				<ul class="shipment-list">
					{#each view.inTransit as shipment (`${shipment.destinationCityId}-${shipment.materialId}`)}
						{@const art = materialArtUrl(shipment.materialId)}
						<li class="shipment">
							{#if art}
								<img class="shipment-art" src={art} alt="" />
							{:else}
								<span class="shipment-art shipment-art-fallback" aria-hidden="true">◇</span>
							{/if}
							<span class="shipment-text">
								<strong>{shipment.materialLabel}</strong>
								<span
									>→ {shipment.destinationLabel}: {i18n.format.integer(shipment.quantity)} · {i18n.t(
										'logisticsPanel.ui.arrives',
										{
											day: i18n.format.integer(shipment.earliestArrivalOnDay)
										}
									)}</span
								>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="split-col" aria-labelledby="recent-transfers-heading">
			<h3 id="recent-transfers-heading" class="eyebrow zone-heading">
				{i18n.t('logisticsPanel.sections.recentTransfers')}
			</h3>
			{#if view.recentTransfers.length === 0}
				<p class="empty-copy">{i18n.t('logisticsPanel.ui.noTransfers')}</p>
			{:else}
				<ol class="transfer-log" aria-labelledby="recent-transfers-heading">
					{#each view.recentTransfers as transfer (transfer.id)}
						<li class="transfer-row">
							<span
								class="transfer-glyph"
								class:delivered={transfer.status === 'delivered'}
								aria-hidden="true"
							>
								{transfer.status === 'delivered' ? '✓' : '→'}
							</span>
							<span class="transfer-text">
								{transfer.id} · {transfer.originLabel} → {transfer.destinationLabel} · {transfer.materialLabel}
								· {i18n.format.integer(transfer.quantity)} · {transfer.statusLabel}
							</span>
						</li>
					{/each}
				</ol>
			{/if}
			<p class="panel-totals">
				{i18n.t('logisticsPanel.ui.delivered')}: {i18n.format.integer(view.totals.deliveredUnits)} · {i18n.t(
					'logisticsPanel.ui.transferCost'
				)}: {i18n.format.currency(view.totals.transportCost)}
			</p>
		</section>
	</div>
</section>

<style>
	.logistics-panel {
		display: grid;
		min-width: 0;
		gap: 0.7rem;
		color: var(--ink-700);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	h3,
	h4,
	p,
	ul,
	ol {
		margin: 0;
	}

	/* Aria-only value channel for the manual material picker: the visible
	   selector is the art swatches; the select keeps the full catalog + form
	   semantics. */
	.sr-control {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	.eyebrow,
	.desk-label,
	.field-label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.zone-heading {
		font-size: 0.58rem;
	}

	.desk-label {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		flex: none;
		align-self: stretch;
		font-size: 0.6rem;
	}

	.desk-label::after {
		content: '';
		width: 1px;
		align-self: stretch;
		background: color-mix(in srgb, var(--brass-500) 55%, transparent);
	}

	/* ---- The two composer desks ---- */
	.desk {
		border: 1px solid var(--brass-300);
		border-radius: 3px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		box-shadow:
			inset 0 0 0 1px var(--paper-100),
			0 1px 0 rgba(20, 16, 10, 0.08);
		padding: 0.45rem 0.6rem;
	}

	.composer-row,
	.route-form {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: 0.4rem 0.55rem;
		min-width: 0;
	}

	.composer-row {
		align-items: stretch;
	}

	.composer-row .desk-label {
		padding-right: 0.1rem;
	}

	.swatches {
		display: flex;
		align-items: center;
		gap: 0.32rem;
		flex: none;
	}

	.swatch {
		display: grid;
		place-items: center;
		width: 2.1rem;
		height: 2.1rem;
		padding: 0;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		background: var(--paper-200);
		box-shadow: inset 0 0 0 1px var(--paper-100);
		cursor: pointer;
	}

	.swatch:hover,
	.swatch:focus-visible {
		border-color: var(--brass-700);
	}

	.swatch.selected {
		border-color: var(--brass-700);
		background: var(--brass-100);
		box-shadow:
			inset 0 0 0 1px var(--brass-100),
			0 0 0 2px color-mix(in srgb, var(--brass-700) 25%, transparent);
	}

	.swatch img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		image-rendering: pixelated;
	}

	.swatch-fallback {
		color: var(--brass-700);
		font-family: var(--font-mono);
	}

	.field {
		display: grid;
		gap: 0.14rem;
		min-width: 0;
		flex: 1 1 7.5rem;
	}

	.field-label {
		font-size: 0.46rem;
		letter-spacing: 0.1em;
		overflow-wrap: anywhere;
	}

	.field select,
	.field input {
		width: 100%;
		min-width: 0;
		padding: 0.3rem 0.42rem;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font: inherit;
	}

	.field select {
		font-family: var(--font-ui);
		font-size: 0.76rem;
	}

	.field input {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums;
	}

	.field select:focus-visible,
	.field input:focus-visible,
	.priority-input:focus-visible {
		outline: 2px solid var(--brass-500);
		outline-offset: 1px;
	}

	.qty-field {
		flex: 0 1 5.5rem;
	}

	.route-arrow {
		flex: none;
		align-self: center;
		padding-bottom: 0.32rem;
		color: var(--brass-700);
		font-family: var(--font-mono);
		font-size: 0.95rem;
	}

	.send-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex: none;
		padding: 0.42rem 0.75rem;
		border: 1px solid var(--ink-900);
		border-radius: 3px;
		background: var(--moss);
		color: var(--paper-50);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		box-shadow: inset 0 0 0 1px var(--moss-2);
		cursor: pointer;
	}

	.send-btn:hover,
	.send-btn:focus-visible {
		background: var(--moss-2);
	}

	.route-desk {
		padding: 0.35rem 0.6rem 0.4rem;
	}

	.route-form:focus {
		outline: none;
	}

	.route-form-actions {
		display: flex;
		align-items: end;
		gap: 0.35rem;
		flex: 1 1 100%;
		justify-content: flex-end;
	}

	.cancel-btn,
	.route-submit {
		padding: 0.3rem 0.7rem;
		border-radius: 3px;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		cursor: pointer;
	}

	.route-submit {
		background: var(--moss);
		border: 1px solid var(--ink-900);
		color: var(--paper-50);
		box-shadow: inset 0 0 0 1px var(--moss-2);
	}

	.route-submit:hover,
	.route-submit:focus-visible {
		background: var(--moss-2);
	}

	.cancel-btn {
		background: var(--paper-50);
		border: 1px solid var(--brass-500);
		color: var(--ink-700);
	}

	button:disabled,
	input:disabled,
	select:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	/* ---- Recurring route cards ---- */
	.route-list {
		display: grid;
		gap: 0.55rem;
	}

	.route-card {
		position: relative;
		display: grid;
		grid-template-columns: 3.2rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
		padding: 0.5rem 0.6rem 0.5rem 0.85rem;
		border: 1px solid var(--brass-300);
		border-radius: 3px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		box-shadow:
			inset 0 0 0 1px var(--paper-100),
			0 1px 0 rgba(20, 16, 10, 0.08);
	}

	.route-card:focus {
		outline: 3px solid var(--brass-500);
		outline-offset: 2px;
	}

	.route-accent {
		position: absolute;
		left: 0;
		top: 5px;
		bottom: 5px;
		width: 3px;
		border-radius: 0 2px 2px 0;
		background: var(--moss);
		box-shadow: inset 0 0 0 1px var(--moss-2);
	}

	.route-card.paused .route-accent {
		background: repeating-linear-gradient(90deg, var(--brass-700) 0 3px, transparent 3px 6px);
		box-shadow: none;
	}

	.route-art {
		width: 3.2rem;
		height: 3.2rem;
		object-fit: cover;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		background: var(--paper-200);
		image-rendering: pixelated;
	}

	.route-art-fallback {
		display: grid;
		place-items: center;
		color: var(--brass-700);
		font-family: var(--font-mono);
		font-size: 1.3rem;
	}

	.route-main {
		display: grid;
		gap: 0.32rem;
		min-width: 0;
	}

	.route-title-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem 0.55rem;
		min-width: 0;
	}

	.route-title {
		font-family: var(--font-display);
		font-size: 1.02rem;
		font-weight: 400;
		line-height: 1.15;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.route-pill {
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		background: var(--brass-500);
		color: var(--ink-900);
		font-family: var(--font-ui);
		font-size: 0.52rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		box-shadow: inset 0 0 0 1px var(--paper-100);
	}

	.route-pill.moss {
		background: var(--moss);
		color: var(--paper-50);
		box-shadow: inset 0 0 0 1px var(--moss-2);
	}

	.route-condition {
		color: var(--ink-400);
		font-family: var(--font-ui);
		font-size: 0.56rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.route-condition.wax {
		color: var(--wax-red);
	}

	.route-track {
		position: relative;
		height: 5px;
		border: 1px solid var(--brass-300);
		border-radius: 1px;
		background: color-mix(in srgb, var(--paper-200) 75%, var(--brass-100));
	}

	.route-fill {
		display: block;
		height: 100%;
		background: var(--moss);
		box-shadow: inset 0 0 0 1px var(--moss-2);
	}

	.route-fill.paused {
		background: transparent;
		box-shadow: none;
	}

	.route-marker {
		position: absolute;
		top: 50%;
		width: 7px;
		height: 7px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: var(--paper-50);
		border: 2px solid var(--moss-2);
		pointer-events: none;
	}

	.route-card.paused .route-marker {
		border-color: var(--brass-700);
		background: var(--brass-100);
	}

	.route-facts {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.route-ops {
		display: flex;
		flex-wrap: wrap;
		gap: 0.1rem 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink-400);
	}

	.route-side {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.3rem;
		flex: none;
	}

	.route-actions {
		display: flex;
		gap: 0.28rem;
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 1.7rem;
		height: 1.7rem;
		padding: 0;
		border-radius: 3px;
		background: var(--paper-50);
		border: 1px solid var(--brass-500);
		color: var(--moss-2);
		cursor: pointer;
	}

	.icon-btn svg {
		width: 0.95rem;
		height: 0.95rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.icon-btn.pause-cta {
		background: var(--moss);
		border-color: var(--ink-900);
		color: var(--paper-50);
		box-shadow: inset 0 0 0 1px var(--moss-2);
	}

	.icon-btn.danger {
		color: var(--wax-red);
	}

	.priority-cluster {
		display: flex;
		align-items: center;
		gap: 0.28rem;
	}

	.priority-input {
		width: 3.4rem;
		padding: 0.2rem 0.3rem;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
	}

	.priority-save {
		padding: 0.24rem 0.5rem;
		border: 1px solid var(--brass-500);
		border-radius: 3px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.52rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.empty-copy {
		padding: 0.15rem 0.1rem;
		color: var(--ink-400);
		font-family: var(--font-mono);
		font-size: 0.66rem;
	}

	/* ---- Bottom split: in transit | recent transfers ---- */
	.split {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: 0.9rem;
		min-width: 0;
	}

	.split-col {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
		padding: 0.55rem 0.6rem 0.5rem;
		border: 1px solid var(--brass-300);
		border-radius: 3px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		box-shadow:
			inset 0 0 0 1px var(--paper-100),
			0 1px 0 rgba(20, 16, 10, 0.08);
	}

	.shipment-list {
		display: grid;
		gap: 0.32rem;
		list-style: none;
		padding: 0;
	}

	.shipment {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		padding: 0.22rem 0.3rem;
		border: 1px solid color-mix(in srgb, var(--brass-500) 30%, transparent);
		border-radius: 2px;
		background: var(--paper-100);
	}

	.shipment-art {
		width: 1.8rem;
		height: 1.8rem;
		flex: none;
		object-fit: cover;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		background: var(--paper-200);
		image-rendering: pixelated;
	}

	.shipment-art-fallback {
		display: grid;
		place-items: center;
		color: var(--brass-700);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.shipment-text {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		column-gap: 0.35rem;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.64rem;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}

	.shipment-text strong {
		font-family: var(--font-display);
		font-size: 0.8rem;
		font-weight: 400;
	}

	.transfer-log {
		display: grid;
		list-style: none;
		padding: 0;
	}

	.transfer-row {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		min-width: 0;
		padding: 0.16rem 0.05rem;
		border-top: 1px solid color-mix(in srgb, var(--brass-500) 25%, transparent);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}

	.transfer-glyph {
		flex: none;
		color: var(--brass-700);
		font-weight: 700;
	}

	.transfer-glyph.delivered {
		color: var(--moss);
	}

	.panel-totals {
		display: flex;
		flex-wrap: wrap;
		column-gap: 0.8rem;
		margin-top: 0.2rem;
		padding: 0.28rem 0.35rem 0;
		border-top: 1px solid color-mix(in srgb, var(--brass-500) 35%, transparent);
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink-500);
	}

	.live-status {
		color: var(--moss);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
	}

	.live-status:empty {
		display: none;
	}

	.disabled-copy {
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.78rem;
		font-weight: 700;
	}

	@media (max-width: 980px) {
		.route-card {
			grid-template-columns: 3.2rem minmax(0, 1fr);
		}

		.route-side {
			grid-column: 2;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}

		.split {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 620px) {
		.composer-row .desk-label::after,
		.route-form .desk-label::after {
			display: none;
		}

		.desk-label {
			flex-basis: 100%;
		}
	}
</style>
