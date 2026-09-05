<script lang="ts">
	import {
		POLICY_FIELD_OPTIONS,
		resolveEffectivePolicy,
		type EffectivePolicy,
		type PolicyValueSource
	} from '$lib/game/policyInheritance';
	import { getWorldCityDefinition, isWorldCityId } from '$lib/game/worldCatalog';
	import GameIcon from './GameIcon.svelte';
	import type { GameIconName } from './gameNavigation';
	import type { CompanyPolicy, GameState, PolicyOverrideScope, WorldCityId } from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		game: GameState;
		i18n: I18nBundle;
		onChange: (patch: Partial<CompanyPolicy>) => void;
		onSetPolicyOverride?: (scope: PolicyOverrideScope, patch: Partial<CompanyPolicy>) => void;
		onClearPolicyOverrideField?: (scope: PolicyOverrideScope, field: keyof CompanyPolicy) => void;
		onResetPolicyOverrideScope?: (scope: PolicyOverrideScope) => void;
		canUpdate?: boolean;
		canUpdateScoped?: boolean;
		disabledReason?: string | null;
	}

	let {
		game,
		i18n,
		onChange,
		onSetPolicyOverride = () => {},
		onClearPolicyOverrideField = () => {},
		onResetPolicyOverrideScope = () => {},
		canUpdate = true,
		canUpdateScoped = true,
		disabledReason = null
	}: Props = $props();

	// Small thematic icon per policy family eyebrow (mock: PRICING/INVENTORY/
	// STAFFING/MARKETING/SERVICE framed segmented cards).
	const FIELD_ICONS: Record<keyof CompanyPolicy, GameIconName> = {
		pricing: 'cash',
		inventory: 'stores',
		staffing: 'staff',
		marketing: 'world',
		service: 'retail'
	};

	const fields = Object.keys(POLICY_FIELD_OPTIONS) as (keyof CompanyPolicy)[];
	let selectedScopeKind = $state<'company' | 'city' | 'store'>('company');
	let selectedCityId = $state<WorldCityId | null>(null);
	let selectedStoreId = $state<string | null>(null);

	const cityOptions = $derived(
		game.cities.filter(
			(city): city is typeof city & { id: WorldCityId } =>
				isWorldCityId(city.id) &&
				getWorldCityDefinition(city.id)?.kind === 'retail' &&
				game.world.openedCityIds.includes(city.id)
		)
	);
	const storeOptions = $derived(
		game.stores.filter((store) => cityOptions.some((city) => city.id === store.cityId))
	);
	const effectiveCityId = $derived(
		cityOptions.some((city) => city.id === selectedCityId)
			? selectedCityId
			: (cityOptions[0]?.id ?? null)
	);
	const effectiveStoreId = $derived(
		storeOptions.some((store) => store.id === selectedStoreId)
			? selectedStoreId
			: (storeOptions[0]?.id ?? null)
	);
	const selectedScope = $derived.by<PolicyOverrideScope | null>(() => {
		if (selectedScopeKind === 'city' && effectiveCityId) {
			return { kind: 'city', cityId: effectiveCityId };
		}
		if (selectedScopeKind === 'store' && effectiveStoreId) {
			return { kind: 'store', storeId: effectiveStoreId };
		}
		return null;
	});

	const effectivePolicy = $derived.by<EffectivePolicy>(() => {
		if (!selectedScope) {
			return {
				values: game.policy,
				provenance: companyProvenance()
			};
		}
		return resolveEffectivePolicy(game, selectedScope);
	});
	const parentPolicy = $derived.by<EffectivePolicy | null>(() => {
		const scope = selectedScope;
		if (!scope) return null;
		if (scope.kind === 'city') {
			return { values: game.policy, provenance: companyProvenance() };
		}
		const store = game.stores.find((candidate) => candidate.id === scope.storeId);
		if (!store || !isWorldCityId(store.cityId)) return null;
		return resolveEffectivePolicy(game, { kind: 'city', cityId: store.cityId });
	});
	const scopedControlsDisabled = $derived(selectedScope !== null ? !canUpdateScoped : !canUpdate);
	const disabledCopyVisible = $derived(disabledReason !== null && scopedControlsDisabled);

	function companyProvenance(): EffectivePolicy['provenance'] {
		return {
			pricing: { kind: 'company' },
			inventory: { kind: 'company' },
			staffing: { kind: 'company' },
			marketing: { kind: 'company' },
			service: { kind: 'company' }
		};
	}

	function sourceLabel(source: PolicyValueSource): string {
		if (source.kind === 'company') return i18n.t('policyPanel.provenance.company');
		return i18n.t(`policyPanel.provenance.${source.kind}` as never);
	}

	function isSourceScope(source: PolicyValueSource, scope: PolicyOverrideScope): boolean {
		if (source.kind === 'company') return false;
		if (scope.kind === 'city') {
			return source.kind === 'city' && source.cityId === scope.cityId;
		}
		return source.kind === 'store' && source.storeId === scope.storeId;
	}

	function fieldStatus(field: keyof CompanyPolicy): string {
		const scope = selectedScope;
		const source = effectivePolicy.provenance[field];
		if (!scope) return sourceLabel(source);
		return isSourceScope(source, scope)
			? i18n.t('policyPanel.provenance.explicit', { source: sourceLabel(source) })
			: i18n.t('policyPanel.provenance.inherited', { source: sourceLabel(source) });
	}

	function fieldLabel(field: keyof CompanyPolicy): string {
		return i18n.labels.policyField(field);
	}

	function valueLabel(field: keyof CompanyPolicy, value: string): string {
		return i18n.labels.policyValue(field, value);
	}

	function targetLabel(scope: PolicyOverrideScope): string {
		return scope.kind === 'city'
			? i18n.labels.worldCity(scope.cityId).name
			: (game.stores.find((store) => store.id === scope.storeId)?.name ?? scope.storeId);
	}

	function update(field: keyof CompanyPolicy, value: string): void {
		if (scopedControlsDisabled) return;
		const patch = { [field]: value } as Partial<CompanyPolicy>;
		if (selectedScope) onSetPolicyOverride(selectedScope, patch);
		else onChange(patch);
	}

	function scopeOptionDisabled(kind: 'company' | 'city' | 'store'): boolean {
		if (kind === 'city') return cityOptions.length === 0;
		if (kind === 'store') return storeOptions.length === 0;
		return false;
	}

	function setScopeKind(value: string): void {
		if (value === 'company' || value === 'city' || value === 'store') {
			selectedScopeKind = value;
		}
	}

	function clearField(field: keyof CompanyPolicy): void {
		if (selectedScope && canUpdateScoped) {
			onClearPolicyOverrideField(selectedScope, field);
		}
	}

	function resetScope(): void {
		if (selectedScope && canUpdateScoped) {
			onResetPolicyOverrideScope(selectedScope);
		}
	}
