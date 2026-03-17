const DAY_MS = 86400000;

export function toDateStr(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function getDayOfWeek(ms: number): number {
	return new Date(ms).getDay();
}

export interface HeatmapDay {
	date: string;
	count: number;
	dayOfWeek: number;
}

export function buildHeatmapWeeks(data: Record<string, number>): Array<Array<HeatmapDay>> {
	const todayMs = Date.now();
	const todayDow = getDayOfWeek(todayMs);
	const startMs = todayMs - (26 * 7 + todayDow) * DAY_MS;
	const weeks: Array<Array<HeatmapDay>> = [];
	let currentWeek: Array<HeatmapDay> = [];

	for (let ms = startMs; ms <= todayMs; ms += DAY_MS) {
		const dateStr = toDateStr(ms);
		const dow = getDayOfWeek(ms);
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
