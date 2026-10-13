**Convenient Discussions** (**CD**) is a JavaScript tool that provides an enhanced user experience for MediaWiki talk pages. It acts as a shell over the existing MediaWiki discussion system.

- The dev server on port 9000 serves the main checkout; assume it's running but it oftentimes doesn't. In a worktree, run `npm run dev` in the background, use the port it prints in place of 9000, and stop it with `npm run dev:stop`.
- Cover non-trivial behaviors and fixes with unit tests, or e2e tests where unit tests can't reach.
- Test CD in the browser through the Chrome DevTools MCP: its Chrome is logged in to a test account and keeps tabs visible, which CD needs to boot. Unless the task calls for another page, use https://test.wikipedia.org/wiki/User_talk:JWBTH/CD_test_page. Load the dev build with:

  ```js
  const script = document.createElement('script')
  script.type = 'module'
  script.src = 'http://localhost:9000/src/loader/startup.js'
  document.head.appendChild(script)
  ```

- Before commiting changes that touch code, run `npm test` and `npm run lint` (which also type-checks); leave no new errors in either.

## Coding conventions

- Use functional patterns where possible.
- Prefer `undefined` over `null`, but drop `undefined` where it's not needed, e.g. `return undefined`.
- When a function parameter is not used in the function, put an underscore in front of it.
- Leave auto-fixable ESLint problems (import order, unused imports, indentation) to the hooks: they fix every file you write or commit.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label equal to its role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