</script>

<section class="panel paper" aria-labelledby="policy-heading">
	<div class="policy-header">
		<h2 id="policy-heading">{i18n.t('policyPanel.title')}</h2>

		<div class="scope-row">
			<div class="scope-tabs" role="tablist" aria-label={i18n.t('policyPanel.scopeLabel')}>
				{#each ['company', 'city', 'store'] as kind (kind)}
					<button
						type="button"
						role="tab"
						aria-selected={selectedScopeKind === kind}
						disabled={scopeOptionDisabled(kind as 'company' | 'city' | 'store')}
						onclick={() => setScopeKind(kind)}
					>
						{i18n.t(`policyPanel.scopes.${kind}` as never)}
					</button>
				{/each}
			</div>
			{#if selectedScopeKind === 'city' && cityOptions.length > 0}
				<label class="target">
					<span>{i18n.t('policyPanel.targetLabel')}</span>
					<select
						aria-label={i18n.t('policyPanel.targetLabel')}
						value={effectiveCityId ?? ''}
						onchange={(event) => {
							selectedCityId = event.currentTarget.value as WorldCityId;
						}}
					>
						{#each cityOptions as city (city.id)}
							<option value={city.id}>{i18n.labels.worldCity(city.id).name}</option>
						{/each}
					</select>
				</label>
			{:else if selectedScopeKind === 'store' && storeOptions.length > 0}
				<label class="target">
					<span>{i18n.t('policyPanel.targetLabel')}</span>
					<select
						aria-label={i18n.t('policyPanel.targetLabel')}
						value={effectiveStoreId ?? ''}
						onchange={(event) => {
							selectedStoreId = event.currentTarget.value;
						}}
					>
						{#each storeOptions as store (store.id)}
							<option value={store.id}>{store.name}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>
	</div>

	{#if selectedScope}
		<p class="scope-summary">
			{i18n.t('policyPanel.selectedScope', {
				scope: i18n.t(`policyPanel.scopes.${selectedScope.kind}` as never),
				target: targetLabel(selectedScope)
			})}
		</p>
	{/if}

	<div class="policy-grid">
		{#each fields as field (field)}
			{@const fieldLabelText = fieldLabel(field)}
			{@const source = effectivePolicy.provenance[field]}
			{@const parent = parentPolicy?.values[field]}
			<div class="policy-field">
				<span class="field-eyebrow">
					<GameIcon name={FIELD_ICONS[field]} />
					{fieldLabelText}
				</span>
				<div class="segmented" role="radiogroup" aria-label={fieldLabelText}>
					{#each POLICY_FIELD_OPTIONS[field] as option (option)}
						<label class="segment" class:selected={effectivePolicy.values[field] === option}>
							<input
								type="radio"
								name={`policy-${field}`}
								value={option}
								checked={effectivePolicy.values[field] === option}
								disabled={scopedControlsDisabled}
								aria-label={valueLabel(field, option)}
								onchange={() => update(field, option)}
							/>
							<span>{valueLabel(field, option)}</span>
						</label>
					{/each}
				</div>
				{#if parent !== undefined}
					<small>{i18n.t('policyPanel.parent', { value: valueLabel(field, parent) })}</small>
				{/if}
				<small class="provenance" data-provenance={source.kind}>{fieldStatus(field)}</small>
				{#if selectedScope}
					<button
						type="button"
						class="secondary"
						disabled={!canUpdateScoped || !isSourceScope(source, selectedScope)}
						onclick={() => clearField(field)}
					>
						{i18n.t('policyPanel.inheritField', { field: fieldLabelText })}
					</button>
				{/if}
			</div>
		{/each}
	</div>

	<div class="policy-footer">
		{#if selectedScope}
			<button type="button" class="reset" disabled={!canUpdateScoped} onclick={resetScope}>
				{i18n.t('policyPanel.resetScope')}
			</button>
		{/if}
		{#if disabledCopyVisible}
			<p class="disabled-copy" role="status">{disabledReason}</p>
		{/if}
	</div>
</section>

<style>
	.panel {
		display: grid;
		gap: 0.85rem;
		padding: 1.1rem 1.2rem;
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.policy-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
		flex-wrap: wrap;
	}

	.scope-row {
		display: flex;
		align-items: end;
		gap: 0.65rem;
		flex-wrap: wrap;
	}

	.scope-tabs {
		display: inline-flex;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		overflow: hidden;
	}

	.scope-tabs button {
		padding: 0.42rem 0.85rem;
		border: 0;
		border-left: 1px solid var(--brass-500);
		border-radius: 0;
		background: transparent;
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.scope-tabs button:first-child {
		border-left: 0;
	}

	.scope-tabs button:hover:not(:disabled):not([aria-selected='true']),
	.scope-tabs button:focus-visible {
		background: var(--paper-200);
		outline: none;
	}

	.scope-tabs button[aria-selected='true'] {
		background: var(--brass-500);
		color: var(--ink-900);
	}

	.scope-tabs button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.target {
		display: grid;
		min-width: 0;
		gap: 0.2rem;
	}

	.target > span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.target select {
		min-width: 9rem;
	}

	.scope-summary {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	/* Five equal framed segmented-control cards. */
	.policy-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.policy-field {
		display: grid;
		min-width: 0;
		gap: 0.4rem;
		align-content: start;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.6rem;
	}

	.field-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.field-eyebrow :global(svg) {
		width: 0.85rem;
		height: 0.85rem;
	}

	.segmented {
		display: flex;
		flex-wrap: wrap;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		overflow: hidden;
	}

	.segment {
		position: relative;
		display: grid;
		flex: 1 0 auto;
	}

	.segment + .segment {
		border-top: 0;
		border-left: 1px solid var(--paper-edge);
	}

	.segment input {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		cursor: pointer;
	}

	.segment input:disabled {
		cursor: not-allowed;
	}

	.segment > span {
		padding: 0.22rem 0.32rem;
		text-align: center;
		font-family: var(--font-ui);
		font-size: 0.64rem;
		line-height: 1.15;
		color: var(--ink-700);
		white-space: nowrap;
		pointer-events: none;
	}

	.segment input:disabled ~ span {
		opacity: 0.55;
	}

	.segment input:focus-visible ~ span {
		outline: 2px solid var(--brass-500);
		outline-offset: -2px;
	}

	/* Selected segment: pale brass fill. */
	.segment.selected {
		background: var(--brass-300);
	}

	.segment.selected > span {
		font-weight: 700;
	}

	select,
	button {
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0.55rem 0.7rem;
		font-family: var(--font-ui);
		font-size: 0.86rem;
	}

	small {
		color: var(--ink-500);
		font-family: var(--font-body);
		line-height: 1.35;
	}

	small.provenance {
		font-weight: 700;
	}

	button {
		cursor: pointer;
	}

	button.secondary {
		justify-self: start;
		border-color: var(--paper-edge);
		background: transparent;
		font-size: 0.68rem;
		padding: 0.25rem 0.45rem;
	}

	.reset {
		justify-self: start;
		width: auto;
		background: var(--paper-100);
	}

	.policy-footer {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		min-height: 1.5rem;
	}

	.policy-footer p {
		margin: 0;
	}

	button:hover:not(:disabled),
	button:focus-visible,
	select:hover,
	select:focus-visible {
		background: var(--paper-200);
		outline: none;
	}

	@media (max-width: 980px) {
		.policy-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 520px) {
		.policy-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
