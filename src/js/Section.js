/**
 * Section class.
 *
 * @module Section
 */

import CdError from './CdError';
import CommentForm from './CommentForm';
import SectionSkeleton from './SectionSkeleton';
import cd from './cd';
import { animateLink, handleApiReject, isTalkNamespace, underlinesToSpaces } from './util';
import { copyLink } from './modal.js';
import { editWatchedSections } from './modal';
import {
  extractSignatures,
  findFirstTimestamp,
  hideHtmlComments,
  normalizeCode,
  removeWikiMarkup,
} from './wikitext';
import { getLastRevision } from './apiWrappers';
import { getWatchedSections, setWatchedSections } from './options';
import { parseTimestamp } from './timestamp';
import { reloadPage } from './boot';

/**
 * Class representing a section.
 *
 * @augments module:SectionSkeleton
 */
export default class Section extends SectionSkeleton {
  #elementPrototypes
  #closingBracketElement
  #editSectionElement
  #cached$elements
  #showAddSubsectionButtonTimeout
  #hideAddSubsectionButtonTimeout

  /**
   * Create a section object.
   *
   * @param {Parser} parser A relevant instance of {@link module:Parser Parser}.
   * @param {Element} headingElement
   * @param {Promise} [watchedSectionsRequest]
   * @throws {CdError}
   */
  constructor(parser, headingElement, watchedSectionsRequest) {
    super(parser, headingElement);

    /**
     * Collection of the section's subsections.
     *
     * @name subsections
     * @type {Section[]}
     * @instance module:Section
     */

    /**
     * Base section, i.e. a section of the level 2 that is an ancestor of the section.
     *
     * @name baseSection
     * @type {Section}
     * @instance module:Section
     */

    /**
     * Is the section the last section on the page.
     *
     * @name isLastSection
     * @type {boolean}
     * @instance module:Section
     */

    this.#elementPrototypes = cd.g.SECTION_ELEMENT_PROTOTYPES;

    /**
     * Section headline element as a jQuery object.
     *
     * @type {JQuery}
     */
    this.$headline = $(this.headlineElement);

    this.#editSectionElement = headingElement.querySelector('.mw-editsection');
    if (this.#editSectionElement) {
      this.#closingBracketElement = this.#editSectionElement.lastElementChild;
      if (
        !this.#closingBracketElement ||
        !this.#closingBracketElement.classList ||
        !this.#closingBracketElement.classList.contains('mw-editsection-bracket')
      ) {
        this.#closingBracketElement = null;
      }

      /**
       * Wiki page that has the source code of the section (may be different from the current page
       * if the section is transcluded from another page).
       *
       * @type {string}
       */
      this.sourcePage = cd.g.CURRENT_PAGE;
      const editLink = this.#editSectionElement
        .querySelector('a[href*="&action=edit"], a[href*="&veaction=editsource"]');
      if (editLink) {
        const editLinkUrl = new URL(editLink.href);
        if (editLinkUrl) {
          const sectionNumber = editLinkUrl.searchParams.get('section');
          if (sectionNumber.startsWith('T-')) {
            this.sourcePage = underlinesToSpaces(editLinkUrl.searchParams.get('title'));
          }
        }
      } else {
        console.error('Edit link not found.', this);
      }

      /**
       * Section heading as a jQuery element.
       *
       * @type {JQuery}
       */
      this.$heading = $(headingElement);

      /**
       * Is the section frozen (is not in a closed discussion or an old diff page).
       *
       * @type {boolean}
       */
      this.frozen = (
        !cd.g.isPageActive ||
        cd.g.specialElements.closedDiscussions.some((el) => el.contains(headingElement))
      );

      if (!this.frozen) {
        this.#showAddSubsectionButtonTimeout = undefined;
        this.#hideAddSubsectionButtonTimeout = undefined;

        this.addAddSubsectionButton();

        // Add a "Reply" button to the end of the first section chunk.
        const replyButton = this.#elementPrototypes.replyButton.cloneNode(true);
        replyButton.firstChild.onclick = () => {
          this.addReply();
        };

        // Sections may have "#" in the code as a placeholder for a vote. In this case, we must
        // create the comment form in the <ol> tag, and keep "#" in the reply.
        const isVotePlaceholder = (
          this.lastElementInFirstChunk.tagName === 'OL' &&
          this.lastElementInFirstChunk.childElementCount === 1 &&
          this.lastElementInFirstChunk.children[0].classList.contains('mw-empty-elt')
        );

        let tag;
        let createUl = false;
        if (this.lastElementInFirstChunk.classList.contains('cd-commentLevel')) {
          const tagName = this.lastElementInFirstChunk.tagName;
          if (
            tagName === 'UL' ||
            (
              tagName === 'OL' &&
              // Check if this is indeed a numbered list with replies as list items, not a numbered
              // list as part of the user's comment that has their signature technically inside the
              // last item.
              (
                this.lastElementInFirstChunk.querySelectorAll('ol > li').length === 1 ||
                this.lastElementInFirstChunk.querySelectorAll('ol > li > .cd-signature').length > 1
              )
            )
          ) {
            tag = 'li';
          } else if (tagName === 'DL') {
            tag = 'dd';
          } else {
            tag = 'li';
            createUl = true;
          }
        } else {
          tag = 'li';
          if (!isVotePlaceholder) {
            createUl = true;
          }
        }

        const replyWrapper = document.createElement(tag);
        replyWrapper.className = 'cd-replyWrapper';
        replyWrapper.appendChild(replyButton);

        // Container contains wrapper contains element ^_^
        let replyContainer;
        if (createUl) {
          const replyContainer = document.createElement('ul');
          replyContainer.className = 'cd-commentLevel cd-sectionButtonContainer';
          replyContainer.appendChild(replyWrapper);

          this.lastElementInFirstChunk.parentElement.insertBefore(
            replyContainer,
            this.lastElementInFirstChunk.nextElementSibling
          );
        } else {
          this.lastElementInFirstChunk.appendChild(replyWrapper);
        }

        /**
         * Reply button on the bottom of the first section chunk.
         *
         * @type {JQuery|undefined}
         */
        this.$replyButton = $(replyButton);

        /**
         * Link element contained in the reply button element.
         *
         * @type {JQuery|undefined}
         */
        this.$replyButtonLink = $(replyButton.firstChild);

        /**
         * Reply button wrapper.
         *
         * @type {JQuery|undefined}
         */
        this.$replyWrapper = $(replyWrapper);

        /**
         * Reply button container if present. It may be wrapped around the reply button wrapper.
         *
         * @type {JQuery|undefined}
         */
        this.$replyContainer = replyContainer ? $(replyContainer) : undefined;

        // Add section menu items
        if (
          this.comments.length &&
          this.comments[0].isOpeningSection &&
          this.comments[0].openingSectionOfLevel === this.level &&
          (this.comments[0].own || cd.settings.allowEditOthersComments) &&
          this.comments[0].actionable
        ) {
          this.addMenuItem({
            label: cd.s('sm-editopeningcomment'),
            tooltip: cd.s('sm-editopeningcomment-tooltip'),
            func: () => {
              this.comments[0].edit();
            },
            class: 'cd-sectionLink-editOpeningComment',
          });
        }

        this.addMenuItem({
          label: cd.s('sm-addsubsection'),
          tooltip: cd.s('sm-addsubsection-tooltip'),
          func: () => {
            this.addSubsection();
          },
          class: 'cd-sectionLink-addSubsection',
        });

        if (this.level === 2) {
          this.addMenuItem({
            label: cd.s('sm-move'),
            tooltip: cd.s('sm-move-tooltip'),
            func: () => {
              this.move();
            },
            class: 'cd-sectionLink-moveSection',
          });
        }

        if (watchedSectionsRequest) {
          watchedSectionsRequest.then(
            ({ thisPageWatchedSections }) => {
              if (this.headline) {
                this.isWatched = thisPageWatchedSections.includes(this.headline);
                this.addMenuItem({
                  label: cd.s('sm-unwatch'),
                  tooltip: cd.s('sm-unwatch-tooltip'),
                  func: () => {
                    this.unwatch();
                  },
                  class: 'cd-sectionLink-unwatch',
                  visible: this.isWatched,
                });
                this.addMenuItem({
                  label: cd.s('sm-watch'),
                  tooltip: cd.s('sm-watch-tooltip'),
                  func: () => {
                    this.watch();
                  },
                  class: 'cd-sectionLink-watch',
                  visible: !this.isWatched,
                });
              }

              const targetString = `sm-copylink-tooltip-${cd.settings.defaultSectionLinkType.toLowerCase()}`;

              // We put it here to make it appear always after the "watch" item.
              this.addMenuItem({
                label: cd.s('sm-copylink'),
                // We need the event object so we don't wrap the function into a container function.
                func: this.copyLink.bind(this),
                class: 'cd-sectionLink-copyLink',
                tooltip: cd.s('sm-copylink-tooltip', cd.s(targetString)),
                href: `${mw.util.getUrl(cd.g.CURRENT_PAGE)}#${this.anchor}`,
              });
            },
            () => {}
          );
        }
      }
    }
  }

