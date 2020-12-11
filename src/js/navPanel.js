/**
 * Navigation panel and new comments-related functions and configuration.
 *
 * @module navPanel
 */

import Comment from './Comment';
import cd from './cd';
import updateChecker from './updateChecker';
import { reloadPage } from './boot';
import { removeWikiMarkup } from './wikitext';
import { reorderArray } from './util';

let newCount;
let unseenCount;
let notRenderedCount;
let lastFirstUnseenCommentId;

/**
 * Generate tooltip text displaying statistics of unseen or not yet displayed comments.
 *
 * @param {number} commentsCount
 * @param {Map} commentsBySection
 * @returns {?string}
 * @private
 */
function generateTooltipText(commentsCount, commentsBySection) {
  let tooltipText = null;
  if (commentsCount) {
    tooltipText = (
      cd.s('navpanel-newcomments-count', commentsCount) +
      ' ' +
      cd.s('navpanel-newcomments-refresh') +
      ' ' +
      cd.mws('parentheses', 'R')
    );
    const bullet = removeWikiMarkup(cd.s('bullet'));
    commentsBySection.forEach((comments, sectionOrAnchor) => {
      let headline;
      if (typeof sectionOrAnchor === 'string') {
        headline = comments[0].section.headline;
      } else if (sectionOrAnchor !== null) {
        headline = sectionOrAnchor.headline;
      }
      tooltipText += headline ? `\n\n${headline}` : '\n';
      comments.forEach((comment) => {
        tooltipText += `\n`;
        const names = comment.parent?.author && comment.level > 1 ?
          cd.s('navpanel-newcomments-names', comment.author.name, comment.parent.author.name) :
          comment.author.name;
        const date = comment.date ?
          cd.util.formatDate(comment.date) :
          cd.s('navpanel-newcomments-unknowndate');
        tooltipText += (
          bullet +
          ' ' +
          names +
          (cd.g.SITE_DIR === 'rtl' ? '\u200F' : '') +
          cd.mws('comma-separator') +
          date
        );
      });
    });
  } else {
    tooltipText = `${cd.s('navpanel-refresh')} ${cd.mws('parentheses', 'R')}`;
  }

  return tooltipText;
}

