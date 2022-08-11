import Button from './Button';
import CdError from './CdError';
import CommentForm from './CommentForm';
import CommentStatic from './CommentStatic';
import LiveTimestamp from './LiveTimestamp';
import SectionSkeleton from './SectionSkeleton';
import SectionStatic from './SectionStatic';
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
  flat,
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
   * @param {import('./Parser').default} parser
   * @param {Element} heading
   * @param {object[]} targets
   * @throws {CdError}
   */
  constructor(parser, heading, targets) {
    super(parser, heading, targets);

    this.scrollToLatestComment = this.scrollToLatestComment.bind(this);
    this.scrollToNewComments = this.scrollToNewComments.bind(this);
    this.handleReplyButtonHover = this.handleReplyButtonHover.bind(this);
    this.handleReplyButtonUnhover = this.handleReplyButtonUnhover.bind(this);
    this.resetShowAddSubsectionButtonTimeout = this.resetShowAddSubsectionButtonTimeout.bind(this);
    this.resetHideAddSubsectionButtonTimeout = this.resetHideAddSubsectionButtonTimeout.bind(this);
    this.deferAddSubsectionButtonHide = this.deferAddSubsectionButtonHide.bind(this);
    this.showAuthors = this.showAuthors.bind(this);
    this.maybeHideAuthors = this.maybeHideAuthors.bind(this);
    this.createMoreMenuSelect = this.createMoreMenuSelect.bind(this);

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
     * @type {import('./pageRegistry').Page}
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
     * Headline element as a jQuery object.
     *
     * @type {external:jQuery}
     */
    this.$headline = $(this.headlineElement);

    /**
     * Heading element as a jQuery element.
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
    wrapper.className = 'cd-replyButtonWrapper';
    wrapper.appendChild(button.element);

    // The container contains the wrapper that wraps the element ^_^
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
     * Reply button wrapper and part-time reply comment form wrapper, an item element.
     *
     * @type {external:jQuery|undefined}
     */
    this.$replyButtonWrapper = $(wrapper);

    /**
     * Reply button container and part-time reply comment form container, a list element. It is
     * wrapped around the {@link Section#$replyButtonWrapper reply button wrapper}, but it is
     * created by the script only when there is no suitable element that already exists. If there
     * is, it can contain other elements (and comments) too.
     *
     * @type {external:jQuery|undefined}
     */
    this.$replyButtonContainer = $(container);
  }

  /**
   * _For internal use._ Add an {@link Section#addSubsectionButton "Add subsection" button} that
   * appears when hovering over a {@link Section#replyButton "Reply in section" button}.
   */
  addAddSubsectionButton() {
    if (this.level !== 2 || !this.canAddSubsection()) return;

    const element = elementPrototypes.addSubsectionButton.cloneNode(true);
    const button = new Button({
      element,
      labelElement: element.querySelector('.oo-ui-labelElement-label'),
      label: cd.s('section-addsubsection-to', this.headline),
      action: () => {
        this.addSubsection();
      },
    });

    const container = document.createElement('div');
    container.className = 'cd-section-button-container cd-addSubsectionButton-container';
    container.style.display = 'none';
    container.appendChild(button.element);

    this.lastElement.parentNode.insertBefore(container, this.lastElement.nextElementSibling);

    /**
     * "Add subsection" button at the end of the section.
     *
     * @type {Button|undefined}
     */
    this.addSubsectionButton = button;

    /**
     * "Add subsection" button container.
     *
     * @type {external:jQuery|undefined}
     */
    this.$addSubsectionButtonContainer = $(container);
  }

  /**
   * Reset the timeout for showing the "Add subsection" button.
   *
   * @private
   */
  resetShowAddSubsectionButtonTimeout() {
    clearTimeout(this.showAddSubsectionButtonTimeout);
    this.showAddSubsectionButtonTimeout = null;
  }

  /**
   * Reset the timeout for hiding the "Add subsection" button.
   *
   * @private
   */
  resetHideAddSubsectionButtonTimeout() {
    clearTimeout(this.hideAddSubsectionButtonTimeout);
    this.hideAddSubsectionButtonTimeout = null;
  }

  /**
   * Hide the "Add subsection" button after a second.
   *
   * @private
   */
  deferAddSubsectionButtonHide() {
    if (this.hideAddSubsectionButtonTimeout) return;

    this.hideAddSubsectionButtonTimeout = setTimeout(() => {
      this.$addSubsectionButtonContainer.hide();
    }, 1000);
  }

  /**
   * Handle a `mouseenter` event on the reply button.
   *
   * @private
   */
  handleReplyButtonHover() {
    if (this.addSubsectionForm) return;

    this.resetHideAddSubsectionButtonTimeout();
    if (this.showAddSubsectionButtonTimeout) return;

    this.showAddSubsectionButtonTimeout = setTimeout(() => {
      this.$addSubsectionButtonContainer.show();
    }, 1000);
  }

  /**
   * Handle a `mouseleave` event on the reply button.
   *
   * @private
   */
  handleReplyButtonUnhover() {
    if (this.addSubsectionForm) return;

    this.resetShowAddSubsectionButtonTimeout();
    this.deferAddSubsectionButtonHide();
  }

  /**
   * _For internal use._ Make it so that when the user hovers over a reply button at the end of the
   * section for a second, an "Add subsection" button shows up under it.
   */
  showAddSubsectionButtonOnReplyButtonHover() {
    if (!this.replyButton || !this.addSubsectionButton) return;

    this.addSubsectionButton.buttonElement.onmouseenter = this.resetHideAddSubsectionButtonTimeout;
    this.addSubsectionButton.buttonElement.onmouseleave = this.deferAddSubsectionButtonHide;

    this.replyButton.buttonElement.onmouseenter = this.handleReplyButtonHover;
    this.replyButton.buttonElement.onmouseleave = this.handleReplyButtonUnhover;
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
    return Boolean(
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
      this.lastElementInFirstChunk === this.headingElement
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
   * Show a popup with the list of users who have posted in the section.
   *
   * @private
   */
  showAuthors() {
    clearTimeout(this.maybeHideAuthorsTimeout);
    if (!this.authorsPopup) {
      this.authorsPopup = new OO.ui.PopupWidget({
        $content: $(flat(
          this.comments
            .map((comment) => comment.author)
            .filter(unique)
            .sort((author1, author2) => author2.getName() > author1.getName() ? -1 : 1)
            .map((author) => [author, this.comments.filter((comment) => comment.author === author)])
            .map(([author, comments], i, arr) => ([
              $('<a>')
                .text(author.getName())
                .attr('href', `#${comments[0].dtId || comments[0].id}`)
                .on('click', () => {
                  CommentStatic.scrollToFirstHighlightAll(comments);
                })
                .get(0),
              i === arr.length - 1 ? undefined : document.createTextNode(cd.mws('comma-separator')),
            ]))
        )),
        head: false,
        padded: true,
        autoClose: true,
        position: 'above',
        $floatableContainer: $(this.authorCountWrapper.firstChild),
        classes: ['cd-section-metadata-authorsPopup'],
      });
      this.authorsPopup.$element.on('mouseleave', this.maybeHideAuthors);
      $(controller.getPopupOverlay()).append(this.authorsPopup.$element);
    }

    this.authorsPopup.toggle(true);
  }

  /**
   * Hide the popup with the list of users who have posted in the section after some period of time.
   * The time period is needed first of all so that the user has the time to move the cursor from
   * the author count to the popup without the popup being closed.
   *
   * @private
   */
  maybeHideAuthors() {
    this.maybeHideAuthorsTimeout = setTimeout(() => {
      if (
        !this.authorCountWrapper.firstChild.matches(':hover') &&
        !this.authorsPopup.$element.is(':hover')
      ) {
        this.authorsPopup.toggle(false);
      }
    }, 100);
  }

  /**
   * Scroll to the latest comment in the section.
   *
   * @param {Event} e
   * @private
   */
  scrollToLatestComment(e) {
    e.preventDefault();
    this.latestComment.scrollTo({ pushState: true });
  }

  /**
   * Create a metadata container (for 2-level sections).
   *
   * @private
   */
  createMetadataElement() {
    const authorCount = this.comments.map((comment) => comment.author).filter(unique).length;
    const latestComment = this.comments.reduce((latestComment, comment) => (
      (
        comment.date &&
        (!latestComment || !latestComment.date || latestComment.date < comment.date)
      ) ?
        comment :
        latestComment
    ), undefined);

    let commentCountWrapper;
    let authorCountWrapper;
    let latestCommentWrapper;
    let metadataElement;
    if (this.level === 2 && this.comments.length) {
      commentCountWrapper = document.createElement('span');
      commentCountWrapper.className = 'cd-section-bar-item';
      commentCountWrapper.append(cd.s('section-metadata-commentcount', this.comments.length));

      authorCountWrapper = document.createElement('span');
      authorCountWrapper.className = 'cd-section-bar-item cd-section-bar-item-authorCount';
      const innerWrapper = document.createElement('span');
      innerWrapper.append(cd.s('section-metadata-authorcount', authorCount));
      authorCountWrapper.append(innerWrapper);
      innerWrapper.onmouseenter = this.showAuthors;
      innerWrapper.onmouseleave = this.maybeHideAuthors;

      if (latestComment) {
        const latestCommentLink = document.createElement('a');
        latestCommentLink.href = `#${latestComment.dtId || latestComment.id}`;
        latestCommentLink.onclick = this.scrollToLatestComment;
        latestCommentLink.textContent = formatDate(latestComment.date);
        (new LiveTimestamp(latestCommentLink, latestComment.date, false)).init();

        latestCommentWrapper = document.createElement('span');
        latestCommentWrapper.className = 'cd-section-bar-item';
        latestCommentWrapper.append(cd.s('section-metadata-lastcomment'), ' ', latestCommentLink);
      }

      metadataElement = document.createElement('div');
      metadataElement.className = 'cd-section-metadata';
      const metadataItemList = [
        commentCountWrapper,
        authorCountWrapper,
        latestCommentWrapper,
      ].filter(defined);
      metadataElement.append(...metadataItemList);
    }

    /**
     * The latest comment in the section.
     *
     * @type {import('./Comment').default|undefined}
     */
    this.latestComment = latestComment;

    /**
     * The metadata element in the {@link Section#barElement bar element}.
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
    this.latestCommentWrapper = latestCommentWrapper;
  }

  /**
   * Create a real "More options" menu select in place of a dummy one.
   *
   * @fires moreMenuSelectCreated
   * @private
   */
  createMoreMenuSelect() {
    const moreMenuSelect = elementPrototypes.getMoreMenuSelect();

    const editOpeningCommentOption = this.canEditFirstComment() ?
      new OO.ui.MenuOptionWidget({
        data: 'editOpeningComment',
        label: cd.s('sm-editopeningcomment'),
        title: cd.s('sm-editopeningcomment-tooltip'),
        icon: 'edit',
      }) :
      undefined;
    const moveOption = this.canBeMoved() ?
      new OO.ui.MenuOptionWidget({
        data: 'move',
        label: cd.s('sm-move'),
        title: cd.s('sm-move-tooltip'),
        icon: 'arrowNext',
      }) :
      undefined;
    const addSubsectionOption = this.canAddSubsection() ?
      new OO.ui.MenuOptionWidget({
        data: 'addSubsection',
        label: cd.s('sm-addsubsection'),
        title: cd.s('sm-addsubsection-tooltip'),
        icon: 'speechBubbleAdd',
      }) :
      undefined;

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
      moreMenuSelectDummy.buttonElement.onmouseenter = this.createMoreMenuSelect;
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

    const actionsElement = document.createElement(this.level === 2 ? 'div' : 'span');
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
  addeBarElement() {
    const barElement = document.createElement('div');
    barElement.className = 'cd-section-bar';
    if (!this.metadataElement) {
      barElement.classList.add('cd-section-bar-nometadata');
    }
    barElement.append(...[this.metadataElement, this.actionsElement].filter(defined));
    this.headingElement.parentNode.insertBefore(barElement, this.headingElement.nextElementSibling);

    if (this.lastElement === this.headingElement) {
      this.lastElement = barElement;
    }
    if (this.lastElementInFirstChunk === this.headingElement) {
      this.lastElementInFirstChunk = barElement;
    }

    /**
     * The bar element under a 2-level section heading.
     *
     * @type {Element|undefined}
     */
    this.barElement = barElement;
  }

  /**
   * Add the {@link Section#actionsElement actions element} to the
   * {@link Secton#headingElement heading element} of a non-2-level section.
   *
   * @private
   */
  addActionsElement() {
    const headingInnerWrapper = document.createElement('span');
    headingInnerWrapper.append(...this.headingElement.childNodes);
    this.headingElement.append(headingInnerWrapper, this.actionsElement);
    this.headingElement.classList.add('cd-subsection-heading');
  }

  /**
   * Add the metadata and actions elements below or to the right of the section heading.
   */
  addMetadataAndActions() {
    this.createActionsElement();
    if (this.level === 2) {
      this.createMetadataElement();
      this.addeBarElement();
    } else {
      this.addActionsElement();
    }
  }

  /**
   * Highlight the unseen comments in the section and scroll to the first one of them.
   *
   * @param {Event} e
   * @private
   */
  scrollToNewComments(e) {
    e.preventDefault();
    CommentStatic.scrollToFirstHighlightAll(this.newComments);
  }

  /**
   * Add the new comment count to the metadata element. ("New" actually means "unseen at the moment
   * of load".)
   */
  addNewCommentCountMetadata() {
    if (this.level !== 2) return;

    /**
     * List of new comments in the section. ("New" actually means "unseen at the moment of load".)
     *
     * @type {import('./Comment').default[]}
     */
    this.newComments = this.comments.filter((comment) => comment.isSeen === false);

    if (!this.newComments.length) return;

    let newCommentCountLink;
    if (this.newComments.length === this.comments.length) {
      newCommentCountLink = document.createElement('span');
    } else {
      newCommentCountLink = document.createElement('a');
      newCommentCountLink.href = `#${this.newComments[0].dtId}`;
      newCommentCountLink.onclick = this.scrollToNewComments;
    }
    newCommentCountLink.textContent = cd.s(
      'section-metadata-commentcount-new',
      this.newComments.length
    );
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
      let n = this.headingElement.firstChild;
      while ((n = n.nextSibling)) {
        if (n.nodeType === Node.COMMENT_NODE && n.textContent.includes('__DTSUBSCRIBELINK__')) {
          [, this.subscribeId] = n.textContent.match('__DTSUBSCRIBELINK__(.+)') || [];
          break;
        }
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
   * @param {'quiet'|'silent'} [mode]
   * * No value: a notification will be shown.
   * * `'quiet'`: don't show a notification.
   * * `'silent'`: don't even change any UI, including the subscribe button appearance. If there
   *   is an error, it will be displayed though.
   * @param {string} [renamedFrom] If DiscussionTools' topic subscriptions API is not used and the
   *   section was renamed, the previous section headline. It is unwatched together with watching
   *   the current headline if there is no other coinciding headlines on the page.
   */
  subscribe(mode, renamedFrom) {
    // That's a mechanism mainly for legacy subscriptions but can be used for DT subscriptions as
    // well, for which `sections` will have more than one section when there is more than one
    // section created by a certain user at a certain moment in time.
    const sections = SectionStatic.getBySubscribeId(this.subscribeId);
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

    const unsubscribeHeadline = renamedFrom && !SectionStatic.getBySubscribeId(renamedFrom).length ?
      renamedFrom :
      undefined;
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
   * @param {'quiet'|'silent'} [mode]
   * * No value: a notification will be shown.
   * * `'quiet'`: don't show a notification.
   * * `'silent'`: don't even change any UI, including the subscribe button appearance. If there
   *   is an error, it will be displayed though.
   */
  unsubscribe(mode) {
    const sections = SectionStatic.getBySubscribeId(this.subscribeId);
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
            body += ' ' + cd.sParse('section-unwatch-stillwatched', ancestorSubscribedTo.headline);
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
    SectionStatic.prototype.parseHeadline.call(oldSection);
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
  setLastCommentIndentation(commentForm) {
    const [, replyPlaceholder] = this.inCode.firstChunkCode.match(/\n([#*]) *\n+$/) || [];
    if (replyPlaceholder) {
      this.inCode.lastCommentIndentation = replyPlaceholder;
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
          !lastComment.inCode.indentation.startsWith('#') ||

          // For now we use the workaround with commentForm.getContainerListType() to make sure "#"
          // is a part of comments organized in a numbered list, not of a numbered list _in_
          // the target comment.
          commentForm.getContainerListType() === 'ol'
        ) {
          this.inCode.lastCommentIndentation = lastComment.inCode.indentation;
        }
      }
    }
  }

  /**
   * Modify a whole section or page code string related to the section in accordance with an action.
   *
   * @param {object} options
   * @param {'replyInSection'|'addSubsection'} options.action
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

    return {
      wholeCode: newWholeCode,
      commentCode,
    };
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
      oldestCommentWordOverlap = calculateWordOverlap(
        this.oldestComment.getText(),
        removeWikiMarkup(match.code.slice(oldestSig.commentStartIndex, oldestSig.startIndex))
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
        console.warn(`Couldn't read the "${match.headline}" section contents.`);
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
   * @returns {import('./pageRegistry').Page}
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
   * Generate a DT subscribe ID from the oldest timestamp in the section and the current user's name
   * if there is no.
   *
   * @param {string} timestamp Oldest timestamp in the section.
   */
  ensureSubscribeIdPresent(timestamp) {
    if (!settings.get('useTopicSubscription') || this.subscribeId) return;

    this.subscribeId = SectionStatic.generateDtSubscriptionId(cd.user.getName(), timestamp);
  }

  /**
   * Get the section used to subscribe to if available.
   *
   * @returns {?Section}
   */
  getSectionSubscribedTo() {
    return settings.get('useTopicSubscription') ? this.getBase(true) : this;
  }

  /**
   * Find the last element of the section including
   *
   * @param {Function} [additionalCondition]
   * @returns {Element}
   */
  findRealLastElement(additionalCondition) {
    let realLastElement;
    let lastElement = this.lastElement;
    do {
      realLastElement = lastElement;
      lastElement = lastElement.nextElementSibling;
    } while (
      lastElement &&
      (
        lastElement.matches('.cd-section-button-container') ||
        (!additionalCondition || additionalCondition(lastElement))
      )
    );
    return realLastElement;
  }
}

export default Section;
