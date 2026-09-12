<script lang="ts">
	import { asset } from '$app/paths';
	import {
		STAFF_PORTRAIT_SPRITE_PATH,
		getStaffPortraitProfile
	} from '$lib/assets/staffPortraits';

	let { personId }: { personId: string } = $props();

	const sprite = asset(STAFF_PORTRAIT_SPRITE_PATH);
	const profile = $derived(getStaffPortraitProfile(personId));
</script>

<span
	class="portrait"
	aria-hidden="true"
	data-staff-id={personId}
	data-staff-gender={profile.gender}
	data-staff-age={profile.age}
	data-staff-age-group={profile.ageGroup}
	style:background-image={`url("${sprite}")`}
	style:background-position={profile.position}
></span>

<style>
	.portrait {
		display: block;
		width: 100%;
		height: 100%;
		min-width: 1.5rem;
		min-height: 1.5rem;
		border-radius: inherit;
		background-size: 400% 600%;
		background-repeat: no-repeat;
		background-color: var(--paper-200);
	}
</style>
