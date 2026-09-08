<script lang="ts">
	let {
		name
	}: {
		name:
			| 'build'
			| 'lock'
			| 'inventory'
			| 'details'
			| 'demolish'
			| 'edit'
			| 'clock'
			| 'rail'
			| 'dashboard'
			| 'policies'
			| 'staff'
			| 'person'
			| 'stores'
			| 'decisions'
			| 'reports'
			| 'productChains'
			| 'finance'
			| 'logistics'
			| 'retail'
			| 'industry'
			| 'world'
			| 'pause'
			| 'shortcuts'
			| 'resume';
	} = $props();
</script>

<svg
	aria-hidden="true"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	{#if name === 'lock'}
		<rect x="6" y="10" width="12" height="11" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
	{:else if name === 'build'}
		<path d="M3 20h18" />
		<path d="M6 20V9l6-4 6 4v11" />
		<path d="M10 20v-6h4v6" />
	{:else if name === 'inventory'}
		<path d="m3 7 9-4 9 4-9 4-9-4z M3 7v10l9 4 9-4V7 M12 11v10" />
	{:else if name === 'details'}
		<path d="M5 7h14 M5 12h14 M5 17h10" />
	{:else if name === 'edit'}
		<path d="m5 15 10-10 4 4-10 10-5 1z M13 7l4 4" />
	{:else if name === 'clock'}
		<circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" />
	{:else if name === 'rail'}
		<path d="M8 3v18 M16 3v18 M5 6h14 M5 12h14 M5 18h14" />
	{:else if name === 'demolish'}
		<path d="M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13" />
	{:else if name === 'dashboard'}
		<path d="M4 13a8 8 0 0 1 16 0" />
		<path d="M12 13l4-3" />
		<path d="M4 17h16" />
	{:else if name === 'policies'}
		<path d="M6 3h9l3 3v15H6z" />
		<path d="M9 9h6" />
		<path d="M9 13h6" />
		<path d="M9 17h4" />
	{:else if name === 'person'}
		<circle cx="12" cy="9" r="3.4" /><path d="M5 20c1.6-4 12.8-4 14 0" />
	{:else if name === 'staff'}
		<circle cx="9" cy="8" r="3.2" />
		<path d="M3 19c1.4-4 10.6-4 12 0" />
		<path d="M16 8.5a3 3 0 0 1 0 5.4" />
		<path d="M18 19c-.3-1.6-1-2.7-2-3.4" />
	{:else if name === 'stores'}
		<path d="M4 9h16v11H4z" />
		<path d="M4 9l2-4h12l2 4" />
		<path d="M9 20v-6h6v6" />
	{:else if name === 'decisions'}
		<path d="M12 4v6" />
		<path d="M12 10 6 20" />
		<path d="M12 10l6 10" />
		<circle cx="12" cy="4" r="1.6" />
	{:else if name === 'reports'}
		<path d="M4 20V6" />
		<path d="M4 20h16" />
		<path d="M8 20v-6" />
		<path d="M13 20V9" />
		<path d="M18 20v-9" />
	{:else if name === 'productChains'}
		<circle cx="6" cy="6" r="2.4" />
		<circle cx="18" cy="12" r="2.4" />
		<circle cx="7" cy="18" r="2.4" />
		<path d="M8 7.4 15.8 11" />
		<path d="M16.2 13.8 9 17" />
	{:else if name === 'finance'}
		<ellipse cx="12" cy="6.5" rx="7" ry="2.6" />
		<path d="M5 6.5v11c0 1.5 3.1 2.6 7 2.6s7-1.1 7-2.6v-11" />
		<path d="M5 12c0 1.5 3.1 2.6 7 2.6s7-1.1 7-2.6" />
	{:else if name === 'logistics'}
		<path d="M3 16V8h10v8z" />
		<path d="M13 11h4l3 3v2h-7z" />
		<circle cx="7" cy="18" r="1.8" />
		<circle cx="17" cy="18" r="1.8" />
	{:else if name === 'retail'}
		<path d="M4 9h16v11H4z" />
		<path d="M4 9l2-4h12l2 4" />
	{:else if name === 'industry'}
		<path d="M4 20V11l5 3V11l5 3V8l6 4v8z" />
	{:else if name === 'world'}
		<circle cx="12" cy="12" r="8.5" />
		<path d="M3.5 12h17" />
		<path d="M12 3.5c3 3.4 3 13.1 0 17" />
	{:else if name === 'pause'}
		<rect x="6" y="5" width="4" height="14" rx="1" />
		<rect x="14" y="5" width="4" height="14" rx="1" />
	{:else if name === 'shortcuts'}
		<text x="12" y="18" text-anchor="middle" fill="currentColor" stroke="none" font-size="20"
			>?</text
		>
	{:else}
		<path d="m8 5 11 7-11 7Z" />
	{/if}
</svg>

<style>
	svg {
		width: 1.5rem;
		height: 1.5rem;
		flex: 0 0 auto;
	}
</style>
