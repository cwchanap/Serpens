import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		port: 5544,
		strictPort: true
	},
	test: {
		expect: { requireAssertions: true },
		restoreMocks: true,
		// Heavy specs (scenarioRepository, setup, runtime, ScenarioMenuSection) run full
		// encode -> deep-validate cycles over large game states. When both Vitest projects
		// run concurrently the default 5s per-test timeout is too tight (observed ~6.2s on
		// the slowest scenarioRepository test, ~23s for the whole file). 30s gives headroom
		// without making genuinely-hung tests wait excessively. Applies to both projects
		// since they extend this config.
		testTimeout: 30_000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov', 'html'],
			reportsDirectory: './coverage',
			include: ['src/**/*.{ts,svelte}'],
			exclude: [
				'src/**/*.{spec,test}.{ts,js}',
				'src/**/*.svelte.{spec,test}.{ts,js}',
				'src/**/*.e2e.{ts,js}',
				'src/app.d.ts',
				'src/lib/vitest-examples/**',
				'src/routes/demo/**',
				// +page.svelte is the 1300+ line Svelte 5 runes UI shell. It is exercised
				// end-to-end by retail-sim.e2e.ts (canvas data-* attributes, tile clicks,
				// panel toggles) rather than by unit specs. Excluding it from the unit
				// coverage denominator keeps the metric interpretable as a pure-logic
				// coverage signal for src/lib/game; the e2e suite is the coverage gate for
				// the UI layer. +layout.svelte/+layout.ts are trivial wrappers.
				'src/routes/+page.svelte',
				'src/routes/+layout.svelte',
				'src/routes/+layout.ts'
			]
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
