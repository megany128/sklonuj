/**
 * Pseudonymous display names for the global weekly leaderboard. Shared by the
 * server (every entry it returns) and the client (the viewer's own placeholder
 * row when the streamed payload predates their guest cookie), so the same id
 * always shows the same name. Pure module with no deps.
 */

const ADJECTIVES = [
	'Happy',
	'Brave',
	'Clever',
	'Swift',
	'Calm',
	'Bold',
	'Bright',
	'Keen',
	'Wise',
	'Merry',
	'Witty',
	'Gentle',
	'Lively',
	'Plucky',
	'Steady',
	'Nimble'
];
const ANIMALS = [
	'Otter',
	'Fox',
	'Bear',
	'Owl',
	'Hare',
	'Wolf',
	'Deer',
	'Hawk',
	'Lynx',
	'Seal',
	'Crane',
	'Raven',
	'Finch',
	'Badger',
	'Robin',
	'Falcon'
];

/** Deterministic alias from a UUID — same ID always produces the same name. */
export function generateAlias(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = (hash * 31 + userId.charCodeAt(i)) | 0;
	}
	const adjIdx = ((hash >>> 0) % ADJECTIVES.length) | 0;
	const aniIdx = ((hash >>> 4) % ANIMALS.length) | 0;
	return `${ADJECTIVES[adjIdx]} ${ANIMALS[aniIdx]}`;
}
