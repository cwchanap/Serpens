<script lang="ts">
	import { getWorldCityDefinition, isWorldCityId } from '$lib/game/worldCatalog';
	import type { I18nBundle } from '$lib/i18n';
	import type {
		GameState,
		ManagerActionChange,
		ManagerActionReason,
		ManagerActionRecord,
		ManagerAuthority,
		ManagerDelegation,
		ManagerDelegationScope,
		ManagerPlaybookId,
		StaffMember,
		WorldCityId
	} from '$lib/game/types';

	interface Props {
		game: GameState;
		i18n: I18nBundle;
		onChange: (delegation: ManagerDelegation) => void;
		onRemove: (managerId: string) => void;
		canUpdate?: boolean;
		disabledReason?: string | null;
	}

	const playbooks = [
		'protect-margin',
		'protect-availability',
		'grow-market-share',
		'stabilize-cash',
		'prefer-local-supply'
	] as const satisfies readonly ManagerPlaybookId[];
	const authorityDomains = {
		'protect-margin': ['pricing'],
		'protect-availability': ['inventory', 'staffing'],
		'grow-market-share': ['pricing'],
		'stabilize-cash': ['inventory'],
		'prefer-local-supply': ['supply']
	} as const satisfies Record<ManagerPlaybookId, readonly (keyof ManagerAuthority)[]>;

	let { game, i18n, onChange, onRemove, canUpdate = true, disabledReason = null }: Props = $props();

	let drafts = $state<Record<string, ManagerDelegation>>({});
	const retailCities = $derived(
		game.cities.filter(
			(city): city is typeof city & { id: WorldCityId } =>
				isWorldCityId(city.id) &&
				getWorldCityDefinition(city.id)?.kind === 'retail' &&
				game.world.openedCityIds.includes(city.id)
		)
	);
	const managers = $derived(game.staff.filter((member) => member.role === 'manager'));
	type ManagerRow = { member: StaffMember; delegation: ManagerDelegation };
	const rows = $derived.by<ManagerRow[]>(() =>
		managers.flatMap((member) => {
			const delegation = delegationFor(member);
			return delegation ? [{ member, delegation }] : [];
		})
	);

	function defaultDelegation(member: StaffMember): ManagerDelegation | null {
		const assignedStore = member.assignedStoreId
			? game.stores.find((store) => store.id === member.assignedStoreId)
			: undefined;
		if (assignedStore) {
			return {
				managerId: member.id,
				scope: { kind: 'store', storeId: assignedStore.id },
				playbook: 'protect-margin',
				authority: { pricing: true, inventory: true, staffing: true, supply: true },
				enabled: false
			};
		}
		const city = retailCities[0];
		if (!city) return null;
		return {
			managerId: member.id,
			scope: { kind: 'city', cityId: city.id },
			playbook: 'protect-margin',
			authority: { pricing: true, inventory: true, staffing: true, supply: true },
			enabled: false
		};
	}

	function delegationFor(member: StaffMember): ManagerDelegation | null {
		return (
			drafts[member.id] ??
			game.managerDelegations.find((delegation) => delegation.managerId === member.id) ??
			defaultDelegation(member)
		);
	}

	function assignmentLabel(member: StaffMember): string {
		const store = member.assignedStoreId
			? game.stores.find((candidate) => candidate.id === member.assignedStoreId)
			: undefined;
		return i18n.t('managerDelegationPanel.assignment', {
			store: store?.name ?? i18n.t('managerDelegationPanel.unassigned')
		});
	}

	function scopeTargetOptions(scope: ManagerDelegationScope) {
		return scope.kind === 'city' ? retailCities : game.stores;
	}

	function scopeTargetValue(scope: ManagerDelegationScope): string {
		return scope.kind === 'city' ? scope.cityId : scope.storeId;
	}

	function scopeTargetLabel(scope: ManagerDelegationScope, value: string): string {
		if (scope.kind === 'city') return i18n.labels.worldCity(value).name;
		return game.stores.find((store) => store.id === value)?.name ?? value;
	}

	function cityForStore(storeId: string): WorldCityId | null {
		const store = game.stores.find((candidate) => candidate.id === storeId);
		return store && isWorldCityId(store.cityId) ? store.cityId : null;
	}

	function emit(row: ManagerRow, patch: Partial<ManagerDelegation>): void {
		if (!canUpdate) return;
		const next = { ...row.delegation, ...patch };
		if (next.playbook === 'prefer-local-supply' && next.scope.kind === 'store') {
			const cityId = cityForStore(next.scope.storeId);
			if (!cityId) return;
			next.scope = { kind: 'city', cityId };
		}
		drafts[row.member.id] = next;
		onChange(next);
	}

	function changeScopeKind(row: ManagerRow, kind: string): void {
		if (kind === 'city') {
			const cityId = retailCities[0]?.id;
			if (cityId) emit(row, { scope: { kind: 'city', cityId } });
			return;
		}
		if (kind === 'store' && row.delegation.playbook !== 'prefer-local-supply') {
			const storeId = game.stores[0]?.id;
			if (storeId) emit(row, { scope: { kind: 'store', storeId } });
		}
	}

	function changeScopeTarget(row: ManagerRow, value: string): void {
		if (row.delegation.scope.kind === 'city' && isWorldCityId(value)) {
			emit(row, { scope: { kind: 'city', cityId: value } });
		} else if (row.delegation.scope.kind === 'store') {
			emit(row, { scope: { kind: 'store', storeId: value } });
		}
	}

	function changePlaybook(row: ManagerRow, value: string): void {
		if (!playbooks.includes(value as ManagerPlaybookId)) return;
		const playbook = value as ManagerPlaybookId;
		if (playbook === 'prefer-local-supply' && row.delegation.scope.kind === 'store') {
			const cityId = cityForStore(row.delegation.scope.storeId);
			if (!cityId) return;
			emit(row, { playbook, scope: { kind: 'city', cityId } });
			return;
		}
		emit(row, { playbook });
	}

	function changeAuthority(
		row: ManagerRow,
		domain: keyof ManagerAuthority,
		checked: boolean
	): void {
		emit(row, { authority: { ...row.delegation.authority, [domain]: checked } });
	}

	function removeDelegation(row: ManagerRow): void {
		if (!canUpdate) return;
		delete drafts[row.member.id];
		onRemove(row.member.id);
	}

	function outcomeLabel(outcome: ManagerActionRecord['outcome']): string {
		return i18n.t(`managerDelegationPanel.history.outcomes.${outcome}` as never);
	}

	function reasonLabel(reason: ManagerActionReason): string {
		return i18n.t(`managerDelegationPanel.history.reasons.${reason}` as never);
	}

	function changeSummary(change: ManagerActionChange): string {
		switch (change.kind) {
			case 'pricing-policy':
				return i18n.t('managerDelegationPanel.history.changes.policy', {
					field: i18n.labels.policyField('pricing'),
					before: i18n.labels.policyValue('pricing', change.before),
					proposed: i18n.labels.policyValue('pricing', change.proposed),
					applied: change.applied
						? i18n.labels.policyValue('pricing', change.applied)
						: i18n.t('managerDelegationPanel.history.notApplied')
				});
			case 'staffing-policy':
				return i18n.t('managerDelegationPanel.history.changes.policy', {
					field: i18n.labels.policyField('staffing'),
					before: i18n.labels.policyValue('staffing', change.before),
					proposed: i18n.labels.policyValue('staffing', change.proposed),
					applied: change.applied
						? i18n.labels.policyValue('staffing', change.applied)
						: i18n.t('managerDelegationPanel.history.notApplied')
				});
			case 'inventory-targets':
				return i18n.t('managerDelegationPanel.history.changes.inventory', {
					product: i18n.labels.productCategory(change.productId),
					before: `${change.before.reorderThreshold}/${change.before.targetStock}`,
					proposed: `${change.proposed.reorderThreshold}/${change.proposed.targetStock}`,
					applied: change.applied
						? `${change.applied.reorderThreshold}/${change.applied.targetStock}`
						: i18n.t('managerDelegationPanel.history.notApplied')
				});
			case 'supply-source':
				return i18n.t('managerDelegationPanel.history.changes.supply', {
					before: change.before
						? i18n.labels.worldCity(change.before).name
						: i18n.t('managerDelegationPanel.history.none'),
					proposed: i18n.labels.worldCity(change.proposed).name,
					applied: change.applied
						? i18n.labels.worldCity(change.applied).name
						: i18n.t('managerDelegationPanel.history.notApplied')
				});
		}
	}

	function recentHistory(managerId: string): GameState['managerActionHistory'] {
		return game.managerActionHistory
			.filter((record) => record.managerId === managerId)
			.slice(-8)
			.reverse();
	}
