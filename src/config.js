export default {
  // Including talk namespaces
  USER_NAMESPACES: ['Участник', 'Участница', 'У', 'User', 'U', 'Обсуждение участника',
    'Обсуждение участницы', 'ОУ', 'User talk', 'UT'],

  // Only those that appear in links. Standard + feminine form, if available, and talk pages.
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

      //'\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*%author *(?:\\| *[^}]+?[ ‎]*)?\\}\\}',
      //'\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *%date[ ‎]*\\|[ ‎]*%author *\\}\\}'


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
}
