# Convenient Discussions

A shell over MediaWiki talk pages: it parses comments and sections out of the rendered page and lets the user reply, edit, and navigate without leaving it.

## Language

### Autocomplete

- **Trigger**: The characters that open an autocomplete menu in a comment form input, like `@`, `[[`, `{{`, or `<`.
- **Insertion**: The wikitext a chosen autocomplete option contributes, made of a start, a content, and an end, plus the rule for which text after the caret it takes over. *Avoid*: data, insertion data.
- **Saved selection**: Text that was selected when the user typed a trigger over it, and that the insertion wraps as its content. *Avoid*: autocomplete selection, selection data.
- **Replacement**: The change an insertion makes to the input: the range it replaces, the text it puts there, and what ends up selected. *Avoid*: edit.

### Locating

- **Context code**: The wikitext a comment form target is located in and edited within: the code of its section (when the section can be requested by its live section number) or of the whole page.
- **Locate**: Find the span of a comment or section in context code. The result is a comment source or section source: the span plus what was learned about it (indentation, reply indentation, heading code, signature code, and so on).
- **Comment data**: The plain facts about a comment that locating it needs: what identifies it (author, timestamp, index, previous comments, section headline, text, whether it follows a heading) and what shapes its span (level, own, opening comment of a section, table comment, foreign timestamps in it, `<pre>` blocks in it, its children's levels and whether it has valid replies).