  /**
   * Add "Add subsection" buttons that appear when hovering over "Reply" buttons.
   */
  addAddSubsectionButton() {
    if (this.level !== 2) return;

    const addSubsectionButton = this.#elementPrototypes.addSubsectionButton.cloneNode(true);
    const labelContainer = addSubsectionButton.querySelector('.oo-ui-labelElement-label');
    if (!labelContainer) return;
    labelContainer.innerHTML = '';
    labelContainer.appendChild(
      document.createTextNode(cd.s('section-addsubsection-to', this.headline))
    );
    addSubsectionButton.firstChild.onclick = () => {
      this.addSubsection();
    };

    const addSubsectionButtonContainer = document.createElement('div');
    addSubsectionButtonContainer.className = (
      'cd-sectionButtonContainer cd-addSubsectionButtonContainer'
    );
    addSubsectionButtonContainer.style.display = 'none';
    addSubsectionButtonContainer.appendChild(addSubsectionButton);

    const lastElement = this.elements[this.elements.length - 1];
    lastElement.parentElement.insertBefore(
      addSubsectionButtonContainer,
      lastElement.nextElementSibling
    );

    this.$addSubsectionButtonContainer = $(addSubsectionButtonContainer);

    const deferAddSubsectionButtonHide = () => {
      if (!this.#hideAddSubsectionButtonTimeout) {
        this.#hideAddSubsectionButtonTimeout = setTimeout(() => {
          this.$addSubsectionButtonContainer.hide();
        }, 1000);
      }
    };

    addSubsectionButton.firstChild.onmouseenter = () => {
      clearTimeout(this.#hideAddSubsectionButtonTimeout);
      this.#hideAddSubsectionButtonTimeout = null;
    };
    addSubsectionButton.firstChild.onmouseleave = () => {
      deferAddSubsectionButtonHide();
    };

    this.replyButtonHoverHandler = () => {
      if (this.addSubsectionForm) return;

      clearTimeout(this.#hideAddSubsectionButtonTimeout);
      this.#hideAddSubsectionButtonTimeout = null;

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

      deferAddSubsectionButtonHide();
    };
  }

  /**
   * Create an {@link module:Section#addReplyForm add reply form}.
   *
   * @param {object|CommentForm} dataToRestore
   */
  addReply(dataToRestore) {
    // Check for existence in case replying is called from a script of some kind (there is no button
    // to call it from CD).
    if (!this.addReplyForm) {
      /**
       * Add reply form related to the section.
       *
       * @type {CommentForm|undefined}
       */
      this.addReplyForm = dataToRestore instanceof CommentForm ?
        dataToRestore :
        new CommentForm({
          mode: 'replyInSection',
          target: this,
          dataToRestore,
        });
    }
    this.$replyButton.hide();

    const baseSection = this.level === 2 ? this : this.baseSection;
    if (baseSection && baseSection.$addSubsectionButtonContainer) {
      baseSection.$addSubsectionButtonContainer.hide();

      clearTimeout(baseSection.showAddSubsectionButtonTimeout);
      baseSection.showAddSubsectionButtonTimeout = null;
    }
  }

  /**
   * Create an {@link module:Section#addSubsectionForm add subsection form} form or focus an
   * existing one.
   *
   * @param {object|CommentForm} dataToRestore
   */
  addSubsection(dataToRestore) {
    if (this.addSubsectionForm) {
      this.addSubsectionForm.$element.cdScrollIntoView('center');
      this.addSubsectionForm.headlineInput.focus();
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
          scrollIntoView: true,
        });
    }

    if (this.$addSubsectionButtonContainer) {
      this.$addSubsectionButtonContainer.hide();
    }
  }

  /**
   * Show a move section dialog.
   */
  async move() {
    /**
     * @class Subclass of {@link
     *   https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.ProcessDialog OO.ui.ProcessDialog}
     *   used to create a move section dialog.
     * @private
     */
    function MoveSectionDialog() {
      MoveSectionDialog.parent.call(this);
    }
    OO.inheritClass(MoveSectionDialog, OO.ui.ProcessDialog);

    MoveSectionDialog.static.name = 'moveSectionDialog';
    MoveSectionDialog.static.title = cd.s('msd-title');
    MoveSectionDialog.static.actions = [
      {
        action: 'close',
        modes: ['loading', 'move', 'reload'],
        flags: ['safe', 'close'],
        disabled: true,
      },
      {
        action: 'move',
        modes: ['move'],
        label: cd.s('msd-move'),
        flags: ['primary', 'progressive'],
        disabled: true,
      },
      {
        action: 'reload',
        modes: ['reload'],
        label: cd.s('msd-reload'),
        flags: ['primary', 'progressive'],
      },
    ];

    MoveSectionDialog.prototype.onTitleInputChange = async function () {
      let move = true;
      try {
        await this.titleInput.getValidity();
      } catch (e) {
        move = false;
      }
      this.actions.setAbilities({ move });
    };

    MoveSectionDialog.prototype.areNewTopicsOnTop = async function (title, code) {
      let newTopicsOnTop;
      if (cd.config.areNewTopicsOnTop) {
        newTopicsOnTop = cd.config.areNewTopicsOnTop(title.toText(), code);
      }

      const adjustedCode = hideHtmlComments(code);

      // Detect the topic order: newest first or newest last. While doing that, search for the first
      // section position.
      const sectionHeadingRegexp = /^==[^=].*?==[ \t]*(?:<!--[^]*?-->[ \t]*)*\n/gm;
      let firstSectionIndex;
      let sectionHeadingMatch;
      let previousDate;
      let higherLowerDifference = 0;
      while (
        (sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode)) &&
        (
          newTopicsOnTop === undefined ||
          (newTopicsOnTop !== false && firstSectionIndex === undefined)
        )
      ) {
        if (firstSectionIndex === undefined) {
          firstSectionIndex = sectionHeadingMatch.index;
        }
        if (newTopicsOnTop !== undefined) break;

        const codeStartingWithThisSection = code.slice(sectionHeadingMatch.index);

        const timestamp = findFirstTimestamp(codeStartingWithThisSection);
        const { date } = timestamp && parseTimestamp(timestamp) || {};
        if (date) {
          if (previousDate) {
            higherLowerDifference += date > previousDate ? -1 : 1;
          }
          previousDate = date;
        }

        if (Math.abs(higherLowerDifference) > 5) {
          newTopicsOnTop = higherLowerDifference > 0;
        }
      }

      if (newTopicsOnTop === undefined) {
        newTopicsOnTop = higherLowerDifference === 0 ?
          !(title.namespace % 2 === 1) :
          higherLowerDifference > 0;
      }

      return { newTopicsOnTop, firstSectionIndex };
    };

    MoveSectionDialog.prototype.loadSourcePage = async function () {
      let page;
      try {
        page = await getLastRevision(section.sourcePage);
      } catch (e) {
        if (e instanceof CdError) {
          const { type, code } = e.data;
          if (type === 'api') {
            if (code === 'missing') {
              throw [cd.s('msd-error-sourcepagedeleted'), true];
            } else {
              throw [`${cd.s('error-api')}: ${code}.`, true];
            }
          } else if (type === 'network') {
            throw [cd.s('error-network'), true];
          }
        } else {
          throw [cd.s('error-javascript'), false];
        }
      }

      const code = page.code;
      try {
        section.locateInCode(code);
      } catch (e) {
        if (e instanceof CdError) {
          const { code } = e.data;
          let message;
          if (code === 'couldntLocateSection') {
            message = cd.s('error-locatesection');
          } else {
            message = cd.s('error-unknown');
          }
          throw [message, true];
        } else {
          throw [cd.s('error-javascript'), false];
        }
      }

      return {
        code,
        timestamp: page.timestamp,
        queryTimestamp: page.queryTimestamp,
        sectionInCode: section.inCode,
        wikilink: `${section.sourcePage}#${section.headline}`,
      };
    };

    MoveSectionDialog.prototype.loadTargetPage = async function (targetTitle) {
      let page;
      try {
        page = await getLastRevision(targetTitle);
      } catch (e) {
        if (e instanceof CdError) {
          const { type, code } = e.data;
          if (type === 'api') {
            if (code === 'missing') {
              throw [cd.s('msd-error-targetpagedoesntexist'), true];
            } else if (code === 'invalid') {
              // Must be filtered before submit.
              throw [cd.s('msd-error-invalidpagename'), false];
            } else {
              throw [`${cd.s('error-api')}: ${code}.`, true];
            }
          } else if (type === 'network') {
            throw [cd.s('error-network'), true];
          }
        } else {
          throw [cd.s('error-javascript'), false];
        }
      }

      const { code, timestamp, queryTimestamp } = page;
      const title = page.redirectTarget || targetTitle;
      const { newTopicsOnTop, firstSectionIndex } = this.areNewTopicsOnTop(title, code);
      const wikilink = `${title.toText()}#${section.headline}`;

      return {
        code,
        timestamp,
        queryTimestamp,
        title,
        newTopicsOnTop,
        firstSectionIndex,
        wikilink,
        sectionUrl: mw.util.getUrl(wikilink),
      };
    };

    MoveSectionDialog.prototype.saveTargetPage = async function (sourcePage, targetPage) {
      const addTwoNewLines = (code) => code.replace(/([^\n])\n?$/, '$1\n\n');

      let targetPageNewSectionCode = addTwoNewLines(
        sourcePage.sectionInCode.code.slice(
          0,
          sourcePage.sectionInCode.contentStartIndex - sourcePage.sectionInCode.startIndex
        ) +
        cd.s('move-targetpagecode', sourcePage.wikilink, cd.settings.mySignature, { plain: true }) +
        '\n' +
        sourcePage.sectionInCode.code.slice(
          sourcePage.sectionInCode.contentStartIndex - sourcePage.sectionInCode.startIndex
        )
      );

      let targetPageNewCode;
      if (targetPage.newTopicsOnTop) {
        // The page has no sections, so we add to the bottom.
        if (targetPage.firstSectionIndex === undefined) {
          targetPage.firstSectionIndex = targetPage.code.length;
        }
        targetPageNewCode = (
          addTwoNewLines(targetPage.code.slice(0, targetPage.firstSectionIndex)) +
          targetPageNewSectionCode +
          targetPage.code.slice(targetPage.firstSectionIndex)
        );
      } else {
        targetPageNewCode = targetPage.code + '\n\n' + targetPageNewSectionCode;
      }

      const summaryEnding = this.summaryEndingInput.getValue();
      const text = (
        cd.s('es-moved-from', sourcePage.wikilink) +
        (summaryEnding ? `: ${summaryEnding}` : '')
      );
      let editTargetPageData;
      try {
        editTargetPageData = await cd.g.api.postWithToken('csrf', {
          action: 'edit',
          title: targetPage.title.toString(),
          text: targetPageNewCode,
          summary: cd.util.buildEditSummary({
            text,
            section: section.headline,
          }),
          tags: cd.config.tagName,
          baserevid: targetPage.revisionId,
          starttimestamp: targetPage.queryTimestamp,
          formatversion: 2,
        }).catch(handleApiReject);
      } catch (e) {
        throw [cd.s('msd-error-editingtargetpage'), true];
      }

      const error = editTargetPageData.error;
      if (error) {
        if (error.code === 'editconflict') {
          throw [cd.s('msd-error-editconflict'), true];
        } else {
          throw [error.code + ': ' + error.info, true];
        }
      }
    };

    MoveSectionDialog.prototype.saveSourcePage = async function (sourcePage, targetPage) {
      const timestamp = findFirstTimestamp(sourcePage.sectionInCode.code) || '~~'.concat('~~', '~');

      const sourcePageNewSectionCode = (
        sourcePage.sectionInCode.code.slice(
          0,
          sourcePage.sectionInCode.contentStartIndex - sourcePage.sectionInCode.startIndex
        ) +
        cd.s(
          'move-sourcepagecode',
          targetPage.wikilink,
          cd.settings.mySignature,
          timestamp,
          { plain: true }
        ) +
        '\n\n'
      );
      const newSourcePageCode = (
        sourcePage.code.slice(0, sourcePage.sectionInCode.startIndex) +
        sourcePageNewSectionCode +
        sourcePage.code.slice(sourcePage.sectionInCode.endIndex)
      );

      const summaryEnding = this.summaryEndingInput.getValue();
      const text = (
        cd.s('es-moved-to', targetPage.wikilink) +
        (summaryEnding ? `: ${summaryEnding}` : '')
      );
      try {
        await cd.g.api.postWithToken('csrf', {
          action: 'edit',
          title: section.sourcePage,
          text: newSourcePageCode,
          summary: cd.util.buildEditSummary({
            text,
            section: section.headline,
          }),
          tags: cd.config.tagName,
          baserevid: sourcePage.revisionId,
          starttimestamp: sourcePage.queryTimestamp,
          formatversion: 2,
        }).catch(handleApiReject);
      } catch (e) {
        throw [cd.s('msd-error-editingsourcepage'), false];
      }
    };

    MoveSectionDialog.prototype.abort = function (html, recoverable) {
      const $body = animateLink(html, 'cd-message-reloadPage', () => {
        cd.g.windowManager.clearWindows();
        reloadPage();
      });
      this.showErrors(new OO.ui.Error($body, { recoverable }));
      if (!recoverable) {
        this.$errors.find('.oo-ui-buttonElement-button').on('click', () => {
          this.close();
        });
      }
      this.actions.setAbilities({
        close: true,
        move: recoverable,
      });
      cd.g.windowManager.updateWindowSize(this);
      this.popPending();
    };

    MoveSectionDialog.prototype.getBodyHeight = function () {
      return this.$errorItems ? this.$errors[0].scrollHeight : this.$body[0].scrollHeight;
    };

    MoveSectionDialog.prototype.initialize = function () {
      MoveSectionDialog.parent.prototype.initialize.apply(this, arguments);

      this.pushPending();

      const $loading = $('<div>').text(cd.s('loading-ellipsis'));
      this.loadingPanel = new OO.ui.PanelLayout({
        padded: true,
        expanded: false,
      });
      this.loadingPanel.$element.append($loading);

      this.movePanel = new OO.ui.PanelLayout({
        padded: true,
        expanded: false,
      });

      this.reloadPanel = new OO.ui.PanelLayout({
        padded: true,
        expanded: false,
      });

      this.stackLayout = new OO.ui.StackLayout({
        items: [this.loadingPanel, this.movePanel, this.reloadPanel],
      });
      this.$body.append(this.stackLayout.$element);
    };

    MoveSectionDialog.prototype.getSetupProcess = function (data) {
      return MoveSectionDialog.parent.prototype.getSetupProcess.call(this, data).next(() => {
        this.stackLayout.setItem(this.loadingPanel);
        this.actions.setMode('loading');
      });
    };

    MoveSectionDialog.prototype.getReadyProcess = function (data) {
      return MoveSectionDialog.parent.prototype.getReadyProcess.call(this, data).next(async () => {
        let page;
        try {
          [page] = await Promise.all(preparationRequests);
        } catch (e) {
          this.abort(cd.s('cf-error-getpagecode'), false);
          return;
        }

        try {
          section.locateInCode(page.code);
        } catch (e) {
          if (e instanceof CdError) {
            const { data } = e.data;
            const message = data === 'couldntLocateSection' ?
              cd.s('error-locatesection') :
              cd.s('error-unknown');
            this.abort(message, false);
          } else {
            this.abort(cd.s('error-javascript'), false);
          }
          return;
        }
        const sectionCode = section.inCode.code;

        this.titleInput = new mw.widgets.TitleInputWidget({
          $overlay: this.$overlay,
          excludeCurrentPage: true,
          validate: () => {
            let title = this.titleInput.getMWTitle();
            return (
              title &&
              title.toText() !== section.sourcePage &&
              isTalkNamespace(title.namespace)
            );
          },
        });
        this.titleField = new OO.ui.FieldLayout(this.titleInput, {
          label: cd.s('msd-targetpage'),
          align: 'top',
        });

        this.titleInput.connect(this, { 'change': 'onTitleInputChange' });
        this.titleInput.connect(this, {
          'enter': () => {
            if (!this.actions.get({ actions: 'move' })[0].isDisabled()) {
              this.executeAction('move');
            }
          },
        });

        let $sectionCodeNote = $('<div>');
        $('<pre>')
          .text(sectionCode.slice(0, 300) + (sectionCode.length >= 300 ? '...' : ''))
          .appendTo($sectionCodeNote);
        $('<p>')
          .css('font-size', '85%')
          .text(cd.s('msd-bottom'))
          .appendTo($sectionCodeNote);

        this.summaryEndingInput = new OO.ui.TextInputWidget({
          // TODO: take into account the whole summary length, updating the maximum value
          // dynamically.
          maxLength: 250,
        });
        this.summaryEndingField = new OO.ui.FieldLayout(this.summaryEndingInput, {
          label: cd.s('msd-summaryending'),
          align: 'top',
        });

        this.movePanel.$element.append(
          this.titleField.$element,
          $sectionCodeNote,
          this.summaryEndingField.$element
        );

        this.stackLayout.setItem(this.movePanel);
        this.titleInput.focus();
        this.actions.setMode('move').setAbilities({ close: true });

        // A dirty workaround to avoid the scrollbar appearing when the window is loading. Couldn't
        // figure out a way to do this out of the box.
        dialog.$body.css('overflow', 'hidden');
        setTimeout(() => {
          dialog.$body.css('overflow', '');
        }, 500);

        cd.g.windowManager.updateWindowSize(this);
        this.popPending();
      });
    };

    MoveSectionDialog.prototype.getActionProcess = function (action) {
      if (action === 'move') {
        return new OO.ui.Process(async () => {
          this.pushPending();
          this.titleInput.$input.blur();

          const targetPageTitle = this.titleInput.getMWTitle();
          // Should be ruled out by making the button disabled.
          if (
            !targetPageTitle ||
            targetPageTitle.toText() === section.sourcePage ||
            !isTalkNamespace(targetPageTitle.namespace)
          ) {
            this.abort(cd.s('msd-error-wrongpage'), false);
            return;
          }

          let sourcePage;
          let targetPage;
          try {
            [sourcePage, targetPage] = await Promise.all([
              this.loadSourcePage(),
              this.loadTargetPage(targetPageTitle)
            ]);
            await this.saveTargetPage(sourcePage, targetPage);
            await this.saveSourcePage(sourcePage, targetPage);
          } catch (e) {
            this.abort(...e);
            return;
          }

          this.reloadPanel.$element.html(cd.s('msd-moved', targetPage.sectionUrl));

          this.stackLayout.setItem(this.reloadPanel);
          this.actions.setMode('reload');
          this.popPending();
        });
      } else if (action === 'reload') {
        return new OO.ui.Process(() => {
          this.close({ action });
          reloadPage({ sectionAnchor: section.anchor });
        });
      } else if (action === 'close') {
        return new OO.ui.Process(() => {
          this.close();
        });
      }
      return MoveSectionDialog.parent.prototype.getActionProcess.call(this, action);
    };

    const section = this;

    // Make requests in advance.
    const preparationRequests = [
      getLastRevision(this.sourcePage),
      mw.loader.using('mediawiki.widgets'),
    ];

    const dialog = new MoveSectionDialog();
    cd.g.windowManager.addWindows([dialog]);
    const windowInstance = cd.g.windowManager.openWindow(dialog);
    windowInstance.closed.then(() => {
      cd.g.windowManager.clearWindows();
    });
  }

  /**
   * Update the watch/unwatch section links visibility.
   *
   * @private
   */
  updateWatchMenuItems() {
    if (this.isWatched) {
      this.$heading.find('.cd-sectionLink-unwatch').parent().show();
      this.$heading.find('.cd-sectionLink-watch').parent().hide();
    } else {
      this.$heading.find('.cd-sectionLink-watch').parent().show();
      this.$heading.find('.cd-sectionLink-unwatch').parent().hide();
    }
  }

  /**
   * Add the section to the watched sections list.
   *
   * @param {boolean} [silent=false] Don't show a notification or change UI unless there is a error.
   */
  watch(silent = false) {
    let $link;
    if (!silent) {
      $link = this.$heading.find('.cd-sectionLink-watch');
      if ($link.hasClass('cd-sectionLink-pending')) {
        return;
      } else {
        $link.addClass('cd-sectionLink-pending');
      }
    }
    Section.watchSection(
      this.headline,
      {
        silent,
        successCallback: () => {
          this.isWatched = true;
          if ($link) {
            $link.removeClass('cd-sectionLink-pending');
          }
          Section.getSectionsByHeadline(this.headline).forEach((section) => {
            section.updateWatchMenuItems();
          });
        },
        errorCallback: () => {
          if ($link) {
            $link.removeClass('cd-sectionLink-pending');
          }
        },
    });
  }

  /**
   * Remove the section from the watched sections list.
   *
   * @param {boolean} [silent=false] Don't show a notification or change UI unless there is a error.
   */
  unwatch(silent = false) {
    let $link;
    if (!silent) {
      $link = this.$heading.find('.cd-sectionLink-unwatch');
      if ($link.hasClass('cd-sectionLink-pending')) {
        return;
      } else {
        $link.addClass('cd-sectionLink-pending');
      }
    }
    const watchedAncestor = this.getWatchedAncestor();
    Section.unwatchSection(
      this.headline,
      {
        silent,
        successCallback: () => {
          this.isWatched = false;
          if ($link) {
            $link.removeClass('cd-sectionLink-pending');
          }
          Section.getSectionsByHeadline(this.headline).forEach((section) => {
            section.updateWatchMenuItems();
          });
        },
        errorCallback: () => {
          if ($link) {
            $link.removeClass('cd-sectionLink-pending');
          }
        },
        watchedAncestorHeadline: watchedAncestor && watchedAncestor.headline,
      }
    );
  }

  /**
   * Copy a link to the section or open a copy link dialog.
   *
   * @param {Event} e
   */
  copyLink(e) {
    e.preventDefault();
    copyLink(this, e.shiftKey);
  }

  /**
   * Locate the section in the page source code and set the result to the `inCode` property.
   *
   * @param {string} pageCode
   */
  locateInCode(pageCode) {
    this.inCode = null;

    const firstComment = this.comments[0];
    const headline = normalizeCode(this.headline);
    const adjustedPageCode = hideHtmlComments(pageCode);
    const searchInput = { firstComment, headline, pageCode, adjustedPageCode };

    cd.debug.startTimer('locate section');

    // Collect all possible matches
    const matches = this.searchInCode(searchInput);

    cd.debug.stopTimer('locate section');

    let bestMatch;
    matches.forEach((match) => {
      if (!bestMatch || match.score > bestMatch.score) {
        bestMatch = match;
      }
    });
    if (!bestMatch) {
      throw new CdError({
        type: 'parse',
        code: 'couldntLocateSection',
      });
    }

    this.inCode = bestMatch;
  }

  /**
   * Get the first upper level section relative to the current section that is watched.
   *
   * @param {boolean} includeCurrent Check the current section too.
   * @returns {?Section}
   */
  getWatchedAncestor(includeCurrent) {
    for (
      let otherSection = includeCurrent ? this : this.parent;
      otherSection;
      otherSection = otherSection.parent
    ) {
      if (otherSection.isWatched) {
        return otherSection;
      }
    }
    return null;
  }

  /**
   * Load the section code.
   *
   * @throws {CdError|Error}
   */
  async getCode() {
    try {
      const page = await getLastRevision(this.sourcePage);
      this.locateInCode(page.code);
    } catch (e) {
      if (e instanceof CdError) {
        throw new CdError(Object.assign({}, { message: cd.s('cf-error-getpagecode') }, e.data));
      } else {
        throw e;
      }
    }
  }

  /**
   * Add an item to the section menu (to the right from the section headline).
   *
   * @param {object} item
   * @param {string} item.label Item label.
   * @param {string} [item.href] Value of the item href attribute.
   * @param {Function} [item.func] Function to execute on click.
   * @param {string} [item.class] Link class name.
   * @param {string} [item.tooltip] Tooltip text.
   * @param {boolean} [item.visible=true] Should the item be visible.
   */
  addMenuItem({ label, href, func, class: className, tooltip, visible = true }) {
    if (this.#closingBracketElement) {
      const wrapper = document.createElement('span');
      wrapper.className = 'cd-sectionLinkWrapper';
      if (!visible) {
        wrapper.style.display = 'none';
      }

      const a = document.createElement('a');
      a.textContent = label;
      if (href) {
        a.href = href;
      }
      if (func) {
        a.onclick = func;
      }
      a.className = 'cd-sectionLink';
      if (className) {
        a.className += ' ' + className;
      }
      if (tooltip) {
        a.title = tooltip;
      }

      wrapper.appendChild(a);
      this.#editSectionElement.insertBefore(wrapper, this.#closingBracketElement);
    }
  }

  /**
   * Section elements as a jQuery object.
   *
   * @type {JQuery}
   */
  // Using a getter allows to save a little time on running $().
  get $elements() {
    if (this.#cached$elements === undefined) {
      this.#cached$elements = $(this.elements);
    }
    return this.#cached$elements;
  }

  set $elements(value) {
    this.#cached$elements = value;
    this.elements = value.get();
  }

  /**
   * Search for the section in the source code and return possible matches.
   *
   * @param {object} options
   * @param {Comment} options.firstComment
   * @param {string} options.headline
   * @param {string} options.pageCode
   * @param {string} options.adjustedPageCode
   * @returns {object}
   * @private
   */
  searchInCode({ firstComment, headline, pageCode, adjustedPageCode }) {
    const sectionHeadingRegexp = /^((=+)(.*?)\2[ \t]*(?:<!--[^]*?-->[ \t]*)*)\n/gm;
    const matches = [];
    const headlines = [];
    let sectionIndex = 0;
    let sectionHeadingMatch;
    while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedPageCode))) {
      const thisHeadline = normalizeCode(removeWikiMarkup(sectionHeadingMatch[3]));
      const headlineMatched = thisHeadline === headline;

      let numberOfPreviousHeadlinesToCheck = 3;
      const previousHeadlinesInCode = headlines
        .slice(-numberOfPreviousHeadlinesToCheck)
        .reverse();
      const previousHeadlines = cd.sections
        .slice(Math.max(0, this.id - numberOfPreviousHeadlinesToCheck), this.id)
        .reverse()
        .map((section) => section.headline);
      const previousHeadlinesMatched = previousHeadlines
        .every((headline, i) => normalizeCode(headline) === previousHeadlinesInCode[i]);
      headlines.push(thisHeadline);

      // Matching section index is one of the most unreliable ways to tell matching sections as
      // sections may be added and removed from the page, so we don't rely on it very much.
      const sectionIndexMatched = this.id === sectionIndex;
      sectionIndex++;

      // Get the section content
      const fullHeadingMatch = sectionHeadingMatch[1];
      const equalSigns = sectionHeadingMatch[2];
      const equalSignsPattern = `={1,${equalSigns.length}}`;
      const codeFromSection = pageCode.slice(sectionHeadingMatch.index);
      const adjustedCodeFromSection = adjustedPageCode.slice(sectionHeadingMatch.index);
      const sectionMatch = (
        adjustedCodeFromSection.match(
          // Will fail at "===" or the like.
          '(' +
          mw.util.escapeRegExp(fullHeadingMatch) +
          '[^]*?\n)' +
          equalSignsPattern +
          '[^=].*?=+[ \t]*(?:<!--[^]*?-->[ \t]*)*\n'
        ) ||
        codeFromSection.match(
          '(' +
          mw.util.escapeRegExp(fullHeadingMatch) +
          '[^]*$)'
        )
      );

      // To simplify the workings of the "replyInSection" mode we don't consider terminating line
      // breaks to be a part of the first section chunk (i.e. the section subdivision before the
      // first heading).
      const firstChunkMatch = (
        adjustedCodeFromSection.match(
          // Will fail at "===" or the like.
          '(' +
          mw.util.escapeRegExp(fullHeadingMatch) +
          '[^]*?\n)\n*' +

          // Any next heading.
          '={1,6}' +

          '[^=].*?=+[ \t]*(?:<!--[^]*?-->[ \t]*)*\n'
        ) ||
        codeFromSection.match(
          '(' +
          mw.util.escapeRegExp(fullHeadingMatch) +
          '[^]*$)'
        )
      );
      const code = (
        sectionMatch && codeFromSection.substr(sectionMatch.index, sectionMatch[1].length)
      );
      const firstChunkCode = (
        firstChunkMatch &&
        codeFromSection.substr(firstChunkMatch.index, firstChunkMatch[1].length)
      );

      if (!code || !firstChunkCode) {
        console.log(`Couldn't read the "${thisHeadline}" section contents.`);
        continue;
      }

      const signatures = extractSignatures(code);
      let firstCommentMatched;
      if (signatures.length) {
        firstCommentMatched = (
          Boolean(firstComment) &&
          (
            signatures[0].timestamp === firstComment.timestamp ||
            signatures[0].author === firstComment.author
          )
        );
      } else {
        // There's no comments neither in the code nor on the page.
        firstCommentMatched = !this.comments.length;
      }

      const score = (
        headlineMatched * 1 +
        firstCommentMatched * 1 +
        sectionIndexMatched * 0.5 +
        // Shouldn't give too high a weight to this factor as it is true for every first section.
        previousHeadlinesMatched * 0.25
      );
      if (score <= 1) continue;

      const startIndex = sectionHeadingMatch.index;
      const endIndex = startIndex + code.length;
      const contentStartIndex = sectionHeadingMatch.index + sectionHeadingMatch[0].length;
      const firstChunkEndIndex = startIndex + firstChunkCode.length;

      let firstChunkContentEndIndex = firstChunkEndIndex;
      let contentEndIndex = endIndex;
      cd.config.keepInSectionEnding.forEach((regexp) => {
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

      // Sections may have "#" as a placeholder for a vote. In this case, we must use that "#" in
      // the reply.
      if (!this.comments.length) {
        const match = firstChunkCode.match(/\n(# *\n+)$/);
        if (match) {
          firstChunkContentEndIndex -= match[1].length;
        }
      }

      matches.push({
        headlineMatched,
        firstCommentMatched,
        sectionIndexMatched,
        previousHeadlinesMatched,
        score,
        startIndex,
        endIndex,
        code,
        contentStartIndex,
        contentEndIndex,
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
   * Add a section on the current page to the watched sections list.
   *
   * @param {string} headline
   * @param {boolean} [options]
   * @param {boolean} [options.silent=false] Don't display a success notification.
   * @param {Function} [options.successCallback]
   * @param {Function} [options.errorCallback]
   */
  static async watchSection(headline, { silent = false, successCallback, errorCallback }) {
    if (!headline) return;

    let watchedSections;
    let thisPageWatchedSections;
    try {
      ({ watchedSections, thisPageWatchedSections } = await getWatchedSections());
    } catch (e) {
      mw.notify(cd.s('section-watch-error-load'), { type: 'error' });
      if (errorCallback) {
        errorCallback();
      }
      return;
    }

    // The section could be watched in another tab.
    if (!thisPageWatchedSections.includes(headline)) {
      thisPageWatchedSections.push(headline);
    }

    try {
      await setWatchedSections(watchedSections);
    } catch (e) {
      if (e instanceof CdError) {
        const { type, code } = e.data;
        if (type === 'internal' && code === 'sizeLimit') {
          const $body = animateLink(
            cd.s('section-watch-error-maxsize'),
            'cd-notification-editWatchedSections',
            (e) => {
              e.preventDefault();
              editWatchedSections();
            }
          );
          mw.notify($body, { type: 'error' });
        } else {
          mw.notify(cd.s('section-watch-error-save'), { type: 'error' });
        }
      } else {
        mw.notify(cd.s('section-watch-error-save'), { type: 'error' });
      }
      if (errorCallback) {
        errorCallback();
      }
      return;
    }

    if (!silent) {
      let text = cd.s('section-watch-success', headline);
      if ($('#ca-watch').length) {
        text += ` ${cd.s('section-watch-pagenotwatched')}`;
      }
      mw.notify(cd.util.wrapInElement(text));
    }
    if (successCallback) {
      successCallback();
    }
  }

  /**
   * Add a section on the current page to the watched sections list.
   *
   * @param {string} headline
   * @param {boolean} [options]
   * @param {boolean} [options.silent=false] Don't display a success notification.
   * @param {Function} [options.successCallback]
   * @param {Function} [options.errorCallback]
   * @param {string} [options.watchedAncestorHeadline] Headline of the ancestor section that is
   *   watched.
   */
  static async unwatchSection(
    headline,
    { silent = false, successCallback, errorCallback, watchedAncestorHeadline }
  ) {
    if (!headline) return;

    let watchedSections;
    let thisPageWatchedSections;
    try {
      ({ watchedSections, thisPageWatchedSections } = await getWatchedSections());
    } catch (e) {
      mw.notify(cd.s('section-watch-error-load'), { type: 'error' });
      if (errorCallback) {
        errorCallback();
      }
      return;
    }

    // The section could be unwatched in another tab.
    if (thisPageWatchedSections.includes(headline)) {
      thisPageWatchedSections.splice(thisPageWatchedSections.indexOf(headline), 1);
    }
    if (!thisPageWatchedSections.length) {
      delete watchedSections[mw.config.get('wgArticleId')];
    }

    try {
      await setWatchedSections(watchedSections);
    } catch (e) {
      mw.notify(cd.s('section-watch-error-save'), { type: 'error' });
      if (errorCallback) {
        errorCallback();
      }
      return;
    }

    let text = cd.s('section-unwatch-success', headline);
    if (watchedAncestorHeadline) {
      text += ` ${cd.s('section-unwatch-stillwatched', watchedAncestorHeadline)}`;
    }
    if (!silent || watchedAncestorHeadline) {
      mw.notify(cd.util.wrapInElement(text));
    }
    if (successCallback) {
      successCallback();
    }
  }

  /**
   * Get the section by anchor.
   *
   * @param {string} anchor
   * @returns {?Section}
   */
  static getSectionByAnchor(anchor) {
    if (!cd.sections || !anchor) {
      return null;
    }
    return cd.sections.find((section) => section.anchor === anchor) || null;
  }

  /**
   * Get the sections by headline.
   *
   * @param {string} headline
   * @returns {Section[]}
   */
  static getSectionsByHeadline(headline) {
    return cd.sections.filter((section) => section.headline === headline);
  }

  /**
   * Get the section by headline, first comment data, and/or index. At least two parameters must
   * match.
   *
   * @param {object} options
   * @param {string} options.headline
   * @param {string} options.firstCommentAnchor
   * @param {number} options.index
   * @returns {?Section}
   */
  static search({ headline, firstCommentAnchor, index }) {
    const matches = [
      ...cd.sections.filter((section) => section.headline === headline),
      ...cd.sections.filter((section) => (
        section.comments[0] && section.comments[0].anchor === firstCommentAnchor
      )),
    ];
    if (cd.sections[index]) {
      matches.push(cd.sections[index]);
    }
    const scores = {};
    matches.forEach((match) => {
      if (!scores[match.id]) {
        scores[match.id] = 0;
      }
      scores[match.id]++;
    });
    const bestMatchId = Object.keys(scores).reduce(
      (bestMatchId, matchId) => (
        scores[matchId] >= 2 && (bestMatchId === null || scores[matchId] > scores[bestMatchId]) ?
        matchId :
        bestMatchId
      ),
      null
    );
    return bestMatchId !== null ? cd.sections[bestMatchId] : null;
  }
}
