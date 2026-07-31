import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	},
	{
		// The expansion financing runner is an internal helper that must not
		// import domain modules — it receives all domain data through its
		// inputs. This enforces the dependency-direction rule at lint time
		// so future edits are caught without a brittle source-text test.
		files: ['src/lib/game/expansionFinancing.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: './world',
							message: 'expansionFinancing must not import domain modules directly.'
						},
						{
							name: './placement',
							message: 'expansionFinancing must not import domain modules directly.'
						},
						{
							name: './industryPlacement',
							message: 'expansionFinancing must not import domain modules directly.'
						}
					],
					patterns: [
						{
							// Block the same domain modules reached via the `$lib`
							// path alias, which would bypass the exact relative-path
							// restrictions above.
							regex: '^\\$lib/game/(world|placement|industryPlacement)$',
							message: 'expansionFinancing must not import domain modules directly.'
						}
					]
				}
			]
		}
	}
);
