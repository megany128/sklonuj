import posthog from 'posthog-js';
import { PUBLIC_POSTHOG_KEY } from '$env/static/public';

export function initPostHog(): void {
	if (typeof window === 'undefined' || !PUBLIC_POSTHOG_KEY) return;
	posthog.init(PUBLIC_POSTHOG_KEY, {
		api_host: 'https://us.i.posthog.com',
		person_profiles: 'identified_only',
		capture_pageview: true,
		capture_pageleave: true,
		session_recording: { maskAllInputs: true }
	});
}

export default posthog;
