# Convenient Discussions ![lic](https://img.shields.io/github/license/jwbth/convenient-discussions)
<img align="right" width="200" src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Convenient_Discussions_logo_color_textless.svg/200px-Convenient_Discussions_logo_color_textless.svg.png" />

**Convenient Discussions** (**CD**) is a JavaScript tool providing a shell over the existing [MediaWiki](https://www.mediawiki.org/) discussion system that enhances user experience with talk pages in multiple ways.

## Features
* Posting and editing comments without switching to a separate page
  * @mentions, [[#comment links]], [[wikilinks]], {{templates}}, and \<tags> autocomplete
  * Quoting comments with formatting preserved
  * Autofilling the edit summary with indication of the addressee of the comment
  * Saving comment drafts to restore the forms' content after unexpected events such as browser crashes
  * Uploading screenshots to Wikimedia Commons in three clicks
* Creating topics and subsections
* Redesigned talk pages, with author and date displayed on top of comments (opt-in) and thin lines denoting threads
* Handling "outdent" templates
* Collapsible (and autocollapsible) threads
* Comment timestamps in local time and arbitrary format, including relative
* Highlighting and navigating new comments (via the navigation panel or the table of contents)
* Highlighting own comments
* Checking for new comments in the background and automatically rendering simple comment edits
* Subscribing to topics, which affects notifications and highlighting topics in several places (based on [DiscussionTools](https://www.mediawiki.org/wiki/Help:DiscussionTools#Topic_subscriptions))
* Desktop notifications about replies to the user's comments and comments in topics the user subscribed to on open pages (opt-in)
* Moving topics between talk pages
* Thanking for edits that added comments
* Copying links to comments
* Jumping to a specific comment from the watchlist and other pages that list revisions
* Always seeing the current section's name and navigating page parts in one click
* Searching for comments and sections in the archive

The script makes the user forget about:
* the need to search the code for a place for a comment, count colons, type tildes and other markup;
* edit conflicts;
* reading talk pages through diffs;
* the need to completely reload the page and look for new comments with eyes, or even check the watchlist;
* the need to convert UTC dates to local time.

A limitation of the script is that it works only in modern browsers, i.e., doesn't support Internet Explorer.

## Credits
Convenient Discussions started in 2018 as Russian Wikipedia's user script. It is being developed by Jack who built the house, enriched by the contributions and feedback from the global Wikimedia tech community and users. It also borrows the code for parsing timestamps in different formats from Matma Rex and uses solutions and ideas from the Wikimedia engineering and design teams.

## See also
* For documentation, see [the script's homepage](https://commons.wikimedia.org/wiki/User:Jack_who_built_the_house/Convenient_Discussions).
* File issues on Wikimedia Phabricator under [the tag "Convenient-Discussions"](https://phabricator.wikimedia.org/tag/convenient-discussions/).
* If you want to help with localization, see [the translatewiki.net project](https://translatewiki.net/wiki/Translating:Convenient_Discussions).
