<aside class="legend" aria-hidden="true">
	<h4>· Routes ·</h4>
	<div class="row"><span class="line healthy"></span> Healthy flow</div>
	<div class="row"><span class="line shortage"></span> Shortage</div>
</aside>

<style>
	.legend {
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--paper-50) 96%, var(--brass-100)) 0%,
			var(--paper-50) 100%
		);
		border: 1px solid var(--brass-700);
		box-shadow:
			inset 0 0 0 3px var(--paper-50),
			inset 0 0 0 4px var(--brass-700);
		padding: 12px 16px;
	}

	h4 {
		margin: 0 0 6px;
		font-family: var(--font-ui);
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--brass-700);
		text-align: center;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 5px 0;
		font-family: var(--font-body);
		font-size: 12px;
		color: var(--ink-500);
		line-height: 1;
	}

	.line {
		display: inline-block;
		width: 38px;
		height: 0;
	}

	.line.healthy {
		border-top: 2px solid var(--moss);
	}

	.line.shortage {
		border-top: 2px dashed var(--wax-red);
	}
</style>
