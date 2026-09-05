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
	import GameIcon from './GameIcon.svelte';
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
		canHire?: boolean;
		canAssign?: boolean;
		canUnassign?: boolean;
		canPromote?: boolean;
		disabledReason?: string | null;
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

	let manageOpen = $state(false);
	let pendingFocusStoreId = $state<string | null>(null);

	function focusStoreAssignments(storeId: string): void {
		pendingFocusStoreId = storeId;
		manageOpen = true;
	}

	$effect(() => {
		if (manageOpen && pendingFocusStoreId) {
			const target = document.getElementById(`manage-store-${pendingFocusStoreId}`);
			if (target) {
				target.focus();
				target.scrollIntoView({ block: 'nearest' });
			}
			pendingFocusStoreId = null;
		}
	});

	// Mock parity: donut is moss for adequately covered stores (mock shows an
	// 80% store in moss and a 40% store in wax), wax once coverage drops below.
	const COVERAGE_HEALTHY_THRESHOLD = 75;

	function isCoverageHealthy(coverage: number): boolean {
		return coverage >= COVERAGE_HEALTHY_THRESHOLD;
	}

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

	function storeDisplayNameAt(store: Store, index: number): string {
		return storeDisplayName(store, index + 1, i18n);
	}
</script>

<section class="panel" aria-labelledby="staff-heading">
	<div class="panel-heading">
		<div>
			<h2 id="staff-heading" class="visually-hidden">{i18n.t('staffPanel.title')}</h2>
			<p>{i18n.t('staffPanel.hiredCount', { count: i18n.format.integer(staff.length) })}</p>
		</div>
	</div>
	{#if disabledReason && (!canHire || !canAssign || !canUnassign || !canPromote)}
		<p class="disabled-copy" role="status">{disabledReason}</p>
	{/if}

	<div class="plate-columns">
		<section class="section-group" aria-labelledby="candidates-heading">
			<h3 id="candidates-heading">{i18n.t('staffPanel.candidates')}</h3>
			<div class="people-grid">
				{#each hiringCandidates as candidate (candidate.id)}
					<article class="person-card">
						<div class="person-id">
							<span class="medallion" aria-hidden="true"><GameIcon name="staff" /></span>
							<div>
								<h4>{candidate.name}</h4>
								<p class="role-eyebrow">{roleLabel(candidate.role)}</p>
							</div>
						</div>
						<div class="stat">
							<span class="stat-label">{i18n.t('staffPanel.metrics.skill')}</span>
							<span class="stat-track" aria-hidden="true">
								<span class="stat-fill moss" style:width={`${candidate.skill}%`}></span>
							</span>
							<span class="stat-value">{i18n.format.integer(candidate.skill)}</span>
						</div>
						<div class="stat">
							<span class="stat-label">{i18n.t('staffPanel.metrics.morale')}</span>
							<span class="stat-track" aria-hidden="true">
								<span class="stat-fill brass" style:width={`${candidate.morale}%`}></span>
							</span>
							<span class="stat-value">{i18n.format.integer(candidate.morale)}</span>
						</div>
						<button
							type="button"
							class="hire"
							disabled={!canHire}
							aria-label={hireActionLabel(candidate)}
							onclick={() => {
								if (canHire) onHire(candidate.id);
							}}
						>
							{i18n.t('staffPanel.hireCta')} ·
							{i18n.t('staffPanel.salaryPerMonth', {
								salary: i18n.format.currency(candidate.monthlySalary)
							})}
						</button>
					</article>
				{:else}
					<p class="empty">{i18n.t('staffPanel.emptyCandidates')}</p>
				{/each}
			</div>
		</section>

		<section class="section-group" aria-labelledby="coverage-heading">
			<h3 id="coverage-heading">{i18n.t('staffPanel.storeCoverage')}</h3>
			{#each staffedStores as item, itemIndex (item.store.id)}
				<article class="coverage-card">
					<div class="donut-wrap" aria-hidden="true">
						<svg class="donut" viewBox="0 0 36 36">
							<circle class="track" cx="18" cy="18" r="15.9" pathLength="100" />
							<circle
								class="arc"
								class:under={!isCoverageHealthy(item.summary.coverage)}
								cx="18"
								cy="18"
								r="15.9"
								pathLength="100"
								stroke-dasharray={`${item.summary.coverage} ${100 - item.summary.coverage}`}
								stroke-dashoffset="25"
							/>
						</svg>
						<strong class="donut-value">
							{i18n.format.percent(item.summary.coverage / 100)}
						</strong>
					</div>
					<div class="coverage-body">
						<h4>{storeDisplayNameAt(item.store, itemIndex)}</h4>
						<p class="ratio">
							<span class:under={item.summary.assigned.manager < item.summary.requirement.manager}>
								{i18n.t('staffPanel.ratio.manager', {
									assigned: i18n.format.integer(item.summary.assigned.manager),
									required: i18n.format.integer(item.summary.requirement.manager)
								})}
							</span>
							<span class:under={item.summary.assigned.general < item.summary.requirement.general}>
								{i18n.t('staffPanel.ratio.general', {
									assigned: i18n.format.integer(item.summary.assigned.general),
									required: i18n.format.integer(item.summary.requirement.general)
								})}
							</span>
						</p>
						<div class="tokens">
							{#each item.assignedStaff as member (member.id)}
								<span class="token filled" aria-hidden="true"><GameIcon name="staff" /></span>
							{/each}
							<button
								type="button"
								class="token add"
								aria-label={i18n.t('staffPanel.addStaff', {
									storeName: storeDisplayNameAt(item.store, itemIndex)
								})}
								onclick={() => focusStoreAssignments(item.store.id)}
							>
								+
							</button>
						</div>
					</div>
				</article>
			{/each}
		</section>
	</div>

	<details class="manage" bind:open={manageOpen}>
		<summary>{i18n.t('staffPanel.manageAssignments')}</summary>
		<div class="manage-body">
			<section class="section-group" aria-labelledby="unassigned-heading">
				<h3 id="unassigned-heading" class="manage-subheading">
					{i18n.t('staffPanel.unassigned')}
				</h3>
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
								disabled={!canAssign}
								value=""
								onchange={(event) => handleAssignment(member, event.currentTarget.value)}
							>
								<option value="">{i18n.t('staffPanel.assignment.unassigned')}</option>
								{#each stores as store, storeIndex (store.id)}
									<option value={store.id}>
										{storeDisplayName(store, storeIndex + 1, i18n)}
									</option>
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

			<section class="section-group" aria-label={i18n.t('staffPanel.storeStaffing')}>
				{#each staffedStores as item, itemIndex (item.store.id)}
					<article class="store-card" id={`manage-store-${item.store.id}`} tabindex="-1">
						<div class="store-heading">
							<h3>{storeDisplayNameAt(item.store, itemIndex)}</h3>
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
						</div>
					</article>
				{/each}
			</section>
		</div>
	</details>
</section>

<style>
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

	.panel {
		display: grid;
		gap: 1rem;
		padding: 1.1rem 1.2rem;
	}

	.panel-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
	}

	.panel-heading > * {
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
		font-size: 0.95rem;
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
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 0;
	}

	.section-group {
		display: grid;
		gap: 0.75rem;
		align-content: start;
	}

	/* Plate: candidates column + store coverage column side by side. */
	.plate-columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
		gap: 1rem;
		align-items: start;
	}

	.people-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.person-card,
	.coverage-card,
	.store-card {
		display: grid;
		gap: 0.6rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.85rem;
	}

	.coverage-card {
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
	}

	strong {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--ink-700);
	}

	/* Candidate card: medallion + name + role eyebrow. */
	.person-id {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
	}

	.medallion {
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		flex: none;
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		background: var(--paper-100);
		color: var(--brass-700);
		box-shadow: inset 0 0 0 1px var(--paper-100);
	}

	.medallion :global(svg) {
		width: 1.3rem;
		height: 1.3rem;
	}

	.role-eyebrow {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	/* Skill / morale bar rows: label + track + value at the right end. */
	.stat {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.5rem;
	}

	.stat-label {
		font-family: var(--font-ui);
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.stat-track {
		display: block;
		height: 0.42rem;
		border: 1px solid var(--paper-edge);
		border-radius: 999px;
		background: var(--paper-100);
		overflow: hidden;
	}

	.stat-fill {
		display: block;
		height: 100%;
		border-radius: inherit;
	}

	.stat-fill.moss {
		background: var(--moss);
	}

	.stat-fill.brass {
		background: var(--brass-500);
	}

	.stat-value {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
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

	/* Full-width moss hire CTA. */
	button.hire {
		background: var(--moss);
		border-color: var(--ink-900);
		color: var(--paper-50);
		font-weight: 700;
		box-shadow: inset 0 0 0 1px var(--moss-2);
	}

	button.hire:hover:not(:disabled),
	button.hire:focus-visible {
		background: var(--moss-2);
	}

	button.hire:disabled {
		opacity: 0.55;
	}

	button.secondary {
		background: transparent;
		color: var(--wax-red);
		border-color: var(--wax-red);
	}

	button.secondary:hover {
		background: var(--paper-200);
	}

	/* Coverage card: donut + name/ratios/tokens. */
	.donut-wrap {
		position: relative;
		width: 3.4rem;
		height: 3.4rem;
		flex: none;
	}

	.donut {
		width: 100%;
		height: 100%;
	}

	.donut .track,
	.donut .arc {
		fill: none;
		stroke-width: 4.4;
	}

	.donut .track {
		stroke: var(--paper-200);
	}

	.donut .arc {
		stroke: var(--moss);
	}

	.donut .arc.under {
		stroke: var(--wax-red);
	}

	.donut-value {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--ink-700);
	}

	.coverage-body {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}

	.ratio {
		display: flex;
		gap: 0.75rem;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--ink-700);
	}

	.ratio .under {
		color: var(--wax-red);
	}

	.tokens {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.token {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border-radius: 999px;
	}

	.token.filled {
		border: 1px solid var(--moss-2);
		background: var(--moss);
		color: var(--paper-50);
	}

	.token.filled :global(svg) {
		width: 0.85rem;
		height: 0.85rem;
	}

	.token.add {
		border: 1px dashed var(--brass-500);
		background: transparent;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1;
	}

	.token.add:hover,
	.token.add:focus-visible {
		background: var(--paper-200);
		outline: none;
	}

	/* Secondary manage section: the assignment machinery, compacted. */
	.manage {
		border-top: 1px solid var(--paper-edge);
		padding-top: 0.75rem;
	}

	.manage summary {
		width: fit-content;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		list-style: none;
	}

	.manage summary::-webkit-details-marker {
		display: none;
	}

	.manage summary::before {
		content: '▸ ';
	}

	.manage[open] summary::before {
		content: '▾ ';
	}

	.manage summary:hover,
	.manage summary:focus-visible {
		background: var(--paper-200);
		outline: none;
	}

	.manage-body {
		display: grid;
		gap: 0.9rem;
		margin-top: 0.75rem;
	}

	.store-card:focus-visible {
		outline: 2px solid var(--brass-500);
		outline-offset: 2px;
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

	.manage-subheading {
		font-size: 0.85rem;
	}

	@media (max-width: 980px) {
		.plate-columns {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 720px) {
		.assigned-row,
		.person-heading,
		.people-grid {
			grid-template-columns: 1fr;
		}

		.assigned-row,
		.person-heading {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
