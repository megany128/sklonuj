const DAY_MS = 86400000;

/**
 * Format a timestamp as a local-timezone YYYY-MM-DD string.
 * Using local dates ensures "today" matches the user's actual calendar day.
 */
export function toLocalDateStr(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Get today's date as a local-timezone YYYY-MM-DD string.
 */
export function getTodayDateStr(): string {
	return toLocalDateStr(new Date());
}

export interface HeatmapDay {
	date: string;
	count: number;
	dayOfWeek: number;
}

export function buildHeatmapWeeks(data: Record<string, number>): Array<Array<HeatmapDay>> {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayDow = today.getDay(); // 0 = Sunday
	// Go back 26 full weeks + the current partial week
	const startMs = today.getTime() - (26 * 7 + todayDow) * DAY_MS;
	const endMs = today.getTime();
	const weeks: Array<Array<HeatmapDay>> = [];
	let currentWeek: Array<HeatmapDay> = [];

	for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
		const d = new Date(ms);
		const dateStr = toLocalDateStr(d);
		const dow = d.getDay();
		currentWeek.push({
			date: dateStr,
			count: data[dateStr] ?? 0,
			dayOfWeek: dow
		});

		if (dow === 6) {
			weeks.push(currentWeek);
			currentWeek = [];
		}
	}

	if (currentWeek.length > 0) {
		weeks.push(currentWeek);
	}

	return weeks;
}
