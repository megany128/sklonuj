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
	class_code: string;
	level: string;
	archived: boolean;
	created_at: string;
}

function isClassData(v: unknown): v is ClassData {
	if (!isRecord(v)) return false;
	return (
		typeof v.id === 'string' &&
		typeof v.teacher_id === 'string' &&
		typeof v.name === 'string' &&
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
		.select('id, teacher_id, name, class_code, level, archived, created_at')
		.eq('id', classId)
		.maybeSingle();

	if (classError || !isClassData(classData)) {
		error(404, 'Class not found');
	}

	let role: 'teacher' | 'student';
	if (classData.teacher_id === user.id) {
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
	if (classData.archived && role === 'student') {
		error(403, 'This class has been archived');
	}

	return {
		classData,
		role
	};
};
