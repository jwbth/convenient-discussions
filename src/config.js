export default {
  // Only those namespaces that appear in links. Standard + feminine form, if available, and talk
  // pages.
  CANONICAL_USER_NAMESPACES: ['Участник', 'Участница', 'Обсуждение участника',
    'Обсуждение участницы'],

  // Only those that appear in links. Standard + feminine form, if available.
  CANONICAL_USER_NAMESPACES_WITHOUT_TALK: ['Участник', 'Участница'],

  CONTRIBUTIONS_PAGE: 'Служебная:Вклад',

  // In namespaces other than talk
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

  SIG_PATTERNS: [
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
  EXTRACT_AUTHOR_DATE_PATTERNS: [
    '\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*%author *\\| *%date[ ‎]*\\}\\}[  \t]*',
    '\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *%date[ ‎]*\\|[ ‎]*%author *\\}\\}[  \t]*',
  ],

  // Caution: invisible character in [ ‎].
  EXTRACT_AUTHOR_PATTERNS: [
    '\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*%author *(?:\\| *[^}]+?[ ‎]*)?\\}\\}[  \t]*',
    '\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *[^|]*[ ‎]*\\|[ ‎]*%author *\\}\\}[  \t]*',
  ],

  HELP_LINK: 'U:JWBTH/CD',

  // For ruwiki. If equals to HELP_LINK and the site is not ruwiki, then it forgot to set it.
  DEFAULT_HELP_LINK: 'U:JWBTH/CD',

  // List of classes, blocks with which can't be message date containers.
  BLOCKS_TO_EXCLUDE_CLASSES: ['botMessage', 'ruwiki-movedTemplate', 'ambox', 'NavFrame'],

  // List of templates, blocks with which can't be message date containers.
  TEMPLATES_TO_EXCLUDE: ['перенесено с', 'moved from', 'перенесено на', 'moved to',
    'перенесено из раздела', 'перенесено в раздел', 'копия с', 'скопировано на'],

  MSG_ANTIPATTERNS: [
    '-- ?\\[\\[Участник:DimaBot\\|DimaBot\\]\\]'
  ],

  MESSAGES_COMMON_STRING: '(UTC)',

  LOGO_BASE64: 'data:image/png;base64,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',
}
