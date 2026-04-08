import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 200;

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const origin = request.headers.get('origin');
	if (!origin || origin !== url.origin) {
		return json({ error: 'Forbidden: origin mismatch' }, { status: 403 });
	}

	const contentType = request.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) {
		return json({ error: 'Content-Type must be application/json' }, { status: 400 });
	}

	let body: unknown;
	try {
		body = JSON.parse(await request.text());
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	if (!isRecord(body)) {
		return json({ error: 'Request body must be a JSON object' }, { status: 400 });
	}

	const classId = body['classId'];
	const email = body['email'];

	if (typeof classId !== 'string' || classId.length === 0) {
		return json({ error: 'classId is required and must be a string' }, { status: 400 });
	}

	if (
		typeof email !== 'string' ||
		email.length === 0 ||
		email.length > MAX_EMAIL_LENGTH ||
		!EMAIL_REGEX.test(email)
	) {
		return json({ error: 'A valid email is required' }, { status: 400 });
	}

	const supabase = locals.supabase;

	// Verify the user is the teacher of this class
	const { data: classData, error: classError } = await supabase
		.from('classes')
		.select('id, name, class_code, teacher_id')
		.eq('id', classId)
		.single();

	if (
		classError ||
		!isRecord(classData) ||
		typeof classData.id !== 'string' ||
		typeof classData.name !== 'string' ||
		typeof classData.class_code !== 'string' ||
		typeof classData.teacher_id !== 'string'
	) {
		return json({ error: 'Class not found' }, { status: 404 });
	}

	if (classData.teacher_id !== user.id) {
		return json({ error: 'You are not the teacher of this class' }, { status: 403 });
	}

	// Check whether the recipient is already a member of this class.
	// We use the admin client to look up the user by email in auth.users,
	// then check class_memberships for an existing enrollment.
	const supabaseUrl = env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = privateEnv.SUPABASE_SERVICE_ROLE_KEY;

	if (supabaseUrl && serviceRoleKey) {
		const adminClient = createClient(supabaseUrl, serviceRoleKey);
		const normalizedEmail = email.toLowerCase();

		let existingUserId: string | null = null;
		let page = 1;
		const perPage = 200;
		// Paginated scan of auth.users to find the matching email.
		// Supabase admin.listUsers does not support server-side email filtering.
		while (existingUserId === null) {
			const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({
				page,
				perPage
			});
			if (listError || !listData || !Array.isArray(listData.users)) {
				break;
			}
			for (const u of listData.users) {
				if (
					isRecord(u) &&
					typeof u.id === 'string' &&
					typeof u.email === 'string' &&
					u.email.toLowerCase() === normalizedEmail
				) {
					existingUserId = u.id;
					break;
				}
			}
			if (listData.users.length < perPage) {
				break;
			}
			page++;
		}

		if (existingUserId !== null) {
			const { data: membershipData } = await adminClient
				.from('class_memberships')
				.select('student_id')
				.eq('class_id', classId)
				.eq('student_id', existingUserId)
				.maybeSingle();

			if (isRecord(membershipData) && typeof membershipData.student_id === 'string') {
				return json({ error: 'Student is already in this class' }, { status: 409 });
			}
		}
	}

	// Get teacher's display name from profile
	const { data: profileData } = await supabase
		.from('profiles')
		.select('display_name')
		.eq('id', user.id)
		.maybeSingle();

	const teacherName =
		isRecord(profileData) && typeof profileData.display_name === 'string'
			? profileData.display_name
			: (user.email ?? 'Your teacher');

	const apiKey = privateEnv.RESEND_API_KEY;
	if (!apiKey) {
		return json({ error: 'Email service is not configured' }, { status: 500 });
	}

	const resend = new Resend(apiKey);
	const fromAddress = privateEnv.RESEND_FROM_EMAIL ?? 'Sklonuj <noreply@sklonuj.com>';
	const joinLink = `${url.origin}/classes/join?code=${encodeURIComponent(classData.class_code)}`;

	const { error: sendError } = await resend.emails.send({
		from: fromAddress,
		to: [email],
		subject: `You've been invited to join ${classData.name} on Sklonuj`,
		html: `
			<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
				<h2>You've been invited to a class!</h2>
				<p><strong>${teacherName}</strong> has invited you to join <strong>${classData.name}</strong> on Sklonuj.</p>
				<p>Click the link below to join:</p>
				<p>
					<a href="${joinLink}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">
						Join Class
					</a>
				</p>
				<p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
				<p style="color: #6b7280; font-size: 14px;">${joinLink}</p>
			</div>
		`
	});

	if (sendError) {
		return json({ error: 'Failed to send invitation email' }, { status: 500 });
	}

	return json({ ok: true });
};
