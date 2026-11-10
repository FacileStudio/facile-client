import { describe, expect, test } from 'bun:test';
import { invitationsFrom } from '../src/lib/invitations';

describe('invitationsFrom', () => {
	test('keeps count and href, and maps every answer without an href to null', () => {
		expect(invitationsFrom({ count: 2, href: 'https://sso.facile.studio/invitations' })).toEqual({
			count: 2,
			href: 'https://sso.facile.studio/invitations'
		});
		expect(invitationsFrom({ href: '/invitations' })).toEqual({ count: 0, href: '/invitations' });
		expect(invitationsFrom({ count: Number.NaN, href: '/i' })).toEqual({ count: 0, href: '/i' });
		expect(invitationsFrom({ count: 3 })).toBeNull();
		expect(invitationsFrom({ count: 3, href: '' })).toBeNull();
		expect(invitationsFrom({ error: { code: 'unavailable', message: 'registre is down' } })).toBeNull();
		expect(invitationsFrom(null)).toBeNull();
		expect(invitationsFrom(undefined)).toBeNull();
	});
});
