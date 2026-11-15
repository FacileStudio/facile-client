import { matchLocale } from './locale-match.js';


/** Which source decided the locale. `default` means nothing matched and English was used. */
export type LocaleOrigin = 'url' | 'profile' | 'cookie' | 'browser' | 'default';

/**
 * The sources the resolver reads, in the order it tries them. `url` is an explicit locale from the
 * route or `?lang=`, `profile` the signed-in user's locale, `stored` the `fc_locale` cookie value,
 * `browser` an `Accept-Language` header or the `navigator.languages` array.
 */
export type LocaleInput<L extends string> = {
	supported: readonly L[];
	url?: string | null;
	profile?: string | null;
	stored?: string | null;
	browser?: string | readonly string[] | null;
};

/**
 * The resolved locale and where it came from. `hint` is `locale` unless the origin is `default`,
 * and is what to pass to muse's `provideLocale`: muse then reports `known: false` for a visitor
 * who has chosen nothing and whose browser says nothing, so it adds no `?lang=` to sign-up links.
 */
export type ResolvedLocale<L extends string> = { locale: L; origin: LocaleOrigin; hint: L | null };

const ORDER = ['url', 'profile', 'stored', 'browser'] as const;
const ORIGINS = { url: 'url', profile: 'profile', stored: 'cookie', browser: 'browser' } as const;

/**
 * Picks the locale for a request: an explicit URL locale or `?lang=`, then the signed-in user's
 * profile locale, then the stored visitor choice, then the browser language, then English.
 * Never French as a silent default. A source that is missing or names an unsupported locale is
 * skipped. `supported` must contain `en`.
 */
export function resolveLocale<L extends string>(input: LocaleInput<L>): ResolvedLocale<L> {
	for (const key of ORDER) {
		const hit = matchLocale(input[key], input.supported);
		if (hit) return { locale: hit, origin: ORIGINS[key], hint: hit };
	}
	const english = input.supported.find((locale) => locale === 'en');
	if (!english) throw new Error('@facile/client/locale: supported must include en, the default locale');
	return { locale: english, origin: 'default', hint: null };
}