</script>

<section class="panel paper" aria-labelledby="manager-delegation-heading">
	<div class="panel-heading">
		<div>
			<h2 id="manager-delegation-heading">{i18n.t('managerDelegationPanel.title')}</h2>
			<p>{i18n.t('managerDelegationPanel.description')}</p>
		</div>
	</div>

	{#if disabledReason && !canUpdate}
		<p class="disabled-copy" role="status">{disabledReason}</p>
	{/if}

	<div class="manager-list">
		{#each rows as row (row.member.id)}
			<article class="manager-card">
				<div class="manager-heading">
					<div>
						<h3>{row.member.name}</h3>
						<p>{assignmentLabel(row.member)}</p>
					</div>
					<label class="enabled-control">
						<input
							type="checkbox"
							aria-label={i18n.t('managerDelegationPanel.enabledFor', { name: row.member.name })}
							checked={row.delegation.enabled}
							disabled={!canUpdate}
							onchange={(event) => emit(row, { enabled: event.currentTarget.checked })}
						/>
						<span>
							{i18n.t(
								`managerDelegationPanel.${row.delegation.enabled ? 'enabled' : 'disabled'}` as never
							)}
						</span>
					</label>
				</div>

				<div class="controls-grid">
					<label>
						<span>{i18n.t('managerDelegationPanel.scope')}</span>
						<select
							aria-label={i18n.t('managerDelegationPanel.scopeFor', { name: row.member.name })}
							value={row.delegation.scope.kind}
							disabled={!canUpdate}
							onchange={(event) => changeScopeKind(row, event.currentTarget.value)}
						>
							<option value="city">{i18n.t('managerDelegationPanel.scopes.city')}</option>
							<option value="store" disabled={row.delegation.playbook === 'prefer-local-supply'}>
								{i18n.t('managerDelegationPanel.scopes.store')}
							</option>
						</select>
					</label>
					<label>
						<span>{i18n.t('managerDelegationPanel.target')}</span>
						<select
							aria-label={i18n.t('managerDelegationPanel.targetFor', { name: row.member.name })}
							value={scopeTargetValue(row.delegation.scope)}
							disabled={!canUpdate}
							onchange={(event) => changeScopeTarget(row, event.currentTarget.value)}
						>
							{#each scopeTargetOptions(row.delegation.scope) as target (target.id)}
								<option value={target.id}>
									{scopeTargetLabel(row.delegation.scope, target.id)}
								</option>
							{/each}
						</select>
					</label>
					<label>
						<span>{i18n.t('managerDelegationPanel.playbook')}</span>
						<select
							aria-label={i18n.t('managerDelegationPanel.playbookFor', {
								name: row.member.name
							})}
							value={row.delegation.playbook}
							disabled={!canUpdate}
							onchange={(event) => changePlaybook(row, event.currentTarget.value)}
						>
							{#each playbooks as playbook (playbook)}
								<option value={playbook}>
									{i18n.t(`managerDelegationPanel.playbooks.${playbook}` as never)}
								</option>
							{/each}
						</select>
					</label>
				</div>

				<fieldset class="authority-group">
					<legend>{i18n.t('managerDelegationPanel.authority')}</legend>
					<div class="authority-list">
						{#each authorityDomains[row.delegation.playbook] as domain (domain)}
							<label>
								<input
									type="checkbox"
									aria-label={i18n.t('managerDelegationPanel.authorityFor', {
										domain: i18n.t(`managerDelegationPanel.authorities.${domain}` as never),
										name: row.member.name
									})}
									checked={row.delegation.authority[domain]}
									disabled={!canUpdate}
									onchange={(event) => changeAuthority(row, domain, event.currentTarget.checked)}
								/>
								<span>{i18n.t(`managerDelegationPanel.authorities.${domain}` as never)}</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<div class="card-actions">
					<button
						type="button"
						class="remove"
						disabled={!canUpdate}
						onclick={() => removeDelegation(row)}
					>
						{i18n.t('managerDelegationPanel.remove')}
					</button>
				</div>

				<section class="history" aria-labelledby={`history-${row.member.id}`}>
					<h4 id={`history-${row.member.id}`}>
						{i18n.t('managerDelegationPanel.history.title')}
					</h4>
					{#if recentHistory(row.member.id).length > 0}
						<ul>
							{#each recentHistory(row.member.id) as record (record.id)}
								<li data-outcome={record.outcome}>
									<strong>{outcomeLabel(record.outcome)}</strong>
									<span>{reasonLabel(record.reason)}</span>
									<small>{changeSummary(record.change)}</small>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="empty">{i18n.t('managerDelegationPanel.history.empty')}</p>
					{/if}
				</section>
			</article>
		{:else}
			<p class="empty">{i18n.t('managerDelegationPanel.empty')}</p>
		{/each}
	</div>
</section>

<style>
	.panel {
		display: grid;
		gap: 1rem;
		padding: 1.1rem 1.2rem;
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
		color: var(--ink-700);
	}

	h2 {
		font-size: 1.1rem;
	}

	h3 {
		font-size: 0.95rem;
	}

	h4 {
		font-size: 0.9rem;
	}

	p,
	.empty,
	li {
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	.manager-list {
		display: grid;
		gap: 0.8rem;
	}

	.manager-card {
		display: grid;
		gap: 0.8rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.85rem;
	}

	.manager-heading,
	.card-actions {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.enabled-control,
	.authority-list label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.enabled-control span,
	.authority-group legend,
	.controls-grid label > span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.controls-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
	}

	.controls-grid label {
		display: grid;
		gap: 0.3rem;
	}

	select,
	button {
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.84rem;
		padding: 0.5rem 0.65rem;
	}

	button {
		cursor: pointer;
	}

	button.remove {
		border-color: var(--wax-red);
		background: transparent;
		color: var(--wax-red);
	}

	.authority-group {
		margin: 0;
		border: 1px solid var(--paper-edge);
		padding: 0.65rem;
	}

	.authority-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.4rem;
	}

	.history {
		display: grid;
		gap: 0.45rem;
		border-top: 1px solid var(--paper-edge);
		padding-top: 0.7rem;
	}

	.history ul {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.history li {
		display: grid;
		grid-template-columns: auto auto 1fr;
		gap: 0.45rem;
		align-items: baseline;
	}

	.history li strong {
		color: var(--ink-700);
		font-family: var(--font-ui);
	}

	.history li small {
		grid-column: 1 / -1;
		color: var(--ink-500);
	}

	@media (max-width: 720px) {
		.controls-grid {
			grid-template-columns: 1fr;
		}

		.manager-heading,
		.history li {
			grid-template-columns: 1fr;
			flex-direction: column;
		}
	}
</style>
