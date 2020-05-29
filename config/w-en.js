export default {
  messages: {
    'sun': 'Sun',
    'mon': 'Mon',
    'tue': 'Tue',
    'wed': 'Wed',
    'thu': 'Thu',
    'fri': 'Fri',
    'sat': 'Sat',
    'sunday': 'Sunday',
    'monday': 'Monday',
    'tuesday': 'Tuesday',
    'wednesday': 'Wednesday',
    'thursday': 'Thursday',
    'friday': 'Friday',
    'saturday': 'Saturday',
    'jan': 'Jan',
    'feb': 'Feb',
    'mar': 'Mar',
    'apr': 'Apr',
    'may': 'May',
    'jun': 'Jun',
    'jul': 'Jul',
    'aug': 'Aug',
    'sep': 'Sep',
    'oct': 'Oct',
    'nov': 'Nov',
    'dec': 'Dec',
    'january': 'January',
    'february': 'February',
    'march': 'March',
    'april': 'April',
    'may_long': 'May',
    'june': 'June',
    'july': 'July',
    'august': 'August',
    'september': 'September',
    'october': 'October',
    'november': 'November',
    'december': 'December',
    'january-gen': 'January',
    'february-gen': 'February',
    'march-gen': 'March',
    'april-gen': 'April',
    'may-gen': 'May',
    'june-gen': 'June',
    'july-gen': 'July',
    'august-gen': 'August',
    'september-gen': 'September',
    'october-gen': 'October',
    'november-gen': 'November',
    'december-gen': 'December',
    'timezone-utc': 'UTC',
    'parentheses': '($1)',
    'parentheses-start': '(',
    'parentheses-end': ')',
  },

  contribsPage: 'Special:Contributions',

  localTimezoneOffset: 0,

  archivePath: /\/Archive/,

  spaceAfterIndentationChar: false,

  signatureEndingRegexp: / \(talk\)$/,

  blockSmallTemplate: 'smalldiv',

  paragraphTemplates: [
    'pb',
    'paragraph break',
    'parabr',
    'paragraph',
  ],

  pingTemplate: 're',

  elementsToExcludeClasses: [
    'unresolved',
    'resolved',
    'ambox',
    'NavFrame',
  ],

  templatesToExclude: [
    'moved discussion from', 'moved from', 'mdf',
    'moved discussion to', 'moved to', 'mdt',
  ],

  commentAntipatterns: [],

  customBadCommentBeginnings: [
    /^\{\{(?:-|clear|br|clr)\}\} *\n*/,
  ],

  keepInSectionEnding: [
    /\n+\{\{(?:-|clear)\}\}\s*$/,
    /\n+(?:<!--[^]*?-->\s*)+$/,
  ],

  customFloatingElementsSelectors: [
    '.infobox',
    '.vertical-navbox',
  ],

  closedDiscussionsClasses: [
    'archived',
    'boilerplate'
  ],

  customUnhighlightableElementsClasses: [
    'infobox',
    'unresolved',
    'resolved',
  ],

  insertButtons: [
    ['{{ping|+}}'],
    ['{{u|+}}'],
    ['{{tl|+}}'],
    ['{{+}}'],
    ['[[+]]'],
    ['<>+</>', '</>'],
    ['<blockquote>+</blockquote>', '<blockquote />'],
    ['<code>+</code>', '<code />'],
    ['<nowiki>+</nowiki>', '<nowiki />'],
    ['<syntaxhighlight lang="+"></syntaxhighlight>', '<syntaxhighlight />'],
    ['<small>+</small>', '<small />'],
  ],

  undoTexts: [
    'Undid revision',
    'Reverted edits',
  ],

  getMoveSourcePageCode: function (targetPageWikilink, signature) {
    return `{{Moved discussion to|${targetPageWikilink}|${signature}}}`;
  },

  getMoveTargetPageCode: function (targetPageWikilink, signature) {
    return `{{Moved discussion from|${targetPageWikilink}|${signature}}}`;
  },
};
