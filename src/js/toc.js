/**
 * Table of contents-related functions.
 *
 * @module toc
 */

import CdError from './CdError';
import Comment from './Comment';
import LiveTimestamp from './LiveTimestamp';
import cd from './cd';
import navPanel from './navPanel';
import { formatDate, formatDateNative } from './timestamp';
import { reloadPage } from './boot';
import { restoreRelativeScrollPosition, saveRelativeScrollPosition } from './util';

let tocItems;

/**
 * Generate a string containing new comment count to insert after the section headline in the table
 * of contents.
 *
 * @param {number} count
 * @param {number} unseenCount
 * @param {boolean} full
 * @param {Element} $target
 * @private
 */
function addCommentCountString(count, unseenCount, full, $target) {
  const countString = full ? cd.s('toc-commentcount-full', count) : count;
  let unseenCountString;
  if (unseenCount) {
    const messageName = full ? 'toc-commentcount-new-full' : 'toc-commentcount-new';
    unseenCountString = ' ' + cd.s(messageName, unseenCount);
  } else {
    unseenCountString = '';
  }

  const span = document.createElement('span');
  span.className = 'cd-toc-commentCount';
  const bdi = document.createElement('bdi');
  bdi.textContent = countString + unseenCountString;
  span.appendChild(bdi);
  $target.append(span);
}

/**
 * Class representing a table of contents item.
 */
class TocItem {
  /**
   * Create a table of contents item object.
   *
   * @param {object} a
   * @throws {CdError}
   */
  constructor(a) {
    const textSpan = a.querySelector('.toctext');
    if (!textSpan) {
      throw new CdError();
    }

    const headline = textSpan.textContent;
    const anchor = a.getAttribute('href').slice(1);
    const li = a.parentNode;
    let [, level] = li.className.match(/\btoclevel-(\d+)/);
    level = Number(level);
    const numberSpan = a.querySelector('.tocnumber');
    if (!numberSpan) {
      throw new CdError();
    }

    const number = numberSpan.textContent;

    /**
     * Link jQuery element.
     *
     * @name $link
     * @type {external:jQuery}
     * @memberof module:toc~TocItem
     * @instance
     */

    Object.assign(this, {
      headline,
      anchor,
      level,
      number,
      $element: $(li),
      $link: $(a),
      $text: $(textSpan),
    });
  }

  /**
   * _For internal use._ Generate HTML to use it in the TOC for the section. Only a limited number
   * of HTML elements is allowed in TOC.
   *
   * @param {external:jQuery} $headline
   */
  replaceText($headline) {
    const html = $headline
      .clone()
      .find('*')
      .each((i, el) => {
        if (['B', 'EM', 'I', 'S', 'STRIKE', 'STRONG', 'SUB', 'SUP'].includes(el.tagName)) {
          [...el.attributes].forEach((attr) => {
            el.removeAttribute(attr.name);
          });
        } else {
          [...el.childNodes].forEach((child) => {
            el.parentNode.insertBefore(child, el);
          });
          el.remove();
        }
      })
      .end()
      .html();
    this.$text.html(html);
    this.headline = this.$text.text().trim();
  }
}

