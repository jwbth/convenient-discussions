import Button from './Button';
import CdError from './CdError';
import Comment from './Comment';
import LiveTimestamp from './LiveTimestamp';
import PrototypeRegistry from './PrototypeRegistry';
import SectionSkeleton from './SectionSkeleton';
import SectionSource from './SectionSource';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import controller from './controller';
import pageRegistry from './pageRegistry';
import sectionRegistry from './sectionRegistry';
import settings from './settings';
import toc from './toc';
import { handleApiReject } from './utils-api';
import { defined, getHeadingLevel, underlinesToSpaces, unique } from './utils-general';
import { formatDate } from './utils-timestamp';
import { encodeWikilink, maskDistractingCode, normalizeCode } from './utils-wikitext';
import { getRangeContents } from './utils-window';

/**
 * Class representing a section.
 *
 * @augments SectionSkeleton
 */
class Section extends SectionSkeleton {
  /** @readonly */
  TYPE = 'section';

  /**
   * @type {HTMLElement}
   * @protected
   */
  hElement;

  /**
   * @type {HTMLElement}
   * @protected
   */
  headlineElement;

  /**
   * @type {HTMLElement}
   */
  headingElement;

  /** @type {HTMLElement} */
  lastElement;

  /** @type {HTMLElement} */
  lastElementInFirstChunk;

  /**
   * User for polymorphism with Comment.
   */
  isOpeningSection = null;

  /**
   * Is the section the last section on the page.
   *
   * @type {boolean}
   */
  isLastSection;

  /**
   * Presumed code of the section (based on the section ID) as of the time of the last request.
   * Filled upon running {@link Section#loadCode}.
   *
   * @type {string|undefined}
   */
  presumedCode;

  /**
   * ID of the revision that has {@link Section#code}. Filled upon running {@link Section#loadCode}.
   *
   * @name revisionId
   * @type {number|undefined}
   */
  revisionId;

  /**
   * Time when {@link Section#code} was queried (as the server reports it). Filled upon running
   * {@link Section#loadCode}.
   *
   * @name queryTimestamp
   * @type {string|undefined}
   */
  queryTimestamp;

  /**
   * Sections contents as HTML elements.
   *
   * @type {HTMLElement[]}
   */
  elements;

  /** @type {import('./Comment').default[]} */
  commentsInFirstChunk;

  /** @type {?import('./Comment').default} */
  oldestComment;

  /** @type {import('./Comment').default[]} */
  comments;

  /**
   * When checking for updates, this has the match of the section to the section analyzed in the
   * worker scope.
   *
   * @type {import('./updateChecker').SectionWorkerEnrichied|undefined}
   */
  match;

  /**
   * When checking for updates, this has the score of the {@link Section#match} of the section to
   * the section analyzed in the worker scope.
   *
   * @type {number|undefined}
   */
  matchScore;

  /**
   * @inheritdoc
   * @type {?string}
   */
  sourcePageName;

  /**
   * Section's source code object.
   *
   * @type {?SectionSource|undefined}
   */
  source;

  /**
   * Subscription state of the section. Currently, `true` stands for "subscribed", `false` for
   * "unsubscribed", `null` for n/a.
   *
   * @type {?boolean}
   */
  subscriptionState;

  /**
   * "Add subsection to <i>topic</i>" button at the end of the section (under the reply button of
   * the last descendant section; shows up on hover of the reply button).
   *
   * @type {Button|undefined}
   */
  addSubsectionButtonLastDescendant;

  /**
   * Popup with the list of users who have posted in the section.
   *
   * @type {OO.ui.PopupWidget|undefined}
   */
  authorsPopup;

  /** @type {HTMLElement} */
  actionsElement;

  /**
   * Create a section object.
   *
   * @param {import('./Parser').default} parser
   * @param {object} heading Heading object returned by {@link Parser#findHeadings}.
   * @param {object[]} targets Sorted target objects returned by  {@link Parser#findSignatures} +
   *   {@link Parser#findHeadings}.
   * @param {import('./Subscriptions').default} subscriptions
   * @throws {CdError}
   */
  constructor(parser, heading, targets, subscriptions) {
    super(parser, heading, targets);

    this.subscriptions = subscriptions;

    this.useTopicSubscription = settings.get('useTopicSubscription');

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
    this.sourcePage = this.sourcePageName ?
      /** @type {import('./pageRegistry').Page} */ (pageRegistry.get(this.sourcePageName)) :
      cd.page;

    this.sourcePageName = null;

    /**
     * Is the section transcluded from a template (usually, that template in turn transludes
     * content, like here:
     * https://ru.wikipedia.org/wiki/Project:Выборы_арбитров/Лето_2021/Вопросы/Кандидатские_заявления.)
     *
     * @type {boolean}
     */
    this.isTranscludedFromTemplate = this.sourcePage?.namespaceId === 10;

    /**
     * Is the section actionable. (If it is in a closed discussion or on an old version page, then
     * no).
     *
     * @type {boolean}
     */
    this.isActionable = Boolean(
      cd.page.isActive() &&
      !controller.getClosedDiscussions().some((el) => el.contains(this.headingElement)) &&
      !this.isTranscludedFromTemplate
    );

    if (this.isTranscludedFromTemplate) {
      this.comments.forEach((comment) => {
        comment.isActionable = false;
      });
    }

    this.extractSubscribeId();

    /**
     * Headline element as a jQuery object.
     *
     * @type {JQuery}
     */
    this.$headline = $(this.headlineElement);

    /**
     * Heading element as a jQuery element.
     *
     * @type {JQuery}
     */
    this.$heading = $(this.headingElement);

    /**
     * Is the section visible (`visibility: visible` as opposed to `visibility: hidden`). Can be
     * `true` when the `improvePerformance` setting is enabled.
     *
     * @type {boolean}
     */
    this.isHidden = false;
  }

  /**
   * _For internal use._ Add a {@link Section#replyButton "Reply in section" button} to the end of
   * the first chunk of the section.
   */
  maybeAddReplyButton() {
    if (!this.canBeReplied()) return;

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
    const element = Section.prototypes.get('replyButton');
    const button = new Button({
      element: element,
      buttonElement: /** @type {HTMLElement} */ (element.firstChild),
      action: () => {
        this.reply();
      },
    });

    const wrapper = document.createElement(tag);
    wrapper.className = 'cd-replyButtonWrapper';
    wrapper.append(button.element);

    // The container contains the wrapper that wraps the element ^_^
    let container;
    if (createList) {
      container = document.createElement('dl');
      container.className = 'cd-commentLevel cd-commentLevel-1 cd-section-button-container';
      /** @type {HTMLElement} */ (lastElement.parentElement).insertBefore(
        container,
        lastElement.nextElementSibling
      );
    } else {
      container = lastElement;
      container.classList.add('cd-section-button-container');
    }
    container.append(wrapper);

    /**
     * Reply button at the bottom of the first chunk of the section.
     *
     * @type {Button|undefined}
     */
    this.replyButton = button;

    /**
     * Reply button wrapper and part-time reply comment form wrapper, an item element.
     *
     * @type {JQuery|undefined}
     */
    this.$replyButtonWrapper = $(wrapper);

    /**
     * Reply button container and part-time reply comment form container, a list element. It is
     * wrapped around the {@link Section#$replyButtonWrapper reply button wrapper}, but it is
     * created by the script only when there is no suitable element that already exists. If there
     * is, it can contain other elements (and comments) too.
     *
     * @type {JQuery|undefined}
     */
    this.$replyButtonContainer = $(container);
  }

