import { readable } from 'svelte/store';

export const page = readable({
	url: new URL('http://localhost:5173/'),
	params: {},
	route: { id: '/' },
	status: 200,
	error: null,
	data: { user: null },
	form: null
});

export const navigating = readable(null);
export const updated = readable(false);
