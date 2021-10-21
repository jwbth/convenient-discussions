import Button from './Button';
import CdError from './CdError';
import CommentForm from './CommentForm';
import Page from './Page';
import SectionMenuButton from './SectionMenuButton';
import SectionSkeleton from './SectionSkeleton';
import SectionStatic from './SectionStatic';
import cd from './cd';
import toc from './toc';
import {
  calculateWordOverlap,
  dealWithLoadingBug,
  defined,
  focusInput,
  getUrlWithAnchor,
  handleApiReject,
  wrap,
} from './util';
import {
  endWithTwoNewlines,
  extractSignatures,
  hideDistractingCode,
  normalizeCode,
  removeWikiMarkup,
} from './wikitext';
import { showCopyLinkDialog } from './modal.js';

let elementPrototypes;

/**
 * Class representing a section.
 *
 * @augments SectionSkeleton
 */
class Section extends SectionSkeleton {
  /**
   * Create a section object.
   *
   * @param {Parser} parser
   * @param {Element} heading
   * @param {object[]} targets
   * @param {Promise} watchedSectionsRequest
   * @throws {CdError}
   */
  constructor(parser, heading, targets, watchedSectionsRequest) {
    super(parser, heading, targets);

    elementPrototypes = cd.g.SECTION_ELEMENT_PROTOTYPES;

    this.editSectionElement = this.headingElement.querySelector('.mw-editsection');
    if (this.editSectionElement) {
      this.closingBracketElement = this.editSectionElement
        .getElementsByClassName('mw-editsection-bracket')[1];
    }

    /**
     * Automatically updated sequental number of the section.
     *
     * @type {?number}
     */
    this.liveSectionNumber = this.sectionNumber;

    /**
     * Revision ID of {@link Section#liveSectionNumber}.
     *
     * @type {number}
     */
    this.liveSectionNumberRevisionId = mw.config.get('wgRevisionId');

    /**
     * Wiki page that has the source code of the section (may be different from the current page if
     * the section is transcluded from another page). This property may be wrong on old version
     * pages where there are no edit section links.
     *
     * @type {Page}
     */
    this.sourcePage = this.sourcePageName && this.sourcePageName !== cd.page.name ?
      new Page(this.sourcePageName) :
      cd.page;

    // Transclusions of templates that in turn translude content, like here:
    // https://ru.wikipedia.org/wiki/Project:Выборы_арбитров/Лето_2021/Вопросы/Кандидатские_заявления
    const isTranscludedFromTemplate = this.sourcePageName && this.sourcePage.namespaceId === 10;

    /**
     * Is the section actionable (is in a closed discussion or on an old version page).
     *
     * @type {boolean}
     */
    this.isActionable = (
      cd.state.isPageActive &&
      !cd.g.closedDiscussionElements.some((el) => el.contains(this.headingElement)) &&
      !isTranscludedFromTemplate
    );

    if (isTranscludedFromTemplate) {
      this.comments.forEach((comment) => {
        comment.isActionable = false;
      });
    }

    delete this.sourcePageName;

    this.extendSectionMenu(watchedSectionsRequest);

    /**
     * Section headline element as a jQuery object.
     *
     * @type {external:jQuery}
     */
    this.$headline = $(this.headlineElement);

    /**
     * Section heading as a jQuery element.
     *
     * @type {external:jQuery}
     */
    this.$heading = $(this.headingElement);
  }

  /**
   * Add an item to the section menu (to the right from the section headline).
   *
   * @param {object} item
   * @param {string} item.name Link name, reflected in the class name.
   * @param {string} item.label Item label.
   * @param {string} [item.href] Value of the item href attribute.
   * @param {string} [item.tooltip] Tooltip text.
   * @param {Function} [item.action] Function to execute on click.
   * @param {boolean} [item.visible=true] Should the item be visible.
   */
  addMenuItem({ name, label, href, tooltip, action, visible = true }) {
    if (!this.closingBracketElement) return;

    this.menu[name] = new SectionMenuButton({
      name,
      label,
      href,
      tooltip,
      visible,
      classes: ['cd-section-menu-button'],
      action,
    });
    this.editSectionElement.insertBefore(
      this.menu[name].wrapperElement,
      this.closingBracketElement
    );
  }

