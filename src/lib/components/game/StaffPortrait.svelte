<script lang="ts">
	import { asset } from '$app/paths';
	import { STAFF_PORTRAIT_SPRITE_PATH, getStaffPortraitPosition } from '$lib/assets/staffPortraits';

	let { personId }: { personId: string } = $props();

	const sprite = asset(STAFF_PORTRAIT_SPRITE_PATH);
	const position = $derived(getStaffPortraitPosition(personId));
</script>

<span
	class="portrait"
	aria-hidden="true"
	data-staff-id={personId}
	style:background-image={`url("${sprite}")`}
	style:background-position={position}
></span>

<style>
	.portrait {
		display: block;
		width: 100%;
		height: 100%;
		min-width: 1.5rem;
		min-height: 1.5rem;
		border-radius: inherit;
		background-size: 400% 200%;
		background-repeat: no-repeat;
		background-color: var(--paper-200);
	}
</style>
