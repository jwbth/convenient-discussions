
import CdError from './CdError';
import cd from './cd';
import controller from './controller';
import sectionRegistry from './sectionRegistry';
import settings from './settings';
import Tribute from './tribute/Tribute';
import userRegistry from './userRegistry';
import { handleApiReject } from './utils-api';
import { charAt, defined, phpCharToUpper, removeDoubleSpaces, sleep, ucFirst, underlinesToSpaces, unique } from './utils-general';

/**
 * @typedef {'mentions'|'commentLinks'|'wikilinks'|'templates'|'tags'} AutocompleteType
 */

/**
 * @typedef {NonNullable<Autocomplete.config>} AutocompleteStaticConfig
 */

/**
 * @typedef {object} AutocompleteConfig
 * @property {{ [key: string]: string[] }} [byText]
 * @property {string[]} [cache]
 * @property {any[] | (() => any[])} [default]
 * @property {(value: any) => import('./tribute/Tribute').TransformData} [transform]
 * @property {import('./Comment').default[]} [comments]
 * @property {string} [snapshot]
 * @property {any} [item]
 */

/**
 * Autocomplete dropdown class.
 */
class Autocomplete {
  /**
   * @type {AutocompleteConfig & AutocompleteStaticConfig['mentions']}
   */
  mentions;

  /**
   * @type {AutocompleteConfig & AutocompleteStaticConfig['commentLinks']}
   */
  commentLinks;

  /**
   * @type {AutocompleteConfig & AutocompleteStaticConfig['wikilinks']}
   */
  wikilinks;

  /**
   * @type {AutocompleteConfig & AutocompleteStaticConfig['templates']}
   */
  templates;

  /**
   * @type {AutocompleteConfig & AutocompleteStaticConfig['tags']}
   */
  tags;

  /**
   * Create an autocomplete instance. An instance is a set of settings and inputs to which these
   * settings apply.
   *
   * @param {object} options
   * @param {AutocompleteType[]} options.types Which values should be autocompleted.
   * @param {OO.ui.TextInputWidget[]} options.inputs Inputs to attach the autocomplete to. Please
   *   note that these should be CD's {@link TextInputWidget}s, not
   *   {@link OO.ui.TextInputWidget OO.ui.TextInputWidget}s, since we use CD's method
   *   {@link TextInputWidget#cdInsertContent} on the inputs here. This is not essential, so if you
   *   borrow the source code, you can replace it with native
   *   {@link OO.ui.TextInputWidget#insertContent OO.ui.TextInputWidget#insertContent}.
   * @param {import('./Comment').default[]} [options.comments] List of comments in the section for
   *   the mentions and comment links autocomplete.
   * @param {string[]} [options.defaultUserNames] Default list of user names for the mentions
   *   autocomplete.
   */
  constructor({ types, inputs, comments: comments, defaultUserNames }) {
    this.types = settings.get('autocompleteTypes');
    this.useTemplateData = settings.get('useTemplateData');

    // The `mentions` type is needed in any case as it can be triggered from the toolbar. When it is
    // not, we will suppress it specifically.
    types = types.filter((type) => this.types.includes(type) || type === 'mentions');

    /**
     * {@link https://github.com/zurb/tribute Tribute} object.
     *
     * @type {Tribute}
     */
    this.tribute = new Tribute({
      collection: this.getCollections(types, comments, defaultUserNames),
      allowSpaces: true,
      menuItemLimit: 10,
      noMatchTemplate: () => null,
      containerClass: 'tribute-container cd-autocompleteContainer',
      replaceTextSuffix: '',
      direction: cd.g.contentDirection,
    });

    /**
     * Inputs that have the autocomplete attached.
     *
     * @type {OO.ui.TextInputWidget[]}
     * @private
     */
    this.inputs = inputs;
  }