  /**
   * _For internal use._ Add
   * {@link Section#addSubsectionButtonLastDescendant "Add subsection to <i>topic</i>"} and
   * {@link Section#addSubsectionButton "Add subsection to <i>section</i>"} buttons that
   * appears when hovering over a {@link Section#replyButton "Reply in section" button}.
   */
  maybeAddAddSubsectionButtons() {
    if (!this.canBeReplied()) return;

    /*
      "Add subsection" buttons of sections are structured like this:

        == 1 ==
        button of 1

        === 2 ===
        button of 2
        last descendant button of 1

      So, all sections have a button under their first chunks, but only 2-level sections have a
      topic button under their last descendant.
     */

    const button = this.canBeSubsectioned() ? this.createAddSubsectionButton() : undefined;

    const baseSection = this.getBase(true);
    if (baseSection) {
      baseSection.addSubsectionButtonLastDescendant =
        this === baseSection.getLastDescendant() && baseSection.canBeSubsectioned()
          ? baseSection.createAddSubsectionButton(this)
          : undefined;
    }

    const container = document.createElement('div');
    container.className = 'cd-section-button-container cd-addSubsectionButtons-container';
    container.style.display = 'none';
    container.append(
      ...[button?.element, baseSection?.addSubsectionButtonLastDescendant?.element].filter(defined)
    );

    /** @type {HTMLElement} */ (this.lastElementInFirstChunk.parentElement).insertBefore(
      container,
      this.lastElementInFirstChunk.nextElementSibling
    );

    /**
     * "Add subsection to <i>section</i>" button at the end of the first chunk of the section (shows
     * up on hover of the reply button).
     *
     * @type {Button|undefined}
     */
    this.addSubsectionButton = button;

    /**
     * "Add subsection" buttons container.
     *
     * @type {JQuery|undefined}
     */
    this.$addSubsectionButtonsContainer = $(container);
  }

  /**
   * Create an "Add subsection" button (any kind).
   *
   * @param {Section} [buttonsContainerInstance=this]
   * @returns {Button}
   */
  createAddSubsectionButton(buttonsContainerInstance = this) {
    const element = Section.prototypes.get('addSubsectionButton');
    const button = new Button({
      element: element,
      buttonElement: /** @type {HTMLElement} */ (element.firstChild),
      labelElement: /** @type {HTMLElement} */ (element.querySelector('.oo-ui-labelElement-label')),
      label: cd.s('section-addsubsection-to', this.headline),
      action: () => {
        this.addSubsection();
      },
    });
    button.buttonElement.onmouseenter = buttonsContainerInstance.resetHideAddSubsectionButtonTimeout
      .bind(buttonsContainerInstance);
    button.buttonElement.onmouseleave = buttonsContainerInstance.deferAddSubsectionButtonHide
      .bind(buttonsContainerInstance);

    return button;
  }

  /**
   * Get the last descendant section of the section.
   *
   * @returns {?Section}
   */
  getLastDescendant() {
    return this.getChildren(true).slice(-1)[0] || null;
  }

  /**
   * Reset the timeout for showing the "Add subsection" button.
   *
   * @private
   */
  resetShowAddSubsectionButtonTimeout() {
    clearTimeout(this.showAddSubsectionButtonTimeout);
    delete this.showAddSubsectionButtonTimeout;
  }

  /**
   * Reset the timeout for hiding the "Add subsection" button.
   *
   * @private
   */
  resetHideAddSubsectionButtonTimeout() {
    clearTimeout(this.hideAddSubsectionButtonTimeout);
    delete this.hideAddSubsectionButtonTimeout;
  }

  /**
   * Hide the "Add subsection" button after a second.
   *
   * @private
   */
  deferAddSubsectionButtonHide() {
    if (this.hideAddSubsectionButtonTimeout) return;

    this.hideAddSubsectionButtonTimeout = setTimeout(() => {
      /** @type {JQuery} */ (this.$addSubsectionButtonsContainer).hide();
    }, 1000);
  }

  /**
   * Handle a `mouseenter` event on the reply button.
   *
   * @private
   */
  handleReplyButtonHover() {
    this.resetHideAddSubsectionButtonTimeout();

    if (this.showAddSubsectionButtonTimeout) return;

    this.showAddSubsectionButtonTimeout = setTimeout(() => {
      /** @type {JQuery} */ (this.$addSubsectionButtonsContainer).show();
    }, 1000);
  }

  /**
   * Handle a `mouseleave` event on the reply button.
   *
   * @private
   */
  handleReplyButtonUnhover() {
    this.resetShowAddSubsectionButtonTimeout();
    this.deferAddSubsectionButtonHide();
  }

  /**
   * _For internal use._ Make it so that when the user hovers over a reply button at the end of the
   * section for a second, "Add subsection" button(s) show up under it.
   */
  showAddSubsectionButtonsOnReplyButtonHover() {
    if (!this.replyButton) return;

    this.replyButton.buttonElement.onmouseenter = this.handleReplyButtonHover.bind(this);
    this.replyButton.buttonElement.onmouseleave = this.handleReplyButtonUnhover.bind(this);
  }

