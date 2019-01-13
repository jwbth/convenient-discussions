// Documentation in Russian: [[Участник:Jack who built the house/Удобные дискуссии]]

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
  function addCSS(css) {
    const styleElem = document.createElement('style');
    styleElem.appendChild(document.createTextNode(css));
    document.getElementsByTagName('head')[0].appendChild(styleElem);
  }

  function packVisits(visits) {
    let visitsString = '';
    for (let key in visits) {
      visitsString += `${key}, ${visits[key].join(',')}\n`;
    }
    return visitsString.trim();
  }

  function unpackVisits(visitsString) {
    const visits = {};
    const regexp = /^(\d+),(.+)$/gm;
    let matches;
    while (matches = regexp.exec(visitsString)) {
      visits[matches[1]] = matches[2].split(',');
    }
    return visits;
  }

  function packWatchedTopics(watchedTopics) {
    let watchedTopicsString = '';
    for (let key in watchedTopics) {
      watchedTopicsString += ` ${key} ${watchedTopics[key].join('\n')}\n`;
    }
    return watchedTopicsString.trim();
  }

  function unpackWatchedTopics(watchedTopicsString) {
    const watchedTopics = {};
    const pages = watchedTopicsString.split(/(?:^|\n )(\d+) /).slice(1);
    let pageId;
    for (let i = 0, isPageId = true;
      i < pages.length;
      i++, isPageId = !isPageId
    ) {
      if (isPageId) {
        pageId = pages[i];
      } else {
        watchedTopics[pageId] = pages[i].split('\n');
      }
    }
    return watchedTopics;
  }


  /* Main code */

  debug.initTimers();

  debug.startTimer('начало');

  window.convenientDiscussions = window.convenientDiscussions || window.cd || {};
  if (typeof window.convenientDiscussions !== 'object') {
    window.convenientDiscussions = {};
  }
  window.cd = window.convenientDiscussions;

  // In Firefox, there's a native function cd() that is overriding our object.
  cd = window.cd;

  if (cd.hasRun) {
    console.warn('Один экземпляр скрипта «Удобные дискуссии» уже запущен.');
    return;
  }
  cd.hasRun = true;

  mw.hook('cd.launched').fire(cd);

  debug.startTimer('общее время');


  /* Config values */

  cd.config = $.extend(cd.config, config, {
    debug: true,

    LOCAL_HELP_LINK: 'U:JWBTH/CD',

    // List of classes, blocks with which can't be message date containers.
    BLOCKS_TO_EXCLUDE_CLASSES: ['botMessage', 'ruwiki-movedTemplate', 'ambox', 'NavFrame'],
    TEMPLATES_TO_EXCLUDE: ['перенесено с', 'moved from', 'перенесено на', 'moved to',
      'перенесено из раздела', 'перенесено в раздел', 'копия с', 'скопировано на'],

    DISCUSSION_PAGE_REGEXP: new RegExp(
      // Википедия:
      '^(?:Википедия:(?:Форум[/ ]|Голосования/|Опросы/|Обсуждение правил/|Заявки на |Запросы|' +
      'Кандидаты в .*/|К (?:удалению|объединению|переименованию|разделению|улучшению|' +
      'оценке источников|посредничеству)/|Оспаривание|Рецензирование/|Проверка участников/|' +
      'Фильтр правок/Срабатывания|.* запросы)|' +
      // Проект:
      'Проект:(?:Инкубатор/(?:Мини-рецензирование|Форум)|Социальная ответственность/Форум|Водные ' +
      'объекты|Библиотека/(?:Требуются книги|Вопросы|Горячие темы|Технические вопросы)|' +
      'Графическая мастерская/Заявки|Добротные статьи/К лишению статуса|Грамотность/Запросы))'
    ),

    // ' is in the end alone so that normal markup in the end of a message does not get removed.
    SIG_PREFIX_REGEXP: /(?:\s*С уважением,)?(?:\s+>+)?[-–—\s~→]*'*$/,

    // User name is case-sensitive, namespaces and special pages names are not, that's why it is like this.
    USER_NAME_PATTERN:
      '\\s*\\[\\[[ _]*:?\\w*:?\\w*:?(?:(?:[Уу][Чч][Аа][Сс][Тт][Нн][Ии](?:[Кк]|[Цц][Аа])|[Уу]|[Uu][Ss][Ee][Rr]|[Uu]|' +
      '[Оо][Бб][Сс][Уу][Жж][Дд][Ее][Нн][Ии][Ее][ _]*[Уу][Чч][Аа][Сс][Тт][Нн][Ии](?:[Кк][Аа]|[Цц][Ыы])|' +
      '[Оо][Уу]|[Uu][Ss][Ee][Rr][ _]*[Tt][Aa][Ll][Kk]|[Uu][Tt])[ _]*:[ _]*|' +
      '(?:[Ss][Pp][Ee][Cc][Ii][Aa][Ll][ _]*:[ _]*[Cc][Oo][Nn][Tt][Rr][Ii][Bb][Uu][Tt][Ii][Oo][Nn][Ss]|' +
      '[Сс][Лл][Уу][Жж][Ее][Бб][Нн][Аа][Яя][ _]*:[ _]*[Вв][Кк][Лл][Аа][Дд])\\/[ _]*)',

    USER_NAME_REGEXPS: [
      new RegExp(
        '\\[\\[[ _]*(?:(?:(?:Участни(?:к|ца))|У|User|U|Обсуждение[ _]*участни(?:ка|цы)|ОУ|' +
        'User[ _]*talk|UT)[ _]*:[ _]*|(?:Special[ _]*:[ _]*Contributions|Служебная[ _]*:[ _]*Вклад)\\/[ _]*)' +
        '([^|\\]#\/]+)',
        'ig'
      ),
      // Cases like [[w:en:Wikipedia:TWL/Coordinators|The Wikipedia Library Team]]
      new RegExp('\\[\\[[^|]+\\|([^\\]]+)\\]\\]', 'g'),
    ],

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
  // may appear
  cd.env = env;

  if (!cd.env.$content.length) {
    console.error('Не найден элемент #mw-content-text.');
    return;
  }

  cd.env.UNDERLAYER_NEW_BGCOLOR = cd.env.UNDERLAYER_NEWEST_BGCOLOR;
  cd.env.SUMMARY_POSTFIX = ` ([[${cd.env.HELP_LINK}|CD]])`;
  cd.env.ACTUAL_SUMMARY_LENGTH_LIMIT = cd.env.SUMMARY_LENGTH_LIMIT - cd.env.SUMMARY_POSTFIX.length;

  // Generating a signature pattern regexp from a config value.
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

  // Generating a user name regexp from a config value.
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

  // Generating a part of the future user name regexp from a config value. Only the part generated
  // below is case-sensitive, this is why we generate it this way.
  let userNamePattern = '\\s*\\[\\[[ _]*:?\\w*:?\\w*:?(?:(?:';
  for (let i = 0; i < cd.config.USER_NAMESPACES.length; i++) {
    if (i !== 0) {
      userNamePattern += '|';
    }
    userNamePattern += anyTypeOfSpace(generateAnyCasePattern(cd.config.USER_NAMESPACES[i]));
  }
  userNamePattern += ')[ _]*:[ _]*|(?:[Ss][Pp][Ee][Cc][Ii][Aa][Ll][ _]*:[ _]*[Cc][Oo][Nn][Tt][Rr]' +
    '[Ii][Bb][Uu][Tt][Ii][Oo][Nn][Ss]|';
  userNamePattern += anyTypeOfSpace(generateAnyCasePattern(cd.config.SPECIAL_CONTRIBUTIONS_PAGE));
  userNamePattern += ')\\/[ _]*)';
  cd.config.USER_NAME_PATTERN = userNamePattern;

  // TEST. Delete when done.
  window.ewt = cd.env.editWatchedTopics;

  // Go
  if (!location.host.endsWith('.m.wikipedia.org') &&
    cd.env.isDiscussionNamespace(cd.env.NAMESPACE_NUMBER) &&
    mw.config.get('wgIsArticle') &&
    cd.env.$content.is(':contains("(UTC)")')
  ) {
    const bodyBgcolor = cd.env.CURRENT_SKIN === 'timeless' ?
      window.getComputedStyle($('#mw-content')[0]).backgroundColor :
      window.getComputedStyle($('.mw-body')[0]).backgroundColor;
    let underlayerFocusedGradientToColor = cd.env.getTransparentColor(
      cd.env.UNDERLAYER_FOCUSED_BGCOLOR
    );

    addCSS(talkPageCss);

    if (cd.env.UNDERLAYER_FOCUSED_BGCOLOR !== 'white' &&
      cd.env.UNDERLAYER_FOCUSED_BGCOLOR.toLowerCase() !== '#fff' &&
      cd.env.UNDERLAYER_FOCUSED_BGCOLOR.toLowerCase() !== '#ffffff'
    ) {
      addCSS(`
        .cd-underlayer-focused {
          background-color: ${cd.env.UNDERLAYER_FOCUSED_BGCOLOR};
        }
      `);
    }

    addCSS(`
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

    debug.endTimer('начало');

    debug.startTimer('загрузка модулей');

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
      cd.env.isDiscussionNamespace(cd.env.NAMESPACE_NUMBER) &&
      (cd.env.NAMESPACE_NUMBER !== 4 ||
        cd.env.NAMESPACE_NUMBER !== 104 ||
        cd.config.DISCUSSION_PAGE_REGEXP.test(cd.env.CURRENT_PAGE)
      )
    ) ||
    cd.env.IS_DIFF_PAGE
  ) {
    addCSS(logPagesCss);

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
