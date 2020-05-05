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
  },

  contribsPage: 'Служебная:Вклад',

  localTimezoneOffset: 0,

  // Don't need CD for the "Арбитраж" namespace. (Or do we?)
  customTalkNamespaces: [4, 104],

  pageWhiteListRegexp: new RegExp(
    // Википедия:
    '^(?:Википедия:(?:Форум[/ ]|Голосования/|Опросы/|Обсуждение правил/|Заявки на |Запросы|Кандидаты в .*/|К (?:удалению|объединению|переименованию|разделению|улучшению|оценке источников|посредничеству)/|Оспаривание|Рецензирование/|Проверка участников/|Фильтр правок/Срабатывания|.* запросы|К оценке источников|Снятие защиты|Изменение спам-листа)|' +
    // Проект:
    'Проект:(?:Инкубатор/(?:Мини-рецензирование|Форум)|Социальная ответственность/Форум|Водные объекты|Библиотека/(?:Требуются книги|Вопросы|Горячие темы|Технические вопросы)|Графическая мастерская/Заявки|Добротные статьи/К лишению статуса|Грамотность/Запросы))'
  ),

  pageBlackListRegexp: null,

  archivePathRegexp: /\/Архив/,

  pagesWithoutArchivesRegexp: /^Википедия:(К удалению|К восстановлению|К переименованию|К объединению|К разделению|К улучшению|Кандидаты в хорошие статьи|Кандидаты в добротные статьи)\//,

  idleFragments: ['Преамбула'],

  defaultIndentationChar: '*',

  signaturePrefixRegexp: /(?:\s*С уважением,)?(?:\s+>+)?(?:·|-|–|—|~|\/|→|⇒|\s|&mdash;|&ndash;|&rarr;|&middot;|&nbsp;|&#32;)*'*$/,

  tagName: 'convenient-discussions',

  optionsPrefix: 'cd',

  helpWikilink: 'U:JWBTH/CD',

  unsignedTemplates: ['unsigned', 'unsignedIP', 'unsigned2', 'unsignedIP2', 'не подписано', 'нпп'],

  pairQuoteTemplates: [
    ['начало цитаты', 'конец цитаты'],
  ],

  blockSmallTemplate: 'block-small',

  paragraphTemplates: ['pb', 'абзац'],

  pingTemplate: 're',

  elementsToExcludeClasses: [
    'botMessage',
    'ruwiki-movedTemplate',
    'ambox',
    'NavFrame',
  ],

  templatesToExclude: [
    'перенесено с', 'moved from',
    'перенесено на', 'moved to',
    'перенесено из раздела',
    'перенесено в раздел',
    'копия с',
    'скопировано на',
  ],

  commentAntipatterns: [
    '--\u00A0?\\[\\[Участник:DimaBot\\|DimaBot\\]\\]',
  ],

  customBadCommentBeginnings: [
    /^\{\{(?:-|clear)\}\} *\n*/,
  ],

  keepInSectionEnding: [
    /\n+\{\{(?:-|clear)\}\}\s*$/,
    /\n+(?:<!--[^]*?-->\s*)+$/,
  ],

  foreignElementsInHeadlinesClasses: ['ch-helperText', 'userflags-wrapper'],

  customFloatingElementsSelectors: [
    '.infobox',
    '.vertical-navbox',
  ],

  closedDiscussionsClasses: ['ruwiki-closedDiscussion'],

  customUnhighlightableElementsClasses: [
    'infobox',
    'ruwiki-movedTemplate',
  ],

  customAddTopicLinkSelectors: [
    '.ruwiki-addTopicLink a',
    '.ruwiki-addSectionBottom',
  ],

  defaultInsertButtons: [
    ['{{ping|+}}'],
    ['{{u|+}}'],
    ['{{tl|+}}'],
    ['{{+}}'],
    ['[[+]]'],
    ['<+></>', '</>'],
    ['<blockquote>+</blockquote>', '<blockquote />'],
    ['<code>+</code>', '<code />'],
    ['<nowiki>+</nowiki>', '<nowiki />'],
    ['<syntaxhighlight lang="+"></syntaxhighlight>', '<syntaxhighlight />'],
    ['<small>+</small>', '<small />'],
  ],

  logoDataUrl: 'data:image/png;base64,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',

  logoWidth: '282px',

  logoHeight: '40px',

  noConfirmPostEmptyCommentPageRegexp: /^(?:Википедия:Заявки на статус |Википедия:Голосования\/)/,

  customIndentationCharsPattern: '\\n*(?:\\{\\{(?:-vote|[зЗ]ачёркнутый голос|-голос)\\|)?([:*#]+) *',

  undoTexts: [
    'отмена правки',
    'откат правок',
  ],

  customTextReactions: [
    {
      pattern: /\{\{(?:(?:subst|подст):)?ПИ2?\}\}/,
      message: 'Шаблон указания на статус подводящего итоги добавлять не нужно — он будет добавлен автоматически.',
      class: 'closerTemplateNotNeeded',
      type: 'notice',
      checkFunc: () => this.couldBeCloserClosing && this.headlineInput.getValue().trim() === 'Итог',
    },
  ],

  customCommentFormModules: [
    {
      name: 'ext.gadget.wikificator',
    },
    {
      name: 'ext.gadget.urldecoder',
      checkFunc: () => mw.user.options.get('gadget-urldecoder'),
    },
  ],

  cleanUpCommentText(text) {
    return text.replace(/\(обс.\)$/, '');
  },

  getArchivePrefix: function (pageTitle) {
    if (/^Форум\//.test(pageTitle)) {
      if (/^Форум\/Географический/.test(pageTitle)) {
        return 'Форум/Географический/Архивы';
      } else {
        return 'Форум/Архив/' + pageTitle.slice(6);
      }
    } else {
      return pageTitle;
    }
  },

  summaryTransformer(summary) {
    return summary
      .replace(`${cd.s('newSubsection')}: /* Итог */`, 'итог')
      .replace(`${cd.s('newSubsection')}: /* Предварительный итог */`, 'предварительный итог')
      .replace(`${cd.s('newSubsection')}: /* Предытог */`, 'предытог');
  },

  customCodeTransformations(code, commentForm) {
    // Add closer template
    if (
      commentForm.couldBeCloserClosing &&
      commentForm.headlineInput.getValue().trim() === 'Итог' &&
      !/\{\{(?:(?:subst|подст):)?ПИ2?\}\}|правах подводящего итоги/.test(code)
    ) {
      code += '\n' + (cd.settings.closerTemplate || '{{'.concat('subst:ПИ}}'));
    }

    return code;
  },

  customBeforeParse() {
    // Handle {{-vote}} template by making pseudo-minus-1-level comments real ones. We split the
    // parent list tag into two parts putting the comment in between.
    $('.ruwiki-commentIndentation-minus1level').each(function () {
      const $current = $(this).css('margin', 0);
      const $list = $current.parent('dd, li').parent('dl, ol, ul');
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
    });

    mw.hook('convenientDiscussions.pageReady').add(() => {
      if (cd.g.firstRun) {
        const generateEditCommonJsLink = () => (
          mw.util.getUrl(`User:${cd.g.CURRENT_USER_NAME}/common.js`, { action: 'edit' })
        );

        const isHlmEnabled = typeof highlightMessagesAfterLastVisit !== 'undefined';
        if (cd.settings.highlightNew && isHlmEnabled) {
          // Suppress the work of [[Участник:Кикан/highlightLastMessages.js]] in possible ways.
          highlightMessagesAfterLastVisit = false;
          highlightMessages = 0;
        }
        if (isHlmEnabled && !mw.cookie.get('cd-hlmConflict')) {
          // Remove the results of work of [[Участник:Кикан/highlightLastMessages.js]]
          if (typeof messagesHighlightColor !== 'undefined') {
            const dummyElement = document.createElement('span');
            dummyElement.style.color = messagesHighlightColor;
            const hlmStyledElements = cd.g.rootElement.querySelectorAll(
              `.cd-commentPart[style="background-color: ${dummyElement.style.color};"],` +
              `.cd-commentPart[style="background-color: ${messagesHighlightColor}"]`
            );
            hlmStyledElements.forEach((el) => {
              el.style.backgroundColor = null;
            });
          }

          const $text = cd.util.wrapInElement(`У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Кикан/highlightLastMessages.js">highlightLastMessages.js</a>, конфликтующий с функциональностью подсветки скрипта «Удобные дискуссии». Рекомендуется отключить его в <a href="${generateEditCommonJsLink()}">вашем common.js</a> (или другом файле настроек).`);
          mw.notify($text, { autoHide: false } );
          mw.cookie.set('cd-hlmConflict', '1', {
            path: '/',
            expires: cd.g.SECONDS_IN_A_DAY * 30,
          });
        }

        if (typeof proceedToArchiveRunned !== 'undefined' && !mw.cookie.get('cd-ptaConflict')) {
          const $text = cd.util.wrapInElement(`У вас подключён скрипт <a href="//ru.wikipedia.org/wiki/Участник:Jack_who_built_the_house/proceedToArchive.js">proceedToArchive.js</a>, функциональность которого включена в скрипт «Удобные дискуссии». Рекомендуется отключить его в <a href="${generateEditCommonJsLink()}">вашем common.js</a> (или другом файле настроек).`);
          mw.notify($text, { autoHide: false });
          mw.cookie.set('cd-ptaConflict', '1', {
            path: '/',
            expires: cd.g.SECONDS_IN_A_DAY * 30,
          });
        }

        if ($('.localcomments[style="font-size: 95%; white-space: nowrap;"]').length) {
          const $text = cd.util.wrapInElement(`Скрипт <a href="//ru.wikipedia.org/wiki/Участник:Александр_Дмитриев/comments_in_local_time_ru.js">comments in local time ru.js</a> выполняется раньше скрипта «Удобные дискуссии», что мешает работе последнего. Проследуйте инструкциям <a href="${mw.util.getUrl(cd.config.helpWikilink)}#Совместимость">здесь</a>, чтобы обеспечить их совместимость.`);
          mw.notify($text, { autoHide: false });
        }

        mw.hook('convenientDiscussions.commentFormCreated').add((commentForm) => {
          commentForm.couldBeCloserClosing = (
            /^Википедия:К удалению/.test(cd.g.CURRENT_PAGE) &&
            commentForm.mode === 'addSubsection' &&
            mw.config.get('wgUserGroups').includes('closer')
          );
        });

        mw.hook('convenientDiscussions.commentFormReady').add((commentForm) => {
          commentForm.commentInput.$input.wikiEditor('addToToolbar', {
            'section': 'main',
            'groups': {
              'gadgets': {}
            },
          });
          const $groupGadgets = commentForm.$element.find('.group-gadgets');
          const $groupFormat = commentForm.$element.find('.group-format');
          if ($groupGadgets.length && $groupFormat.length) {
            $groupGadgets.insertBefore($groupFormat);
          }

          commentForm.commentInput.$input.wikiEditor('addToToolbar', {
            'section': 'main',
            'group': 'gadgets',
            'tools': {
              'wikificator': {
                label: 'Викификатор — автоматический обработчик текста',
                type: 'button',
                icon: 'https://upload.wikimedia.org/wikipedia/commons/0/06/Wikify-toolbutton.png',
                action: {
                  type: 'callback',
                  execute: () => {
                    Wikify(commentForm.commentInput.$input[0]);
                  },
                },
              },
            },
          });

          if (mw.user.options.get('gadget-urldecoder')) {
            commentForm.commentInput.$input.wikiEditor('addToToolbar', {
              'section': 'main',
              'group': 'gadgets',
              'tools': {
                'urlDecoder': {
                  label: 'Раскодировать URL перед курсором или все URL в выделенном тексте',
                  type: 'button',
                  icon: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Link_go_remake.png',
                  action: {
                    type: 'callback',
                    execute: () => {
                      urlDecoderRun(commentForm.commentInput.$input[0]);
                    },
                  },
                },
              },
            });
          }
        });
      }
    });
  },

  customForeignComponentChecker(node, context) {
    return (
      cd.g.specialElements.pageHasOutdents &&
      (
        node.classList.contains('outdent-template') ||
        context.getElementByClassName(node, 'outdent-template')
      ) ||
      node.classList.contains('ts-Закрыто-header') ||
      // Talk page template
      (cd.g.CURRENT_NAMESPACE_NUMBER % 2 === 1 && node.classList.contains('tmbox')) ||
      // {{clear}}
      (
        node.tagName === 'DIV' &&
        node.getAttribute('style') === 'clear:both;' &&
        !node.childNodes.length
      )
    );
  },

  areNewTopicsOnTop(title, code) {
    if (/\{\{[нН]овые сверху/.test(code)) {
      return true;
    } else if (/^(?:Форум[/ ]|Оспаривание |Запросы|.* запросы)/.test(title)) {
      return true;
    } else if (/^К (?:удалению|объединению|переименованию|разделению|улучшению)/.test(title)) {
      return false;
    }
  },
};

const cd = convenientDiscussions;
