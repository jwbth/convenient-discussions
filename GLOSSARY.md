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
- **Section data**: The plain facts about a section that locating it needs: headline, index, the headlines of the sections before it, its oldest comment's author, timestamp and text, and the comment data of the last comment in its first chunk.
- **Reply place**: The index in context code where a reply to a comment goes, found together with the reply's final indentation and whether it gets outdented.

### Submitting

- **Edit**: A change to a page's wikitext, in MediaWiki's sense. Once saved, it is a revision, by any user; `Comment#findEdit` looks for the one that added a comment. A comment form builds its edit before sending it: the API it goes through (edit, new section, or DiscussionTools), the section or page it lands in, the new code, and the revision it is based on.

### Read status

- **Read status**: Where a comment stands for the user: new or not, seen or unseen, read or not.
- **Visit**: A time the user loaded a talk page, remembered per page across sessions for as long as the highlight interval setting says.
- **New**: Posted after the user's earliest remembered visit to the page. New comments are highlighted.
- **Seen**: Been in the viewport, at this visit or an earlier one, or the user's own.
- **Unseen**: Posted since the user's latest visit, or edited since it when edits count as new comments, and not yet seen.
- **Read**: Taken out of new by the user, through a section's "Mark as read" or a refresh with the mark-as-read modifier. A read comment is seen and not new. *Avoid*: seen, for this.
