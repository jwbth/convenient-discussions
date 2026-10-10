# Convenient Discussions

A shell over MediaWiki talk pages: it parses comments and sections out of the rendered page and lets the user reply, edit, and navigate without leaving it.

## Language

### Autocomplete

- **Trigger**: The characters that open an autocomplete menu in a comment form input, like `@`, `[[`, `{{`, or `<`.
- **Insertion**: The wikitext a chosen autocomplete option contributes, made of a start, a content, and an end, plus the rule for which text after the caret it takes over. *Avoid*: data, insertion data.
- **Saved selection**: Text that was selected when the user typed a trigger over it, and that the insertion wraps as its content. *Avoid*: autocomplete selection, selection data.
- **Replacement**: The change an insertion makes to the input: the range it replaces, the text it puts there, and what ends up selected. *Avoid*: edit.