export default {
  /**
   * _For internal use._ Hide the TOC if the relevant cookie is set. This method duplicates
   * {@link https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.toc/toc.js the native MediaWiki function}
   * and exists because we may need to hide the TOC earlier than the native method does it.
   */
  possiblyHide() {
    if (!cd.g.$toc.length) return;

    if (mw.cookie.get('hidetoc') === '1') {
      cd.g.$toc.find('.toctogglecheckbox').prop('checked', true);
    }
  },

  /**
   * _For internal use._ Reset the TOC data (executed at each page reload).
   */
  reset() {
    tocItems = null;
    cd.g.$toc = cd.g.$root.find('.toc');
    const $closestFloating = cd.g.$toc.closest(
      '[style*="float: right"], [style*="float:right"], [style*="float: left"], [style*="float:left"]'
    );
    cd.g.isTocFloating = Boolean(
      $closestFloating.length &&
      cd.g.$root.has($closestFloating).length
    );
  },

  /**
   * Get a TOC item by anchor.
   *
   * @param {string} anchor
   * @returns {?object}
   */
  getItem(anchor) {
    if (!cd.g.$toc.length) {
      return null;
    }

    if (!tocItems) {
      const links = [...cd.g.$toc.get(0).querySelectorAll('li > a')];
      try {
        // It is executed first time before not rendered (gray) sections are added to the TOC, so we
        // use a simple algorithm to obtain items.
        tocItems = links.map((a) => new TocItem(a));
      } catch {
        console.error('Couldn\'t find an element of a table of contents item.');
        tocItems = [];

        // Forcibly switch off the setting - we better not touch the TOC if something is broken
        // there.
        cd.settings.modifyToc = false;
      }
    }

    return tocItems.find((item) => item.anchor === anchor) || null;
  },

  /**
   * _For internal use._ Highlight (bold) sections that the user is subscribed to.
   */
  highlightSubscriptions() {
    if (!cd.settings.modifyToc || !cd.g.$toc.length) return;

    cd.sections
      .filter((section) => section.subscriptionState)
      .forEach((section) => {
        section.updateTocLink();
      });
  },

  /**
   * Add the number of comments to each section link.
   */
  addCommentCount() {
    if (!cd.settings.modifyToc || !cd.g.$toc.length) return;

    cd.sections.forEach((section, i) => {
      const item = section.getTocItem();
      if (!item) return;

      const count = section.comments.length;
      if (!count) return;
      const unseenCount = section.comments.filter((comment) => comment.isSeen === false).length;

      addCommentCountString(count, unseenCount, i === 0, item.$link);
    });
  },

  /**
   * _For internal use._ Add links to new, not yet rendered sections (loaded in the background) to
   * the table of contents.
   *
   * Note that this method may also add the `match` property to the section elements containing a
   * matched `Section` object.
   *
   * @param {import('./commonTypedefs').SectionSkeletonLike[]} sections All sections present on the
   *   new revision of the page.
   */
  addNewSections(sections) {
    if (!cd.settings.modifyToc || !cd.g.$toc.length) return;

    saveRelativeScrollPosition({ saveTocHeight: true });

    cd.g.$toc
      .find('.cd-toc-notRenderedSectionList, .cd-toc-notRenderedSection')
      .remove();

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
      let item = section.match?.getTocItem();
      if (!item) {
        const headline = section.headline;
        const level = section.tocLevel;
        const currentLevelMatch = currentTree[level - 1];
        let upperLevelMatch;
        if (!currentLevelMatch) {
          upperLevelMatch = currentTree[currentTree.length - 1];
        }

        const li = document.createElement('li');
        li.className = `cd-toc-notRenderedSection toclevel-${level}`;

        const a = document.createElement('a')
        a.href = '#' + section.anchor;
        a.onclick = (e) => {
          e.preventDefault();
          reloadPage({
            sectionAnchor: section.anchor,
            pushState: true,
          });
        };
        li.appendChild(a);

        let number;
        if (currentLevelMatch) {
          number = currentLevelMatch.number;
        } else if (upperLevelMatch) {
          number = upperLevelMatch.number + '.1';
        } else {
          number = '1';
        }
        const numberSpan = document.createElement('span');
        numberSpan.className = 'tocnumber cd-toc-hiddenTocNumber';
        numberSpan.textContent = number;
        a.appendChild(numberSpan);

        const textSpan = document.createElement('span');
        textSpan.className = 'toctext';
        textSpan.textContent = section.headline;
        a.appendChild(textSpan);

        if (currentLevelMatch) {
          currentLevelMatch.$element.after(li);
        } else if (upperLevelMatch) {
          const ul = document.createElement('ul');
          ul.className = `cd-toc-notRenderedSectionList toclevel-${level}`;
          ul.appendChild(li);
          upperLevelMatch.$element.append(ul);
        } else {
          $topUl.prepend(li);
        }

        item = {
          headline,
          level,
          number,
          $element: $(li),
        };
      }

      currentTree[section.tocLevel - 1] = item;
      currentTree.splice(section.tocLevel);
    });

    restoreRelativeScrollPosition(true);
  },

  /**
   * _For internal use._ Add links to new comments (either already displayed or loaded in the
   * background) to the table of contents.
   *
   * @param {Map} commentsBySection
   * @param {object} passedData
   */
  addNewComments(commentsBySection, passedData) {
    const firstComment = commentsBySection.values().next().value?.[0];
    if (!cd.settings.modifyToc || !cd.g.$toc.length || !firstComment) return;

    const areCommentsRendered = firstComment instanceof Comment;

    const saveTocHeight = Boolean(
      // On first load
      !cd.state.hasPageBeenReloaded ||

      // When unrendered (in gray) comments are added
      !areCommentsRendered ||

      // When the comment or section is opened by a link from the TOC
      passedData.commentAnchor ||
      passedData.sectionAnchor
    );
    saveRelativeScrollPosition({ saveTocHeight });

    cd.g.$toc
      .find('.cd-toc-notRenderedCommentList')
      .remove();

    const rtlMarkOrNot = cd.g.CONTENT_DIR === 'rtl' ? '\u200f' : '';
    const comma = cd.mws('comma-separator');
    commentsBySection.forEach((comments, section) => {
      if (!section) return;

      // There could be a collision of hrefs between the existing section and not yet rendered
      // section, so we compose the selector carefully.
      let $sectionLink;
      if (areCommentsRendered) {
        $sectionLink = section.getTocItem()?.$link;
      } else {
        if (section.match) {
          $sectionLink = section.match.getTocItem()?.$link;
        } else {
          const anchor = $.escapeSelector(section.anchor);
          $sectionLink = cd.g.$toc.find(`.cd-toc-notRenderedSection a[href="#${anchor}"]`);
        }
      }

      // Should never be the case
      if (!$sectionLink?.length) return;

      if (!areCommentsRendered) {
        const count = section.comments.length;
        let unseenCount = comments.length;
        if (section.match) {
          unseenCount += section.match.comments
            .filter((comment) => comment.isSeen === false)
            .length;
          $sectionLink.children('.cd-toc-commentCount').remove();
        }
        addCommentCountString(count, unseenCount, section.id === 0, $sectionLink);
      }

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

      // Was 6 initially, then became 5, now 4.
      const itemsLimit = 4;

      let moreTooltipText = '';
      comments.forEach((comment, i) => {
        const parent = areCommentsRendered ? comment.getParent() : comment.parent;
        const names = parent?.author && comment.level > 1 ?
          cd.s('navpanel-newcomments-names', comment.author.name, parent.author.name) :
          comment.author.name;
        const addAsItem = i < itemsLimit - 1 || comments.length === itemsLimit;
        let date;
        let nativeDate;
        if (comment.date) {
          nativeDate = formatDateNative(comment.date);
          date = addAsItem && cd.settings.timestampFormat !== 'default' ?
            formatDate(comment.date) :
            nativeDate;
        } else {
          date = cd.s('navpanel-newcomments-unknowndate');
        }
        let text = names + rtlMarkOrNot + comma;

        // If there are `itemsLimit` comments or less, show all of them. If there are more, show
        // `itemsLimit - 1` and "N more". (Because showing `itemsLimit - 1` and then "1 more" is
        // stupid.)
        if (addAsItem) {
          const li = document.createElement('li');
          ul.appendChild(li);

          const bulletSpan = document.createElement('span');
          bulletSpan.className = 'tocnumber cd-toc-bullet';
          bulletSpan.innerHTML = cd.sParse('bullet');
          li.appendChild(bulletSpan);

          const textSpan = document.createElement('span');
          textSpan.className = 'toctext';
          li.appendChild(textSpan);

          if (cd.settings.timestampFormat === 'default') {
            text += date;
          }

          const a = document.createElement('a');
          a.href = `#${comment.anchor}`;
          a.textContent = text;
          textSpan.appendChild(a);

          if (cd.settings.timestampFormat !== 'default') {
            const timestampSpan = document.createElement('span');
            timestampSpan.textContent = date;
            timestampSpan.title = nativeDate;
            a.appendChild(timestampSpan);

            let callback;
            if (!areCommentsRendered) {
              callback = () => {
                navPanel.updateTimestampsInRefreshButtonTooltip();
              };
            }
            new LiveTimestamp(timestampSpan, comment.date, false, callback);
          }

          if (comment instanceof Comment) {
            a.onclick = (e) => {
              e.preventDefault();
              comment.scrollTo(false, true);
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
          // In a tooltip, always show the date in the default format — we won't be auto-updating
          // relative dates there due to low benefit.
          moreTooltipText += text + nativeDate + '\n';
        }
      });

      if (comments.length > itemsLimit) {
        const span = document.createElement('span');
        span.className = 'cd-toc-more';
        span.title = moreTooltipText.trim();
        span.textContent = cd.s('toc-more', comments.length - (itemsLimit - 1));

        const li = document.createElement('li');
        li.appendChild(span);
        ul.appendChild(li);
      }

      target.parentNode.insertBefore(ul, target.nextSibling);
    });

    restoreRelativeScrollPosition(true);
  },
};
