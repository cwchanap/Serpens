<script lang="ts">
	import { getStoreOrdinal } from '$lib/game/state';
	import { summarizeStoreStaffing } from '$lib/game/staffing';
	import {
		canPromoteStaff,
		getStaffTrainingFee,
		getStaffXpForLevel,
		MAX_STAFF_LEVEL
	} from '$lib/game/staffLeveling';
	import type { I18nBundle } from '$lib/i18n';
	import { storeDisplayName } from '$lib/i18n/gameCopy';
	import type { HiringCandidate, StaffMember, StaffRole, Store } from '$lib/game/types';

	interface Props {
		stores: Store[];
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		cash: number;
		i18n: I18nBundle;
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
		onPromote: (staffId: string) => void;
	}

	let {
		stores,
		staff,
		hiringCandidates,
		cash,
		i18n,
		onHire,
		onAssign,
		onUnassign,
		onPromote
	}: Props = $props();

	const unassignedStaff = $derived(staff.filter((member) => member.assignedStoreId === null));
	const staffedStores = $derived.by(() =>
		stores.map((store) => ({
			store,
			summary: summarizeStoreStaffing({ staff }, store),
			assignedStaff: staff.filter((member) => member.assignedStoreId === store.id)
		}))
	);

	function roleLabel(role: StaffRole): string {
		return i18n.t(`staffPanel.role.${role}`);
	}

	function hireActionLabel(candidate: HiringCandidate): string {
		return i18n.t('staffPanel.actionLabels.hire', {
			name: candidate.name,
			role: roleLabel(candidate.role),
			id: candidate.id
		});
	}

	function assignmentContext(member: StaffMember): string {
		const store = stores.find((item) => item.id === member.assignedStoreId);

		if (store) {
			return i18n.t('staffPanel.assignment.currentlyAssigned', {
				storeName: storeDisplayName(store, getStoreOrdinal(stores, store.id), i18n)
			});
		}

		return i18n.t('staffPanel.assignment.currentlyUnassigned');
	}

	function assignActionLabel(member: StaffMember): string {
		return i18n.t('staffPanel.actionLabels.assign', {
			name: member.name,
			role: roleLabel(member.role),
			id: member.id,
			context: assignmentContext(member)
		});
	}

	function unassignActionLabel(member: StaffMember, store: Store): string {
		return i18n.t('staffPanel.actionLabels.unassign', {
			name: member.name,
			role: roleLabel(member.role),
			id: member.id,
			storeName: storeDisplayName(store, getStoreOrdinal(stores, store.id), i18n)
		});
	}

	function handleAssignment(member: StaffMember, storeId: string): void {
		if (storeId) {
			onAssign(member.id, storeId);
			return;
		}

		onUnassign(member.id);
	}

	function canAffordPromotion(member: StaffMember): boolean {
		return cash >= getStaffTrainingFee(member.level);
	}

	function promoteActionLabel(member: StaffMember): string {
		return i18n.t('staffPanel.actionLabels.promote', {
			name: member.name,
			role: roleLabel(member.role),
			id: member.id,
			level: i18n.format.integer(member.level + 1),
			cost: i18n.format.currency(getStaffTrainingFee(member.level))
		});
	}

	function levelProgress(member: StaffMember): string {
		return member.level >= MAX_STAFF_LEVEL
			? i18n.t('staffPanel.levelProgress.max')
			: i18n.t('staffPanel.levelProgress.xp', {
					current: i18n.format.integer(member.xp),
					required: i18n.format.integer(getStaffXpForLevel(member.level))
				});
	}

	function storeCoverageSummary(
		store: Store,
		item: ReturnType<typeof summarizeStoreStaffing>
	): string {
		return i18n.t('staffPanel.coverage', {
			storeName: storeDisplayName(store, getStoreOrdinal(stores, store.id), i18n),
			managerAssigned: i18n.format.integer(item.assigned.manager),
			managerRequired: i18n.format.integer(item.requirement.manager),
			generalAssigned: i18n.format.integer(item.assigned.general),
			generalRequired: i18n.format.integer(item.requirement.general)
		});
	}
