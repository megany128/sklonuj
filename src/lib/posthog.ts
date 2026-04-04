import posthog from 'posthog-js';
import { env } from '$env/dynamic/public';

export function initPostHog(): void {
	const key = env.PUBLIC_POSTHOG_KEY;
	if (typeof window === 'undefined' || !key) return;
	posthog.init(key, {
		api_host: 'https://us.i.posthog.com',
		person_profiles: 'identified_only',
		capture_pageview: true,
		capture_pageleave: true,
		session_recording: { maskAllInputs: true }
	});
}

export default posthog;
