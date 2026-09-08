<script lang="ts">
	import HudIcon from './HudIcon.svelte';
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
		compact?: boolean;
		stores: Store[];
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		cash: number;
		i18n: I18nBundle;
		onHire: (candidateId: string) => void;
		onAssign: (staffId: string, storeId: string) => void;
		onUnassign: (staffId: string) => void;
		onPromote: (staffId: string) => void;
		canHire?: boolean;
		canAssign?: boolean;
		canUnassign?: boolean;
		canPromote?: boolean;
		disabledReason?: string | null;
	}

	let {
		compact = false,
		stores,
		staff,
		hiringCandidates,
		cash,
		i18n,
		onHire,
		onAssign,
		onUnassign,
		onPromote,
		canHire = true,
		canAssign = true,
		canUnassign = true,
		canPromote = true,
		disabledReason = null
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
			if (canAssign) onAssign(member.id, storeId);
			return;
		}

		if (canUnassign) onUnassign(member.id);
	}

	function hasAssignmentAction(member: StaffMember): boolean {
		const hasAssignment = member.assignedStoreId !== null;
		return (
			(hasAssignment && canUnassign) ||
			(canAssign && stores.some((candidateStore) => candidateStore.id !== member.assignedStoreId))
		);
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
		return i18n.t(compact ? 'staffPanel.coverageShort' : 'staffPanel.coverage', {
			storeName: storeDisplayName(store, getStoreOrdinal(stores, store.id), i18n),
			managerAssigned: i18n.format.integer(item.assigned.manager),
			managerRequired: i18n.format.integer(item.requirement.manager),
			generalAssigned: i18n.format.integer(item.assigned.general),
			generalRequired: i18n.format.integer(item.requirement.general)
		});
	}
</script>

