# Parser Tests Guide

This neurosloppy guide explains how to work with parser tests in the Convenient Discussions project.

## Overview

Parser tests verify the correctness of the page parsing logic by running it in a web worker (to avoid launching a browser, even though the behavior there may be a bit different). The main test file is `tests/worker.test.js`, which uses test cases defined in `tests/worker-test-cases.json`.

## Test Files

- **tests/worker.test.js**: Main test runner that executes parser tests
- **tests/worker-test-cases.json**: Test cases with expected outputs
- **tests/worker-convert-test-cases.mjs**: Converts wiki pages to test case format
- **tests/worker-regenerate-test-cases.test.js**: Regenerates test cases with current parser output
- **tests/worker-test-cases-regenerated.json**: Output file from regeneration (temporary)

## Adding New Tests

### Step 1: Convert from Wiki Page

Use `worker-convert-test-cases.mjs` to convert test cases from a live wiki page:

```bash
# Using default page (User_talk:JWBTH/CD_test_cases on test.wikipedia.org)
node tests/worker-convert-test-cases.mjs

# Using custom page and domain
node tests/worker-convert-test-cases.mjs --page "User:Example/Test_cases" --domain "en.wikipedia.org"

# Using environment variables
TEST_PAGE="User:Example/Test_cases" DOMAIN="en.wikipedia.org" node tests/worker-convert-test-cases.mjs

# Save output to file
node tests/worker-convert-test-cases.mjs output.json

# Limit to first N test groups (for testing)
node tests/worker-convert-test-cases.mjs 3

# Combine options
node tests/worker-convert-test-cases.mjs --page "User:Example/Test_cases" --domain "en.wikipedia.org" 5 output.json
```

**Command-Line Options:**

- `--page <page_title>`: Wiki page to fetch test cases from (default: `User_talk:JWBTH/CD_test_cases`)
- `--domain <domain>`: MediaWiki domain (default: `test.wikipedia.org`)
- `<number>`: Limit number of test groups to process
- `<filename.json>`: Output file path

**Environment Variables:**

- `TEST_PAGE`: Override default test page
- `DOMAIN`: Override default domain (API URL will be constructed as `https://{DOMAIN}/w/api.php`)

**Conversion Rules:**

- Each 2-level section becomes a test group (unless it has `<!-- Don't convert this to a test group -->` immediately after the headline)
- Each deeper-level section becomes a test (unless it has `<!-- Don't convert this to an automatic test -->` immediately after the headline)

The converted test cases will be in a format ready to add to `tests/worker-test-cases.json`, but they won't have expected outputs yet.

### Step 2: Add to Test Cases File

Add the converted test cases to `tests/worker-test-cases.json`. At this point, the tests lack expected output data.

### Step 3: Generate Expected Outputs

Run the regeneration script to create expected outputs based on the current parser behavior:

```bash
npm run test:regenerate
```

This executes `worker-regenerate-test-cases.test.js` and writes the results to `tests/worker-test-cases-regenerated.json`.

### Step 4: Replace Test Cases

Replace the original test cases file with the regenerated one:

```bash
# On Windows (bash)
mv tests/worker-test-cases-regenerated.json tests/worker-test-cases.json

# Or manually copy the file
```

## Regenerating All Tests

If you've made changes to the parser and want to treat the current output as correct, regenerate all test cases:

```bash
npm run test:regenerate
mv tests/worker-test-cases-regenerated.json tests/worker-test-cases.json
```

**Warning:** This treats the current parser output as the new baseline. Review changes carefully before committing.

## Handling MediaWiki Parser Updates

When MediaWiki updates its parser, the HTML output for the same wikitext may change. In this case, you need to reconvert all test cases to get the updated HTML output.

### Process

The workflow is the same as adding new tests, but applied to the entire test suite:

1. **Convert from the canonical test page** (recommended to use
   https://commons.wikimedia.org/wiki/User_talk:Jack_who_built_the_house/CD_test_cases as the base):

   ```bash
   node tests/worker-convert-test-cases.mjs --page "User_talk:Jack_who_built_the_house/CD_test_cases" --domain "commons.wikimedia.org" worker-test-cases-new.json
   ```

2. **Review the converted output:**

   ```bash
   # Check the new file
   cat tests/worker-test-cases-new.json
   ```

3. **Generate expected outputs** based on current parser behavior:

   ```bash
   # Temporarily replace the test cases file
   mv tests/worker-test-cases.json tests/worker-test-cases-backup.json
   mv tests/worker-test-cases-new.json tests/worker-test-cases.json

   # Regenerate with expected outputs
   npm run test:regenerate

   # Replace with regenerated version
   mv tests/worker-test-cases-regenerated.json tests/worker-test-cases.json
   ```

4. **Verify the changes:**

   ```bash
   npm test -- worker.test.js
   ```

5. **Review and commit:**

   ```bash
   # Compare with backup to see what changed
   git diff tests/worker-test-cases-backup.json tests/worker-test-cases.json

   # If everything looks good, commit
   git add tests/worker-test-cases.json
   git commit -m "test(worker): update test cases for MediaWiki parser changes"

   # Clean up backup
   rm tests/worker-test-cases-backup.json
   ```

**Important:** Always review the diff carefully to ensure the parser changes are expected and don't indicate regressions in the CD parser logic.

## Running Tests

To run the parser tests:

Bash:

```bash
npm run test -- worker.test.js
```

PowerShell needs two `--`:

```pwsh
npm run test -- -- worker.test.js
```

To run a specific test, add `-t "Test name"`.

## Workflow Summary

1. **Convert** wiki page sections → `worker-convert-test-cases.mjs`
2. **Add** converted cases → `worker-test-cases.json`
3. **Regenerate** with expected outputs → `npm run test:regenerate`
4. **Replace** original file → `worker-test-cases-regenerated.json` → `worker-test-cases.json`
5. **Run** tests →
   - Bash: `npm test -- worker.test.js`
   - PowerShell: `npm test -- -- worker.test.js`
