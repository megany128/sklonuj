import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	submit: async ({ request, locals }) => {
		const formData = await request.formData();
		const name = formData.get('name');
		const email = formData.get('email');
		const category = formData.get('category');
		const message = formData.get('message');

		// Validate inputs
		if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
			return fail(400, { error: 'Name is required (max 100 characters)' });
		}

		if (typeof email !== 'string' || email.trim().length === 0 || email.trim().length > 200) {
			return fail(400, { error: 'Email is required (max 200 characters)' });
		}

		// Basic email format validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email.trim())) {
			return fail(400, { error: 'Please provide a valid email address' });
		}

		if (
			typeof category !== 'string' ||
			!['feature', 'bug', 'general'].includes(category as string)
		) {
			return fail(400, { error: 'Invalid category' });
		}

		if (
			typeof message !== 'string' ||
			message.trim().length === 0 ||
			message.trim().length > 5000
		) {
			return fail(400, { error: 'Message is required (max 5000 characters)' });
		}

		// Insert into database
		const { error } = await locals.supabase.from('contact_messages').insert({
			name: name.trim(),
			email: email.trim(),
			category: category as 'feature' | 'bug' | 'general',
			message: message.trim()
		});

		if (error) {
			console.error('Contact form submission error:', error);
			return fail(500, { error: 'Failed to submit message. Please try again.' });
		}

		return { success: true };
	}
};
