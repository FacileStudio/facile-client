/** What muse's `UserMenu` takes as `invitations`: the pending count and where to answer them. */
export type Invitations = { count: number; href: string };

/**
 * Reads a `/api/me/invitations` answer into `{ count, href }`, or `null` when it has no `href`,
 * as an error body has not. muse's `UserMenu` must get `null` then, not the raw body. A missing
 * or non-finite count becomes 0.
 */
export function invitationsFrom(body: unknown): Invitations | null {
	const { count, href } = (body ?? {}) as { count?: unknown; href?: unknown };
	if (typeof href !== 'string' || href === '') return null;
	return { count: typeof count === 'number' && Number.isFinite(count) ? count : 0, href };
}
