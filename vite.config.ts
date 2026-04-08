import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				resolve: {
					alias: {
						'$env/dynamic/public': new URL('src/test-mocks/env-dynamic-public.ts', import.meta.url)
							.pathname,
						'$env/dynamic/private': new URL(
							'src/test-mocks/env-dynamic-private.ts',
							import.meta.url
						).pathname,
						'$app/state': new URL('src/test-mocks/app-state.ts', import.meta.url).pathname,
						'$app/paths': new URL('src/test-mocks/app-paths.ts', import.meta.url).pathname
					}
				},
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
