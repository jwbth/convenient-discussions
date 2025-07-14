import CdError from './CdError';
import cd from './cd';
import { parseTimestamp } from './utils-timestamp';
import { maskDistractingCode, findFirstTimestamp } from './utils-wikitext';

/**
 * Class that keeps the methods and data related to the page's source code.
 */
export default class PageSource {
  /**
   * Whether new topics go on top on this page. Filled upon running
   * {@link PageSource#guessNewTopicPlacement}.
   *
   * @type {boolean|undefined}
   */
  areNewTopicsOnTop;

  /**
   * The start index of the first section, if new topics are on top on this page. Filled upon
   * running {@link PageSource#guessNewTopicPlacement}.
   *
   * @type {number|undefined}
   */
  firstSectionStartIndex;

  /**
   * Create a comment's source object.
   *
   * @param {import('./Page').default} page Page.
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Modify the page code string in accordance with an action. The `'addSection'` action is
   * presumed.
   *
   * @param {object} options
   * @param {string} [options.commentCode] Comment code, including trailing newlines and the
   *   signature. It is required (set to optional for polymorphism with CommentSource and
   *   SectionSource).
   * @param {import('./CommentForm').default} options.commentForm Comment form that has the code.
   * @returns {{
   *   contextCode: string;
   *   commentCode?: string;
   * }}
   */
  modifyContext({ commentCode, commentForm }) {
    const originalContextCode = this.page.code;
    if (!originalContextCode) {
      throw new CdError({
        type: 'internal',
        message: 'Context (page) code is not set.',
      });
    }

    let contextCode;
    if (commentForm.isNewTopicOnTop()) {
      const firstSectionStartIndex = maskDistractingCode(originalContextCode)
        .search(/^(=+).*\1[ \t\x01\x02]*$/m);
      contextCode = (
        (
          firstSectionStartIndex === -1 ?
            (originalContextCode ? originalContextCode + '\n' : '') :
            originalContextCode.slice(0, firstSectionStartIndex)
        ) +
        commentCode +
        '\n' +
        originalContextCode.slice(firstSectionStartIndex)
      );
    } else {
      contextCode = (
        (commentForm.isNewSectionApi() ? '' : (originalContextCode + '\n').trimStart()) +
        commentCode
      );
    }

    return { contextCode, commentCode };
  }

  /**
   * Enrich the page instance with the properties regarding whether new topics go on top on this
   * page (based on various factors) and, if new topics are on top, the start index of the first
   * section.
   *
   * @returns {{
   *   areNewTopicsOnTop: boolean;
   *   firstSectionStartIndex: number | undefined;
   * }}
   * @throws {CdError}
   * @private
   */
  guessNewTopicPlacement() {
    const page = this.page;

    if (page.code === undefined) {
      throw new CdError('Can\'t analyze the new topics placement: Page#code is undefined.');
    }

    let areNewTopicsOnTop = cd.config.areNewTopicsOnTop?.(page.name, page.code) || null;

    const adjustedCode = maskDistractingCode(page.code);
    const sectionHeadingRegexp = PageSource.getTopicHeadingRegexp();

    if (areNewTopicsOnTop === null) {
      // Detect the topic order: newest first or newest last.
      let previousDate;
      let difference = 0;
      let sectionHeadingMatch;
      while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode))) {
        const timestamp = findFirstTimestamp(page.code.slice(sectionHeadingMatch.index));
        const { date } = timestamp && parseTimestamp(timestamp) || {};
        if (date) {
          if (previousDate) {
            difference += date > previousDate ? -1 : 1;
          }
          previousDate = date;
        }
      }
      areNewTopicsOnTop = difference === 0 && mw.config.get('wgServerName') === 'ru.wikipedia.org' ?
        page.namespaceId % 2 === 0 :
        difference > 0;
    }

    return {
      areNewTopicsOnTop,

      // We only need the first section's index when new topics are on top.
      firstSectionStartIndex: areNewTopicsOnTop
        ? sectionHeadingRegexp.exec(adjustedCode)?.index
        : undefined,
    };
  }

  /**
   * Determine an offset in the code to insert a new/moved section into. If `referenceDate` is
   * specified, will take chronological order into account.
   *
   * @param {Date} [referenceDate=new Date()]
   * @returns {number}
   */
  findProperPlaceForSection(referenceDate = new Date()) {
    const { areNewTopicsOnTop, firstSectionStartIndex } = this.guessNewTopicPlacement();
    const code = /** @type {string} */ (this.page.code);

    if (!referenceDate) {
      return areNewTopicsOnTop ? firstSectionStartIndex || 0 : code.length;
    }

    const adjustedCode = maskDistractingCode(code);
    const sectionHeadingRegexp = PageSource.getTopicHeadingRegexp();
    let sectionHeadingMatch;
    const sections = [];
    while ((sectionHeadingMatch = sectionHeadingRegexp.exec(adjustedCode))) {
      const timestamp = findFirstTimestamp(code.slice(sectionHeadingMatch.index));
      const { date } = timestamp && parseTimestamp(timestamp) || {};
      sections.push({
        date,
        index: sectionHeadingMatch.index,
      });
    }

    const properPlaceIndex = sections.find(({ date }) =>
      (areNewTopicsOnTop && date && date < referenceDate) ||
      (!areNewTopicsOnTop && date && date > referenceDate)
    )?.index;

    return properPlaceIndex || code.length;
  }

  /**
   * Get the regexp for traversing topic headings.
   *
   * @returns {RegExp}
   */
  static getTopicHeadingRegexp() {
    return /^==[^=].*?==[ \t\x01\x02]*\n/gm;
  }
}
