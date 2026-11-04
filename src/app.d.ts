import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { CellSchedule } from '$lib/types';
import type { PageCache } from '$lib/server/anon-page-cache';

interface PublicUser {
	id: string;
	email: string | undefined;
	display_name: string | null;
	user_metadata: { avatar_url?: string };
}

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			user: User | null;
			/** Validated `sklonuj_guest_id` cookie (anonymous leaderboard identity), or null. */
			guestId: string | null;
		}
		/** The parts of adapter-cloudflare's platform object this app uses. */
		interface Platform {
			caches: { open(name: string): Promise<PageCache> };
			ctx: { waitUntil(promise: Promise<unknown>): void };
		}
		interface PageData {
			user: PublicUser | null;
			savedProgress: {
				level: string;
				case_scores: Record<string, { attempts: number; correct: number }>;
				paradigm_scores: Record<string, { attempts: number; correct: number }>;
				lemma_scores: Record<string, { attempts: number; correct: number }>;
				cell_schedule: CellSchedule;
				last_session: string;
				longest_answer_streak: number;
			} | null;
		}
	}
}

export {};
