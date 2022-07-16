import Button from './Button';
import CdError from './CdError';
import CommentForm from './CommentForm';
import LiveTimestamp from './LiveTimestamp';
import SectionSkeleton from './SectionSkeleton';
import SectionStatic from './Section.static';
import cd from './cd';
import controller from './controller';
import pageRegistry from './pageRegistry';
import settings from './settings';
import subscriptions from './subscriptions';
import toc from './toc';
import {
  calculateWordOverlap,
  dealWithLoadingBug,
  defined,
  focusInput,
  getUrlWithFragment,
  underlinesToSpaces,
  unique,
  wrap,
} from './util';
import {
  encodeWikilink,
  endWithTwoNewlines,
  extractSignatures,
  hideDistractingCode,
  normalizeCode,
  removeWikiMarkup,
} from './wikitext';
import { formatDate } from './timestamp';
import { handleApiReject } from './apiWrappers';

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
   * @throws {CdError}
   */
  constructor(parser, heading, targets) {
    super(parser, heading, targets);

    elementPrototypes = cd.g.SECTION_ELEMENT_PROTOTYPES;

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
    this.sourcePage = this.sourcePageName ? pageRegistry.get(this.sourcePageName) : cd.page;

    delete this.sourcePageName;

    // Transclusions of templates that in turn translude content, like here:
    // https://ru.wikipedia.org/wiki/Project:Выборы_арбитров/Лето_2021/Вопросы/Кандидатские_заявления
    const isTranscludedFromTemplate = this.sourcePage?.namespaceId === 10;

    /**
     * Is the section actionable (is in a closed discussion or on an old version page).
     *
     * @type {boolean}
     */
    this.isActionable = (
      controller.isPageActive() &&
      !controller.getClosedDiscussions().some((el) => el.contains(this.headingElement)) &&
      !isTranscludedFromTemplate
    );

    if (isTranscludedFromTemplate) {
      this.comments.forEach((comment) => {
        comment.isActionable = false;
      });
    }

    this.extractSubscribeId();

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
   * _For internal use._ Add a {@link Section#replyButton "Reply in section" button} to the end of
   * the first chunk of the section.
   */
  addReplyButton() {
    if (!this.canAddReply()) return;

    const lastElement = this.lastElementInFirstChunk;

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
    const lastComment = this.commentsInFirstChunk[this.commentsInFirstChunk.length - 1];
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
            lastElement !== lastComment?.elements[lastComment.elements.length - 1]
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

    // Don't set more DOM properties to help performance. We don't need them in practice.
    const button = new Button({
      element: elementPrototypes.replyButton.cloneNode(true),
      action: () => {
        this.reply();
      },
    });

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
     * Reply button at the bottom of the first chunk of the section.
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
    if (!this.canAddSubsection()) return;

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
   * _For internal use._ Make it so that when the user hovers over a reply button at the end of the
   * section for a second, an "Add subsection" button shows up under it.
   */
  showAddSubsectionButtonOnReplyButtonHover() {
    if (!this.replyButton || !this.addSubsectionButton) return;

    let hideAddSubsectionButtonTimeout;
    const deferButtonHide = () => {
      if (!hideAddSubsectionButtonTimeout) {
        hideAddSubsectionButtonTimeout = setTimeout(() => {
          this.$addSubsectionButtonContainer.hide();
        }, 1000);
      }
    };

    this.addSubsectionButton.buttonElement.onmouseenter = () => {
      clearTimeout(hideAddSubsectionButtonTimeout);
      hideAddSubsectionButtonTimeout = null;
    };
    this.addSubsectionButton.buttonElement.onmouseleave = () => {
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

    $(this.replyButton.buttonElement)
      .on('mouseenter', this.replyButtonHoverHandler)
      .on('mouseleave', this.replyButtonUnhoverHandler);
  }

  /**
   * Add a "Subscribe" / "Unsubscribe" button to the actions element.
   *
   * @fires subscribeButtonAdded
   */
  addSubscribeButton() {
    if (!this.subscribeId || cd.page.isArchivePage()) return;

    /**
     * The subscription state of the section. Currently, `true` stands for "subscribed", `false` for
     * "unsubscribed", `null` for n/a.
     *
     * @type {?boolean}
     */
    this.subscriptionState = subscriptions.getState(this.subscribeId);

    /**
     * The subscribe button widget in the {@link Section#actionsElement actions element}.
     *
     * @type {external:OO.ui.ButtonMenuSelectWidget}
     */
    this.actions.subscribeButton = new OO.ui.ButtonWidget({
      framed: false,
      flags: ['progressive'],
      icon: 'bellOutline',
      label: cd.s('sm-subscribe'),
      title: cd.mws('discussiontools-topicsubscription-button-subscribe-tooltip'),
      classes: ['cd-section-bar-button'],
    });
    if (cd.g.SKIN === 'monobook') {
      this.actions.subscribeButton.$element
        .find('.oo-ui-iconElement-icon')
        .addClass('oo-ui-image-progressive');
    }

    this.updateSubscribeButtonState();

    this.actionsElement.prepend(this.actions.subscribeButton.$element.get(0));

    /**
     * A subscribe button has been added to the section actions element.
     *
     * @event subscribeButtonAdded
     * @param {Section} section
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.subscribeButtonAdded').fire(this);
  }

  /**
   * Check whether the user should get the affordance to edit the first comment from the section
   * menu.
   *
   * @returns {boolean}
   */
  canEditFirstComment() {
    return (
      this.isActionable &&
      this.comments.length &&
      this.comments[0].isOpeningSection &&
      this.comments[0].openingSectionOfLevel === this.level &&
      (this.comments[0].isOwn || settings.get('allowEditOthersComments')) &&
      this.comments[0].isActionable &&
      !this.comments[0].isCollapsed
    );
  }

  /**
   * Check whether the user should get the affordance to move the section to another page.
   *
   * @returns {boolean}
   */
  canBeMoved() {
    return this.isActionable && this.level === 2;
  }

  /**
   * Check whether the user should get the affordance to add a reply to the section.
   *
   * @returns {boolean}
   */
  canAddReply() {
    const isFirstChunkClosed = (
      this.commentsInFirstChunk[0] &&
      this.commentsInFirstChunk[0].level === 0 &&
      this.commentsInFirstChunk.every((comment) => !comment.isActionable)
    );
    const isFirstChunkEmptyBeforeSubsection = (
      this.lastElementInFirstChunk !== this.lastElement &&
      this.lastElementInFirstChunk === this.firstElement
    );

    // May mean complex formatting, so we better keep out.
    const doesNestingLevelMatch = (
      !cd.sections[this.index + 1] ||
      cd.sections[this.index + 1].headingNestingLevel === this.headingNestingLevel
    );

    // https://ru.wikipedia.org/wiki/Project:Запросы_к_администраторам/Быстрые
    const isBuriedInTable = ['TR', 'TD', 'TH'].includes(this.lastElementInFirstChunk.tagName);

    return Boolean(
      this.isActionable &&
      !isFirstChunkClosed &&
      !isFirstChunkEmptyBeforeSubsection &&
      doesNestingLevelMatch &&
      !isBuriedInTable
    );
  }

  /**
   * Check whether the user should get the affordance to add a subsection to the section.
   *
   * @returns {boolean}
   */
  canAddSubsection() {
    const isClosed = (
      this.comments[0] &&
      this.comments[0].level === 0 &&
      this.comments.every((comment) => !comment.isActionable)
    );
    const nextSameLevelSection = cd.sections
      .slice(this.index + 1)
      .find((otherSection) => otherSection.level === this.level);

    // While the "Reply" button is added to the end of the first chunk, the "Add subsection" button
    // is added to the end of the whole section, so we look the next section of the same level.
    const doesNestingLevelMatch = (
      !nextSameLevelSection ||
      nextSameLevelSection.headingNestingLevel === this.headingNestingLevel
    );

    return Boolean(
      this.isActionable &&
      this.level >= 2 &&
      this.level <= 5 &&
      !isClosed &&

      // If the next section of the same level has another nesting level (e.g., is inside a <div>
      // with a specific style), don't add the "Add subsection" button - it would appear in a wrong
      // place.
      doesNestingLevelMatch
    );
  }

  /**
   * Create a real "More options" menu select in place of a dummy one.
   *
   * @fires moreMenuSelectCreated
   * @private
   */
  createMoreMenuSelect() {
    const moreMenuSelect = elementPrototypes.getMoreMenuSelect();

    let editOpeningCommentOption;
    let moveOption;
    let addSubsectionOption;
    if (this.canEditFirstComment()) {
      editOpeningCommentOption = new OO.ui.MenuOptionWidget({
        data: 'editOpeningComment',
        label: cd.s('sm-editopeningcomment'),
        title: cd.s('sm-editopeningcomment-tooltip'),
        icon: 'edit',
      });
    }

    if (this.canBeMoved()) {
      moveOption = new OO.ui.MenuOptionWidget({
        data: 'move',
        label: cd.s('sm-move'),
        title: cd.s('sm-move-tooltip'),
        icon: 'arrowNext',
      });
    }

    if (this.canAddSubsection()) {
      addSubsectionOption = new OO.ui.MenuOptionWidget({
        data: 'addSubsection',
        label: cd.s('sm-addsubsection'),
        title: cd.s('sm-addsubsection-tooltip'),
        icon: 'speechBubbleAdd',
      });
    }

    this.actions.moreMenuSelectDummy.element.remove();
    this.actionsElement.append(moreMenuSelect.$element.get(0));

    const items = [editOpeningCommentOption, moveOption, addSubsectionOption].filter(defined);
    moreMenuSelect.getMenu()
      .addItems(items)
      .on('choose', (option) => {
        switch (option.getData()) {
          case 'editOpeningComment':
            this.comments[0].edit();
            break;
          case 'move':
            this.move();
            break;
          case 'addSubsection':
            this.addSubsection();
            break;
        }
      });

    /**
     * The button menu select widget in the {@link Section#actionsElement actions element}. Note
     * that it is created only when the user hovers over or clicks a dummy button, which fires a
     * {@link Section#moreMenuSelectCreated moreMenuSelectCreated hook}.
     *
     * @type {external:OO.ui.ButtonMenuSelectWidget|undefined}
     */
    this.actions.moreMenuSelect = moreMenuSelect;

    /**
     * A "More options" menu select button has been created and added to the section actions
     * element in place of a dummy button.
     *
     * @event moreMenuSelectCreated
     * @param {Section} section
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.moreMenuSelectCreated').fire(this);
  }

  /**
   * Create a real "More options" menu select in place of a dummy one and click it.
   *
   * @private
   */
  createAndClickMoreMenuSelect() {
    this.createMoreMenuSelect();
    this.actions.moreMenuSelect.focus().emit('click');
  }

  /**
   * Create a metadata container.
   *
   * @private
   */
  createMetadataElement() {
    const authorCount = this.comments.map((comment) => comment.author).filter(unique).length;

    let latestComment;
    this.comments.forEach((comment) => {
      if (
        comment.date &&
        (!latestComment || !latestComment.date || latestComment.date < comment.date)
      ) {
        latestComment = comment;
      }
    });

    let commentCountWrapper;
    let authorCountWrapper;
    let lastCommentWrapper;
    let metadataElement;
    if (this.level === 2 && this.comments.length) {
      commentCountWrapper = document.createElement('span');
      commentCountWrapper.className = 'cd-section-bar-item';
      const commentCountText = cd.s('section-metadata-commentcount', this.comments.length);

      // Add a no-break space to ensure the text is copied correctly.
      commentCountWrapper.append(commentCountText);

      authorCountWrapper = document.createElement('span');
      authorCountWrapper.className = 'cd-section-bar-item';
      const authorCountText = cd.s('section-metadata-authorcount', authorCount);
      authorCountWrapper.append(authorCountText);

      if (latestComment) {
        const lastCommentLink = document.createElement('a');
        lastCommentLink.href = `#${latestComment.dtId || latestComment.id}`;
        lastCommentLink.onclick = (e) => {
          e.preventDefault();
          latestComment.scrollTo({ pushState: true });
        };
        lastCommentLink.textContent = formatDate(latestComment.date);
        (new LiveTimestamp(lastCommentLink, latestComment.date, false)).init();

        lastCommentWrapper = document.createElement('span');
        lastCommentWrapper.className = 'cd-section-bar-item';
        const lastCommentText = cd.s('section-metadata-lastcomment');
        lastCommentWrapper.append(lastCommentText, ' ', lastCommentLink);
      }

      metadataElement = document.createElement('div');
      metadataElement.className = 'cd-section-metadata';
      const metadataItemList = [
        commentCountWrapper,
        authorCountWrapper,
        lastCommentWrapper,
      ].filter(defined);
      metadataElement.append(...metadataItemList);
    }

    /**
     * The metadata element under the 2-level section heading.
     *
     * @type {Element|undefined}
     */
    this.metadataElement = metadataElement;

    /**
     * The comment count wrapper element in the {@link Section#metadataElement metadata element}.
     *
     * @type {Element|undefined}
     */
    this.commentCountWrapper = commentCountWrapper;

    /**
     * The author count wrapper element in the {@link Section#metadataElement metadata element}.
     *
     * @type {Element|undefined}
     */
    this.authorCountWrapper = authorCountWrapper;

    /**
     * The last comment date wrapper element in the {@link Section#metadataElement metadata element}.
     *
     * @type {Element|undefined}
     */
    this.lastCommentWrapper = lastCommentWrapper;
  }

  /**
   * Create action buttons and a container for them.
   *
   * @private
   */
  createActionsElement() {
    let moreMenuSelectDummy;
    if (this.canEditFirstComment() || this.canBeMoved() || this.canAddSubsection()) {
      const element = elementPrototypes.moreMenuSelect.cloneNode(true);
      moreMenuSelectDummy = new Button({
        element,
        action: () => {
          this.createAndClickMoreMenuSelect();
        },
      });
      moreMenuSelectDummy.buttonElement.onmouseenter = () => {
        this.createMoreMenuSelect();
      };
    }

    let copyLinkButton;
    if (this.headline) {
      const element = elementPrototypes.copyLinkButton.cloneNode(true);
      copyLinkButton = new Button({
        element,
        buttonElement: element.firstChild,
        iconElement: element.querySelector('.oo-ui-iconElement-icon'),
        href: `${cd.page.getUrl()}#${this.id}`,
        action: (e) => {
          this.copyLink(e);
        },
        flags: ['progressive'],
      });
    }

    const actionsElement = document.createElement('div');
    actionsElement.className = 'cd-section-actions';
    const actionItemList = [copyLinkButton, moreMenuSelectDummy]
      .filter(defined)
      .map((button) => button.element);
    actionsElement.append(...actionItemList);

    /**
     * The actions element under the 2-level section heading _or_ to the right of headings of other
     * levels.
     *
     * @type {Element}
     */
    this.actionsElement = actionsElement;

    /**
     * Section actions object. It contains elements (buttons, menus) triggering the actions of the
     * section.
     *
     * @type {object}
     */
    this.actions = {
      /**
       * The copy link button widget in the {@link Section#actionsElement actions element}.
       *
       * @type {external:OO.ui.ButtonWidget|undefined}
       */
      copyLinkButton,

      moreMenuSelectDummy,
    };
  }

  /**
   * Create a bar element (for 2-level sections).
   *
   * @private
   */
   createBarElement() {
    const barElement = document.createElement('div');
    barElement.className = 'cd-section-bar';
    if (!this.metadataElement) {
      barElement.classList.add('cd-section-bar-nometadata');
    }
    barElement.append(...[this.metadataElement, this.actionsElement].filter(defined));
    this.headingElement.parentNode
      .insertBefore(barElement, this.headingElement.nextElementSibling);

    if (this.lastElement === this.headingElement) {
      this.lastElement = barElement;
    }
    if (this.lastElementInFirstChunk === this.headingElement) {
      this.lastElementInFirstChunk = barElement;
    }

    /**
     * The bar element under the 2-level section heading.
     *
     * @type {Element|undefined}
     */
    this.barElement = barElement;

    /**
     * The first section element which is either the bar element (for 2-level sections, or topics)
     * or the section heading (for other sections).
     *
     * @type {Element}
     */
    this.firstElement = this.headingElement;
  }

  /**
   * Create an element wrapping a heading element of non-2-level sections.
   *
   * @private
   */
  createHeadingWrapperElement() {
    const headingWrapper = document.createElement('div');
    headingWrapper.classList.add('cd-heading-wrapper');
    this.headingElement.parentNode.insertBefore(headingWrapper, this.headingElement);
    headingWrapper.append(this.headingElement, this.actionsElement);

    if (this.lastElement === this.headingElement) {
      this.lastElement = headingWrapper;
    }
    if (this.lastElementInFirstChunk === this.headingElement) {
      this.lastElementInFirstChunk = headingWrapper;
    }

    /**
     * The element wrapping the heading element of a non-2-level section.
     *
     * @type {Element|undefined}
     */
    this.headingWrapper = headingWrapper;

    this.firstElement = headingWrapper;
  }

  /**
   * Add the metadata and actions elements below or to the right of the section heading.
   */
  addMetadataAndActions() {
    this.createMetadataElement();
    this.createActionsElement();
    if (this.level === 2) {
      this.createBarElement();
    } else {
      this.createHeadingWrapperElement();
    }
  }

  /**
   * Add the new comment count to the metadata element.
   */
  addNewCommentCountMetadata() {
    if (this.level !== 2) return;

    const newComments = this.comments.filter((comment) => comment.isSeen === false);
    if (!newComments.length) return;

    let newCommentCountLink;
    if (newComments.length === this.comments.length) {
      newCommentCountLink = document.createElement('span');
    } else {
      newCommentCountLink = document.createElement('a');
      newCommentCountLink.href = `#${newComments[0].dtId}`;
      newCommentCountLink.onclick = (e) => {
        e.preventDefault();
        newComments[0].scrollTo({
          flash: false,
          pushState: true,
        });
        newComments.forEach((comment) => comment.flashTarget());
      };
    }
    newCommentCountLink.textContent = cd.s('section-metadata-commentcount-new', newComments.length);
    this.commentCountWrapper.append(' ', newCommentCountLink);
  }

  /**
   * Extract the section {@link Section#subscribeId subscribe ID}.
   */
  extractSubscribeId() {
    if (!settings.get('useTopicSubscription')) {
      /**
       * The section subscribe ID, either in the DiscussionTools format or just a headline if legacy
       * subscriptions are used.
       *
       * @type {string}
       */
      this.subscribeId = this.headline;
      return;
    }

    if (cd.g.IS_DT_TOPIC_SUBSCRIPTION_ENABLED) {
      if (this.headingElement.querySelector('.ext-discussiontools-init-section-subscribe-link')) {
        const headlineJson = this.headlineElement.dataset.mwComment;
        try {
          this.subscribeId = JSON.parse(headlineJson).name;
        } catch {
          // Empty
        }
      }
    } else {
      let n = this.headlineElement;
      let subscribeIdNode;
      while ((n = n.nextSibling)) {
        if (n.nodeType === Node.COMMENT_NODE) {
          subscribeIdNode = n;
          break;
        }
      }

      if (subscribeIdNode) {
        const [, subscribeId] = subscribeIdNode.textContent.match('__DTSUBSCRIBELINK__(.+)') || [];
        this.subscribeId = subscribeId;
      }
    }
  }

  /**
   * Create an {@link Section#replyForm add reply form}.
   *
   * @param {object|CommentForm} initialState
   */
  reply(initialState) {
    // Check for existence in case replying is called from a script of some kind (there is no button
    // to call it from CD).
    if (!this.replyForm) {
      /**
       * A reply form related to the section.
       *
       * @type {CommentForm|undefined}
       */
      this.replyForm = initialState instanceof CommentForm ?
        initialState :
        new CommentForm({
          mode: 'replyInSection',
          target: this,
          initialState,
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
   * @param {object|CommentForm} initialState
   * @throws {CdError}
   */
  addSubsection(initialState) {
    if (!this.canAddSubsection()) {
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
      this.addSubsectionForm = initialState instanceof CommentForm ?
        initialState :
        new CommentForm({
          mode: 'addSubsection',
          target: this,
          initialState,
        });
    }
  }

  /**
   * Show a move section dialog.
   */
  move() {
    if (controller.isPageOverlayOn() || dealWithLoadingBug('mediawiki.widgets')) return;

    const MoveSectionDialog = require('./MoveSectionDialog').default;

    const section = this;
    const dialog = new MoveSectionDialog(section);
    controller.getWindowManager().addWindows([dialog]);
    controller.getWindowManager().openWindow(dialog);
  }

  /**
   * Update the subscribe/unsubscribe section button state.
   *
   * @private
   */
  updateSubscribeButtonState() {
    if (this.subscriptionState) {
      this.actions.subscribeButton
        ?.setLabel(cd.s('sm-unsubscribe'))
        .setTitle(cd.mws('discussiontools-topicsubscription-button-unsubscribe-tooltip'))
        .setIcon('bell')
        .off('click')
        .on('click', () => {
          this.unsubscribe();
        });
    } else {
      this.actions.subscribeButton
        ?.setLabel(cd.s('sm-subscribe'))
        .setTitle(cd.mws('discussiontools-topicsubscription-button-subscribe-tooltip'))
        .setIcon('bellOutline')
        .off('click')
        .on('click', () => {
          this.subscribe();
        });
    }
  }

  /**
   * Add the section to the subscription list.
   *
   * @param {string} [mode] No value: a notification will be shown. `'quiet'`: don't show a
   *   notification. `'silent'`: don't even change any UI, including the subscribe button
   *   appearance. If there is an error, it will be displayed though.
   * @param {string} [renamedFrom] If DiscussionTools' topic subscriptions API is not used and the
   *   section was renamed, the previous section headline. It is unwatched together with watching
   *   the current headline if there is no other coinciding headlines on the page.
   */
  subscribe(mode, renamedFrom) {
    // That's a mechanism mainly for legacy subscriptions but can be used for DT subscriptions as
    // well, for which `sections` will have more than one section when there is more than one
    // section created by a certain user at a certain moment in time.
    const sections = Section.getBySubscribeId(this.subscribeId);
    let finallyCallback;
    if (mode !== 'silent') {
      const buttons = sections.map((section) => section.actions.subscribeButton).filter(defined);
      buttons.forEach((button) => {
        button.setDisabled(true);
      });
      finallyCallback = () => {
        buttons.forEach((button) => {
          button.setDisabled(false);
        });
      };
    }

    let unsubscribeHeadline;
    if (renamedFrom && !Section.getBySubscribeId(renamedFrom).length) {
      unsubscribeHeadline = renamedFrom;
    }

    subscriptions.subscribe(this.subscribeId, this.id, unsubscribeHeadline)
      .then(() => {
        if (mode !== 'silent') {
          sections.forEach((section) => {
            section.subscriptionState = true;
            section.updateSubscribeButtonState();
            section.updateTocLink();
          });
        }

        if (!mode) {
          let title = cd.mws('discussiontools-topicsubscription-notify-subscribed-title');
          let body = cd.mws('discussiontools-topicsubscription-notify-subscribed-body');
          let autoHideSeconds;
          if (!settings.get('useTopicSubscription')) {
            body += ' ' + cd.sParse('section-watch-openpages');
            if ($('#ca-watch').length) {
              body += ' ' + cd.sParse('section-watch-pagenotwatched');
              autoHideSeconds = 'long';
            }
          }
          mw.notify(wrap(body), { title, autoHideSeconds });
        }
      })
      .then(finallyCallback, finallyCallback);
  }

  /**
   * Remove the section from the subscription list.
   *
   * @param {boolean} [mode] No value: a notification will be shown. `'quiet'`: don't show a
   *   notification. `'silent'`: don't even change any UI, including the subscribe button
   *   appearance. If there is an error, it will be displayed though.
   */
  unsubscribe(mode) {
    const sections = Section.getBySubscribeId(this.subscribeId);
    let finallyCallback;
    if (mode !== 'silent') {
      const buttons = sections.map((section) => section.actions.subscribeButton).filter(defined);
      buttons.forEach((button) => {
        button.setDisabled(true);
      });
      finallyCallback = () => {
        buttons.forEach((button) => {
          button.setDisabled(false);
        });
      };
    }

    subscriptions.unsubscribe(this.subscribeId, this.id)
      .then(() => {
        if (mode !== 'silent') {
          sections.forEach((section) => {
            section.subscriptionState = false;
            section.updateSubscribeButtonState();
            section.updateTocLink();
          });
        }

        const ancestorSubscribedTo = this.getClosestSectionSubscribedTo();
        if (!mode || ancestorSubscribedTo) {
          let title = cd.mws('discussiontools-topicsubscription-notify-unsubscribed-title');
          let body = cd.mws('discussiontools-topicsubscription-notify-unsubscribed-body');
          let autoHideSeconds;
          if (ancestorSubscribedTo) {
            body += (
              ' ' +
              cd.sParse('section-unwatch-stillwatched', ancestorSubscribedTo.headline)
            );
            autoHideSeconds = 'long';
          }
          mw.notify(wrap(body), { title, autoHideSeconds });
        }
      })
      .then(finallyCallback, finallyCallback);
  }

  /**
   * Resubscribe to a renamed section if legacy topic subscriptions are used.
   *
   * @param {object} currentCommentData
   * @param {object} oldCommentData
   */
  resubscribeToRenamed(currentCommentData, oldCommentData) {
    if (
      settings.get('useTopicSubscription') ||
      this.subscriptionState ||
      !/^H[1-6]$/.test(currentCommentData.elementNames[0]) ||
      oldCommentData.elementNames[0] !== currentCommentData.elementNames[0]
    ) {
      return;
    }

    const html = oldCommentData.elementHtmls[0].replace(
      /\x01(\d+)_\w+\x02/g,
      (s, num) => currentCommentData.hiddenElementsData[num - 1].html
    );
    const $dummy = $('<span>').html($(html).html());
    const oldSection = { headlineElement: $dummy.get(0) };
    Section.prototype.parseHeadline.call(oldSection);
    const newHeadline = this.headline;
    if (
      newHeadline &&
      oldSection.headline !== newHeadline &&
      subscriptions.getOriginalState(oldSection.headline)
    ) {
      this.subscribe('quiet', oldSection.headline);
    }
  }

  /**
   * Copy a link to the section or open a copy link dialog.
   *
   * @param {Event} e
   */
  copyLink(e) {
    if (controller.isPageOverlayOn()) return;

    e.preventDefault();
    controller.showCopyLinkDialog(this, e);
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
        (commentForm.getContainerListType() === 'ol' || cd.config.indentationCharMode === 'mimic')
      ) {
        try {
          lastComment.locateInCode(commentForm.isSectionSubmitted());
        } catch {
          return;
        }
        if (
          !lastComment.inCode.indentationChars.startsWith('#') ||

          // For now we use the workaround with commentForm.getContainerListType() to make sure "#"
          // is a part of comments organized in a numbered list, not of a numbered list _in_
          // the target comment.
          commentForm.getContainerListType() === 'ol'
        ) {
          this.inCode.lastCommentIndentationChars = lastComment.inCode.indentationChars;
        }
      }
    }
  }

  /**
   * Modify a whole section or page code string related to the section in accordance with an action.
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
    const resp = await controller.getApi().post({
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
   * @param {CommentForm} [commentForm] Comment form, if it is submitted or code changes are
   *   viewed.
   * @throws {CdError|Error}
   */
  async getCode(commentForm) {
    try {
      if (this.liveSectionNumber !== null) {
        try {
          await this.requestCode();
          this.locateInCode(true);
          if (commentForm) {
            commentForm.setSectionSubmitted(true);
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
   * Collect data for a match, including section text, first chunk text, indexes, etc.
   *
   * @param {object} sectionHeadingMatch
   * @param {string} pageCode
   * @param {string} adjustedPageCode
   * @returns {object}
   * @private
   */
  collectMatchData(sectionHeadingMatch, pageCode, adjustedPageCode) {
    const headline = normalizeCode(removeWikiMarkup(sectionHeadingMatch[3]));

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

    const code = sectionMatch && codeFromSection.substr(sectionMatch.index, sectionMatch[1].length);
    const firstChunkCode = (
      firstChunkMatch &&
      codeFromSection.substr(firstChunkMatch.index, firstChunkMatch[1].length)
    );

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
        // `1` accounts for the first line break.
        firstChunkContentEndIndex -= firstChunkMatch[0].length - 1;
      }

      const match = code.match(regexp);
      if (match) {
        // `1` accounts for the first line break.
        contentEndIndex -= match[0].length - 1;
      }
    });

    /*
      Sections may have `#` or `*` as a placeholder for a vote or bulleted reply. In this case,
      we must use that `#` or `*` in the reply. As for the placeholder, perhaps we should remove
      it, but as for now, we keep it because if:

        * the placeholder character is `*`,
        * `cd.config.indentationCharMode` is `'unify'`,
        * `cd.config.defaultIndentationChar` is `':'`, and
        * there is more than one reply,

      the next reply would go back to `:`, not `*` as should be.
    */
    const placeholderMatch = firstChunkCode.match(/\n([#*] *\n+)$/);
    if (placeholderMatch) {
      firstChunkContentEndIndex -= placeholderMatch[1].length;
    }

    return {
      startIndex,
      endIndex,
      code,
      contentStartIndex,
      contentEndIndex,
      relativeContentStartIndex,
      firstChunkEndIndex,
      firstChunkContentEndIndex,
      firstChunkCode,
      headline,
    };
  }

  /**
   * Get the score for a match.
   *
   * @param {object} match
   * @param {number} sectionIndex
   * @param {string} thisHeadline
   * @param {string[]} headlines
   * @returns {number}
   * @private
   */
  getMatchScore(match, sectionIndex, thisHeadline, headlines) {
    // Matching section index is one of the most unreliable ways to tell matching sections as
    // sections may be added and removed from the page, so we don't rely on it very much.
    const doesSectionIndexMatch = this.index === sectionIndex;

    const doesHeadlineMatch = match.headline === thisHeadline;

    const previousHeadlinesToCheckCount = 3;
    const previousHeadlinesInCode = headlines
      .slice(-previousHeadlinesToCheckCount)
      .reverse();
    const previousHeadlines = cd.sections
      .slice(Math.max(0, this.index - previousHeadlinesToCheckCount), this.index)
      .reverse()
      .map((section) => section.headline);
    const doPreviousHeadlinesMatch = previousHeadlines
      .every((headline, i) => normalizeCode(headline) === previousHeadlinesInCode[i]);
    headlines.push(match.headline);

    const sigs = extractSignatures(match.code);
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
      const oldestCommentCode = match.code.slice(oldestSig.commentStartIndex, oldestSig.startIndex);
      oldestCommentWordOverlap = calculateWordOverlap(
        this.oldestComment.getText(),
        removeWikiMarkup(oldestCommentCode)
      );
    }

    return (
      doesOldestCommentMatch * 1 +
      oldestCommentWordOverlap +
      doesHeadlineMatch * 1 +
      doesSectionIndexMatch * 0.5 +

      // Shouldn't give too high a weight to this factor as it is true for every first section.
      doPreviousHeadlinesMatch * 0.25
    );
  }

  /**
   * Search for the section in the source code and return possible matches.
   *
   * @param {string} pageCode
   * @returns {object}
   * @private
   */
  searchInCode(pageCode) {
    const thisHeadline = normalizeCode(this.headline);
    const adjustedPageCode = hideDistractingCode(pageCode);
    const sectionHeadingRegexp = /^((=+)(.*)\2[ \t\x01\x02]*)\n/gm;

    const matches = [];
    const headlines = [];
    let sectionIndex = -1;
    let sectionHeadingMatch;
    while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedPageCode))) {
      sectionIndex++;

      const match = this.collectMatchData(sectionHeadingMatch, pageCode, adjustedPageCode);
      if (!match.code || !match.firstChunkCode) {
        console.log(`Couldn't read the "${match.headline}" section contents.`);
        continue;
      }

      match.score = this.getMatchScore(match, sectionIndex, thisHeadline, headlines);
      if (match.score <= 1) continue;

      matches.push(match);

      // Maximal possible score
      if (match.score === 2.75) break;
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
   * @param {boolean} [force2Level=false] Guarantee a 2-level section is returned.
   * @returns {?Section}
   */
  getBase(force2Level = false) {
    const defaultValue = force2Level && this.level !== 2 ? null : this;

    if (this.level <= 2) {
      return defaultValue;
    }

    return (
      cd.sections
        .slice(0, this.index)
        .reverse()
        .find((section) => section.level === 2) ||
      defaultValue
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
      .slice(this.index + 1)
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
   * Get the first upper level section relative to the current section that is subscribed to.
   *
   * @param {boolean} [includeCurrent=false] Check the current section too.
   * @returns {?Section}
   */
  getClosestSectionSubscribedTo(includeCurrent = false) {
    for (
      let otherSection = includeCurrent ? this : this.getParent();
      otherSection;
      otherSection = otherSection.getParent()
    ) {
      if (otherSection.subscriptionState) {
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
    return toc.getItem(this.id) || null;
  }

  /**
   * Bold/unbold the section's TOC link according to its watch state and update the `title`
   * attribute.
   *
   * @private
   */
  updateTocLink() {
    if (!settings.get('modifyToc')) return;

    const tocItem = this.getTocItem();
    if (!tocItem) return;

    if (this.subscriptionState) {
      tocItem.$link
        .addClass('cd-toc-subscribedTo')
        .attr('title', cd.s('toc-watched'));
    } else {
      tocItem.$link
        .removeClass('cd-toc-subscribedTo')
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
    return getUrlWithFragment(this.id, permanent);
  }

  /**
   * Get a section relevant to this section, which means the section itself. (Used for polymorphism
   * with {@link Comment#getRelevantSection}.)
   *
   * @returns {Section}
   */
  getRelevantSection() {
    return this;
  }

  /**
   * Get a comment relevant to this section, which means the first comment _if_ it is opening the
   * section. (Used for polymorphism with {@link Comment#getRelevantComment}.)
   *
   * @returns {?Section}
   */
  getRelevantComment() {
    return this.comments[0]?.isOpeningSection ? this.comments[0] : null;
  }

  /**
   * Get the data identifying the section when restoring a comment form. (Used for polymorphism with
   * {@link Comment#getRelevantComment}.)
   *
   * @returns {object}
   */
  getIdentifyingData() {
    return {
      headline: this.headline,
      oldestCommentId: this.oldestComment?.id,
      index: this.index,
      id: this.id,
      ancestors: this.getAncestors().map((section) => section.headline),
    };
  }

  /**
   * Get the fragment for use in a section wikilink.
   *
   * @returns {string}
   */
  getWikilinkFragment() {
    return encodeWikilink(underlinesToSpaces(this.id));
  }

  /**
   * Generate a DT subscribe ID from the oldest timestamp in the section if there is no.
   *
   * @param {string} timestamp Oldest timestamp in the section.
   */
  ensureSubscribeIdPresent(timestamp) {
    if (!settings.get('useTopicSubscription') || this.subscribeId) return;

    this.subscribeId = Section.generateDtSubscriptionId(cd.user.getName(), timestamp);
  }

  /**
   * Get the section used to subscribe to if available.
   *
   * @returns {?Section}
   */
  getSectionSubscribedTo() {
    return settings.get('useTopicSubscription') ? this.getBase(true) : this;
  }
}

Object.assign(Section, SectionStatic);

export default Section;
