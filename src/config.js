export default {
  // Including talk namespaces
  USER_NAMESPACES: ['Участник', 'Участница', 'У', 'User', 'U', 'Обсуждение участника',
    'Обсуждение участницы', 'ОУ', 'User talk', 'UT'],
  // Only those that appear in links. Standard + feminine form, if available, and talk pages.
  CANONICAL_USER_NAMESPACES: ['Участник', 'Участница', 'Обсуждение участника',
    'Обсуждение участницы'],
  SPECIAL_CONTRIBUTIONS_PAGE: 'Служебная:Вклад',
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

  // The capture should have user name.
  MORE_USER_REGEXPS: [
    '\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*([^}|]+?) *(?:\\| *[^}]+?[ ‎]*)?\\}\\}',
    '\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *[^}|]+?[ ‎]*\\|[ ‎]*([^}]+?) *\\}\\}',
    '\\[\\[[^|]+\\|([^\\]]+)\\]\\]',
  ],
  SIG_PATTERN:
    '(?:(\\b\\d?\\d:\\d\\d, \\d\\d? [а-я]+ \\d\\d\\d\\d \\(UTC\\))|' +
    '\\{\\{ *(?:[uU]nsigned(?:IP)?|[нН]е подписано) *\\|[ ‎]*([^}|]+?) *(?:\\| *([^}]+?)[ ‎]*)?\\}\\}|' +
    '\\{\\{ *(?:[uU]nsigned(?:IP)?2|[нН]еподписано|[нН]пп) *\\| *([^}|]+?)[ ‎]*(?:\\|[ ‎]*([^}]+?) *)?\\}\\})',
  MSG_ANTIPATTERNS: ['-- ?\\[\\[Участник:DimaBot\\|DimaBot\\]\\]'],
}