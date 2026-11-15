/** A Registre or app space id: Agenda and Nuage use numbers, the rest use strings. */
export type SpaceId = string | number | null | undefined;

/** `?space_id=<id>`, or an empty string for no space (`null`, `undefined` or `''`). */
export function spaceQuery(spaceId: SpaceId): string {
	return spaceId === null || spaceId === undefined || spaceId === '' ? '' : `?space_id=${encodeURIComponent(spaceId)}`;
}

/** `path` scoped to `spaceId`, with `&` instead of `?` when `path` already has a query. */
export function withSpace(path: string, spaceId: SpaceId): string {
	const query = spaceQuery(spaceId);
	return path.includes('?') ? `${path}${query.replace('?', '&')}` : `${path}${query}`;
}
