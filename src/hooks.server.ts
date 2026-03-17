import type { Handle } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase-server';

export const handle: Handle = async ({ event, resolve }) => {
	const supabase = createSupabaseServerClient(event.cookies);
	event.locals.supabase = supabase;

	const {
		data: { user }
	} = await supabase.auth.getUser();

	event.locals.user = user;

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
