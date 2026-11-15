import { LOCALE_COOKIE, readCookie } from './locale-match.js';
import { resolveLocale, type LocaleInput, type ResolvedLocale } from './locale-resolve.js';

/** What a server request offers: the URL, the `Cookie` and `Accept-Language` headers, and the profile locale. */
export type ServerLocaleRequest<L extends string> = {
	supported: readonly L[];
	url?: URL | null;
	pathLocale?: string | null;
	cookie?: string | null;
	acceptLanguage?: string | null;
	profile?: string | null;
};

/** The same, read from the browser: `location`, `document.cookie` and `navigator.languages` by default. */
export type ClientLocaleRequest<L extends string> = {
	supported: readonly L[];
	pathLocale?: string | null;
	profile?: string | null;
	env?: { search: string; cookie: string; languages: readonly string[] };
};

const urlLocale = (pathLocale: string | null | undefined, lang: string | null): string | null => pathLocale ?? lang;

/**
 * Resolves the locale on the server. `pathLocale` is a locale the route itself carries, such as
 * `/en/...`; `?lang=` on `url` comes next. Accept-Language is the browser source.
 */
export function resolveServerLocale<L extends string>(request: ServerLocaleRequest<L>): ResolvedLocale<L> {
	return resolveLocale({
		supported: request.supported,
		url: urlLocale(request.pathLocale, request.url?.searchParams.get('lang') ?? null),
		profile: request.profile,
		stored: readCookie(request.cookie, LOCALE_COOKIE),
		browser: request.acceptLanguage
	});
}

function clientEnv(env?: ClientLocaleRequest<string>['env']): NonNullable<ClientLocaleRequest<string>['env']> | null {
	if (env) return env;
	if (typeof window === 'undefined') return null;
	return { search: window.location.search, cookie: document.cookie, languages: navigator.languages };
}

/** Resolves the locale in the browser, with `navigator.languages` as the browser source. */
export function resolveClientLocale<L extends string>(request: ClientLocaleRequest<L>): ResolvedLocale<L> {
	const env = clientEnv(request.env);
	const input: LocaleInput<L> = {
		supported: request.supported,
		url: urlLocale(request.pathLocale, env ? new URLSearchParams(env.search).get('lang') : null),
		profile: request.profile,
		stored: env ? readCookie(env.cookie, LOCALE_COOKIE) : null,
		browser: env?.languages ?? null
	};
	return resolveLocale(input);
}
