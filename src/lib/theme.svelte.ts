import { browser } from '$app/environment';

/** The three choices a person can make. `system` follows `prefers-color-scheme`. */
export type Theme = 'system' | 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isTheme(value: unknown): value is Theme {
	return value === 'system' || value === 'light' || value === 'dark';
}

function readStored(key: string): Theme {
	try {
		const value = localStorage.getItem(key);
		return isTheme(value) ? value : 'system';
	} catch {
		return 'system';
	}
}

/**
 * The persisted theme as runes state. It writes the classes muse's `applyTheme` writes:
 * `.dark` or `.light` on `<html>`, and neither for `system`, which `tokens.css` keys on.
 */
export class ThemeStore {
	mode = $state<Theme>('system');
	resolved = $state<'light' | 'dark'>('light');
	#key: string;
	#watching = false;

	/** Binds the store to the app's own `localStorage` key, so existing preferences survive. */
	constructor(key: string) {
		this.#key = key;
	}

	/** Loads the stored choice, applies it, and follows the OS setting. Call once from the root layout. */
	restore(): void {
		if (!browser) return;
		this.mode = readStored(this.#key);
		this.#apply();
		if (this.#watching) return;
		this.#watching = true;
		window.matchMedia(DARK_QUERY).addEventListener('change', () => this.#apply());
	}

	/** Records `mode`, applies it, and persists it when storage is available. */
	set(mode: Theme): void {
		this.mode = mode;
		if (!browser) return;
		this.#apply();
		try {
			localStorage.setItem(this.#key, mode);
		} catch {
			return;
		}
	}

	#apply(): void {
		const root = document.documentElement;
		root.classList.toggle('dark', this.mode === 'dark');
		root.classList.toggle('light', this.mode === 'light');
		const dark = this.mode === 'dark' || (this.mode === 'system' && window.matchMedia(DARK_QUERY).matches);
		this.resolved = dark ? 'dark' : 'light';
	}
}

/** Returns a theme store persisted under `key`, for example `sonde-theme`. */
export function createTheme(key: string): ThemeStore {
	return new ThemeStore(key);
}
