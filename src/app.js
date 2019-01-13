import lzString from 'lz-string';
import debug from './debug';
import parse from './parse';
import env from './env';
import msgLinks from './msgLinks';
import talkPageCss from './talkPage.less';
import logPagesCss from './logPages.less';
import config from './config';
import strings from './strings';

(function () {

function main() {
  debug.initTimers();

  debug.startTimer(cd.strings.start);

  if (location.host.endsWith('.m.wikipedia.org')) return;

  window.convenientDiscussions = window.convenientDiscussions || window.cd || {};
  if (typeof window.convenientDiscussions !== 'object') {
    window.convenientDiscussions = {};
  }
  window.cd = window.convenientDiscussions;

  // In Firefox, there's a native function cd() that is overriding our object.
  cd = window.cd;

  if (cd.hasRun) {
    console.warn(cd.strings.oneInstanceIsRunning);
    return;
  }
  cd.hasRun = true;

  mw.hook('cd.launched').fire(cd);

  debug.startTimer(cd.strings.totalTime);


  /* Config values */

  cd.config = $.extend(cd.config, config, {
    debug: true,

    AUTHOR_SELECTOR:
      'a[href^="/wiki/%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8"], ' +
      'a[href^="/wiki/%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8"], ' +
      'a[href^="/wiki/%D0%A1%D0%BB%D1%83%D0%B6%D0%B5%D0%B1%D0%BD%D0%B0%D1%8F:%D0%92%D0%BA%D0%BB%D0%B0%D0%B4"], ' +
      'a[href^="/w/index.php?title=%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8"]',
    // (?:Участни(?:к|ца):([^#\/]+)|Обсуждение_участни(?:ка|цы):([^#]+)|Служебная:Вклад\/([^#]+)|User:)
    AUTHOR_LINK_REGEXP: /(?:%D0%A3%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8(?:%D0%BA|%D1%86%D0%B0):([^#\/]+)|%D0%9E%D0%B1%D1%81%D1%83%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D0%B5_%D1%83%D1%87%D0%B0%D1%81%D1%82%D0%BD%D0%B8(?:%D0%BA%D0%B0|%D1%86%D1%8B):([^#\/]+)|%D0%A1%D0%BB%D1%83%D0%B6%D0%B5%D0%B1%D0%BD%D0%B0%D1%8F:%D0%92%D0%BA%D0%BB%D0%B0%D0%B4\/([^#\/]+)|User:([^#\/]+))/,
  });

  // Messages
  cd.strings = strings;

  // "Environment" of the script. This is deemed not eligible for adjustment, although such demand
  // may appear.
  cd.env = env;

  if (!cd.env.$content.length) {
    console.error(cd.strings.mwContentTextNotFound);
    return;
  }

  cd.env.UNDERLAYER_NEW_BGCOLOR = cd.env.UNDERLAYER_NEWEST_BGCOLOR;
  cd.env.SUMMARY_POSTFIX = ` ([[${cd.env.HELP_LINK}|CD]])`;
  cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT = cd.env.SUMMARY_LENGTH_LIMIT - cd.env.SUMMARY_POSTFIX.length;

  // Generate a signature pattern regexp from a config value.
  let sigPattern = '(?:';
  for (let i = 0; i < cd.config.SIG_PATTERNS.length; i++) {
    if (i !== 0) {
      sigPattern += '|';
    }
    sigPattern += cd.config.SIG_PATTERNS[i][0];
  }
  sigPattern += ')';
  cd.env.SIG_PATTERN = sigPattern;

  const anyTypeOfSpace = s => (
    s
      .replace(/:/, ' : ')
      .replace(/[ _]/, '[ _]*')
  );

  // Generate a user name regexp from a config value.
  let captureUserNameRegexp = '\\[\\[[ _]*(?:(?:';
  for (let i = 0; i < cd.config.USER_NAMESPACES.length; i++) {
    if (i !== 0) {
      captureUserNameRegexp += '|';
    }
    captureUserNameRegexp += anyTypeOfSpace(cd.config.USER_NAMESPACES[i]);
  }
  captureUserNameRegexp += ')[ _]*:[ _]*|(?:Special[ _]*:[ _]*Contributions|';
  captureUserNameRegexp += anyTypeOfSpace(cd.config.SPECIAL_CONTRIBUTIONS_PAGE);
  captureUserNameRegexp += ')\\/[ _]*)([^|\\]#\/]+)';
  // The capture should have user name.
  cd.env.USER_NAME_REGEXPS = [
    new RegExp(captureUserNameRegexp, 'ig'),
    // Cases like [[w:en:Wikipedia:TWL/Coordinators|The Wikipedia Library Team]]
    new RegExp('\\[\\[[^|]+\\|([^\\]]+)\\]\\]', 'g'),
  ];

  const generateAnyCasePattern = (s) => {
    let result = '';
    for (let i = 0; i < s.length; i++) {
      // mw.RegExp.escape(s[i]) === s[i] &&
      if (s[i].toUpperCase() !== s[i].toLowerCase()) {
        result += '[' + s[i].toUpperCase() + s[i].toLowerCase() + ']';
      }
    }
    return result;
  }

  // Generate a part of the future user name regexp from a config value. Only the part generated
  // below is case-sensitive, this is why we generate it this way.
  let userNamePattern = '\\s*\\[\\[[ _]*:?\\w*:?\\w*:?(?:(?:';
  for (let i = 0; i < cd.config.USER_NAMESPACES.length; i++) {
    if (i !== 0) {
      userNamePattern += '|';
    }
    userNamePattern += anyTypeOfSpace(generateAnyCasePattern(cd.config.USER_NAMESPACES[i]));
  }
  userNamePattern += ')[ _]*:[ _]*|(?:' +
    anyTypeOfSpace(generateAnyCasePattern('Special:Contributions')) + '|' +
    anyTypeOfSpace(generateAnyCasePattern(cd.config.SPECIAL_CONTRIBUTIONS_PAGE)) + ')\\/[ _]*)';
  cd.config.USER_NAME_PATTERN = userNamePattern;

  // TEST. Delete when done.
  window.ewt = cd.env.editWatchedTopics;

  // Go
  if (cd.env.isDiscussionPage(cd.env.CURRENT_PAGE, cd.env.NAMESPACE_NUMBER) &&
    mw.config.get('wgIsArticle') &&
    cd.env.$content.is(`:contains("${(cd.config.MESSAGES_COMMON_STRING)}")`)
  ) {
    const bodyBgcolor = cd.env.CURRENT_SKIN === 'timeless' ?
      window.getComputedStyle($('#mw-content')[0]).backgroundColor :
      window.getComputedStyle($('.mw-body')[0]).backgroundColor;
    let underlayerFocusedGradientToColor = cd.env.getTransparentColor(
      cd.env.UNDERLAYER_FOCUSED_BGCOLOR
    );

    cd.env.addCSS(talkPageCss);

    if (cd.env.UNDERLAYER_FOCUSED_BGCOLOR !== 'white' &&
      cd.env.UNDERLAYER_FOCUSED_BGCOLOR.toLowerCase() !== '#fff' &&
      cd.env.UNDERLAYER_FOCUSED_BGCOLOR.toLowerCase() !== '#ffffff'
    ) {
      cd.env.addCSS(`
        .cd-underlayer-focused {
          background-color: ${cd.env.UNDERLAYER_FOCUSED_BGCOLOR};
        }
      `);
    }

    cd.env.addCSS(`
      .cd-linksUnderlayer-gradient {
        background-image: linear-gradient(to left, ${cd.env.UNDERLAYER_FOCUSED_BGCOLOR},
        ${underlayerFocusedGradientToColor} + ');
      }

      .cd-closeButton {
        background-color: ${bodyBgcolor};
      }
    `);

    if (!cd.settings || cd.settings.showLoadingOverlay !== false) {
      cd.env.setLoadingOverlay();
    }

    debug.endTimer(cd.strings.start);

    debug.startTimer(cd.strings.loadingModules);

    mw.loader.using([
      'jquery.color',
      'jquery.client',
      'mediawiki.api',
      'mediawiki.cookie',
      'mediawiki.notify',
      'mediawiki.RegExp',
      'mediawiki.Title',
      'mediawiki.util',
      'mediawiki.widgets.visibleLengthLimit',
      'oojs',
      'oojs-ui',
      'user.options',
    ]).done(() => {
      parse();
    });
  }

  if (mw.config.get('wgCanonicalSpecialPageName') === 'Watchlist' ||
    mw.config.get('wgCanonicalSpecialPageName') === 'Contributions' ||
    (mw.config.get('wgAction') === 'history' &&
      cd.env.isDiscussionPage(cd.env.CURRENT_PAGE, cd.env.NAMESPACE_NUMBER)
    ) ||
    cd.env.IS_DIFF_PAGE
  ) {
    cd.env.addCSS(logPagesCss);

    mw.loader.using(['user.options', 'mediawiki.util', 'mediawiki.RegExp']).done(() => {
      msgLinks();
    });
  }
}

if (typeof runAsEarlyAsPossible !== 'undefined') {
  runAsEarlyAsPossible(main);
} else {
  $(main);
}

}());
