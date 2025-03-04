/**
 * Table of contents singleton.
 *
 * @module toc
 */

import CdError from './CdError';
import Comment from './Comment';
import LiveTimestamp from './LiveTimestamp';
import SectionSkeleton from './SectionSkeleton';
import bootController from './bootController';
import cd from './cd';
import commentRegistry from './commentRegistry';
import sectionRegistry from './sectionRegistry';
import settings from './settings';
import talkPageController from './talkPageController';
import updateChecker from './updateChecker';
import { isElement, isText } from './utils-general';
import { formatDate, formatDateNative } from './utils-timestamp';
import { createSvg, getLinkedAnchor } from './utils-window';
import visits from './visits';

export default {
  /**
   * _For internal use._ Initialize the TOC. (Executed only once.)
   *
   * @param {import('./Subscriptions').default} subscriptions
   */
  init(subscriptions) {
    mw.hook('wikipage.tableOfContents.vector').add(() => {
      this.resolveUpdateTocSectionsPromise?.();
    });

    this.canBeModified = settings.get('modifyToc');

    visits
      .on('process', () => {
        // If all the comments on the page are unseen, don't add them to the TOC - the user would
        // definitely prefer to read the names of the topics easily. (But still consider them new -
        // otherwise the user can be confused, especially if there are few topics on an unpopular
        // page.)
        if (
          commentRegistry.query((c) => c.isSeen === false || !c.date).length !==
          commentRegistry.getCount()
        ) {
          this.addNewComments(
            Comment.groupBySection(commentRegistry.query((c) => c.isSeen === false)),
            bootController.getBootProcess()
          );
        }
        this.addCommentCount();
      });
    subscriptions
      .on('process', this.markSubscriptions.bind(this));
    talkPageController
      .on('reboot', this.maybeHide.bind(this));
    updateChecker
      .on('commentsUpdate', ({ bySection }) => {
        this.addNewComments(bySection);
      })
      .on('sectionsUpdate', this.addNewSections.bind(this));
  },

  /**
   * Hide the TOC if the relevant cookie is set. This method duplicates
   * {@link https://phabricator.wikimedia.org/source/mediawiki/browse/master/resources/src/mediawiki.toc/toc.js the native MediaWiki function}
   * and exists because we may need to hide the TOC earlier than the native method does it.
   *
   * @private
   */
  maybeHide() {
    if (this.isInSidebar() || !this.isPresent()) return;

    if (mw.cookie.get('hidetoc') === '1') {
      this.$element.find('.toctogglecheckbox').prop('checked', true);
    }
  },

  /**
   * _For internal use._ Setup the TOC data and, for sidebar TOC, update its content. (Executed at
   * every page load.)
   *
   * @param {object[]} [sections] TOC sections object.
   * @param {boolean} [hideToc] Whether the TOC should be hidden.
   */
  setup(sections, hideToc) {
    this.$element = this.isInSidebar() ? $('.vector-toc') : bootController.$root.find('.toc');
    this.items = null;
    this.floating = null;
    this.visitsPromise = new Promise((resolve) => {
      visits.once('process', resolve);
    });

    if (this.isInSidebar() && sections) {
      // Update the section list of the TOC
      mw.hook('wikipage.tableOfContents').fire(hideToc ? [] : sections);

      this.updateTocSectionsPromise = new Promise((resolve) => {
        this.resolveUpdateTocSectionsPromise = resolve;
      });
    }
  },

  /**
   * Get a TOC item by ID.
   *
   * @param {string} id
   * @returns {?TocItem}
   */
  getItem(id) {
    if (!this.isPresent()) {
      return null;
    }

    if (!this.items) {
      const links = [...this.$element[0].querySelectorAll('li > a')].filter(
        (link) => link.getAttribute('href') !== '#'
      );
      try {
        // It is executed first time before added (gray) sections are added to the TOC, so we use a
        // simple algorithm to obtain items.
        this.items = links.map((a) => new TocItem(a, this));
      } catch (error) {
        console.error("Couldn't find an element of a table of contents item.", ...error);
        this.items = [];

        // Override the setting value - we better not touch the TOC if something is broken there.
        this.canBeModified = false;
      }
    }

    return this.items.find((item) => item.id === id) || null;
  },

  /**
   * Mark sections that the user is subscribed to.
   *
   * @private
   */
  async markSubscriptions() {
    if (!this.isPresent()) return;

    // Ensure the bell icons are added after the TOC is updated and the comment counts are added in
    // visits#process().
    await Promise.all([this.visitsPromise, this.updateTocSectionsPromise]);

    sectionRegistry
      .query((section) => section.subscriptionState || this.isInSidebar())
      .forEach((section) => {
        section.updateTocLink();
      });
  },

  /**
   * Add the number of comments to each section link.
   */
  async addCommentCount() {
    // We add the comment count even if the "Modify TOC" setting is off.
    if (!this.isPresent()) return;

    await this.updateTocSectionsPromise;

    let usedFullForm = false;
    sectionRegistry.getAll().forEach((section) => {
      const item = section.getTocItem();
      if (!item) return;

      const count = section.comments.length;
      if (!count) return;

      const beforeSpan = document.createElement('span');
      beforeSpan.className = 'cd-toc-commentCount-before';

      const span = document.createElement('span');
      span.className = 'cd-toc-commentCount';

      const bdi = document.createElement('bdi');
      const unseenCount = section.newComments?.length;
      if (unseenCount) {
        bdi.textContent = cd.s(
          usedFullForm ? 'toc-commentcount-new' : 'toc-commentcount-new-full',
          count,
          unseenCount
        );
      } else {
        bdi.textContent = usedFullForm ? String(count) : cd.s('toc-commentcount-full', count);
      }

      span.appendChild(bdi);
      item.$text.append(beforeSpan, span);

      usedFullForm = true;
    });

    if (cd.g.isDtVisualEnhancementsEnabled) {
      this.$element.find('.ext-discussiontools-init-sidebar-meta').remove();
    }
  },

  /**
   * Handle a click on an added section link.
   *
   * @param {MouseEvent|KeyboardEvent} event
   * @private
   */
  handleSectionClick(event) {
    event.preventDefault();
    bootController.reboot({
      sectionId:
        getLinkedAnchor(/** @type {HTMLAnchorElement} */ (event.currentTarget)) || undefined,
      pushState: true,
    });
  },

  /**
   * Add a collapse/expand toggle to a 2-level section.
   *
   * @param {Element} ul
   * @param {object} upperLevelMatch
   * @param {string[]} newSectionTocIds
   * @private
   */
  addToggleToSidebarToc(ul, upperLevelMatch, newSectionTocIds) {
    // Don't bother with ARIA attributes since chances that somebody will interact with
    // collapsed subsections with their help tend to zero, I believe, although this may
    // change.
    const button = document.createElement('button');
    button.className =
      'cdx-button cdx-button--weight-quiet cdx-button--icon-only vector-toc-toggle';
    button.setAttribute('ariaExpanded', 'true');
    button.setAttribute('ariaControls', ul.id);

    const span = document.createElement('span');
    span.className = 'vector-icon vector-icon--x-small mw-ui-icon-wikimedia-expand';
    button.appendChild(span);

    upperLevelMatch.$element.append(button);

    // Expand the section.
    button.click();

    // If this section was previously added by us, the TOC will remember its state and try to
    // switch it on click, so we need to click again to get it back.
    if (newSectionTocIds.includes(upperLevelMatch.$element.attr('id'))) {
      button.click();
    }
  },

  /**
   * Add a new, not yet rendered section (loaded in the background) section to the table of
   * contents.
   *
   * @param {import('./updateChecker').SectionWorkerMatched} section
   * @param {TocItemCut[]} currentTree
   * @param {JQuery} $topUl
   * @param {string[]} newSectionTocIds
   * @private
   */
  addNewSection(section, currentTree, $topUl, newSectionTocIds) {
    /**
     * @typedef {Pick<TocItem, 'level' | 'number' | '$element'>} TocItemCut
     */

    let item = /** @type {TocItemCut|undefined} */ (section.match?.getTocItem());
    const level = /** @type {number} */ (section.tocLevel);
    if (!item) {
      const currentLevelMatch = currentTree[level - 1];
      const upperLevelMatch = currentLevelMatch ? undefined : currentTree[currentTree.length - 1];

      const li = document.createElement('li');
      li.id = `toc-${section.id}`;
      const levelClass = this.isInSidebar()
        ? `vector-toc-list-item vector-toc-level-${level}`
        : `toclevel-${level}`;
      li.className = `${levelClass} cd-toc-addedSection`;

      const a = document.createElement('a');
      a.href = `#${section.id}`;
      if (this.isInSidebar()) {
        a.className = 'vector-toc-link cd-toc-link-sidebar';
      }
      a.onclick = this.handleSectionClick.bind(this);

      let number;
      if (currentLevelMatch) {
        number = currentLevelMatch.number;
      } else if (upperLevelMatch) {
        number = upperLevelMatch.number + '.1';
      } else {
        number = '1';
      }
      const numberSpan = document.createElement('span');
      const numberClass = this.isInSidebar() ? 'vector-toc-numb' : 'tocnumber';
      numberSpan.className = `${numberClass} cd-toc-hiddenTocNumber`;
      numberSpan.textContent = number;
      a.appendChild(numberSpan);

      if (this.isInSidebar()) {
        const textDiv = document.createElement('div');
        textDiv.className = 'vector-toc-text';
        textDiv.appendChild(document.createTextNode(section.headline));
        a.appendChild(textDiv);
        li.appendChild(a);
      } else {
        const textSpan = document.createElement('span');
        textSpan.className = 'toctext';
        textSpan.textContent = section.headline;
        a.appendChild(textSpan);
        li.appendChild(a);
      }

      if (currentLevelMatch) {
        currentLevelMatch.$element.after(li);
      } else if (upperLevelMatch) {
        const ul = document.createElement('ul');
        ul.id = `toc-${section.id}-sublist`;
        ul.className = 'vector-toc-list';
        ul.appendChild(li);

        if (
          this.isInSidebar() &&
          level === 2 &&
          !upperLevelMatch.$element.find('.vector-toc-toggle').length
        ) {
          // Ideally, it should also be removed when an added subsection is removed, but really not
          // important.
          this.addToggleToSidebarToc(ul, upperLevelMatch, newSectionTocIds);
        }

        upperLevelMatch.$element.append(ul);
      } else {
        if (this.isInSidebar()) {
          $topUl.children('#toc-mw-content-text').after(li);
        } else {
          $topUl.prepend(li);
        }
      }

      item = {
        level,
        number,
        $element: $(li),
      };
    }

    currentTree[level - 1] = item;
    currentTree.splice(level);
  },

  /**
   * Add links to new, not yet rendered sections (loaded in the background) to the table of
   * contents.
   *
   * Note that this method may also add the `match` property to the section elements containing a
   * matched {@link Section} object.
   *
   * @param {import('./updateChecker').SectionWorkerMatched[]} sections All sections present on the
   *   new revision of the page.
   * @private
   */
  addNewSections(sections) {
    if (!this.canBeModified || !this.isPresent()) return;

    if (!this.isInSidebar()) {
      talkPageController.saveRelativeScrollPosition(true);
    }

    const $addedSections = this.$element.find('.cd-toc-addedSection');
    const newSectionTocIds = this.isInSidebar()
      ? $addedSections
          .filter('.vector-toc-level-1')
          .get()
          .map((/** @type {HTMLElement} */ sectionElement) => sectionElement.id)
      : undefined;
    $addedSections.remove();

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
    sections.forEach((section) => {
      // Update `parent` from SectionWorker to SectionWorkerMatched type
      section.parent = SectionSkeleton.prototype.getParent.call(section, true, sections);
    });
    sections.forEach((section) => {
      section.tocLevel = section.parent
        ? /** @type {number} */ (
            /** @type {import('./updateChecker').SectionWorkerMatched} */ (section.parent).tocLevel
          ) + 1
        : 1;
    });

    const currentTree = [];
    const $topUl = this.$element.children('ul');
    sections.forEach((section) => {
      this.addNewSection(section, currentTree, $topUl, newSectionTocIds);
    });

    if (!this.isInSidebar()) {
      talkPageController.restoreRelativeScrollPosition(true);
    }
  },

  /**
   * Get the element to add a comment list after for a section.
   *
   * @param {import('./Section').default | import('./updateChecker').SectionWorkerMatched} section Section.
   * @returns {?object}
   * @private
   */
  getTargetElementForSection(section) {
    // There could be a collision of hrefs between the existing section and not yet rendered
    // section, so we compose the selector carefully.
    let $sectionLink;
    let $target;
    if ('getTocItem' in section) {
      $target = $sectionLink = section.getTocItem()?.$link;
    } else {
      if (section.match) {
        $sectionLink = section.match.getTocItem()?.$link;
      } else {
        const id = CSS.escape(section.id);
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

    return $target?.[0] || null;
  },

  /**
   * Handle a click on a comment link.
   *
   * @param {KeyboardEvent|MouseEvent} event
   * @private
   */
  handleCommentClick(event) {
    event.preventDefault();
    const id = getLinkedAnchor(/** @type {HTMLAnchorElement} */ (event.currentTarget));
    if (!id) {
      throw new CdError();
    }

    const comment = commentRegistry.getByAnyId(id);
    if (comment) {
      comment.scrollTo({
        smooth: false,
        pushState: true,
      });
    } else {
      bootController.reboot({
        commentIds: [id],
        pushState: true,
      });
    }
  },

  /**
   * Add a comment list (an `ul` element) to a section.
   *
   * @template {boolean} Rendered
   * @param {Rendered extends true ? AtLeastOne<import('./Comment').default> : AtLeastOne<import('./updateChecker').CommentWorkerMatched>} comments Comment list.
   * @param {Element} target Target element.
   * @private
   */
  addCommentList(comments, target) {
    // Should never be the case
    if (!target) return;

    // Was 6 initially, then became 5, now 4.
    const itemLimit = 4;

    // jQuery is too expensive here given that very many comments may be added.
    const ul = document.createElement('ul');

    // Check for the Section type without importing Section
    ul.className = 'getParent' in comments[0] ? 'cd-toc-newCommentList' : 'cd-toc-addedCommentList';

    let moreTooltipText = '';
    comments.forEach(
      (
        /** @type {import('./updateChecker').CommentWorkerMatched|Comment} */ comment,
        /** @type {number} */ i
      ) => {
        const parent = 'getParent' in comment ? comment.getParent() : comment.parent;
        const names =
          parent?.author && comment.level > 1
            ? cd.s('navpanel-newcomments-names', comment.author.getName(), parent.author.getName())
            : comment.author.getName();
        const addAsItem = i < itemLimit - 1 || comments.length === itemLimit;

        let date;
        let nativeDate;
        if (comment.date) {
          nativeDate = formatDateNative(comment.date);
          date =
            addAsItem && settings.get('timestampFormat') !== 'default'
              ? formatDate(comment.date)
              : nativeDate;
        } else {
          date = cd.s('navpanel-newcomments-unknowndate');
        }

        const rtlMarkOrNot = cd.g.contentDirection === 'rtl' ? '\u200f' : '';
        const dateOrNot = settings.get('timestampFormat') === 'default' ? date : '';
        const text = names + rtlMarkOrNot + cd.mws('comma-separator') + dateOrNot;

        // If there are itemLimit comments or less, show all of them. If there are more, show
        // `itemLimit - 1` and "N more". (Because showing `itemLimit - 1` and then "1 more" is
        // stupid.)
        if (addAsItem) {
          const li = document.createElement('li');
          ul.appendChild(li);

          const a = document.createElement('a');
          a.href = `#${'dtId' in comment ? comment.dtId : comment.id}`;
          if (this.isInSidebar()) {
            a.className = 'vector-toc-link cd-toc-link-sidebar';
          }
          a.onclick = this.handleCommentClick.bind(this);

          let timestampSpan;
          if (settings.get('timestampFormat') !== 'default' && comment.date) {
            timestampSpan = document.createElement('span');
            timestampSpan.textContent = date;
            if (nativeDate) {
              timestampSpan.title = nativeDate;
            }
            new LiveTimestamp(timestampSpan, comment.date, false).init();
          }

          if (this.isInSidebar()) {
            const textDiv = document.createElement('div');
            textDiv.className = 'vector-toc-text cd-toc-commentLinkText-sidebar';
            textDiv.textContent = text;
            if (timestampSpan) {
              textDiv.appendChild(timestampSpan);
            }
            a.appendChild(textDiv);
            li.appendChild(a);
          } else {
            const bulletSpan = document.createElement('span');
            const numberClass = this.isInSidebar() ? 'vector-toc-numb' : 'tocnumber';
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
      }
    );

    if (comments.length > itemLimit) {
      const span = document.createElement('span');
      span.className = 'cd-toc-more';
      span.title = moreTooltipText.trim();
      span.textContent = cd.s('toc-more', comments.length - (itemLimit - 1));

      const li = document.createElement('li');
      li.appendChild(span);
      ul.appendChild(li);
    }

    /** @type {HTMLElement} */ (target.parentElement).insertBefore(ul, target.nextSibling);
  },

  /**
   * Add links to new comments (either already displayed or loaded in the background) to the table
   * of contents.
   *
   * @param {import('./updateChecker').AddedComments['bySection']} commentsBySection
   * @param {import('./BootProcess').default} [bootProcess]
   * @private
   */
  async addNewComments(commentsBySection, bootProcess) {
    if (!this.canBeModified || !this.isPresent()) return;

    await this.updateTocSectionsPromise;
    this.$element.find('.cd-toc-addedCommentList').remove();
    if (!this.isInSidebar()) {
      talkPageController.saveRelativeScrollPosition(
        Boolean(
          // When unrendered (in gray) comments are added. (Boot process is also not specified at
          // those times.)
          !bootProcess ||
            bootProcess.isFirstRun() ||
            // When the comment or section is opened by a link from the TOC
            bootProcess.passedData.commentIds ||
            bootProcess.passedData.sectionId
        )
      );
    }

    commentsBySection.forEach((comments, section) => {
      if (!section) return;

      this.addCommentList(comments, this.getTargetElementForSection(section));
    });

    if (!this.isInSidebar()) {
      talkPageController.restoreRelativeScrollPosition(true);
    }
  },

  /**
   * Is the table of contents located in the sidebar.
   *
   * @returns {boolean}
   * @private
   */
  isInSidebar() {
    return cd.g.skin === 'vector-2022';
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
        !this.isInSidebar() && this.$element.closest($(talkPageController.getFloatingElements())).length
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
   * Get the bottom offset of the table of contents.
   *
   * @returns {number}
   */
  getBottomOffset() {
    return this.$element.offset().top + this.$element.outerHeight();
  },
};

/**
 * Class representing an item of the table of contents.
 */
export class TocItem {
  /**
   * Section link jQuery element.
   *
   * @type {JQuery}
   */
  $link;

  /**
   * Section text jQuery element (including the title, number, and other possible additions).
   *
   * @type {JQuery}
   */
  $text;

  /**
   * Create a table of contents item object.
   *
   * @param {object} a
   * @param {object} toc
   * @throws {Array.<string|Element>}
   */
  constructor(a, toc) {
    this.toc = toc;
    this.canBeModified = this.toc.canBeModified;

    const textSpan = a.querySelector(this.toc.isInSidebar() ? '.vector-toc-text' : '.toctext');
    if (!textSpan) {
      throw ['Couldn\'t find text for a link', a];
    }

    const id = a.getAttribute('href').slice(1);
    const li = a.parentNode;
    const level = Number(
      li.className.match(this.toc.isInSidebar() ? /vector-toc-level-(\d+)/ : /\btoclevel-(\d+)/)[1]
    );
    const numberSpan = a.querySelector(this.toc.isInSidebar() ? '.vector-toc-numb' : '.tocnumber');
    let number;
    if (numberSpan) {
      number = numberSpan.textContent;
    } else {
      console.error(['Couldn\'t find a number for a link', a]);
      number = '?';
    }

    this.id = id;
    this.level = level;
    this.number = number;
    this.$element = $(li);
    this.$link = $(a);
    this.$text = $(textSpan);
  }

  /**
   * _For internal use._ Generate HTML to use it in the TOC for the section. Only a limited number
   * of HTML elements is allowed in TOC.
   *
   * @param {JQuery} $headline
   */
  replaceText($headline) {
    if (!this.canBeModified) return;

    const titleNodes = /** @type {Array<Text|HTMLElement>} */ (this.$text
      .contents()
      .filter((_, node) => (
        isText(node)
        || (isElement(node) && ![...node.classList].some((name) => name.match(/^(cd-|vector-)/)))
      ))
      .get());
    titleNodes[titleNodes.length - 1].after(
      ...$headline
        .clone()
        .find('*')
          .each((_, el) => {
            if (['B', 'EM', 'I', 'S', 'STRIKE', 'STRONG', 'SUB', 'SUP'].includes(el.tagName)) {
              [...el.attributes].forEach((attr) => {
                el.removeAttribute(attr.name);
              });
            } else {
              [...el.childNodes].forEach((child) => {
                el.before(child);
              });
              el.remove();
            }
          })
        .end()
        .contents()
        .get()
    );
    titleNodes.forEach((node) => {
      node.remove();
    });
  }

  /**
   * Add/remove a subscription mark to the section's TOC link according to its subscription state
   * and update the `title` attribute.
   *
   * @param {?boolean} subscriptionState
   */
  updateSubscriptionState(subscriptionState) {
    if (!this.canBeModified) return;

    if (subscriptionState) {
      this.$link
        .find(this.toc.isInSidebar() ? '.vector-toc-text' : '.toctext')
        .append(
          $('<span>').addClass('cd-toc-subscriptionIcon-before'),
          $('<span>')
            .addClass('cd-toc-subscriptionIcon cd-icon')
            .append(
              createSvg(14, 14, 20, 20).html(
                `<path d="M16 7a5.38 5.38 0 0 0-4.46-4.85C11.6 1.46 11.53 0 10 0S8.4 1.46 8.46 2.15A5.38 5.38 0 0 0 4 7v6l-2 2v1h16v-1l-2-2zm-6 13a3 3 0 0 0 3-3H7a3 3 0 0 0 3 3z" />`
              )
            )
            .attr('title', cd.s('toc-watched'))
        );
    } else {
      this.$link
        .removeAttr('title')
        .find('.cd-toc-subscriptionIcon, .cd-toc-subscriptionIcon-before')
        .remove();
    }
  }
}
