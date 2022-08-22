import SectionStatic from './SectionStatic';
import Tribute from '../tribute/Tribute';
import cd from './cd';
import controller from './controller';
import settings from './settings';
import userRegistry from './userRegistry';
import {
  defined,
  focusInput,
  insertText,
  removeDoubleSpaces,
  underlinesToSpaces,
  unique,
} from './utils';
import {
  getRelevantPageNames,
  getRelevantTemplateNames,
  getRelevantUserNames,
  handleApiReject,
} from './apiWrappers';

/**
 * Search for a string in a list of values.
 *
 * @param {string} string
 * @param {string[]} list
 * @returns {string[]} Matched results.
 * @private
 */
function search(string, list) {
  const containsRegexp = new RegExp(mw.util.escapeRegExp(string), 'i');
  const startsWithRegexp = new RegExp('^' + mw.util.escapeRegExp(string), 'i');
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

/**
 * Autocomplete dropdown class.
 */
class Autocomplete {
  /**
   * Create an autocomplete instance. An instance is a set of settings and inputs to which these
   * settings apply.
   *
   * @param {object} options
   * @param {Array.<'mentions'|'commentLinks'|'wikilinks'|'templates'|'tags'>} options.types Which
   *   values should be autocompleted.
   * @param {external:OO.ui.TextInputWidget[]} options.inputs Inputs to attach the autocomplete to.
   * @param {string[]} [options.comments] List of comments in the section for the mentions and
   *   comment links autocomplete.
   * @param {string[]} [options.defaultUserNames] Default list of user names for the mentions
   *   autocomplete.
   */
  constructor({ types, inputs, comments, defaultUserNames }) {
    types = types
      // The "mentions" type is needed in any case as it can be triggered from the toolbar. When it
      // is not, we will suppress it specifically.
      .filter((type) => settings.get('autocompleteTypes').includes(type) || type === 'mentions');

    const collections = this.getCollections(types, comments, defaultUserNames);

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
      textDirection: cd.g.contentTextDirection,
    });

    /**
     * Inputs that have the autocomplete attached.
     *
     * @type {external:OO.ui.TextInputWidget[]}
     * @private
     */
    this.inputs = inputs;
  }

  /**
   * Initialize autocomplete for the inputs.
   */
  init() {
    require('../tribute/tribute.less');

    this.inputs.forEach((input) => {
      const element = input.$input.get(0);
      this.tribute.attach(element);
      element.cdInput = input;
      element.addEventListener('tribute-active-true', () => {
        controller.setActiveAutocompleteMenu(this.tribute.menu);
      });
      element.addEventListener('tribute-active-false', () => {
        controller.forgetActiveAutocompleteMenu();
      });
      if (input instanceof OO.ui.MultilineTextInputWidget) {
        input.on('resize', () => {
          this.tribute.menuEvents.windowResizeEvent?.();
        });
      }
    });
  }

  /**
   * Clean up event handlers.
   */
  cleanUp() {
    this.inputs.forEach((input) => {
      this.tribute.detach(input.$input.get(0));
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
    const selectTemplate = (item) => item ? item.original.transform(item.original.item) : '';
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
          const transform = config.transform;
          return { key, item, transform };
        })
    );

    const spacesRegexp = new RegExp(cd.mws('word-separator', { language: 'content' }), 'g');

    const collectionsByType = {
      mentions: {
        label: cd.s('cf-autocomplete-mentions-label'),
        trigger: cd.config.mentionCharacter,
        searchOpts: { skip: true },
        requireLeadingSpace: cd.config.mentionRequiresLeadingSpace,
        selectTemplate,
        values: async (text, callback) => {
          if (
            !settings.get('autocompleteTypes').includes('mentions') &&
            !this.tribute.current.externalTrigger
          ) {
            return;
          }

          text = removeDoubleSpaces(text);

          if (!text.startsWith(this.mentions.snapshot)) {
            this.mentions.cache = [];
          }
          this.mentions.snapshot = text;

          if (this.mentions.byText[text]) {
            callback(prepareValues(this.mentions.byText[text], this.mentions));
          } else {
            const matches = search(text, this.mentions.default);
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
              // request is made only if there are no matches in the section; if there are,
              // `this.mentions.cache` is an empty array).
              if (!matches.length) {
                values.push(...this.mentions.cache);
              }
              values = search(text, values);

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.mentions));

            if (makeRequest && !matches.length) {
              let values;
              try {
                values = await getRelevantUserNames(text);
              } catch {
                return;
              }

              // Type "[[Text", then delete and type "<s" quickly.
              if (!this.tribute.current || this.tribute.current.trigger !== '@') return;

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

      commentLinks: {
        label: cd.s('cf-autocomplete-commentlinks-label'),
        trigger: '[[#',
        keepAsEnd: /^\]\]/,
        selectTemplate,
        values: async (text, callback) => {
          if (!this.commentLinks.default) {
            this.commentLinks.default = [];
            this.commentLinks.comments.forEach((comment) => {
              let { id, dtId, author, timestamp } = comment;
              let snippet;
              const snippetMaxLength = 80;
              if (comment.getText().length > snippetMaxLength) {
                snippet = comment.getText().slice(0, snippetMaxLength);
                const wordSeparator = cd.mws('word-separator', { language: 'content' });
                const spacePos = snippet.lastIndexOf(wordSeparator);
                if (spacePos !== -1) {
                  snippet = snippet.slice(0, spacePos);
                  const lastChar = snippet[snippet.length - 1];
                  if (/[.…,;!?:-—–]/.test(lastChar)) {
                    snippet += ' ';
                  }
                  snippet += cd.s('ellipsis');
                }
              } else {
                snippet = comment.getText();
              }
              let authorTimestamp = author.getName();
              if (timestamp) {
                authorTimestamp += cd.mws('comma-separator', { language: 'content' }) + timestamp;
              }
              const colon = cd.mws('colon-separator', { language: 'content' });
              const key = authorTimestamp + colon + snippet;
              this.commentLinks.default.push({
                key,
                id: dtId || id,
                author: author.getName(),
                timestamp,
              });
            });
            SectionStatic.getAll().forEach((section) => {
              this.commentLinks.default.push({
                key: underlinesToSpaces(section.id),
                id: underlinesToSpaces(section.id),
                headline: section.headline,
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

      wikilinks: {
        label: cd.s('cf-autocomplete-wikilinks-label'),
        trigger: '[[',
        keepAsEnd: /^(?:\||\]\])/,
        searchOpts: { skip: true },
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
              !/[#<>[\]|{}]/.test(text) &&

              // Interwikis
              !(
                (/^:/.test(text) || /^[a-z]\w*:/.test(text)) &&
                !cd.g.allNamespacesRegexp.test(text)
              )
            );
            if (valid) {
              values.push(...this.wikilinks.cache);
              values = search(text, values);

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.wikilinks));

            if (valid) {
              let values;
              try {
                values = await getRelevantPageNames(text);
              } catch (e) {
                return;
              }

              // Type "[[Text", then delete and type "<s" quickly.
              if (!this.tribute.current || this.tribute.current.trigger !== '[[') return;

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
        label: cd.s('cf-autocomplete-templates-label'),
        trigger: '{{',
        keepAsEnd: /^(?:\||\}\})/,
        searchOpts: { skip: true },
        selectTemplate: (item, event) => {
          if (item) {
            if (settings.get('useTemplateData') && event.shiftKey && !event.altKey) {
              const input = this.tribute.current.element.cdInput;

              setTimeout(() => {
                input.setDisabled(true);
                input.pushPending();

                controller.getApi().get({
                  action: 'templatedata',
                  titles: `Template:${item.original.key}`,
                  redirects: true,
                })
                  .then(
                    (resp) => {
                      if (!resp.pages) {
                        throw 'No data.';
                      } else if (!Object.keys(resp.pages).length) {
                        throw 'Template missing.';
                      } else {
                        return resp;
                      }
                    },
                    handleApiReject
                  )
                  .then(
                    (resp) => {
                      const pages = resp.pages;

                      let paramsString = '';
                      let firstValueIndex = 0;
                      Object.keys(pages).forEach((key) => {
                        const template = pages[key];
                        const params = template.params || [];
                        const paramNames = template.paramOrder || Object.keys(params);
                        paramNames
                          .filter((param) => params[param].required || params[param].suggested)
                          .forEach((param) => {
                            if (template.format === 'block') {
                              paramsString += `\n| ${param} = `;
                            } else {
                              if (isNaN(param)) {
                                paramsString += `|${param}=`;
                              } else {
                                paramsString += `|`;
                              }
                            }
                            firstValueIndex ||= paramsString.length;
                          });
                        if (template.format === 'block' && paramsString) {
                          paramsString += '\n';
                        }
                      });

                      // Remove leading "|".
                      paramsString = paramsString.slice(1);

                      input.setDisabled(false);

                      const caretIndex = input.getRange().to;
                      insertText(input, paramsString);
                      input.selectRange(caretIndex + firstValueIndex - 1);
                    },
                    () => {
                      input.setDisabled(false);
                      focusInput(input);
                    }
                  )
                  .always(() => {
                    input.popPending();
                  });
              });
            }

            return item.original.transform(item.original.item);
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
              values = search(text, values);

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.templates));

            if (makeRequest) {
              let values;
              try {
                values = await getRelevantTemplateNames(text);
              } catch {
                return;
              }

              // Type "{{Text", then delete and type "<s" quickly.
              if (!this.tribute.current || this.tribute.current.trigger !== '{{') return;

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
        label: cd.s('cf-autocomplete-tags-label'),
        trigger: '<',
        keepAsEnd: /^>/,
        replaceEnd: false,
        searchOpts: { skip: true },
        selectTemplate,
        values: (text, callback) => {
          const regexp = new RegExp('^' + mw.util.escapeRegExp(text), 'i');
          if (!text || !/^[a-z]+$/i.test(text)) {
            callback([]);
            return;
          }
          const matches = this.tags.default.filter((tag) => regexp.test(tag));
          callback(prepareValues(matches, this.tags));
        },
      },
    };

    const params = {
      mentions: defaultUserNames,
      commentLinks: comments,
    };
    const collections = types.map((type) => {
      this[type] = Autocomplete.getConfig(type, params[type]);
      return collectionsByType[type];
    });

    return collections;
  }

  /**
   * _For internal use._ Get an autocomplete configuration for the specified type.
   *
   * @param {string} type
   * @param {...*} args
   * @returns {object}
   */
  static getConfig(type, ...args) {
    let config;
    switch (type) {
      case 'mentions': {
        config = {
          byText: {},
          cache: [],
          default: args[0],
          transform: (item) => {
            const name = item.trim();
            const user = userRegistry.get(name);
            const userNamespace = user.getNamespaceAlias();
            const pageName = user.isRegistered() ?
              `${userNamespace}:${name}` :
              `${cd.g.contribsPage}/${name}`;
            return {
              start: `@[[${pageName}|`,
              end: ']]',
              content: name,
              skipContentCheck: (data) => !data.start.includes('/'),
              cmdModify: function () {
                this.end += cd.mws('colon-separator', { language: 'content' });
              },
            };
          },
        };
        break;
      }

      case 'commentLinks': {
        config = {
          comments: args[0] || [],
          transform: ({ id, author, timestamp, headline }) => ({
            start: `[[#${id}|`,
            end: ']]',
            content: timestamp ?
              cd.s('cf-autocomplete-commentlinks-text', author, timestamp) :
              headline,
          }),
        };
        break;
      }

      case 'wikilinks': {
        config = {
          byText: {},
          cache: [],
          transform: (name) => {
            name = name.trim();
            return {
              start: '[[' + name,
              end: ']]',
              name,
              shiftModify: function () {
                this.start += '|';
                this.content = this.name;
              },
            };
          },
        };
        break;
      }

      case 'templates': {
        config = {
          byText: {},
          cache: [],
          transform: (name) => {
            name = name.trim();
            return {
              start: '{{' + name,
              end: '}}',
              name,
              shiftModify: function () {
                this.start += '|';
              },
            };
          },
        };
        break;
      }

      case 'tags': {
        const tagAdditions = [
          // An element can be an array of a string to display and strings to insert before and
          // after the caret.
          ['br', '<br>'],
          ['codenowiki', '<code><nowiki>', '</'.concat('nowiki></code>')],
          ['hr', '<hr>'],
          ['wbr', '<wbr>'],
          ['gallery', '<gallery>\n', '\n</gallery>'],
          ['references', '<references />'],
          ['section', '<section />'],
          ['syntaxhighlight', '<syntaxhighlight>\n', '\n</syntaxhighlight>'],
          [
            'syntaxhighlight inline lang=""',
            '<syntaxhighlight inline lang="', '"></syntaxhighlight>',
          ],
          ['syntaxhighlight lang=""', '<syntaxhighlight lang="', '">\n\n</syntaxhighlight>'],
          ['templatestyles', '<templatestyles src="', '" />'],
        ];
        const defaultTags = cd.g.allowedTags.filter((tagString) => !(
          tagAdditions.find((tagArray) => tagArray[0] === tagString)
        ));

        config = {
          default: defaultTags.concat(tagAdditions),
          transform: (item) => ({
            start: Array.isArray(item) ? item[1] : `<${item}>`,
            end: Array.isArray(item) ? item[2] : `</${item}>`,
            typeContent: true,
          }),
        };
        config.default.sort((item1, item2) => {
          const s1 = typeof item1 === 'string' ? item1 : item1[0];
          const s2 = typeof item2 === 'string' ? item2 : item2[0];
          return s1 > s2;
        });
        break;
      }
    }

    return config;
  }
}

export default Autocomplete;
