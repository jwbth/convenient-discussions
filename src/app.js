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
  if (location.host.endsWith('.m.wikipedia.org')) return;

  window.convenientDiscussions = window.convenientDiscussions || window.cd || {};
  if (typeof window.convenientDiscussions !== 'object') {
    window.convenientDiscussions = {};
  }
  window.cd = window.convenientDiscussions;

  // In Firefox, there's a native function cd() that is overriding our object.
  cd = window.cd;

  // Messages
  cd.strings = strings;

  cd.debug = debug;

  cd.debug.initTimers();

  cd.debug.startTimer(cd.strings.start);

  if (cd.hasRun) {
    console.warn(cd.strings.oneInstanceIsRunning);
    return;
  }
  cd.hasRun = true;

  mw.hook('cd.launched').fire(cd);

  cd.debug.startTimer(cd.strings.totalTime);


  // Config values
  cd.config = cd.config || {};
  $.extend(cd.config, config, {
    debug: true,
  });

  // "Environment" of the script, a unified namespace for all modules. This is deemed not eligible
  // for adjustment, although such demand may appear.
  cd.env = env;

  cd.env.parse = parse;

  if (!cd.env.$content.length) {
    console.error(cd.strings.mwContentTextNotFound);
    return;
  }

  if (cd.config.helpLink === cd.config.defaultHelpLink) {
    cd.env.HELP_LINK = cd.env.IS_RUWIKI ? cd.config.helpLink : 'w:ru:' + cd.config.helpLink;
  } else {
    cd.env.HELP_LINK = cd.config.helpLink;
  }
  cd.env.UNDERLAYER_NEW_BGCOLOR = cd.env.UNDERLAYER_NEWEST_BGCOLOR;
  cd.env.SUMMARY_POSTFIX = ` ([[${cd.env.HELP_LINK}|CD]])`;
  cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT = cd.env.SUMMARY_LENGTH_LIMIT - cd.env.SUMMARY_POSTFIX.length;

  /* Generate regexps, patterns, selectors from config values */

  // A signature pattern regexp
  let sigPattern = '(?:';
  for (let i = 0; i < cd.config.sigPatterns.length; i++) {
    if (i !== 0) {
      sigPattern += '|';
    }
    sigPattern += cd.config.sigPatterns[i][0];
  }
  sigPattern += ')';
  cd.env.SIG_PATTERN = sigPattern;

  const anyTypeOfSpace = s => (
    s
      .replace(/:/g, ' : ')
      .replace(/[ _]/g, '[ _]*')
  );

  const namespaceIds = mw.config.get('wgNamespaceIds');
  const userNamespaces = [];
  for (let key in namespaceIds) {
    if (namespaceIds[key] === 2 || namespaceIds[key] === 3) {
      userNamespaces.push(key);
    }
  }

  // A user name regexp
  let captureUserNameRegexp = '\\[\\[[ _]*(?:(?:';
  userNamespaces.forEach((el, i) => {
    if (i !== 0) {
      captureUserNameRegexp += '|';
    }
    captureUserNameRegexp += anyTypeOfSpace(el);
  });
  captureUserNameRegexp += ')[ _]*:[ _]*|(?:Special[ _]*:[ _]*Contributions|' +
    anyTypeOfSpace(cd.config.contributionsPage) +
    ')\\/[ _]*)([^|\\]#\/]+)';
  // The capture should have user name.
  cd.env.CAPTURE_USER_NAME_REGEXPS = [
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
      } else {
        result += s[i];
      }
    }
    return result;
  }

  // A part of the future user name regexp. Only the part generated below is case-sensitive, this is
  // why we generate it this way.
  let userNamePattern = '\\s*\\[\\[[ _]*:?\\w*:?\\w*:?(?:(?:';
  userNamespaces.forEach((el, i) => {
    if (i !== 0) {
      userNamePattern += '|';
    }
    userNamePattern += anyTypeOfSpace(generateAnyCasePattern(el));
  });
  userNamePattern += ')[ _]*:[ _]*|(?:' +
    anyTypeOfSpace(generateAnyCasePattern('Special:Contributions')) + '|' +
    anyTypeOfSpace(generateAnyCasePattern(cd.config.contributionsPage)) + ')\\/[ _]*)';
  cd.env.USER_NAME_PATTERN = userNamePattern;

  let authorSelector = '';
  const authorSelectorNamespaces = [
    ...cd.config.canonicalUserNamespaces,
    cd.config.contributionsPage
  ];
  authorSelectorNamespaces.forEach((el) => {
    authorSelector += `a[href^="/wiki/${encodeURI(el.replace(/ /g, '_'))}:"], `;
  });
  cd.config.canonicalUserNamespacesWithoutTalk.forEach((el, i) => {
    authorSelector += `a[href^="/w/index.php?title=${encodeURI(el.replace(/ /g, '_'))}:"]`;
    if (i !== cd.config.canonicalUserNamespacesWithoutTalk.length - 1) {
      authorSelector += ', ';
    }
  });
  cd.env.AUTHOR_SELECTOR = authorSelector;

  const captureAuthorNamespaces = [
    ...cd.config.canonicalUserNamespaces,
    'User'
  ];
  let captureAuthorRegexp = '(?:';
  captureAuthorNamespaces.forEach((el, i) => {
    if (i !== 0) {
      captureAuthorRegexp += '|';
    }
    captureAuthorRegexp += `${encodeURI(el.replace(/ /g, '_'))}:([^#\\/]+)`;
  });
  captureAuthorRegexp += `|${encodeURI(cd.config.contributionsPage.replace(/ /g, '_'))}` +
    `\\/([^#\\/]+))`;
  cd.env.CAPTURE_AUTHOR_REGEXP = new RegExp(captureAuthorRegexp);

  // Go
  if (cd.env.isDiscussionPage(cd.env.CURRENT_PAGE, cd.env.NAMESPACE_NUMBER) &&
    mw.config.get('wgIsArticle') &&
    cd.env.$content.is(`:contains("${cd.config.messagesCommonString}")`)
  ) {
    cd.env.firstRun = true;

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
        ${underlayerFocusedGradientToColor});
      }

      .cd-msgForm-noIndentation.cd-msgForm-noIndentation.cd-msgForm-noIndentation {
        background-color: ${bodyBgcolor};
      }

      .cd-closeButton {
        background-color: ${bodyBgcolor};
      }
    `);

    if (!cd.settings || cd.settings.showLoadingOverlay !== false) {
      cd.env.setLoadingOverlay();
    }

    cd.debug.endTimer(cd.strings.start);

    cd.debug.startTimer(cd.strings.loadingModules);

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
