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
	perfectionist: Star
};