  /**
   * _For internal use._ Add a {@link Section#replyButton "Reply in section" button} to the end of
   * the first chunk of the section.
   */
  addReplyButton() {
    const element = elementPrototypes.replyButton.cloneNode(true);
    const button = new Button({
      element,
      action: () => {
        this.reply();
      },
    });

    const lastElement = this.lastElementInFirstChunk;

    // https://ru.wikipedia.org/wiki/Project:Запросы_к_администраторам/Быстрые
    if (['TR', 'TD', 'TH'].includes(lastElement.tagName)) return;

    // Sections may have "#" in the code as a placeholder for a vote. In this case, we must create
    // the comment form in the <ol> tag.
    const isVotePlaceholder = (
      lastElement.tagName === 'OL' &&
      lastElement.childElementCount === 1 &&
      lastElement.children[0].classList.contains('mw-empty-elt')
    );

    let tag;
    let createList = false;
    const tagName = lastElement.tagName;
    if (lastElement.classList.contains('cd-commentLevel') || isVotePlaceholder) {
      if (
        tagName === 'UL' ||
        (
          tagName === 'OL' &&

          // Check if this is indeed a numbered list with replies as list items, not a numbered list
          // as part of the user's comment that has their signature technically inside the last
          // item.
          (
            isVotePlaceholder ||
            lastElement.querySelectorAll('ol > li').length === 1 ||
            lastElement.querySelectorAll('ol > li > .cd-signature').length > 1
          )
        )
      ) {
        tag = 'li';
      } else if (tagName === 'DL') {
        tag = 'dd';
      } else {
        tag = 'li';
        createList = true;
      }
    } else {
      tag = 'dd';
      if (!isVotePlaceholder) {
        createList = true;
      }
    }

    const wrapper = document.createElement(tag);
    wrapper.className = 'cd-replyWrapper';
    wrapper.appendChild(button.element);

    // The container contains the wrapper that contains the element ^_^
    let container;
    if (createList) {
      container = document.createElement('dl');
      container.className = 'cd-commentLevel cd-commentLevel-1 cd-section-button-container';
      lastElement.parentNode.insertBefore(container, lastElement.nextElementSibling);
    } else {
      container = lastElement;
      container.classList.add('cd-section-button-container');
    }
    container.appendChild(wrapper);

    /**
     * Reply button on the bottom of the first chunk of the section.
     *
     * @type {Button|undefined}
     */
    this.replyButton = button;

    /**
     * Reply (button) wrapper, an item element.
     *
     * @type {external:jQuery|undefined}
     */
    this.$replyWrapper = $(wrapper);

    /**
     * Reply (button) container, a list element. It is wrapped around the
     * {@link Section#$replyWrapper reply button wrapper}, but can have other elements (and
     * comments) too.
     *
     * @type {external:jQuery|undefined}
     */
    this.$replyContainer = $(container);
  }

  /**
   * _For internal use._ Add an {@link Section#addSubsectionButton "Add subsection" button} that
   * appears when hovering over a {@link Section#replyButton "Reply in section" button}.
   */
  addAddSubsectionButton() {
    if (this.level !== 2) return;

    const element = elementPrototypes.addSubsectionButton.cloneNode(true);
    const button = new Button({
      element,
      labelElement: element.querySelector('.oo-ui-labelElement-label'),
      label: cd.s('section-addsubsection-to', this.headline),
      action: () => {
        this.addSubsection();
      },
    });

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'cd-section-button-container cd-addSubsectionButton-container';
    buttonContainer.style.display = 'none';
    buttonContainer.appendChild(button.element);

    this.lastElement.parentNode.insertBefore(buttonContainer, this.lastElement.nextElementSibling);

    let hideAddSubsectionButtonTimeout;
    const deferButtonHide = () => {
      if (!hideAddSubsectionButtonTimeout) {
        hideAddSubsectionButtonTimeout = setTimeout(() => {
          this.$addSubsectionButtonContainer.hide();
        }, 1000);
      }
    };

    button.buttonElement.firstChild.onmouseenter = () => {
      clearTimeout(hideAddSubsectionButtonTimeout);
      hideAddSubsectionButtonTimeout = null;
    };
    button.buttonElement.firstChild.onmouseleave = () => {
      deferButtonHide();
    };

    this.replyButtonHoverHandler = () => {
      if (this.addSubsectionForm) return;

      clearTimeout(hideAddSubsectionButtonTimeout);
      hideAddSubsectionButtonTimeout = null;

      if (!this.showAddSubsectionButtonTimeout) {
        this.showAddSubsectionButtonTimeout = setTimeout(() => {
          this.$addSubsectionButtonContainer.show();
        }, 1000);
      }
    };

    this.replyButtonUnhoverHandler = () => {
      if (this.addSubsectionForm) return;

      clearTimeout(this.showAddSubsectionButtonTimeout);
      this.showAddSubsectionButtonTimeout = null;

      deferButtonHide();
    };

    /**
     * Add subsection button in the end of the section.
     *
     * @type {Button|undefined}
     */
    this.addSubsectionButton = button;

    /**
     * Add subsection button container.
     *
     * @type {external:jQuery|undefined}
     */
    this.$addSubsectionButtonContainer = $(buttonContainer);
  }

