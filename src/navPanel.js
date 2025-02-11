/**
 * Singleton related to the navigation panel.
 *
 * @module navPanel
 */

import Button from './Button';
import LiveTimestamp from './LiveTimestamp';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import controller from './controller';
import settings from './settings';
import { reorderArray } from './utils-general';
import { formatDate } from './utils-timestamp';
import { removeWikiMarkup } from './utils-wikitext';
import { createSvg, isCmdModifierPressed, isInputFocused, keyCombination } from './utils-window';
import visits from './visits';

export default {
  /**
   * Navigation panel element.
   *
   * @type {external:jQuery}
   * @memberof module:navPanel
   */
  $element: undefined,

  /**
   * Refresh button.
   *
   * @type {Button|undefined}
   * @memberof module:navPanel
   * @private
   */
  refreshButton: undefined,

  /**
   * "Go to the previous new comment" button element.
   *
   * @type {Button|undefined}
   * @memberof module:navPanel
   * @private
   */
  previousButton: undefined,

  /**
   * "Go to the next new comment" button element.
   *
   * @type {Button|undefined}
   * @memberof module:navPanel
   * @private
   */
  nextButton: undefined,

  /**
   * "Go to the first unseen comment" button element.
   *
   * @type {Button}
   * @memberof module:navPanel
   * @private
   */
  firstUnseenButton: undefined,

  /**
   * "Go to the next comment form out of sight" button element.
   *
   * @name commentFormButton
   * @type {Button|undefined}
   * @memberof module:navPanel
   * @private
   */
  commentFormButton: undefined,

  /**
   * _For internal use._ Mount, unmount or reset the navigation panel based on the context.
   */
  setup() {
    this.timestampFormat = settings.get('timestampFormat');
    this.modifyToc = settings.get('modifyToc');
    this.highlightNewInterval = settings.get('highlightNewInterval');

    if (cd.page.isActive()) {
      // Can be mounted not only on first parse, if using RevisionSlider, for example.
      if (!this.isMounted()) {
        this.mount();
        controller
          .on('scroll', this.updateCommentFormButton.bind(this))
          .on('keydown', (e) => {
            if (isInputFocused()) return;

            // R
            if (keyCombination(e, 82)) {
              this.refreshClick();
            }

            // W
            if (keyCombination(e, 87)) {
              this.goToPreviousNewComment();
            }

            // S
            if (keyCombination(e, 83)) {
              this.goToNextNewComment();
            }

            // F
            if (keyCombination(e, 70)) {
              this.goToFirstUnseenComment();
            }

            // C
            if (keyCombination(e, 67)) {
              e.preventDefault();
              this.goToNextCommentForm(true);
            }
          })
          .on('addedCommentsUpdate', ({ all, relevant, bySection }) => {
            this.updateRefreshButton(all.length, bySection, Boolean(relevant.length));
          });
        commentFormRegistry
          .on('add', this.updateCommentFormButton.bind(this))
          .on('remove', this.updateCommentFormButton.bind(this));
        LiveTimestamp
          .on('updateImproved', this.updateTimestampsInRefreshButtonTooltip.bind(this));
        visits
          .on('process', this.fill.bind(this));
        commentRegistry
          .on('registerSeen', this.updateFirstUnseenButton.bind(this));
      } else {
        this.reset();
      }
    } else {
      if (this.isMounted()) {
        this.unmount();
      }
    }
  },

  /**
   * Render the navigation panel. This is done when the page is first loaded, or created using the
   * script.
   *
   * @private
   */
  mount() {
    this.$element = $('<div>')
      .attr('id', 'cd-navPanel')
      .appendTo(document.body);

    this.refreshButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button'],
      id: 'cd-navPanel-refreshButton',
      action: (e) => {
        this.refreshClick(isCmdModifierPressed(e));
      },
    });
    this.updateRefreshButton(0);

    this.previousButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button', 'cd-icon'],
      id: 'cd-navPanel-previousButton',
      tooltip: `${cd.s('navpanel-previous')} ${cd.mws('parentheses', 'W')}`,
      action: () => {
        this.goToPreviousNewComment();
      },
    }).hide();
    $(this.previousButton.element).append(
      createSvg(16, 16, 20, 20).html(
        `<path d="M1 13.75l1.5 1.5 7.5-7.5 7.5 7.5 1.5-1.5-9-9-9 9z" />`
      )
    );

    this.nextButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button', 'cd-icon'],
      id: 'cd-navPanel-nextButton',
      tooltip: `${cd.s('navpanel-next')} ${cd.mws('parentheses', 'S')}`,
      action: () => {
        this.goToNextNewComment();
      },
    }).hide();
    $(this.nextButton.element).append(
      createSvg(16, 16, 20, 20).html(
        `<path d="M19 6.25l-1.5-1.5-7.5 7.5-7.5-7.5L1 6.25l9 9 9-9z" />`
      )
    );

    this.firstUnseenButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button'],
      id: 'cd-navPanel-firstUnseenButton',
      tooltip: `${cd.s('navpanel-firstunseen')} ${cd.mws('parentheses', 'F')}`,
      action: () => {
        this.goToFirstUnseenComment();
      },
    }).hide();

    this.commentFormButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button', 'cd-icon'],
      id: 'cd-navPanel-commentFormButton',
      tooltip: `${cd.s('navpanel-commentform')} ${cd.mws('parentheses', 'C')}`,
      action: () => {
        this.goToNextCommentForm();
      },
    }).hide();
    $(this.commentFormButton.element).append(
      createSvg(16, 16, 20, 20).html(
        cd.g.contentDirection === 'ltr' ?
          `<path d="M18 0H2a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V2a2 2 0 00-2-2zM5 9.06a1.39 1.39 0 111.37-1.39A1.39 1.39 0 015 9.06zm5.16 0a1.39 1.39 0 111.39-1.39 1.39 1.39 0 01-1.42 1.39zm5.16 0a1.39 1.39 0 111.39-1.39 1.39 1.39 0 01-1.42 1.39z" />` :
          `<path d="M0 2v12c0 1.1.9 2 2 2h14l4 4V2c0-1.1-.9-2-2-2H2C.9 0 0 .9 0 2zm13.6 5.7c0-.8.6-1.4 1.4-1.4.8 0 1.4.6 1.4 1.4s-.6 1.4-1.4 1.4c-.8-.1-1.4-.7-1.4-1.4zM9.9 9.1s-.1 0 0 0c-.8 0-1.4-.6-1.4-1.4 0-.8.6-1.4 1.4-1.4.8 0 1.4.6 1.4 1.4s-.7 1.4-1.4 1.4zm-5.2 0c-.8 0-1.4-.6-1.4-1.4 0-.8.6-1.4 1.4-1.4.8 0 1.4.6 1.4 1.4 0 .7-.7 1.4-1.4 1.4z" />`
      )
    );

    this.$element.append(
      this.refreshButton.element,
      this.previousButton.element,
      this.nextButton.element,
      this.firstUnseenButton.element,
      this.commentFormButton.element,
    );
  },

  /**
   * Remove the navigation panel.
   *
   * @private
   */
  unmount() {
    this.$element.remove();
    this.$element = null;
  },

  /**
   * Check if the navigation panel is mounted. Is equivalent to checking the existence of
   * {@link module:navPanel.$element}, and for most practical purposes, does the same as the
   * {@link module:pageRegistry.Page#isActive} check.
   *
   * @returns {boolean}
   */
  isMounted() {
    return Boolean(this.$element);
  },

  /**
   * Reset the navigation panel to the initial state. This is done after page refreshes. (Comment
   * forms are expected to be restored already.)
   *
   * @private
   */
  reset() {
    this.updateRefreshButton(0);
    this.previousButton.hide();
    this.nextButton.hide();
    this.firstUnseenButton.hide();
    this.commentFormButton.hide();
    clearTimeout(this.utirbtTimeout);
  },

  /**
   * Count the new and unseen comments on the page and update the navigation panel to reflect that.
   *
   * @private
   */
  fill() {
    if (commentRegistry.getAll().some((comment) => comment.isNew)) {
      this.updateRefreshButtonTooltip(0);
      this.previousButton.show();
      this.nextButton.show();
      this.updateFirstUnseenButton();
    }
  },

  /**
   * Perform routines at the refresh button click.
   *
   * @param {boolean} markAsRead Whether to mark all comments as read.
   * @private
   */
  refreshClick(markAsRead) {
    controller.reload({
      commentIds: controller.getRelevantAddedCommentIds(),
      markAsRead,
    });
  },

  /**
   * Generic function for {@link module:navPanel.goToPreviousNewComment} and
   * {@link module:navPanel.goToNextNewComment}.
   *
   * @param {string} direction
   * @private
   */
  goToNewCommentInDirection(direction) {
    if (controller.isAutoScrolling()) return;

    const commentInViewport = commentRegistry.findInViewport(direction);
    if (!commentInViewport) return;

    const reorderedComments = reorderArray(
      commentRegistry.getAll(),
      commentInViewport.index,
      direction === 'backward'
    );
    const candidates = reorderedComments
      .filter((comment) => comment.isNew && !comment.isInViewport());
    const comment = candidates.find((comment) => comment.isInViewport() === false) || candidates[0];
    if (comment) {
      comment.scrollTo({
        flash: null,
        callback: () => {
          // The default controller.handleScroll() callback is executed in $#cdScrollTo, but
          // that happens after a 300ms timeout, so we have a chance to have our callback executed
          // first.
          comment.registerSeen(direction, true);
        },
      });
    }
  },

  /**
   * Scroll to the previous new comment.
   */
  goToPreviousNewComment() {
    this.goToNewCommentInDirection('backward');
  },

  /**
   * Scroll to the next new comment.
   */
  goToNextNewComment() {
    this.goToNewCommentInDirection('forward');
  },

  /**
   * Scroll to the first unseen comment.
   */
  goToFirstUnseenComment() {
    if (controller.isAutoScrolling()) return;

    const candidates = commentRegistry.query((comment) => comment.isSeen === false);
    const comment = candidates.find((comment) => comment.isInViewport() === false) || candidates[0];
    comment?.scrollTo({
      flash: null,
      callback: () => {
        // The default controller.handleScroll() callback is executed in $#cdScrollTo, but
        // that happens after a 300ms timeout, so we have a chance to have our callback executed
        // first.
        comment.registerSeen('forward', true);
      },
    });
  },

  /**
   * Go to the next comment form out of sight, or just the next comment form, if `inSight` is set to
   * `true`.
   *
   * @param {boolean} [inSight=false]
   */
  goToNextCommentForm(inSight) {
    commentFormRegistry
      .query((commentForm) => inSight || !commentForm.$element.cdIsInViewport(true))
      .map((commentForm) => {
        let top = commentForm.$element[0].getBoundingClientRect().top;
        if (top < 0) {
          top += $(document).height() * 2;
        }
        return { commentForm, top };
      })
      .sort((data1, data2) => data1.top - data2.top)
      .map((data) => data.commentForm)[0]
      ?.goTo();
  },

  /**
   * Update the refresh button to show the number of comments added to the page since it was loaded.
   *
   * @param {number} commentCount
   * @param {Map} [commentsBySection]
   * @param {boolean} [areThereRelevant = false]
   * @private
   */
  updateRefreshButton(commentCount, commentsBySection, areThereRelevant = false) {
    $(this.refreshButton.element)
      .empty()
      .append(
        commentCount ?
          $('<span>')
            // Can't set the attribute to the button as its tooltip may have another direction.
            .attr('dir', 'ltr')

            .text(`+${commentCount}`) :
          createSvg(20, 20).html(
            `<path d="M15.65 4.35A8 8 0 1017.4 13h-2.22a6 6 0 11-1-7.22L11 9h7V2z" />`
          )
      )
      .toggleClass('cd-navPanel-addedCommentCount', Boolean(commentCount))
      .toggleClass('cd-icon', !commentCount)
      .toggleClass('cd-navPanel-refreshButton-relevant', areThereRelevant);
    this.updateRefreshButtonTooltip(commentCount, commentsBySection);
  },

  /**
   * Update the tooltip of the refresh button, displaying statistics of comments not yet displayed
   * if there are such.
   *
   * @param {number} commentCount
   * @param {Map} [commentsBySection]
   * @private
   */
  updateRefreshButtonTooltip(commentCount, commentsBySection) {
    // If the method was not called after a timeout and the timeout exists, clear it.
    clearTimeout(this.utirbtTimeout);

    this.cachedCommentCount = commentCount;
    this.cachedCommentsBySection = commentsBySection;

    let tooltipText = null;
    const areThereNew = commentRegistry.getAll().some((comment) => comment.isNew);
    if (commentCount) {
      tooltipText = (
        cd.s('navpanel-newcomments-count', commentCount) +
        ' ' +
        cd.s('navpanel-newcomments-refresh') +
        ' ' +
        cd.mws('parentheses', 'R')
      );
      if (areThereNew && this.highlightNewInterval) {
        tooltipText += '\n' + cd.s('navpanel-markasread', cd.g.cmdModifier);
      }
      const bullet = removeWikiMarkup(cd.s('bullet'));
      const rtlMarkOrNot = cd.g.contentDirection === 'rtl' ? '\u200f' : '';
      commentsBySection.forEach((comments, section) => {
        const headline = section?.headline;
        tooltipText += headline ? `\n\n${headline}` : '\n';
        comments.forEach((comment) => {
          tooltipText += `\n`;
          const names = comment.parent?.author && comment.level > 1 ?
            cd.s(
              'navpanel-newcomments-names',
              comment.author.getName(),
              comment.parent.author.getName()
            ) :
            comment.author.getName();
          const date = comment.date ?
            formatDate(comment.date) :
            cd.s('navpanel-newcomments-unknowndate');
          tooltipText += bullet + ' ' + names + rtlMarkOrNot + cd.mws('comma-separator') + date;
        });
      });

      // When timestamps are relative, we need to update the tooltip manually every minute. When
      // `improved` timestamps are used, timestamps are updated in LiveTimestamp.updateImproved().
      if (this.timestampFormat === 'relative') {
        this.utirbtTimeout = setTimeout(
          this.updateTimestampsInRefreshButtonTooltip.bind(this),
          cd.g.msInMin
        );
      }
    } else {
      tooltipText = cd.s('navpanel-refresh') + ' ' + cd.mws('parentheses', 'R');
      if (areThereNew && this.highlightNewInterval) {
        tooltipText += '\n' + cd.s('navpanel-markasread', cd.g.cmdModifier);
      }
    }

    this.refreshButton.setTooltip(tooltipText);
  },

  /**
   * Update the tooltip of the {@link module:navPanel.refreshButton refresh button}. This is called
   * to update timestamps in the text.
   *
   * @private
   */
  updateTimestampsInRefreshButtonTooltip() {
    this.updateRefreshButtonTooltip(this.cachedCommentCount, this.cachedCommentsBySection);
  },

  /**
   * Update the state of the
   * {@link module:navPanel.firstUnseenButton "Go to the first unseen comment"} button.
   *
   * @private
   */
  updateFirstUnseenButton() {
    if (!this.isMounted()) return;

    const unseenCommentCount = commentRegistry.query((c) => c.isSeen === false).length;
    this.firstUnseenButton
      .toggle(Boolean(unseenCommentCount))
      .setLabel(unseenCommentCount);
  },

  /**
   * Update the {@link module:navPanel.commentFormButton "Go to the next comment form out of sight"}
   * button visibility.
   *
   * @private
   */
  updateCommentFormButton() {
    if (!this.isMounted() || controller.isAutoScrolling()) return;

    this.commentFormButton.toggle(
      commentFormRegistry.getAll().some((cf) => !cf.$element.cdIsInViewport(true))
    );
  },
};
