/**
 * Module that serves as an entry point.
 *
 * @module app
 */

// Import polyfills for a bunch of ES2022+ features
import './shared/polyfills';

import defaultConfig from '../config/default';
import configUrls from '../config/urls.json';
import i18nList from '../data/i18nList.json';
import languageFallbacks from '../data/languageFallbacks.json';

import { addCommentLinksToSpecialSearch } from './addCommentLinks';
import bootManager from './bootManager';
import cd from './cd';
import debug from './debug';
import { mergeRegexps, typedKeysOf, unique } from './shared/utils-general';
import { getFooter } from './utils-window';

/** @type {typeof import('../config/default').default} */
let config;

if (SINGLE_LANG_CODE) {
  if (SINGLE_CONFIG_FILE_NAME) {
    try {
      config = require(`../config/${SINGLE_CONFIG_FILE_NAME}`).default;
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

  cd.i18n = (/** @type {I18n} */ {
    en: require('../i18n/en.json'),
  });
  typedKeysOf(cd.i18n.en).forEach((name) => {
    cd.i18n.en[name] = replaceEntities(cd.i18n.en[name]);
  });
  if (SINGLE_LANG_CODE !== 'en') {
    cd.i18n[SINGLE_LANG_CODE] = require(`../i18n/${SINGLE_LANG_CODE}.json`);
    const langObj = cd.i18n[SINGLE_LANG_CODE];
    Object.keys(cd.i18n[SINGLE_LANG_CODE])
      .filter((name) => typeof langObj[name] === 'string')
      .forEach((name) => {
        langObj[name] = replaceEntities(langObj[name]);
      });
    langObj.dayjsLocale = require(`dayjs/locale/${SINGLE_LANG_CODE}`);
    langObj.dateFnsLocale = require(`date-fns/locale/${SINGLE_LANG_CODE}`);
  }
}

/**
 * Add the script's strings to `mw.messages`.
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
    await import('../dist/convenientDiscussions-i18n/en.js');
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
      go().catch((error) => {
        console.error('Error in go():', error);
      });
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
  const dtCreatePage = (
    cd.g.isDtNewTopicToolEnabled &&
    mw.user.options.get('discussiontools-newtopictool-createpage')
  );
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
 * Function executed after the config and localization strings are ready.
 *
 * @fires preprocessed
 * @private
 */
async function go() {
  debug.startTimer('start');

  await import('./convenientDiscussions.js');

  // Don't run again if go() runs the second time (see maybeAddFooterSwitcher()).
  if (cd.g.pageWhitelistRegexp === undefined) {
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
 * Set language properties of the global object, taking fallback languages into account.
 *
 * @private
 */
function setLanguages() {
  const languageOrFallback = (/** @type {string} */ lang) =>
    i18nList.includes(lang)
      ? lang
      : (/** @type {{[key: string]: string[] | undefined}} */ (languageFallbacks)[lang])?.find(
          (/** @type {string} */ fallback) => i18nList.includes(fallback)
        ) || 'en';

  cd.g.userLanguage = languageOrFallback(mw.config.get('wgUserLanguage'));

  // Should we use a fallback for the content language? Maybe, but in case of MediaWiki messages
  // used for signature parsing we have to use the real content language (see init.loadSiteData()).
  // As a result, we use cd.g.contentLanguage only for the script's own messages, not the native
  // MediaWiki messages.
  cd.g.contentLanguage = languageOrFallback(mw.config.get('wgContentLanguage'));
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
 * Load and add localization strings to the `cd.i18n` object. Use fallback languages if default
 * languages are unavailable.
 *
 * @returns {Promise<any[]|void>}
 * @private
 */
function getStrings() {
  // We assume it's OK to fall back to English if the translation is unavailable for any reason.
  return Promise.all(
    [cd.g.userLanguage, cd.g.contentLanguage]
      .filter(unique)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      .filter((lang) => lang !== 'en' && !cd.i18n?.[lang])
      .map((lang) =>
        mw.loader.getScript(
          `https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions-i18n/${lang}.js&action=raw&ctype=text/javascript`
        )
      )
  ).catch(() => {});
}

/**
 * The main script function.
 *
 * @fires launched
 * @private
 */
async function app() {
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

  cd.g = /** @type {import('./shared/cd').GlobalProps} */ ({});

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

  $(() => {
    go().catch((error) => {
      console.error('Error in go():', error);
    });
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

app();
