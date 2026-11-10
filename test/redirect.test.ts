import { describe, expect, mock, test } from 'bun:test';

const visits: { target: string; options: unknown }[] = [];

mock.module('$app/environment', () => ({ browser: true }));
mock.module('$app/navigation', () => ({
	goto: async (target: string, options: unknown) => {
		visits.push({ target, options });
	}
}));

const { loginTarget, redirectToLogin } = await import('../src/lib/redirect');

describe('redirect', () => {
	test('keeps the path and query as next', () => {
		expect(loginTarget({ pathname: '/monitors/4', search: '?window=7d' })).toBe(
			'/login?next=%2Fmonitors%2F4%3Fwindow%3D7d'
		);
	});

	test('stays put on the login page', () => {
		expect(loginTarget({ pathname: '/login', search: '?next=%2F' })).toBeNull();
	});

	test('replaces the history entry', () => {
		globalThis.window = { location: { pathname: '/incidents', search: '' } } as unknown as Window & typeof globalThis;
		redirectToLogin();
		expect(visits).toEqual([{ target: '/login?next=%2Fincidents', options: { replaceState: true } }]);
	});
});
