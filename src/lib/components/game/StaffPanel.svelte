<script lang="ts">
	import { summarizeStoreStaffing } from '$lib/game/staffing';
	import type { HiringCandidate, StaffMember, StaffRole, Store } from '$lib/game/types';

	interface Props {
		stores: Store[];
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
	}

	let { stores, staff, hiringCandidates, onHire, onAssign, onUnassign }: Props = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const unassignedStaff = $derived(staff.filter((member) => member.assignedStoreId === null));
	const staffedStores = $derived.by(() =>
		stores.map((store) => ({
			store,
			summary: summarizeStoreStaffing({ staff }, store),
			assignedStaff: staff.filter((member) => member.assignedStoreId === store.id)
		}))
	);

	function roleLabel(role: StaffRole): string {
		return role === 'manager' ? 'Manager' : 'General';
	}

	function hireActionLabel(candidate: HiringCandidate): string {
		return `Hire ${candidate.name}, ${roleLabel(candidate.role)} candidate ${candidate.id}`;
	}

	function assignmentContext(member: StaffMember): string {
		const store = stores.find((item) => item.id === member.assignedStoreId);

		if (store) {
			return `currently assigned to ${store.name}`;
		}

		return 'currently unassigned';
	}

	function assignActionLabel(member: StaffMember): string {
		return `Assign ${member.name}, ${roleLabel(member.role)} staff ${member.id}, ${assignmentContext(member)}`;
	}

	function unassignActionLabel(member: StaffMember, store: Store): string {
		return `Unassign ${member.name}, ${roleLabel(member.role)} staff ${member.id} from ${store.name}`;
	}

	function handleAssignment(member: StaffMember, storeId: string): void {
		if (storeId) {
			onAssign(member.id, storeId);
			return;
		}

		onUnassign(member.id);
	}
</script>

