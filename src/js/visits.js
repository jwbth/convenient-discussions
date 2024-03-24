import CdError from './CdError';
import CommentStatic from './CommentStatic';
import LZString from 'lz-string';
import SectionStatic from './SectionStatic';
import cd from './cd';
import initUpdateChecker from './updateChecker';
import navPanel from './navPanel';
import settings from './settings';
import toc from './toc';
import userRegistry from './userRegistry';
import { getUserInfo, saveLocalOption } from './apiWrappers';

export default {
  /**
   * Request the pages visits data from the server.
   *
   * {@link https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.user-property-options mw.user.options}
   * is not used even on the first run because the script may not run immediately after the page has
   * loaded. In fact, when the page is loaded in a background tab, it can be throttled until it is
   * focused, so an indefinite amount of time can pass.
   *
   * @param {boolean} [reuse=false] Whether to reuse a cached userinfo request.
   * @param {import('./BootProcess').default} [bootProcess]
   */
  async get(reuse = false, bootProcess) {
    if (!userRegistry.getCurrent().isRegistered()) return;

    try {
      this.data = mw.user.options.get(cd.g.visitsOptionName) !== null || !bootProcess.isFirstRun() ?
        this.unpack(await getUserInfo(reuse).then(({ visits }) => visits)) :
        {};
    } catch (e) {
      console.warn('Couldn\'t load the settings from the server.', e);
      return;
    }

    const articleId = mw.config.get('wgArticleId');
    this.data ||= {};
    this.data[articleId] ||= [];
    this.currentPageData = this.data[articleId];

    this.process(bootProcess);
  },

  /**
   * Highlight new comments and update the navigation panel.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   * @fires newCommentsHighlighted
   * @private
   */
  async process(bootProcess) {
    const currentTime = Math.floor(Date.now() / 1000);

    this.update(currentTime, bootProcess);

    // FIXME: decouple the following

    let timeConflict = false;
    if (this.currentPageData.length) {
      CommentStatic.getAll().forEach((comment) => {
        const commentTimeConflict = comment.initNewAndSeen(
          this.currentPageData,
          currentTime,
          bootProcess.data('unseenCommentIds')?.some((id) => id === comment.id) || false
        );
        timeConflict ||= commentTimeConflict;
      });

      CommentStatic.configureAndAddLayers((c) => c.isNew);

      // If all the comments on the page are unseen, don't add them to the TOC - the user would
      // definitely prefer to read the names of the topics easily. (But still consider them new -
      // otherwise the user can be confused, especially if there are few topics on an unpopular
      // page.)
      if (
        CommentStatic.getAll().filter((c) => c.isSeen === false || !c.date).length !==
        CommentStatic.getCount()
      ) {
        toc.addNewComments(
          CommentStatic.groupBySection(
            CommentStatic.getAll().filter((c) => c.isSeen === false)
          ),
          bootProcess
        );
      }
    }

    // (Nearly) eliminate the probability that we will wrongfully mark a seen comment as unseen/new
    // at the next page load by adding a minute to the visit time if there is at least one comment
    // posted at the same minute. If instead we required the comment time to be less than the
    // current time to be highlighted, it would result in missed comments if the comment was posted
    // at the same minute as our visit but after that moment.
    //
    // We sacrifice the chance that sometimes we will wrongfully mark an unseen comment as seen -
    // but for that,
    // * one comment should be added at the same minute as our visit but earlier;
    // * another comment should be added at the same minute as our visit but later.
    //
    // We could decide that not marking unseen comments as seen is an absolute priority and remove
    // the `timeConflict` stuff.
    this.currentPageData.push(String(currentTime + timeConflict * 60));

    this.save();

    // Should be before `CommentStatic.registerSeen()` to include all new comments in the metadata,
    // even those currently inside the viewport.
    SectionStatic.updateNewCommentsData();

    // Should be below `SectionStatic.updateNewCommentsData()` - `Section#newComments` is set there.
    // TODO: keep the scrolling position even if adding the comment count moves the content.
    // (Currently this is done in `toc.addNewComments()`.)
    toc.addCommentCount();

    CommentStatic.registerSeen();
    navPanel.fill();
    initUpdateChecker(
      this.currentPageData.length >= 1 ?
        Number(this.currentPageData[this.currentPageData.length - 1]) :
        undefined,
      (
        (bootProcess.data('wasCommentFormSubmitted') && bootProcess.data('commentIds')?.[0]) ||
        undefined
      )
    );

    /**
     * New comments have been highlighted.
     *
     * @event newCommentsHighlighted
     * @param {object} cd {@link convenientDiscussions} object.
     */
    mw.hook('convenientDiscussions.newCommentsHighlighted').fire(cd);
  },

  /**
   * Remove timestamps that we don't need anymore from the visits array.
   *
   * @param {number} currentTime
   * @param {import('./BootProcess').default} bootProcess
   * @private
   */
  update(currentTime, bootProcess) {
    for (let i = this.currentPageData.length - 1; i >= 0; i--) {
      if (
        this.currentPageData[i] < currentTime - 60 * settings.get('highlightNewInterval') ||

        // Add this condition for rare cases when the time of the previous visit is later than the
        // current time (see `timeConflict`). In that case, when `highlightNewInterval` is set to 0,
        // the user shouldn't get comments highlighted again all of a sudden.
        !settings.get('highlightNewInterval') ||

        bootProcess.data('markAsRead')
      ) {
        // Remove visits _before_ the found one.
        this.currentPageData.splice(0, i);

        break;
      }
    }
  },

  /**
   * Pack the visits object into a string for further compression.
   *
   * @returns {string}
   */
  pack() {
    return Object.keys(this.data)
      .map((key) => `${key},${this.data[key].join(',')}\n`)
      .join('')
      .trim();
  },

  /**
   * Unpack the visits string into a visits object.
   *
   * @param {string} visitsString
   * @returns {object}
   */
  unpack(compressed) {
    const string = LZString.decompressFromEncodedURIComponent(compressed);
    const visits = {};
    const regexp = /^(\d+),(.+)$/gm;
    let match;
    while ((match = regexp.exec(string))) {
      visits[match[1]] = match[2].split(',');
    }
    return visits;
  },

  /**
   * Save the pages visits data to the server.
   */
  async save() {
    let compressed = LZString.compressToEncodedURIComponent(this.pack());
    if (compressed.length > 20480) {
      this.cleanUp(((compressed.length - 20480) / compressed.length) + 0.05);
      compressed = LZString.compressToEncodedURIComponent(this.pack());
    }

    try {
      await saveLocalOption(cd.g.visitsOptionName, compressed);
    } catch (e) {
      if (e instanceof CdError) {
        const { type, code } = e.data;
        if (type === 'internal' && code === 'sizeLimit') {
          this.cleanUp(0.1);
          this.save();
        } else {
          console.error(e);
        }
      } else {
        console.error(e);
      }
    }
  },

  /**
   * Remove the oldest `share`% of visits when the size limit is hit.
   *
   * @param {number} share
   */
  cleanUp(share = 0.1) {
    const visits = Object.assign({}, this.data);
    const timestamps = Object.keys(visits)
      .reduce((acc, key) => acc.concat(visits[key]), [])
      .sort((a, b) => a - b);
    const boundary = timestamps[Math.floor(timestamps.length * share)];
    Object.keys(visits).forEach((key) => {
      visits[key] = visits[key].filter((visit) => visit >= boundary);
      if (!visits[key].length) {
        delete visits[key];
      }
    });
    this.data = visits;
  },
};