const navPanel = {
  /**
   * Property indicating that the mouse is over the navigation panel.
   *
   * @type {boolean}
   * @memberof module:navPanel
   */
  mouseOverNavPanel: false,

  /**
   * Render the navigation panel. This is done when the page is first loaded or created.
   *
   * @memberof module:navPanel
   */
  async mount() {
    /**
     * Navigation panel element.
     *
     * @type {?(JQuery|undefined)}
     * @memberof module:navPanel
     */
    this.$element = $('<div>')
      .attr('id', 'cd-navPanel')
      .appendTo(document.body);

    /**
     * Refresh button element.
     *
     * @type {JQuery|undefined}
     * @memberof module:navPanel
     */
    this.$refreshButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-refreshButton')
      .attr('title', `${cd.s('navpanel-refresh')} ${cd.mws('parentheses', 'R')}`)
      .on('click', () => {
        this.refreshClick();
      })
      .appendTo(this.$element);

    /**
     * "Go to the previous new comment" button element.
     *
     * @type {JQuery|undefined}
     * @memberof module:navPanel
     */
    this.$previousButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-previousButton')
      .attr('title', `${cd.s('navpanel-previous')} ${cd.mws('parentheses', 'W')}`)
      .on('click', () => {
        this.goToPreviousNewComment();
      })
      .hide()
      .appendTo(this.$element);

    /**
     * "Go to the next new comment" button element.
     *
     * @type {JQuery|undefined}
     * @memberof module:navPanel
     */
    this.$nextButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-nextButton')
      .attr('title', `${cd.s('navpanel-next')} ${cd.mws('parentheses', 'S')}`)
      .on('click', () => {
        this.goToNextNewComment();
      })
      .hide()
      .appendTo(this.$element);

    /**
     * "Go to the first unseen comment" button element.
     *
     * @type {JQuery|undefined}
     * @memberof module:navPanel
     */
    this.$firstUnseenButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-firstUnseenButton')
      .attr('title', `${cd.s('navpanel-firstunseen')} ${cd.mws('parentheses', 'F')}`)
      .on('click', () => {
        this.goToFirstUnseenComment();
      })
      .hide()
      .appendTo(this.$element);

    /**
     * "Go to the next comment form out of sight" button element.
     *
     * @type {JQuery|undefined}
     * @memberof module:navPanel
     */
    this.$commentFormButton = $('<div>')
      .addClass('cd-navPanel-button')
      .attr('id', 'cd-navPanel-commentFormButton')
      .attr('title', cd.s('navpanel-commentform'))
      .on('click', () => {
        this.goToNextCommentForm();
      })
      .hide()
      .appendTo(this.$element);
  },

  /**
   * Remove the navigation panel.
   */
  unmount() {
    this.$element.remove();
    this.$element = null;
    unseenCount = null;
    notRenderedCount = 0;
  },

  /**
   * Check if the navigation panel is mounted. Is equivalent to checking the existence of {@link
   * module:navPanel.$element}, and for most of the practical purposes, does the same as the
   * `convenientDiscussions.g.isPageActive` check.
   *
   * @returns {boolean}
   * @memberof module:navPanel
   */
  isMounted() {
    return Boolean(this.$element);
  },

  /**
   * Reset the navigation panel to the initial state. This is done after page refreshes. (Comment
   * forms are expected to be restored already.)
   *
   * @memberof module:navPanel
   */
  reset() {
    lastFirstUnseenCommentId = null;
    unseenCount = null;
    notRenderedCount = 0;

    this.$refreshButton
      .empty()
      .attr('title', `${cd.s('navpanel-refresh')} ${cd.mws('parentheses', 'R')}`);
    this.$previousButton.hide();
    this.$nextButton.hide();
    this.$firstUnseenButton.hide();
    this.$commentFormButton.hide();
  },

  /**
   * Count the new and unseen comments on the page, and update the navigation panel to reflect that.
   *
   * @memberof module:navPanel
   */
  fill() {
    newCount = cd.comments.filter((comment) => comment.isNew).length;
    if (newCount) {
      this.$nextButton.show();
      this.$previousButton.show();
      unseenCount = cd.comments.filter((comment) => comment.isSeen === false).length;
      if (unseenCount) {
        this.updateFirstUnseenButton();
      }
    }
  },

  /**
   * Get the number of comments on the page that haven't been seen.
   *
   * @returns {number}
   * @memberof module:navPanel
   */
  getUnseenCount() {
    return unseenCount;
  },

  /**
   * Get the number of comments that haven't been rendered yet.
   *
   * @returns {number}
   * @memberof module:navPanel
   */
  getNotRenderedCount() {
    return notRenderedCount;
  },

  /**
   * Update the unseen comments count without recounting. We try to avoid recounting mostly because
   * {@link module:navPanel.registerSeenComments} that uses the unseen count is executed very
   * frequently (up to a hundred times a second).
   *
   * @memberof module:navPanel
   */
  decrementUnseenCount() {
    unseenCount--;
  },

  /**
   * Update the state of the "Go to the first unseen comment" button.
   *
   * @memberof module:navPanel
   */
  updateFirstUnseenButton() {
    if (!navPanel.isMounted()) return;

    if (unseenCount) {
      this.$firstUnseenButton.show().text(unseenCount);
    } else {
      this.$firstUnseenButton.hide();
    }
  },

  /**
   * Perform routines at the refresh button click.
   *
   * @memberof module:navPanel
   */
  refreshClick() {
    // There was reload confirmation here, but after session restore was introduced, the
    // confirmation seems to be no longer needed.
    reloadPage({ commentAnchor: updateChecker.relevantNewCommentAnchor });
  },

  /**
   * Scroll to the previous new comment.
   *
   * @memberof module:navPanel
   */
  goToPreviousNewComment() {
    if (cd.g.autoScrollInProgress) return;

    const commentInViewport = Comment.findInViewport('backward');
    if (!commentInViewport) return;

    // This will return invisible comments too in which case an error will be displayed.
    const comment = reorderArray(cd.comments, commentInViewport.id, true)
      .find((comment) => comment.isNew && comment.isInViewport() !== true);
    if (comment) {
      comment.$elements.cdScrollTo('center', true, () => {
        comment.registerSeen('backward', true);
        this.updateFirstUnseenButton();
      });
    }
  },

  /**
   * Scroll to the next new comment.
   *
   * @memberof module:navPanel
   */
  goToNextNewComment() {
    if (cd.g.autoScrollInProgress) return;

    const commentInViewport = Comment.findInViewport('forward');
    if (!commentInViewport) return;

    // This will return invisible comments too in which case an error will be displayed.
    const comment = reorderArray(cd.comments, commentInViewport.id)
      .find((comment) => comment.isNew && comment.isInViewport() !== true);
    if (comment) {
      comment.$elements.cdScrollTo('center', true, () => {
        comment.registerSeen('forward', true);
        this.updateFirstUnseenButton();
      });
    }
  },

  /**
   * Scroll to the first unseen comment.
   *
   * @memberof module:navPanel
   */
  goToFirstUnseenComment() {
    if (!unseenCount || cd.g.autoScrollInProgress) return;

    const comment = cd.comments
      .slice(lastFirstUnseenCommentId || 0)
      .find((comment) => comment.isSeen === false);
    if (comment) {
      comment.$elements.cdScrollTo('center', true, () => {
        comment.registerSeen('forward', true);
        this.updateFirstUnseenButton();
      });
      lastFirstUnseenCommentId = comment.id;
    }
  },

  /**
   * Go to the next comment form out of sight, or just the first comment form, if `first` is set to
   * true.
   *
   * @param {boolean} [first=false]
   * @memberof module:navPanel
   */
  goToNextCommentForm(first = false) {
    const commentForm = cd.commentForms
      .filter((commentForm) => first || !commentForm.$element.cdIsInViewport(true))
      .sort((commentForm1, commentForm2) => {
        let top1 = commentForm1.$element.get(0).getBoundingClientRect().top;
        if (top1 < 0) {
          top1 += $(document).height() * 2;
        }
        let top2 = commentForm2.$element.get(0).getBoundingClientRect().top;
        if (top2 < 0) {
          top2 += $(document).height() * 2;
        }
        return top1 - top2;
      })[0];
    if (commentForm) {
      commentForm.$element.cdScrollIntoView('center');
      commentForm.commentInput.focus();
    }
  },

  /**
   * Mark comments that are currently in the viewport as read, and also {@link module:Comment#flash
   * flash} comments that are prescribed to flash.
   *
   * @memberof module:navPanel
   */
  registerSeenComments() {
    // Don't run this more than once in some period, otherwise scrolling may be slowed down. Also,
    // wait before running, otherwise comments may be registered as seen after a press of Page
    // Down/Page Up.
    if (cd.g.dontHandleScroll || cd.g.autoScrollInProgress) return;

    cd.g.dontHandleScroll = true;

    // One scroll in Chrome, Firefox with Page Up/Page Down takes a little less than 200ms, but
    // 200ms proved to be not enough, so we try 300ms.
    setTimeout(() => {
      cd.g.dontHandleScroll = false;

      const commentInViewport = Comment.findInViewport();
      if (!commentInViewport) return;

      const registerSeenIfInViewport = (comment) => {
        const isInViewport = comment.isInViewport();
        if (isInViewport) {
          comment.registerSeen();
          return false;
        } else if (isInViewport === false) {
          // isInViewport could also be null.
          return true;
        }
      };

      // Back
      cd.comments
        .slice(0, commentInViewport.id)
        .reverse()
        .some(registerSeenIfInViewport);

      // Forward
      cd.comments
        .slice(commentInViewport.id)
        .some(registerSeenIfInViewport);

      this.updateFirstUnseenButton();
    }, 300);
  },

  /**
   * Update the refresh button to show the number of comments added to the page since it was loaded.
   *
   * @param {number} commentCount
   * @param {Map} commentsBySection
   * @param {boolean} areThereInteresting
   * @private
   * @memberof module:navPanel
   */
  updateRefreshButton(commentCount, commentsBySection, areThereInteresting) {
    notRenderedCount = commentCount;
    this.$refreshButton
      .empty()
      .attr('title', generateTooltipText(commentCount, commentsBySection));
    if (commentCount) {
      $('<span>')
        // Can't set the attribute to $refreshButton as its tooltip may have another direction.
        .attr('dir', 'ltr')

        .text(`+${commentCount}`)
        .appendTo(this.$refreshButton);
    }
    if (areThereInteresting) {
      this.$refreshButton.addClass('cd-navPanel-refreshButton-interesting');
    } else {
      this.$refreshButton.removeClass('cd-navPanel-refreshButton-interesting');
    }
  },

  /**
   * Update the "Go to the next comment form out of sight" button visibility.
   *
   * @memberof module:navPanel
   */
  updateCommentFormButton() {
    if (cd.g.autoScrollInProgress || !navPanel.isMounted()) return;

    if (cd.commentForms.some((commentForm) => !commentForm.$element.cdIsInViewport(true))) {
      this.$commentFormButton.show();
    } else {
      this.$commentFormButton.hide();
    }
  },
};

export default navPanel;
