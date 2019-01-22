export default {
  // Only those namespaces that appear in links. Standard + feminine form, if available, and talk
  // pages.
  canonicalUserNamespaces: ['Участник', 'Участница', 'Обсуждение участника',
    'Обсуждение участницы'],

  // Only those that appear in links. Standard + feminine form, if available.
  canonicalUserNamespacesWithoutTalk: ['Участник', 'Участница'],

  contributionsPage: 'Служебная:Вклад',

  // In namespaces other than talk
  discussionPageRegexp: new RegExp(
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
  sigPrefixRegexp: /(?:\s*С уважением,)?(?:\s+>+)?[-–—\s~→]*'*$/,

  sigPatterns: [
    [
      // We use "[^|] *" so that this pattern doesn't conflict with the patterns below when
      // the date is a part of them.
      '[^|] *(\\b\\d?\\d:\\d\\d, \\d\\d? [а-я]+ \\d\\d\\d\\d \\(UTC\\))',
      ['date']
    ],
    [
      // Caution: invisible character in [ ‎].
      '\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*([^}|]+?) *(?:\\| *([^}]+?)[ ‎]*)?\\}\\}',
      ['author', 'date']
    ],
    [
      // Caution: invisible character in [ ‎].
      '\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *([^}|]+?)[ ‎]*(?:\\|[ ‎]*([^}]+?) *)?\\}\\}',
      ['date', 'author']
    ],
  ],

  // Caution: invisible character in [ ‎].
  extractAuthorDatePatterns: [
    '\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*%author *\\| *%date[ ‎]*\\}\\}[  \t]*',
    '\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *%date[ ‎]*\\|[ ‎]*%author *\\}\\}[  \t]*',
  ],

  // Caution: invisible character in [ ‎].
  extractAuthorPatterns: [
    '\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*%author *(?:\\| *[^}]+?[ ‎]*)?\\}\\}[  \t]*',
    '\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *[^|]*[ ‎]*\\|[ ‎]*%author *\\}\\}[  \t]*',
  ],

  helpLink: 'U:JWBTH/CD',

  // For ruwiki. If equals to HELP_LINK and the site is not ruwiki, then it forgot to set it.
  defaultHelpLink: 'U:JWBTH/CD',

  // List of classes, blocks with which can't be message date containers.
  blocksToExcludeClasses: ['botMessage', 'ruwiki-movedTemplate', 'ambox', 'NavFrame'],

  // List of templates, blocks with which can't be message date containers.
  templatesToExclude: ['перенесено с', 'moved from', 'перенесено на', 'moved to',
    'перенесено из раздела', 'перенесено в раздел', 'копия с', 'скопировано на'],

  msgAntipatterns: [
    '-- ?\\[\\[Участник:DimaBot\\|DimaBot\\]\\]'
  ],

  messagesCommonString: '(UTC)',

  insertButtons: [
    '{{ping|+}}',
    '{{u|+}}',
    '{{tl|+}}',
    '{{+}}',
    '[[+]]',
    ['<>+</>', '</>'],
    ['<code>+</code>', '<code />'],
    ['<nowiki>+</nowiki>', '<nowiki />'],
    ['<source lang="">+</source>', '<source />'],
    ['<small>+</small>', '<small />'],
  ],

  logoDataUrl: 'data:image/png;base64,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',
}
