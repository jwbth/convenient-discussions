/**
 * Module that serves as an entry point.
 *
 * @module app
 */

// Import polyfills for a bunch of ES2022+ features
import '../shared/polyfills';

import './convenientDiscussions';

import defaultConfig from '../../config/default';
import configUrls from '../../config/urls.json';
import i18nList from '../../data/i18nList.json';
import languageFallbacks from '../../data/languageFallbacks.json';
import en from '../../i18n/en.json';
import { mergeRegexps, typedKeysOf, unique } from '../shared/utils-general';
import { getFooter } from '../utils-window';

import cd from './cd';
import debug from './debug';
import { getValidLanguageOrFallback } from './utils-global';

/** @type {typeof import('../../config/default').default} */
let config;

if (SINGLE_LANG_CODE) {
  if (SINGLE_CONFIG_FILE_NAME) {
    try {
      config = (await import(`../config/${SINGLE_CONFIG_FILE_NAME}`)).default;
    } catch {
      // Empty
    }
  }

  // A copy of the function in misc/utils.js. If altering it, make sure they are synchronized.
  const replaceEntities = (/** @type {string} */ string) => (
    string
      .replace(/&nbsp;/g, '\u00A0')
      .replace(/&#32;/g, ' ')
      .replace(/&rlm;/g, '\u200F')
      .replace(/&lrm;/g, '\u200E')
  );

  cd.i18n = (/** @type {I18n} */ { en });
  typedKeysOf(cd.i18n.en).forEach((name) => {
    cd.i18n.en[name] = replaceEntities(cd.i18n.en[name]);
  });
  if (SINGLE_LANG_CODE !== 'en') {
    cd.i18n[SINGLE_LANG_CODE] = await import(`../i18n/${SINGLE_LANG_CODE}.json`);
    const langObj = cd.i18n[SINGLE_LANG_CODE];
    Object.keys(cd.i18n[SINGLE_LANG_CODE])
      .filter((name) => typeof langObj[name] === 'string')
      .forEach((name) => {
        langObj[name] = replaceEntities(langObj[name]);
      });
    langObj.dayjsLocale = await import(`dayjs/locale/${SINGLE_LANG_CODE}`);
    langObj.dateFnsLocale = await import(`date-fns/locale/${SINGLE_LANG_CODE}`);
  }
}

loader();

/**
 * The main loader function.
 *
 * @fires launched
 * @private
 */
async function loader() {
  if (cd.isRunning) {
    console.warn('One instance of Convenient Discussions is already running.');

    return;
  }

  /**
   * Is the script running.
   *
   * @name isRunning
   * @type {boolean}
   * @memberof convenientDiscussions
   */
  cd.isRunning = true;

  if (
    mw.config.get('wgMFMode') ||
    /[?&]cdenable=(0|false|no|n)(?=&|$)/.test(location.search) ||
    mw.config.get('wgPageContentModel') !== 'wikitext' ||

    // Liquid Threads; for example,
    // https://en.wiktionary.org/wiki/MediaWiki_talk:Gadget-NewEntryWizard.js/LQT_Archive
    $('.lqt-talkpage').length ||

    mw.config.get('wgIsMainPage')
  ) {
    return;
  }

  if (SINGLE_CONFIG_FILE_NAME) {
    cd.config = config;
  }

  cd.g = /** @type {import('../shared/cd').GlobalProps} */ ({});

  debug.init();
  debug.startTimer('total time');
  debug.startTimer('load config and strings');

  /**
   * The script has launched.
   *
   * @event launched
   * @param {object} cd {@link convenientDiscussions} object.
   * @global
   */
  mw.hook('convenientDiscussions.launched').fire(cd);

  setLanguages();

  try {
    await Promise.all([
      (/** @type {any} */ (cd).config) ? Promise.resolve() : getConfig(),
      getStringsPromise(),
    ]);
  } catch (error) {
    console.error(error);

    return;
  }

  debug.stopTimer('load config and strings');

  $(go);
}

/**
 * Set language properties of the global object, taking fallback languages into account.
 *
 * @private
 */
function setLanguages() {
  const getLanguageOrFallback = (/** @type {string} */ lang) =>
    getValidLanguageOrFallback(lang, (l) => i18nList.includes(l), languageFallbacks);

  cd.g.userLanguage = getLanguageOrFallback(mw.config.get('wgUserLanguage'));

  // Should we use a fallback for the content language? Maybe, but in case of MediaWiki messages
  // used for signature parsing we have to use the real content language (see init.loadSiteData()).
  // As a result, we use cd.g.contentLanguage only for the script's own messages, not the native
  // MediaWiki messages.
  cd.g.contentLanguage = getLanguageOrFallback(mw.config.get('wgContentLanguage'));
}

/**
 * Load and execute the configuration script if available.
 *
 * @returns {Promise.<void>}
 * @private
 */
function getConfig() {
  return new Promise((resolve, reject) => {
    let key = mw.config.get('wgServerName');
    if (IS_STAGING) {
      key += '.staging';
    }
    const configUrl =
      /** @type {StringsByKey} */ (configUrls)[key] ||
      /** @type {StringsByKey} */ (configUrls)[mw.config.get('wgServerName')];
    if (configUrl) {
      const rejectWithMsg = (/** @type {unknown} */ error) => {
        reject(
          new Error(`Convenient Discussions can't run: couldn't load the configuration.`, {
            cause: error,
          })
        );
      };

      const [, gadgetName] = configUrl.match(/modules=ext.gadget.([^?&]+)/) || [];
      if (gadgetName && mw.user.options.get(`gadget-${gadgetName}`)) {
        // A gadget is enabled on the wiki, and it should be loaded and executed without any
        // additional requests; we just wait until it happens.
        mw.loader.using(`ext.gadget.${gadgetName}`).then(() => {
          resolve();
        });

        return;
      }
      mw.loader.getScript(configUrl).then(() => {
        resolve();
      }, rejectWithMsg);
    } else {
      resolve();
    }
  });
}

/**
 * Get the promise that resolves when the language strings are ready. If the strings are already
 * available, the promise resolves immediately.
 *
 * @returns {Promise<any[]|void>}
 * @private
 */
export function getStringsPromise() {
  return (
    cd.g.userLanguage === mw.config.get('wgUserLanguage') &&
    cd.g.contentLanguage === mw.config.get('wgContentLanguage')
  )
    // If no language fallbacks are employed, we can do without requesting additional i18ns.
    // cd.getStringsPromise may be set in the configuration file.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    ? (cd.i18n ? Promise.resolve() : cd.getStringsPromise || getStrings())

    : getStrings();
}

/**
 * Load and add localization strings to the {@link module:cd.i18n} object. Use fallback languages
 * if default languages are unavailable.
 *
 * @returns {Promise<any[]|void>}
 * @private
 */
async function getStrings() {
  // We assume it's OK to fall back to English if the translation is unavailable for any reason.
  return Promise.all(
    [cd.g.userLanguage, cd.g.contentLanguage]
      .filter(unique)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      .filter((lang) => lang !== 'en' && !cd.i18n?.[lang])
      .map((lang) =>
        loadPreferablyFromDiskCache({
          domain: 'commons.wikimedia.org',
          pageName: `User:Jack_who_built_the_house/convenientDiscussions-i18n/${lang}.js`,
          ttlInDays: 1,
        })
      )
  ).catch(() => {});
}

/**
 * Load a script or style using the following strategy:
 * - If more than `ttlInDays` days have passed since caching, load from the server. E.g.
 *   translations can be requested daily.
 * - If `addCacheBuster` is `true`, load from server each time there is a new release (we "bust"
 *   cache by adding a random string to the URL). This is for the main app and anything updated
 *   together with it.
 *
 * @param {object} options
 * @param {string} options.domain
 * @param {string} options.pageName
 * @param {number} options.ttlInDays
 * @param {string} [options.ctype]
 * @param {boolean} [options.addCacheBuster]
 * @returns {Promise<void>}
 */
async function loadPreferablyFromDiskCache({
  domain,
  pageName,
  ttlInDays,
  ctype,
  addCacheBuster = false,
}) {
  const ttlInMs = ttlInDays * cd.g.msInDay;
  const pageEncoded = encodeURIComponent(pageName);
  const cacheBusterOrNot = addCacheBuster ? '&' + CACHE_BUSTER : '';

  const apiResponse = await $.get(
    `https://${domain}/w/api.php?titles=${pageEncoded}&origin=*&format=json&formatversion=2&uselang=content&maxage=${ttlInMs}&smaxage=${ttlInMs}&action=query&prop=revisions|info&rvprop=content&rvlimit=1${cacheBusterOrNot}`
  );

  const apiPage = apiResponse.query.pages[0];
  if (!apiPage.missing) return;

  const content = apiPage.revisions[0].content;
  if (ctype === 'text/javascript' && apiPage.contentmodel === 'javascript') {
    const scriptTag = document.createElement('script');
    scriptTag.innerHTML = content;
    document.head.append(scriptTag);
  } else if (ctype === 'text/css' && apiPage.contentmodel === 'css') {
    mw.loader.addStyleTag(content);
  }
}

/**
 * Function executed after the config and localization strings are ready.
 *
 * @fires preprocessed
 * @private
 */
async function go() {
  debug.startTimer('start');

  // Don't run again if go() runs the second time (e.g. from maybeAddFooterSwitcher()).
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (cd.config === undefined) {
    /**
     * Script configuration. The default configuration is in {@link defaultConfig}.
     *
     * @name config
     * @type {object}
     * @memberof convenientDiscussions
     */
    cd.config = Object.assign(defaultConfig, cd.config);

    cd.g.pageWhitelistRegexp = mergeRegexps(cd.config.pageWhitelist);
    cd.g.pageBlacklistRegexp = mergeRegexps(cd.config.pageBlacklist);

    await setStrings();
  }

  bootManager.bootScript();
  maybeAddFooterSwitcher();
  maybeTweakAddTopicButton();
  addCommentLinksToSpecialSearch();

  if (!bootManager.isBooting()) {
    debug.stopTimer('start');
  }

  /**
   * The page has been preprocessed (not parsed yet, but its type has been checked and some
   * important mechanisms have been initialized).
   *
   * @event preprocessed
   * @param {object} cd {@link convenientDiscussions} object.
   * @global
   */
  mw.hook('convenientDiscussions.preprocessed').fire(cd);
}

/**
 * Add the script's strings to {@link external:mw.messages}.
 *
 * @private
 */
async function setStrings() {
  // Strings that should be displayed in the site language, not the user language.
  const contentStrings = [
    'es-',
    'cf-autocomplete-commentlinktext',
    'move-',
  ];

  if (!SINGLE_LANG_CODE) {
    await import('../../dist/convenientDiscussions-i18n/en');
  }
  const strings = Object.keys(cd.i18n.en).reduce((acc, name) => {
    const lang = contentStrings.some((contentStringName) => (
      name === contentStringName ||
      (contentStringName.endsWith('-') && name.startsWith(contentStringName))
    ))
      ? cd.g.contentLanguage
      : cd.g.userLanguage;
    acc[name] = (lang in cd.i18n && cd.i18n[lang][name]) ?? cd.i18n.en[name];

    return acc;
  }, /** @type {StringsByKey} */ ({}));

  Object.keys(strings).forEach((name) => {
    mw.messages.set(`convenient-discussions-${name}`, strings[name]);
  });
}

/**
 * Add a footer link to enable/disable CD on this page once.
 *
 * @private
 */
function maybeAddFooterSwitcher() {
  if (!mw.config.get('wgIsArticle')) return;

  const enable = !bootManager.isPageOfType('talk');
  const url = new URL(location.href);
  url.searchParams.set('cdtalkpage', enable ? '1' : '0');
  const $li = $('<li>').attr('id', 'footer-togglecd');
  // eslint-disable-next-line no-one-time-vars/no-one-time-vars
  const $a = $('<a>')
    .attr('href', url.toString())
    .addClass('noprint')
    .text(cd.s(enable ? 'footer-runcd' : 'footer-dontruncd'))
    .appendTo($li);
  if (enable) {
    $a.on('click', (event) => {
      if (event.ctrlKey || event.shiftKey || event.metaKey) return;

      event.preventDefault();
      history.pushState(history.state, '', url.toString());
      $li.remove();
      go();
    });
  }
  getFooter().append($li);
}

/**
 * Change the destination of the "Add topic" button to redirect topic creation to the script's form.
 * This is not done on `action=view` pages to make sure the user can open the classic form in a new
 * tab. The exception is when the new topic tool is enabled with the "Offer to add a new topic"
 * setting: in that case, the classic form doesn't open anyway. So we add `dtenable=0` to the
 * button.
 *
 * @private
 */
function maybeTweakAddTopicButton() {
  const dtCreatePage =
    cd.g.isDtNewTopicToolEnabled &&
    mw.user.options.get('discussiontools-newtopictool-createpage');
  if (!bootManager.isArticlePageOfTalkType() || (cd.g.pageAction === 'view' && !dtCreatePage))
    return;

  const $button = $('#ca-addsection a');
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const href = /** @type {HTMLAnchorElement | undefined} */ ($button[0])?.href;
  if (href) {
    const url = new URL(href);
    if (dtCreatePage) {
      url.searchParams.set('dtenable', '0');
    }
    if (!dtCreatePage || cd.g.pageAction !== 'view') {
      url.searchParams.delete('action');
      url.searchParams.delete('section');
      url.searchParams.set('cdaddtopic', '1');
    }
    $button.attr('href', url.toString());
  }
}

/**
 * _For internal use._ When on the Special:Search page, searching for a comment after choosing that
 * option from the "Couldn't find the comment" message, add comment links to titles.
 */
function addCommentLinksToSpecialSearch() {
  if (mw.config.get('wgCanonicalSpecialPageName') !== 'Search') return;

  const [, commentId] = location.search.match(/[?&]cdcomment=([^&]+)(?:&|$)/) || [];
  if (commentId) {
    mw.loader.using('mediawiki.api').then(
      async () => {
        await Promise.all(bootManager.getSiteDataPromises());
        $('.mw-search-result-heading').each((_, el) => {
          const originalHref = $(el)
            .find('a')
            .first()
            .attr('href');
          if (!originalHref) return;

          $(el).append(
            ' ',
            $('<span>')
              .addClass('cd-searchCommentLink')
              .append(
                document.createTextNode(cd.mws('parentheses-start')),
                $('<a>')
                  .attr('href', `${originalHref}#${commentId}`)
                  .text(cd.s('deadanchor-search-gotocomment')),
                document.createTextNode(cd.mws('parentheses-end')),
              )
          );
        });
      },
      console.error
    );
  }
}
