<script lang="ts">
	import {
		POLICY_FIELD_OPTIONS,
		resolveEffectivePolicy,
		type EffectivePolicy,
		type PolicyValueSource
	} from '$lib/game/policyInheritance';
	import { getWorldCityDefinition, isWorldCityId } from '$lib/game/worldCatalog';
	import type { CompanyPolicy, GameState, PolicyOverrideScope, WorldCityId } from '$lib/game/types';
	import type { I18nBundle, TranslationKey } from '$lib/i18n';

	interface Props {
		compact?: boolean;
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
		compact = false,
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

<section class="panel" class:paper={!compact} class:compact aria-labelledby="policy-heading">
	<h2 id="policy-heading">{i18n.t('policyPanel.title')}</h2>

	<div class="scope-controls">
		{#if compact}<div class="segments" role="group" aria-label={i18n.t('policyPanel.scopeLabel')}>
				{#each ['company', 'city', 'store'] as const as scope (scope)}<button
						type="button"
						aria-pressed={selectedScopeKind === scope}
						disabled={(scope === 'city' && !cityOptions.length) ||
							(scope === 'store' && !storeOptions.length)}
						onclick={() => setScopeKind(scope)}>{i18n.t(`policyPanel.scopes.${scope}`)}</button
					>{/each}
			</div>{:else}
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
			</label>{/if}
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
				<span class="field-heading"
					>{#if compact}<svg
							viewBox="0 0 24 24"
							aria-hidden="true"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						>
							{#if field === 'pricing'}<path d="M4 12h16" /><path d="M8 7l-4 5 4 5" /><path
									d="M16 7l4 5-4 5"
								/>
							{:else if field === 'inventory'}<path d="M3 8 12 4l9 4v8l-9 4-9-4Z" /><path
									d="M3 8l9 4 9-4"
								/>
							{:else if field === 'staffing'}<circle cx="12" cy="8" r="3.4" /><path
									d="M5 20c1.6-4 12.8-4 14 0"
								/>
							{:else if field === 'marketing'}<path d="M4 10v4h4l6 4V6l-6 4z" /><path
									d="M18 8.5a5 5 0 0 1 0 7"
								/>
							{:else}<path d="M12 4l7 3v5c0 4-3 6.6-7 8-4-1.4-7-4-7-8V7z" />{/if}
						</svg>{/if}{fieldLabelText}</span
				>
				{#if compact}<div class="segments" role="group" aria-label={fieldLabelText}>
						{#each POLICY_FIELD_OPTIONS[field] as option (option)}<button
								type="button"
								disabled={scopedControlsDisabled}
								aria-pressed={effectivePolicy.values[field] === option}
								onclick={() => update(field, option)}
								aria-label={valueLabel(field, option)}
								title={valueLabel(field, option)}
								>{i18n.t(`policyPanel.compactValues.${field}.${option}` as TranslationKey)}</button
							>{/each}
					</div>{:else}
					<select
						aria-label={fieldLabelText}
						disabled={scopedControlsDisabled}
						value={effectivePolicy.values[field]}
						onchange={(event) => update(field, event.currentTarget.value)}
					>
						{#each POLICY_FIELD_OPTIONS[field] as option (option)}
							<option value={option}>{valueLabel(field, option)}</option>
						{/each}
					</select>{/if}
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

	.compact {
		padding: 0.75rem 0 0;
		border-top: 1px solid var(--paper-edge);
		grid-template-columns: auto 1fr;
		align-items: center;
	}
	.compact .policy-grid,
	.compact .scope-summary,
	.compact .disabled-copy,
	.compact .reset {
		grid-column: 1 / -1;
	}
	.compact .scope-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-self: start;
		gap: 12px;
	}
	.compact .scope-controls .segments button {
		flex: 0 0 auto;
		padding: 6px 12px;
		font-size: 12px;
		font-weight: 700;
	}
	.compact .policy-grid {
		gap: 10px;
	}
	.compact {
		gap: 10px;
	}
	.compact .policy-field .segments button {
		font: 11px var(--font-mono);
		padding: 6px 2px;
	}

	.compact .policy-field {
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		padding: 10px;
	}

	.compact .policy-field > .provenance {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.segments {
		display: flex;
		min-width: 0;
		gap: 0;
	}
	.segments button {
		width: auto;
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		padding: 0.4rem 0.2rem;
		font-size: 0.65rem;
		border-color: var(--paper-edge);
	}
	.segments button {
		border-radius: 0;
		border-color: var(--brass-500);
	}
	.segments button + button {
		border-left: 0;
	}
	.segments button:focus-visible {
		outline: 2px solid var(--wax-red);
		outline-offset: 2px;
		z-index: 1;
	}
	.segments button[aria-pressed='true'] {
		background: var(--paper-300);
		border-color: var(--brass-500);
	}
	.segments button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.field-heading {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.field-heading svg {
		width: 1rem;
		height: 1rem;
	}
</style>
