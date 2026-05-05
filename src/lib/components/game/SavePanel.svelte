<script lang="ts">
	import type { GameState } from '$lib/game/types';
	import type { SaveSlotMetadata } from '$lib/persistence/saveTypes';

	interface Props {
		activeGame: GameState | null;
		autoSave: SaveSlotMetadata | null;
		slots: SaveSlotMetadata[];
		status: string;
		error: string | null;
		onResumeAutoSave: () => void | Promise<void>;
		onSaveSlot: (name: string, slotId?: string) => void | Promise<void>;
		onLoadSlot: (slotId: string) => void | Promise<void>;
		onDeleteSlot: (slotId: string) => void | Promise<void>;
		onClose: () => void;
	}

	let {
		activeGame,
		autoSave,
		slots,
		status,
		error,
		onResumeAutoSave,
		onSaveSlot,
		onLoadSlot,
		onDeleteSlot,
		onClose
	}: Props = $props();

	let slotName = $state('');

	const canSaveNewSlot = $derived(Boolean(activeGame && slotName.trim().length > 0));
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	function formatUpdatedAt(value: string): string {
		const date = new Date(value);

		if (Number.isNaN(date.getTime())) {
			return value;
		}

		return dateFormatter.format(date);
	}

	function formatSlotDetails(slot: SaveSlotMetadata): string {
		return `Day ${slot.day} · ${slot.storeCount} stores · ${formatUpdatedAt(slot.updatedAt)}`;
	}

	function formatManualSlotDetails(slot: SaveSlotMetadata): string {
		return `Day ${slot.day} · ${slot.activeCityName} · ${slot.storeCount} stores · ${formatUpdatedAt(slot.updatedAt)}`;
	}

	function saveNewSlot(): void {
		const name = slotName.trim();

		if (!activeGame || name.length === 0) {
			return;
		}

		void onSaveSlot(name);
		slotName = '';
	}
</script>

<div class="save-backdrop">
	<button type="button" class="save-backdrop-button" aria-label="Dismiss saves" onclick={onClose}
	></button>

	<div class="save-panel" role="dialog" aria-modal="true" aria-label="Saves">
		<header>
			<div>
				<p class="eyebrow">Saves</p>
				<h2>Desktop Saves</h2>
			</div>
			<button type="button" class="close" aria-label="Close saves" onclick={onClose}>Close</button>
		</header>

		<section class="auto-save" aria-label="Auto-save">
			<div>
				<h3>Auto-save</h3>
				{#if autoSave}
					<p>{formatSlotDetails(autoSave)}</p>
				{:else}
					<p>No auto-save yet.</p>
				{/if}
			</div>
			<button type="button" disabled={!autoSave} onclick={() => void onResumeAutoSave()}
				>Resume</button
			>
		</section>

		<section aria-label="Create save slot">
			<h3>New slot</h3>
			<div class="new-slot">
				<label>
					<span>Slot name</span>
					<input bind:value={slotName} />
				</label>
				<button type="button" disabled={!canSaveNewSlot} onclick={saveNewSlot}>Save slot</button>
			</div>
		</section>

		<section aria-label="Manual save slots">
			<h3>Manual slots</h3>
			{#if slots.length > 0}
				<div class="slots">
					{#each slots as slot (slot.id)}
						<article>
							<div>
								<h4>{slot.name}</h4>
								<p>{formatManualSlotDetails(slot)}</p>
							</div>
							<div class="slot-actions">
								<button type="button" onclick={() => void onLoadSlot(slot.id)}>Load</button>
								<button
									type="button"
									disabled={!activeGame}
									onclick={() => void onSaveSlot(slot.name, slot.id)}
								>
									Overwrite
								</button>
								<button type="button" onclick={() => void onDeleteSlot(slot.id)}>Delete</button>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<p class="empty">No manual slots yet.</p>
			{/if}
		</section>

		{#if status}
			<p class="status" role="status">{status}</p>
		{/if}
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</div>
</div>

<style>
	.save-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(10 10 9 / 0.72);
	}

	.save-backdrop-button {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.save-panel {
		position: relative;
		z-index: 1;
		display: grid;
		width: min(760px, 100%);
		max-height: calc(100vh - 2rem);
		gap: 1rem;
		overflow: auto;
		border: 1px solid #343434;
		border-radius: 8px;
		background: #1a1a18;
		padding: 1rem;
		box-shadow: 0 24px 70px rgb(0 0 0 / 0.38);
	}

	header,
	.auto-save,
	article,
	.slot-actions,
	.new-slot {
		display: flex;
		gap: 0.75rem;
	}

	header,
	.auto-save,
	article {
		align-items: center;
		justify-content: space-between;
	}

	h2,
	h3,
	h4,
	p {
		margin: 0;
	}

	h2 {
		font-size: 1.2rem;
		line-height: 1.15;
	}

	h3,
	h4 {
		font-size: 0.94rem;
	}

	section,
	article {
		display: grid;
		gap: 0.75rem;
		border: 1px solid #3f4a42;
		border-radius: 8px;
		background: #201f1c;
		padding: 0.85rem;
	}

	.auto-save,
	article {
		display: flex;
	}

	.slots {
		display: grid;
		gap: 0.65rem;
	}

	.new-slot {
		align-items: end;
	}

	label {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.35rem;
	}

	input,
	button {
		font: inherit;
	}

	input {
		width: 100%;
		border: 1px solid #4a4a45;
		border-radius: 6px;
		background: #11110f;
		color: #f7f2e8;
		padding: 0.65rem 0.75rem;
	}

	button {
		border: 1px solid #4a4a45;
		border-radius: 6px;
		background: #282724;
		color: #f7f2e8;
		padding: 0.65rem 0.85rem;
		text-align: center;
		white-space: nowrap;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		border-color: #d59b45;
		background: #3a2b18;
		outline: none;
	}

	.close,
	.slot-actions button,
	.auto-save button,
	.new-slot button {
		flex: 0 0 auto;
	}

	.eyebrow {
		color: #f3d28d;
		font-size: 0.76rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.status {
		color: #a7d8b8;
	}

	.error {
		color: #f4a6a6;
	}

	.empty,
	section p,
	article p,
	label span {
		color: #b8b3a7;
	}

	@media (max-width: 700px) {
		header,
		.auto-save,
		article,
		.slot-actions,
		.new-slot {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
