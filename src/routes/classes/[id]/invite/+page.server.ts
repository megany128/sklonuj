import { fail } from '@sveltejs/kit';
import { Resend, type CreateBatchEmailOptions } from 'resend';
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

/** Resend's batch endpoint accepts at most 100 emails per call. */
const EMAIL_BATCH_SIZE = 100;

interface InvitationEmailContext {
	resend: Resend;
	fromAddress: string;
	teacherName: string;
	className: string;
	joinLink: string;
}

/**
 * Resolves everything shared by every invitation email (class name, join
 * link, teacher display name) with two queries, once per request, instead of
 * once per recipient. Returns null when email sending is not configured or
 * the class could not be loaded.
 */
async function buildInvitationEmailContext(
	supabase: App.Locals['supabase'],
	classId: string,
	userId: string,
	userEmail: string | undefined,
	requestUrl: string
): Promise<InvitationEmailContext | null> {
	const apiKey = privateEnv.RESEND_API_KEY;
	if (!apiKey) return null;

	const [{ data: classInfo }, { data: profile }] = await Promise.all([
		supabase.from('classes').select('name, class_code').eq('id', classId).single(),
		supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle()
	]);

	if (
		!isRecord(classInfo) ||
		typeof classInfo.name !== 'string' ||
		typeof classInfo.class_code !== 'string'
	) {
		return null;
	}

	const teacherName =
		isRecord(profile) && typeof profile.display_name === 'string'
			? profile.display_name
			: (userEmail ?? 'Your teacher');

	const origin = new URL(requestUrl).origin;
	const joinLink = `${origin}/classes/join?code=${encodeURIComponent(classInfo.class_code)}`;

	return {
		resend: new Resend(apiKey),
		fromAddress: privateEnv.RESEND_FROM_EMAIL ?? 'Sklonuj <noreply@sklonuj.com>',
		teacherName,
		className: classInfo.name,
		joinLink
	};
}

function buildInvitationEmail(
	ctx: InvitationEmailContext,
	recipientEmail: string
): CreateBatchEmailOptions {
	const { fromAddress, teacherName, className, joinLink } = ctx;
	return {
		from: fromAddress,
		to: [recipientEmail],
		subject: `You've been invited to join ${className} on Skloňuj`,
		html: `
			<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
				<h2>You've been invited to a class!</h2>
				<p><strong>${teacherName}</strong> has invited you to join <strong>${className}</strong> on Skloňuj.</p>
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
	};
}

/**
 * Sends emails through Resend's batch endpoint, one API call per chunk of up
 * to 100, chunks sequentially. That keeps a 50-address invite to a single
 * request instead of 50, which would trip Resend's per-second rate limit.
 * The batch API reports success or failure for the whole chunk, so a failed
 * chunk is logged once with its recipient list.
 */
async function sendInvitationEmails(
	resend: Resend,
	emails: CreateBatchEmailOptions[]
): Promise<void> {
	for (let i = 0; i < emails.length; i += EMAIL_BATCH_SIZE) {
		const chunk = emails.slice(i, i + EMAIL_BATCH_SIZE);
		const recipients = chunk.map((e) => e.to).flat();
		try {
			// Resend reports API errors in `error` rather than throwing
			const { error } = await resend.batch.send(chunk);
			if (error) {
				console.error('Failed to send class invitation emails to', recipients, error);
			}
		} catch (e) {
			// Email sending failed but the invitations were already created in the DB
			console.error('Failed to send class invitation emails to', recipients, e);
		}
	}
}

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const user = locals.user;
		if (!user) return fail(401, { message: 'Not authenticated' });

		const supabase = locals.supabase;
		const classId = params.id;

		// Verify caller is the teacher of this class
		const { data: classData, error: classError } = await supabase
			.from('classes')
			.select('teacher_id')
			.eq('id', classId)
			.single();

		if (
			classError ||
			!isRecord(classData) ||
			typeof classData.teacher_id !== 'string' ||
			classData.teacher_id !== user.id
		) {
			return fail(403, { message: 'Only the teacher can send invitations.' });
		}

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

		let sent = 0;
		let alreadyPending = 0;
		let failed = 0;

		// The same address pasted twice: the first occurrence creates the
		// invitation, so every later occurrence reports as "already pending",
		// exactly as the previous one-at-a-time processing did.
		const uniqueEmails: string[] = [];
		const seen = new Set<string>();
		for (const email of emails) {
			if (seen.has(email)) {
				alreadyPending++;
				continue;
			}
			seen.add(email);
			uniqueEmails.push(email);
		}

		// One round-trip: load every existing invitation for these addresses.
		const { data: existingRows, error: existingError } = await supabase
			.from('class_invitations')
			.select('email, status')
			.eq('class_id', classId)
			.in('email', uniqueEmails);

		const existingStatusByEmail = new Map<string, string>();
		if (Array.isArray(existingRows)) {
			for (const row of existingRows) {
				if (isRecord(row) && typeof row.email === 'string' && typeof row.status === 'string') {
					existingStatusByEmail.set(row.email, row.status);
				}
			}
		}

		// Partition in memory: skip live invitations, (re)create the rest.
		// New addresses are inserted; expired ones are flipped back to pending
		// with a fresh expiry. Both go through a single upsert keyed on the
		// UNIQUE(class_id, email) constraint from migration 005.
		const emailsToSend: string[] = [];
		if (existingError) {
			// Without knowing which invitations exist we cannot safely (re)create any.
			failed += uniqueEmails.length;
		} else {
			for (const email of uniqueEmails) {
				const status = existingStatusByEmail.get(email);
				if (status === 'pending' || status === 'accepted') {
					alreadyPending++;
					continue;
				}
				emailsToSend.push(email);
			}
		}

		if (emailsToSend.length > 0) {
			const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
			const { error: upsertError } = await supabase.from('class_invitations').upsert(
				emailsToSend.map((email) => ({
					class_id: classId,
					email,
					status: 'pending',
					expires_at: expiresAt
				})),
				{ onConflict: 'class_id,email' }
			);

			if (upsertError) {
				failed += emailsToSend.length;
				emailsToSend.length = 0;
			} else {
				sent += emailsToSend.length;
			}
		}

		// Send invitation emails via Resend's batch endpoint
		if (emailsToSend.length > 0) {
			const ctx = await buildInvitationEmailContext(
				supabase,
				classId,
				user.id,
				user.email,
				request.url
			);
			if (ctx) {
				await sendInvitationEmails(
					ctx.resend,
					emailsToSend.map((email) => buildInvitationEmail(ctx, email))
				);
			}
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