  /**
   * Add section menu items.
   *
   * @param {Promise} [watchedSectionsRequest]
   * @fires sectionMenuExtended
   * @private
   */
  extendSectionMenu(watchedSectionsRequest) {
    if (!this.closingBracketElement) return;

    /**
     * Section menu object.
     *
     * @type {object|undefined}
     */
    this.menu = {};

    if (this.isActionable) {
      if (
        this.comments.length &&
        this.comments[0].isOpeningSection &&
        this.comments[0].openingSectionOfLevel === this.level &&
        (this.comments[0].isOwn || cd.settings.allowEditOthersComments) &&
        this.comments[0].isActionable
      ) {
        this.addMenuItem({
          name: 'editOpeningComment',
          label: cd.s('sm-editopeningcomment'),
          tooltip: cd.s('sm-editopeningcomment-tooltip'),
          action: () => {
            this.comments[0].edit();
          },
        });
      }

      if (this.level >= 2 && this.level !== 6) {
        this.addMenuItem({
          name: 'addSubsection',
          label: cd.s('sm-addsubsection'),
          tooltip: cd.s('sm-addsubsection-tooltip'),
          action: () => {
            this.addSubsection();
          },
        });
      }

      if (this.level === 2) {
        this.addMenuItem({
          name: 'moveSection',
          label: cd.s('sm-move'),
          tooltip: cd.s('sm-move-tooltip'),
          action: () => {
            this.move();
          },
        });
      }
    }

    const addCopyLinkMenuItem = () => {
      if (this.headline) {
        // We put this instruction here to make it always appear after the "watch" item.
        this.addMenuItem({
          name: 'copyLink',
          label: cd.s('sm-copylink'),

          // We need the event object to be passed to the function.
          action: this.copyLink.bind(this),

          tooltip: cd.s('sm-copylink-tooltip'),
          href: `${cd.page.getUrl()}#${this.anchor}`,
        });
      }

      /**
       * Section menu has been extneded.
       *
       * @event sectionMenuExtended
       * @param {Section} section
       * @param {object} cd {@link convenientDiscussions} object.
       */
      mw.hook('convenientDiscussions.sectionMenuExtended').fire(this);
    }

    if (this.isActionable) {
      watchedSectionsRequest
        .then(
          () => {
            this.isWatched = cd.g.currentPageWatchedSections.includes(this.headline);
            this.addMenuItem({
              name: 'unwatch',
              label: cd.s('sm-unwatch'),
              tooltip: cd.s('sm-unwatch-tooltip'),
              action: () => {
                this.unwatch();
              },
              visible: this.isWatched,
            });
            this.addMenuItem({
              name: 'watch',
              label: cd.s('sm-watch'),
              tooltip: cd.s('sm-watch-tooltip'),
              action: () => {
                this.watch();
              },
              visible: !this.isWatched,
            });
          },
          () => {}
        )
        .then(addCopyLinkMenuItem, addCopyLinkMenuItem);
    } else {
      addCopyLinkMenuItem();
    }
  }

  /**
   * Create an {@link Section#replyForm add reply form}.
   *
   * @param {object|CommentForm} dataToRestore
   */
  reply(dataToRestore) {
    // Check for existence in case replying is called from a script of some kind (there is no button
    // to call it from CD).
    if (!this.replyForm) {
      /**
       * A reply form related to the section.
       *
       * @type {CommentForm|undefined}
       */
      this.replyForm = dataToRestore instanceof CommentForm ?
        dataToRestore :
        new CommentForm({
          mode: 'replyInSection',
          target: this,
          dataToRestore,
        });
    }

    const baseSection = this.getBase();
    if (baseSection.$addSubsectionButtonContainer) {
      baseSection.$addSubsectionButtonContainer.hide();
      clearTimeout(baseSection.showAddSubsectionButtonTimeout);
      baseSection.showAddSubsectionButtonTimeout = null;
    }
  }

