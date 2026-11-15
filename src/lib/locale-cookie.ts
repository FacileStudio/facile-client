import { LOCALE_COOKIE } from './locale-match.js';

/** The domain whose subdomains share one language choice. */
export const SUITE_DOMAIN = 'facile.studio';

const ONE_YEAR = 31536000;

/** Where and how a locale cookie is written. `hostname` decides the `Domain` attribute. */
export type LocaleCookieOptions = {
	hostname: string;
	secure?: boolean;
	parentDomains?: readonly string[];
};

/**
 * The `Domain` to write `fc_locale` under: `.facile.studio` when `hostname` is that domain or one
 * of its subdomains, so a choice made on one app reaches the others, and `null` anywhere else
 * (a self-hoster's own host, localhost), where the cookie stays host-only.
 */
export function localeCookieDomain(hostname: string, parents: readonly string[] = [SUITE_DOMAIN]): string | null {
	const host = hostname.toLowerCase();
	const parent = parents.find((domain) => host === domain || host.endsWith(`.${domain}`));
	return parent ? `.${parent}` : null;
}

/** The `Set-Cookie` value (or `document.cookie` assignment) that stores `locale` for a year. */
export function localeCookie(locale: string, options: LocaleCookieOptions): string {
	const domain = localeCookieDomain(options.hostname, options.parentDomains);
	const parts = [`${LOCALE_COOKIE}=${encodeURIComponent(locale)}`, 'path=/', `max-age=${ONE_YEAR}`, 'samesite=lax'];
	if (domain) parts.push(`domain=${domain}`);
	if (options.secure) parts.push('secure');
	return parts.join('; ');
}

/** The cookie string that deletes a host-only `fc_locale`, left behind by builds that never set a domain. */
export function expireHostOnlyLocaleCookie(): string {
	return `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Stores the visitor's choice from the browser. Under `.facile.studio` it writes the shared domain
 * cookie and removes the old host-only one, which would otherwise shadow it. Elsewhere it writes
 * the host-only cookie. Does nothing outside a browser.
 */
export function rememberLocale(locale: string, options: Partial<LocaleCookieOptions> = {}): void {
	if (typeof window === 'undefined') return;
	const hostname = options.hostname ?? window.location.hostname;
	const secure = options.secure ?? window.location.protocol === 'https:';
	const shared = localeCookieDomain(hostname, options.parentDomains) !== null;
	if (shared) document.cookie = expireHostOnlyLocaleCookie();
	document.cookie = localeCookie(locale, { ...options, hostname, secure });
}
