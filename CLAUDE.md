# @facile/client

The browser half of the Facile suite contract for SvelteKit clients: the fetch kernel
(`createApi`), the shared 401 redirect (`redirectToLogin`), a Svelte 5 session store and a theme
store. UI components live in `@facile/muse`, not here.

It ships TypeScript source, like muse. Consumers install it by git tag:

```json
"@facile/client": "github:FacileStudio/facile-client#v0.1.0"
```

Entry points: `.` (`src/lib/index.ts`), `./session` and `./theme`. Add a new one to `exports` in
`package.json`, never a deep import path.

## Commands

```sh
bun install --frozen-lockfile
bun test          # fetch, redirect, session and theme tests (stubbed fetch)
bun run check     # svelte-check
bun run build     # svelte-package into dist/ with .d.ts files
filet check .     # must exit 0 before any commit
```

CI (`.github/workflows/ci.yml`) runs the same five steps. `lefthook.yml` runs them before a push.

## Rules

- Every request is relative to `/api`. `base` must be a same-origin path; never an absolute host,
  never a build-time API URL. The suite deploys one container per hostname.
- No token in `localStorage` or `sessionStorage`. The session is porte's HttpOnly cookie, sent
  with `credentials: 'same-origin'`. Mutations carry `X-Facile-CSRF: 1`.
- `onUnauthorized` fires on 401 only, never on 403.
- No UI components. Those belong to muse.
- No runtime dependencies. `svelte` and `@sveltejs/kit` are peer dependencies only.
- Release: move `## Unreleased` in `CHANGELOG.md` under `## [X.Y.Z] - YYYY-MM-DD`, bump
  `package.json`, commit `chore: release vX.Y.Z`, push, then tag `vX.Y.Z`.