<section class="panel" aria-labelledby="staff-heading">
	<div class="panel-heading">
		<div>
			<h2 id="staff-heading">Staff</h2>
			<p>{staff.length} hired staff</p>
		</div>
	</div>

	<section class="section-group" aria-labelledby="candidates-heading">
		<h3 id="candidates-heading">Candidates</h3>
		<div class="people-grid">
			{#each hiringCandidates as candidate (candidate.id)}
				<article class="person-card">
					<div class="person-heading">
						<div>
							<h4>{candidate.name}</h4>
							<p>{roleLabel(candidate.role)}</p>
						</div>
						<strong>{currency.format(candidate.monthlySalary)}/mo</strong>
					</div>
					<dl class="metrics">
						<div>
							<dt>Skill</dt>
							<dd>{candidate.skill}</dd>
						</div>
						<div>
							<dt>Morale</dt>
							<dd>{candidate.morale}</dd>
						</div>
					</dl>
					<button
						type="button"
						aria-label={hireActionLabel(candidate)}
						onclick={() => onHire(candidate.id)}>Hire {candidate.name}</button
					>
				</article>
			{:else}
				<p class="empty">No candidates available</p>
			{/each}
		</div>
	</section>

	<section class="section-group" aria-labelledby="unassigned-heading">
		<h3 id="unassigned-heading">Unassigned</h3>
		<div class="people-grid">
			{#each unassignedStaff as member (member.id)}
				<article class="person-card">
					<div class="person-heading">
						<div>
							<h4>{member.name}</h4>
							<p>{roleLabel(member.role)}</p>
						</div>
						<strong>{currency.format(member.monthlySalary)}/mo</strong>
					</div>
					<dl class="metrics">
						<div>
							<dt>Skill</dt>
							<dd>{member.skill}</dd>
						</div>
						<div>
							<dt>Morale</dt>
							<dd>{member.morale}</dd>
						</div>
					</dl>
					<select
						aria-label={assignActionLabel(member)}
						value=""
						onchange={(event) => handleAssignment(member, event.currentTarget.value)}
					>
						<option value="">Unassigned</option>
						{#each stores as store (store.id)}
							<option value={store.id}>{store.name}</option>
						{/each}
					</select>
				</article>
			{:else}
				<p class="empty">No unassigned staff</p>
			{/each}
		</div>
	</section>

	<section class="section-group" aria-label="Store staffing">
		{#each staffedStores as item (item.store.id)}
			<article class="store-card">
				<div class="store-heading">
					<div>
						<h3>{item.store.name}</h3>
						<p>
							{item.store.name}: {item.summary.assigned.manager}/{item.summary.requirement.manager}
							managers, {item.summary.assigned.general}/{item.summary.requirement.general} general
						</p>
					</div>
					<strong>{Math.round(item.summary.coverage)}%</strong>
				</div>

				<div class="people-list">
					{#each item.assignedStaff as member (member.id)}
						<div class="assigned-row">
							<div>
								<h4>{member.name}</h4>
								<p>{roleLabel(member.role)} · Skill {member.skill} · Morale {member.morale}</p>
							</div>
							<div class="assignment-actions">
								<select
									aria-label={assignActionLabel(member)}
									value={member.assignedStoreId ?? ''}
									onchange={(event) => handleAssignment(member, event.currentTarget.value)}
								>
									<option value="">Unassigned</option>
									{#each stores as store (store.id)}
										<option value={store.id}>{store.name}</option>
									{/each}
								</select>
								<button
									type="button"
									class="secondary"
									aria-label={unassignActionLabel(member, item.store)}
									onclick={() => onUnassign(member.id)}
									>Unassign {member.name}</button
								>
							</div>
						</div>
					{:else}
						<p class="empty">No assigned staff</p>
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
		border: 1px solid #253244;
		border-radius: 8px;
		background: #111823;
		padding: 1rem;
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
	h4,
	p,
	dt,
	dd,
	strong,
	button,
	select,
	option {
		overflow-wrap: anywhere;
	}

	h2 {
		font-size: 0.95rem;
	}

	h3 {
		font-size: 0.86rem;
	}

	h4 {
		font-size: 0.85rem;
	}

	p,
	dt {
		color: #a7b4c8;
		font-size: 0.78rem;
	}

	strong {
		color: #edf2f7;
		font-size: 0.8rem;
	}

	.section-group {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
	}

	.people-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		min-width: 0;
	}

	.person-card,
	.store-card {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
		border: 1px solid #253244;
		border-radius: 8px;
		background: #0b111a;
		padding: 0.85rem;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		min-width: 0;
		margin: 0;
	}

	.metrics div {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	dd {
		margin: 0;
		color: #edf2f7;
		font-size: 0.9rem;
		font-weight: 700;
	}

	.people-list {
		display: grid;
		gap: 0.6rem;
		min-width: 0;
	}

	.assigned-row {
		border-top: 1px solid #253244;
		padding-top: 0.65rem;
	}

	.assignment-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
		min-width: 0;
	}

	button,
	select {
		border: 1px solid #31445c;
		border-radius: 6px;
		background: #0f1a27;
		color: #edf2f7;
		padding: 0.55rem 0.65rem;
		font: inherit;
		min-width: 0;
	}

	button {
		cursor: pointer;
		font-weight: 700;
	}

	button:hover,
	select:hover,
	button:focus-visible,
	select:focus-visible {
		border-color: #4f86c6;
	}

	button:focus-visible,
	select:focus-visible {
		outline: 2px solid #6aa8f7;
		outline-offset: 2px;
	}

	.secondary {
		background: #172131;
	}

	select {
		max-width: 100%;
		min-width: 11rem;
	}

	.empty {
		border: 1px dashed #31445c;
		border-radius: 8px;
		padding: 0.75rem;
	}

	@media (max-width: 760px) {
		.people-grid {
			grid-template-columns: 1fr;
		}

		.assigned-row {
			display: grid;
		}

		.assignment-actions {
			justify-content: stretch;
		}

		select,
		button {
			width: 100%;
		}
	}
</style>
