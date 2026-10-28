import type { Case } from '$lib/types';

/** A case pill shown locked, with what unlocks it ("A2", "Lekce 17"). */
export interface LockedCase {
	case: Case;
	unlockAt: string;
}
