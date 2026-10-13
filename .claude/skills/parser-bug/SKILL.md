---
name: parser-bug
description: Reproduce and fix a CD parser bug, where a talk page comment or section comes out with wrong boundaries or properties. Use when such a bug is reported, usually with a page link or comment ID.
---

The parser runs the same code (`src/shared/Parser.js`, `src/shared/CommentSkeleton.js`) in the window and in the worker. The worker runs in Vitest, which makes it the fast seam: a parse takes 2–5 s. Build the loop there and go to the browser only if the worker can't reproduce the bug.

## 1. Get the markup

A comment ID like `c-FeRDNYC-20261009041400-HNordeen_(WMF)-20261001221100` names the author, the UTC timestamp, then the parent comment or the section. `https://<wiki>/wiki/Special:GoToComment/<id>` redirects to the page that has the comment now, even after archiving (`curl -sI`, read `location`).

Use the Action API of the same wiki, sending a `User-Agent` header, and keep the files in the scratchpad:

- Wikitext: `index.php?title=<page>&action=raw`. Find the comment with `rg` on its signature date as the wiki writes it (`04:14, 9 October 2026`).
- HTML of the whole page: `api.php?action=parse&format=json&formatversion=2&prop=text&page=<page>`, field `parse.text`.
- HTML of a wikitext snippet: the same with `--data-urlencode text@<file>&contentmodel=wikitext&title=<page>` in place of `page=`. Templates differ per wiki, so render on the bug's wiki rather than hand-write template output.

## 2. Build the loop

Copy [`parse-html.test.js`](parse-html.test.js) to `tests/zz-parse-html.test.js` and run it as its header says. It prints every comment the worker found. Point its expectation at the reported comment (author and date) and the symptom, and see it go red.

## 3. Minimise

1. Cut the thread's wikitext down to the reported comment and a few neighbors, render it, and keep it red.
2. Hand-edit the HTML from there, one cut per run. A signature as plain as `<a href="/wiki/User:Bob" title="User:Bob">Bob</a> 01:00, 1 January 2026 (UTC)` parses.

Neighbors are often load-bearing: the comment's span is found by walking back from its signature until another comment's elements stop it, so dropping the previous reply can turn the loop green. Swapping a tag (`blockquote` → `div`) tells a tag-specific rule from a structural one.

## 4. Find the cause

`CommentSkeleton`'s constructor lists the pipeline that turns a signature into comment parts. Most clauses in it are ad hoc fixes, each citing a page it was made for. Once you suspect a clause:

- `git log -L '/<line of the clause>/,+N:<file>'` finds the commit that brought it and its intent.
- `git checkout <sha>~1 -- <file>`, a loop run, then `git checkout HEAD -- <file>` tells whether the bug is a regression. The restore also wipes any debug logs in the file.

The harness passes `console.info` through; filter debug logs by `this.authorName` to keep them to the comment at hand.

If the loop stays green on markup that is red on the page, the cause is window-only: test on the page in the browser, as `AGENTS.md` says.

## 5. Fix and lock down

Write the regression test in `tests/worker-basic.test.js`, using its `parse`, `heading`, and `firstComment` helpers. Keep the shape of the real template output, like the `<style>` TemplateStyles puts before a template's first use on a page.

Expectations in `tests/worker-test-cases.json` were generated from parser output, so one that a fix breaks may have recorded a bug. Judge it by the intent of the code before updating it.

Finally, run the harness on the whole page's HTML and confirm the reported comment, then trash `tests/zz-parse-html.test.js`.
