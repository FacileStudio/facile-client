const SECONDS = /^\d+$/;
const HAS_LETTER = /[a-z]/i;

/**
 * Reads a Retry-After header as seconds to wait. A non-negative integer is taken as is; an HTTP
 * date becomes the seconds from `now` until it, rounded up and floored at 0. Anything else,
 * absent included, is `null`.
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
	const trimmed = value?.trim() ?? '';
	if (SECONDS.test(trimmed)) return Number(trimmed);
	const date = HAS_LETTER.test(trimmed) ? Date.parse(trimmed) : Number.NaN;
	return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000));
}
