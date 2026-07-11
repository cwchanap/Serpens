<script lang="ts">
	import { summarizeStoreStaffing } from '$lib/game/staffing';
	import type { I18nBundle } from '$lib/i18n';
	import { storeDisplayName } from '$lib/i18n/gameCopy';
	import type { HiringCandidate, StaffMember, StaffRole, Store } from '$lib/game/types';

	interface Props {
		i18n: I18nBundle;
		store: Store;
		ordinal: number;
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
	}

	let { i18n, store, ordinal, staff, hiringCandidates, onHire, onAssign, onUnassign }: Props =
		$props();

	const assignedStaff = $derived(staff.filter((member) => member.assignedStoreId === store.id));
	const unassignedStaff = $derived(staff.filter((member) => member.assignedStoreId === null));
	const staffing = $derived(summarizeStoreStaffing({ staff }, store));

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

	function assignActionLabel(member: StaffMember): string {
		return i18n.t('staffPanel.actionLabels.assignToStore', {
			name: member.name,
			role: roleLabel(member.role),
			id: member.id,
			storeName: storeDisplayName(store, ordinal, i18n)
		});
	}

	function unassignActionLabel(member: StaffMember): string {
		return i18n.t('staffPanel.actionLabels.unassign', {
			name: member.name,
			role: roleLabel(member.role),
			id: member.id,
			storeName: storeDisplayName(store, ordinal, i18n)
		});
	}

	function storeCoverageSummary(): string {
		return i18n.t('staffPanel.coverage', {
			storeName: storeDisplayName(store, ordinal, i18n),
			managerAssigned: i18n.format.integer(staffing.assigned.manager),
			managerRequired: i18n.format.integer(staffing.requirement.manager),
			generalAssigned: i18n.format.integer(staffing.assigned.general),
			generalRequired: i18n.format.integer(staffing.requirement.general)
		});
	}

	function staffMetrics(member: { role: StaffRole; skill: number; morale: number }): string {
		return i18n.t('staffPanel.levelProgress.storeInline', {
			role: roleLabel(member.role),
			skill: i18n.format.integer(member.skill),
			morale: i18n.format.integer(member.morale)
		});
	}
</script>

<section class="store-staff" aria-labelledby={`${store.id}-staff-heading`}>
	<div class="staff-heading">
		<div>
			<h3 id={`${store.id}-staff-heading`}>
				{i18n.t('storeDetail.staffTitle', { storeName: storeDisplayName(store, ordinal, i18n) })}
			</h3>
			<p>{storeCoverageSummary()}</p>
		</div>
		<strong>{i18n.format.percent(staffing.coverage / 100)}</strong>
	</div>

	<dl class="metrics">
		<div>
			<dt>{i18n.t('staffPanel.metrics.skill')}</dt>
			<dd>{i18n.format.integer(Math.round(staffing.averageSkill))}</dd>
		</div>
		<div>
			<dt>{i18n.t('staffPanel.metrics.morale')}</dt>
			<dd>{i18n.format.integer(Math.round(staffing.averageMorale))}</dd>
		</div>
	</dl>

	<section class="staff-section" aria-label={i18n.t('staffPanel.assigned')}>
		<h4>{i18n.t('staffPanel.assigned')}</h4>
		<div class="people-list">
			{#each assignedStaff as member (member.id)}
				<article class="person-row">
					<div>
						<h5>{member.name}</h5>
						<p>{staffMetrics(member)}</p>
						<small>
							{i18n.t('staffPanel.salaryPerMonth', {
								salary: i18n.format.currency(member.monthlySalary)
							})}
						</small>
					</div>
					<button
						type="button"
						aria-label={unassignActionLabel(member)}
						onclick={() => onUnassign(member.id)}
					>
						{i18n.t('staffPanel.unassignButton')}
					</button>
				</article>
			{:else}
				<p class="empty">{i18n.t('staffPanel.emptyAssigned')}</p>
			{/each}
		</div>
	</section>

	<section class="staff-section" aria-label={i18n.t('staffPanel.unassigned')}>
		<h4>{i18n.t('staffPanel.unassigned')}</h4>
		<div class="people-list">
			{#each unassignedStaff as member (member.id)}
				<article class="person-row">
					<div>
						<h5>{member.name}</h5>
						<p>{staffMetrics(member)}</p>
						<small>
							{i18n.t('staffPanel.salaryPerMonth', {
								salary: i18n.format.currency(member.monthlySalary)
							})}
						</small>
					</div>
					<button
						type="button"
						aria-label={assignActionLabel(member)}
						onclick={() => onAssign(member.id, store.id)}
					>
						{i18n.t('staffPanel.assignButton')}
					</button>
				</article>
			{:else}
				<p class="empty">{i18n.t('staffPanel.emptyUnassigned')}</p>
			{/each}
		</div>
	</section>

	<section class="staff-section" aria-label={i18n.t('staffPanel.candidates')}>
		<h4>{i18n.t('staffPanel.candidates')}</h4>
		<div class="people-list">
			{#each hiringCandidates as candidate (candidate.id)}
				<article class="person-row">
					<div>
						<h5>{candidate.name}</h5>
						<p>{staffMetrics(candidate)}</p>
						<small>
							{i18n.t('staffPanel.salaryPerMonth', {
								salary: i18n.format.currency(candidate.monthlySalary)
							})}
						</small>
					</div>
					<button
						type="button"
						aria-label={hireActionLabel(candidate)}
						onclick={() => onHire(candidate.id)}
					>
						{i18n.t('staffPanel.hireButton', { name: candidate.name })}
					</button>
				</article>
			{:else}
				<p class="empty">{i18n.t('staffPanel.emptyCandidates')}</p>
			{/each}
		</div>
	</section>
</section>

<style>
	.store-staff {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
	}

	.staff-heading,
	.person-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
	}

	.staff-heading > *,
	.person-row > * {
		min-width: 0;
	}

	h3,
	h4,
	h5,
	p,
	dl {
		margin: 0;
	}

	h3,
	h4,
	h5,
	p,
	dt,
	dd,
	small,
	strong,
	button {
		overflow-wrap: anywhere;
	}

	h3 {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 400;
	}

	h4 {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	h5 {
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 400;
	}

	p,
	dt,
	small,
	.empty {
		font-family: var(--font-body);
		color: var(--ink-500);
		font-size: 0.76rem;
	}

	strong {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--brass-500);
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.metrics div {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.55rem;
	}

	dd {
		margin: 0.15rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
	}

	.staff-section {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}

	.people-list {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}

	.person-row,
	.empty {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.65rem;
	}

	button {
		flex: 0 0 auto;
		width: auto;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		padding: 0.45rem 0.6rem;
		text-align: center;
	}

	button:hover,
	button:focus-visible {
		border-color: var(--brass-500);
		background: var(--paper-50);
		outline: none;
	}

	@media (max-width: 520px) {
		.person-row {
			display: grid;
		}

		button {
			width: 100%;
		}
	}
</style>
