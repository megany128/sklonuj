import posthog from 'posthog-js';
import { env } from '$env/dynamic/public';
import { POSTHOG_PROXY_PREFIX } from '$lib/posthog-proxy';

export function initPostHog(): void {
	const key = env.PUBLIC_POSTHOG_KEY;
	if (typeof window === 'undefined' || !key || window.location.hostname === 'localhost') return;
	posthog.init(key, {
		// Same-origin reverse proxy (see src/lib/posthog-proxy.ts) so tracker
		// blockers don't drop events. ui_host keeps toolbar/links on posthog.com.
		api_host: `${window.location.origin}${POSTHOG_PROXY_PREFIX}`,
		ui_host: 'https://us.posthog.com',
		person_profiles: 'identified_only',
		capture_pageview: true,
		capture_pageleave: true,
		session_recording: { maskAllInputs: true }
	});
}

export default posthog;
