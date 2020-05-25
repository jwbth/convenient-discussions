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
  },

  contribsPage: 'Служебная:Вклад',

  localTimezoneOffset: 0,

  // Don't need CD for the "Арбитраж" namespace. (Or do we?)
  customTalkNamespaces: [4, 104],

  pageWhiteListRegexp: new RegExp(
    // Википедия:
    '^(?:Википедия:(?:Форум[/ ]|Голосования/|Опросы/|Обсуждение правил/|Просьба прокомментировать/|Заявки на |Запросы|Кандидаты в .*/|К (?:удалению|объединению|переименованию|разделению|улучшению|оценке источников|посредничеству)/|Оспаривание|Рецензирование/|Проверка участников/|Фильтр правок/Срабатывания|.* запросы|К оценке источников|Установка защиты|Снятие защиты|Изменение спам-листа)|' +
    // Проект:
    'Проект:(?:Инкубатор/(?:Мини-рецензирование|Форум)|Социальная ответственность/Форум|Водные объекты|Библиотека/(?:Требуются книги|Вопросы|Горячие темы|Технические вопросы)|Графическая мастерская/Заявки|Добротные статьи/К лишению статуса|Грамотность/Запросы))'
  ),

  pageBlackListRegexp: null,

  archivePathRegexp: /\/Архив/,

  pagesWithoutArchivesRegexp: /^Википедия:(К удалению|К восстановлению|К переименованию|К объединению|К разделению|К улучшению|Кандидаты в хорошие статьи|Кандидаты в добротные статьи)\//,

  idleFragments: ['Преамбула'],

  defaultIndentationChar: '*',

  signaturePrefixRegexp: /(?:\s*С уважением,)?(?:\s+>+)?(?:·|-|–|—|~|\/|→|⇒|\s|&mdash;|&ndash;|&rarr;|&middot;|&nbsp;|&#32;)*'*$/,

  signatureEndingRegexp: / \(обс\.\)$/,

  tagName: 'convenient-discussions',

  optionsPrefix: 'cd',

  helpWikilink: 'U:JWBTH/CD',

  unsignedTemplates: [
    'unsigned',
    'unsignedIP',
    'unsigned2',
    'unsignedIP2',
    'не подписано',
    'нпп',
  ],

  pairQuoteTemplates: [
    ['начало цитаты', 'конец цитаты'],
  ],

  blockSmallTemplate: 'block-small',

  paragraphTemplates: [
    'pb',
    'абзац',
  ],

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

  foreignElementsInHeadlinesClasses: [
    'ch-helperText',
    'userflags-wrapper',
  ],

  customFloatingElementsSelectors: [
    '.infobox',
    '.vertical-navbox',
  ],

  closedDiscussionsClasses: [
    'ruwiki-closedDiscussion',
  ],

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

  transformSummary(summary) {
    return summary
      .replace(`${cd.s('es-new-subsection')}: /* Итог */`, 'итог')
      .replace(`${cd.s('es-new-subsection')}: /* Предварительный итог */`, 'предварительный итог')
      .replace(`${cd.s('es-new-subsection')}: /* Предытог */`, 'предытог');
  },

  customCodeTransformations(code, commentForm) {
    // Add a closer template
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

        const isHlmEnabled = window.highlightMessagesAfterLastVisit !== undefined;
        if (cd.settings.highlightNew && isHlmEnabled) {
          // Suppress the work of [[Участник:Кикан/highlightLastMessages.js]] in possible ways.
          window.highlightMessagesAfterLastVisit = false;
          window.highlightMessages = 0;
        }
        if (isHlmEnabled && !mw.cookie.get('cd-hlmConflict')) {
          // Remove the results of work of [[Участник:Кикан/highlightLastMessages.js]]
          if (window.messagesHighlightColor !== undefined) {
            const dummyElement = document.createElement('span');
            dummyElement.style.color = window.messagesHighlightColor;
            const hlmStyledElements = cd.g.rootElement.querySelectorAll(
              `.cd-commentPart[style="background-color: ${dummyElement.style.color};"],` +
              `.cd-commentPart[style="background-color: ${window.messagesHighlightColor}"]`
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
                    window.Wikify(commentForm.commentInput.$input.get(0));
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
                      window.urlDecoderRun(commentForm.commentInput.$input.get(0));
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
