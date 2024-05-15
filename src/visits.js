import LZString from 'lz-string';

import CdError from './CdError';
import cd from './cd';
import commentRegistry from './commentRegistry';
import settings from './settings';
import { getUserInfo, saveLocalOption } from './utils-api';
import { mixEventEmitterIntoObject } from './utils-oojs';

export default {
  init() {
    // Do it here because OO.EventEmitter can be unavailable when this module is first imported.
    mixEventEmitterIntoObject(this);
  },

  /**
   * Request the pages visits data from the server.
   *
   * {@link https://doc.wikimedia.org/mediawiki-core/master/js/mw.user.html#.options mw.user.options}
   * is not used even on the first run because the script may not run immediately after the page has
   * loaded. In fact, when the page is loaded in a background tab, it can be throttled until it is
   * focused, so an indefinite amount of time can pass.
   *
   * @param {import('./BootProcess').default} [bootProcess]
   * @param {boolean} [reuse=false] Whether to reuse a cached userinfo request.
   */
  async load(bootProcess, reuse = false) {
    if (!cd.user.isRegistered()) return;

    try {
      // mw.user.options is not used even on first run because it appears to be cached sometimes
      // which can be critical for determining subscriptions.
      this.unpack(await getUserInfo(reuse).then(({ visits }) => visits));
    } catch (e) {
      console.warn('Convenient Discussions: Couldn\'t load the settings from the server.', e);
      return;
    }

    const articleId = mw.config.get('wgArticleId');
    this.data ||= {};
    this.data[articleId] ||= [];
    this.currentPageData = this.data[articleId];

    this.process(bootProcess.passedData.markAsRead);
  },

  /**
   * Process the visits data and emit events.
   *
   * @param {boolean} markAsReadRequested
   * @fires newCommentsHighlighted
   * @private
   */
  async process(markAsReadRequested) {
    const currentTime = Math.floor(Date.now() / 1000);

    this.update(currentTime, markAsReadRequested);

    const timeConflict = this.currentPageData.length ?
      commentRegistry.initNewAndSeen(this.currentPageData, currentTime) :
      false;

    // (Nearly) eliminate the possibility that we will wrongfully mark a seen comment as unseen/new
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
    // the timeConflict stuff.
    this.currentPageData.push(String(currentTime + timeConflict * 60));

    this.save();

    this.emit('process', this.currentPageData);

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
   * @param {boolean} markAsReadRequested
   * @private
   */
  update(currentTime, markAsReadRequested) {
    for (let i = this.currentPageData.length - 1; i >= 0; i--) {
      if (
        this.currentPageData[i] < currentTime - 60 * settings.get('highlightNewInterval') ||

        // Add this condition for rare cases when the time of the previous visit is later than the
        // current time (see timeConflict). In that case, when highlightNewInterval is set to 0,
        // the user shouldn't get comments highlighted again all of a sudden.
        !settings.get('highlightNewInterval') ||

        markAsReadRequested
      ) {
        // Remove visits _before_ the found one.
        this.currentPageData.splice(0, i);

        break;
      }
    }
  },

  /**
   * Convert a visits object into an optimized string and compress it.
   *
   * @returns {string}
   * @private
   */
  pack() {
    // The format of the items:
    // <Page ID>,<List of visits, from oldest to newest, separated by comma>\n
    return LZString.compressToEncodedURIComponent(
      Object.keys(this.data)
        .map((key) => `${key},${this.data[key].join(',')}\n`)
        .join('')
        .trim()
    );
  },

  /**
   * Unpack a compressed visits string into a visits object.
   *
   * @param {string|undefined} compressed
   * @private
   */
  unpack(compressed) {
    this.data = {};
    if (!compressed) return;

    const string = LZString.decompressFromEncodedURIComponent(compressed);
    const regexp = /^(\d+),(.+)$/gm;
    let match;
    while ((match = regexp.exec(string))) {
      this.data[match[1]] = match[2].split(',');
    }
  },

  /**
   * Save the pages visits data to the server.
   */
  async save() {
    let compressed = this.pack();
    if (compressed.length > 20480) {
      this.cleanUp(((compressed.length - 20480) / compressed.length) + 0.05);
      compressed = this.pack();
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
   * @private
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
