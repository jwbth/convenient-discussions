/**
 * Section class.
 *
 * @module Section
 */

import Autocomplete from './Autocomplete';
import CdError from './CdError';
import CommentForm from './CommentForm';
import Page from './Page';
import SectionSkeleton from './SectionSkeleton';
import cd from './cd';
import { copyLink } from './modal.js';
import { dealWithLoadingBug } from './util';
import { editWatchedSections } from './modal';
import {
  encodeWikilink,
  endWithTwoNewlines,
  extractSignatures,
  findFirstTimestamp,
  hideDistractingCode,
  normalizeCode,
  removeWikiMarkup,
} from './wikitext';
import { getWatchedSections, setWatchedSections } from './options';
import { reloadPage } from './boot';

/**
 * Class representing a section.
 *
 * @augments module:SectionSkeleton
 */
export default class Section extends SectionSkeleton {
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

    this.elementPrototypes = cd.g.SECTION_ELEMENT_PROTOTYPES;

    /**
     * Section headline element as a jQuery object.
     *
     * @type {JQuery}
     */
    this.$headline = $(this.headlineElement);

    /**
     * Wiki page that has the source code of the section (may be different from the current page if
     * the section is transcluded from another page). This property may also be wrong on old version
     * pages where there are no edit section links.
     *
     * @type {string}
     */
    this.sourcePage = cd.g.CURRENT_PAGE;

