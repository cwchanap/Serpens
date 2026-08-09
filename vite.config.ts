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
		// The client browser and server projects share one full-suite run. Vitest's
		// CPU-based default overwhelms the browser under load and causes unrelated
		// specs to hit the intentional 10s timeout, so keep file isolation but run
		// one worker at a time.
		maxWorkers: 1,
		// Heavy specs (scenarioRepository, setup, runtime, ScenarioMenuSection) run
		// full encode -> deep-validate cycles over large game states and set their
		// own per-describe timeout: 30_000 (observed ~6.2s on the slowest
		// scenarioRepository test, ~23s for the whole file). The global 10s gives
		// non-heavy specs headroom without masking genuinely-hung tests the way a
		// global 30s would. Applies to both projects since they extend this config.
		testTimeout: 10_000,
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
				// +page.svelte is the route-level state/orchestration/composition root and is
				// exercised end-to-end by retail-sim.e2e.ts. Route-local presentation hosts
				// have focused browser component specs, so route line count is not a coverage target.
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
