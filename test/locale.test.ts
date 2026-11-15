import { describe, expect, test } from 'bun:test';
import {
	expireHostOnlyLocaleCookie,
	localeCookie,
	localeCookieDomain,
	matchLocale,
	readCookie,
	resolveClientLocale,
	resolveLocale,
	resolveServerLocale
} from '../src/lib/locale';

const supported = ['en', 'fr', 'es', 'de'] as const;

describe('resolveLocale order', () => {
	test('url beats profile beats cookie beats browser beats en', () => {
		const all = { supported, url: 'de', profile: 'es', stored: 'fr', browser: 'en' };
		expect(resolveLocale(all)).toEqual({ locale: 'de', origin: 'url', hint: 'de' });
		expect(resolveLocale({ ...all, url: null }).origin).toBe('profile');
		expect(resolveLocale({ ...all, url: null, profile: null })).toMatchObject({ locale: 'fr', origin: 'cookie' });
		expect(resolveLocale({ supported, browser: 'es-ES,en;q=0.5' })).toMatchObject({ locale: 'es', origin: 'browser' });
	});

	test('nothing matching gives English, never French', () => {
		expect(resolveLocale({ supported })).toEqual({ locale: 'en', origin: 'default', hint: null });
		expect(resolveLocale({ supported, browser: 'it-IT,ja;q=0.8' }).locale).toBe('en');
		expect(resolveLocale({ supported: ['fr', 'en'], browser: null }).locale).toBe('en');
	});

	test('an unsupported value falls through to the next source', () => {
		expect(resolveLocale({ supported: ['en', 'fr'], url: 'de', profile: 'fr' }).origin).toBe('profile');
	});

	test('supported without en throws', () => {
		expect(() => resolveLocale({ supported: ['fr'] })).toThrow();
	});

	test('matchLocale reads q values, regions and arrays', () => {
		expect(matchLocale('it, de;q=0.8', supported)).toBe('de');
		expect(matchLocale('fr_CA', supported)).toBe('fr');
		expect(matchLocale(['it-IT', 'es-MX'], supported)).toBe('es');
		expect(matchLocale('fr;q=0', supported)).toBeNull();
	});
});

describe('server and client variants', () => {
	test('server reads ?lang=, cookie, Accept-Language', () => {
		const url = new URL('https://x.facile.studio/?lang=de');
		expect(resolveServerLocale({ supported, url, cookie: 'fc_locale=fr' }).locale).toBe('de');
		expect(resolveServerLocale({ supported, cookie: 'a=1; fc_locale=fr', acceptLanguage: 'es' }).locale).toBe('fr');
		expect(resolveServerLocale({ supported, acceptLanguage: 'es-ES,es;q=0.9' }).locale).toBe('es');
		expect(resolveServerLocale({ supported, pathLocale: 'es', url }).locale).toBe('es');
		expect(resolveServerLocale({ supported }).origin).toBe('default');
	});

	test('client reads search, document.cookie and navigator.languages', () => {
		const env = { search: '?lang=fr', cookie: 'fc_locale=de', languages: ['es-ES'] };
		expect(resolveClientLocale({ supported, env }).locale).toBe('fr');
		expect(resolveClientLocale({ supported, env: { ...env, search: '' } }).locale).toBe('de');
		expect(resolveClientLocale({ supported, env: { ...env, search: '', cookie: '' } }).locale).toBe('es');
		expect(resolveClientLocale({ supported, profile: 'de', env: { ...env, search: '' } }).origin).toBe('profile');
	});
});

describe('cookie', () => {
	test('shared domain under facile.studio, host-only elsewhere', () => {
		expect(localeCookieDomain('agenda.facile.studio')).toBe('.facile.studio');
		expect(localeCookieDomain('facile.studio')).toBe('.facile.studio');
		expect(localeCookieDomain('evilfacile.studio')).toBeNull();
		expect(localeCookieDomain('agenda.example.com')).toBeNull();
		expect(localeCookieDomain('localhost')).toBeNull();
	});

	test('serialises with domain and secure only when they apply', () => {
		expect(localeCookie('fr', { hostname: 'agenda.facile.studio', secure: true })).toBe(
			'fc_locale=fr; path=/; max-age=31536000; samesite=lax; domain=.facile.studio; secure'
		);
		expect(localeCookie('fr', { hostname: 'localhost' })).toBe('fc_locale=fr; path=/; max-age=31536000; samesite=lax');
		expect(expireHostOnlyLocaleCookie()).toContain('max-age=0');
	});

	test('readCookie decodes and returns null when absent', () => {
		expect(readCookie('x=1; fc_locale=fr')).toBe('fr');
		expect(readCookie('x=1')).toBeNull();
		expect(readCookie(null)).toBeNull();
	});
});
