import { describe, expect, mock, test } from 'bun:test';

mock.module('$app/environment', () => ({ browser: true }));

const classes = new Set<string>();
const stored = new Map<string, string>();
let prefersDark = true;

Object.assign(globalThis, {
	document: {
		documentElement: {
			classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)) }
		}
	},
	localStorage: {
		getItem: (key: string) => stored.get(key) ?? null,
		setItem: (key: string, value: string) => stored.set(key, value)
	},
	window: Object.assign(globalThis.window ?? {}, {
		matchMedia: () => ({ matches: prefersDark, addEventListener: () => {} })
	})
});

const { createTheme } = await import('../src/lib/theme.svelte');

describe('createTheme', () => {
	test('restore reads the app key and system writes neither class', () => {
		stored.set('sonde-theme', 'bogus');
		const theme = createTheme('sonde-theme');
		theme.restore();
		expect(theme.mode).toBe('system');
		expect([...classes]).toEqual([]);
		expect(theme.resolved).toBe('dark');
	});

	test('set writes exactly one class and persists the choice', () => {
		const theme = createTheme('sonde-theme');
		theme.set('light');
		expect([...classes]).toEqual(['light']);
		theme.set('dark');
		expect([...classes]).toEqual(['dark']);
		expect(stored.get('sonde-theme')).toBe('dark');
		prefersDark = false;
		createTheme('sonde-theme').restore();
		expect([...classes]).toEqual(['dark']);
	});
});

describe('v0.1 default theme classes, pinned', () => {
	test('each mode under a light and a dark OS writes exactly what v0.1.1 wrote', () => {
		const written: string[] = [];
		for (const os of [false, true]) {
			prefersDark = os;
			for (const mode of ['system', 'light', 'dark'] as const) {
				createTheme('pin-theme').set(mode);
				written.push(`${os ? 'dark-os' : 'light-os'} ${mode}: ${[...classes].sort().join(',')}`);
			}
		}
		expect(written).toEqual([
			'light-os system: ',
			'light-os light: light',
			'light-os dark: dark',
			'dark-os system: ',
			'dark-os light: light',
			'dark-os dark: dark'
		]);
	});
});
