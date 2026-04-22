/**
 * Generate an HMAC-signed unsubscribe URL for a given user.
 * Uses CRON_SECRET as the signing key — same secret that authenticates cron jobs.
 */
export async function buildUnsubscribeUrl(
	siteOrigin: string,
	userId: string,
	secret: string
): Promise<string> {
	const sig = await hmacSign(secret, `unsubscribe:${userId}`);
	return `${siteOrigin}/api/email/unsubscribe?uid=${encodeURIComponent(userId)}&sig=${sig}`;
}

async function hmacSign(secret: string, message: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
