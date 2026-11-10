import { isUnauthorized, type Api } from './fetch.js';

/** Where the session lives and how to read the signed-in user out of the answer. */
export type SessionOptions<User> = {
	mePath?: string;
	logoutPath?: string;
	read?: (body: unknown) => User | null;
};

function readUser<User>(body: unknown): User | null {
	return (body as { user?: User } | undefined)?.user ?? null;
}

/** The signed-in user as runes state. `loading` stays true until the first `refresh` settles. */
export class Session<User> {
	user = $state<User | null>(null);
	loading = $state(true);
	#api: Api;
	#mePath: string;
	#logoutPath: string;
	#read: (body: unknown) => User | null;
	#pending: Promise<User | null> | null = null;

	/** Binds the store to one API kernel. Nothing is fetched until `refresh`. */
	constructor(api: Api, options: SessionOptions<User> = {}) {
		this.#api = api;
		this.#mePath = options.mePath ?? '/auth/me';
		this.#logoutPath = options.logoutPath ?? '/auth/logout';
		this.#read = options.read ?? readUser;
	}

	/**
	 * Reads the session. A 401 means signed out and sets `user` to null without calling
	 * `onUnauthorized`; any other failure keeps the current user and rethrows, so a blip is
	 * never mistaken for a sign-out. Concurrent calls share one request.
	 */
	refresh(): Promise<User | null> {
		this.#pending ??= this.#load().finally(() => {
			this.#pending = null;
			this.loading = false;
		});
		return this.#pending;
	}

	/** Ends the session server-side and clears `user`, also when the server refused. */
	async logout(): Promise<void> {
		try {
			await this.#api<unknown>(this.#logoutPath, { method: 'POST' });
		} finally {
			this.user = null;
		}
	}

	async #load(): Promise<User | null> {
		try {
			this.user = this.#read(await this.#api<unknown>(this.#mePath, {}, { quiet: true }));
		} catch (error) {
			if (!isUnauthorized(error)) throw error;
			this.user = null;
		}
		return this.user;
	}
}

/** Returns a session store over `api`. The default `read` takes `body.user`, porte apps' `/auth/me` shape. */
export function createSession<User>(api: Api, options: SessionOptions<User> = {}): Session<User> {
	return new Session<User>(api, options);
}
