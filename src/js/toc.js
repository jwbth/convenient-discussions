/**
 * Table of contents related functions.
 *
 * @module toc
 */

import Comment from './Comment';
import cd from './cd';
import { reloadPage } from './boot';

/**
 * Highlight (bold) watched sections.
 */
export function highlightWatchedSectionsInToc() {
  if (!cd.settings.modifyToc) return;

  const $toc = $('.toc');
  if (!$toc.length) return;

  cd.sections.forEach((section) => {
    const anchor = section.anchor;
    const $a = $toc.find(`a[href="#${$.escapeSelector(anchor)}"]`);
    if (!$a.length) return;

    if (section.isWatched) {
      $a
        .addClass('cd-toc-watched')
        .attr('title', cd.s('toc-watched'));
    } else {
      $a
        .removeClass('cd-toc-watched');
    }
  });
}

/**
 * Add links to new comments (either already displayed or loaded in the background) to the table of
 * contents.
 *
 * @param {object} commentsBySection
 */
export function addNewCommentsToToc(commentsBySection) {
  if (!cd.settings.modifyToc) return;

  const $toc = $('.toc');
  if (!$toc.length) return;

  $toc.find('.cd-toc-notLoadedCommentList').remove();

  Object.keys(commentsBySection)
    .filter((anchor) => anchor !== '_')
    .forEach((anchor) => {
      const $sectionA = $toc.find(`a[href="#${$.escapeSelector(anchor)}"]`);
      if (!$sectionA.length) return;

      let $target = $sectionA;
      const $next = $sectionA.next('.cd-toc-newCommentList');
      if ($next.length) {
        $target = $next;
      }

      const $ul = $('<ul>').insertAfter($target);
      $ul.addClass(
        commentsBySection[anchor][0] instanceof Comment ?
        'cd-toc-newCommentList' :
        'cd-toc-notLoadedCommentList'
      );

      commentsBySection[anchor]
        .slice(0, 5)
        .forEach((comment) => {
          const parent = comment instanceof Comment ? comment.getParent() : comment.parent;
          const names = parent?.author && comment.level > 1 ?
            cd.s('newpanel-newcomments-names', comment.author.name, parent.author.name) :
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

          const $li = $('<li>')
            .appendTo($ul);
          const href = `#${comment.anchor}`;
          $('<span>')
            .html(cd.s('bullet'))
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
              reloadPage({ commentAnchor: comment.anchor });
            });
          }
        });

      if (commentsBySection[anchor].length > 5) {
        $('<li>')
          .text(cd.s('toc-more', commentsBySection[anchor].length - 5))
          .appendTo($ul);
      }
    });
}
