# Russian Wikipedia Single Build Test

## Overview

The `single-build-russian.spec.js` test verifies that the Russian Wikipedia single build works correctly with:

- Russian configuration from `config/wikis/w-ru.js`
- Russian i18n translations from `i18n/ru.json`

## Test Page

The test runs on: https://ru.wikipedia.org/wiki/Обсуждение_участника:Jack_who_built_the_house/CD_test_page

## Prerequisites

Before running the test, build the Russian single file:

```bash
# PowerShell (Windows)
npm run single -- -- --project=w --lang=ru

# Bash/Zsh (Linux/Mac)
npm run single -- --project=w --lang=ru
```

This creates `dist/convenientDiscussions.single.w-ru.js` (~6.8 MB).

## Running the Test

```bash
# Run only the Russian single build test
npm run test:browser -- single-build-russian.spec.js

# Run in headed mode to see the browser
npm run test:browser:headed -- single-build-russian.spec.js
```

## What the Test Verifies

### 1. Russian i18n Translations (4 tests)

- `script-name`: "«Удобные обсуждения»"
- `cm-reply`: "Ответить"
- `cm-edit`: "Редактировать"
- `cm-copylink`: "Скопировать ссылку"

### 2. Russian Config Values (11 tests)

#### Basic Config

- `timezone`: "UTC"
- `defaultIndentationChar`: "\*" (differs from default ":")
- `indentationCharMode`: "unify" (differs from default "mimic")
- `tagName`: "convenient-discussions"

#### Russian-Specific Messages

- `messages.sun`: "Вс" (Sunday abbreviation)
- `messages.jan`: "янв" (January abbreviation)

#### Localized Aliases

- `specialPageAliases.Contributions`: "Вклад"
- `substAliases`: ["подстановка:", "подст:"]

#### Gender-Specific Namespaces

- `userNamespacesByGender.female`: "Участница"
- `genderNeutralUserNamespaceAlias`: "У"

#### Russian Templates

- `unsignedTemplates`: includes "Без подписи", "Не подписался", etc.
- `pageWhitelist`: Russian Wikipedia-specific page patterns

### 3. Script Functionality (4 tests)

- Comments are parsed successfully
- Reply buttons show Russian text
- Script runs in single mode (`IS_SINGLE === true`)
- Both Russian and English i18n are loaded (English as fallback)

### 4. Language Settings (2 tests)

- User language is detected
- Content language is detected

## Test Structure

The test follows the standard e2e pattern:

1. Navigate to Russian Wikipedia test page
2. Wait for MediaWiki to load
3. Inject the single build script
4. Wait for CD initialization
5. Run 18 verification tests

## Key Differences from Default Config

The Russian config differs from the default in several ways:

| Setting                           | Default | Russian                   |
| --------------------------------- | ------- | ------------------------- |
| `defaultIndentationChar`          | `:`     | `*`                       |
| `indentationCharMode`             | `mimic` | `unify`                   |
| `timezone`                        | `null`  | `UTC`                     |
| `userNamespacesByGender`          | `null`  | `{ female: 'Участница' }` |
| `genderNeutralUserNamespaceAlias` | `null`  | `У`                       |

Plus extensive Russian-specific:

- Messages (day/month names)
- Special page aliases
- Template names
- Page whitelist/blacklist patterns
- Archiving configuration

## Notes

- The test does NOT require authentication (unlike some other e2e tests)
- The test loads the pre-built single file, not the dev server
- The single build includes inline source maps for debugging
- Both Russian and English i18n are loaded (English as fallback)

## Troubleshooting

If the test fails:

1. **Build not found**: Run `npm run single -- project=w lang=ru`
2. **Page not loading**: Check internet connection and Russian Wikipedia availability
3. **Script not initializing**: Check browser console for errors
4. **Config values wrong**: Verify `config/wikis/w-ru.js` hasn't changed

## Related Files

- Test: `e2e/single-build-russian.spec.js`
- Config: `config/wikis/w-ru.js`
- i18n: `i18n/ru.json`
- Build: `dist/convenientDiscussions.single.w-ru.js`
- Build script: `build-wrapper.js`
- Vite config: `vite.config.js`
