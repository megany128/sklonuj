import type { Component } from 'svelte';
import Sprout from '@lucide/svelte/icons/sprout';
import Goal from '@lucide/svelte/icons/goal';
import Trophy from '@lucide/svelte/icons/trophy';
import Crosshair from '@lucide/svelte/icons/crosshair';
import Brain from '@lucide/svelte/icons/brain';
import Globe from '@lucide/svelte/icons/globe';
import Dumbbell from '@lucide/svelte/icons/dumbbell';
import Zap from '@lucide/svelte/icons/zap';
import Moon from '@lucide/svelte/icons/moon';
import Star from '@lucide/svelte/icons/star';
import Palette from '@lucide/svelte/icons/palette';
import Gem from '@lucide/svelte/icons/gem';
import Snowflake from '@lucide/svelte/icons/snowflake';

/**
 * Maps badge id → Lucide icon component. Kept in a shared module so the
 * achievements grid (profile page) and the unlock toast render the same icon.
 */
export const BADGE_ICONS: Record<string, Component> = {
	first_steps: Sprout,
	centurion: Goal,
	thousand_strong: Trophy,
	sharp_shooter: Crosshair,
	case_cracker: Brain,
	polyglot_cases: Globe,
	week_warrior: Dumbbell,
	speed_demon: Zap,
	night_owl: Moon,
	perfectionist: Star,
	adjective_debut: Palette,
	adjective_ace: Gem,
	adjective_polyglot: Snowflake
};

export const BADGE_COLORS: Record<string, string> = {
	first_steps: 'text-green-500',
	centurion: 'text-amber-500',
	thousand_strong: 'text-amber-500',
	sharp_shooter: 'text-red-500',
	case_cracker: 'text-purple-500',
	polyglot_cases: 'text-blue-500',
	week_warrior: 'text-orange-500',
	speed_demon: 'text-yellow-500',
	night_owl: 'text-indigo-500',
	perfectionist: 'text-amber-500',
	adjective_debut: 'text-pink-500',
	adjective_ace: 'text-cyan-500',
	adjective_polyglot: 'text-sky-500'
};
