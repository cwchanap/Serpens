<script lang="ts">
	import {
		POLICY_FIELD_OPTIONS,
		resolveEffectivePolicy,
		type EffectivePolicy,
		type PolicyValueSource
	} from '$lib/game/policyInheritance';
	import { getWorldCityDefinition, isWorldCityId } from '$lib/game/worldCatalog';
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
	<h2 id="policy-heading">{i18n.t('policyPanel.title')}</h2>

	<div class="scope-controls">
		<label>
			<span>{i18n.t('policyPanel.scopeLabel')}</span>
			<select
				aria-label={i18n.t('policyPanel.scopeLabel')}
				value={selectedScopeKind}
				onchange={(event) => setScopeKind(event.currentTarget.value)}
			>
				<option value="company">{i18n.t('policyPanel.scopes.company')}</option>
				<option value="city" disabled={cityOptions.length === 0}>
					{i18n.t('policyPanel.scopes.city')}
				</option>
				<option value="store" disabled={storeOptions.length === 0}>
					{i18n.t('policyPanel.scopes.store')}
				</option>
			</select>
		</label>
		{#if selectedScopeKind === 'city'}
			<label>
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
		{:else if selectedScopeKind === 'store'}
			<label>
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
				<span>{fieldLabelText}</span>
				<select
					aria-label={fieldLabelText}
					disabled={scopedControlsDisabled}
					value={effectivePolicy.values[field]}
					onchange={(event) => update(field, event.currentTarget.value)}
				>
					{#each POLICY_FIELD_OPTIONS[field] as option (option)}
						<option value={option}>{valueLabel(field, option)}</option>
					{/each}
				</select>
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

	{#if selectedScope}
		<button type="button" class="reset" disabled={!canUpdateScoped} onclick={resetScope}>
			{i18n.t('policyPanel.resetScope')}
		</button>
	{/if}
	{#if disabledCopyVisible}
		<p class="disabled-copy" role="status">{disabledReason}</p>
	{/if}
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

	.scope-controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}

	.scope-summary {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	.policy-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.85rem;
	}

	label,
	.policy-field {
		display: grid;
		min-width: 0;
		gap: 0.35rem;
	}

	label > span,
	.policy-field > span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	select,
	button {
		width: 100%;
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
		border-color: var(--paper-edge);
		background: transparent;
		font-size: 0.75rem;
	}

	.reset {
		justify-self: start;
		width: auto;
		background: var(--paper-100);
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
		.scope-controls,
		.policy-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
