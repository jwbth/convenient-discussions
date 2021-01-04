/**
 * Table of contents-related functions.
 *
 * @module toc
 */

import Comment from './Comment';
import Section from './Section';
import cd from './cd';
import { reloadPage } from './boot';
import { restoreScrollPosition, saveScrollPosition } from './util';

export default {
  /**
   * Hide the TOC if the relevant cookie is set. This method duplicates {@link
   * https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.toc/toc.js
   * the native MediaWiki function} and exists because we may need to hide the TOC earlier than the
   * native method does it.
   */
  possiblyHide() {
    if (!cd.g.$toc.length) return;

    if (mw.cookie.get('hidetoc') === '1') {
      cd.g.$toc.find('.toctogglecheckbox').prop('checked', true);
    }
  },

  /**
   * Highlight (bold) watched sections.
   */
  highlightWatchedSections() {
    if (!cd.settings.modifyToc || !cd.g.$toc.length) return;

    cd.sections
      .filter((section) => section.isWatched)
      .forEach((section) => {
        section.updateTocLink();
      });
  },

  /**
   * Object with the same basic structure as {@link module:SectionSkeleton} has. (It comes from a
   * web worker so its constuctor is lost.)
   *
   * @typedef {object} SectionSkeletonLike
   */

  /**
   * Add links to new, not yet rendered sections (loaded in the background) to the table of
   * contents.
   *
   * @param {SectionSkeletonLike[]} sections All sections present on the new revision of the page.
   */
  addNewSections(sections) {
    if (!cd.settings.modifyToc || !cd.g.$toc.length) return;

    cd.g.$toc
      .find('.cd-toc-notRenderedSectionList, .cd-toc-notRenderedSection')
      .remove();

    const tocSections = cd.g.$toc
      .find('li > a')
      .toArray()
      .map((el) => {
        const $el = $(el);
        const headline = $el.find('.toctext').text();
        const anchor = $el.attr('href').slice(1);
        const $element = $el.parent();
        let [, level] = $element.attr('class').match(/\btoclevel-(\d+)/);
        level = Number(level);
        const number = $element
          .children('a')
          .children('.tocnumber')
          .text();
        return { headline, anchor, level, number, $element };
      });

    /*
      Note the case when the page starts with sections of lower levels than the base level, like
      this:

      === Section 1 ===
      ==== Section 2 ====
      == Section 3 ==

      In this case, the TOC will look like this:
      1 Section 1
        1.1 Section 2
      2 Section 3

      The other possible case when the level on the page is different from the level in the TOC
      is when there is a gap between the levels on the page. For example:

      == Section ==
      ==== Subsection ====

      will be displayed like this in the TOC:

      1 Section
        1.1 Subsection
     */
    sections.forEach((section, i) => {
      section.parent = sections
        .slice(0, i)
        .reverse()
        .find((otherSection) => otherSection.level < section.level);
    });
    sections.forEach((section) => {
      section.tocLevel = section.parent ? section.parent.tocLevel + 1 : 1;
    });

    let currentTree = [];
    const $topUl = cd.g.$toc.children('ul');
    sections.forEach((section) => {
      const matchedSection = Section.search(section);
      let match = (
        matchedSection &&
        tocSections.find((tocSection) => tocSection.anchor === matchedSection.anchor)
      );

      if (!match) {
        const headline = section.headline;
        const level = section.tocLevel;
        const currentLevelMatch = currentTree[level - 1];
        let upperLevelMatch;
        if (!currentLevelMatch) {
          upperLevelMatch = currentTree[currentTree.length - 1];
        }

        const $element = $('<li>')
          .addClass('cd-toc-notRenderedSection')
          .addClass(`toclevel-${level}`);
        const $a = $('<a>')
          .attr('href', '#' + section.anchor)
          .on('click', (e) => {
            e.preventDefault();
            reloadPage({
              sectionAnchor: section.anchor,
              pushState: true,
            });
          })
          .appendTo($element);
        if (cd.g.thisPageWatchedSections?.includes(headline)) {
          $a
            .addClass('cd-toc-watched')
            .attr('title', cd.s('toc-watched'));
        }

        let number;
        if (currentLevelMatch) {
          number = currentLevelMatch.number;
        } else if (upperLevelMatch) {
          number = upperLevelMatch.number + '.1';
        } else {
          number = '1';
        }
        $('<span>')
          .addClass('tocnumber cd-toc-hiddenTocNumber')
          .text(number)
          .appendTo($a);

        $('<span>')
          .addClass('toctext')
          .text(section.headline)
          .appendTo($a);

        if (currentLevelMatch) {
          currentLevelMatch.$element.after($element);
        } else if (upperLevelMatch) {
          $('<ul>')
            .addClass('cd-toc-notRenderedSectionList')
            .addClass(`toclevel-${level}`)
            .append($element)
            .appendTo(upperLevelMatch.$element);
        } else {
          $topUl.prepend($element);
        }

        match = { headline, level, number, $element };
      }

      currentTree[section.tocLevel - 1] = match;
      currentTree.splice(section.tocLevel);
    });
  },

  /**
   * Object with the same basic structure as {@link module:CommentSkeleton} has. (It comes from a
   * web worker so its constuctor is lost.)
   *
   * @typedef {object} CommentSkeletonLike
   */

  /**
   * Add links to new comments (either already displayed or loaded in the background) to the table
   * of contents.
   *
   * @param {CommentSkeletonLike[]|Comment[]} commentsBySection
   * @param {object} keptData
   */
  addNewComments(commentsBySection, keptData) {
    if (!cd.settings.modifyToc || !cd.g.$toc.length) return;

    const firstComment = commentsBySection.values().next().value?.[0];
    if (!firstComment) return;

    const areCommentsRendered = firstComment instanceof Comment;

    const saveTocHeight = Boolean(
      !(cd.g.hasPageBeenReloaded && areCommentsRendered) ||

      // When the comment or section is opened by a link from the TOC
      keptData.commentAnchor ||
      keptData.sectionAnchor
    );
    saveScrollPosition(saveTocHeight);

    cd.g.$toc
      .find('.cd-toc-notRenderedCommentList')
      .remove();

    cd.debug.startTimer('addNewComments sections cycle');
    commentsBySection.forEach((comments, sectionOrAnchor) => {
      if (!sectionOrAnchor) return;

      // There could be a collision of hrefs between the existing section and not yet rendered
      // section, so we compose the selector carefully.
      cd.debug.startTimer('addNewComments sections selector');
      const $sectionLink = typeof sectionOrAnchor === 'string' ?
        cd.g.$toc.find(
          `.cd-toc-notRenderedSection a[href="#${$.escapeSelector(sectionOrAnchor)}"]`
        ) :
        sectionOrAnchor.getTocLink();
      cd.debug.startTimer('addNewComments sections selector');
      if (!$sectionLink?.length) return;

      let $target = $sectionLink;
      const $next = $sectionLink.next('.cd-toc-newCommentList');
      if ($next.length) {
        $target = $next;
      }
      const target = $target.get(0);

      // jQuery is too expensive here given that very many comments may be added.
      const ul = document.createElement('ul');
      ul.className = areCommentsRendered ?
        'cd-toc-newCommentList' :
        'cd-toc-notRenderedCommentList';

      let moreTooltipText = '';
      comments.forEach((comment, i) => {
        cd.debug.startTimer('addNewComments comments prepare');
        const parent = areCommentsRendered ? comment.getParent() : comment.parent;
        const names = parent?.author && comment.level > 1 ?
          cd.s('navpanel-newcomments-names', comment.author.name, parent.author.name) :
          comment.author.name;
        const date = comment.date ?
          cd.util.formatDate(comment.date) :
          cd.s('navpanel-newcomments-unknowndate');
        const text = (
          names +
          (cd.g.SITE_DIR === 'rtl' ? '\u200F' : '') +
          cd.mws('comma-separator') +
          date
        );
        cd.debug.stopTimer('addNewComments comments prepare');

        cd.debug.startTimer('addNewComments comments DOM');

        // If there are 5 comments or less, show all of them. If there are more, show 4 and "N
        // more". (Because showing 4 and then "1 more" is stupid.)
        if (i < 4 || comments.length === 5) {
          const li = document.createElement('li');
          ul.appendChild(li);

          const bulletSpan = document.createElement('span');
          bulletSpan.className = 'tocnumber cd-toc-bullet';
          bulletSpan.innerHTML = cd.sParse('bullet');
          li.appendChild(bulletSpan);

          const textSpan = document.createElement('span');
          textSpan.className = 'toctext';
          li.appendChild(textSpan);

          const a = document.createElement('a');
          a.href = `#${comment.anchor}`;
          a.textContent = text;
          textSpan.appendChild(a);

          if (comment instanceof Comment) {
            a.onclick = (e) => {
              e.preventDefault();
              comment.scrollToAndHighlightTarget(false, true);
            };
          } else {
            a.onclick = (e) => {
              e.preventDefault();
              reloadPage({
                commentAnchor: comment.anchor,
                pushState: true,
              });
            };
          }
        } else {
          moreTooltipText += text + '\n';
        }
        cd.debug.stopTimer('addNewComments comments DOM');
      });

      cd.debug.startTimer('addNewComments sections DOM');
      if (comments.length > 5) {
        const span = document.createElement('span');
        span.className = 'cd-toc-more';
        span.title = moreTooltipText.trim();
        span.textContent = cd.s('toc-more', comments.length - 4);

        const li = document.createElement('li');
        li.appendChild(span);
        ul.appendChild(li);
      }

      cd.debug.stopTimer('addNewComments sections DOM');
      target.parentNode.insertBefore(ul, target.nextSibling);
    });
    cd.debug.stopTimer('addNewComments sections cycle');

    restoreScrollPosition();
  },
};
