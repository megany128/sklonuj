import { fail } from '@sveltejs/kit';
import { Resend } from 'resend';
import { env as privateEnv } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface InvitationRow {
	id: string;
	email: string;
	status: string;
	createdAt: string;
	expiresAt: string;
}

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { classData, role } = await parent();

	if (role !== 'teacher') {
		return { invitations: [] };
	}

	const supabase = locals.supabase;

	const { data: invitations } = await supabase
		.from('class_invitations')
		.select('id, email, status, created_at, expires_at')
		.eq('class_id', classData.id)
		.order('created_at', { ascending: false });

	const parsed: InvitationRow[] = [];
	if (Array.isArray(invitations)) {
		for (const inv of invitations) {
			if (
				isRecord(inv) &&
				typeof inv.id === 'string' &&
				typeof inv.email === 'string' &&
				typeof inv.status === 'string' &&
				typeof inv.created_at === 'string' &&
				typeof inv.expires_at === 'string'
			) {
				parsed.push({
					id: inv.id,
					email: inv.email,
					status: inv.status,
					createdAt: inv.created_at,
					expiresAt: inv.expires_at
				});
			}
		}
	}

	return { invitations: parsed };
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendInvitationEmail(
	supabase: App.Locals['supabase'],
	classId: string,
	recipientEmail: string,
	userId: string,
	userEmail: string | undefined,
	requestUrl: string
): Promise<void> {
	const apiKey = privateEnv.RESEND_API_KEY;
	if (!apiKey) return;

	const { data: classInfo } = await supabase
		.from('classes')
		.select('name, class_code')
		.eq('id', classId)
		.single();

	if (
		!isRecord(classInfo) ||
		typeof classInfo.name !== 'string' ||
		typeof classInfo.class_code !== 'string'
	) {
		return;
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('display_name')
		.eq('id', userId)
		.maybeSingle();

	const teacherName =
		isRecord(profile) && typeof profile.display_name === 'string'
			? profile.display_name
			: (userEmail ?? 'Your teacher');

	const className = classInfo.name;
	const classCode = classInfo.class_code;

	const origin = new URL(requestUrl).origin;
	const joinLink = `${origin}/classes/join?code=${encodeURIComponent(classCode)}`;

	const resend = new Resend(apiKey);
	const fromAddress = privateEnv.RESEND_FROM_EMAIL ?? 'Sklonuj <noreply@sklonuj.com>';

	try {
		await resend.emails.send({
			from: fromAddress,
			to: [recipientEmail],
			subject: `You've been invited to join ${className} on Sklonuj`,
			html: `
				<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
					<h2>You've been invited to a class!</h2>
					<p><strong>${teacherName}</strong> has invited you to join <strong>${className}</strong> on Sklonuj.</p>
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
	} catch {
		// Email sending failed but invitation was already created in the DB
	}
}

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const formData = await request.formData();
		const rawEmails = (formData.get('emails') ?? '').toString();

		// Parse comma or newline-separated emails
		const emails = rawEmails
			.split(/[,\n]+/)
			.map((e) => e.trim().toLowerCase())
			.filter((e) => e.length > 0);

		if (emails.length === 0) {
			return fail(400, { message: 'Please enter at least one email address.' });
		}

		if (emails.length > 50) {
			return fail(400, { message: 'You can invite at most 50 students at a time.' });
		}

		// Validate all emails
		const invalidEmails: string[] = [];
		for (const email of emails) {
			if (!EMAIL_REGEX.test(email) || email.length > 200) {
				invalidEmails.push(email);
			}
		}

		if (invalidEmails.length > 0) {
			return fail(400, {
				message: `Invalid email${invalidEmails.length > 1 ? 's' : ''}: ${invalidEmails.join(', ')}`
			});
		}

		const supabase = locals.supabase;
		const classId = params.id;

		let sent = 0;
		let alreadyPending = 0;
		let failed = 0;

		// Process DB operations (check existing, insert/update) sequentially
		// then collect emails to send and send them in parallel
		const emailsToSend: string[] = [];

		for (const email of emails) {
			// Check for existing invitation
			const { data: existing } = await supabase
				.from('class_invitations')
				.select('id, status')
				.eq('class_id', classId)
				.eq('email', email)
				.maybeSingle();

			if (isRecord(existing) && typeof existing.id === 'string') {
				if (existing.status === 'pending' || existing.status === 'accepted') {
					alreadyPending++;
					continue;
				}
				// If expired, update it to pending with new expiry
				const { error: updateError } = await supabase
					.from('class_invitations')
					.update({
						status: 'pending',
						expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
					})
					.eq('id', existing.id);

				if (updateError) {
					failed++;
					continue;
				}

				emailsToSend.push(email);
				sent++;
				continue;
			}

			const { error: insertError } = await supabase.from('class_invitations').insert({
				class_id: classId,
				email
			});

			if (insertError) {
				failed++;
				continue;
			}

			emailsToSend.push(email);
			sent++;
		}

		// Send all invitation emails in parallel
		if (emailsToSend.length > 0) {
			await Promise.allSettled(
				emailsToSend.map((email) =>
					sendInvitationEmail(supabase, classId, email, user.id, user.email, request.url)
				)
			);
		}

		const parts: string[] = [];
		if (sent > 0) parts.push(`${sent} invitation${sent === 1 ? '' : 's'} sent`);
		if (alreadyPending > 0) parts.push(`${alreadyPending} already pending`);
		if (failed > 0) parts.push(`${failed} failed`);

		if (sent === 0 && failed > 0) {
			return fail(500, { message: `Failed to send invitations. ${parts.join(', ')}.` });
		}

		return { success: true, message: parts.join(', ') + '.' };
	}
};
