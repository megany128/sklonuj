export const page = {
	url: new URL('http://localhost:5173/'),
	params: {},
	route: { id: '/' },
	status: 200,
	error: null,
	data: { user: null },
	form: null,
	state: {}
};

export const navigating = {
	from: null,
	to: null,
	type: null,
	willUnload: false,
	delta: 0,
	complete: Promise.resolve()
};

export const updated = {
	current: false,
	check: () => Promise.resolve(false)
};
