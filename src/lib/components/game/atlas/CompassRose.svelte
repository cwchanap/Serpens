<script lang="ts">
	interface Props {
		size?: number;
	}

	let { size = 64 }: Props = $props();
</script>

<svg
	class="compass"
	width={size}
	height={size}
	viewBox="0 0 64 64"
	fill="none"
	stroke="var(--brass-700)"
	aria-hidden="true"
>
	<circle cx="32" cy="32" r="28" stroke-width="1" />
	<circle cx="32" cy="32" r="20" stroke-width="0.5" stroke-dasharray="2 2" />
	<path d="M32 4 L36 32 L32 60 L28 32 Z" fill="var(--brass-700)" stroke="none" />
	<path d="M4 32 L32 28 L60 32 L32 36 Z" fill="var(--brass-300)" stroke="none" opacity="0.85" />
	<text
		x="32"
		y="3"
		text-anchor="middle"
		font-family="var(--font-display)"
		font-size="6"
		fill="var(--brass-700)"
	>N</text>
</svg>

<style>
	.compass {
		display: block;
		opacity: 0.65;
	}
</style>
