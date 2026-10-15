---
name: comment-markup-bug
description: Reproduce and fix a bug where CD mangles markup inside a comment: editing loads it into the input wrong, or posting turns the input into wrong wikitext. Use when such a bug is reported, usually with a diff link.
---

A comment's markup makes a **round trip**: editing turns its code into the input value (`CommentSource#toInputValue`), and posting turns the input back into code (`CommentFormInputTransformer.inputToCode`, called from `buildEdit`). Both directions mask code they mustn't touch with `TextMasker#maskSensitiveCode` and then rework line breaks, indentation, and paragraphs in what's left. A comment placed in the wrong spot or with the wrong boundaries is a locator or parser bug: use the `parser-bug` skill. Wrong wikitext from quoting, pasting, or dropping rich text is the `html-to-wikitext-bug` skill's.

The round trip is lossy by design. Line breaks that render nothing are collapsed into spaces at level 0, and line breaks around block elements and masked blocks are squashed. A bug is a loss that changes what the page renders or what the author laid out on purpose.

## 1. Get the markup

Take the diff from the Action API of the bug's wiki, sending a `User-Agent` header:

```sh
curl -s -A "cd-dev" "https://<wiki>/w/api.php?action=compare&fromrev=<rev>&torelative=prev&format=json&formatversion=2&prop=diff|comment"
```

`fromrev` takes the revision from `?diff=<rev>`; it must be set. The edit summary (`tocomment`) tells an edit of an existing comment (`edit … comment by …`) from a new reply or section. An edit diff shows both ends of the round trip: the old side is what `toInputValue` read, the new side is what `inputToCode` wrote.

## 2. Build the loop

Both directions have a Vitest seam that runs in about a second, so the browser stays out of the loop:

- **Editing**: `tests/CommentSource.test.js`. Build the section's code, locate the comment with `locate`, `sign`, and `makeOpeningCommentData` (or `makeData` for replies), and assert `toInputValue()`.
- **Posting**: `testWithData` in `tests/CommentFormInputTransformer.test.js`, with a form fixture matching the comment's mode and level (`addSectionForm` for level 0, `firstCommentReplyForm` for an indented reply).

Put the reported markup in, run `npx vitest run <file>`, and see the loop go red on the symptom. The transformer test's `cd.g` and `cd.config` are hand-written mocks: when a rule depends on `pniePattern` or a config value, check the mock against `src/loader/baseGlobals.js` and `config/default.js`.

Write expectations after a run, not before. The collapsing rules are easy to misjudge: a line break after a closing tag or a masked block in mid-line still collapses to a space at level 0, and the transformer adds no `<br>` after a line that ends in a masked block. Judge the actual output by what MediaWiki renders from it, not by how close it stays to the source text.

Edit tests with the Edit tool: `sed` on JS strings holding escaped `\n` fails to match without an error.

## 3. Minimise

Cut the markup one element per run while the loop stays red: neighbouring lines, then templates, then tags. Swapping a tag for another (`noinclude` → `span`) tells a tag-specific rule from a line-structure one.

## 4. Find the cause

Rank 3–5 hypotheses, each with the change that would turn the loop green, before testing any. The usual suspects, in the order the code runs:

- **Masking** (`maskSensitiveCode`): markup that should be kept verbatim isn't masked, or masked markup hides what a later rule needs to see.
- **Line-break rules**: the regexps at the top of `toInputValue` and in `CommentFormInputTransformer#processNewlines`. Their lists of line endings and beginnings that keep a newline mirror each other.
- **Indentation and paragraphs**: the indentation-char and paragraph-template steps further down `toInputValue`, and `handleIndentedComment` in the transformer.

`git log -L '/<line>/,+N:<file>'` gives the intent of a suspect rule; many cite the page they were made for.

## 5. Fix and lock down

The two directions must stay coordinated, as their code comments say: a rule changed in one usually needs its mirror in the other, or the next edit undoes the fix. A change to `maskSensitiveCode` covers both at once but also reaches its other callers: heading detection in `CommentSource#adjust`, `escapePipesOutsideLinks`, and the `brsToNewlines` pass in `src/utils-api.js`. Check each against the new masking.

Write a regression test at each seam the fix touches, using the minimised markup, both at level 0 and in a reply: a fix fitted to one level easily breaks the other (masked code keeps raw newlines, which end a reply's list item). See it fail with the fix stashed (`git stash push <file>`, run, `git stash pop`), then pass. For an end-to-end check, open the comment for editing on the test page and use the form's "View changes", which shows the diff without saving.