  /**
   * _For internal use._ Add a "Subscribe" / "Unsubscribe" button to the actions element.
   *
   * @fires subscribeButtonAdded
   */
  addSubscribeButton() {
    if (!this.subscribeId) return;

    this.subscriptionState = this.subscriptions.getState(this.subscribeId);
    if (controller.isSubscribingDisabled() && !this.subscriptionState) return;

    /**
     * Subscribe button widget in the {@link Section#actionsElement actions element}.
     *
     * @type {OO.ui.ButtonMenuSelectWidget}
     */
    this.actions.subscribeButton = new OO.ui.ButtonWidget({
      framed: false,
      flags: ['progressive'],
      icon: 'bellOutline',
      label: cd.s('sm-subscribe'),
      title: cd.mws('discussiontools-topicsubscription-button-subscribe-tooltip'),
      classes: ['cd-section-bar-button', 'cd-section-bar-button-subscribe'],
    });
    if (cd.g.skin === 'monobook') {
      this.actions.subscribeButton.$element
        .find('.oo-ui-iconElement-icon')
        .addClass('oo-ui-image-progressive');
    }

    this.updateSubscribeButtonState();

    this.actionsElement.prepend(this.actions.subscribeButton.$element[0]);

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
  canFirstCommentBeEdited() {
    return Boolean(
      this.isActionable &&
      this.commentsInFirstChunk.length &&
      this.comments[0].isOpeningSection &&
      (this.comments[0].canBeEdited()) &&
      !this.comments[0].isCollapsed
    );
  }

  /**
   * Check whether the user should get the affordance to move the section to another page.
   *
   * @returns {boolean}
   */
  canBeMoved() {
    return (
      this.isTopic() &&
      !this.isTranscludedFromTemplate &&
      (cd.page.isActive() || cd.page.isCurrentArchive())
    );
  }

  /**
   * Check whether the user should get the affordance to add a reply to the section.
   *
   * @returns {this is {
   *   isActionable: true;
   *   replyButton: Button;
   *   $replyButtonWrapper: JQuery;
   *   $replyButtonContainer: JQuery;
   * }}
   */
  canBeReplied() {
    const nextSection = sectionRegistry.getByIndex(this.index + 1);

    return Boolean(
      this.isActionable &&

      // Is the first chunk closed
      !(
        this.commentsInFirstChunk[0] &&
        this.commentsInFirstChunk[0].level === 0 &&
        this.commentsInFirstChunk.every((comment) => !comment.isActionable)
      ) &&

      // Is the first chunk empty and precedes a subsection
      !(
        this.lastElementInFirstChunk !== this.lastElement &&
        this.lastElementInFirstChunk === this.headingElement
      ) &&

      // May mean complex formatting, so we better keep out
      (!nextSection || nextSection.headingNestingLevel === this.headingNestingLevel) &&

      // Is the section buried in a table.
      // https://ru.wikipedia.org/wiki/Project:Запросы_к_администраторам/Быстрые
      !['TR', 'TD', 'TH'].includes(this.lastElementInFirstChunk.tagName)
    );
  }

  /**
   * Check whether the user should get the affordance to add a subsection to the section.
   *
   * @returns {boolean}
   */
  canBeSubsectioned() {
    const nextSameLevelSection = sectionRegistry.getAll()
      .slice(this.index + 1)
      .find((otherSection) => otherSection.level === this.level);

    return Boolean(
      this.isActionable &&
      this.level >= 2 &&
      this.level <= 5 &&

      // Is closed
      !(
        this.comments[0] &&
        this.comments[0].level === 0 &&
        this.comments.every((comment) => !comment.isActionable)
      ) &&

      (
        // While the "Reply" button is added to the end of the first chunk, the "Add subsection"
        // button is added to the end of the whole section, so we look the next section of the same
        // level.
        !nextSameLevelSection ||

        // If the next section of the same level has another nesting level (e.g., is inside a <div>
        // with a specific style), don't add the "Add subsection" button - it would appear in a
        // wrong place.
        nextSameLevelSection.headingNestingLevel === this.headingNestingLevel
      )
    );
  }

  /**
   * Show or hide a popup with the list of users who have posted in the section.
   *
   * @private
   */
  toggleAuthors() {
    if (!this.authorsPopup) {
      const $button = $(/** @type {Button} */ (this.authorCountButton).element);
      this.authorsPopup = new OO.ui.PopupWidget({
        $content: this.createAuthorsPopupContent(),
        head: false,
        padded: true,
        autoClose: true,
        $autoCloseIgnore: $button,
        position: 'above',
        $floatableContainer: $button,
        classes: ['cd-popup-authors'],
      });
      $(controller.getPopupOverlay()).append(this.authorsPopup.$element);
    }

    this.authorsPopup.toggle();
  }

  /**
   * Create content for {@link Section#authorsPopup} popup.
   *
   * @returns {JQuery}
   * @private
   */
  createAuthorsPopupContent() {
    const data = this.comments
      .map((comment) => comment.author)
      .filter(unique)
      .map(
        (author) =>
          /** @type {[import('./userRegistry').User, Comment[]]} */ ([
            author,
            this.comments.filter((comment) => comment.author === author),
          ])
      )
      .flatMap(([author, comments]) => ({
        name: author.getName(),
        count: comments.length,
        newestCommentDate: Comment.getNewest(comments, true)?.date,
        $link: $('<a>')
          .text(author.getName())
          .attr('href', `#${comments[0].dtId || comments[0].id}`)
          .on('click', Comment.scrollToFirstFlashAll.bind(Comment, comments)),
      }));

    /**
     * @typedef {'name'|'count'|'date'} PanelName
     */

    const getPanelByName = (/** @type {PanelName} */ name) =>
      name === 'name' ? namePanel : name === 'count' ? countPanel : datePanel;

    const authorsSortSetting = settings.get('authorsSort');
    const sortSelect = new OO.ui.ButtonSelectWidget({
      items: [
        new OO.ui.ButtonOptionWidget({
          data: 'name',
          label: cd.s('section-authors-sort-name'),
          selected: authorsSortSetting === 'name',
        }),
        new OO.ui.ButtonOptionWidget({
          data: 'count',
          label: cd.s('section-authors-sort-count'),
          selected: authorsSortSetting === 'count',
        }),
        new OO.ui.ButtonOptionWidget({
          data: 'date',
          label: cd.s('section-authors-sort-date'),
          selected: authorsSortSetting === 'date',
        }),
      ],
      classes: ['cd-popup-authors-sort'],
    });
    sortSelect
    sortSelect.on('choose', (item) => {
      stack.setItem(getPanelByName(/** @type {PanelName} */ (item.getData())));
      settings.saveSettingOnTheFly('authorsSort', item.getData());
    });

    const wrapInHlist = (/** @type {JQuery[]} */ content) =>
      $('<ul>').addClass('cd-hlist').append(content);

    const namePanel = new OO.ui.PanelLayout({
      $content: wrapInHlist(
        data
          .sort((d1, d2) => d2.name > d1.name ? -1 : 1)
          .map((d) => $('<li>').append(d.$link.clone()))
      ),
      padded: false,
      expanded: false,
    });
    const countPanel = new OO.ui.PanelLayout({
      $content: wrapInHlist(
        data
          .sort((d1, d2) => d2.count - d1.count)
          .map((d) => (
            $('<li>').append(
              d.$link.clone(),
              cd.mws('word-separator') + cd.mws('parentheses', d.count)
            )
          ))
      ),
      padded: false,
      expanded: false,
    });
    const datePanel = new OO.ui.PanelLayout({
      $content: wrapInHlist(
        data
          .sort(
            (d1, d2) =>
              (d2.newestCommentDate?.getTime() || 0) - (d1.newestCommentDate?.getTime() || 0)
          )
          .map((d) => $('<li>').append(d.$link.clone()))
      ),
      padded: false,
      expanded: false,
    });
    const stack = new OO.ui.StackLayout({
      items: [namePanel, countPanel, datePanel],
      expanded: false,
    });
    stack.setItem(getPanelByName(authorsSortSetting));

    return $()
      .add(sortSelect.$element)
      .add(stack.$element);
  }

  /**
   * Scroll to the latest comment in the section.
   *
   * @param {Event} event
   * @private
   */
  scrollToLatestComment(event) {
    event.preventDefault();
    /** @type {Comment} */ (this.latestComment).scrollTo({ pushState: true });
  }

  /**
   * Create a metadata container (for 2-level sections).
   *
   * @private
   */
  maybeCreateMetadataElement() {
    if (!this.isTopic()) return;

    const authorCount = this.comments.map((comment) => comment.author).filter(unique).length;
    const latestComment = Comment.getNewest(this.comments, false);

    let latestCommentWrapper;
    let commentCountWrapper;
    let authorCountButton;
    let metadataElement;
    if (this.comments.length) {
      if (latestComment) {
        const latestCommentLink = document.createElement('a');
        latestCommentLink.href = `#${latestComment.dtId || latestComment.id}`;
        latestCommentLink.onclick = this.scrollToLatestComment.bind(this);
        latestCommentLink.textContent = formatDate(latestComment.date);
        (new LiveTimestamp(latestCommentLink, latestComment.date, false)).init();

        latestCommentWrapper = document.createElement('span');
        latestCommentWrapper.className = 'cd-section-bar-item';
        latestCommentWrapper.append(cd.s('section-metadata-lastcomment'), ' ', latestCommentLink);
      }

      commentCountWrapper = document.createElement('span');
      commentCountWrapper.className = 'cd-section-bar-item';
      commentCountWrapper.innerHTML = cd.sParse(
        'section-metadata-commentcount-authorcount',
        this.comments.length,
        authorCount
      );
      if (this.comments.length === 1) {
        commentCountWrapper.querySelector('.cd-section-metadata-authorcount')?.remove();
      }

      // This element comes from translation strings
      const span = commentCountWrapper.querySelector('.cd-section-metadata-authorcount-link');
      if (span) {
        // A tiny bit slower on long pages than direct element creation, but at least this can be
        // triggered by Enter.
        authorCountButton = new Button({
          label: span.textContent,
          action: () => {
            this.toggleAuthors();
          },
        });

        // `role` changes the link color, making it different from the color of neighboring links,
        // and I think it doesn't really give any benefit.
        authorCountButton.element.removeAttribute('role');

        /** @type {HTMLElement} */ (span.firstChild).replaceWith(authorCountButton.element);
      }

      metadataElement = /** @type {HTMLElement} */ (document.createElement('div'));
      metadataElement.className = 'cd-section-metadata';
      metadataElement.append(...[commentCountWrapper, latestCommentWrapper].filter(defined));
    }

    /**
     * Latest comment in a 2-level section.
     *
     * @type {import('./Comment').default|null|undefined}
     */
    this.latestComment = latestComment;

    /**
     * Metadata element in the {@link Section#barElement bar element}.
     *
     * @type {HTMLElement|undefined}
     */
    this.metadataElement = metadataElement;

    /**
     * Comment count wrapper element in the {@link Section#metadataElement metadata element}.
     *
     * @type {HTMLElement|undefined}
     * @protected
     */
    this.commentCountWrapper = commentCountWrapper;

    /**
     * Author count button in the {@link Section#metadataElement metadata element}.
     *
     * @type {Button|undefined}
     * @protected
     */
    this.authorCountButton = authorCountButton;

    /**
     * Latest comment date wrapper element in the {@link Section#metadataElement metadata element}.
     *
     * @type {Element|undefined}
     * @protected
     */
    this.latestCommentWrapper = latestCommentWrapper;

    if (metadataElement) {
      /**
       * Metadata element in the {@link Section#$bar bar element}.
       *
       * @type {JQuery|undefined}
       */
      this.$metadata = $(metadataElement);
    }

    if (commentCountWrapper) {
      /**
       * Comment count wrapper element in the {@link Section#$metadata metadata element}.
       *
       * @type {JQuery|undefined}
       * @protected
       */
      this.$commentCountWrapper = $(commentCountWrapper);
    }

    if (authorCountButton) {
      /**
       * Author count button element in the {@link Section#$metadata metadata element}.
       *
       * @type {JQuery|undefined}
       */
      this.$authorCountButton = $(authorCountButton.element);
    }

    if (latestCommentWrapper) {
      /**
       * Latest comment date wrapper element in the {@link Section#$metadata metadata element}.
       *
       * @type {JQuery|undefined}
       */
      this.$latestCommentWrapper = $(latestCommentWrapper);
    }
  }

  /**
   * Create a real "More options" menu select in place of a dummy one.
   *
   * @fires moreMenuSelectCreated
   * @private
   */
  createMoreMenuSelect() {
    const moreMenuSelect = /** @type {OO.ui.ButtonMenuSelectWidget} */ (
      Section.prototypes.getWidget('moreMenuSelect')()
    );

    const editOpeningCommentOption = this.canFirstCommentBeEdited() ?
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
    const addSubsectionOption = this.canBeSubsectioned() ?
      new OO.ui.MenuOptionWidget({
        data: 'addSubsection',
        label: cd.s('sm-addsubsection'),
        title: cd.s('sm-addsubsection-tooltip'),
        icon: 'speechBubbleAdd',
      }) :
      undefined;

    this.actions.moreMenuSelectDummy.element.remove();
    this.actionsElement.append(moreMenuSelect.$element[0]);

    const items = [editOpeningCommentOption, moveOption, addSubsectionOption].filter(defined);
    moreMenuSelect.getMenu()
      .addItems(items)
      .on('choose', (option) => {
        switch (option.getData()) {
          case 'editOpeningComment':
            this.comments[0].edit({ focusHeadline: true });
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
     * @type {OO.ui.ButtonMenuSelectWidget|undefined}
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
    if (this.canFirstCommentBeEdited() || this.canBeMoved() || this.canBeSubsectioned()) {
      const element = Section.prototypes.get('moreMenuSelect');
      moreMenuSelectDummy = new Button({
        element,
        buttonElement: /** @type {HTMLElement} */ (element.firstChild),
        action: () => {
          this.createAndClickMoreMenuSelect();
        },
      });
      moreMenuSelectDummy.buttonElement.onmouseenter = this.createMoreMenuSelect.bind(this);
    }

    let copyLinkButton;
    if (this.headline) {
      const element = Section.prototypes.get('copyLinkButton');
      copyLinkButton = new Button({
        element,
        buttonElement: /** @type {HTMLElement} */ (element.firstChild),
        iconElement: /** @type {HTMLElement} */ (element.querySelector('.oo-ui-iconElement-icon')),
        href: `${cd.page.getUrl()}#${this.id}`,
        action: (event) => {
          this.copyLink(event);
        },
        flags: ['progressive'],
      });
      copyLinkButton.buttonElement.classList.add('mw-selflink-fragment');
    }

    const actionsElement = document.createElement(this.isTopic() ? 'div' : 'span');
    actionsElement.className = [
      'cd-section-actions',
      this.isTopic() ? 'cd-topic-actions' : 'cd-subsection-actions',
    ].filter(defined).join(' ');
    actionsElement.append(
      ...[copyLinkButton, moreMenuSelectDummy]
        .filter(defined)
        .map((button) => button.element)
    );

    /**
     * Actions element under the 2-level section heading _or_ to the right of headings of other
     * levels.
     *
     * @type {HTMLElement}
     * @private
     */
    this.actionsElement = actionsElement;

    /**
     * Actions element under the 2-level section heading _or_ to the right of headings of other
     * levels.
     *
     * @type {JQuery}
     */
    this.$actions = $(actionsElement);

    /**
     * Section actions object. It contains widgets (buttons, menus) triggering the actions of the
     * section.
     *
     * @type {object}
     */
    this.actions = {
      /**
       * Copy link button widget in the {@link Section#actionsElement actions element}.
       *
       * @type {Button|undefined}
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
  maybeAddBarElement() {
    if (!this.isTopic()) return;

    const barElement = document.createElement('div');
    barElement.className = 'cd-section-bar';
    if (!this.metadataElement) {
      barElement.classList.add('cd-section-bar-nometadata');
    }
    barElement.append(...[this.metadataElement, this.actionsElement].filter(defined));

    if (cd.g.isDtVisualEnhancementsEnabled) {
      this.headingElement.querySelector('.ext-discussiontools-init-section-bar')?.remove();
    }
    /** @type {HTMLElement} */ (this.headingElement.parentElement).insertBefore(
      barElement,
      this.headingElement.nextElementSibling
    );

    if (this.lastElement === this.headingElement) {
      this.lastElement = barElement;
    }
    if (this.lastElementInFirstChunk === this.headingElement) {
      this.lastElementInFirstChunk = barElement;
    }

    /**
     * Bar element under a 2-level section heading.
     *
     * @type {Element}
     */
    this.barElement = barElement;

    /**
     * Bar element under a 2-level section heading.
     *
     * @type {JQuery|undefined}
     */
    this.$bar = $(barElement);
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
    this.maybeCreateMetadataElement();
    this.maybeAddBarElement();
    this.addActionsElement();
  }

  /**
   * Check whether the section is a topic (and should have the metadata element and so on).
   *
   * @returns {this is { level: 2 }}
   */
  isTopic() {
    return this.level === 2;
  }

  /**
   * Flash the unseen comments in the section and scroll to the first one of them.
   *
   * @param {Event} event
   * @private
   */
  scrollToNewComments(event) {
    event.preventDefault();
    Comment.scrollToFirstFlashAll(/** @type {Comment[]} */ (this.newComments));
  }


  /**
   * _For internal use._ Update the new comments data for the section and add the new comment count
   * to the metadata element. ("New" actually means "unseen at the moment of load".).
   */
  updateNewCommentsData() {
    /**
     * List of new comments in the section. ("New" actually means "unseen at the moment of load".)
     *
     * @type {import('./Comment').default[]|undefined}
     */
    this.newComments = this.comments.filter((comment) => comment.isSeen === false);

    if (
      !this.isTopic() ||
      !this.newComments.length ||
      this.newComments.length === this.comments.length
    ) {
      return;
    }

    const newText = cd.s('section-metadata-newcommentcount', this.newComments.length);

    let newLink = document.createElement('a');
    newLink.textContent = newText;
    newLink.href = `#${this.newComments[0].dtId}`;
    newLink.onclick = this.scrollToNewComments.bind(this);

    const newCommentCountWrapper = document.createElement('span');
    newCommentCountWrapper.className = 'cd-section-bar-item';
    newCommentCountWrapper.append(newLink || newText);

    /** @type {HTMLElement} */ (this.metadataElement).insertBefore(
      newCommentCountWrapper,
      /** @type {HTMLElement} */ (this.commentCountWrapper).nextSibling || null
    );

    this.newCommentCountWrapper = newCommentCountWrapper;
    this.$newCommentCountWrapper = $(newCommentCountWrapper);
  }

  /**
   * Extract the section's {@link Section#subscribeId subscribe ID}.
   */
  extractSubscribeId() {
    if (!this.useTopicSubscription) {
      /**
       * The section subscribe ID, either in the DiscussionTools format or just a headline if legacy
       * subscriptions are used.
       *
       * @type {string|undefined}
       */
      this.subscribeId = this.headline;

      return;
    }

    if (!this.isTopic()) return;

    let subscribeId = controller.getDtSubscribableThreads()
      ?.find((thread) => (
        thread.id === this.hElement.dataset.mwThreadId ||
        thread.id === this.headlineElement.dataset.mwThreadId
      ))
      ?.name;

    if (!subscribeId) {
      // Older versions of MediaWiki
      if (cd.g.isDtTopicSubscriptionEnabled) {
        if (this.headingElement.querySelector('.ext-discussiontools-init-section-subscribe-link')) {
          const headlineJson = this.headlineElement.dataset.mwComment;
          if (headlineJson) {
            try {
              subscribeId = JSON.parse(headlineJson).name;
            } catch {
              // Empty
            }
          }
        }
      } else {
        for (let n = this.headingElement.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === Node.COMMENT_NODE && n.textContent.includes('__DTSUBSCRIBELINK__')) {
            [, subscribeId] = n.textContent.match('__DTSUBSCRIBELINK__(.+)') || [];
            break;
          }
        }
      }
    }

    // Filter out sections with no comments, therefore no meaningful ID
    this.subscribeId = subscribeId === 'h-' ? undefined : subscribeId;
  }

  /**
   * Create an {@link Section#replyForm add reply form}.
   *
   * @param {object} [initialState]
   * @param {import('./CommentForm').default} [commentForm]
   * @returns {import('./CommentForm').default}
   */
  reply(initialState, commentForm) {
    // Check for existence in case replying is called from a script of some kind (there is no button
    // to call it from CD).
    if (!this.replyForm) {
      // Hide the reply button before setupping the comming form so that IME selector is positioned
      // correctly
      /** @type {Button} */ (this.replyButton).hide();

      /**
       * Reply form related to the section.
       *
       * @type {import('./CommentForm').default|undefined}
       */
      this.replyForm = commentFormRegistry.setupCommentForm(this, {
        mode: 'replyInSection',
      }, initialState, commentForm);
    }

    if (this.$addSubsectionButtonsContainer) {
      this.$addSubsectionButtonsContainer.hide();
      this.resetShowAddSubsectionButtonTimeout();
    }

    return this.replyForm;
  }

  /**
   * Create an {@link Section#addSubsectionForm add subsection form} form or focus an existing one.
   *
   * @param {object} [initialState]
   * @param {import('./CommentForm').default} [commentForm]
   * @returns {import('./CommentForm').default}
   * @throws {CdError}
   */
  addSubsection(initialState, commentForm) {
    if (!this.canBeSubsectioned()) {
      throw new CdError();
    }

    this.$addSubsectionButtonsContainer?.hide();

    if (this.addSubsectionForm) {
      this.addSubsectionForm.$element.cdScrollIntoView('center');
      this.addSubsectionForm.headlineInput?.focus();
    } else {
      /**
       * "Add subsection" form related to the section.
       *
       * @type {import('./CommentForm').default|undefined}
       */
      this.addSubsectionForm = commentFormRegistry.setupCommentForm(this, {
        mode: 'addSubsection',
      }, initialState, commentForm);

      this.addSubsectionButtonLastDescendant?.hide();

      // The last descendant is under which the "Add subsection" form is placed.
      const lastDescendant = this.getLastDescendant();

      lastDescendant?.$addSubsectionButtonsContainer?.hide();

      // Hide the button only if it's directly above the form
      if (!lastDescendant) {
        this.addSubsectionButton?.hide();
      }

      this.addSubsectionForm.on('teardown', () => {
        this.addSubsectionButtonLastDescendant?.show();
        this.addSubsectionButton?.show();
      });
    }

    return this.addSubsectionForm;
  }

  /**
   * Add a comment form {@link CommentForm#getTarget targeted} at this section to the page.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   * @param {import('./CommentForm').default} commentForm
   */
  addCommentFormToPage(mode, commentForm) {
    if (mode === 'replyInSection' && this.canBeReplied()) {
      this.$replyButtonWrapper
        .append(commentForm.$element)
        .addClass('cd-replyButtonWrapper-hasCommentForm');
    } else if (mode === 'addSubsection') {
      /*
        In the following structure:
          == Level 2 section ==
          === Level 3 section ===
          ==== Level 4 section ====
        ..."Add subsection" forms should go in the opposite order. So, if there are "Add
        subsection" forms for a level 4 and then a level 2 section and the user clicks "Add
        subsection" for a level 3 section, we need to put our form between them.
        */
      $(this.findRealLastElement((el) => (
        [...el.classList].some((className) => (
          className.match(new RegExp(`^cd-commentForm-addSubsection-[${this.level}-6]$`))
        ))
      ))).after(commentForm.$element);
    }
  }

  /**
   * Clean up traces of a comment form {@link CommentForm#getTarget targeted} at this section from
   * the page.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   */
  cleanUpCommentFormTraces(mode) {
    if (mode === 'replyInSection' && this.canBeReplied()) {
      this.replyButton.show();
      this.$replyButtonWrapper.removeClass('cd-replyButtonWrapper-hasCommentForm');
    }
  }

  /**
   * Show a move section dialog.
   */
  move() {
    if (controller.isPageOverlayOn()) return;

    const MoveSectionDialog = require('./MoveSectionDialog').default;

    const dialog = new MoveSectionDialog(this);
    controller.getWindowManager().addWindows([dialog]);
    controller.getWindowManager().openWindow(dialog);

    cd.tests.moveSectionDialog = dialog;
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
   * - No value: a notification will be shown.
   * - `'quiet'`: don't show a notification.
   * - `'silent'`: don't even change any UI, including the subscribe button appearance. If there is
   *   an error, it will be displayed though.
   * @param {string} [renamedFrom] If DiscussionTools' topic subscriptions API is not used and the
   *   section was renamed, the previous section headline. It is unwatched together with watching
   *   the current headline if there are no other coinciding headlines on the page.
   */
  subscribe(mode, renamedFrom) {
    if (!this.subscribeId) return;

    // That's a mechanism mainly for legacy subscriptions but can be used for DT subscriptions as
    // well, for which `sections` will have more than one section when there is more than one
    // section created by a certain user at a certain moment in time.
    const sections = sectionRegistry.getBySubscribeId(this.subscribeId);
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

    this.subscriptions.subscribe(
      this.subscribeId,
      this.id,
      !!mode,
      // Unsubscribe from
      renamedFrom && !sectionRegistry.getBySubscribeId(renamedFrom).length ?
        renamedFrom :
        undefined,
    )
      .then(() => {
        // TODO: this condition seems a bad idea because when we could update the subscriptions but
        // couldn't reload the page, the UI becomes unsynchronized. But there is also no UI
        // flickering when posting. Maybe update the UI in case the page reload was unsuccessful?
        if (mode !== 'silent') {
          sections.forEach((section) => {
            section.changeSubscriptionState(true);
          });
        }
      })
      .then(finallyCallback, finallyCallback);
  }

  /**
   * Remove the section from the subscription list.
   *
   * @param {'quiet'|'silent'} [mode]
   * - No value: a notification will be shown.
   * - `'quiet'`: don't show a notification.
   * - `'silent'`: don't even change any UI, including the subscribe button appearance. If there is
   *   an error, it will be displayed though.
   */
  unsubscribe(mode) {
    if (!this.subscribeId) return;

    const sections = sectionRegistry.getBySubscribeId(this.subscribeId);
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

    this.subscriptions.unsubscribe(this.subscribeId, this.id, !!mode)
      .then(() => {
        if (mode !== 'silent') {
          sections.forEach((section) => {
            section.changeSubscriptionState(false);
          });
        }
      })
      .then(finallyCallback, finallyCallback);
  }

  /**
   * Change the subscription state after actually subscribing/unsubscribing and change the related
   * DOM.
   *
   * @param {boolean} state
   * @private
   */
  changeSubscriptionState(state) {
    this.subscriptionState = state;
    this.updateSubscribeButtonState();
    this.updateTocLink();
  }

  /**
   * Resubscribe to a renamed section if legacy topic subscriptions are used.
   *
   * @param {object} currentCommentData
   * @param {object} oldCommentData
   */
  resubscribeIfRenamed(currentCommentData, oldCommentData) {
    if (
      this.useTopicSubscription ||
      this.subscriptionState ||
      getHeadingLevel({
        tagName: currentCommentData.elementNames[0],
        className: currentCommentData.elementClassNames[0],
      }) ||
      oldCommentData.elementNames[0] !== currentCommentData.elementNames[0]
    ) {
      return;
    }

    const oldHeadingHtml = oldCommentData.elementHtmls[0].replace(
      /\x01(\d+)_\w+\x02/g,
      (_, /** @type {string} */ num) => currentCommentData.hiddenElementsData[Number(num) - 1].html
    );
    const oldSectionDummy = { headlineElement: $('<span>').html($(oldHeadingHtml).html())[0] };
    sectionRegistry.prototype.parseHeadline.call(oldSectionDummy);
    if (
      this.headline &&
      oldSectionDummy.headline !== this.headline &&
      /** @type {import('./LegacySubscriptions').default} */ (this.subscriptions).getOriginalState(
        oldSectionDummy.headline
      )
    ) {
      this.subscribe('quiet', oldSectionDummy.headline);
    }
  }

  /**
   * _For internal use._ When the section's headline is live-updated in {@link Comment#update}, also
   * update some aspects of the section.
   *
   * @param {JQuery} $html
   */
  update($html) {
    const originalHeadline = this.headline;
    this.parseHeadline();
    if (this.headline !== originalHeadline) {
      if (this.headline && this.subscriptionState && !this.useTopicSubscription) {
        this.subscribe('quiet', originalHeadline);
      }
      this.getTocItem()?.replaceText($html);
    }
  }

  /**
   * Copy a link to the section or open a copy link dialog.
   *
   * @param {MouseEvent | KeyboardEvent} event
   */
  copyLink(event) {
    controller.showCopyLinkDialog(this, event);
  }

  /**
   * Request the wikitext of the section by its number using the API and set some properties of the
   * section (and also the page). {@link Section#loadCode} is a more general method.
   *
   * @returns {Promise<string>}
   * @throws {CdError}
   */
  async requestCode() {
    const request = controller.getApi().post(
      /** @type {import('types-mediawiki/mw/Api').UnknownApiParams} */ (
        /** @type {import('types-mediawiki/api_params').ApiQueryRevisionsParams} */ ({
          action: 'query',
          titles: this.getSourcePage().name,
          prop: 'revisions',
          rvsection: this.liveSectionNumber || undefined,
          rvslots: 'main',
          rvprop: ['ids', 'content'],
          redirects: !mw.config.get('wgIsRedirect'),
          curtimestamp: true,
        }
      )
    )).catch(handleApiReject);
    const { query, curtimestamp: queryTimestamp } =
      /** @type {ApiResponseQuery<ApiResponseQueryContentPages>} */ (await request);

    const page = query?.pages?.[0];
    const revision = page?.revisions?.[0];
    const main = revision?.slots?.main;
    const content = main?.content;

    if (!query || !page || !main) {
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

    // It's more convenient to unify regexps to have `\n` as the last character of anything, not
    // `(?:\n|$)`, and it doesn't seem to affect anything substantially.
    this.presumedCode = content + '\n',

    this.revisionId = revision.revid;
    this.queryTimestamp = queryTimestamp;

    this.getSourcePage().setRedirectTarget(query.redirects?.[0]?.to || null);

    return this.presumedCode;
  }

  /**
   * Load the section wikitext. See also {@link Section#requestCode}.
   *
   * @param {import('./CommentForm').default} [commentForm] Comment form, if it is submitted or code
   *   changes are viewed.
   * @returns {Promise<SectionSource>}
   * @throws {CdError|Error}
   */
  async loadCode(commentForm) {
    let source;

    let isSectionSubmitted = false;
    try {
      if (commentForm && this.liveSectionNumber !== null) {
        try {
          const sectionCode = await this.requestCode();
          source = this.locateInCode(sectionCode);
          isSectionSubmitted = true;
        } catch (error) {
          if (
            !(
              error instanceof CdError &&
              ['noSuchSection', 'locateSection'].includes(error.data.code)
            )
          ) {
            throw error;
          }
        }
      }
      if (!isSectionSubmitted) {
        await this.getSourcePage().loadCode();
        source = this.locateInCode();
      }
    } catch (error) {
      if (error instanceof CdError) {
        throw new CdError(Object.assign({}, {
          message: cd.sParse('cf-error-getpagecode'),
        }, error.data));
      } else {
        throw error;
      }
    }
    commentForm?.setSectionSubmitted(isSectionSubmitted);

    return /** @type {SectionSource} */ (source);
  }

  /**
   * Search for the section in the source code and return possible matches.
   *
   * @param {string} contextCode
   * @param {boolean} isInSectionContext
   * @returns {SectionSource|undefined}
   * @private
   */
  searchInCode(contextCode, isInSectionContext) {
    const thisHeadline = normalizeCode(this.headline);
    const adjustedContextCode = maskDistractingCode(contextCode);
    const sectionHeadingRegexp = /^((=+)(.*)\2[ \t\x01\x02]*)\n/gm;

    const sourcesWithScores = [];
    const headlines = [];
    let sectionIndex = -1;
    let sectionHeadingMatch;
    while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedContextCode))) {
      sectionIndex++;
      const source = new SectionSource({
        section: this,
        sectionHeadingMatch,
        contextCode,
        adjustedContextCode,
        isInSectionContext,
      });
      const sourceWithScore = source.calculateMatchScore(sectionIndex, thisHeadline, headlines);
      if (sourceWithScore.score <= 1) continue;

      sourcesWithScores.push(sourceWithScore);

      // Maximal possible score
      if (sourceWithScore.score === 3.75) break;
    }

    return sourcesWithScores.sort((m1, m2) => m2.score - m1.score)[0]?.source;
  }

  /**
   * Locate the section in the source code and set the result to the {@link Section#source}
   * property.
   *
   * It is expected that the section or page code is loaded (using {@link Page#loadCode}) before
   * this method is called. Otherwise, the method will throw an error.
   *
   * @param {string|undefined} [sectionCode] Section code to use instead of the page code, to locate
   *   the section in.
   * @returns {SectionSource}
   * @throws {CdError}
   */
  locateInCode(sectionCode) {
    this.source = null;

    const code = sectionCode || this.getSourcePage().code;
    if (code === undefined) {
      throw new CdError({
        type: 'parse',
        code: 'noCode',
      });
    }

    const source = this.searchInCode(code, Boolean(sectionCode));
    if (!source) {
      throw new CdError({
        type: 'parse',
        code: 'locateSection',
      });
    }

    this.source = source;

    return source;
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
   * Get the section source, locating it in code if necessary.
   *
   * @throws {CdError}
   * @returns {SectionSource}
   */
  getSource() {
    return this.source || this.locateInCode();
  }

  /**
   * @overload
   * @param {true} forceLevel2 Guarantee a 2-level section is returned.
   * @returns {Section|null} The base section, or `null` if no level 2 section is found.
   *
   * @overload
   * @param {false} [forceLevel2=false] Return the closest level 2 ancestor, or the section itself
   *   if no such ancestor exists or if it is already level 2.
   * @returns {Section} The base section.
   */

  /**
   * Get the base section, i.e. a section of level 2 that is an ancestor of the section, or the
   * section itself if it is of level 2 (even if there is a level 1 section) or if there is no
   * higher level section (the current section may be of level 3 or 1, for example).
   *
   * @param {boolean} [forceLevel2=false] Guarantee a 2-level section is returned.
   * @returns {?Section}
   */
  getBase(forceLevel2 = false) {
    const defaultValue = forceLevel2 && !this.isTopic() ? null : this;

    return this.level <= 2 ?
      defaultValue :
      (
        sectionRegistry.getAll()
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
    sectionRegistry.getAll()
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
        }

        return true;
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
   * @returns {?import('./toc').TocItem}
   */
  getTocItem() {
    return toc.getItem(this.id);
  }

  /**
   * Add/remove the section's TOC link according to its subscription state and update the `title`
   * attribute.
   */
  updateTocLink() {
    this.getTocItem()?.updateSubscriptionState(this.subscriptionState);
  }

  /**
   * Get a link to the section with Unicode sequences decoded.
   *
   * @param {boolean} [permanent=false] Get a permanent URL.
   * @returns {string}
   */
  getUrl(permanent = false) {
    return cd.page.getDecodedUrlWithFragment(this.id, permanent);
  }

  /**
   * Get a section relevant to this section, which means the section itself. (Used for polymorphism
   * with {@link Comment#getRelevantSection} and {@link Page#getRelevantSection}.)
   *
   * @returns {Section}
   */
  getRelevantSection() {
    return this;
  }

  /**
   * Get a comment relevant to this section, which means the first comment _if_ it is opening the
   * section. (Used for polymorphism with {@link Comment#getRelevantComment} and
   * {@link Page#getRelevantComment}.)
   *
   * @returns {?Comment}
   */
  getRelevantComment() {
    return this.comments[0]?.isOpeningSection ? this.comments[0] : null;
  }

  /**
   * Get the data identifying the section when restoring a comment form. (Used for polymorphism with
   * {@link Comment#getRelevantComment} and {@link Page#getIdentifyingData}.)
   *
   * @returns {{ [key: string]: any }}
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
   * @param {string} editTimestamp Timestamp of the edit just made.
   */
  ensureSubscribeIdPresent(editTimestamp) {
    if (!this.useTopicSubscription || this.subscribeId) return;

    this.subscribeId = sectionRegistry.generateDtSubscriptionId(
      cd.user.getName(),
      this.oldestComment?.date?.toISOString() || editTimestamp
    );
  }

  /**
   * Get the section used to subscribe to new comments in this section if available.
   *
   * @returns {?Section}
   */
  getSectionSubscribedTo() {
    return this.useTopicSubscription ? this.getBase(true) : this;
  }

  /**
   * Find the last element of the section including buttons and other.
   *
   * @param {(el: HTMLElement) => boolean} [additionalCondition]
   * @returns {HTMLElement}
   */
  findRealLastElement(additionalCondition) {
    let realLastElement = this.lastElement;

    for (
      let lastElement = /** @type {HTMLElement|Element|null} */ (
        this.lastElement.nextElementSibling
      );
      lastElement instanceof HTMLElement &&
      (
        lastElement.matches('.cd-section-button-container') ||
        (additionalCondition && additionalCondition(lastElement))
      );
      lastElement = lastElement.nextElementSibling
    ) {
      realLastElement = lastElement;
    }

    return realLastElement;
  }

  /**
   * _For internal use._ Set the `visibility` CSS value to the section.
   *
   * @param {boolean} show Show or hide.
   */
  updateVisibility(show) {
    if (Boolean(show) !== this.isHidden) return;

    this.elements ||= /** @type {HTMLElement[]} */ (getRangeContents(
      this.headingElement,
      this.findRealLastElement(),
      controller.rootElement
    ));
    this.isHidden = !show;
    this.elements.forEach((el) => {
      el.classList.toggle('cd-section-hidden', !show);
    });
  }

  /**
   * If this section is replied to, get the comment that will end up directly above the reply.
   *
   * @param {import('./CommentForm').default} commentForm
   * @returns {?Comment}
   */
  getCommentAboveReply(commentForm) {
    return sectionRegistry.getAll()
      .slice(
        0,

        // Section above the reply
        ((commentForm.getMode() === 'addSubsection' && this.getLastDescendant()) || this).index + 1
      )
      .reverse()
      .reduce(
        (comment, section) => comment || section.commentsInFirstChunk.slice(-1)[0],
        /** @type {?Comment} */ (null)
      );
  }

  /**
   * After the page is reloaded and this instance doesn't relate to a rendered section on the page,
   * get the instance of this section that does.
   *
   * @returns {?Section}
   */
  findNewSelf() {
    return (
      sectionRegistry.search({
        headline: this.headline,
        oldestCommentId: this.oldestComment?.id,
        index: this.index,
        id: this.id,

        // We cache ancestors when saving the session, so this call will return the right value,
        // despite the fact that sectionRegistry.items has already changed.
        ancestors: this.getAncestors().map((section) => section.headline),
      })?.section ||
      null
    );
  }

  /**
   * Get the name of the section's method creating a comment form with the specified mode.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   * @returns {string}
   */
  getCommentFormMethodName(mode) {
    return mode === 'replyInSection' ? 'reply' : mode;
  }

  /**
   * Get the placeholder for the comment form's headline input.
   *
   * Used for polymorphism with {@link Comment#getCommentFormHeadlineInputPlaceholder} and
   * {@link Page#getCommentFormHeadlineInputPlaceholder}.
   *
   * @returns {string}
   */
  getCommentFormHeadlineInputPlaceholder() {
    return cd.s('cf-headline-subsection', this.headline);
  }

  /**
   * Get the placeholder for the comment form's comment input.
   *
   * Used for polymorphism with {@link Comment#getCommentFormCommentInputPlaceholder} and
   * {@link Page#getCommentFormCommentInputPlaceholder}.
   *
   * @param {import('./CommentForm').CommentFormMode} mode
   * @returns {string}
   */
  getCommentFormCommentInputPlaceholder(mode) {
    return mode === 'replyInSection' ?
      cd.s('cf-comment-placeholder-replytosection', this.headline) :
      cd.s('cf-comment-placeholder');
  }

  /**
   * Hide the bar element.
   */
  hideBar() {
    this.$bar?.addClass('cd-hidden');
  }

  /**
   * Get the comment that is visually a target of the comment form that has the section as target.
   *
   * Used for polymorphism with {@link Comment#getCommentFormTargetComment} and
   * {@link Page#getCommentFormTargetComment}.
   *
   * @returns {?import('./Comment').default}
   */
  getCommentFormTargetComment() {
    return (
      this.commentsInFirstChunk
        .slice()
        .reverse()
        .find((c) => c.level === 0) ||
      null
    );
  }

  /**
   * Type checking helper.
   *
   * @returns {this is Comment}
   */
  isComment() {
    return false;
  }

  /**
   * Clean up data related to the live content of the section.
   *
   * @param {number} lastCheckedRevisionId
   */
  cleanUpLiveData(lastCheckedRevisionId) {
    this.liveSectionNumber = this.match?.sectionNumber ?? null;
    this.liveSectionNumberRevisionId = lastCheckedRevisionId;
    delete this.presumedCode;
    delete this.revisionId;
    delete this.queryTimestamp;
  }

  static prototypes = new PrototypeRegistry();

  /**
   * _For internal use._ Create element and widget prototypes to reuse them instead of creating new
   * elements from scratch (which is more expensive).
   */
  static initPrototypes() {
    this.prototypes.add(
      'replyButton',
      new OO.ui.ButtonWidget({
        label: cd.s('section-reply'),
        framed: false,

        // Add the thread button class as it behaves as a thread button in fact, being positioned
        // inside a "cd-commentLevel" list.
        classes: ['cd-button-ooui', 'cd-section-button', 'cd-thread-button'],
      }).$element[0]
    );

    this.prototypes.add(
      'addSubsectionButton',
      new OO.ui.ButtonWidget({
        // Will be replaced
        label: ' ',

        framed: false,
        classes: ['cd-button-ooui', 'cd-section-button'],
      }).$element[0]
    );

    this.prototypes.add(
      'copyLinkButton',
      new OO.ui.ButtonWidget({
        framed: false,
        flags: ['progressive'],
        icon: 'link',
        label: cd.s('sm-copylink'),
        invisibleLabel: true,
        title: cd.s('sm-copylink-tooltip'),
        classes: ['cd-section-bar-button'],
      }).$element[0]
    );

    this.prototypes.addWidget('moreMenuSelect', () => (
      new OO.ui.ButtonMenuSelectWidget({
        framed: false,
        icon: 'ellipsis',
        label: cd.s('sm-more'),
        invisibleLabel: true,
        title: cd.s('sm-more'),
        menu: {
          horizontalPosition: 'end',
        },
        classes: ['cd-section-bar-button', 'cd-section-bar-moremenu'],
      }))
    );
  }
}

export default Section;