</script>

<section class="panel paper" aria-labelledby="staff-heading">
	<div class="panel-heading">
		<div>
			<h2 id="staff-heading">{i18n.t('staffPanel.title')}</h2>
			<p>{i18n.t('staffPanel.hiredCount', { count: i18n.format.integer(staff.length) })}</p>
		</div>
	</div>

	<section class="section-group" aria-labelledby="candidates-heading">
		<h3 id="candidates-heading">{i18n.t('staffPanel.candidates')}</h3>
		<div class="people-grid">
			{#each hiringCandidates as candidate (candidate.id)}
				<article class="person-card">
					<div class="person-heading">
						<div>
							<h4>{candidate.name}</h4>
							<p>{roleLabel(candidate.role)}</p>
						</div>
						<strong>
							{i18n.t('staffPanel.salaryPerMonth', {
								salary: i18n.format.currency(candidate.monthlySalary)
							})}
						</strong>
					</div>
					<dl class="metrics">
						<div>
							<dt>{i18n.t('staffPanel.metrics.skill')}</dt>
							<dd>{i18n.format.integer(candidate.skill)}</dd>
						</div>
						<div>
							<dt>{i18n.t('staffPanel.metrics.morale')}</dt>
							<dd>{i18n.format.integer(candidate.morale)}</dd>
						</div>
					</dl>
					<button
						type="button"
						aria-label={hireActionLabel(candidate)}
						onclick={() => onHire(candidate.id)}
						>{i18n.t('staffPanel.hireButton', { name: candidate.name })}</button
					>
				</article>
			{:else}
				<p class="empty">{i18n.t('staffPanel.emptyCandidates')}</p>
			{/each}
		</div>
	</section>

	<section class="section-group" aria-labelledby="unassigned-heading">
		<h3 id="unassigned-heading">{i18n.t('staffPanel.unassigned')}</h3>
		<div class="people-grid">
			{#each unassignedStaff as member (member.id)}
				<article class="person-card">
					<div class="person-heading">
						<div>
							<h4>{member.name}</h4>
							<p>{roleLabel(member.role)}</p>
						</div>
						<strong>
							{i18n.t('staffPanel.salaryPerMonth', {
								salary: i18n.format.currency(member.monthlySalary)
							})}
						</strong>
					</div>
					<dl class="metrics">
						<div>
							<dt>{i18n.t('staffPanel.metrics.level')}</dt>
							<dd>{i18n.format.integer(member.level)}</dd>
						</div>
						<div>
							<dt>{i18n.t('staffPanel.metrics.skill')}</dt>
							<dd>{i18n.format.integer(member.skill)}</dd>
						</div>
						<div>
							<dt>{i18n.t('staffPanel.metrics.morale')}</dt>
							<dd>{i18n.format.integer(member.morale)}</dd>
						</div>
					</dl>
					<p class="progress">{levelProgress(member)}</p>
					<select
						aria-label={assignActionLabel(member)}
						value=""
						onchange={(event) => handleAssignment(member, event.currentTarget.value)}
					>
						<option value="">{i18n.t('staffPanel.assignment.unassigned')}</option>
						{#each stores as store, storeIndex (store.id)}
							<option value={store.id}>{storeDisplayName(store, storeIndex + 1, i18n)}</option>
						{/each}
					</select>
					{#if canPromoteStaff(member)}
						<button
							type="button"
							disabled={!canAffordPromotion(member)}
							aria-label={promoteActionLabel(member)}
							onclick={() => onPromote(member.id)}
						>
							{i18n.t('staffPanel.promoteButton', {
								name: member.name,
								cost: i18n.format.currency(getStaffTrainingFee(member.level))
							})}
						</button>
					{/if}
				</article>
			{:else}
				<p class="empty">{i18n.t('staffPanel.emptyUnassigned')}</p>
			{/each}
		</div>
	</section>

	<section class="section-group" aria-label={i18n.t('staffPanel.storeStaffing')}>
		{#each staffedStores as item, itemIndex (item.store.id)}
			<article class="store-card">
				<div class="store-heading">
					<div>
						<h3>{storeDisplayName(item.store, itemIndex + 1, i18n)}</h3>
						<p>
							{storeCoverageSummary(item.store, item.summary)}
						</p>
					</div>
					<strong>{i18n.format.percent(item.summary.coverage / 100)}</strong>
				</div>

				<div class="people-list">
					{#each item.assignedStaff as member (member.id)}
						<div class="assigned-row">
							<div>
								<h4>{member.name}</h4>
								<p>
									{i18n.t('staffPanel.levelProgress.inline', {
										role: roleLabel(member.role),
										level: i18n.format.integer(member.level),
										skill: i18n.format.integer(member.skill),
										morale: i18n.format.integer(member.morale)
									})}
								</p>
								<p class="progress">{levelProgress(member)}</p>
							</div>
							<div class="assignment-actions">
								<select
									aria-label={assignActionLabel(member)}
									value={member.assignedStoreId ?? ''}
									onchange={(event) => handleAssignment(member, event.currentTarget.value)}
								>
									<option value="">{i18n.t('staffPanel.assignment.unassigned')}</option>
									{#each stores as store, storeIndex (store.id)}
										<option value={store.id}>{storeDisplayName(store, storeIndex + 1, i18n)}</option
										>
									{/each}
								</select>
								{#if canPromoteStaff(member)}
									<button
										type="button"
										disabled={!canAffordPromotion(member)}
										aria-label={promoteActionLabel(member)}
										onclick={() => onPromote(member.id)}
									>
										{i18n.t('staffPanel.promoteButton', {
											name: member.name,
											cost: i18n.format.currency(getStaffTrainingFee(member.level))
										})}
									</button>
								{/if}
								<button
									type="button"
									class="secondary"
									aria-label={unassignActionLabel(member, item.store)}
									onclick={() => onUnassign(member.id)}
									>{i18n.t('staffPanel.unassignButton')} {member.name}</button
								>
							</div>
						</div>
					{:else}
						<p class="empty">{i18n.t('staffPanel.emptyAssigned')}</p>
					{/each}
				</div>
			</article>
		{/each}
	</section>
</section>

<style>
	.panel {
		display: grid;
		gap: 1rem;
		padding: 1.1rem 1.2rem;
	}

	.panel-heading,
	.store-heading,
	.person-heading,
	.assigned-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
	}

	.panel-heading > *,
	.store-heading > *,
	.person-heading > *,
	.assigned-row > * {
		min-width: 0;
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
		font-size: 0.92rem;
	}

	p,
	dt {
		color: var(--ink-500);
		font-family: var(--font-body);
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
	}

	dl.metrics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 0;
	}

	.section-group {
		display: grid;
		gap: 0.75rem;
	}

	.people-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.75rem;
	}

	.person-card,
	.store-card {
		display: grid;
		gap: 0.6rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.85rem;
	}

	strong {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--ink-700);
	}

	button,
	select {
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.86rem;
		padding: 0.55rem 0.75rem;
	}

	button:hover,
	button:focus-visible,
	select:hover,
	select:focus-visible {
		background: var(--paper-200);
		outline: none;
	}

	button.secondary {
		background: transparent;
		color: var(--wax-red);
		border-color: var(--wax-red);
	}

	button.secondary:hover {
		background: var(--paper-200);
	}

	.people-list {
		display: grid;
		gap: 0.5rem;
	}

	.empty {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-style: italic;
	}

	.progress {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 0.78rem;
		color: var(--ink-500);
	}

	.assignment-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	@media (max-width: 720px) {
		.assigned-row,
		.store-heading,
		.person-heading {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