  /**
   * Initialize autocomplete for the inputs.
   */
  init() {
    require('./tribute/tribute.less');

    this.inputs.forEach((input) => {
      const element = input.$input[0];
      this.tribute.attach(element);
      element.cdInput = input;
      element.addEventListener('tribute-active-true', () => {
        Autocomplete.activeMenu = this.tribute.menu;
      });
      element.addEventListener('tribute-active-false', () => {
        delete Autocomplete.activeMenu;
      });
      if (input instanceof OO.ui.MultilineTextInputWidget) {
        input.on('resize', () => {
          // @ts-ignore
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
      this.tribute.detach(input.$input[0]);
    });
  }

  /**
   * @typedef {{ [key in AutocompleteType]: import('./tribute/Tribute').TributeCollection }} CollectionsByType
   */

  /**
   * @template {any} [T=any]
   * @typedef {object} Value
   * @property {string} key
   * @property {T} item
   * @property {(() => import('./tribute/Tribute').TransformData) | undefined} transform
   */

  /**
   * Get the list of collections of specified types.
   *
   * @param {AutocompleteType[]} types
   * @param {import('./Comment').default[]} [comments]
   * @param {string[]} [defaultUserNames]
   * @returns {import('./tribute/Tribute').TributeCollection[]}
   * @private
   */
  getCollections(types, comments, defaultUserNames) {
    const selectTemplate = (/** @type {import('./tribute/Tribute').TributeItem} */ item) =>
      item ? item.original.transform() : '';
    const prepareValues = (/** @type {any[]} */ arr, /** @type {AutocompleteConfig} */ config) =>
      arr
        .filter(defined)
        .filter(unique)
        .map((item) => {
          let /** @type {string} */ key;
          if (Array.isArray(item)) {
            // Tags
            key = item[0];
          } else if ('key' in item) {
            // Comment links
            key = item.key;
          } else {
            // The rest
            key = item;
          }

          return /** @type {Value} */ ({
            key,
            item,
            transform: config.transform?.bind(config),
          });
        });

    const spacesRegexp = new RegExp(cd.mws('word-separator', { language: 'content' }), 'g');
    const allNssPattern = Object.keys(mw.config.get('wgNamespaceIds')).filter((ns) => ns).join('|');
    const allNamespacesRegexp = new RegExp(`^:?(?:${allNssPattern}):`, 'i');

    const collectionsByType = /** @satisfies {CollectionsByType} */ ({
      mentions: {
        label: cd.s('cf-autocomplete-mentions-label'),
        trigger: cd.config.mentionCharacter,
        searchOpts: { skip: true },
        requireLeadingSpace: cd.config.mentionRequiresLeadingSpace,
        selectTemplate,
        values: async (text, callback) => {
          if (!this.types.includes('mentions') && !this.tribute.current.externalTrigger) return;

          text = removeDoubleSpaces(text);

          if (this.mentions.snapshot && !text.startsWith(this.mentions.snapshot)) {
            this.mentions.cache = [];
          }
          this.mentions.snapshot = text;

          if (this.mentions.byText[text]) {
            callback(prepareValues(this.mentions.byText[text], this.mentions));
          } else {
            const matches = Autocomplete.search(
              text,
              /** @type {string[]} */ (this.mentions.default)
            );
            let values = matches.slice();

            const makeRequest = (
              text &&
              text.length <= 85 &&
              !/[#<>[\]|{}/@:]/.test(text) &&

              // 5 spaces in a user name seem too many. "Jack who built the house" has 4 :-)
              (text.match(spacesRegexp) || []).length <= 4
            );

            if (makeRequest) {
              // Logically, either `matched` or this.mentions.cache should have a zero length (a
              // request is made only if there are no matches in the section; if there are,
              // this.mentions.cache is an empty array).
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
                values = await Autocomplete.getRelevantUserNames(text);
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
              /** @type {NonNullable<typeof this.commentLinks.default>} */ (
                this.commentLinks.default
              ).push({
                key,
                id: dtId || id,
                author: author.getName(),
                timestamp,
              });
            });
            sectionRegistry.getAll().forEach((section) => {
              /** @type {NonNullable<typeof this.commentLinks.default>} */ (
                this.commentLinks.default
              ).push({
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

          // @ts-ignore
          const matches = this.tribute.search
            .filter(text, this.commentLinks.default, {
              extract: (/** @type {Value} */ el) => el.key,
            })
            .map((/** @type {import('./tribute/Tribute').TributeItem} */ match) => match.original);
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

          if (this.wikilinks.snapshot && !text.startsWith(this.wikilinks.snapshot)) {
            this.wikilinks.cache = [];
          }
          this.wikilinks.snapshot = text;

          if (this.wikilinks.byText[text]) {
            callback(prepareValues(this.wikilinks.byText[text], this.wikilinks));
          } else {
            /** @type {string[]} */
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
              !((/^:/.test(text) || /^[a-z-]\w*:/.test(text)) && !allNamespacesRegexp.test(text))
            );
            if (valid) {
              values.push(...this.wikilinks.cache);
              values = Autocomplete.search(text, values);

              // Make the typed text always appear on the last, 10th place.
              values[9] = text.trim();
            }

            callback(prepareValues(values, this.wikilinks));

            if (valid) {
              let values;
              try {
                values = await Autocomplete.getRelevantPageNames(text);
              } catch {
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
            if (this.useTemplateData && event.shiftKey && !event.altKey) {
              const input = this.tribute.current.element.cdInput;

              setTimeout(() => {
                input
                  .setDisabled(true)
                  .pushPending();

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

                      const caretIndex = input.getRange().to;
                      input
                        .setDisabled(false)
                        .cdInsertContent(paramsString)
                        .selectRange(caretIndex + firstValueIndex - 1);
                    },
                    () => {
                      input
                        .setDisabled(false)
                        .focus();
                    }
                  )
                  .always(() => {
                    input.popPending();
                  });
              });
            }

            return item.original.transform();
          } else {
            return '';
          }
        },
        values: async (text, callback) => {
          text = removeDoubleSpaces(text);

          if (this.templates.snapshot && !text.startsWith(this.templates.snapshot)) {
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
            /** @type {string[]} */
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
                values = await Autocomplete.getRelevantTemplateNames(text);
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

          const matches = /** @type {string[]} */ (this.tags.default).filter((tag) =>
            regexp.test(tag)
          );
          callback(prepareValues(matches, this.tags));
        },
      },
    });

    types.forEach((type) => {
      /** @type {typeof this[type]} */ (this[type]) = /** @type {typeof this[type]} */ (
        OO.copy(/** @type {NonNullable<Autocomplete.config>} */ (Autocomplete.config)[type])
      );
    });

    this.mentions.default = defaultUserNames;
    this.commentLinks.comments = comments || [];

    return types.map((type) => collectionsByType[type]);
  }

  static delay = 100;

  /** @type {HTMLElement|undefined} */
  static activeMenu;

  /**
   * @typedef {object} CommentLinksItemType
   * @property {string} key
   * @property {string} [id]
   * @property {string} [author]
   * @property {string} [timestamp]
   * @property {string} [headline]
   */

  static {
    const tagAdditions = [
      // An element can be an array of a string to display and strings to insert before and after
      // the caret.
      ['br', '<br>'],
      ['codenowiki', '<code><nowiki>', '</'.concat('nowiki></code>')],
      ['hr', '<hr>'],
      ['wbr', '<wbr>'],
      ['gallery', '<gallery>\n', '\n</gallery>'],
      ['references', '<references />'],
      ['section', '<section />'],
      ['syntaxhighlight lang=""', '<syntaxhighlight lang="', '">\n\n</syntaxhighlight>'],
      [
        'syntaxhighlight inline lang=""',
        '<syntaxhighlight inline lang="', '"></syntaxhighlight>',
      ],
      ['syntaxhighlight', '<syntaxhighlight>\n', '\n</syntaxhighlight>'],
      ['templatestyles', '<templatestyles src="', '" />'],
    ];
    const getDefaultTags = () =>
      /** @type {Array<string|string[]>} */ (cd.g.allowedTags)
        .filter(
          (tagString) => !tagAdditions.find((tagArray) => tagArray[0] === tagString)
        )
        .concat(tagAdditions)
        .sort((item1, item2) => {
          const s1 = typeof item1 === 'string' ? item1 : item1[0];
          const s2 = typeof item2 === 'string' ? item2 : item2[0];

          return s1 > s2 ? 1 : -1;
        });

    /**
     * Autocomplete configurations for every type.
     */
    this.config = /** @satisfies {{ [key in AutocompleteType]: AutocompleteConfig }} */ ({
      mentions: {
        byText: {},
        cache: /** @type {string[]} */ ([]),

        /**
         * @this {Value<string>}
         * @returns {import('./tribute/Tribute').TransformData}
         */
        transform() {
          const name = this.item.trim();
          const user = userRegistry.get(name);
          const userNamespace = user.getNamespaceAlias();
          const pageName = user.isRegistered()
            ? `${userNamespace}:${name}`
            : `${cd.g.contribsPages[0]}/${name}`;

          return {
            start: `@[[${pageName}|`,
            end: name.match(/[(,]/) ? `${name}]]` : ']]',
            content: name,
            usePipeTrickCheck() {
              return !this.start.includes('/');
            },
            cmdModify() {
              this.end += cd.mws('colon-separator', { language: 'content' });
            },
          };
        },
      },

      commentLinks: {
        comments: /** @type {import('./Comment').default[]} */ ([]),
        default: /** @type {CommentLinksItemType[]|undefined} */ (undefined),

        /**
         * @this {Value<CommentLinksItemType>}
         * @returns {import('./tribute/Tribute').TransformData}
         */
        transform() {
          const object = this.item;

          return {
            start: `[[#${object.id}|`,
            end: ']]',
            content:
              'timestamp' in object
                ? cd.s('cf-autocomplete-commentlinks-text', object.author, object.timestamp)
                : object.headline,
          };
        },
      },

      wikilinks: {
        byText: {},
        cache: /** @type {string[]} */ ([]),

        /**
         * @this {Value<string>}
         * @returns {import('./tribute/Tribute').TransformData}
         */
        transform() {
          const name = this.item.trim();

          return {
            start: '[[' + name,
            end: ']]',
            name,
            shiftModify() {
              this.start += '|';
              this.content = this.name;
            },
          };
        },
      },

      templates: {
        byText: {},
        cache: /** @type {string[]} */ ([]),

        /**
         * @this {Value<string>}
         * @returns {import('./tribute/Tribute').TransformData}
         */
        transform() {
          const name = this.item.trim();

          return {
            start: '{{' + name,
            end: '}}',
            name,
            shiftModify() {
              this.start += '|';
            },
          };
        },
      },

      tags: {
        default: getDefaultTags,

        /**
         * @this {Value<string | [string, string, string]>}
         * @returns {import('./tribute/Tribute').TransformData}
         */
        transform() {
          const item = this.item;

          return {
            start: Array.isArray(item) ? item[1] : `<${item}>`,
            end: Array.isArray(item) ? item[2] : `</${item}>`,
            enterContent: true,
          };
        },
      },
    });
  }

  /**
   * Get the active autocomplete menu element.
   *
   * @returns {Element|undefined}
   */
  static getActiveMenu() {
    return this.activeMenu;
  }

  /**
   * Get a list of 10 user names matching the specified search text. User names are sorted as
   * {@link https://www.mediawiki.org/wiki/API:Opensearch OpenSearch} sorts them. Only users with a
   * talk page existent are included. Redirects are resolved.
   *
   * Reuses the existing request if available.
   *
   * @param {string} text
   * @returns {Promise.<string[]>}
   * @throws {CdError}
   */
  static getRelevantUserNames(text) {
    text = ucFirst(text);
    // eslint-disable-next-line no-async-promise-executor
    const promise = new Promise(async (resolve, reject) => {
      await sleep(this.delay);
      try {
        if (promise !== this.currentPromise) {
          throw new CdError();
        }

        /**
         * @typedef {[string, string[], string[], string[]]} OpenSearchResults
         */

        // First, try to use the search to get only users that have talk pages. Most legitimate
        // users do, while spammers don't.
        const request = controller.getApi().get({
          action: 'opensearch',
          search: text,
          namespace: 3,
          redirects: 'resolve',
          limit: 10,
        }).catch(handleApiReject);
        const response = /** @type {OpenSearchResults} */ (await request);

        const users = response[1]
          ?.map((name) => (name.match(cd.g.userNamespacesRegexp) || [])[1])
          .filter(defined)
          .filter((name) => !name.includes('/'));

        if (users.length) {
          resolve(users);
        } else {
          // If we didn't succeed with search, try the entire users database.
          const request = controller.getApi().get({
            action: 'query',
            list: 'allusers',
            auprefix: text,
          }).catch(handleApiReject);
          const response = /** @type {ApiResponseQuery<ApiResponseQueryContentAllUsers>} */ (
            await request
          );
          if (!response.query) return;

          const users = response.query.allusers.map((user) => user.name);
          resolve(users);
        }
      } catch (e) {
        reject(e);
      }
    });
    this.currentPromise = promise;

    return promise;
  }

  /**
   * Given a query and a case-insensitively matching result, replace the first character of the
   * result with the first character of in the query. E.g., the query "huma" finds the article
   * "Human", but we restore the first "h".
   *
   * @param {string} result
   * @param {string} query
   * @returns {string}
   */
  static useOriginalFirstCharCase(result, query) {
    const firstChar = charAt(query, 0);
    const firstCharUpperCase = phpCharToUpper(firstChar);
    const firstCharPattern = firstCharUpperCase !== firstChar ?
      '[' + firstCharUpperCase + firstChar + ']' :
      mw.util.escapeRegExp(firstChar);

    // But ignore cases with all caps in the first word like ABBA
    const firstWord = result.split(' ')[0];
    if (firstWord.length > 1 && firstWord.toUpperCase() === firstWord) {
      return result;
    }

    return result.replace(new RegExp('^' + firstCharPattern), firstChar);
  }

  /**
   * Get a list of 10 page names matching the specified search text. Page names are sorted as
   * {@link https://www.mediawiki.org/wiki/API:Opensearch OpenSearch} sorts them. Redirects are not
   * resolved.
   *
   * Reuses the existing request if available.
   *
   * @param {string} text
   * @returns {Promise.<string[]>}
   * @throws {CdError}
   */
  static getRelevantPageNames(text) {
    let colonPrefix = false;
    if (cd.g.colonNamespacesPrefixRegexp.test(text)) {
      text = text.slice(1);
      colonPrefix = true;
    }

    // eslint-disable-next-line no-async-promise-executor
    const promise = new Promise(async (resolve, reject) => {
      await sleep(this.delay);
      try {
        if (promise !== this.currentPromise) {
          throw new CdError();
        }

        controller.getApi().get({
          action: 'opensearch',
          search: text,
          redirects: 'return',
          limit: 10,
        }).then(
          (resp) => {
            const pages = resp[1]
              ?.map((name) => {
                if (mw.config.get('wgCaseSensitiveNamespaces').length) {
                  const title = mw.Title.newFromText(name);
                  if (
                    !title ||
                    !mw.config.get('wgCaseSensitiveNamespaces').includes(title.getNamespaceId())
                  ) {
                    name = this.useOriginalFirstCharCase(name, text);
                  }
                } else {
                  name = this.useOriginalFirstCharCase(name, text);
                }
                return name.replace(/^/, colonPrefix ? ':' : '');
              });

            resolve(pages);
          },
          (e) => {
            handleApiReject(e);
          }
        );
      } catch (e) {
        reject(e);
      }
    });
    this.currentPromise = promise;

    return promise;
  }

  /**
   * Get a list of 10 template names matching the specified search text. Template names are sorted as
   * {@link https://www.mediawiki.org/wiki/API:Opensearch OpenSearch} sorts them. Redirects are not
   * resolved.
   *
   * Reuses the existing request if available.
   *
   * @param {string} text
   * @returns {Promise.<string[]>}
   * @throws {CdError}
   */
  static getRelevantTemplateNames(text) {
    // eslint-disable-next-line no-async-promise-executor
    const promise = new Promise(async (resolve, reject) => {
      await sleep(this.delay);
      try {
        if (promise !== this.currentPromise) {
          throw new CdError();
        }

        controller.getApi().get({
          action: 'opensearch',
          search: text.startsWith(':') ? text.slice(1) : 'Template:' + text,
          redirects: 'return',
          limit: 10,
        }).then(
          (resp) => {
            cd.debug.startTimer('getRelevantTemplateNames');
            const templates = resp[1]
              ?.filter((name) => !/(\/doc(?:umentation)?|\.css)$/.test(name))
              .map((name) => text.startsWith(':') ? name : name.slice(name.indexOf(':') + 1))
              .map((name) => (
                mw.config.get('wgCaseSensitiveNamespaces').includes(10) ?
                  name :
                  this.useOriginalFirstCharCase(name, text)
              ));
            cd.debug.logAndResetEverything();

            resolve(templates);
          },
          (e) => {
            handleApiReject(e);
          }
        );
      } catch (e) {
        reject(e);
      }
    });
    this.currentPromise = promise;

    return promise;
  }

  /**
   * Search for a string in a list of values.
   *
   * @param {string} string
   * @param {string[]} list
   * @returns {string[]} Matched results.
   * @private
   */
  static search(string, list) {
    const containsRegexp = new RegExp(mw.util.escapeRegExp(string), 'i');
    const startsWithRegexp = new RegExp('^' + mw.util.escapeRegExp(string), 'i');
    return list
      .filter((item) => containsRegexp.test(item))
      .sort(
        (item1, item2) =>
          Number(startsWithRegexp.test(item2)) - Number(startsWithRegexp.test(item1))
      );
  }
}

export default Autocomplete;
