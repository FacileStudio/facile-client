import { browser } from '$app/environment';
import { goto } from '$app/navigation';

/** The login page the shared 401 handler sends people to. */
export const LOGIN_PATH = '/login';

/**
 * Returns `/login?next=<path+search>` for `location`, or `null` when it is already the login
 * page: that page probes the session itself, and a 401 there is the expected answer.
 */
export function loginTarget(location: Pick<Location, 'pathname' | 'search'>): string | null {
	if (location.pathname === LOGIN_PATH) return null;
	return `${LOGIN_PATH}?next=${encodeURIComponent(location.pathname + location.search)}`;
}

/** The `onUnauthorized` handler the suite shares: replace the current entry with the login page. */
export function redirectToLogin(): void {
	if (!browser) return;
	const target = loginTarget(window.location);
	if (target) void goto(target, { replaceState: true });
}
