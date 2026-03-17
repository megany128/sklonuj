import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const user = locals.user;
	return {
		user: user
			? {
					id: user.id,
					email: user.email,
					user_metadata: { avatar_url: user.user_metadata?.avatar_url }
				}
			: null
	};
};
