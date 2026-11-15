import { loginTarget } from './login-target.js';

/** What a 401 does besides throwing. It may return a promise, which the call waits for. */
export type UnauthorizedHandler = (response: Response) => void | Promise<void>;

/**
 * The three 401 behaviours of the suite: `'login'` replaces the page with `/login?next=`,
 * `'sso'` replaces it with the OIDC start path, a function is the caller's own hook.
 */
export type UnauthorizedPolicy = 'login' | 'sso' | UnauthorizedHandler;

/** Where porte starts the OIDC sign-in, relative to the origin. */
export const SSO_PATH = '/api/auth/oidc';

/** The settings `resolveUnauthorized` reads from `ApiOptions`. */
export type UnauthorizedSettings = {
	onUnauthorized?: UnauthorizedHandler;
	unauthorized?: UnauthorizedPolicy;
	ssoPath?: string;
};

/** A handler that replaces the current page with the OIDC start path. Does nothing outside a browser. */
export function redirectToSso(path: string = SSO_PATH): () => void {
	return () => {
		if (typeof window !== 'undefined') window.location.replace(path);
	};
}

function redirectToLoginPage(): void {
	if (typeof window === 'undefined') return;
	const target = loginTarget(window.location);
	if (target) window.location.replace(target);
}

/**
 * The handler a call runs on a 401. `onUnauthorized` wins, then `unauthorized`; with neither a 401
 * only throws, as it always has. `'login'` here is a full page load: SvelteKit apps that want a
 * client-side navigation keep `onUnauthorized: redirectToLogin`.
 */
export function resolveUnauthorized(settings: UnauthorizedSettings): UnauthorizedHandler | undefined {
	if (settings.onUnauthorized) return settings.onUnauthorized;
	if (settings.unauthorized === 'login') return redirectToLoginPage;
	if (settings.unauthorized === 'sso') return redirectToSso(settings.ssoPath);
	return settings.unauthorized;
}
