/**
 * Navigation panel and new comments-related functions and configuration.
 *
 * @module navPanel
 */

import Comment from './Comment';
import cd from './cd';
import updateChecker from './updateChecker';
import { focusInput, reorderArray } from './util';
import { formatDate } from './timestamp';
import { reloadPage } from './boot';
import { removeWikiMarkup } from './wikitext';

let urbtTimeout;
let cachedCommentCount;
let cachedCommentsBySection;

export default {
  /**
   * Render the navigation panel. This is done when the page is first loaded or created.
   */
  mount() {
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
      .on('click', (e) => {
        this.refreshClick(e.ctrlKey);
      })
      .appendTo(this.$element);

    this.updateRefreshButtonTooltip(0);

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
  },

  /**
   * Check if the navigation panel is mounted. Is equivalent to checking the existence of {@link
   * module:navPanel.$element}, and for the most of the practical purposes, does the same as the
   * `convenientDiscussions.g.isPageActive` check.
   *
   * @returns {boolean}
   */
  isMounted() {
    return Boolean(this.$element);
  },

  /**
   * Reset the navigation panel to the initial state. This is done after page refreshes. (Comment
   * forms are expected to be restored already.)
   */
  reset() {
    this.$refreshButton.empty();
    this.updateRefreshButtonTooltip(0);
    this.$previousButton.hide();
    this.$nextButton.hide();
    this.$firstUnseenButton.hide();
    this.$commentFormButton.hide();
    clearTimeout(urbtTimeout);
  },

  /**
   * Count the new and unseen comments on the page, and update the navigation panel to reflect that.
   */
  fill() {
    if (cd.comments.some((comment) => comment.isNew)) {
      this.updateRefreshButtonTooltip(0);
      this.$previousButton.show();
      this.$nextButton.show();
      this.updateFirstUnseenButton();
    }
  },

  /**
   * Perform routines at the refresh button click.
   *
   * @param {boolean} markAsRead Whether to mark all comments as read.
   */
  refreshClick(markAsRead) {
    // There was reload confirmation here, but after session restore was introduced, the
    // confirmation seems to be no longer needed.
    reloadPage({
      commentAnchor: updateChecker.relevantNewCommentAnchor,
      markAsRead,
    });
  },

  goToNewCommentInDirection(direction) {
    if (cd.g.isAutoScrollInProgress) return;

    const commentInViewport = Comment.findInViewport(direction);
    if (!commentInViewport) return;

    const reverse = direction === 'backward';
    const reorderedComments = reorderArray(cd.comments, commentInViewport.id, reverse);
    const candidates = reorderedComments
      .filter((comment) => comment.isNew && !comment.isInViewport());
    const comment = candidates.find((comment) => comment.isInViewport() === false) || candidates[0];
    if (comment) {
      comment.scrollTo(true, false, false, () => {
        // The default handleScroll() callback is executed in $#cdScrollTo, but that happens after
        // a 300ms timeout, so we have a chance to have our callback executed first.
        comment.registerSeen(direction, true);
        this.updateFirstUnseenButton();
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
    if (cd.g.isAutoScrollInProgress) return;

    const candidates = cd.comments.filter((comment) => comment.isSeen === false);
    const comment = candidates.find((comment) => comment.isInViewport() === false) || candidates[0];
    if (comment) {
      comment.scrollTo(true, false, false, () => {
        // The default handleScroll() callback is executed in $#cdScrollTo, but that happens after
        // a 300ms timeout, so we have a chance to have our callback executed first.
        comment.registerSeen('forward', true);
        this.updateFirstUnseenButton();
      });
    }
  },

  /**
   * Go to the next comment form out of sight, or just the first comment form, if `first` is set to
   * true.
   *
   * @param {boolean} [first=false]
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
      focusInput(commentForm.commentInput);
    }
  },

  /**
   * Update the refresh button to show the number of comments added to the page since it was loaded.
   *
   * @param {number} commentCount
   * @param {Map} commentsBySection
   * @param {boolean} areThereInteresting
   */
  updateRefreshButton(commentCount, commentsBySection, areThereInteresting) {
    this.$refreshButton.empty();
    this.updateRefreshButtonTooltip(commentCount, commentsBySection);
    if (commentCount) {
      $('<span>')
        .text(`+${commentCount}`)
        .appendTo(this.$refreshButton);
    }
    this.$refreshButton.toggleClass('cd-navPanel-refreshButton-interesting', areThereInteresting);
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
    cd.debug.startTimer('updateRefreshButtonTooltip');

    // If the method was not called after a timeout and the timeout exists, clear it.
    clearTimeout(urbtTimeout);

    cachedCommentCount = commentCount;
    cachedCommentsBySection = commentsBySection;

    let tooltipText = null;
    const areThereNew = cd.comments.some((comment) => comment.isNew);
    if (commentCount) {
      tooltipText = (
        cd.s('navpanel-newcomments-count', commentCount) +
        ' ' +
        cd.s('navpanel-newcomments-refresh') +
        ' ' +
        cd.mws('parentheses', 'R')
      );
      if (areThereNew) {
        tooltipText += '\n' + cd.s('navpanel-markasread');
      }
      const bullet = removeWikiMarkup(cd.s('bullet'));
      const comma = cd.mws('comma-separator');
      const rtlMarkOrNot = cd.g.CONTENT_DIR === 'rtl' ? '\u200F' : '';
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
            formatDate(comment.date) :
            cd.s('navpanel-newcomments-unknowndate');
          tooltipText += bullet + ' ' + names + rtlMarkOrNot + comma + date;
        });
      });

      // When timestamps are relative and the TOC is set to be modified, the tooltip is updated
      // together with the updates of the TOC. When the TOC is not modified, we need to update the
      // tooltip manually every minute. When timestamps are "improved", timestamps are updated in
      // LiveTimestamp.updateImproved.
      if (cd.settings.timestampFormat === 'relative' && !cd.settings.modifyToc) {
        urbtTimeout = setTimeout(() => {
          this.updateTimestampsInRefreshButtonTooltip();
        }, cd.g.MILLISECONDS_IN_MINUTE);
      }
    } else {
      tooltipText = cd.s('navpanel-refresh') + ' ' + cd.mws('parentheses', 'R');
      if (areThereNew) {
        tooltipText += '\n' + cd.s('navpanel-markasread');
      }
    }

    this.$refreshButton.attr('title', tooltipText);

    cd.debug.stopTimer('updateRefreshButtonTooltip');
  },

  updateTimestampsInRefreshButtonTooltip() {
    this.updateRefreshButtonTooltip(cachedCommentCount, cachedCommentsBySection);
  },

  /**
   * Update the state of the "Go to the first unseen comment" button.
   */
  updateFirstUnseenButton() {
    if (!this.isMounted()) return;

    const unseenCount = cd.comments.filter((comment) => comment.isSeen === false).length;
    if (unseenCount) {
      this.$firstUnseenButton.show().text(unseenCount);
    } else {
      this.$firstUnseenButton.hide();
    }
  },

  /**
   * Update the "Go to the next comment form out of sight" button visibility.
   */
  updateCommentFormButton() {
    if (cd.g.isAutoScrollInProgress || !this.isMounted()) return;

    const areThereHidden = cd.commentForms
      .some((commentForm) => !commentForm.$element.cdIsInViewport(true));
    this.$commentFormButton[areThereHidden ? 'show' : 'hide']();
  },
};
