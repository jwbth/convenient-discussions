export default {
  messages: {
    'sun': 'Вс',
    'mon': 'Пн',
    'tue': 'Вт',
    'wed': 'Ср',
    'thu': 'Чт',
    'fri': 'Пт',
    'sat': 'Сб',
    'sunday': 'воскресенье',
    'monday': 'понедельник',
    'tuesday': 'вторник',
    'wednesday': 'среда',
    'thursday': 'четверг',
    'friday': 'пятница',
    'saturday': 'суббота',
    'jan': 'янв',
    'feb': 'фев',
    'mar': 'мар',
    'apr': 'апр',
    'may': 'май',
    'jun': 'июн',
    'jul': 'июл',
    'aug': 'авг',
    'sep': 'сен',
    'oct': 'окт',
    'nov': 'ноя',
    'dec': 'дек',
    'january': 'январь',
    'february': 'февраль',
    'march': 'март',
    'april': 'апрель',
    'may_long': 'май',
    'june': 'июнь',
    'july': 'июль',
    'august': 'август',
    'september': 'сентябрь',
    'october': 'октябрь',
    'november': 'ноябрь',
    'december': 'декабрь',
    'january-gen': 'января',
    'february-gen': 'февраля',
    'march-gen': 'марта',
    'april-gen': 'апреля',
    'may-gen': 'мая',
    'june-gen': 'июня',
    'july-gen': 'июля',
    'august-gen': 'августа',
    'september-gen': 'сентября',
    'october-gen': 'октября',
    'november-gen': 'ноября',
    'december-gen': 'декабря',
    'timezone-utc': 'UTC',
    'parentheses': '($1)',
    'parentheses-start': '(',
    'parentheses-end': ')',
    'word-separator': ' ',
    'comma-separator': ', ',
    'colon-separator': ': ',
    'nextdiff': 'Следующая правка →',
  },

  specialPageAliases: {
    'Contributions': 'Вклад',
    'Diff': 'Изменения',
    'PermanentLink': 'Постоянная ссылка',
  },

  substAliases: [
    'подстановка:',
    'подст:',
  ],

  timezone: 'UTC',

  pageWhitelist: [
    /^Арбитраж:.+\//,
    /^Википедия:.+ запросы/,
    /^Википедия:Вики-встречи$/,
    /^Википедия:Выборы арбитров\//,
    /^Википедия:Голосования\//,
    /^Википедия:Запросы/,
    /^Википедия:Заявки на /,
    /^Википедия:Изменение спам-листа/,
    /^Википедия:К восстановлению\//,
    /^Википедия:К объединению\//,
    /^Википедия:К оценке источников/,
    /^Википедия:К переименованию\//,
    /^Википедия:К посредничеству/,
    /^Википедия:К разделению\//,
    /^Википедия:К удалению\//,
    /^Википедия:К улучшению\//,
    /^Википедия:Кандидаты в .+\//,
    /^Википедия:Кандидаты в кандидаты в администраторы/,
    /^Википедия:Кандидаты в устаревшие избранные статьи/,
    /^Википедия:Конфирмации\//,
    /^Википедия:Обсуждение категорий\//,
    /^Википедия:Обсуждение правил\//,
    /^Википедия:Опросы\//,
    /^Википедия:Оспаривание/,
    /^Википедия:Проверка участников\//,
    /^Википедия:Просьба прокомментировать\//,
    /^Википедия:Рецензирование\//,
    /^Википедия:Снятие защиты/,
    /^Википедия:Совет вики-проектов\/Обсуждение проектов/,
    /^Википедия:Сообщения об ошибках/,
    /^Википедия:Статьи года\/.+\/Обсуждение/,
    /^Википедия:Текущие события на заглавной странице\/Кандидаты/,
    /^Википедия:Установка защиты/,
    /^Википедия:Фильтр правок\/Срабатывания/,
    /^Википедия:Форум[/ ]/,
    /^Проект:Библиотека\/(Требуются книги|Вопросы|Горячие темы|Технические вопросы)/,
    /^Проект:Водные объекты/,
    /^Проект:Грамотность\/Запросы/,
    /^Проект:Графическая мастерская\/Заявки/,
    /^Проект:Гражданская война в России\/К посредничеству\/Посредничество по содержанию статей/,
    /^Проект:Добротные статьи\/К лишению статуса/,
    /^Проект:Знаете ли вы\/Подготовка следующего выпуска/,
    /^Проект:Инкубатор\/(Мини-рецензирование|Форум)/,
    /^Проект:Социальная ответственность\/Форум/,
  ],

  pageBlacklist: [
    /^Википедия:Выборы арбитров\/.+\/Выдвижение/,
    /^Википедия:Выборы арбитров\/.+\/Голосование/,
    /^Википедия:Заявки на статус (администратора|бюрократа)$/,
    /^Википедия:Заявки на статусы$/,
  ],

  userNamespacesByGender: {
    female: 'Участница',
  },

  genderNeutralUserNamespaceAlias: 'У',

  archivePaths: [
    {
      source: 'Википедия:Форум/Географический',
      archive: 'Википедия:Форум/Географический/Архивы/',
    },
    {
      source: 'Википедия:Форум администраторов',
      archive: 'Википедия:Форум администраторов/Архив/',
    },
    {
      source: 'Википедия:Форум патрулирующих',
      archive: 'Википедия:Форум патрулирующих/Архив/',
    },
    {
      source: 'Википедия:Форум арбитров',
      archive: 'Википедия:Форум/Архив/Форум арбитров',
    },
    {
      source: 'Википедия:Форум/$1',
      archive: 'Википедия:Форум/Архив/$1/',
      replacements: [/[^/]+/],
    },
    /\/Архив/,
  ],

  pagesWithoutArchives: [
    /^Википедия:К удалению\//,
    /^Википедия:К восстановлению\//,
    /^Википедия:К переименованию\//,
    /^Википедия:К объединению\//,
    /^Википедия:К разделению\//,
    /^Википедия:К улучшению\//,
    /^Википедия:Кандидаты в хорошие статьи\//,
    /^Википедия:Кандидаты в добротные статьи\//,
  ],

  idleFragments: ['Преамбула'],

  defaultIndentationChar: '*',

  indentationCharMode: 'unify',

  signaturePrefixRegexp: /(?:\s*С уважением,?)?(?:\s[-–−—―]+\xa0?[A-Z][A-Za-z-_]*)?(?:\s+>+)?(?:[·•\-‑–−—―─~⁓/→⇒\s\u200e\u200f]|&\w+;|&#\d+;)*(?:\s+\()?$/,

  signatureEndingRegexp: / \(обс\.\)$/,

  tagName: 'convenient-discussions',

  hookToFireWithAuthorWrappers: 'global.userlinks',

  unsignedTemplates: [
    'Без подписи',
    'Не подписался',
    'Unsigned2',
    'UnsignedIP2',
    'Нет подписи',
    'UnsignedIP',
    'Не подписано',
    'Неподписано',
    'Написано',
    'Unsigned IP',
    'Unsignedip',
    'Unsigned-ip',
    'НеподписаноIP',
    'Реплика',
    'Не подписаноIP',
    'Неподписано IP',
    'Неподписано-IP',
    'Неподписано-ip',
    'Неподписано ip',
    'Не подписано ip',
    'Не подписано-ip',
    'Unsigned-IP',
    'Unsigned ip',
    'Неподписаноip',
    'Не подписаноip',
    'Не подписано IP',
    'Не подписано-IP',
    'Написано-ip',
    'Написано-IP',
    'Написано ip',
    'Написано IP',
    'НаписаноIP',
    'Написаноip',
    'Нпп',
    'НеподписаноIP2',
    'Unsigned',
    'UnsignedIP',
  ],

  pairQuoteTemplates: [
    [
      'Начало цитаты',
      'НачалоЦитаты',
      'Нц'
    ],
    [
      'Конец цитаты',
      'КонецЦитаты',
      'Кц'
    ]
  ],

  smallDivTemplates: [
    'block-small',
    'Smalldiv',
    'Div-small',
  ],

  paragraphTemplates: [
    'pb',
    'Абзац',
  ],

  outdentTemplates: [
    'outdent',
    'Od',
    'Обратный отступ',
  ],

  clearTemplates: [
    'Clear',
    'Clr',
    '-',
  ],

  elementsToExcludeClasses: [
    'ruwiki-movedTemplate',
    'ambox',
    'NavHead',
    'ts-Закрыто-footer',
    'ts-Цитата-container',
    'raaf',
  ],

  templatesToExclude: [
    'Перенесено с',
    'Moved from',
    'Перенесено из',
    'Moved discussion from',
    'Перенесено на',
    'Обсуждение перенесено',
    'Moved to',
    'Перенесено в',
    'Перенесено из раздела',
    'Перенесено в раздел',
    'Копия с',
    'Скопировано на',
  ],

  commentAntipatterns: [
    /--\xa0?\[\[Участник:DimaBot\|DimaBot\]\]/,
  ],

  foreignElementInHeadlineClasses: [
    'ch-helperText',
    'userflags-wrapper',
    'dclink-wrapper',
  ],

  closedDiscussionTemplates: [
    [
      'Закрыто',
      'Closed',
      'Начало закрытой секции',
      'Close',
      'Закрыто/сворачивать',
      'Closed/c',
      'Начало скрытого блока',
      'Hidden begin',
      'Hidden block start',
    ],
    [
      'Конец закрытой секции',
      'Закрыто-конец',
      'Ecs',
      'Конец',
      'Esc',
      'Кзс',
      'Закрыто конец',
      'ECS',
      'Конец закрытой секции/сворачивать',
      'Ecs/c',
      'Рано',
      'Конец скрытого блока',
      'Hidden end',
      'Oq-',
      'Сворачиваемый блок-конец',
      'Hidden block end',
    ],
  ],

  closedDiscussionClasses: [
    'ruwiki-closedDiscussion',
    'NavContent',
  ],

  customUnhighlightableElementClasses: [
    'infobox',
    'ruwiki-movedTemplate',
  ],

  customAddTopicLinkSelectors: [
    '.ruwiki-addTopicLink a',
    '.ruwiki-addSectionBottom',
  ],

  noConfirmPostEmptyCommentPageRegexp: /^(?:Википедия:Заявки на статус |Википедия:Голосования\/)/,

  indentationCharsPattern: '\\n*(?:\\{\\{(?:-vote|[зЗ]ачёркнутый голос|-голос)\\|)?([:*#]+)( *)',

  undoTexts: [
    'отмена правки',
    'откат правок',
  ],

  customTextReactions: [
    {
      pattern: /\{\{(?:(?:subst|подст):)?ПИ2?\}\}/,
      message: 'Шаблон указания на статус подводящего итоги добавлять не нужно — он будет добавлен автоматически.',
      name: 'closerTemplateNotNeeded',
      type: 'notice',
      checkFunc: function (commentForm) {
        return commentForm.couldBeCloserClosing && commentForm.headlineInput.getValue().trim() === 'Итог';
      },
    },
  ],

  customCommentFormModules: [
    {
      name: 'ext.gadget.wikificator',
    },
    {
      name: 'ext.gadget.urldecoder',
      checkFunc: function () {
        return mw.user.options.get('gadget-urldecoder');
      },
    },
  ],

  transformSummary: function (summary) {
    return summary
      .replace(cd.s('es-new-subsection') + ': /* Итог */', 'итог')
      .replace(cd.s('es-new-subsection') + ': /* Предварительный итог */', 'предварительный итог')
      .replace(cd.s('es-new-subsection') + ': /* Предытог */', 'предытог');
  },

  postTransformCode: function (code, commentForm) {
    // Add a closer template
    if (
      commentForm.couldBeCloserClosing &&
      commentForm.headlineInput.getValue().trim() === 'Итог' &&
      !/\{\{(?:(?:subst|подст):)?ПИ2?\}\}|правах подводящего итоги/.test(code)
    ) {
      code = code.replace(
        /(\n?\n)$/,
        function (newlines) {
          return '\n' + (cd.settings.get('closerTemplate') || '{{'.concat('subst:ПИ}}')) + newlines;
        }
      );
    }

    return code;
  },

  checkForCustomForeignComponents: function (node) {
    return (
      node.classList.contains('ts-Закрыто-header') ||

      // {{clear}}
      (
        node.tagName === 'DIV' &&
        node.getAttribute('style') === 'clear:both;' &&
        !node.childNodes.length
      )
    );
  },

  beforeAuthorLinkParse: function (authorLink) {
    // https://ru.wikipedia.org/wiki/MediaWiki:Gadget-markadmins.js
    const nextElement = authorLink.nextElementSibling;
    if (nextElement && nextElement.classList.contains('userflags-wrapper')) {
      authorLink.parentNode.insertBefore(nextElement, authorLink.nextSibling);
    }
  },

  areNewTopicsOnTop: function (title, code) {
    if (/\{\{[нН]овые сверху/.test(code)) {
      return true;
    } else if (/^Википедия:(?:.+ запросы|Запросы|Оспаривание |Форум[/ ])/.test(title)) {
      return true;
    } else if (/^Википедия:(?:К восстановлению|К объединению|К переименованию|К разделению|К удалению|К улучшению)/.test(title)) {
      return false;
    }
    return null;
  },

  getMoveSourcePageCode: function (targetPageWikilink, signature, timestamp) {
    return '{{перенесено на|' + targetPageWikilink + '|' + signature + '}}\n<small>Для бота: ' + timestamp + '</small>\n';
  },

  getMoveTargetPageCode: function (targetPageWikilink, signature) {
    return '{{перенесено с|' + targetPageWikilink + '|' + signature + '}}\n';
  },
};

const cd = convenientDiscussions;

mw.hook('convenientDiscussions.beforeParse').add(function () {
  // Handle {{-vote}} by actually putting pseudo-minus-1-level comments on the upper level. We split
  // the parent list tag into two parts putting the comment in between.

  // Commented for now, as it can confuse votes for the criteria check script on voting pages.
  /*$('.ruwiki-commentIndentation-minus1level').each(function (i, el) {
    const $current = $(el).css('margin', 0);
    const $list = $current.parent('dd, li').parent('dl, ul, ol');
    while ($list.get(0).contains($current.get(0))) {
      const $parent = $current.parent();
      const $elementsAfter = $current.nextAll();
      if ($elementsAfter.length) {
        $parent
          .clone()
          .empty()
          .append($elementsAfter);
      }
      $parent.after($current);
      if (!$parent.children().length) {
        $parent.remove();
      }
    }
  });*/

  mw.loader.using('mediawiki.util').then(function () {
    mw.util.addCSS('.ruwiki-msgIndentation-minus1level { margin-left: 0 !important; }');
  });
});

mw.hook('convenientDiscussions.pageReadyFirstTime').add(function () {
  const generateEditCommonJsLink = function () {
    return mw.util.getUrl('User:' + cd.user.getName() + '/common.js', { action: 'edit' });
  };

  const isHlmEnabled = window.highlightMessagesAfterLastVisit !== undefined;
  if (isHlmEnabled) {
    // Suppress the work of [[Участник:Кикан/highlightLastMessages.js]] in possible ways.
    window.highlightMessagesAfterLastVisit = false;
    window.highlightMessages = 0;

    if (!mw.cookie.get('cd-hlmConflict')) {
      // Remove the results of work of [[Участник:Кикан/highlightLastMessages.js]]
      if (window.messagesHighlightColor !== undefined) {
        const dummyElement = document.createElement('span');
        dummyElement.style.color = window.messagesHighlightColor;
        const hlmStyledElements = cd.api.rootElement.querySelectorAll(
          '.cd-comment-part[style="background-color: ' + dummyElement.style.color + ';"],' +
          '.cd-comment-part[style="background-color: ' + window.messagesHighlightColor + '"]'
        );
        hlmStyledElements.forEach(function (el) {
          el.style.backgroundColor = null;
        });
      }

      const $text = cd.api.wrap('У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Кикан/highlightLastMessages.js">highlightLastMessages.js</a>, конфликтующий с функциональностью подсветки скрипта «Удобные обсуждения». Рекомендуется отключить его в <a href="' + generateEditCommonJsLink() + '">вашем common.js</a> (или другом файле настроек).');
      mw.notify($text, {
        type: 'warn',
        autoHide: false,
      });
      mw.cookie.set('cd-hlmConflict', '1', {
        path: '/',
        expires: cd.g.SECONDS_IN_DAY * 30,
      });
    }
  }

  if (typeof proceedToArchiveRunned !== 'undefined' && !mw.cookie.get('cd-ptaConflict')) {
    const $text = cd.api.wrap('У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Jack_who_built_the_house/proceedToArchive.js">proceedToArchive.js</a>, функциональность которого включена в скрипт «Удобные обсуждения». Рекомендуется отключить его в <a href="' + generateEditCommonJsLink() + '">вашем common.js</a> (или другом файле настроек).');
    mw.notify($text, {
      type: 'warn',
      autoHide: false,
    });
    mw.cookie.set('cd-ptaConflict', '1', {
      path: '/',
      expires: cd.g.SECONDS_IN_DAY * 30,
    });
  }

  if ($('.localcomments[style="font-size: 95%; white-space: nowrap;"]').length) {
    const $text = cd.api.wrap('Скрипт <a href="//ru.wikipedia.org/wiki/Участник:Александр_Дмитриев/comments_in_local_time_ru.js">comments in local time ru.js</a> выполняется раньше скрипта «Удобные обсуждения», что мешает работе последнего. Проследуйте инструкциям <a href="' + mw.util.getUrl(cd.config.scriptPageWikilink) + '#Совместимость">здесь</a>, чтобы обеспечить их совместимость.');
    mw.notify($text, {
      type: 'warn',
      autoHide: false,
    });
  }
});

mw.hook('convenientDiscussions.commentFormCreated').add(function (commentForm) {
  commentForm.couldBeCloserClosing = (
    /^Википедия:К удалению/.test(cd.page.name) &&
    commentForm.getMode() === 'addSubsection' &&
    mw.config.get('wgUserGroups').includes('closer')
  );
});

mw.hook('convenientDiscussions.commentFormModulesReady').add(function (commentForm) {
  commentForm.$element.on('keydown', function (e) {
    // Ctrl+Alt+W
    let isCmdModifierPressed = cd.g.CLIENT_PROFILE.platform === 'mac' ? e.metaKey : e.ctrlKey;
    if (isCmdModifierPressed && !e.shiftKey && e.altKey && e.keyCode === 87) {
      window.Wikify(commentForm.commentInput.$input.get(0));
    }
  });
});

mw.hook('convenientDiscussions.commentFormToolbarReady').add(function (commentForm) {
  commentForm.commentInput.$input.wikiEditor('addToToolbar', {
    section: 'main',
    groups: {
      gadgets: {
        tools: {
          wikificator: {
            label: 'Викификатор — автоматический обработчик текста (Ctrl+Alt+W)',
            type: 'button',
            icon: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Wikify-toolbutton.png',
            action: {
              type: 'callback',
              execute: function () {
                window.Wikify(commentForm.commentInput.$input.get(0));
              },
            },
          },
        },
      }
    },
  });
  commentForm.$element
    .find('.group-gadgets')
    .insertBefore(commentForm.$element.find('.section-main .group-format'));

  if (mw.user.options.get('gadget-urldecoder')) {
    commentForm.commentInput.$input.wikiEditor('addToToolbar', {
      section: 'main',
      group: 'gadgets',
      tools: {
        urlDecoder: {
          label: 'Раскодировать URL перед курсором или все URL в выделенном тексте',
          type: 'button',
          icon: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Link_go_remake.png',
          action: {
            type: 'callback',
            execute: function () {
              window.urlDecoderRun(commentForm.commentInput.$input.get(0));
            },
          },
        },
      },
    });
  }
});
