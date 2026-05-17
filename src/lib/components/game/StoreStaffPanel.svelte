<script lang="ts">
	import { summarizeStoreStaffing } from '$lib/game/staffing';
	import type { HiringCandidate, StaffMember, StaffRole, Store } from '$lib/game/types';

	interface Props {
		store: Store;
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
	}

	let { store, staff, hiringCandidates, onHire, onAssign, onUnassign }: Props = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const assignedStaff = $derived(staff.filter((member) => member.assignedStoreId === store.id));
	const unassignedStaff = $derived(staff.filter((member) => member.assignedStoreId === null));
	const staffing = $derived(summarizeStoreStaffing({ staff }, store));

	function roleLabel(role: StaffRole): string {
		return role === 'manager' ? 'Manager' : 'General';
	}

	function hireActionLabel(candidate: HiringCandidate): string {
		return `Hire ${candidate.name}, ${roleLabel(candidate.role)} candidate ${candidate.id}`;
	}

	function assignActionLabel(member: StaffMember): string {
		return `Assign ${member.name}, ${roleLabel(member.role)} staff ${member.id} to ${store.name}`;
	}

	function unassignActionLabel(member: StaffMember): string {
		return `Unassign ${member.name}, ${roleLabel(member.role)} staff ${member.id} from ${store.name}`;
	}
</script>

<section class="store-staff" aria-labelledby={`${store.id}-staff-heading`}>
	<div class="staff-heading">
		<div>
			<h3 id={`${store.id}-staff-heading`}>{store.name} staff</h3>
			<p>
				{staffing.assigned.manager}/{staffing.requirement.manager} managers,
				{staffing.assigned.general}/{staffing.requirement.general} general
			</p>
		</div>
		<strong>{Math.round(staffing.coverage)}%</strong>
	</div>

	<dl class="metrics">
		<div>
			<dt>Skill</dt>
			<dd>{Math.round(staffing.averageSkill)}</dd>
		</div>
		<div>
			<dt>Morale</dt>
			<dd>{Math.round(staffing.averageMorale)}</dd>
		</div>
	</dl>

	<section class="staff-section" aria-label="Assigned staff">
		<h4>Assigned</h4>
		<div class="people-list">
			{#each assignedStaff as member (member.id)}
				<article class="person-row">
					<div>
						<h5>{member.name}</h5>
						<p>{roleLabel(member.role)} · Skill {member.skill} · Morale {member.morale}</p>
						<small>{currency.format(member.monthlySalary)}/mo</small>
					</div>
					<button
						type="button"
						aria-label={unassignActionLabel(member)}
						onclick={() => onUnassign(member.id)}
					>
						Unassign
					</button>
				</article>
			{:else}
				<p class="empty">No assigned staff</p>
			{/each}
		</div>
	</section>

	<section class="staff-section" aria-label="Unassigned staff">
		<h4>Unassigned</h4>
		<div class="people-list">
			{#each unassignedStaff as member (member.id)}
				<article class="person-row">
					<div>
						<h5>{member.name}</h5>
						<p>{roleLabel(member.role)} · Skill {member.skill} · Morale {member.morale}</p>
						<small>{currency.format(member.monthlySalary)}/mo</small>
					</div>
					<button
						type="button"
						aria-label={assignActionLabel(member)}
						onclick={() => onAssign(member.id, store.id)}
					>
						Assign
					</button>
				</article>
			{:else}
				<p class="empty">No unassigned staff</p>
			{/each}
		</div>
	</section>

	<section class="staff-section" aria-label="Hiring candidates">
		<h4>Candidates</h4>
		<div class="people-list">
			{#each hiringCandidates as candidate (candidate.id)}
				<article class="person-row">
					<div>
						<h5>{candidate.name}</h5>
						<p>{roleLabel(candidate.role)} · Skill {candidate.skill} · Morale {candidate.morale}</p>
						<small>{currency.format(candidate.monthlySalary)}/mo</small>
					</div>
					<button
						type="button"
						aria-label={hireActionLabel(candidate)}
						onclick={() => onHire(candidate.id)}
					>
						Hire
					</button>
				</article>
			{:else}
				<p class="empty">No candidates available</p>
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
		font-weight: 750;
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
