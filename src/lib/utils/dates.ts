/**
 * Format a Date as a local-timezone YYYY-MM-DD string.
 * Using local dates ensures "today" matches the user's actual calendar day.
 */
export function toLocalDateStr(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Get the "effective" date for practice sessions as a YYYY-MM-DD string.
 * Practice between 11 PM and 5 AM counts toward the previous calendar day,
 * so a late-night session still registers as "today's" streak.
 */
export function getTodayDateStr(): string {
	const now = new Date();
	const hour = now.getHours();
	if (hour < 5) {
		// Before 5 AM: count as previous day
		const prev = new Date(now);
		prev.setDate(prev.getDate() - 1);
		return toLocalDateStr(prev);
	}
	return toLocalDateStr(now);
}

export interface HeatmapDay {
	date: string;
	count: number;
	dayOfWeek: number;
}

export function buildHeatmapWeeks(data: Record<string, number>): Array<Array<HeatmapDay>> {
	const today = new Date();
	today.setHours(12, 0, 0, 0);
	const todayDow = today.getDay(); // 0 = Sunday
	const totalDays = 26 * 7 + todayDow;

	// Start date: go back totalDays calendar days (using setDate to avoid DST issues)
	const start = new Date(today);
	start.setDate(start.getDate() - totalDays);

	const weeks: Array<Array<HeatmapDay>> = [];
	let currentWeek: Array<HeatmapDay> = [];

	// Iterate by calendar day to avoid DST duplicate-date bugs
	const cursor = new Date(start);
	for (let i = 0; i <= totalDays; i++) {
		const dateStr = toLocalDateStr(cursor);
		const dow = cursor.getDay();
		currentWeek.push({
			date: dateStr,
			count: data[dateStr] ?? 0,
			dayOfWeek: dow
		});

		if (dow === 6) {
			weeks.push(currentWeek);
			currentWeek = [];
		}

		cursor.setDate(cursor.getDate() + 1);
	}

	if (currentWeek.length > 0) {
		weeks.push(currentWeek);
	}

	return weeks;
}
