/**
 * Autocomplete mechanism.
 *
 * @module Autocomplete
 */

import Tribute from '../tribute/Tribute';
import cd from './cd';
import userRegistry from './userRegistry';
import { defined, firstCharToUpperCase, handleApiReject, removeDoubleSpaces, unique } from './util';
import {
  getRelevantPageNames,
  getRelevantTemplateNames,
  getRelevantUserNames,
} from './apiWrappers';

/**
 * Autocomplete class.
 */
export default class Autocomplete {
  /**
   * @typedef {object} OoUiTextInputWidget
   * @see https://doc.wikimedia.org/oojs-ui/master/js/#!/api/OO.ui.TextInputWidget
   */

  /**
   * Create an autocomplete instance. An instance is a set of settings and inputs to which these
   * settings apply.
   *
   * @param {object} options
   * @param {string[]} options.types Which values should be autocompleted. Can contain `'mentions'`,
   *   `'wikilinks'`, `'templates'`, and `'tags'`.
   * @param {OoUiTextInputWidget[]} options.inputs Inputs to attach the autocomplete to.
   * @param {string[]} [options.comments] List of comments in the section for the mentions and
   *   comment links autocomplete.
   * @param {string[]} [options.defaultUserNames] Default list of user names for the mentions
   *   autocomplete.
   */
  constructor({ types, inputs, comments, defaultUserNames }) {
    const collections = this.getCollections(types, comments, defaultUserNames);

    require('../tribute/tribute.less');

    /**
     * {@link https://github.com/zurb/tribute Tribute} object.
     *
     * @type {Tribute}
     */
    this.tribute = new Tribute({
      collection: collections,
      allowSpaces: true,
      menuItemLimit: 10,
      noMatchTemplate: () => null,
      containerClass: 'tribute-container cd-autocompleteContainer',
      replaceTextSuffix: '',
      isRtl: document.body.classList.contains('sitedir-rtl'),
    });

    inputs.forEach((input) => {
      const element = input.$input.get(0);
      this.tribute.attach(element);
      element.cdInput = input;
      element.addEventListener('tribute-replaced', (e) => {
        // Move the caret to the place we need.
        const caretIndex = input.getRange().to;
        const startPos = caretIndex - e.detail.item.original.value.length;
        const value = input.getValue();
        input.setValue(value.slice(0, caretIndex) + value.slice(caretIndex));
        const endOffset = e.detail.item.original.endOffset;
        const startOffset = e.detail.item.original.startOffset === null ?
          e.detail.item.original.value.length - endOffset :
          e.detail.item.original.startOffset;
        input.selectRange(startPos + startOffset, caretIndex - endOffset);
      });
      element.addEventListener('tribute-active-true', () => {
        cd.g.activeAutocompleteMenu = this.tribute.menu;
      });
      element.addEventListener('tribute-active-false', () => {
        cd.g.activeAutocompleteMenu = null;
      });
      if (input instanceof OO.ui.MultilineTextInputWidget) {
        input.on('resize', () => {
          if (this.tribute.menuEvents.windowResizeEvent) {
            this.tribute.menuEvents.windowResizeEvent();
          }
        });
      }
    });
  }