  /**
   * Create an {@link Section#addSubsectionForm add subsection form} form or focus an existing one.
   *
   * @param {object|CommentForm} dataToRestore
   */
  addSubsection(dataToRestore) {
    if (!this.menu.addSubsection) {
      throw new CdError();
    }

    if (this.addSubsectionForm) {
      this.addSubsectionForm.$element.cdScrollIntoView('center');
      focusInput(this.addSubsectionForm.headlineInput);
    } else {
      /**
       * Add subsection form related to the section.
       *
       * @type {CommentForm|undefined}
       */
      this.addSubsectionForm = dataToRestore instanceof CommentForm ?
        dataToRestore :
        new CommentForm({
          mode: 'addSubsection',
          target: this,
          dataToRestore,
        });
    }
  }

  /**
   * Show a move section dialog.
   */
  move() {
    if (dealWithLoadingBug('mediawiki.widgets')) return;

    const MoveSectionDialog = require('./MoveSectionDialog').default;

    const section = this;
    const dialog = new MoveSectionDialog(section);
    cd.g.windowManager.addWindows([dialog]);
    cd.g.windowManager.openWindow(dialog);
  }

  /**
   * Update the watch/unwatch section links visibility.
   *
   * @private
   */
  updateWatchMenuItems() {
    if (this.menu) {
      this.menu.unwatch[this.isWatched ? 'show' : 'hide']();
      this.menu.watch[this.isWatched ? 'hide' : 'show']();
    }
  }

  /**
   * Add the section to the watched sections list.
   *
   * @param {boolean} [silent=false] Don't show a notification or change UI unless there is an
   *   error.
   * @param {string} [renamedFrom] If the section was renamed, the previous section headline. It is
   *   unwatched together with watching the current headline if there is no other coinciding
   *   headlines on the page.
   */
  watch(silent = false, renamedFrom) {
    const sections = Section.getByHeadline(this.headline);
    let finallyCallback;
    if (!silent) {
      const buttons = sections.map((section) => section.menu?.watch).filter(defined);
      buttons.forEach((button) => {
        button.setPending(true);
      });
      finallyCallback = () => {
        buttons.forEach((button) => {
          button.setPending(false);
        });
      };
    }

    let unwatchHeadline;
    if (renamedFrom && !Section.getByHeadline(renamedFrom).length) {
      unwatchHeadline = renamedFrom;
    }

    Section.watch(this.headline, unwatchHeadline)
      .then(finallyCallback, finallyCallback)
      .then(
        () => {
          sections.forEach((section) => {
            section.isWatched = true;
            section.updateWatchMenuItems();
            section.updateTocLink();
          });
          if (!silent) {
            let text = cd.sParse('section-watch-success', this.headline);
            let autoHideSeconds;
            if ($('#ca-watch').length) {
              text += ' ' + cd.sParse('section-watch-pagenotwatched');
              autoHideSeconds = 'long';
            }
            mw.notify(wrap(text), { autoHideSeconds });
          }
        },
        () => {}
      );
  }

  /**
   * Remove the section from the watched sections list.
   *
   * @param {boolean} [silent=false] Don't show a notification or change UI unless there is an
   *   error.
   */
  unwatch(silent = false) {
    const sections = Section.getByHeadline(this.headline);
    let finallyCallback;
    if (!silent) {
      const buttons = sections.map((section) => section.menu?.unwatch).filter(defined);
      buttons.forEach((button) => {
        button.setPending(true);
      });
      finallyCallback = () => {
        buttons.forEach((button) => {
          button.setPending(false);
        });
      };
    }

    Section.unwatch(this.headline)
      .then(finallyCallback, finallyCallback)
      .then(
        () => {
          sections.forEach((section) => {
            section.isWatched = false;
            section.updateWatchMenuItems();
            section.updateTocLink();
          });

          const watchedAncestorHeadline = this.getClosestWatchedSection()?.headline;
          if (!silent || watchedAncestorHeadline) {
            let text = cd.sParse('section-unwatch-success', this.headline);
            let autoHideSeconds;
            if (watchedAncestorHeadline) {
              text += ' ' + cd.sParse('section-unwatch-stillwatched', watchedAncestorHeadline);
              autoHideSeconds = 'long';
            }
            mw.notify(wrap(text), { autoHideSeconds });
          }
        },
        () => {}
      );
  }

