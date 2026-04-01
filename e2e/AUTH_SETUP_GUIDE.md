# Authentication Setup

Most tests run against `test.wikipedia.org` and work without login. Authentication is only needed for features like editing or thanking.

## Setup

Set credentials via environment variables — never hardcode them:

```bash
# Linux/Mac
export WIKIPEDIA_USERNAME=YourTestUsername
export WIKIPEDIA_PASSWORD=YourTestPassword

# Windows (PowerShell)
$env:WIKIPEDIA_USERNAME="YourTestUsername"
$env:WIKIPEDIA_PASSWORD="YourTestPassword"
```

You can also put them in a `.env` file (already gitignored).

Then run the auth setup once to save the session:

```bash
npx playwright test e2e/auth.setup.js --project=setup
```

This logs in and saves the session to `playwright/.auth/user.json` (gitignored). Subsequent test runs reuse it automatically.

## How It Works

`helpers/login.js` exports `ensureAuthenticated(page)`, which is called during test setup. It checks if the page already shows a logged-in user menu — if not, it reads credentials from env vars, navigates to the login page, and logs in. If a CAPTCHA appears, it waits up to 2 minutes for manual solving.

The saved auth state is loaded by `playwright.config.js` via `storageState` if the file exists.

## Troubleshooting

- Make sure the account exists on `test.wikipedia.org`, not `en.wikipedia.org`.
- If the session expires, just re-run the setup command above.
- To force a fresh login, delete `playwright/.auth/user.json` and run setup again.
