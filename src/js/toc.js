/**
 * Table of contents related functions.
 *
 * @module toc
 */

import Comment from './Comment';
import cd from './cd';
import { reloadPage } from './boot';
import { restoreScrollPosition, saveScrollPosition } from './util';

export default {
  /**
   * Highlight (bold) watched sections.
   */
  highlightWatchedSections() {
    if (!cd.settings.modifyToc) return;

    const $toc = $('.toc');
    if (!$toc.length) return;

    const $allLinks = $toc.find('a');
    cd.sections.forEach((section) => {
      // Can be more than one section with that headline. (In that case, the same code will run more
      // than once, but there is no gain in filtering.)
      const $links = $allLinks.filter(function () {
        return $(this).find('.toctext').text() === section.headline;
      });
      if (!$links.length) return;

      if (section.isWatched) {
        $links
          .addClass('cd-toc-watched')
          .attr('title', cd.s('toc-watched'));
      } else {
        $links
          .removeClass('cd-toc-watched');
      }
    });
  },

  /**
   * Object with the same structure as {@link module:SectionSkeleton} has. (It comes from a web
   * worker so its constuctor is lost.)
   *
   * @typedef {object} SectionSkeletonLike
   */

  /**
   * Add links to new, not yet displayed sections (loaded in the background) to the table of
   * contents.
   *
   * @param {SectionSkeletonLike[]} sections All sections on the page.
   */
  addNewSections(sections) {
    if (!cd.settings.modifyToc) return;

    const $toc = $('.toc');
    if (!$toc.length) return;

    $toc
      .find('.cd-toc-notLoadedSectionList, .cd-toc-notLoadedSection')
      .remove();

    const tocSections = $toc
      .find('li > a')
      .toArray()
      .map((el) => {
        const headline = $(el).find('.toctext').text();
        const $element = $(el).parent();
        let [, level] = $element.attr('class').match(/\btoclevel-(\d+)/);
        level = Number(level);
        const number = $element
          .children('a')
          .children('.tocnumber')
          .text();
        return { headline, level, number, $element };
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
      if (section.parent) {
        section.tocLevel = section.parent.tocLevel + 1;
      } else {
        section.tocLevel = 1;
      }
    });

    let currentTree = [];
    const $topUl = $toc.children('ul');
    sections.forEach((section) => {
      let match = tocSections.find((tocSection) => (
        tocSection.headline === section.headline &&
        tocSection.level === section.tocLevel
      ));

      if (!match) {
        const headline = section.headline;
        const level = section.tocLevel;
        const currentLevelMatch = currentTree[level - 1];
        let upperLevelMatch;
        if (!currentLevelMatch) {
          upperLevelMatch = currentTree[currentTree.length - 1];
        }

        const $element = $('<li>')
          .addClass('cd-toc-notLoadedSection')
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
        if (cd.g.thisPageWatchedSections.includes(headline)) {
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
            .addClass('cd-toc-notLoadedSectionList')
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
   * Object with the same structure as {@link module:CommentSkeleton} has. (It comes from a web
   * worker so its constuctor is lost.)
   *
   * @typedef {object} CommentSkeletonLike
   */

  /**
   * Add links to new comments (either already displayed or loaded in the background) to the table
   * of contents.
   *
   * @param {CommentSkeletonLike[]|Comment[]} commentsBySection
   */
  addNewComments(commentsBySection) {
    if (!cd.settings.modifyToc) return;

    const $toc = $('.toc');
    if (!$toc.length) return;

    saveScrollPosition();

    $toc
      .find('.cd-toc-notLoadedCommentList')
      .remove();

    Object.keys(commentsBySection)
      .filter((anchor) => anchor !== '_')
      .forEach((anchor) => {
        // .first() in case of a collision with a section we added above with toc.addNewSections().
        const $sectionLink = $toc.find(`a[href="#${$.escapeSelector(anchor)}"]`).first();
        if (!$sectionLink.length) return;

        let $target = $sectionLink;
        const $next = $sectionLink.next('.cd-toc-newCommentList');
        if ($next.length) {
          $target = $next;
        }

        const $ul = $('<ul>').insertAfter($target);
        $ul.addClass(
          commentsBySection[anchor][0] instanceof Comment ?
          'cd-toc-newCommentList' :
          'cd-toc-notLoadedCommentList'
        );

        let moreTooltipText = '';
        commentsBySection[anchor].forEach((comment, i) => {
          const parent = comment instanceof Comment ? comment.getParent() : comment.parent;
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

          if (i < 5) {
            const $li = $('<li>')
              .appendTo($ul);
            const href = `#${comment.anchor}`;
            $('<span>')
              .html(cd.sParse('bullet'))
              .addClass('tocnumber')
              .addClass('cd-toc-bullet')
              .appendTo($li);
            const $text = $('<span>')
              .addClass('toctext')
              .appendTo($li);
            const $a = $('<a>')
              .text(text)
              .attr('href', href)
              .appendTo($text);
            if (comment instanceof Comment) {
              $a.on('click', (e) => {
                e.preventDefault();
                comment.scrollToAndHighlightTarget(false, true);
              });
            } else {
              $a.on('click', (e) => {
                e.preventDefault();
                reloadPage({
                  commentAnchor: comment.anchor,
                  pushState: true,
                });
              });
            }
          } else {
            moreTooltipText += text + '\n';
          }
        });

        if (commentsBySection[anchor].length > 5) {
          $('<li>')
            .addClass('cd-toc-more')
            .attr('title', moreTooltipText.trim())
            .text(cd.s('toc-more', commentsBySection[anchor].length - 5))
            .appendTo($ul);
        }
      });

    restoreScrollPosition();
  },
};
