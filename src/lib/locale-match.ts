/** The name of the cookie that stores a visitor's language choice. Same value as muse's `LOCALE_COOKIE`. */
export const LOCALE_COOKIE = 'fc_locale';

type Weighted = { tag: string; q: number; at: number };

function weigh(part: string, at: number): Weighted {
	const [tag, ...params] = part.trim().split(';');
	const q = params.map((param) => /^\s*q=([0-9.]+)\s*$/i.exec(param)?.[1]).find(Boolean);
	return { tag: tag.trim().toLowerCase(), q: q === undefined ? 1 : Number(q), at };
}

/**
 * The best supported locale in one value: a locale code, a cookie value, or a whole
 * `Accept-Language` header, highest `q` first. `fr-FR`, `FR` and `fr_CA` all give `fr`. Returns
 * `null` when nothing matches, so a caller can fall through to the next source.
 */
export function matchLocale<L extends string>(
	value: string | readonly string[] | null | undefined,
	supported: readonly L[]
): L | null {
	const joined = typeof value === 'string' ? value : (value ?? []).join(',');
	const tags = joined
		.split(',')
		.map(weigh)
		.filter((entry) => entry.tag !== '' && entry.q > 0)
		.sort((a, b) => b.q - a.q || a.at - b.at);
	for (const { tag } of tags) {
		const base = tag.split(/[-_]/)[0];
		const hit = supported.find((locale) => locale === base);
		if (hit) return hit;
	}
	return null;
}

/** The value of cookie `name` in a `Cookie` header or `document.cookie` string, or `null`. The first one wins. */
export function readCookie(header: string | null | undefined, name: string = LOCALE_COOKIE): string | null {
	const prefix = `${name}=`;
	const found = (header ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
	if (!found) return null;
	try {
		return decodeURIComponent(found.slice(prefix.length));
	} catch {
		return null;
	}
}
