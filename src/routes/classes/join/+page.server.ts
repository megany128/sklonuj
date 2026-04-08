import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const returnTo = `/classes/join${url.search}`;
		redirect(303, `${resolve('/auth')}?returnTo=${encodeURIComponent(returnTo)}`);
	}
	const code = url.searchParams.get('code') ?? '';

	// Auto-join if code is provided via URL param (e.g. from invite email link)
	if (code.length === 6) {
		const user = locals.user;
		const supabaseUrl = env.PUBLIC_SUPABASE_URL;
		const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

		if (!supabaseUrl || !serviceRoleKey) {
			console.warn(
				'/classes/join: SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_URL is not configured; auto-join via invite link is disabled'
			);
		} else {
			const adminClient = createClient(supabaseUrl, serviceRoleKey);

			const { data: classData } = await adminClient
				.from('classes')
				.select('id, teacher_id, name, archived')
				.eq('class_code', code.toUpperCase())
				.maybeSingle();

			if (
				isRecord(classData) &&
				typeof classData.id === 'string' &&
				typeof classData.name === 'string' &&
				classData.archived !== true &&
				classData.teacher_id !== user.id
			) {
				// Check not already a member
				const { data: existing } = await adminClient
					.from('class_memberships')
					.select('id')
					.eq('class_id', classData.id)
					.eq('student_id', user.id)
					.maybeSingle();

				if (!isRecord(existing)) {
					// Join the class
					const { error: joinError } = await locals.supabase
						.from('class_memberships')
						.insert({ class_id: classData.id, student_id: user.id });

					if (!joinError) {
						// Mark invitation as accepted (invites are stored lowercased)
						if (user.email) {
							await adminClient
								.from('class_invitations')
								.update({ status: 'accepted' })
								.eq('class_id', classData.id)
								.eq('email', user.email.toLowerCase())
								.eq('status', 'pending');
						}

						// Check if user has a display_name
						const { data: profileData } = await adminClient
							.from('profiles')
							.select('display_name')
							.eq('id', user.id)
							.maybeSingle();

						const hasName =
							isRecord(profileData) &&
							typeof profileData.display_name === 'string' &&
							profileData.display_name.trim().length > 0;

						const redirectUrl = hasName
							? `${resolve('/classes')}?joined=${encodeURIComponent(classData.name)}`
							: `${resolve('/classes')}?joined=${encodeURIComponent(classData.name)}&needsName=true`;

						redirect(303, redirectUrl);
					}
				}
			}
		}
	}

	return { code };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const code = (formData.get('code') ?? '').toString().trim().toUpperCase();

		if (code.length !== 6) {
			return fail(400, { message: 'Class code must be exactly 6 characters.', code });
		}

		// Use admin client to look up class by code (RLS prevents non-members from seeing classes)
		const supabaseUrl = env.PUBLIC_SUPABASE_URL;
		const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

		if (!supabaseUrl || !serviceRoleKey) {
			return fail(500, { message: 'Server configuration error.', code });
		}

		const adminClient = createClient(supabaseUrl, serviceRoleKey);

		const { data: classData, error: classError } = await adminClient
			.from('classes')
			.select('id, teacher_id, name, archived')
			.eq('class_code', code)
			.maybeSingle();

		if (classError) {
			return fail(500, { message: 'Failed to look up class. Please try again.', code });
		}

		if (!isRecord(classData) || typeof classData.id !== 'string') {
			return fail(404, {
				message: 'No class found with that code. Please check and try again.',
				code
			});
		}

		if (classData.archived === true) {
			return fail(400, { message: 'This class has been archived.', code });
		}

		if (classData.teacher_id === user.id) {
			return fail(400, { message: 'You are the teacher of this class.', code });
		}

		const classId = classData.id;

		// Check if already a member (use admin client since RLS might not let us see this)
		const { data: existingMembership } = await adminClient
			.from('class_memberships')
			.select('id')
			.eq('class_id', classId)
			.eq('student_id', user.id)
			.maybeSingle();

		if (isRecord(existingMembership) && typeof existingMembership.id === 'string') {
			return fail(400, { message: 'You are already a member of this class.', code });
		}

		// Insert membership using the user's client (RLS allows students to insert own membership)
		const supabase = locals.supabase;
		const { error: joinError } = await supabase.from('class_memberships').insert({
			class_id: classId,
			student_id: user.id
		});

		if (joinError) {
			// Unique constraint violation = the user joined in another tab/request between
			// our existence check and this insert. Treat as "already a member" rather than 500.
			if (joinError.code === '23505') {
				return fail(400, { message: 'You are already a member of this class.', code });
			}
			return fail(500, { message: 'Failed to join class. Please try again.', code });
		}

		// If there's a pending invitation for this user's email, mark it accepted
		// (invitations are stored lowercased)
		if (user.email) {
			await adminClient
				.from('class_invitations')
				.update({ status: 'accepted' })
				.eq('class_id', classId)
				.eq('email', user.email.toLowerCase())
				.eq('status', 'pending');
		}

		const className = typeof classData.name === 'string' ? classData.name : '';

		// Check if user has a display_name
		const { data: profileData } = await adminClient
			.from('profiles')
			.select('display_name')
			.eq('id', user.id)
			.maybeSingle();

		const hasName =
			isRecord(profileData) &&
			typeof profileData.display_name === 'string' &&
			profileData.display_name.trim().length > 0;

		const redirectUrl = hasName
			? `${resolve('/classes')}?joined=${encodeURIComponent(className)}`
			: `${resolve('/classes')}?joined=${encodeURIComponent(className)}&needsName=true`;

		redirect(303, redirectUrl);
	}
};
