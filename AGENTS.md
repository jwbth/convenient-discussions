**Convenient Discussions** (**CD**) is a JavaScript tool that provides an enhanced user experience for MediaWiki talk pages. It acts as a shell over the existing MediaWiki discussion system.

- Don't run `npm run dev` (assume already running).
- Cover non-trivial behaviors and fixes with unit tests, or e2e tests where unit tests can't reach.
- Test CD in the browser through the Chrome DevTools MCP: its Chrome is logged in to a test account and keeps tabs visible, which CD needs to boot. Unless the task calls for another page, use https://test.wikipedia.org/wiki/User_talk:JWBTH/CD_test_page. Load the dev build with:

  ```js
  const script = document.createElement('script')
  script.type = 'module'
  script.src = 'http://localhost:9000/src/loader/startup.js'
  document.head.appendChild(script)
  ```

## Coding conventions

### JavaScript & TypeScript

- Avoid introducing variables used only once. Exceptions:
  - Variables used in template strings. Prefer them to having function calls inside template strings.
  - Cases where the use of the variable is in a loop or function while the assignment is not.
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
