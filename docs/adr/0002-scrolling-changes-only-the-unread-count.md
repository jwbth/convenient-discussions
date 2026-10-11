# Scrolling changes only the navigation panel's unread count

Scrolling a comment into view makes it read, and the only thing that reacts is the navigation panel's unread count, which walks the user to what they haven't read yet. Highlighting and the section and TOC counts follow the new/old axis, which only the user's explicit "Mark as read" moves, so scrolling stays a free action: the user can look around without spending what tells them where the new comments are. The read status module emits one event per axis, so nothing on the new/old side hears about scrolling.

## Considered options

- **Live counts everywhere**: scrolling past comments on the way to another would quietly spend the sections' counts.
- **A frozen navigation panel count**: the panel could no longer walk the user through what they haven't read yet.