<section class="panel" class:compact aria-labelledby="staff-heading">
	<div class="panel-heading">
		<div>
			<h2 id="staff-heading">{i18n.t('staffPanel.title')}</h2>
			<p>{i18n.t('staffPanel.hiredCount', { count: i18n.format.integer(staff.length) })}</p>
		</div>
	</div>
	{#if disabledReason && (!canHire || !canAssign || !canUnassign || !canPromote)}
		<p class="disabled-copy" role="status">{disabledReason}</p>
	{/if}

	<section class="section-group candidates" aria-labelledby="candidates-heading">
		<h3 id="candidates-heading">{i18n.t('staffPanel.candidates')}</h3>
		<div class="people-grid">
			{#each hiringCandidates as candidate (candidate.id)}
				<article class="person-card">
					<div class="person-heading">
						<div class="staff-stamp"><HudIcon name="person" /></div>
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
							<meter
								min="0"
								max="100"
								value={candidate.skill}
								style:--rating-color={candidate.skill >= 70 ? 'var(--moss)' : 'var(--brass-700)'}
								aria-label={i18n.t('staffPanel.metrics.skill')}
							></meter>
						</div>
						<div>
							<dt>{i18n.t('staffPanel.metrics.morale')}</dt>
							<dd>{i18n.format.integer(candidate.morale)}</dd>
							<meter
								min="0"
								max="100"
								value={candidate.morale}
								style:--rating-color={candidate.morale >= 70 ? 'var(--moss)' : 'var(--brass-700)'}
								aria-label={i18n.t('staffPanel.metrics.morale')}
							></meter>
						</div>
					</dl>
					<button
						type="button"
						disabled={!canHire}
						aria-label={hireActionLabel(candidate)}
						onclick={() => {
							if (canHire) onHire(candidate.id);
						}}
						>{i18n.t('staffPanel.hireButton', {
							name: i18n.t('staffPanel.salaryPerMonth', {
								salary: i18n.format.currency(candidate.monthlySalary)
							})
						})}</button
					>
				</article>
			{:else}
				<p class="empty">{i18n.t('staffPanel.emptyCandidates')}</p>
			{/each}
		</div>
	</section>

	{#if !compact || unassignedStaff.length}
		<section class="section-group unassigned" aria-labelledby="unassigned-heading">
			<h3 id="unassigned-heading">{i18n.t('staffPanel.unassigned')}</h3>
			<div class="people-grid">
				{#each unassignedStaff as member (member.id)}
					<article class="person-card">
						<div class="person-heading">
							<div class="staff-stamp"><HudIcon name="person" /></div>
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
								<meter
									min="0"
									max="100"
									value={member.skill}
									aria-label={i18n.t('staffPanel.metrics.skill')}
								></meter>
							</div>
							<div>
								<dt>{i18n.t('staffPanel.metrics.morale')}</dt>
								<dd>{i18n.format.integer(member.morale)}</dd>
								<meter
									min="0"
									max="100"
									value={member.morale}
									aria-label={i18n.t('staffPanel.metrics.morale')}
								></meter>
							</div>
						</dl>
						<p class="progress">{levelProgress(member)}</p>
						<select
							aria-label={assignActionLabel(member)}
							disabled={!canAssign}
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
								disabled={!canPromote || !canAffordPromotion(member)}
								aria-label={promoteActionLabel(member)}
								onclick={() => {
									if (canPromote) onPromote(member.id);
								}}
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
	{/if}
	<section class="section-group coverage" aria-label={i18n.t('staffPanel.storeStaffing')}>
		{#if compact}<h3>{i18n.t('staffPanel.storeCoverage')}</h3>{/if}
		{#each staffedStores as item, itemIndex (item.store.id)}
			<article class="store-card">
				<details class="people-list" open={!compact}>
					<summary>
						<div class="store-heading">
							<div>
								<h3>{storeDisplayName(item.store, itemIndex + 1, i18n)}</h3>
								<p>
									{storeCoverageSummary(item.store, item.summary)}
								</p>
							</div>
							<strong
								aria-label={i18n.format.percent(item.summary.coverage / 100)}
								style:--coverage={`${item.summary.coverage}%`}
								style:--coverage-color={item.summary.coverage < 50
									? 'var(--wax-red)'
									: 'var(--moss)'}
								>{compact
									? i18n.format.percent(item.summary.coverage / 100)
									: i18n.format.integer(item.summary.coverage)}</strong
							>
						</div>

						{#if compact}<div class="shift-icons" aria-label={i18n.t('staffPanel.storeStaffing')}>
								{#each item.assignedStaff as member (member.id)}<span
										title={`${member.name} · ${roleLabel(member.role)}`}
										><HudIcon name="person" /></span
									>{/each}
								<span class="assignment-toggle" aria-hidden="true">+</span>
							</div>{/if}
					</summary>
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
									disabled={!hasAssignmentAction(member)}
									value={member.assignedStoreId ?? ''}
									onchange={(event) => handleAssignment(member, event.currentTarget.value)}
								>
									<option value="" disabled={!canUnassign}>
										{i18n.t('staffPanel.assignment.unassigned')}
									</option>
									{#each stores as store, storeIndex (store.id)}
										<option
											value={store.id}
											disabled={!canAssign && store.id !== member.assignedStoreId}
											>{storeDisplayName(store, storeIndex + 1, i18n)}</option
										>
									{/each}
								</select>
								{#if canPromoteStaff(member)}
									<button
										type="button"
										disabled={!canPromote || !canAffordPromotion(member)}
										aria-label={promoteActionLabel(member)}
										onclick={() => {
											if (canPromote) onPromote(member.id);
										}}
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
									disabled={!canUnassign}
									aria-label={unassignActionLabel(member, item.store)}
									onclick={() => {
										if (canUnassign) onUnassign(member.id);
									}}>{i18n.t('staffPanel.unassignButton')} {member.name}</button
								>
							</div>
						</div>
					{:else}
						<p class="empty">{i18n.t('staffPanel.emptyAssigned')}</p>
					{/each}
				</details>
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
	.staff-stamp {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		flex: 0 0 auto;
		border: 2px solid var(--brass-500);
		background: var(--paper-200);
		transform: rotate(-3deg);
	}
	.person-heading {
		flex-wrap: wrap;
	}
	.person-card {
		border-left: 3px solid var(--wax-red);
	}
	meter {
		display: block;
		width: 100%;
		height: 0.7rem;
	}

	.panel {
		grid-template-columns: 1fr 1fr;
		padding: 0;
		align-items: start;
	}
	.panel-heading,
	.disabled-copy {
		grid-column: 1 / -1;
	}
	.panel-heading h2 {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.candidates {
		grid-column: 1;
		grid-row: 2;
	}
	.coverage {
		grid-column: 2;
		grid-row: 2 / span 2;
	}
	.unassigned {
		grid-column: 1;
	}
	.candidates .people-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.person-heading {
		flex-direction: column;
		align-items: start;
	}
	.staff-stamp {
		width: 4.5rem;
		height: 4.5rem;
		border-radius: 50%;
		transform: none;
	}
	.store-heading > strong {
		display: grid;
		place-items: center;
		width: 3.5rem;
		height: 3.5rem;
		border: 4px solid var(--moss);
		border-radius: 50%;
		flex-shrink: 0;
	}
	@media (max-width: 800px) {
		.panel {
			grid-template-columns: 1fr;
		}
		.compact .candidates,
		.compact .coverage,
		.unassigned {
			grid-column: 1;
			grid-row: auto;
		}
	}

	.compact {
		min-height: 260px;
	}
	.compact .candidates,
	.compact .coverage {
		grid-row: 1;
	}
	.candidates .people-grid {
		grid-template-columns: none;
		grid-auto-flow: column;
		grid-auto-columns: calc((100% - 10px) / 2);
		gap: 10px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
	}
	.candidates .person-card {
		scroll-snap-align: start;
	}

	.candidates .person-card {
		align-content: start;
	}
	.candidates dl.metrics {
		grid-template-columns: 1fr;
		gap: 8px;
	}
	.candidates dl.metrics > div {
		display: grid;
		grid-template-columns: 46px minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
	}
	.candidates dt {
		font-size: 9.5px;
		letter-spacing: 0.1em;
	}
	.candidates dd {
		line-height: 1.2;
		grid-column: 3;
		grid-row: 1;
		margin: 0;
		font-size: 12px;
	}
	.candidates meter {
		grid-column: 2;
		grid-row: 1;
		height: 7px;
		appearance: none;
	}
	.candidates meter::-webkit-meter-bar {
		height: 7px;
		border: 0;
		border-radius: 999px;
		background: var(--paper-300);
	}
	.candidates meter::-webkit-meter-optimum-value {
		border-radius: 999px;
		background: var(--rating-color);
	}
	.candidates meter::-moz-meter-bar {
		border-radius: 999px;
		background: var(--rating-color);
	}

	.candidates .person-heading {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr);
		gap: 10px;
		align-items: center;
	}
	.candidates .staff-stamp {
		width: 52px;
		height: 52px;
		border-width: 1.5px;
		color: var(--brass-700);
	}
	.candidates .person-heading > strong {
		display: none;
	}
	.candidates .person-card {
		gap: 8px;
		padding: 12px;
		border-left: 1px solid var(--paper-edge);
	}
	.candidates .person-card h4 {
		font-size: 16px;
	}
	.candidates .person-card p {
		font: 700 10px var(--font-ui);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--brass-700);
	}
	.candidates .person-card button {
		font: 700 13px var(--font-mono);
		padding: 9px;
	}
	.candidates > h3,
	.coverage > h3 {
		font-size: 18px;
	}
	.candidates,
	.coverage {
		gap: 10px;
	}
	.compact .store-card {
		padding: 12px;
	}
	.compact .store-card summary {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr);
		column-gap: 14px;
		list-style: none;
		padding: 0;
	}
	.compact .store-card .store-heading {
		display: contents;
	}
	.compact .store-heading > div {
		grid-column: 2;
		grid-row: 1;
	}
	.compact .store-heading > strong {
		grid-column: 1;
		grid-row: 1 / span 2;
		align-self: center;
	}

	.compact .store-heading {
		align-items: center;
	}
	.compact .store-heading h3 {
		font-size: 17px;
		line-height: 1.2;
	}
	.compact .store-heading p {
		margin-top: 4px;
		font: 12px var(--font-mono);
	}
	.compact .store-heading > strong {
		width: 64px;
		height: 64px;
	}
	.compact .shift-icons {
		grid-column: 2;
		grid-row: 2;
		margin-top: 7px;
		padding-left: 0;
	}
	.compact .shift-icons > span {
		width: 32px;
		height: 32px;
	}
	.compact .shift-icons .assignment-toggle {
		border-style: dashed;
		border-color: var(--wax-red);
		color: var(--wax-red);
		font-size: 17px;
	}
	.compact .people-list[open] .assigned-row {
		margin-top: 12px;
	}

	.people-list summary {
		cursor: pointer;
		padding: 0.5rem 0;
		font: 0.75rem var(--font-ui);
	}
	.compact > .panel-heading {
		display: none;
	}
	.compact .store-heading {
		flex-direction: row-reverse;
		justify-content: flex-end;
		gap: 0.75rem;
	}
	.compact .store-heading > strong {
		font: 16px var(--font-mono);
		border: 0;
		background:
			radial-gradient(circle, var(--paper-50) 52%, transparent 54%),
			conic-gradient(var(--coverage-color) var(--coverage), var(--paper-300) 0);
	}
	.shift-icons {
		display: flex;
		gap: 0.35rem;
		padding-left: 4.25rem;
	}
	.shift-icons > span {
		width: 1.6rem;
		height: 1.6rem;
		border: 1px solid var(--brass-300);
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	.shift-icons :global(svg) {
		width: 1rem;
		height: 1rem;
	}
	.compact .person-card > button {
		background: var(--moss);
		color: var(--paper-50);
	}
	@media (max-width: 800px) {
		.compact {
			min-height: 0;
		}
		.compact .candidates,
		.compact .coverage {
			grid-row: auto;
		}
	}
</style>
