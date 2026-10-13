---
name: html-to-wikitext-bug
description: Reproduce and fix a bug in CD's HTML-to-wikitext conversion, where quoting, pasting, or dropping rich text into the comment input gives wrong wikitext. Use when such a bug is reported, usually with the source HTML or a comment link.
---

All three sources share one pipeline, and a bug in a shared stage shows in each of them:

1. **Source HTML.** A paste or drop (`CommentForm#handlePasteDrop`) gives clipboard HTML, unwrapped by `getElementFromPasteHtml`. A quote (`TextInputWidgetMixin#getWikitextFromSelection`) clones the selected DOM, which also carries what the clipboard leaves out, like elements hidden with `display: none`.
2. **`cleanUpPasteDom`** reduces the HTML to tags and attributes the transform API can take.
3. **`convertHtmlToWikitext`** posts it to Parsoid's `transform/html/to/wikitext` (the wiki's own on WMF wikis, en.wikipedia's elsewhere) and post-processes the result. On any API error it returns `null`, and CD inserts the rendered text instead: a report of text "inserted as rendered" is usually a failed API call.
4. **Quoting into a template** (`quoteFormatting` with `{{`) escapes pipes and braces with `escapePipesOutsideLinks`.

## 1. Get the HTML

- Paste or drop: the clipboard's `text/html`, which the user may give as a Chrome `<!--StartFragment-->` string.
- Quote: the selected element's `outerHTML`, taken with `copy($0.outerHTML)` in the console. HTML copied from DevTools' Elements panel is pretty-printed, and its indentation becomes line breaks in the wikitext that the page doesn't have.

Given only a comment link, fetch the page HTML as the `parser-bug` skill's step 1 says, and cut out the comment.

## 2. Build the loop

Copy [`convert-html.test.js`](convert-html.test.js) to `tests/zz-convert-html.test.js` and run it as its header says. It runs the real pipeline against the live API of the wiki in its URL and prints each stage. Point its expectation at the symptom and see it go red. Read the stages in order to find where the output goes wrong:

- **cleaned-up HTML** wrong: `cleanUpPasteDom`.
- **`transform API <status>`** printed: the API rejected the cleaned-up HTML.
- **wikitext** wrong from good HTML: the HTML is not in a shape Parsoid round-trips (see step 4), or the post-processing in `convertHtmlToWikitext`.
- **quoted into a template** wrong only: `escapePipesOutsideLinks`.

**plain text** is `undefined`, as jsdom has no `innerText`. The API answers bursts with 429; space the runs out by several seconds. To post to the API outside the harness on Windows, use Node's or Python's HTTP client: curl in Git Bash mangles non-ASCII arguments.

## 3. Minimise

Cut the input file one element or attribute per run while the loop stays red. Keep the attributes Parsoid reads (step 4) until a run shows they don't matter.

## 4. Fix

Parsoid rebuilds wikitext from its own attributes: `typeof`, `about`, `data-mw`, `rel="mw:WikiLink"`, `resource`, and hrefs relative to the wiki (`./Title`). Copying makes `href` and `resource` absolute, which Parsoid reads as external. So:

- Before dropping an element that converts badly, probe whether Parsoid keeps it once reshaped: hand-edit the cleaned-up HTML in the input file and rerun. Images, for one, come out as `[[File:…]]` with size, link, and caption once `resource` is relative.
- Remove attributes in sets: an attribute left without its companion breaks Parsoid, like `typeof="mw:Transclusion"` without `data-mw`, which gives a 400.
- Keep markup only where its target exists on the wiki the comment is posted to, like a Commons file on a WMF wiki, since a red link is worse than the plain text.

## 5. Lock down

Write the regression test where the faulty stage is: `tests/utils-window.cleanUpPasteDom.test.js` (its `cleanUp` helper; `location` is ru.wikipedia.org there, which same-wiki checks compare against) or `tests/utils-wikitext.escapePipesOutsideLinks.test.js`. Keep the shape of the real HTML and assert the stage's output; the API stays out of unit tests. See the test fail with the fix reverted (`git checkout <sha>~1 -- <file>`, run, `git checkout HEAD -- <file>`).

Rerun the harness on the original input for every source the fixed stage serves, paste and quote alike, then trash `tests/zz-convert-html.test.js`.
