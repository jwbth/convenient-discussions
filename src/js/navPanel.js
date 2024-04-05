/**
 * Singleton related to the navigation panel. It also contains new comments-related functions and
 * configuration.
 *
 * @module navPanel
 */

import Button from './Button';
import cd from './cd';
import commentFormRegistry from './commentFormRegistry';
import commentRegistry from './commentRegistry';
import controller from './controller';
import settings from './settings';
import { reorderArray } from './utils-general';
import { formatDate } from './utils-timestamp';
import { removeWikiMarkup } from './utils-wikitext';
import { isCmdModifierPressed } from './utils-window';

export default {
  /**
   * _For internal use._ Mount, unmount or reset the navigation panel based on the context.
   */
  setup() {
    this.timestampFormat = settings.get('timestampFormat');
    this.modifyToc = settings.get('modifyToc');
    this.highlightNewInterval = settings.get('highlightNewInterval');

    if (controller.isPageActive()) {
      // Can be mounted not only on first parse, if using RevisionSlider, for example.
      if (!this.isMounted()) {
        this.mount();
        commentFormRegistry
          .on('add', this.updateCommentFormButton.bind(this))
          .on('remove', this.updateCommentFormButton.bind(this));
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
   * _For internal use._ Render the navigation panel. This is done when the page is first loaded, or
   * created using the script.
   */
  mount() {
    /**
     * Navigation panel element.
     *
     * @name $element
     * @type {external:jQuery}
     * @memberof module:navPanel
     */
    this.$element = $('<div>')
      .attr('id', 'cd-navPanel')
      .appendTo(document.body);

    /**
     * Refresh button.
     *
     * @name refreshButton
     * @type {Button|undefined}
     * @memberof module:navPanel
     * @private
     */
    this.refreshButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button'],
      id: 'cd-navPanel-refreshButton',
      action: (e) => {
        this.refreshClick(isCmdModifierPressed(e));
      },
    });

    this.updateRefreshButtonTooltip(0);

    /**
     * "Go to the previous new comment" button element.
     *
     * @name previousButton
     * @type {Button|undefined}
     * @memberof module:navPanel
     * @private
     */
    this.previousButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button'],
      id: 'cd-navPanel-previousButton',
      tooltip: `${cd.s('navpanel-previous')} ${cd.mws('parentheses', 'W')}`,
      action: () => {
        this.goToPreviousNewComment();
      },
    }).hide();

    /**
     * "Go to the next new comment" button element.
     *
     * @name nextButton
     * @type {Button|undefined}
     * @memberof module:navPanel
     * @private
     */
    this.nextButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button'],
      id: 'cd-navPanel-nextButton',
      tooltip: `${cd.s('navpanel-next')} ${cd.mws('parentheses', 'S')}`,
      action: () => {
        this.goToNextNewComment();
      },
    }).hide();

    /**
     * "Go to the first unseen comment" button element.
     *
     * @name firstUnseenButton
     * @type {Button|undefined}
     * @memberof module:navPanel
     * @private
     */
    this.firstUnseenButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button'],
      id: 'cd-navPanel-firstUnseenButton',
      tooltip: `${cd.s('navpanel-firstunseen')} ${cd.mws('parentheses', 'F')}`,
      action: () => {
        this.goToFirstUnseenComment();
      },
    }).hide();

    /**
     * "Go to the next comment form out of sight" button element.
     *
     * @name commentFormButton
     * @type {Button|undefined}
     * @memberof module:navPanel
     * @private
     */
    this.commentFormButton = new Button({
      tagName: 'div',
      classes: ['cd-navPanel-button'],
      id: 'cd-navPanel-commentFormButton',
      tooltip: `${cd.s('navpanel-commentform')} ${cd.mws('parentheses', 'C')}`,
      action: () => {
        this.goToNextCommentForm();
      },
    }).hide();

    this.$element.append(
      this.refreshButton.element,
      this.previousButton.element,
      this.nextButton.element,
      this.firstUnseenButton.element,
      this.commentFormButton.element,
    );
  },

  /**
   * _For internal use._ Remove the navigation panel.
   */
  unmount() {
    this.$element.remove();
    this.$element = null;
  },

  /**
   * Check if the navigation panel is mounted. Is equivalent to checking the existence of
   * {@link module:navPanel.$element}, and for most practical purposes, does the same as the
   * {@link module:controller.isPageActive} check.
   *
   * @returns {boolean}
   */
  isMounted() {
    return Boolean(this.$element);
  },

  /**
   * _For internal use._ Reset the navigation panel to the initial state. This is done after page
   * refreshes. (Comment forms are expected to be restored already.)
   */
  reset() {
    this.refreshButton.setLabel('');
    this.updateRefreshButtonTooltip(0);
    this.previousButton.hide();
    this.nextButton.hide();
    this.firstUnseenButton.hide();
    this.commentFormButton.hide();
    clearTimeout(this.utirbtTimeout);
  },

  /**
   * Count the new and unseen comments on the page, and update the navigation panel to reflect that.
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
   * _For internal use._ Perform routines at the refresh button click.
   *
   * @param {boolean} markAsRead Whether to mark all comments as read.
   */
  refreshClick(markAsRead) {
    // There was reload confirmation here, but after session restore was introduced, the
    // confirmation seems to be no longer needed.
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
          // The default `controller.handleScroll()` callback is executed in `$#cdScrollTo`, but
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

    const candidates = commentRegistry.getAll().filter((comment) => comment.isSeen === false);
    const comment = candidates.find((comment) => comment.isInViewport() === false) || candidates[0];
    comment?.scrollTo({
      flash: null,
      callback: () => {
        // The default `controller.handleScroll()` callback is executed in `$#cdScrollTo`, but
        // that happens after a 300ms timeout, so we have a chance to have our callback executed
        // first.
        comment.registerSeen('forward', true);
      },
    });
  },

  /**
   * Go to the next comment form out of sight, or just the next comment form, if `inSight` is set to
   * true.
   *
   * @param {boolean} [inSight=false]
   */
  goToNextCommentForm(inSight) {
    commentFormRegistry.getAll()
      .filter((commentForm) => inSight || !commentForm.$element.cdIsInViewport(true))
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
   * _For internal use._ Update the refresh button to show the number of comments added to the page
   * since it was loaded.
   *
   * @param {number} commentCount
   * @param {Map} commentsBySection
   * @param {boolean} areThereRelevant
   */
  updateRefreshButton(commentCount, commentsBySection, areThereRelevant) {
    this.refreshButton.setLabel('');
    this.updateRefreshButtonTooltip(commentCount, commentsBySection);
    if (commentCount) {
      $('<span>')
        // Can't set the attribute to the button as its tooltip may have another direction.
        .attr('dir', 'ltr')

        .text(`+${commentCount}`)
        .appendTo(this.refreshButton.element);
    }
    this.refreshButton.element.classList
      .toggle('cd-navPanel-refreshButton-relevant', areThereRelevant);
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
      const rtlMarkOrNot = cd.g.contentTextDirection === 'rtl' ? '\u200f' : '';
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

      // When timestamps are relative and the TOC is allowed to be modified in the settings, the
      // tooltip is updated together with the updates of the TOC. When the TOC is not modified, we
      // need to update the tooltip manually every minute. When `improved` timestamps are used,
      // timestamps are updated in `LiveTimestamp.updateImproved()`.
      if (this.timestampFormat === 'relative' && !this.modifyToc) {
        this.utirbtTimeout = setTimeout(() => {
          this.updateTimestampsInRefreshButtonTooltip();
        }, cd.g.msInMin);
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
   * _For internal use._ Update the tooltip of the
   * {@link module:navPanel.refreshButton refresh button}. This is called to update timestamps in
   * the text.
   */
  updateTimestampsInRefreshButtonTooltip() {
    this.updateRefreshButtonTooltip(this.cachedCommentCount, this.cachedCommentsBySection);
  },

  /**
   * _For internal use._ Update the state of the
   * {@link module:navPanel.firstUnseenButton "Go to the first unseen comment"} button.
   */
  updateFirstUnseenButton() {
    if (!this.isMounted()) return;

    const unseenCommentCount = commentRegistry.getAll().filter((c) => c.isSeen === false).length;
    this.firstUnseenButton.toggle(unseenCommentCount).setLabel(unseenCommentCount);
  },

  /**
   * _For internal use._ Update the
   * {@link module:navPanel.commentFormButton "Go to the next comment form out of sight"} button
   * visibility.
   */
  updateCommentFormButton() {
    if (!this.isMounted() || controller.isAutoScrolling()) return;

    this.commentFormButton.toggle(
      commentFormRegistry.getAll().some((cf) => !cf.$element.cdIsInViewport(true))
    );
  },
};
