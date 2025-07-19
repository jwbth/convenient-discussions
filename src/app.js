/**
 * Module that serves as an entry point.
 *
 * @module app
 */

import defaultConfig from '../config/default';
import configUrls from '../config/urls.json';
import i18nList from '../data/i18nList.json';
import languageFallbacks from '../data/languageFallbacks.json';

import { addCommentLinksToSpecialSearch } from './addCommentLinks';
import bootController from './bootController';
import cd from './cd';
import debug from './debug';
import { mergeRegexps, unique } from './utils-general.js';
import { getFooter } from './utils-window.js';

let config;

if (LANG_CODE) {
  try {
    config = require(`../config/${CONFIG_FILE_NAME}`).default;
  } catch {
    // Empty
  }

  // A copy of the function in misc/utils.js. If altering it, make sure they are synchronized.
  const replaceEntities = (/** @type {string} */ string) => (
    string
      .replace(/&nbsp;/g, '\xa0')
      .replace(/&#32;/g, ' ')
      .replace(/&rlm;/g, '\u200f')
      .replace(/&lrm;/g, '\u200e')
  );

  cd.i18n = {};
  cd.i18n.en = require('../i18n/en.json');
  Object.keys(cd.i18n.en).forEach((name) => {
    cd.i18n.en[name] = replaceEntities(cd.i18n.en[name]);
  });
  if (LANG_CODE !== 'en') {
    cd.i18n[LANG_CODE] = require(`../i18n/${LANG_CODE}.json`);
    const langObj = cd.i18n[LANG_CODE];
    Object.keys(cd.i18n[LANG_CODE])
      .filter((name) => typeof langObj[name] === 'string')
      .forEach((name) => {
        langObj[name] = replaceEntities(langObj[name]);
      });
    langObj.dayjsLocale = require(`dayjs/locale/${LANG_CODE}`);
    langObj.dateFnsLocale = require(`date-fns/locale`)[LANG_CODE];
  }
}

/**
 * Add the script's strings to `mw.messages`.
 *
 * @private
 */
function setStrings() {
  // Strings that should be displayed in the site language, not the user language.
  const contentStrings = [
    'es-',
    'cf-autocomplete-commentlinktext',
    'move-',
  ];

  if (!IS_SINGLE) {
    // @ts-ignore
    require('../dist/convenientDiscussions-i18n/en.js');
  }
  const strings = {};
  Object.keys(cd.i18n.en).forEach((name) => {
    const relevantLang = contentStrings.some((contentStringName) => (
      name === contentStringName ||
      (contentStringName.endsWith('-') && name.startsWith(contentStringName))
    )) ?
      cd.g.contentLanguage :
      cd.g.userLanguage;
    strings[name] = cd.i18n[relevantLang]?.[name] || cd.i18n.en[name];
  });

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

  const enable = !bootController.isPageOfType('talk');
  const url = new URL(location.href);
  url.searchParams.set('cdtalkpage', enable ? '1' : '0');
  const $li = $('<li>').attr('id', 'footer-togglecd');
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
  const dtCreatePage = (
    cd.g.isDtNewTopicToolEnabled &&
    mw.user.options.get('discussiontools-newtopictool-createpage')
  );
  if (!bootController.isArticlePageOfTalkType() || (cd.g.pageAction === 'view' && !dtCreatePage))
    return;

  const $button = $('#ca-addsection a');
  const href = $button.prop('href');
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

  require('./convenientDiscussions');

  // Don't run again if go() runs the second time (see maybeAddFooterSwitcher()).
  if (cd.g.pageWhitelistRegexp === undefined) {
    /**
     * Script configuration. The default configuration is in {@link module:defaultConfig}.
     *
     * @name config
     * @type {object}
     * @memberof convenientDiscussions
     */
    cd.config = Object.assign(defaultConfig, cd.config);

    cd.g.pageWhitelistRegexp = mergeRegexps(cd.config.pageWhitelist);
    cd.g.pageBlacklistRegexp = mergeRegexps(cd.config.pageBlacklist);

    setStrings();
  }

  bootController.bootScript();
  maybeAddFooterSwitcher();
  maybeTweakAddTopicButton();
  addCommentLinksToSpecialSearch();

  if (!bootController.isBooting()) {
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
  const languageOrFallback = (/** @type {string} */ lang) => (
    i18nList.includes(lang) ?
      lang :
      (languageFallbacks[lang] || []).find((/** @type {string} */ fallback) => i18nList.includes(fallback)) || 'en'
  );

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
    if (IS_TEST) {
      key += '.test';
    }
    const configUrl = configUrls[key] || configUrls[mw.config.get('wgServerName')];
    if (configUrl) {
      const rejectWithMsg = (error) => {
        reject(['Convenient Discussions can\'t run: couldn\'t load the configuration.', error]);
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
      mw.loader.getScript(configUrl).then(
        () => {
          resolve();
        },
        rejectWithMsg
      );
    } else {
      resolve();
    }
  });
}

/**
 * Load and add localization strings to the `cd.i18n` object. Use fallback languages if default
 * languages are unavailable.
 *
 * @returns {Promise.<any[]|void>}
 * @private
 */
function getStrings() {
  // We assume it's OK to fall back to English if the translation is unavailable for any reason.
  return Promise.all([cd.g.userLanguage, cd.g.contentLanguage]
    .filter(unique)
    .filter((lang) => lang !== 'en' && !cd.i18n?.[lang])
    .map((lang) =>
      mw.loader.getScript(`https://commons.wikimedia.org/w/index.php?title=User:Jack_who_built_the_house/convenientDiscussions-i18n/${lang}.js&action=raw&ctype=text/javascript`)
    )).catch(() => {});
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
    /(^|\.)m\./.test(location.hostname) ||
    /[?&]cdenable=(0|false|no|n)(?=&|$)/.test(location.search) ||
    mw.config.get('wgPageContentModel') !== 'wikitext' ||

    // Liquid Threads, for example https://en.wiktionary.org/wiki/User_talk:Yair_rand/newentrywiz.js
    $('.lqt-talkpage').length ||

    mw.config.get('wgIsMainPage')
  ) {
    return;
  }

  if (IS_SINGLE) {
    cd.config = config;
  }

  cd.g = /** @type {import('./cd').GlobalProps} */ ({});

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
    await Promise.all([!cd.config && getConfig(), getStringsPromise()]);
  } catch (error) {
    console.error(error);
    return;
  }

  debug.stopTimer('load config and strings');

  $(go);
}

/**
 * Get the promise that resolves when the language strings are ready. If the strings are already
 * available, the promise resolves immediately.
 *
 * @returns {Promise<any[]|void>}
 * @private
 */
function getStringsPromise() {
  return (
    cd.g.userLanguage === mw.config.get('wgUserLanguage') &&
    cd.g.contentLanguage === mw.config.get('wgContentLanguage')
  )
    // If no language fallbacks are employed, we can do without requesting additional i18ns.
    // cd.getStringsPromise may be set in the configuration file.
    ? !cd.i18n && (cd.getStringsPromise || getStrings())

    : getStrings();
}

app();
