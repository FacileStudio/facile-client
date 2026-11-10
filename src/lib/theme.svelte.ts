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
 * How the store writes classes. `resolveSystem: true` writes `.dark` or `.light` in `system`
 * mode too, matching the OS and following it when it changes, for apps whose Tailwind `dark:`
 * utilities need an explicit `.dark`.
 */
export type ThemeOptions = {
	resolveSystem?: boolean;
};

/**
 * The persisted theme as runes state. By default it writes the classes muse's `applyTheme`
 * writes: `.dark` or `.light` on `<html>`, and neither for `system`, which `tokens.css` keys on.
 */
export class ThemeStore {
	mode = $state<Theme>('system');
	resolved = $state<'light' | 'dark'>('light');
	#key: string;
	#resolveSystem: boolean;
	#media: MediaQueryList | null = null;
	#onChange = (): void => this.#apply();

	/** Binds the store to the app's own `localStorage` key, so existing preferences survive. */
	constructor(key: string, options: ThemeOptions = {}) {
		this.#key = key;
		this.#resolveSystem = options.resolveSystem ?? false;
	}

	/** Loads the stored choice, applies it, and follows the OS setting. Call once from the root layout. */
	restore(): void {
		if (!browser) return;
		this.mode = readStored(this.#key);
		this.#apply();
		if (this.#media) return;
		this.#media = window.matchMedia(DARK_QUERY);
		this.#media.addEventListener('change', this.#onChange);
	}

	/** Stops following the OS setting. A later `restore` follows it again. */
	destroy(): void {
		this.#media?.removeEventListener('change', this.#onChange);
		this.#media = null;
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
		const dark = this.mode === 'dark' || (this.mode === 'system' && window.matchMedia(DARK_QUERY).matches);
		this.resolved = dark ? 'dark' : 'light';
		const written = this.mode === 'system' && !this.#resolveSystem ? 'system' : this.resolved;
		const root = document.documentElement;
		root.classList.toggle('dark', written === 'dark');
		root.classList.toggle('light', written === 'light');
	}
}

/**
 * Returns a theme store persisted under `key`, for example `sonde-theme`. Pass
 * `{ resolveSystem: true }` for an app that needs `.dark` or `.light` in `system` mode too.
 */
export function createTheme(key: string, options: ThemeOptions = {}): ThemeStore {
	return new ThemeStore(key, options);
}