  /**
   * Get a list of collections of specified types.
   *
   * @param {string[]} types
   * @param {string[]} comments
   * @param {string[]} defaultUserNames
   * @returns {object[]}
   * @private
   */
  getCollections(types, comments, defaultUserNames) {
    const selectTemplate = (item) => {
      if (item) {
        return item.original.value;
      } else {
        return '';
      }
    };

    const prepareValues = (arr, config) => (
      arr
        .filter(defined)
        .filter(unique)
        .map((item) => {
          let key;
          if (Array.isArray(item)) {
            // Tags
            key = item[0];
          } else if (item.key) {
            // Comment links
            key = item.key;
          } else {
            // The rest
            key = item;
          }
          return {
            key,
            value: config.transform ? config.transform(item) : item,
            // Start offset is calculated from the start position of the inserted text. `null` means
            // the selection start position should match with the end position (i.e., no text should
            // be selected).
            startOffset: config.getStartOffset ? config.getStartOffset(item) : null,
            // End offset is calculated from the end position of the inserted text.
            endOffset: config.getEndOffset ? config.getEndOffset(item) : 0,
          };
        })
    );

    const spacesRegexp = new RegExp(mw.msg('word-separator'), 'g');

    const collectionsByType = {
      mentions: {
        trigger: cd.config.mentionCharacter,
        searchOpts: {
          skip: true,
        },
        requireLeadingSpace: true,
        selectTemplate,
        values: async (text, callback) => {
          text = removeDoubleSpaces(text);

          if (!text.startsWith(this.mentions.snapshot)) {
            this.mentions.cache = [];
          }
          this.mentions.snapshot = text;

          if (text.includes('[[')) {
            callback([]);
            return;
          }

          if (this.mentions.byText[text]) {
            callback(prepareValues(this.mentions.byText[text], this.mentions));
          } else {
            const matches = Autocomplete.search(text, this.mentions.default);
            let values = matches.slice();

            const makeRequest = (
              text &&
              text.length <= 85 &&
              !/[#<>[\]|{}/@:]/.test(text) &&
              // 5 spaces in a user name seem too many. "Jack who built the house" has 4 :-)
              (text.match(spacesRegexp) || []).length <= 4
            );

            if (makeRequest) {
              // Logically, either `matched` or `this.mentions.cache` should have a zero length (a
              // request is made only if there is no matches in the section; if there are,
              // `this.mentions.cache` is an empty array).
              if (!matches.length) {
                values.push(...this.mentions.cache);
              }
              values = Autocomplete.search(text, values);

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.mentions));

            if (makeRequest && !matches.length) {
              let values;
              try {
                values = await getRelevantUserNames(text);
              } catch (e) {
                return;
              }

              values = this.mentions.removeSelf(values);
              this.mentions.cache = values.slice();

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();

              this.mentions.byText[text] = values;

              // The text has been updated since the request was made.
              if (this.mentions.snapshot !== text) return;

              callback(prepareValues(values, this.mentions));
            }
          }
        },
      },
      wikilinks: {
        trigger: '[[',
        keepTextAfter: ']]',
        searchOpts: {
          skip: true,
        },
        selectTemplate,
        values: async (text, callback) => {
          text = removeDoubleSpaces(text);

          if (!text.startsWith(this.wikilinks.snapshot)) {
            this.wikilinks.cache = [];
          }
          this.wikilinks.snapshot = text;

          if (this.wikilinks.byText[text]) {
            callback(prepareValues(this.wikilinks.byText[text], this.wikilinks));
          } else {
            let values = [];
            const valid = (
              text &&
              text !== ':' &&
              text.length <= 255 &&

              // 10 spaces in a page name seems too many.
              (text.match(spacesRegexp) || []).length <= 9 &&

              // Forbidden characters
              !/[#<>[\]|{}]/.test(text)
            );
            const makeRequest = (
              valid &&

              // Interwikis
              !(
                (/^:/.test(text) || /^[a-z]\w*:/.test(text)) &&
                !cd.g.ALL_NAMESPACES_REGEXP.test(text)
              )
            );
            if (makeRequest) {
              values.push(...this.wikilinks.cache);
              values = Autocomplete.search(text, values);
            }
            if (valid) {
              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.wikilinks));

            if (makeRequest) {
              let values;
              try {
                values = await getRelevantPageNames(text);
              } catch (e) {
                return;
              }

              this.wikilinks.cache = values.slice();

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();

              this.wikilinks.byText[text] = values;

              // The text has been updated since the request was made.
              if (this.wikilinks.snapshot !== text) return;

              callback(prepareValues(values, this.wikilinks));
            }
          }
        },
      },
      templates: {
        trigger: '{{',
        keepTextAfter: '}}',
        searchOpts: {
          skip: true,
        },
        selectTemplate: (item) => {
          if (item) {
            const input = this.tribute.current.element.cdInput;

            input.setDisabled(true);
            input.pushPending();

            cd.g.api.get({
              action: 'templatedata',
              titles: `Template:${item.original.key}`,
              redirects: true,
            })
              .catch(handleApiReject)
              .then(
                (resp) => {
                  const pages = resp?.pages;
                  let s = '';
                  let firstValueIndex = 0;
                  Object.keys(pages).forEach((key) => {
                    const template = pages[key];
                    const params = template.params || [];
                    const paramNames = template.paramOrder || Object.keys(params);
                    paramNames
                      .filter((param) => params[param].required || params[param].suggested)
                      .forEach((param) => {
                        if (template.format === 'block') {
                          s += `\n| ${param} = `;
                        } else {
                          if (isNaN(param)) {
                            s += `|${param}=`;
                          } else {
                            s += `|`;
                          }
                        }
                        if (!firstValueIndex) {
                          firstValueIndex = s.length;
                        }
                      });
                    if (template.format === 'block' && s) {
                      s += '\n';
                    }
                  });

                  const caretIndex = input.getRange().to;
                  const value = input.getValue();
                  input.setValue(value.slice(0, caretIndex) + s + value.slice(caretIndex));
                  input.selectRange(caretIndex + firstValueIndex);
                },
                (e) => {
                  mw.notify(cd.s('cf-mentions-notemplatedata'), { type: 'error' });
                  console.warn(e);
                }
              )
              .always(() => {
                input.setDisabled(false);
                input.popPending();
                input.focus();
              });

            return item.original.value;
          } else {
            return '';
          }
        },
        values: async (text, callback) => {
          text = removeDoubleSpaces(text);

          if (!text.startsWith(this.templates.snapshot)) {
            this.templates.cache = [];
          }
          this.templates.snapshot = text;

          if (text.includes('{{')) {
            callback([]);
            return;
          }

          if (this.templates.byText[text]) {
            callback(prepareValues(this.templates.byText[text], this.templates));
          } else {
            let values = [];
            const makeRequest = (
              text &&
              text.length <= 255 &&
              !/[#<>[\]|{}]/.test(text) &&
              // 10 spaces in a page name seems too many.
              (text.match(spacesRegexp) || []).length <= 9
            );
            if (makeRequest) {
              values.push(...this.templates.cache);
              values = Autocomplete.search(text, values);

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.templates));

            if (makeRequest) {
              let values;
              try {
                values = await getRelevantTemplateNames(text);
              } catch (e) {
                return;
              }

              this.templates.cache = values.slice();

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();

              this.templates.byText[text] = values;

              // The text has been updated since the request was made.
              if (this.templates.snapshot !== text) return;

              callback(prepareValues(values, this.templates));
            }
          }
        },
      },
      tags: {
        trigger: '<',
        keepTextAfter: '>',
        searchOpts: {
          skip: true,
        },
        selectTemplate,
        values: (text, callback) => {
          const regexp = new RegExp('^' + mw.util.escapeRegExp(text), 'i');
          if (
            !text ||
            (!/^[a-z]+$/i.test(text) && !this.tags.withSpace.some((tag) => regexp.test(tag)))
          ) {
            callback([]);
            return;
          }
          const matches = this.tags.default.filter((tag) => regexp.test(tag));
          callback(prepareValues(matches, this.tags));
        },
      },
      commentLinks: {
        trigger: '[[#',
        requireLeadingSpace: true,
        selectTemplate,
        values: async (text, callback) => {
          if (!this.commentLinks.default) {
            this.commentLinks.default = [];
            this.commentLinks.comments.forEach((comment) => {
              let { anchor, author, timestamp, getText } = comment;
              getText = getText.bind(comment);
              let snippet;
              const snippetMaxLength = 80;
              if (getText().length > snippetMaxLength) {
                snippet = getText().slice(0, snippetMaxLength);
                const spacePos = snippet.lastIndexOf(mw.msg('word-separator'));
                if (spacePos !== -1) {
                  snippet = snippet.slice(0, spacePos);
                }
              } else {
                snippet = getText();
              }
              this.commentLinks.default.push({
                key: `${author.name}${mw.msg('comma-separator')}${timestamp}${mw.msg('colon-separator')}${snippet}`,
                anchor,
                author: author.name,
                timestamp,
              });
            });
          }

          text = removeDoubleSpaces(text);
          if (/[#<>[\]|{}]/.test(text)) {
            callback([]);
            return;
          }
          const matches = this.tribute.search
            .filter(text, this.commentLinks.default, { extract: (el) => el.key })
            .map((match) => match.original);
          callback(prepareValues(matches, this.commentLinks));
        },
      },
    };

    const params = {
      mentions: defaultUserNames,
      commentLinks: comments,
    };
    const collections = [];
    types.forEach((type) => {
      this[type] = Autocomplete[`get${firstCharToUpperCase(type)}Config`].call(null, params[type]);
      collections.push(collectionsByType[type]);
    });

    return collections;
  }

  /**
   * Get the mentions autocomplete configuration.
   *
   * @param {string[]} [defaultUserNames=[]]
   * @returns {object}
   * @private
   */
  static getMentionsConfig(defaultUserNames = []) {
    const config = {
      byText: {},
      cache: [],
      transform: (item) => {
        const name = item.trim();
        const user = userRegistry.getUser(name);
        const userNamespace = (
          cd.config.userNamespacesByGender?.[user.getGender()] ||
          mw.config.get('wgFormattedNamespaces')[2]
        );
        return `@[[${userNamespace}:${name}|${name}]]`;
      },
      removeSelf: (arr) => arr.filter((item) => item !== cd.g.CURRENT_USER_NAME),
    };
    config.default = config.removeSelf(defaultUserNames);

    return config;
  }

  /**
   * Get the wikilinks autocomplete configuration.
   *
   * @returns {object}
   * @private
   */
  static getWikilinksConfig() {
    return {
      byText: {},
      cache: [],
      transform: (name) => {
        name = name.trim();
        return `[[${name}]]`;
      },
    };
  }

  /**
   * Get the templates autocomplete configuration.
   *
   * @returns {object}
   * @private
   */
  static getTemplatesConfig() {
    return {
      byText: {},
      cache: [],
      transform: (name) => {
        name = name.trim();
        return `{{${name}}}`;
      },
      getEndOffset: () => 2,
    };
  }

  /**
   * Get the tags autocomplete configuration.
   *
   * @returns {object}
   * @private
   */
  static getTagsConfig() {
    const config = {
      default: [
        // See https://meta.wikimedia.org/wiki/Help:HTML_in_wikitext#Permitted_HTML,
        // https://en.wikipedia.org/wiki/Help:HTML_in_wikitext#Parser_and_extension_tags. Deprecated
        // tags are not included. An element can be an array of a string to display and a string to
        // insert, with "+" in the place where to put the caret.
        'abbr',
        'b',
        'bdi',
        'bdo',
        'blockquote',
        ['br', '<br>'],
        'caption',
        'cite',
        'code',
        ['codenowiki', '<code><nowiki>+</'.concat('nowiki></code>')],
        'data',
        'dd',
        'del',
        'dfn',
        'div',
        'dl',
        'dt',
        'em',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        ['hr', '<hr>'],
        'i',
        'ins',
        'kbd',
        'li',
        'link',
        'mark',
        'meta',
        'ol',
        'p',
        'pre',
        'q',
        'rp',
        'rt',
        'rtc',
        'ruby',
        's',
        'samp',
        'small',
        'span',
        'strong',
        'sub',
        'sup',
        'table',
        'td',
        'th',
        'time',
        'tr',
        'u',
        'ul',
        'var',
        ['wbr', '<wbr>'],
        'gallery',
        'includeonly',
        'noinclude',
        'nowiki',
        'onlyinclude',
        'categorytree',
        'charinsert',
        'chem',
        'ce',
        'graph',
        'hiero',
        'imagemap',
        'indicator',
        'inputbox',
        'mapframe',
        'maplink',
        'math',
        'math chem',
        'poem',
        'ref',
        ['references', '<references />'],
        'score',
        'section',
        'syntaxhighlight',
        ['syntaxhighlight lang=""', '<syntaxhighlight lang="+"></syntaxhighlight>'],
        'templatedata',
        ['templatestyles', '<templatestyles src="+" />'],
        'timeline',
      ],
      transform: (item) => (
        Array.isArray(item) ?
        item[1].replace(/\+/, '') :
        `<${item}></${item}>`
      ),
      getEndOffset: (item) => (
        Array.isArray(item) ?
        item[1].includes('+') ? item[1].length - 1 - item[1].indexOf('+') : 0 :
        item.length + 3
      ),
    };
    config.default.sort();
    config.withSpace = config.default.filter((tag) => tag.includes(' '));

    return config;
  }

  /**
   * Get the comment links autocomplete configuration.
   *
   * @param {string[]} [comments=[]]
   * @returns {object}
   * @private
   */
  static getCommentLinksConfig(comments = []) {
    const config = {
      comments,
      transform: ({ anchor, author, timestamp }) => (
        `[[#${anchor}|${cd.s('cf-mentions-commentlinktext', author, timestamp)}]]`
      ),
      getStartOffset: ({ anchor } = {}) => `[[#${anchor}|`.length,
      getEndOffset: () => 2,
    };

    return config;
  }

  /**
   * Search for a string in a list of values.
   *
   * @param {string} s
   * @param {string[]} list
   * @returns {string[]} Matched results.
   * @private
   */
  static search(s, list) {
    const containsRegexp = new RegExp(mw.util.escapeRegExp(s), 'i');
    const startsWithRegexp = new RegExp('^' + mw.util.escapeRegExp(s), 'i');
    return list
      .filter((item) => containsRegexp.test(item))
      .sort((item1, item2) => {
        const item1StartsWith = startsWithRegexp.test(item1);
        const item2StartsWith = startsWithRegexp.test(item2);
        if (item1StartsWith && !item2StartsWith) {
          return -1;
        } else if (item2StartsWith && !item1StartsWith) {
          return 1;
        } else {
          return 0;
        }
      });
  }
}
