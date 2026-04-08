import { error, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { LayoutServerLoad } from './$types';

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface ClassData {
	id: string;
	teacher_id: string;
	name: string;
	description: string | null;
	class_code: string;
	level: string;
	archived: boolean;
	leaderboard_enabled: boolean;
	created_at: string;
}

function isClassDataShape(v: unknown): v is Omit<ClassData, 'leaderboard_enabled'> & {
	leaderboard_enabled?: unknown;
} {
	if (!isRecord(v)) return false;
	return (
		typeof v.id === 'string' &&
		typeof v.teacher_id === 'string' &&
		typeof v.name === 'string' &&
		(v.description === null || typeof v.description === 'string') &&
		typeof v.class_code === 'string' &&
		typeof v.level === 'string' &&
		typeof v.archived === 'boolean' &&
		typeof v.created_at === 'string'
	);
}

export const load: LayoutServerLoad = async ({ locals, params }) => {
	const user = locals.user;
	if (!user) {
		redirect(303, resolve('/auth'));
	}

	const supabase = locals.supabase;
	const classId = params.id;

	const { data: classData, error: classError } = await supabase
		.from('classes')
		.select(
			'id, teacher_id, name, description, class_code, level, archived, leaderboard_enabled, created_at'
		)
		.eq('id', classId)
		.maybeSingle();

	if (classError || !isClassDataShape(classData)) {
		error(404, 'Class not found');
	}

	// Default leaderboard_enabled if not present (migration may not have run yet)
	const normalizedClassData: ClassData = {
		id: classData.id,
		teacher_id: classData.teacher_id,
		name: classData.name,
		description: classData.description,
		class_code: classData.class_code,
		level: classData.level,
		archived: classData.archived,
		created_at: classData.created_at,
		leaderboard_enabled:
			typeof classData.leaderboard_enabled === 'boolean' ? classData.leaderboard_enabled : true
	};

	let role: 'teacher' | 'student';
	if (normalizedClassData.teacher_id === user.id) {
		role = 'teacher';
	} else {
		// Verify student membership
		const { data: membership } = await supabase
			.from('class_memberships')
			.select('id')
			.eq('class_id', classId)
			.eq('student_id', user.id)
			.maybeSingle();

		if (!isRecord(membership) || typeof membership.id !== 'string') {
			error(403, 'You do not have access to this class');
		}
		role = 'student';
	}

	// Block students from accessing archived classes
	if (normalizedClassData.archived && role === 'student') {
		error(403, 'This class has been archived');
	}

	return {
		classData: normalizedClassData,
		role
	};
};
