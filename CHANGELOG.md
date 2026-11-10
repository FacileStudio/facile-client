# Changelog

## [Unreleased]

### Added

- `ApiError.retryAfterSeconds: number | null`, read from the `Retry-After` header: a non-negative integer of seconds as sent, or an HTTP date as the seconds from now until it, floored at 0; `null` otherwise. The kernel dropped the header before, which kept Antenne on its own fetch code to show the delay on a button.

### Changed

- The README documents what adopters hit: `@facile/client` goes in `optimizeDeps.exclude` next to muse because it ships uncompiled Svelte source, a public page that probes the session calls with `{ quiet: true }`, and a bun test that imports the root entry mocks `$app/environment` and `$app/navigation`.

- `package.json` declares `"license": "MIT"`, matching `LICENSE`. The licence itself is unchanged.

## [0.1.0] - 2026-11-10

### Added

- `createApi({ base, onUnauthorized })`: the fetch kernel. Same-origin paths only, `credentials: 'same-origin'`, `X-Facile-CSRF: 1` on every method but GET, HEAD and OPTIONS, the tronc error envelope parsed into `ApiError { status, code, message, upgradeUrl }`, `onUnauthorized` on 401 only, `undefined` for 204 and empty bodies, and a `quiet` call option.
- `redirectToLogin` and `loginTarget`: the shared 401 handler, `/login?next=<path+search>`, a no-op on `/login`.
- `@facile/client/session`: `createSession<User>(api)` with `user`, `loading`, `refresh()` and `logout()` as runes state.
- `@facile/client/theme`: `createTheme(key)` with `mode`, `resolved`, `restore()` and `set()`, writing the same classes as muse's `applyTheme`.