    this.editSectionElement = headingElement.querySelector('.mw-editsection');
    if (this.editSectionElement) {
      this.closingBracketElement = this.editSectionElement.lastElementChild;
      if (!this.closingBracketElement?.classList?.contains('mw-editsection-bracket')) {
        this.closingBracketElement = null;
      }

      const editLink = this.editSectionElement
        .querySelector('a[href*="&action=edit"], a[href*="&veaction=editsource"]');
      if (editLink) {
        /**
         * URL to edit the section.
         *
         * @type {URL}
         */
        this.editUrl = new URL(editLink.href);
        if (this.editUrl) {
          const sectionNumber = this.editUrl.searchParams.get('section');
          if (sectionNumber.startsWith('T-')) {
            this.sourcePage = new Page(this.editUrl.searchParams.get('title'));
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
       * Is the section actionable (is in a closed discussion or on an old version page).
       *
       * @type {boolean}
       */
      this.actionable = (
        cd.g.isPageActive &&
        !cd.g.specialElements.closedDiscussions.some((el) => el.contains(headingElement))
      );

      if (this.actionable) {
        this.extendSectionMenu(watchedSectionsRequest);
      }
    }
  }

  /**
   * Add the "Reply" button to the end of the first chunk of the section.
   */
  addReplyButton() {
    const replyButton = this.elementPrototypes.replyButton.cloneNode(true);
    replyButton.firstChild.onclick = () => {
      this.addReply();
    };

    // Sections may have "#" in the code as a placeholder for a vote. In this case, we must create
    // the comment form in the <ol> tag.
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
          // Check if this is indeed a numbered list with replies as list items, not a numbered list
          // as part of the user's comment that has their signature technically inside the last
          // item.
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

    // Container contains wrapper that contains element ^_^
    let replyContainer;
    if (createUl) {
      replyContainer = document.createElement('ul');
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
     * Reply button on the bottom of the first chunk of the section.
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
    this.$replyContainer = replyContainer && $(replyContainer);
  }

  /**
   * Add the "Add subsection" button that appears when hovering over the "Reply" button.
   */
  addAddSubsectionButton() {
    if (this.level !== 2) return;

    const addSubsectionButton = this.elementPrototypes.addSubsectionButton.cloneNode(true);
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

    const deferAddSubsectionButtonHide = () => {
      if (!this.hideAddSubsectionButtonTimeout) {
        this.hideAddSubsectionButtonTimeout = setTimeout(() => {
          this.$addSubsectionButtonContainer.hide();
        }, 1000);
      }
    };

    addSubsectionButton.firstChild.onmouseenter = () => {
      clearTimeout(this.hideAddSubsectionButtonTimeout);
      this.hideAddSubsectionButtonTimeout = null;
    };
    addSubsectionButton.firstChild.onmouseleave = () => {
      deferAddSubsectionButtonHide();
    };

    this.replyButtonHoverHandler = () => {
      if (this.addSubsectionForm) return;

      clearTimeout(this.hideAddSubsectionButtonTimeout);
      this.hideAddSubsectionButtonTimeout = null;

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

    /**
     * Add subsection button in the end of the section.
     *
     * @type {JQuery|undefined}
     */
    this.$addSubsectionButton = $(addSubsectionButton);

    /**
     * Add subsection button container.
     *
     * @type {JQuery|undefined}
     */
    this.$addSubsectionButtonContainer = $(addSubsectionButtonContainer);
  }

  /**
   * Add section menu items.
   *
   * @param {Promise} [watchedSectionsRequest]
   * @fires sectionMenuExtended
   * @private
   */
  extendSectionMenu(watchedSectionsRequest) {
    if (
      this.comments.length &&
      this.comments[0].isOpeningSection &&
      this.comments[0].openingSectionOfLevel === this.level &&
      (this.comments[0].isOwn || cd.settings.allowEditOthersComments) &&
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
      watchedSectionsRequest
        .then(
          () => {
            if (this.headline) {
              this.isWatched = cd.g.thisPageWatchedSections.includes(this.headline);
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
          },
          () => {}
        )
        .finally(() => {
          const stringName = `sm-copylink-tooltip-${cd.settings.defaultSectionLinkType.toLowerCase()}`;

          // We put it here to make it appear always after the "watch" item.
          this.addMenuItem({
            label: cd.s('sm-copylink'),
            // We need the event object to be passed to the function.
            func: this.copyLink.bind(this),
            class: 'cd-sectionLink-copyLink',
            tooltip: cd.s(stringName) + ' ' + cd.s('cld-invitation'),
            href: `${cd.g.CURRENT_PAGE.getUrl()}#${this.anchor}`,
          });

          /**
           * Section menu has been extneded.
           *
           * @event sectionMenuExtended
           * @type {module:cd~convenientDiscussions}
           */
          mw.hook('convenientDiscussions.sectionMenuExtended').fire(this);
        });
    }
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

    const baseSection = this.getBase();
    if (baseSection.$addSubsectionButtonContainer) {
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
        modes: ['move', 'reload'],
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

    MoveSectionDialog.prototype.loadSourcePage = async function () {
      try {
        await section.getSourcePage().getCode();
      } catch (e) {
        if (e instanceof CdError) {
          const { type, code } = e.data;
          if (type === 'api') {
            if (code === 'missing') {
              throw [cd.sParse('msd-error-sourcepagedeleted'), true];
            } else {
              throw [cd.sParse('error-api', code), true];
            }
          } else if (type === 'network') {
            throw [cd.sParse('error-network'), true];
          }
        } else {
          throw [cd.sParse('error-javascript'), false];
        }
      }

      try {
        section.locateInCode();
      } catch (e) {
        if (e instanceof CdError) {
          const { code } = e.data;
          let message;
          if (code === 'locateSection') {
            message = cd.sParse('error-locatesection');
          } else {
            message = cd.sParse('error-unknown');
          }
          throw [message, true];
        } else {
          throw [cd.sParse('error-javascript'), false];
        }
      }

      return {
        page: section.getSourcePage(),
        sectionInCode: section.inCode,
        sectionWikilink: `${section.getSourcePage().name}#${encodeWikilink(section.headline)}`,
      };
    };

    MoveSectionDialog.prototype.loadTargetPage = async function (targetPage) {
      try {
        await targetPage.getCode();
      } catch (e) {
        if (e instanceof CdError) {
          const { type, code } = e.data;
          if (type === 'api') {
            if (code === 'missing') {
              throw [cd.sParse('msd-error-targetpagedoesntexist'), true];
            } else if (code === 'invalid') {
              // Must be filtered before submit.
              throw [cd.sParse('msd-error-invalidpagename'), false];
            } else {
              throw [cd.sParse('error-api', code), true];
            }
          } else if (type === 'network') {
            throw [cd.sParse('error-network'), true];
          }
        } else {
          throw [cd.sParse('error-javascript'), false];
        }
      }

      targetPage.inferNewTopicPlacement();
      const sectionWikilink = `${targetPage.realName}#${encodeWikilink(section.headline)}`;

      return {
        page: targetPage,
        sectionWikilink,
      };
    };

    MoveSectionDialog.prototype.editTargetPage = async function (source, target) {
      let codeBeginning;
      let codeEnding;
      if (cd.config.getMoveTargetPageCode) {
        const code = (
          cd.config.getMoveTargetPageCode(source.sectionWikilink, cd.g.CURRENT_USER_SIGNATURE)
        );
        if (Array.isArray(code)) {
          codeBeginning = code[0] + '\n';
          codeEnding = '\n' + code[1];
        } else {
          codeBeginning = code;
          codeEnding = '';
        }
      } else {
        codeBeginning = '';
        codeEnding = '';
      }

      const newSectionCode = endWithTwoNewlines(
        source.sectionInCode.code.slice(0, source.sectionInCode.relativeContentStartIndex) +
        codeBeginning +
        source.sectionInCode.code.slice(source.sectionInCode.relativeContentStartIndex) +
        codeEnding
      );

      let newCode;
      if (target.page.areNewTopicsOnTop) {
        // The page has no sections, so we add to the bottom.
        if (target.page.firstSectionStartIndex === undefined) {
          target.page.firstSectionStartIndex = target.page.code.length;
        }
        newCode = (
          endWithTwoNewlines(target.page.code.slice(0, target.page.firstSectionStartIndex)) +
          newSectionCode +
          target.page.code.slice(target.page.firstSectionStartIndex)
        );
      } else {
        newCode = target.page.code + '\n\n' + newSectionCode;
      }

      const summaryEnding = this.summaryEndingInput.getValue();
      const summary = (
        cd.s('es-move-from', source.sectionWikilink) +
        (summaryEnding ? cd.mws('colon-separator') + summaryEnding : '')
      );
      try {
        await target.page.edit({
          text: newCode,
          summary: cd.util.buildEditSummary({
            text: summary,
            section: section.headline,
          }),
          tags: cd.config.tagName,
          baserevid: target.page.revisionId,
          starttimestamp: target.page.queryTimestamp,
        });
      } catch (e) {
        if (e instanceof CdError) {
          const { type, details } = e.data;
          if (type === 'network') {
            throw [
              cd.sParse('msd-error-editingtargetpage') + ' ' + cd.sParse('error-network'),
              true,
            ];
          } else {
            let { code, message, logMessage } = details;
            if (code === 'editconflict') {
              message += ' ' + cd.sParse('msd-error-editconflict-retry');
            }
            console.warn(logMessage);
            throw [cd.sParse('msd-error-editingtargetpage') + ' ' + message, true];
          }
        } else {
          console.warn(e);
          throw [
            cd.sParse('msd-error-editingtargetpage') + ' ' + cd.sParse('error-javascript'),
            true,
          ];
        }
      }
    };

    MoveSectionDialog.prototype.editSourcePage = async function (source, target) {
      const timestamp = findFirstTimestamp(source.sectionInCode.code) || cd.g.SIGN_CODE + '~';

      let newSectionCode;
      if (cd.config.getMoveSourcePageCode) {
        const code = cd.config.getMoveSourcePageCode(
          target.sectionWikilink,
          cd.g.CURRENT_USER_SIGNATURE,
          timestamp
        );
        newSectionCode = (
          source.sectionInCode.code.slice(
            0,
            source.sectionInCode.relativeContentStartIndex
          ) +
          code +
          '\n\n'
        );
      } else {
        newSectionCode = '';
      }

      const newCode = (
        source.page.code.slice(0, source.sectionInCode.startIndex) +
        newSectionCode +
        source.page.code.slice(source.sectionInCode.endIndex)
      );

      const summaryEnding = this.summaryEndingInput.getValue();
      const summary = (
        cd.s('es-move-to', target.sectionWikilink) +
        (summaryEnding ? cd.mws('colon-separator') + summaryEnding : '')
      );

      try {
        await source.page.edit({
          text: newCode,
          summary: cd.util.buildEditSummary({
            text: summary,
            section: section.headline,
          }),
          tags: cd.config.tagName,
          baserevid: source.page.revisionId,
          starttimestamp: source.page.queryTimestamp,
        });
      } catch (e) {
        if (e instanceof CdError) {
          const { type, details } = e.data;
          if (type === 'network') {
            throw [
              cd.sParse('msd-error-editingsourcepage') + ' ' + cd.sParse('error-network'),
              false,
            ];
          } else {
            let { message, logMessage } = details;
            console.warn(logMessage);
            throw [cd.sParse('msd-error-editingsourcepage') + ' ' + message, false];
          }
        } else {
          console.warn(e);
          throw [
            cd.sParse('msd-error-editingsourcepage') + ' ' + cd.sParse('error-javascript'),
            false,
          ];
        }
      }
    };

    MoveSectionDialog.prototype.abort = function (html, recoverable) {
      const $body = cd.util.wrap(html, {
        callbacks: {
          'cd-message-reloadPage': () => {
            this.close();
            reloadPage();
          },
        },
      });
      const error = new OO.ui.Error($body, { recoverable })
      this.showErrors(error);
      this.$errors
        .find('.oo-ui-buttonElement-button')
        .on('click', () => {
          if (recoverable) {
            cd.g.windowManager.updateWindowSize(this);
          } else {
            this.close();
          }
        });
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
        this.actions.setMode('move');
      });
    };

    MoveSectionDialog.prototype.getReadyProcess = function (data) {
      return MoveSectionDialog.parent.prototype.getReadyProcess.call(this, data).next(async () => {
        try {
          await Promise.all(preparationRequests);
        } catch (e) {
          this.abort(cd.sParse('cf-error-getpagecode'), false);
          return;
        }

        try {
          section.locateInCode();
        } catch (e) {
          if (e instanceof CdError) {
            const { data } = e.data;
            const message = data === 'locateSection' ?
              cd.sParse('error-locatesection') :
              cd.sParse('error-unknown');
            this.abort(message, false);
          } else {
            this.abort(cd.sParse('error-javascript'), false);
          }
          return;
        }
        const sectionCode = section.inCode.code;

        this.titleInput = new mw.widgets.TitleInputWidget({
          $overlay: this.$overlay,
          excludeCurrentPage: true,
          showMissing: false,
          validate: () => {
            const title = this.titleInput.getMWTitle();
            const page = title && new Page(title);
            return page && page.name !== section.getSourcePage().name && page.isProbablyTalkPage();
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
        this.summaryEndingAutocomplete = new Autocomplete({
          types: ['mentions', 'wikilinks'],
          inputs: [this.summaryEndingInput],
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
        this.actions.setAbilities({ close: true });

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

          let targetPage = new Page(this.titleInput.getMWTitle());
          // Should be ruled out by making the button disabled.
          if (
            targetPage.name === section.getSourcePage().name ||
            !targetPage.isProbablyTalkPage()
          ) {
            this.abort(cd.sParse('msd-error-wrongpage'), false);
            return;
          }

          let source;
          let target;
          try {
            [source, target] = await Promise.all([
              this.loadSourcePage(),
              this.loadTargetPage(targetPage),
            ]);
            await this.editTargetPage(source, target);
            await this.editSourcePage(source, target);
          } catch (e) {
            this.abort(...e);
            return;
          }

          this.reloadPanel.$element.append(
            cd.util.wrap(cd.sParse('msd-moved', target.sectionWikilink), { tagName: 'div' })
          );

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

    if (dealWithLoadingBug('mediawiki.widgets')) return;

    // Make requests in advance.
    const preparationRequests = [
      this.getSourcePage().getCode(),
      mw.loader.using('mediawiki.widgets'),
    ];

    const dialog = new MoveSectionDialog();
    cd.g.windowManager.addWindows([dialog]);
    cd.g.windowManager.openWindow(dialog);
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
        watchedAncestorHeadline: watchedAncestor?.headline,
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
   * @throws {CdError}
   */
  locateInCode() {
    this.inCode = null;

    const pageCode = this.getSourcePage().code;

    const firstComment = this.comments[0];
    const headline = normalizeCode(this.headline);
    const adjustedPageCode = hideDistractingCode(pageCode);
    const searchInput = { firstComment, headline, pageCode, adjustedPageCode };

    // Collect all possible matches
    const matches = this.searchInCode(searchInput);

    let bestMatch;
    matches.forEach((match) => {
      if (!bestMatch || match.score > bestMatch.score) {
        bestMatch = match;
      }
    });
    if (!bestMatch) {
      throw new CdError({
        type: 'parse',
        code: 'locateSection',
      });
    }

    this.inCode = bestMatch;
  }

  /**
   * Modify a page code string related to the section in accordance with an action.
   *
   * @param {object} options
   * @param {string} options.pageCode
   * @param {string} options.action
   * @param {string} options.commentForm
   * @returns {string}
   */
  modifyCode({ pageCode, action, commentForm }) {
    if (action === 'replyInSection') {
      // Detect the last section comment's indentation characters if needed or a vote / bulleted
      // reply placeholder.
      const [, replyPlaceholder] = this.inCode.firstChunkCode.match(/\n([#*]) *\n+$/) || [];
      if (replyPlaceholder) {
        this.inCode.lastCommentIndentationChars = replyPlaceholder;
      } else {
        const lastComment = this.comments[this.comments.length - 1];
        if (
          lastComment &&
          (commentForm.containerListType === 'ol' || cd.config.indentationCharMode === 'mimic')
        ) {
          try {
            lastComment.locateInCode();
          } finally {
            if (
              lastComment.inCode &&
              (
                !lastComment.inCode.indentationChars.startsWith('#') ||
                // For now we use the workaround with commentForm.containerListType to make sure "#"
                // is a part of comments organized in a numbered list, not of a numbered list _in_
                // the target comment.
                commentForm.containerListType === 'ol'
              )
            ) {
              this.inCode.lastCommentIndentationChars = lastComment.inCode.indentationChars;
            }
          }
        }
      }
    }

    let commentCode;
    if (!commentCode && commentForm) {
      ({ commentCode } = commentForm.commentTextToCode('submit'));
    }

    let newPageCode;
    let codeBeforeInsertion;
    switch (action) {
      case 'replyInSection': {
        codeBeforeInsertion = pageCode.slice(0, this.inCode.firstChunkContentEndIndex);
        const codeAfterInsertion = pageCode.slice(this.inCode.firstChunkContentEndIndex);
        newPageCode = codeBeforeInsertion + commentCode + codeAfterInsertion;
        break;
      }

      case 'addSubsection': {
        codeBeforeInsertion = endWithTwoNewlines(pageCode.slice(0, this.inCode.contentEndIndex));
        const codeAfterInsertion = pageCode.slice(this.inCode.contentEndIndex);
        newPageCode = codeBeforeInsertion + commentCode + codeAfterInsertion;
        break;
      }
    }

    return { newPageCode, codeBeforeInsertion, commentCode };
  }

  /**
   * Get the first upper level section relative to the current section that is watched.
   *
   * @param {boolean} includeCurrent Check the current section too.
   * @returns {?Section}
   */
  getWatchedAncestor(includeCurrent) {
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
   * Load the section code.
   *
   * @throws {CdError|Error}
   */
  async getCode() {
    try {
      await this.getSourcePage().getCode();
      this.locateInCode();
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
  addMenuItem({
    label,
    href,
    func,
    class: className,
    tooltip,
    visible = true,
  }) {
    if (this.closingBracketElement) {
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
      this.editSectionElement.insertBefore(wrapper, this.closingBracketElement);
    }
  }

  /**
   * Section elements as a jQuery object.
   *
   * Uses a getter mostly for unification with {@link module:Comment#$elements}.
   *
   * @type {JQuery}
   */
  get $elements() {
    if (this.cached$elements === undefined) {
      this.cached$elements = $(this.elements);
    }
    return this.cached$elements;
  }

  set $elements(value) {
    this.cached$elements = value;
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
    const sectionHeadingRegexp = /^((=+)(.*)\2[ \t\x01\x02]*)\n/gm;

    const matches = [];
    const headlines = [];
    let sectionIndex = 0;
    let sectionHeadingMatch;
    while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedPageCode))) {
      const thisHeadline = normalizeCode(removeWikiMarkup(sectionHeadingMatch[3]));
      const hasHeadlineMatched = thisHeadline === headline;

      let numberOfPreviousHeadlinesToCheck = 3;
      const previousHeadlinesInCode = headlines
        .slice(-numberOfPreviousHeadlinesToCheck)
        .reverse();
      const previousHeadlines = cd.sections
        .slice(Math.max(0, this.id - numberOfPreviousHeadlinesToCheck), this.id)
        .reverse()
        .map((section) => section.headline);
      const havePreviousHeadlinesMatched = previousHeadlines
        .every((headline, i) => normalizeCode(headline) === previousHeadlinesInCode[i]);
      headlines.push(thisHeadline);

      // Matching section index is one of the most unreliable ways to tell matching sections as
      // sections may be added and removed from the page, so we don't rely on it very much.
      const hasSectionIndexMatched = this.id === sectionIndex;
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
        console.log(`Couldn't read the "${thisHeadline}" section contents.`);
        continue;
      }

      const signatures = extractSignatures(code);
      let hasFirstCommentMatched;
      if (signatures.length) {
        hasFirstCommentMatched = (
          Boolean(firstComment) &&
          (
            signatures[0].timestamp === firstComment.timestamp ||
            signatures[0].author === firstComment.author
          )
        );
      } else {
        // There's no comments neither in the code nor on the page.
        hasFirstCommentMatched = !this.comments.length;
      }

      const score = (
        hasHeadlineMatched * 1 +
        hasFirstCommentMatched * 1 +
        hasSectionIndexMatched * 0.5 +
        // Shouldn't give too high a weight to this factor as it is true for every first section.
        havePreviousHeadlinesMatched * 0.25
      );
      if (score <= 1) continue;

      const startIndex = sectionHeadingMatch.index;
      const endIndex = startIndex + code.length;
      const contentStartIndex = sectionHeadingMatch.index + sectionHeadingMatch[0].length;
      const firstChunkEndIndex = startIndex + firstChunkCode.length;
      const relativeContentStartIndex = contentStartIndex - startIndex;

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
        hasHeadlineMatched,
        hasFirstCommentMatched,
        hasSectionIndexMatched,
        havePreviousHeadlinesMatched,
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
   * Get the parent section of the section if the section is lower than level 2.
   *
   * @returns {?Section}
   */
  getParent() {
    return (
      cd.sections
        .slice(0, this.id)
        .reverse()
        .find((section) => section.level < this.level) ||
      null
    );
  }

  /**
   * Get the collection of the section's subsections.
   *
   * @param {boolean} [indirect=false] Whether to include subsections of subsections and so on.
   * @returns {Section[]}
   */
  getChildren(indirect = false) {
    const children = [];
    cd.sections
      .slice(this.id + 1)
      .some((section) => {
        if (section.level > this.level) {
          if (indirect || section.level === this.level + 1) {
            children.push(section);
          }
        } else {
          return true;
        }
      });

    return children;
  }

  /**
   * Add a section on the current page to the watched sections list.
   *
   * @param {string} headline
   * @param {boolean} [options]
   * @param {boolean} [options.silent=false] Don't display a success notification.
   * @param {Function} [options.successCallback] Callback to run in case of success.
   * @param {Function} [options.errorCallback] Callback to run in case of an error.
   */
  static async watchSection(headline, {
    silent = false,
    successCallback,
    errorCallback,
  }) {
    if (!headline) return;

    try {
      await getWatchedSections();
    } catch (e) {
      mw.notify(cd.s('section-watch-error-load'), { type: 'error' });
      if (errorCallback) {
        errorCallback();
      }
      return;
    }

    // The section could be watched in another tab.
    if (!cd.g.thisPageWatchedSections.includes(headline)) {
      cd.g.thisPageWatchedSections.push(headline);
    }

    try {
      await setWatchedSections();
    } catch (e) {
      if (e instanceof CdError) {
        const { type, code } = e.data;
        if (type === 'internal' && code === 'sizeLimit') {
          const $body = cd.util.wrap(cd.sParse('section-watch-error-maxsize'), {
            callbacks: {
              'cd-notification-editWatchedSections': () => {
                editWatchedSections();
              },
            },
          });
          mw.notify($body, {
            type: 'error',
            autoHideSeconds: 'long',
          });
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
      let text = cd.sParse('section-watch-success', headline);
      let autoHideSeconds;
      if ($('#ca-watch').length) {
        text += ' ' + cd.sParse('section-watch-pagenotwatched');
        autoHideSeconds = 'long';
      }
      mw.notify(cd.util.wrap(text), { autoHideSeconds });
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
   * @param {Function} [options.successCallback] Callback to run in case of success.
   * @param {Function} [options.errorCallback] Callback to run in case of an error.
   * @param {string} [options.watchedAncestorHeadline] Headline of the ancestor section that is
   *   watched.
   */
  static async unwatchSection(headline, {
    silent = false,
    successCallback,
    errorCallback,
    watchedAncestorHeadline,
  }) {
    if (!headline) return;

    try {
      await getWatchedSections();
    } catch (e) {
      mw.notify(cd.s('section-watch-error-load'), { type: 'error' });
      if (errorCallback) {
        errorCallback();
      }
      return;
    }

    // The section could be unwatched in another tab.
    if (cd.g.thisPageWatchedSections.includes(headline)) {
      cd.g.thisPageWatchedSections.splice(cd.g.thisPageWatchedSections.indexOf(headline), 1);
    }
    if (!cd.g.thisPageWatchedSections.length) {
      delete cd.g.watchedSections[mw.config.get('wgArticleId')];
    }

    try {
      await setWatchedSections();
    } catch (e) {
      mw.notify(cd.s('section-watch-error-save'), { type: 'error' });
      if (errorCallback) {
        errorCallback();
      }
      return;
    }

    let text = cd.sParse('section-unwatch-success', headline);
    let autoHideSeconds;
    if (watchedAncestorHeadline) {
      text += ' ' + cd.sParse('section-unwatch-stillwatched', watchedAncestorHeadline);
      autoHideSeconds = 'long';
    }
    if (!silent || watchedAncestorHeadline) {
      mw.notify(cd.util.wrap(text), { autoHideSeconds });
    }
    if (successCallback) {
      successCallback();
    }
  }

  /**
   * Get a section by anchor.
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
   * Get sections by headline.
   *
   * @param {string} headline
   * @returns {Section[]}
   */
  static getSectionsByHeadline(headline) {
    return cd.sections.filter((section) => section.headline === headline);
  }

  /**
   * Get a section by headline, first comment data, and/or index. At least two parameters must
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
        section.comments[0] &&
        section.comments[0].anchor === firstCommentAnchor
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
    let bestMatchId = null;
    Object.keys(scores).forEach((matchId) => {
      if (scores[matchId] >= 2 && (bestMatchId === null || scores[matchId] > scores[bestMatchId])) {
        bestMatchId = matchId;
      }
    });
    return bestMatchId === null ? null : cd.sections[bestMatchId];
  }

  /**
   * Perform extra section-related tasks, including adding the `isLastSection` property, adding
   * buttons, and binding events.
   */
  static adjustSections() {
    cd.sections.forEach((section, i) => {
      /**
       * Is the section the last section on the page.
       *
       * @name isLastSection
       * @type {boolean}
       * @instance module:Section
       */
      section.isLastSection = i === cd.sections.length - 1;

      if (section.actionable) {
        // If the next section of the same level has another nesting level (e.g., is inside a <div>
        // with a specific style), don't add the "Add subsection" button - it would appear in the
        // wrong place.
        const nextSameLevelSection = cd.sections
          .slice(i + 1)
          .find((otherSection) => otherSection.level === section.level);
        const isClosed = (
          section.elements.length === 2 &&
          cd.config.closedDiscussionClasses
            ?.some((className) => section.elements[1].classList?.contains(className))
        );
        if (
          !isClosed &&
          (
            !nextSameLevelSection ||
            nextSameLevelSection.headingNestingLevel === section.headingNestingLevel
          )
        ) {
          section.addAddSubsectionButton();
        } else {
          section.$heading.find('.cd-sectionLink-addSubsection').parent().remove();
        }

        const isFirstChunkClosed = (
          section.elements[1] === section.lastElementInFirstChunk &&
          cd.config.closedDiscussionClasses
            ?.some((className) => section.lastElementInFirstChunk.classList?.contains(className))
        );

        // The same for the "Reply" button, but as this button is added to the end of the first
        // chunk, we look at just the next section, not necessarily of the same level.
        if (
          !isFirstChunkClosed &&
          (
            !cd.sections[i + 1] ||
            cd.sections[i + 1].headingNestingLevel === section.headingNestingLevel
          )
        ) {
          section.addReplyButton();
        }
      }
    });

    cd.sections
      .filter((section) => section.actionable && section.level === 2)
      .forEach((section) => {
        // Section with the last reply button
        const subsections = section.getChildren(true);
        const targetSection = subsections.length ? subsections[subsections.length - 1] : section;
        if (targetSection.$replyButtonLink) {
          targetSection.$replyButtonLink
            .on('mouseenter', section.replyButtonHoverHandler)
            .on('mouseleave', section.replyButtonUnhoverHandler);
        }
      });
  }
}
