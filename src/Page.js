/**
 * Class representing a wiki page.
 *
 * @module Page
 */

import cd from './cd';
import { areObjectsEqual, defined, isProbablyTalkPage, mergeRegexps } from './utils-general';

/**
 * @typedef {object} PageSource
 * @property {string} name Name of the page.
 */

/**
 * Class representing a wiki page.
 */
export class Page {
  /**
   * Calculated archive prefix.
   *
   * @type {string|undefined}
   */
  archivePrefix;

  /**
   * Whether the page is an archive page.
   *
   * @type {boolean|undefined}
   */
  isArchive;

  /**
   * @type {string|undefined}
   */
  name;

  /**
   * @type {mw.Title}
   */
  title;

  /**
   * @type {RegExp}
   */
  titleRegexp;

  /**
   * @param {mw.Title} title
   * @param {string} [name] Gendered namespace name - for languages in which namespaces have
   *   grammatical gender. Should be in the form "Обсуждение участника:Example".
   */
  constructor(title, name) {
    this.title = title;
    this.name = name;

    const patterns = [];
    if (cd.config.titleRegexp) {
      patterns.push(cd.config.titleRegexp);
    }
    patterns.push(`${this.name || this.title.getPrefixedText()}\\s*`);

    this.titleRegexp = new RegExp(mergeRegexps(patterns), 'i');
  }

  /**
   * Check if the page has a certain name.
   *
   * @param {string|mw.Title} title
   * @returns {boolean}
   */
  equals(title) {
    return areObjectsEqual(
      typeof title === 'string' ? mw.Title.newFromText(title) : title,
      this.title
    );
  }

  /**
   * Get the page name for links (with namespace, in non-natural order).
   *
   * @returns {string}
   */
  getAlteredName() {
    return this.name || this.title.getPrefixedText();
  }

  /**
   * Get the archive prefix for the page.
   *
   * @param {boolean} [onlyExplicit=false]
   * @returns {string|undefined}
   */
  getArchivePrefix(onlyExplicit = false) {
    if (defined(this.archivePrefix)) {
      return this.archivePrefix;
    }

    const explicitPrefix = cd.config.archivePrefix?.[this.title.getPrefixedText()];
    if (explicitPrefix || onlyExplicit) {
      this.archivePrefix = explicitPrefix;
      return this.archivePrefix;
    }

    const isProbablyTalkPageVal = isProbablyTalkPage(
      this.title.getPrefixedText(),
      this.title.getNamespaceId()
    );
    if (isProbablyTalkPageVal) {
      this.archivePrefix = 'Архив';
      return this.archivePrefix;
    }

    return undefined;
  }

  /**
   * Get the path to the page (namespace in non-natural order).
   *
   * @returns {string}
   */
  getPath() {
    return this.title.getRelativeText(this.title.getNamespaceId());
  }

  /**
   * Get the page name for display.
   *
   * @returns {string}
   */
  getReadableName() {
    return this.name || this.title.getPrefixedText();
  }

  /**
   * Get the root page of this page. For example, if this is an archive page, returns the main talk
   * page, if this is a talk page subpage - its parent page.
   *
   * @returns {Page|null}
   */
  getRoot() {
    return null;
  }

  /**
   * Check if a page exists.
   *
   * @returns {boolean}
   */
  isExisting() {
    return Boolean(this.title.exists());
  }

  /**
   * Check if the page is an archive page.
   *
   * @returns {boolean}
   */
  isArchivePage() {
    if (defined(this.isArchive)) {
      return this.isArchive;
    }

    const explicitPrefix = this.getArchivePrefix(true);
    if (defined(explicitPrefix)) {
      this.isArchive = this.getPath().includes(explicitPrefix);
      return this.isArchive;
    }

    const path = this.getPath();
    if (path.includes('Архив') || path.match(/\/\d{4}(-\d{1,2})?$/)) {
      this.isArchive = true;
      return true;
    }
    this.isArchive = false;

    return false;
  }

  /**
   * Check if the page is a talk page.
   *
   * @returns {boolean}
   */
  isTalkPage() {
    return this.title.isTalkPage();
  }
}