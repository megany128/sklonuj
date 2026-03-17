import type { SupabaseClient, User } from '@supabase/supabase-js';

interface PublicUser {
	id: string;
	email: string | undefined;
	user_metadata: { avatar_url?: string };
}

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient;
			user: User | null;
		}
		interface PageData {
			user: PublicUser | null;
		}
	}
}

export {};
