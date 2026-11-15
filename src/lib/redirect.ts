import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { LOGIN_PATH, loginTarget } from './login-target.js';

export { LOGIN_PATH, loginTarget };

/** The `onUnauthorized` handler the suite shares: replace the current entry with the login page. */
export function redirectToLogin(): void {
	if (!browser) return;
	const target = loginTarget(window.location);
	if (target) void goto(target, { replaceState: true });
}