  /**
   * Copy a link to the section or open a copy link dialog.
   *
   * @param {Event} e
   */
  copyLink(e) {
    e.preventDefault();
    showCopyLinkDialog(this, e);
  }

  /**
   * _For internal use._ Detect the last section comment's indentation characters if needed or a
   * vote / bulleted reply placeholder.
   *
   * @param {CommentForm} commentForm
   */
  setLastCommentIndentationChars(commentForm) {
    const [, replyPlaceholder] = this.inCode.firstChunkCode.match(/\n([#*]) *\n+$/) || [];
    if (replyPlaceholder) {
      this.inCode.lastCommentIndentationChars = replyPlaceholder;
    } else {
      const lastComment = this.commentsInFirstChunk[this.commentsInFirstChunk.length - 1];
      if (
        lastComment &&
        (commentForm.containerListType === 'ol' || cd.config.indentationCharMode === 'mimic')
      ) {
        try {
          lastComment.locateInCode(commentForm.submitSection);
        } catch {
          return;
        }
        if (
          !lastComment.inCode.indentationChars.startsWith('#') ||

          // For now we use the workaround with commentForm.containerListType to make sure "#"
          // is a part of comments organized in a numbered list, not of a numbered list _in_
          // the target comment.
          commentForm.containerListType === 'ol'
        ) {
          this.inCode.lastCommentIndentationChars = lastComment.inCode.indentationChars;
        }
      }
    }
  }

  /**
   * Modify a section or page code string related to the section in accordance with an action.
   *
   * @param {object} options
   * @param {string} options.action `'replyInSection'` or `'addSubsection'`.
   * @param {string} options.commentCode Comment code, including trailing newlines and the
   *   signature.
   * @returns {object}
   */
  modifyWholeCode({ action, commentCode }) {
    const wholeCode = this.inCode.isSectionCodeUsed ? this.code : this.getSourcePage().code;
    let newWholeCode;
    switch (action) {
      case 'replyInSection': {
        const codeBefore = wholeCode.slice(0, this.inCode.firstChunkContentEndIndex);
        const codeAfter = wholeCode.slice(this.inCode.firstChunkContentEndIndex);
        newWholeCode = codeBefore + commentCode + codeAfter;
        break;
      }

      case 'addSubsection': {
        const codeBefore = endWithTwoNewlines(wholeCode.slice(0, this.inCode.contentEndIndex));
        const codeAfter = wholeCode.slice(this.inCode.contentEndIndex).trim();
        newWholeCode = codeBefore + commentCode + codeAfter;
        break;
      }
    }

    return newWholeCode;
  }

  /**
   * Request the code of the section by its number using the API and set some properties of the
   * section (and also the page). {@link Section#getCode} is a more general method.
   *
   * @throws {CdError}
   */
  async requestCode() {
    const resp = await cd.g.mwApi.post({
      action: 'query',
      titles: this.getSourcePage().name,
      prop: 'revisions',
      rvsection: this.liveSectionNumber,
      rvslots: 'main',
      rvprop: ['ids', 'content'],
      redirects: !mw.config.get('wgIsRedirect'),
      curtimestamp: true,
    }).catch(handleApiReject);

    const query = resp.query;
    const page = query?.pages?.[0];
    const revision = page?.revisions?.[0];
    const main = revision?.slots?.main;
    const content = main?.content;

    if (!query || !page) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    if (page.missing) {
      throw new CdError({
        type: 'api',
        code: 'missing',
      });
    }

    if (page.invalid) {
      throw new CdError({
        type: 'api',
        code: 'invalid',
      });
    }

    if (main.nosuchsection) {
      throw new CdError({
        type: 'api',
        code: 'noSuchSection',
      });
    }

    if (!revision || content === undefined) {
      throw new CdError({
        type: 'api',
        code: 'noData',
      });
    }

    const redirectTarget = query.redirects?.[0]?.to || null;

    /**
     * Section code. Filled upon running {@link Section#getCode}.
     *
     * @name code
     * @type {string|undefined}
     * @memberof Section
     * @instance
     */

    /**
     * ID of the revision that has {@link Section#code}. Filled upon running
     * {@link Section#getCode}.
     *
     * @name revisionId
     * @type {number|undefined}
     * @memberof Section
     * @instance
     */

    /**
     * Time when {@link Section#code} was queried (as the server reports it). Filled upon running
     * {@link Section#getCode}.
     *
     * @name queryTimestamp
     * @type {string|undefined}
     * @memberof Section
     * @instance
     */
    Object.assign(this, {
      // It's more convenient to unify regexps to have \n as the last character of anything, not
      // (?:\n|$), and it doesn't seem to affect anything substantially.
      code: content + '\n',

      revisionId: revision.revid,
      queryTimestamp: resp.curtimestamp,
    });

    Object.assign(cd.page, {
      pageId: page.pageid,
      redirectTarget,
      realName: redirectTarget || this.name,
    });
  }

  /**
   * Load the section code. See also {@link Section#requestCode}.
   *
   * @param {CommentForm} [commentForm] Comment form, if it is submitted (or code changes are
   *   viewed).
   * @throws {CdError|Error}
   */
  async getCode(commentForm) {
    try {
      if (this.liveSectionNumber !== null) {
        try {
          await this.requestCode();
          this.locateInCode(true);
          if (commentForm) {
            /**
             * Whether the wikitext of a section will be submitted to the server instead of a page.
             *
             * @type {?boolean}
             * @memberof CommentForm
             * @instance
             */
            commentForm.submitSection = true;
          }
        } catch (e) {
          if (e instanceof CdError && ['noSuchSection', 'locateSection'].includes(e.data.code)) {
            await this.getSourcePage().getCode();
            this.locateInCode(false);
          } else {
            throw e;
          }
        }
      } else {
        await this.getSourcePage().getCode();
        this.locateInCode(false);
      }
    } catch (e) {
      if (e instanceof CdError) {
        throw new CdError(Object.assign({}, {
          message: cd.sParse('cf-error-getpagecode'),
        }, e.data));
      } else {
        throw e;
      }
    }
  }

  /**
   * Search for the section in the source code and return possible matches.
   *
   * @param {string} pageCode
   * @returns {object}
   * @private
   */
  searchInCode(pageCode) {
    const headline = normalizeCode(this.headline);
    const adjustedPageCode = hideDistractingCode(pageCode);
    const sectionHeadingRegexp = /^((=+)(.*)\2[ \t\x01\x02]*)\n/gm;

    const matches = [];
    const headlines = [];
    let sectionIndex = 0;
    let sectionHeadingMatch;
    while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedPageCode))) {
      const currentHeadline = normalizeCode(removeWikiMarkup(sectionHeadingMatch[3]));
      const doesHeadlineMatch = currentHeadline === headline;

      let numberOfPreviousHeadlinesToCheck = 3;
      const previousHeadlinesInCode = headlines
        .slice(-numberOfPreviousHeadlinesToCheck)
        .reverse();
      const previousHeadlines = cd.sections
        .slice(Math.max(0, this.id - numberOfPreviousHeadlinesToCheck), this.id)
        .reverse()
        .map((section) => section.headline);
      const doPreviousHeadlinesMatch = previousHeadlines
        .every((headline, i) => normalizeCode(headline) === previousHeadlinesInCode[i]);
      headlines.push(currentHeadline);

      // Matching section index is one of the most unreliable ways to tell matching sections as
      // sections may be added and removed from the page, so we don't rely on it very much.
      const doesSectionIndexMatch = this.id === sectionIndex;
      sectionIndex++;

      // Get the section content
      const fullHeadingMatch = sectionHeadingMatch[1];
      const equalSigns = sectionHeadingMatch[2];
      const equalSignsPattern = `={1,${equalSigns.length}}`;
      const codeFromSection = pageCode.slice(sectionHeadingMatch.index);
      const adjustedCodeFromSection = adjustedPageCode.slice(sectionHeadingMatch.index);
      const sectionMatch = (
        adjustedCodeFromSection.match(new RegExp(
          // Will fail at "===" or the like.
          '(' +
          mw.util.escapeRegExp(fullHeadingMatch) +
          '[^]*?\\n)' +
          equalSignsPattern +
          '[^=].*=+[ \\t\\x01\\x02]*\\n'
        )) ||
        codeFromSection.match(new RegExp(
          '(' +
          mw.util.escapeRegExp(fullHeadingMatch) +
          '[^]*$)'
        ))
      );

      // To simplify the workings of the "replyInSection" mode we don't consider terminating line
      // breaks to be a part of the first chunk of the section (i.e., the section subdivision before
      // the first heading).
      const firstChunkMatch = (
        adjustedCodeFromSection.match(new RegExp(
          // Will fail at "===" or the like.
          '(' +
          mw.util.escapeRegExp(fullHeadingMatch) +
          '[^]*?\\n)\\n*' +

          // Any next heading.
          '={1,6}' +

          '[^=].*=+[ \\t\\x01\\x02]*\n'
        )) ||
        codeFromSection.match(new RegExp(
          '(' +
          mw.util.escapeRegExp(fullHeadingMatch) +
          '[^]*$)'
        ))
      );
      const code = (
        sectionMatch &&
        codeFromSection.substr(sectionMatch.index, sectionMatch[1].length)
      );
      const firstChunkCode = (
        firstChunkMatch &&
        codeFromSection.substr(firstChunkMatch.index, firstChunkMatch[1].length)
      );

      if (!code || !firstChunkCode) {
        console.log(`Couldn't read the "${currentHeadline}" section contents.`);
        continue;
      }

      const sigs = extractSignatures(code);
      let oldestSig;
      sigs.forEach((sig) => {
        if (!oldestSig || (!oldestSig.date && sig.date) || oldestSig.date > sig.date) {
          oldestSig = sig;
        }
      });
      const doesOldestCommentMatch = oldestSig ?
        Boolean(
          this.oldestComment &&
          (
            oldestSig.timestamp === this.oldestComment.timestamp ||
            oldestSig.author === this.oldestComment.author
          )
        ) :

        // There's no comments neither in the code nor on the page.
        !this.oldestComment;

      let oldestCommentWordOverlap = Number(!this.oldestComment && !oldestSig);
      if (this.oldestComment && oldestSig) {
        // Use the comment text overlap factor due to this error
        // https://www.wikidata.org/w/index.php?diff=1410718962. The comment code is extracted only
        // superficially, without exluding the headline code and other operations performed in
        // Comment#adjustCommentBeginning.
        const oldestCommentCode = code.slice(oldestSig.commentStartIndex, oldestSig.startIndex);
        oldestCommentWordOverlap = calculateWordOverlap(
          this.oldestComment.getText(),
          removeWikiMarkup(oldestCommentCode)
        );
      }

      const score = (
        doesOldestCommentMatch * 1 +
        oldestCommentWordOverlap +
        doesHeadlineMatch * 1 +
        doesSectionIndexMatch * 0.5 +

        // Shouldn't give too high a weight to this factor as it is true for every first section.
        doPreviousHeadlinesMatch * 0.25
      );
      if (score <= 1) continue;

      const startIndex = sectionHeadingMatch.index;
      const endIndex = startIndex + code.length;
      const contentStartIndex = sectionHeadingMatch.index + sectionHeadingMatch[0].length;
      const firstChunkEndIndex = startIndex + firstChunkCode.length;
      const relativeContentStartIndex = contentStartIndex - startIndex;

      let firstChunkContentEndIndex = firstChunkEndIndex;
      let contentEndIndex = endIndex;
      cd.g.KEEP_IN_SECTION_ENDING.forEach((regexp) => {
        const firstChunkMatch = firstChunkCode.match(regexp);
        if (firstChunkMatch) {
          // "1" accounts for the first line break.
          firstChunkContentEndIndex -= firstChunkMatch[0].length - 1;
        }

        const codeMatch = code.match(regexp);
        if (codeMatch) {
          // "1" accounts for the first line break.
          contentEndIndex -= codeMatch[0].length - 1;
        }
      });

      // Sections may have "#" or "*" as a placeholder for a vote or bulleted reply. In this case,
      // we must use that "#" or "*" in the reply. As for the placeholder, perhaps we should remove
      // it, but as for now, we keep it because if:
      // * the placeholder character is "*",
      // * cd.config.indentationCharMode is 'unify',
      // * cd.config.defaultIndentationChar is ':', and
      // * there is more than one reply,
      // the next reply would go back to ":", not "*" as should be.
      const match = firstChunkCode.match(/\n([#*] *\n+)$/);
      if (match) {
        firstChunkContentEndIndex -= match[1].length;
      }

      matches.push({
        doesHeadlineMatch,
        doesOldestCommentMatch,
        doesSectionIndexMatch,
        doPreviousHeadlinesMatch,
        score,
        startIndex,
        endIndex,
        code,
        contentStartIndex,
        contentEndIndex,
        relativeContentStartIndex,
        firstChunkEndIndex,
        firstChunkContentEndIndex,
        firstChunkCode,
      });

      // Maximal possible score
      if (score === 2.75) break;
    }

    return matches;
  }

  /**
   * Locate the section in the source code and set the result to the `inCode` property.
   *
   * It is expected that the section or page code is loaded (using {@link Page#getCode}) before this
   * method is called. Otherwise, the method will throw an error.
   *
   * @param {boolean} useSectionCode Is the section code available to locate the section in instead
   *   of the page code.
   * @throws {CdError}
   */
  locateInCode(useSectionCode) {
    this.inCode = null;

    const code = useSectionCode ? this.code : this.getSourcePage().code;
    if (code === undefined) {
      throw new CdError({
        type: 'parse',
        code: 'noCode',
      });
    }

    const matches = this.searchInCode(code);
    const bestMatch = matches.sort((m1, m2) => m2.score - m1.score)[0];
    if (!bestMatch) {
      throw new CdError({
        type: 'parse',
        code: 'locateSection',
      });
    }

    bestMatch.isSectionCodeUsed = useSectionCode;

    this.inCode = bestMatch;
  }

  /**
   * Get the wiki page that has the source code of the section (may be different from the current
   * page if the section is transcluded from another page).
   *
   * @returns {Page}
   */
  getSourcePage() {
    return this.sourcePage;
  }

  /**
   * Get the base section, i.e. a section of level 2 that is an ancestor of the section, or the
   * section itself if it is of level 2 (even if there is a level 1 section) or if there is no
   * higher level section (the current section may be of level 3 or 1, for example).
   *
   * @returns {Section}
   */
  getBase() {
    if (this.level <= 2) {
      return this;
    }

    return (
      cd.sections
        .slice(0, this.id)
        .reverse()
        .find((section) => section.level === 2) ||
      this
    );
  }

  /**
   * Get the collection of the section's subsections.
   *
   * @param {boolean} [indirect=false] Whether to include subsections of subsections and so on
   *   (return descendants, in a word).
   * @returns {Section[]}
   */
  getChildren(indirect = false) {
    const children = [];
    let haveMetDirect = false;
    cd.sections
      .slice(this.id + 1)
      .some((section) => {
        if (section.level > this.level) {
          // If, say, a level 4 section directly follows a level 2 section, it should be considered
          // a child. This is why we need the haveMetDirect variable.
          if (section.level === this.level + 1) {
            haveMetDirect = true;
          }

          if (indirect || section.level === this.level + 1 || !haveMetDirect) {
            children.push(section);
          }
          return false;
        } else {
          return true;
        }
      });

    return children;
  }

  /**
   * Get the first upper level section relative to the current section that is watched.
   *
   * @param {boolean} [includeCurrent=false] Check the current section too.
   * @returns {?Section}
   */
  getClosestWatchedSection(includeCurrent = false) {
    for (
      let otherSection = includeCurrent ? this : this.getParent();
      otherSection;
      otherSection = otherSection.getParent()
    ) {
      if (otherSection.isWatched) {
        return otherSection;
      }
    }
    return null;
  }

  /**
   * Get the TOC item for the section if present.
   *
   * @returns {?object}
   */
  getTocItem() {
    return toc.getItem(this.anchor) || null;
  }

  /**
   * Bold/unbold the section's TOC link according to its watch state and update the `title`
   * attribute.
   *
   * @private
   */
  updateTocLink() {
    if (!cd.settings.modifyToc) return;

    const tocItem = this.getTocItem();
    if (!tocItem) return;

    if (this.isWatched) {
      tocItem.$link
        .addClass('cd-toc-watched')
        .attr('title', cd.s('toc-watched'));
    } else {
      tocItem.$link
        .removeClass('cd-toc-watched')
        .removeAttr('title');
    }
  }

  /**
   * Get a link to the section with Unicode sequences decoded.
   *
   * @param {boolean} permanent Get a permanent URL.
   * @returns {string}
   */
  getUrl(permanent) {
    if (permanent) {
      return getUrlWithAnchor(this.anchor, true);
    } else {
      if (!this.cachedUrl) {
        this.cachedUrl = getUrlWithAnchor(this.anchor);
      }

      return this.cachedUrl;
    }
  }
}

Object.assign(Section, SectionStatic);

export default Section;
