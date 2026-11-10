import { describe, expect, mock, test } from 'bun:test';

mock.module('$app/environment', () => ({ browser: true }));

const classes = new Set<string>();
const stored = new Map<string, string>();
let prefersDark = true;
const listeners = new Set<() => void>();

function osTurns(dark: boolean): void {
	prefersDark = dark;
	for (const listener of listeners) listener();
}

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
		matchMedia: () => ({
			get matches() {
				return prefersDark;
			},
			addEventListener: (_: string, listener: () => void) => listeners.add(listener),
			removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
		})
	})
});

const { createTheme } = await import('../src/lib/theme.svelte');

describe('createTheme', () => {
	test('restore reads the app key and system writes neither class', () => {
		stored.set('sonde-theme', 'bogus');
		prefersDark = true;
		const theme = createTheme('sonde-theme');
		theme.restore();
		expect(theme.mode).toBe('system');
		expect([...classes]).toEqual([]);
		expect(theme.resolved).toBe('dark');
		theme.destroy();
	});

	test('set writes exactly one class and persists the choice', () => {
		const theme = createTheme('sonde-theme');
		theme.set('light');
		expect([...classes]).toEqual(['light']);
		theme.set('dark');
		expect([...classes]).toEqual(['dark']);
		expect(stored.get('sonde-theme')).toBe('dark');
		prefersDark = false;
		const restored = createTheme('sonde-theme');
		restored.restore();
		expect([...classes]).toEqual(['dark']);
		restored.destroy();
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

describe('createTheme in system mode', () => {
	test('by default writes no class and keeps writing none as the OS turns', () => {
		stored.set('muse-theme', 'system');
		prefersDark = false;
		const theme = createTheme('muse-theme');
		theme.restore();
		expect([...classes]).toEqual([]);
		osTurns(true);
		expect([...classes]).toEqual([]);
		expect(theme.resolved).toBe('dark');
		theme.destroy();
		expect(listeners.size).toBe(0);
	});

	test('with resolveSystem writes the OS class, follows it, and stops when destroyed', () => {
		stored.set('plume.theme', 'system');
		prefersDark = true;
		const theme = createTheme('plume.theme', { resolveSystem: true });
		theme.restore();
		theme.restore();
		expect(listeners.size).toBe(1);
		expect([...classes]).toEqual(['dark']);
		osTurns(false);
		expect([...classes]).toEqual(['light']);
		expect(theme.resolved).toBe('light');
		theme.set('dark');
		osTurns(false);
		expect([...classes]).toEqual(['dark']);
		theme.set('system');
		expect([...classes]).toEqual(['light']);
		theme.destroy();
		expect(listeners.size).toBe(0);
		osTurns(true);
		expect([...classes]).toEqual(['light']);
	});
});
