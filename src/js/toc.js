/**
 * Table of contents-related functions.
 *
 * @module toc
 */

import CdError from './CdError';
import Comment from './Comment';
import LiveTimestamp from './LiveTimestamp';
import cd from './cd';
import controller from './controller';
import navPanel from './navPanel';
import settings from './settings';
import { formatDate, formatDateNative } from './timestamp';

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
    const textSpan = a.querySelector(toc.isInSidebar() ? '.sidebar-toc-text' : '.toctext');
    if (!textSpan) {
      throw new CdError();
    }

    const headline = textSpan.textContent;
    const id = a.getAttribute('href').slice(1);
    const li = a.parentNode;
    let [, level] = li.className
      .match(toc.isInSidebar() ? /sidebar-toc-level-(\d+)/ : /\btoclevel-(\d+)/);
    level = Number(level);
    const numberSpan = a.querySelector(toc.isInSidebar() ? '.sidebar-toc-numb' : '.tocnumber');
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
      id,
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

const toc = {
  /**
   * _For internal use._ Hide the TOC if the relevant cookie is set. This method duplicates
   * {@link https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.toc/toc.js the native MediaWiki function}
   * and exists because we may need to hide the TOC earlier than the native method does it.
   */
  possiblyHide() {
    if (!this.isPresentClassic()) return;

    if (mw.cookie.get('hidetoc') === '1') {
      this.$element.find('.toctogglecheckbox').prop('checked', true);
    }
  },

  /**
   * _For internal use._ Reset the TOC data (executed at every page reload).
   */
  reset() {
    this.$element = this.isInSidebar() ? $('.sidebar-toc') : controller.$root.find('.toc');
    this.tocItems = null;
    this.floating = null;

    if (this.isInSidebar()) {
      this.$element
        .find('.cd-toc-commentCount, .cd-toc-newCommentList, .cd-toc-addedCommentList, .cd-toc-addedSection')
        .remove();
    }
  },

  /**
   * Get a TOC item by ID.
   *
   * @param {string} id
   * @returns {?object}
   */
  getItem(id) {
    if (!this.isPresent()) {
      return null;
    }

    if (!this.tocItems) {
      const links = [...this.$element.get(0).querySelectorAll('li > a')]
        .filter((link) => link.getAttribute('href') !== '#top-page');
      try {
        // It is executed first time before added (gray) sections are added to the TOC, so we use a
        // simple algorithm to obtain items.
        this.tocItems = links.map((a) => new TocItem(a));
      } catch {
        console.error('Couldn\'t find an element of a table of contents item.');
        this.tocItems = [];

        // Forcibly switch off the setting - we better not touch the TOC if something is broken
        // there.
        settings.set('modifyToc', false);
      }
    }

    return this.tocItems.find((item) => item.id === id) || null;
  },

  /**
   * _For internal use._ Highlight (bold) sections that the user is subscribed to.
   */
  highlightSubscriptions() {
    if (!settings.get('modifyToc') || !this.isPresent()) return;

    cd.sections
      .filter((section) => section.subscriptionState)
      .forEach((section) => {
        section.updateTocLink();
      });
  },

  /**
   * Generate a string containing new comment count to insert after the section headline in the
   * table of contents.
   *
   * @param {number} count
   * @param {number} unseenCount
   * @param {boolean} full
   * @param {Element} $target
   * @private
   */
  addCommentCountString(count, unseenCount, full, $target) {
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
  },

  /**
   * Add the number of comments to each section link.
   */
  addCommentCount() {
    if (!settings.get('modifyToc') || !this.isPresent()) return;

    cd.sections.forEach((section, i) => {
      const item = section.getTocItem();
      if (!item) return;

      const count = section.comments.length;
      if (!count) return;

      const unseenCount = section.comments.filter((comment) => comment.isSeen === false).length;
      const $target = this.isInSidebar() ? item.$text : item.$link;
      this.addCommentCountString(count, unseenCount, i === 0, $target);
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
    if (!settings.get('modifyToc') || !this.isPresent()) return;

    controller.saveRelativeScrollPosition({ saveTocHeight: true });

    this.$element.find('.cd-toc-addedSection').remove();

    /*
      Note the case when the page starts with sections of levels lower than the base level, like
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
    const $topUl = this.$element.children('ul');
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
        const levelClass = this.isInSidebar() ?
          `sidebar-toc-list-item sidebar-toc-level-${level}` :
          `toclevel-${level}`;
        li.className = `${levelClass} cd-toc-addedSection`;

        const a = document.createElement('a');
        a.href = `#${section.id}`;
        if (this.isInSidebar()) {
          a.className = 'sidebar-toc-link';
        }
        a.onclick = (e) => {
          e.preventDefault();
          controller.reload({
            sectionId: section.id,
            pushState: true,
          });
        };

        let number;
        if (currentLevelMatch) {
          number = currentLevelMatch.number;
        } else if (upperLevelMatch) {
          number = upperLevelMatch.number + '.1';
        } else {
          number = '1';
        }
        const numberSpan = document.createElement('span');
        const numberClass = this.isInSidebar() ? 'sidebar-toc-numb' : 'tocnumber';
        numberSpan.className = `${numberClass} cd-toc-hiddenTocNumber`;
        numberSpan.textContent = number;
        a.appendChild(numberSpan);

        if (this.isInSidebar()) {
          const textDiv = document.createElement('div');
          textDiv.className = 'sidebar-toc-text';
          textDiv.appendChild(document.createTextNode(headline));
          a.appendChild(textDiv);
          li.appendChild(a);
        } else {
          const textSpan = document.createElement('span');
          textSpan.className = 'toctext';
          textSpan.textContent = headline;
          a.appendChild(textSpan);
          li.appendChild(a);
        }

        if (currentLevelMatch) {
          currentLevelMatch.$element.after(li);
        } else if (upperLevelMatch) {
          const ul = document.createElement('ul');
          ul.className = 'sidebar-toc-list';
          ul.appendChild(li);
          upperLevelMatch.$element.append(ul);
        } else {
          if (this.isInSidebar()) {
            $topUl.children('#toc-mw-content-text').after(li);
          } else {
            $topUl.prepend(li);
          }
        }

        item = {
          // Doesn't seem to be currently used anywhere.
          headline,

          level,
          number,
          $element: $(li),
        };
      }

      currentTree[section.tocLevel - 1] = item;
      currentTree.splice(section.tocLevel);
    });

    controller.restoreRelativeScrollPosition(true);
  },

  /**
   * Get some elements of reference (a section link, an element to add a comment list after) in the
   * table of contents for a section, needed to work with it.
   *
   * @param {import('./commonTypedefs').SectionSkeletonLike[]} section Section.
   * @param {boolean} areCommentsRendered Whether the comments are rendered (visible on the page).
   * @returns {object}
   */
  getElementsForSection(section, areCommentsRendered) {
    // There could be a collision of hrefs between the existing section and not yet rendered
    // section, so we compose the selector carefully.
    let $sectionLink;
    let $target;
    if (areCommentsRendered) {
      $target = $sectionLink = section.getTocItem()?.$link;
    } else {
      if (section.match) {
        $sectionLink = section.match.getTocItem()?.$link;
      } else {
        const id = $.escapeSelector(section.id);
        $sectionLink = this.$element.find(`.cd-toc-addedSection a[href="#${id}"]`);
      }

      if ($sectionLink?.length) {
        // We need to place the not-rendered-comment list below the rendered-comment list.
        $target = $sectionLink;
        const $next = $sectionLink.next('.cd-toc-newCommentList');
        if ($next.length) {
          $target = $next;
        }
      }
    }

    return {
      target: $target?.get(0),
      $sectionLink,
    };
  },

  /**
   * Add a comment list (an `ul` element) to a section.
   *
   * @param {import('./commonTypedefs').CommentSkeletonLike[]} comments Comment list.
   * @param {Element} target Target element.
   * @param {boolean} areCommentsRendered Whether the comments are rendered (visible on the page).
   */
  addCommentList(comments, target, areCommentsRendered) {
    // Was 6 initially, then became 5, now 4.
    const itemLimit = 4;

    // jQuery is too expensive here given that very many comments may be added.
    const ul = document.createElement('ul');
    ul.className = areCommentsRendered ? 'cd-toc-newCommentList' : 'cd-toc-addedCommentList';

    let moreTooltipText = '';
    comments.forEach((comment, i) => {
      const parent = areCommentsRendered ? comment.getParent() : comment.parent;
      const names = parent?.author && comment.level > 1 ?
        cd.s('navpanel-newcomments-names', comment.author.getName(), parent.author.getName()) :
        comment.author.getName();
      const addAsItem = i < itemLimit - 1 || comments.length === itemLimit;

      let date;
      let nativeDate;
      if (comment.date) {
        nativeDate = formatDateNative(comment.date);
        date = addAsItem && settings.get('timestampFormat') !== 'default' ?
          formatDate(comment.date) :
          nativeDate;
      } else {
        date = cd.s('navpanel-newcomments-unknowndate');
      }

      const rtlMarkOrNot = cd.g.CONTENT_TEXT_DIRECTION === 'rtl' ? '\u200f' : '';
      const dateOrNot = settings.get('timestampFormat') === 'default' ? date : '';
      const text = names + rtlMarkOrNot + cd.mws('comma-separator') + dateOrNot;

      // If there are `itemLimit` comments or less, show all of them. If there are more, show
      // `itemLimit - 1` and "N more". (Because showing `itemLimit - 1` and then "1 more" is
      // stupid.)
      if (addAsItem) {
        const li = document.createElement('li');
        ul.appendChild(li);

        const a = document.createElement('a');
        a.href = `#${comment.dtId || comment.id}`;
        if (this.isInSidebar()) {
          a.className = 'sidebar-toc-link';
        }
        if (comment instanceof Comment) {
          a.onclick = (e) => {
            e.preventDefault();
            comment.scrollTo(false, true);
          };
        } else {
          a.onclick = (e) => {
            e.preventDefault();
            controller.reload({
              commentId: comment.id,
              pushState: true,
            });
          };
        }

        let timestampSpan;
        if (settings.get('timestampFormat') !== 'default') {
          timestampSpan = document.createElement('span');
          timestampSpan.textContent = date;
          timestampSpan.title = nativeDate;

          let callback;
          if (!areCommentsRendered) {
            callback = () => {
              navPanel.updateTimestampsInRefreshButtonTooltip();
            };
          }
          (new LiveTimestamp(timestampSpan, comment.date, false, callback)).init();
        }

        if (this.isInSidebar()) {
          const textDiv = document.createElement('div');
          textDiv.className = 'sidebar-toc-text cd-toc-commentLink';
          textDiv.textContent = text;
          if (timestampSpan) {
            textDiv.appendChild(timestampSpan);
          }
          a.appendChild(textDiv);
          li.appendChild(a);
        } else {
          const bulletSpan = document.createElement('span');
          const numberClass = this.isInSidebar() ? 'sidebar-toc-numb' : 'tocnumber';
          bulletSpan.className = `${numberClass} cd-toc-bullet`;
          bulletSpan.innerHTML = cd.sParse('bullet');
          li.appendChild(bulletSpan);

          const textSpan = document.createElement('span');
          textSpan.className = 'toctext';
          a.textContent = text;
          if (timestampSpan) {
            a.appendChild(timestampSpan);
          }
          textSpan.appendChild(a);
          li.appendChild(textSpan);
        }
      } else {
        // In a tooltip, always show the date in the default format — we won't be auto-updating
        // relative dates there due to low benefit.
        moreTooltipText += text + (dateOrNot ? '' : nativeDate) + '\n';
      }
    });

    if (comments.length > itemLimit) {
      const span = document.createElement('span');
      span.className = 'cd-toc-more';
      span.title = moreTooltipText.trim();
      span.textContent = cd.s('toc-more', comments.length - (itemLimit - 1));

      const li = document.createElement('li');
      li.appendChild(span);
      ul.appendChild(li);
    }

    target.parentNode.insertBefore(ul, target.nextSibling);
  },

  /**
   * _For internal use._ Add links to new comments (either already displayed or loaded in the
   * background) to the table of contents.
   *
   * @param {Map} commentsBySection
   */
  addNewComments(commentsBySection) {
    const firstComment = commentsBySection.values().next().value?.[0];
    if (!settings.get('modifyToc') || !this.isPresent() || !firstComment) return;

    const areCommentsRendered = firstComment instanceof Comment;
    const saveTocHeight = Boolean(
      controller.getBootProcess().isFirstRun() ||

      // When unrendered (in gray) comments are added
      !areCommentsRendered ||

      // When the comment or section is opened by a link from the TOC
      controller.getBootProcess().data('commentId') ||
      controller.getBootProcess().data('sectionId')
    );
    controller.saveRelativeScrollPosition({ saveTocHeight });

    this.$element.find('.cd-toc-addedCommentList').remove();

    commentsBySection.forEach((comments, section) => {
      if (!section) return;

      const { target, $sectionLink } = this.getElementsForSection(section, areCommentsRendered);

      // Should never be the case
      if (!target) return;

      if (!areCommentsRendered) {
        const count = section.comments.length;
        let unseenCount = comments.length;
        if (section.match) {
          unseenCount += section.match.comments
            .filter((comment) => comment.isSeen === false)
            .length;
          $sectionLink.children('.cd-toc-commentCount').remove();
        }
        const $target = this.isInSidebar() ? $sectionLink.children('sidebar-toc-text') : $sectionLink;
        this.addCommentCountString(count, unseenCount, section.index === 0, $target);
      }

      this.addCommentList(comments, target, areCommentsRendered);
    });

    controller.restoreRelativeScrollPosition(true);
  },

  /**
   * Is the table of contents located in the sidebar.
   *
   * @returns {boolean}
   */
  isInSidebar() {
    return cd.g.SKIN === 'vector-2022';
  },

  /**
   * Is the table of contents floating (it or its parent has a `float` CSS).
   *
   * This should be called after the HTML content has been laid out.
   *
   * @returns {boolean}
   */
  isFloating() {
    if (this.floating === null) {
      this.floating = Boolean(
        !this.isInSidebar() &&
        this.$element.closest($(controller.getFloatingElements())).length
      );
    }

    return this.floating;
  },

  /**
   * Is the table of contents present on the page.
   *
   * @returns {boolean}
   */
  isPresent() {
    return Boolean(this.$element.length);
  },

  /**
   * Is the classic table of contents (not the sidebar) present on the page.
   *
   * @returns {boolean}
   */
  isPresentClassic() {
    return this.isPresent() && !this.isInSidebar();
  },

  /**
   * Get the bottom offset of the table of contents.
   *
   * @returns {number}
   */
  getBottomOffset() {
    return this.$element.offset().top + this.$element.outerHeight();
  },
};

export default toc;
